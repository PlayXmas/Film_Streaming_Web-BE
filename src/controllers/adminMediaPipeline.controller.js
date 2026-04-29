import fs from "fs/promises";
import { Op } from "sequelize";
import { Episode, MediaJob, MediaOrigin, MediaVariant, Season, Title, sequelize } from "../models/index.js";
import {
    attachUploadedVideoToOrigin,
    enqueueReprocessForOrigin,
} from "../services/mediaPipeline.service.js";
import { getOriginHlsDir, getOriginSourceDir } from "../config/mediaStorage.js";

const MEDIA_PURPOSES = new Set(["content", "trailer"]);
const AUDIO_TYPES = new Set(["sub", "dub", "voiceover"]);
const ACCESS_TIERS = new Set(["free", "vip"]);

function normalizeText(value) {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed || null;
}

function parseBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "1", "yes"].includes(normalized)) return true;
        if (["false", "0", "no"].includes(normalized)) return false;
    }
    return null;
}

function normalizeAudioType(value) {
    const normalized = normalizeText(value);
    if (!normalized) return "sub";
    const audioType = normalized.toLowerCase();
    return AUDIO_TYPES.has(audioType) ? audioType : null;
}

function mapOrigin(originInstance) {
    const origin = originInstance?.toJSON ? originInstance.toJSON() : originInstance;
    const variants = Array.isArray(origin?.MediaVariants) ? origin.MediaVariants : [];
    const jobs = Array.isArray(origin?.MediaJobs) ? origin.MediaJobs : [];

    return {
        id: origin.id,
        scope_type: origin.scope_type,
        scope_id: origin.scope_id,
        purpose: origin.purpose,
        delivery: origin.delivery,
        audio_type: origin.audio_type,
        has_subtitles: !!origin.has_subtitles,
        url: origin.url,
        hls_master_path: origin.hls_master_path,
        source_file_path: origin.source_file_path,
        source_file_name: origin.source_file_name,
        processing_status: origin.processing_status,
        processing_error: origin.processing_error,
        duration_sec: origin.duration_sec,
        last_processed_at: origin.last_processed_at,
        is_active: !!origin.is_active,
        is_primary: !!origin.is_primary,
        variants: variants.map((variant) => ({
            id: variant.id,
            origin_id: variant.origin_id,
            quality: variant.quality,
            required_tier: variant.required_tier,
            bitrate_kbps: variant.bitrate_kbps ?? null,
            playlist_url: variant.playlist_url ?? null,
            width: variant.width ?? null,
            height: variant.height ?? null,
            codec_video: variant.codec_video ?? null,
            codec_audio: variant.codec_audio ?? null,
        })),
        jobs: jobs.map((job) => ({
            id: job.id,
            job_type: job.job_type,
            status: job.status,
            attempts: job.attempts,
            max_attempts: job.max_attempts,
            started_at: job.started_at,
            finished_at: job.finished_at,
            last_error: job.last_error,
            created_at: job.created_at,
        })),
    };
}

async function cleanupUploadedFile(file) {
    if (!file?.path) return;
    await fs.unlink(file.path).catch(() => {});
}

async function cleanupOriginStorage(originId) {
    await Promise.all([
        fs.rm(getOriginSourceDir(originId), { recursive: true, force: true }),
        fs.rm(getOriginHlsDir(originId), { recursive: true, force: true }),
    ]);
}

async function loadOriginWithRelations(originId) {
    return MediaOrigin.findByPk(originId, {
        include: [
            { model: MediaVariant },
            { model: MediaJob },
        ],
        order: [
            [MediaVariant, "height", "ASC"],
            [MediaVariant, "quality", "ASC"],
            [MediaJob, "created_at", "DESC"],
            [MediaJob, "id", "DESC"],
        ],
    });
}

export const uploadTitleSourceVideo = async (req, res) => {
    try {
        const purpose = String(req.body?.purpose || "content").toLowerCase();
        if (!MEDIA_PURPOSES.has(purpose)) {
            await cleanupUploadedFile(req.file);
            return res.status(400).json({
                success: false,
                message: "purpose chỉ nhận content hoặc trailer",
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Thiếu file video trong field video",
            });
        }

        const title = await Title.findOne({
            where: { id: req.params.id, type: "movie" },
            attributes: ["id", "type"],
        });
        if (!title) {
            await cleanupUploadedFile(req.file);
            return res.status(404).json({ success: false, message: "Không tìm thấy movie" });
        }

        const audioType = normalizeAudioType(req.body?.audio_type);
        if (!audioType) {
            await cleanupUploadedFile(req.file);
            return res.status(400).json({
                success: false,
                message: "audio_type không hợp lệ (sub, dub, voiceover)",
            });
        }
        const hasSubtitles = parseBoolean(req.body?.has_subtitles);

        const origin = await sequelize.transaction(async (transaction) => {
            let existing = await MediaOrigin.findOne({
                where: {
                    scope_type: "title",
                    scope_id: title.id,
                    purpose,
                },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });

            if (!existing) {
                existing = await MediaOrigin.create(
                    {
                        scope_type: "title",
                        scope_id: title.id,
                        purpose,
                        delivery: "HLS",
                        audio_type: audioType,
                        has_subtitles: hasSubtitles ?? true,
                        url: "",
                        processing_status: "uploaded",
                        is_active: true,
                    },
                    { transaction }
                );
            }

            await attachUploadedVideoToOrigin({
                origin: existing,
                file: req.file,
                audioType,
                hasSubtitles,
                transaction,
            });

            return existing;
        });

        const full = await loadOriginWithRelations(origin.id);
        return res.status(201).json({ success: true, data: mapOrigin(full) });
    } catch (err) {
        await cleanupUploadedFile(req.file);
        console.error("uploadTitleSourceVideo error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server khi upload video nguồn" });
    }
};

export const uploadEpisodeSourceVideo = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Thiếu file video trong field video",
            });
        }

        const episode = await Episode.findByPk(req.params.episodeId, {
            attributes: ["id", "season_id"],
            include: [
                {
                    model: Season,
                    attributes: ["id", "title_id"],
                    include: [{ model: Title, attributes: ["id", "type"] }],
                },
            ],
        });

        if (!episode || episode.Season?.Title?.type !== "series") {
            await cleanupUploadedFile(req.file);
            return res.status(404).json({ success: false, message: "Không tìm thấy episode" });
        }

        const purpose = String(req.body?.purpose || "content").toLowerCase();
        if (!MEDIA_PURPOSES.has(purpose)) {
            await cleanupUploadedFile(req.file);
            return res.status(400).json({
                success: false,
                message: "purpose chỉ nhận content hoặc trailer",
            });
        }

        const audioType = normalizeAudioType(req.body?.audio_type);
        if (!audioType) {
            await cleanupUploadedFile(req.file);
            return res.status(400).json({
                success: false,
                message: "audio_type không hợp lệ (sub, dub, voiceover)",
            });
        }
        const hasSubtitles = parseBoolean(req.body?.has_subtitles);
        const requestedPrimary = parseBoolean(req.body?.is_primary);
        const requestedOriginId = Number.parseInt(req.body?.origin_id || "", 10);

        const origin = await sequelize.transaction(async (transaction) => {
            let existing = null;
            if (Number.isInteger(requestedOriginId) && requestedOriginId > 0) {
                existing = await MediaOrigin.findOne({
                    where: {
                        id: requestedOriginId,
                        scope_type: "episode",
                        scope_id: episode.id,
                        purpose,
                    },
                    transaction,
                    lock: transaction.LOCK.UPDATE,
                });
            }

            const siblingCount = await MediaOrigin.count({
                where: {
                    scope_type: "episode",
                    scope_id: episode.id,
                    purpose,
                    ...(existing ? { id: { [Op.ne]: existing.id } } : {}),
                },
                transaction,
            });

            const shouldSetPrimary =
                requestedPrimary === true
                    ? true
                    : requestedPrimary === false
                        ? false
                        : existing
                            ? !!existing.is_primary
                            : siblingCount === 0;

            if (!existing) {
                existing = await MediaOrigin.create(
                    {
                        scope_type: "episode",
                        scope_id: episode.id,
                        purpose,
                        delivery: "HLS",
                        audio_type: audioType,
                        has_subtitles: hasSubtitles ?? true,
                        url: "",
                        processing_status: "uploaded",
                        is_active: true,
                        is_primary: shouldSetPrimary,
                    },
                    { transaction }
                );
            }

            if (shouldSetPrimary) {
                await MediaOrigin.update(
                    { is_primary: false },
                    {
                        where: {
                            scope_type: "episode",
                            scope_id: episode.id,
                            purpose,
                            id: { [Op.ne]: existing.id },
                        },
                        transaction,
                    }
                );
                existing.is_primary = true;
                await existing.save({ transaction });
            } else if (requestedPrimary === false && existing.is_primary) {
                existing.is_primary = false;
                await existing.save({ transaction });
            }

            await attachUploadedVideoToOrigin({
                origin: existing,
                file: req.file,
                audioType,
                hasSubtitles,
                transaction,
            });

            return existing;
        });

        const full = await loadOriginWithRelations(origin.id);
        return res.status(201).json({ success: true, data: mapOrigin(full) });
    } catch (err) {
        await cleanupUploadedFile(req.file);
        console.error("uploadEpisodeSourceVideo error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server khi upload video nguồn" });
    }
};

export const reprocessMediaOrigin = async (req, res) => {
    try {
        const origin = await MediaOrigin.findByPk(req.params.originId);
        if (!origin) {
            return res.status(404).json({ success: false, message: "Không tìm thấy origin" });
        }

        await sequelize.transaction(async (transaction) => {
            await enqueueReprocessForOrigin(origin, transaction);
        });

        const full = await loadOriginWithRelations(origin.id);
        return res.json({ success: true, data: mapOrigin(full) });
    } catch (err) {
        console.error("reprocessMediaOrigin error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server khi xếp lại job xử lý" });
    }
};

export const updateMediaOriginSettings = async (req, res) => {
    try {
        const origin = await MediaOrigin.findByPk(req.params.originId);
        if (!origin) {
            return res.status(404).json({ success: false, message: "Không tìm thấy origin" });
        }

        const payload = {};
        const audioType = req.body?.audio_type !== undefined ? normalizeAudioType(req.body.audio_type) : undefined;
        if (req.body?.audio_type !== undefined) {
            if (!audioType) {
                return res.status(400).json({
                    success: false,
                    message: "audio_type không hợp lệ (sub, dub, voiceover)",
                });
            }
            payload.audio_type = audioType;
        }

        const hasSubtitles = parseBoolean(req.body?.has_subtitles);
        if (hasSubtitles !== null) payload.has_subtitles = hasSubtitles;

        const isActive = parseBoolean(req.body?.is_active);
        if (isActive !== null) payload.is_active = isActive;

        const requestedPrimary = parseBoolean(req.body?.is_primary);

        if (Object.keys(payload).length === 0 && requestedPrimary === null) {
            return res.status(400).json({
                success: false,
                message: "Không có dữ liệu cập nhật hợp lệ",
            });
        }

        await sequelize.transaction(async (transaction) => {
            await origin.update(payload, { transaction });

            if (requestedPrimary !== null && origin.scope_type === "episode") {
                if (requestedPrimary) {
                    await MediaOrigin.update(
                        { is_primary: false },
                        {
                            where: {
                                scope_type: "episode",
                                scope_id: origin.scope_id,
                                purpose: origin.purpose,
                                id: { [Op.ne]: origin.id },
                            },
                            transaction,
                        }
                    );
                }

                origin.is_primary = requestedPrimary;
                await origin.save({ transaction });
            }
        });

        const full = await loadOriginWithRelations(origin.id);
        return res.json({ success: true, data: mapOrigin(full) });
    } catch (err) {
        console.error("updateMediaOriginSettings error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server khi cập nhật origin" });
    }
};

export const updateMediaVariantTier = async (req, res) => {
    try {
        const variant = await MediaVariant.findByPk(req.params.id);
        if (!variant) {
            return res.status(404).json({ success: false, message: "Không tìm thấy variant" });
        }

        const requiredTier = normalizeText(req.body?.required_tier)?.toLowerCase();
        if (!requiredTier || !ACCESS_TIERS.has(requiredTier)) {
            return res.status(400).json({
                success: false,
                message: "required_tier không hợp lệ (free, vip)",
            });
        }

        await variant.update({ required_tier: requiredTier });
        return res.json({
            success: true,
            data: {
                id: variant.id,
                origin_id: variant.origin_id,
                quality: variant.quality,
                required_tier: variant.required_tier,
            },
        });
    } catch (err) {
        console.error("updateMediaVariantTier error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server khi cập nhật quyền quality" });
    }
};

export const deleteManagedMediaOrigin = async (req, res) => {
    try {
        const origin = await MediaOrigin.findByPk(req.params.originId);
        if (!origin) {
            return res.status(404).json({ success: false, message: "Không tìm thấy origin" });
        }

        const originId = origin.id;

        await sequelize.transaction(async (transaction) => {
            await MediaVariant.destroy({
                where: { origin_id: originId },
                transaction,
            });
            await MediaJob.destroy({
                where: { origin_id: originId },
                transaction,
            });
            await origin.destroy({ transaction });
        });

        await cleanupOriginStorage(originId).catch((cleanupErr) => {
            console.warn("deleteManagedMediaOrigin cleanup warning:", cleanupErr);
        });

        return res.json({ success: true, message: "Đã xóa origin và dữ liệu media local" });
    } catch (err) {
        console.error("deleteManagedMediaOrigin error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server khi xóa origin" });
    }
};

export const listMediaOriginJobs = async (req, res) => {
    try {
        const origin = await MediaOrigin.findByPk(req.params.originId);
        if (!origin) {
            return res.status(404).json({ success: false, message: "Không tìm thấy origin" });
        }

        const jobs = await MediaJob.findAll({
            where: { origin_id: origin.id },
            order: [["created_at", "DESC"], ["id", "DESC"]],
        });

        return res.json({
            success: true,
            data: jobs.map((job) => ({
                id: job.id,
                origin_id: job.origin_id,
                job_type: job.job_type,
                status: job.status,
                attempts: job.attempts,
                max_attempts: job.max_attempts,
                payload: job.payload,
                started_at: job.started_at,
                finished_at: job.finished_at,
                last_error: job.last_error,
                created_at: job.created_at,
                updated_at: job.updated_at,
            })),
        });
    } catch (err) {
        console.error("listMediaOriginJobs error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server khi lấy media jobs" });
    }
};
