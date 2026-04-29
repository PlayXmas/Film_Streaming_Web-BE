// src/controllers/watchHistory.controller.js
import {
    Episode,
    MediaOrigin,
    MediaVariant,
    PlaybackEvent,
    Season,
    Title,
    WatchHistory,
    sequelize,
} from "../models/index.js";
import { Op } from "sequelize";

const PLAYBACK_EVENT_TYPES = new Set([
    "start",
    "heartbeat",
    "pause",
    "seek",
    "resume",
    "ended",
    "quality_change",
    "error",
]);

function toPositiveInt(value) {
    if (value == null || value === "") return null;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
}

function toNonNegativeNumber(value) {
    if (value == null || value === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
}

function toBooleanOrDefault(value, defaultValue = false) {
    if (typeof value === "boolean") return value;
    return defaultValue;
}

function computeProgressPercent(currentTimeSec, durationSec) {
    if (!Number.isFinite(currentTimeSec) || !Number.isFinite(durationSec) || durationSec <= 0) {
        return null;
    }

    return Math.min(100, Math.max(0, Math.round((currentTimeSec / durationSec) * 100)));
}

async function validatePlaybackContext({ titleId, episodeId, originId, variantId, transaction }) {
    const title = await Title.findByPk(titleId, {
        attributes: ["id", "type"],
        transaction,
    });
    if (!title) {
        return { error: { status: 404, message: "Không tìm thấy title" } };
    }

    let episode = null;
    if (episodeId) {
        episode = await Episode.findOne({
            where: { id: episodeId },
            attributes: ["id", "season_id"],
            include: [
                {
                    model: Season,
                    attributes: ["id", "title_id"],
                },
            ],
            transaction,
        });

        if (!episode || Number(episode.Season?.title_id) !== Number(titleId)) {
            return { error: { status: 404, message: "Episode không tồn tại hoặc không thuộc title này" } };
        }
    }

    let origin = null;
    if (originId) {
        origin = await MediaOrigin.findByPk(originId, {
            attributes: ["id", "scope_type", "scope_id"],
            transaction,
        });

        if (!origin) {
            return { error: { status: 404, message: "Không tìm thấy media origin" } };
        }

        const expectedScopeType = episode ? "episode" : "title";
        const expectedScopeId = episode ? episode.id : title.id;
        if (origin.scope_type !== expectedScopeType || Number(origin.scope_id) !== Number(expectedScopeId)) {
            return { error: { status: 400, message: "origin_id không khớp với title/episode đang xem" } };
        }
    }

    if (variantId) {
        if (!origin) {
            return { error: { status: 400, message: "originId là bắt buộc khi gửi variantId" } };
        }

        const variant = await MediaVariant.findOne({
            where: { id: variantId, origin_id: origin.id },
            attributes: ["id"],
            transaction,
        });

        if (!variant) {
            return { error: { status: 404, message: "variantId không tồn tại hoặc không thuộc originId" } };
        }
    }

    return { title, episode, origin };
}

async function upsertWatchHistorySnapshot({
    userId,
    titleId,
    episodeId,
    currentTimeSec,
    durationSec,
    progressPercent,
    isFinished,
    transaction,
}) {
    const where = {
        user_id: userId,
        title_id: titleId,
        episode_id: episodeId ?? null,
    };

    const finished =
        typeof isFinished === "boolean" ? isFinished : progressPercent != null ? progressPercent >= 90 : false;

    let record = await WatchHistory.findOne({ where, transaction });
    if (!record) {
        record = await WatchHistory.create(
            {
                ...where,
                current_time_sec: currentTimeSec,
                duration_sec: durationSec,
                progress_percent: progressPercent ?? 0,
                is_finished: finished,
                last_watched_at: new Date(),
            },
            { transaction }
        );
    } else {
        await record.update(
            {
                current_time_sec: currentTimeSec,
                duration_sec: durationSec,
                progress_percent: progressPercent ?? record.progress_percent ?? 0,
                is_finished: finished,
                last_watched_at: new Date(),
            },
            { transaction }
        );
    }

    return record;
}

export const createPlaybackEvent = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Chưa đăng nhập",
            });
        }

        const titleId = toPositiveInt(req.body?.titleId);
        const episodeId = toPositiveInt(req.body?.episodeId);
        const originId = toPositiveInt(req.body?.originId);
        const variantId = toPositiveInt(req.body?.variantId);
        const sessionId = String(req.body?.sessionId || "").trim() || null;
        const eventType = String(req.body?.eventType || "heartbeat")
            .trim()
            .toLowerCase();
        const playerTimeSec = toNonNegativeNumber(req.body?.playerTimeSec ?? req.body?.currentTime);
        const durationSec = toNonNegativeNumber(req.body?.durationSec ?? req.body?.duration);
        const playbackRate = toNonNegativeNumber(req.body?.playbackRate);
        const volume = toNonNegativeNumber(req.body?.volume);
        const quality = String(req.body?.quality || "").trim() || null;
        const isMuted = toBooleanOrDefault(req.body?.isMuted, false);
        const isFinished = typeof req.body?.isFinished === "boolean" ? req.body.isFinished : eventType === "ended";
        const eventAt = req.body?.eventAt ? new Date(req.body.eventAt) : new Date();
        const meta = req.body?.meta && typeof req.body.meta === "object" ? req.body.meta : null;

        if (!titleId) {
            return res.status(400).json({
                success: false,
                message: "titleId là bắt buộc",
            });
        }

        if (!PLAYBACK_EVENT_TYPES.has(eventType)) {
            return res.status(400).json({
                success: false,
                message: "eventType không hợp lệ",
            });
        }

        if (req.body?.eventAt && Number.isNaN(eventAt.getTime())) {
            return res.status(400).json({
                success: false,
                message: "eventAt không hợp lệ",
            });
        }

        const progressPercent = computeProgressPercent(playerTimeSec, durationSec);

        const result = await sequelize.transaction(async (transaction) => {
            const context = await validatePlaybackContext({
                titleId,
                episodeId,
                originId,
                variantId,
                transaction,
            });

            if (context.error) {
                const error = new Error(context.error.message);
                error.status = context.error.status;
                throw error;
            }

            const event = await PlaybackEvent.create(
                {
                    user_id: userId,
                    title_id: titleId,
                    episode_id: episodeId,
                    origin_id: originId,
                    variant_id: variantId,
                    session_id: sessionId,
                    event_type: eventType,
                    player_time_sec: playerTimeSec,
                    duration_sec: durationSec,
                    progress_percent: progressPercent,
                    playback_rate: playbackRate,
                    quality,
                    volume,
                    is_muted: isMuted,
                    event_at: eventAt,
                    meta,
                },
                { transaction }
            );

            let history = null;
            if (playerTimeSec != null && durationSec != null) {
                history = await upsertWatchHistorySnapshot({
                    userId,
                    titleId,
                    episodeId,
                    currentTimeSec: playerTimeSec,
                    durationSec,
                    progressPercent,
                    isFinished,
                    transaction,
                });
            }

            return { event, history };
        });

        return res.status(201).json({
            success: true,
            data: {
                event: result.event,
                watch_history: result.history,
            },
        });
    } catch (error) {
        console.error("[POST /api/users/playback-events] ERROR:", error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.status ? error.message : "Lỗi server khi lưu playback event",
        });
    }
};

/**
 * PUT /api/users/watch-history
 * Body:
 * {
 *   "titleId": 1,
 *   "episodeId": 10,   // optional, null nếu movie
 *   "currentTime": 523, // giây
 *   "duration": 1800,   // giây
 *   "isFinished": false // optional
 * }
 */
export const updateMyWatchHistory = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Chưa đăng nhập",
            });
        }

        const { titleId, episodeId, currentTime, duration, isFinished } = req.body;

        if (!titleId || currentTime == null || !duration) {
            return res.status(400).json({
                success: false,
                message: "titleId, currentTime, duration là bắt buộc",
            });
        }

        const titleIdNum = toPositiveInt(titleId);
        const episodeIdNum = toPositiveInt(episodeId);
        const currentTimeNum = toNonNegativeNumber(currentTime);
        const durationNum = toNonNegativeNumber(duration);

        if (
            !titleIdNum ||
            (episodeId != null && episodeId !== "" && !episodeIdNum) ||
            currentTimeNum == null ||
            durationNum == null
        ) {
            return res.status(400).json({
                success: false,
                message: "Giá trị số không hợp lệ",
            });
        }

        const progressPercent = computeProgressPercent(currentTimeNum, durationNum);

        const context = await validatePlaybackContext({
            titleId: titleIdNum,
            episodeId: episodeIdNum,
            originId: null,
            variantId: null,
            transaction: null,
        });

        if (context.error) {
            return res.status(context.error.status).json({
                success: false,
                message: context.error.message,
            });
        }

        const record = await upsertWatchHistorySnapshot({
            userId,
            titleId: titleIdNum,
            episodeId: episodeIdNum,
            currentTimeSec: currentTimeNum,
            durationSec: durationNum,
            progressPercent,
            isFinished,
            transaction: null,
        });

        return res.status(200).json({
            success: true,
            message: "Đã cập nhật watch history. Khuyến nghị FE dùng POST /api/users/playback-events cho luồng xem phim mới.",
            data: record,
        });
    } catch (error) {
        console.error("[PUT /api/me/watch-history] DB ERROR:", {
            message: error.message,
            name: error.name,
            sql: error.sql,
            sqlMessage: error.parent?.sqlMessage,
            sqlState: error.parent?.sqlState,
            code: error.parent?.code,
        });

        return res.status(500).json({
            success: false,
            message: "Lỗi server khi cập nhật lịch sử xem",
            error: error.parent?.sqlMessage || error.message,
        });
    }
};

/**
 * GET /api/me/watch-history
 * Query:
 *  - type = continue | finished | all (default: all)
 *  - page, limit
 *  - titleId (optional, để WatchPage lấy riêng 1 phim)
 */
export const getMyWatchHistory = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Chưa đăng nhập",
            });
        }

        const type = (req.query.type || "all").toLowerCase();
        const titleIdRaw = req.query.titleId;

        // Pagination
        const pageRaw = parseInt(req.query.page, 10);
        const limitRaw = parseInt(req.query.limit, 10);

        const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
        const limit = Number.isNaN(limitRaw) || limitRaw < 1 ? 20 : limitRaw;
        const offset = (page - 1) * limit;

        const where = {
            user_id: userId,
        };

        if (titleIdRaw) {
            const titleId = parseInt(titleIdRaw, 10);
            if (!Number.isNaN(titleId)) {
                where.title_id = titleId;
            }
        }

        if (type === "continue") {
            // chưa xem xong, đã xem >= 5%
            where.is_finished = false;
            where.progress_percent = {
                [Op.gte]: 5,
            };
        } else if (type === "finished") {
            where.is_finished = true;
        }

        const result = await WatchHistory.findAndCountAll({
            where,
            include: [
                {
                    model: Title,
                    attributes: [
                        "id",
                        "type",
                        "slug",
                        "name",
                        "poster_url",
                        "backdrop_url",
                        "access_tier",
                    ],
                },
                {
                    model: Episode,
                    attributes: [
                        "id",
                        "season_id",
                        "episode_number",
                        "name",
                        "still_url",
                        "runtime_min",
                    ],
                },
            ],
            order: [["last_watched_at", "DESC"]],
            limit,
            offset,
        });

        const totalItems = result.count;
        const totalPages = Math.max(Math.ceil(totalItems / limit), 1);

        return res.status(200).json({
            success: true,
            data: result.rows,
            pagination: {
                page,
                limit,
                totalItems,
                totalPages,
            },
        });
    } catch (error) {
        console.error("[GET /api/me/watch-history] DB ERROR:", {
            message: error.message,
            name: error.name,
            sql: error.sql,
            sqlMessage: error.parent?.sqlMessage,
            sqlState: error.parent?.sqlState,
            code: error.parent?.code,
        });

        return res.status(500).json({
            success: false,
            message: "Lỗi server khi lấy lịch sử xem",
            error: error.parent?.sqlMessage || error.message,
        });
    }
};

// DELETE /api/user/watch-history/:id  - xóa 1 dòng history của chính user
export const deleteMyWatchHistoryItem = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Chưa đăng nhập",
            });
        }

        const historyId = parseInt(req.params.id, 10);
        if (Number.isNaN(historyId) || historyId < 1) {
            return res.status(400).json({
                success: false,
                message: "ID history không hợp lệ",
            });
        }

        // chỉ xóa record thuộc về user hiện tại
        const record = await WatchHistory.findOne({
            where: {
                id: historyId,
                user_id: userId,
            },
        });

        if (!record) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy lịch sử xem tương ứng",
            });
        }

        await record.destroy();

        return res.status(200).json({
            success: true,
            message: "Đã xóa lịch sử xem",
        });
    } catch (error) {
        console.error("[DELETE /api/user/watch-history/:id] DB ERROR:", {
            message: error.message,
            name: error.name,
            sql: error.sql,
            sqlMessage: error.parent?.sqlMessage,
            sqlState: error.parent?.sqlState,
            code: error.parent?.code,
        });

        return res.status(500).json({
            success: false,
            message: "Lỗi server khi xóa lịch sử xem",
            error: error.parent?.sqlMessage || error.message,
        });
    }
};

/**
 * DELETE /api/user/watch-history
 * Query optional:
 *   - titleId: nếu gửi -> xóa lịch sử của 1 phim (và các tập thuộc phim đó)
 *   - nếu không gửi -> xóa toàn bộ lịch sử của user
 */
export const clearMyWatchHistory = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Chưa đăng nhập",
            });
        }

        const where = { user_id: userId };

        const titleIdRaw = req.query.titleId;
        if (titleIdRaw) {
            const titleId = parseInt(titleIdRaw, 10);
            if (!Number.isNaN(titleId)) {
                where.title_id = titleId;
            }
        }

        const deletedCount = await WatchHistory.destroy({ where });

        return res.status(200).json({
            success: true,
            message: "Đã xóa lịch sử xem",
            deleted: deletedCount,
        });
    } catch (error) {
        console.error("[DELETE /api/user/watch-history] DB ERROR:", {
            message: error.message,
            name: error.name,
            sql: error.sql,
            sqlMessage: error.parent?.sqlMessage,
            sqlState: error.parent?.sqlState,
            code: error.parent?.code,
        });

        return res.status(500).json({
            success: false,
            message: "Lỗi server khi xóa lịch sử xem",
            error: error.parent?.sqlMessage || error.message,
        });
    }
};
