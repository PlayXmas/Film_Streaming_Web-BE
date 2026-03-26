import { Op } from "sequelize";
import {
    Episode,
    MediaOrigin,
    MediaVariant,
    Report,
    Review,
    Season,
    Title,
    User,
    sequelize,
} from "../models/index.js";
import {
    PLAYBACK_REPORT_REASON_OPTIONS,
    PLAYBACK_REPORT_REASONS,
    REPORT_PENDING_STATUSES,
    REVIEW_REPORT_REASON_OPTIONS,
    REVIEW_REPORT_REASONS,
} from "../constants/report.constants.js";

const PLAYBACK_PURPOSES = new Set(["content", "trailer"]);

function createHttpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function parsePositiveInt(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
}

function normalizeReason(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

function normalizeNote(value) {
    if (value == null) return null;
    const note = String(value).trim();
    return note ? note : null;
}

function parseNonNegativeNumber(value) {
    if (value == null || value === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
}

function buildReportResponse(report) {
    return {
        id: report.id,
        reporter_id: report.reporter_id,
        scope_type: report.scope_type,
        scope_id: report.scope_id,
        reason: report.reason,
        note: report.note,
        meta: report.meta || null,
        status: report.status,
        created_at: report.get?.("created_at") ?? report.get?.("createdAt") ?? null,
    };
}

function getUserTier(role) {
    return role === "vip" || role === "admin" ? "vip" : "free";
}

async function findDuplicateActiveReport({
    reporterId,
    scopeType,
    scopeId,
    reason,
    transaction,
}) {
    return Report.findOne({
        where: {
            reporter_id: reporterId,
            scope_type: scopeType,
            scope_id: scopeId,
            reason,
            status: {
                [Op.in]: REPORT_PENDING_STATUSES,
            },
        },
        transaction,
        lock: transaction?.LOCK?.UPDATE,
    });
}

async function createReportWithDuplicateGuard(payload) {
    return sequelize.transaction(async (transaction) => {
        const reporter = await User.findByPk(payload.reporter_id, {
            attributes: ["id"],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!reporter) {
            throw createHttpError(401, "Bạn cần đăng nhập để gửi báo cáo");
        }

        const duplicate = await findDuplicateActiveReport({
            reporterId: payload.reporter_id,
            scopeType: payload.scope_type,
            scopeId: payload.scope_id,
            reason: payload.reason,
            transaction,
        });

        if (duplicate) {
            return { duplicate, created: null };
        }

        const created = await Report.create(payload, { transaction });
        return { duplicate: null, created };
    });
}

export const getReportReasons = async (req, res) => {
    return res.json({
        success: true,
        data: {
            review: REVIEW_REPORT_REASON_OPTIONS,
            playback: PLAYBACK_REPORT_REASON_OPTIONS,
        },
    });
};

export const createReviewReport = async (req, res) => {
    try {
        const reviewId = parsePositiveInt(req.params.id);
        const reporterId = req.user?.id;
        const reason = normalizeReason(req.body?.reason);
        const note = normalizeNote(req.body?.note);

        if (!reviewId) {
            return res.status(400).json({
                success: false,
                message: "review id không hợp lệ",
            });
        }

        if (!reporterId) {
            return res.status(401).json({
                success: false,
                message: "Bạn cần đăng nhập để gửi báo cáo",
            });
        }

        if (!REVIEW_REPORT_REASONS.has(reason)) {
            return res.status(400).json({
                success: false,
                message: "reason không hợp lệ cho report bình luận",
            });
        }

        if (reason === "other" && !note) {
            return res.status(400).json({
                success: false,
                message: "note là bắt buộc khi reason = other",
            });
        }

        const review = await Review.findByPk(reviewId, {
            attributes: ["id", "user_id", "title_id", "episode_id"],
        });

        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy bình luận",
            });
        }

        if (Number(review.user_id) === Number(reporterId)) {
            return res.status(400).json({
                success: false,
                message: "Bạn không thể tự report bình luận của chính mình",
            });
        }

        const { duplicate, created } = await createReportWithDuplicateGuard({
            reporter_id: reporterId,
            scope_type: "review",
            scope_id: review.id,
            reason,
            note,
            meta: {
                title_id: review.title_id,
                episode_id: review.episode_id,
            },
        });

        if (duplicate) {
            return res.status(409).json({
                success: false,
                message: "Bạn đã gửi report này và đang chờ xử lý",
                data: buildReportResponse(duplicate),
            });
        }

        return res.status(201).json({
            success: true,
            data: buildReportResponse(created),
        });
    } catch (error) {
        console.error("createReviewReport error:", error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.status ? error.message : "Lỗi server khi gửi report bình luận",
        });
    }
};

export const createPlaybackReport = async (req, res) => {
    try {
        const reporterId = req.user?.id;
        const titleId = parsePositiveInt(req.body?.title_id);
        const episodeId = parsePositiveInt(req.body?.episode_id);
        const originId = parsePositiveInt(req.body?.origin_id);
        const variantId = parsePositiveInt(req.body?.variant_id);
        const reason = normalizeReason(req.body?.reason);
        const note = normalizeNote(req.body?.note);
        const purpose = String(req.body?.purpose || "content")
            .trim()
            .toLowerCase();
        const playerTimeSec = parseNonNegativeNumber(req.body?.player_time_sec);
        const userTier = getUserTier(req.user?.role);

        if (!reporterId) {
            return res.status(401).json({
                success: false,
                message: "Bạn cần đăng nhập để gửi báo cáo",
            });
        }

        if (!titleId) {
            return res.status(400).json({
                success: false,
                message: "title_id là bắt buộc và phải hợp lệ",
            });
        }

        if (!PLAYBACK_PURPOSES.has(purpose)) {
            return res.status(400).json({
                success: false,
                message: "purpose chỉ nhận content hoặc trailer",
            });
        }

        if (!PLAYBACK_REPORT_REASONS.has(reason)) {
            return res.status(400).json({
                success: false,
                message: "reason không hợp lệ cho playback report",
            });
        }

        if (reason === "other" && !note) {
            return res.status(400).json({
                success: false,
                message: "note là bắt buộc khi reason = other",
            });
        }

        const title = await Title.findByPk(titleId, {
            attributes: ["id", "type", "is_public", "access_tier"],
        });

        if (!title) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy title",
            });
        }

        if (!title.is_public) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy title",
            });
        }

        if (title.access_tier === "vip" && userTier !== "vip") {
            return res.status(403).json({
                success: false,
                message: "Bạn không có quyền report nội dung này",
            });
        }

        let scopeType = "title";
        let scopeId = title.id;
        let episode = null;

        if (episodeId) {
            episode = await Episode.findOne({
                where: { id: episodeId },
                attributes: ["id", "season_id", "episode_number", "access_tier"],
                include: [
                    {
                        model: Season,
                        attributes: ["id", "title_id", "access_tier"],
                    },
                ],
            });

            if (!episode || Number(episode.Season?.title_id) !== Number(title.id)) {
                return res.status(404).json({
                    success: false,
                    message: "Episode không tồn tại hoặc không thuộc title này",
                });
            }

            scopeType = "episode";
            scopeId = episode.id;

            if (episode.Season?.access_tier === "vip" && userTier !== "vip") {
                return res.status(403).json({
                    success: false,
                    message: "Bạn không có quyền report nội dung này",
                });
            }

            if (episode.access_tier === "vip" && userTier !== "vip") {
                return res.status(403).json({
                    success: false,
                    message: "Bạn không có quyền report nội dung này",
                });
            }
        } else if (title.type === "series" && purpose === "content") {
            return res.status(400).json({
                success: false,
                message: "episode_id là bắt buộc khi report playback của series",
            });
        }

        let origin = null;
        if (originId) {
            origin = await MediaOrigin.findOne({
                where: {
                    id: originId,
                    scope_type: scopeType,
                    scope_id: scopeId,
                    purpose,
                    is_active: true,
                },
                attributes: ["id", "scope_type", "scope_id", "purpose", "is_active"],
            });

            if (!origin) {
                return res.status(404).json({
                    success: false,
                    message: "origin_id không tồn tại hoặc không khớp với nội dung đang report",
                });
            }
        }

        if (variantId) {
            if (!origin) {
                return res.status(400).json({
                    success: false,
                    message: "origin_id là bắt buộc khi gửi variant_id",
                });
            }

            const variant = await MediaVariant.findOne({
                where: {
                    id: variantId,
                    origin_id: origin.id,
                },
                attributes: ["id", "quality"],
            });

            if (!variant) {
                return res.status(404).json({
                    success: false,
                    message: "variant_id không tồn tại hoặc không thuộc origin_id",
                });
            }
        }

        const { duplicate, created } = await createReportWithDuplicateGuard({
            reporter_id: reporterId,
            scope_type: scopeType,
            scope_id: scopeId,
            reason,
            note,
            meta: {
                title_id: title.id,
                episode_id: episode?.id || null,
                origin_id: origin?.id || null,
                variant_id: variantId || null,
                purpose,
                player_time_sec: playerTimeSec,
            },
        });

        if (duplicate) {
            return res.status(409).json({
                success: false,
                message: "Bạn đã gửi report này và đang chờ xử lý",
                data: buildReportResponse(duplicate),
            });
        }

        return res.status(201).json({
            success: true,
            data: buildReportResponse(created),
        });
    } catch (error) {
        console.error("createPlaybackReport error:", error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.status
                ? error.message
                : "Lỗi server khi gửi playback report",
        });
    }
};
