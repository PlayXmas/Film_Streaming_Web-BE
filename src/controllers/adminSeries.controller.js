import { Op } from "sequelize";
import { Episode, MediaOrigin, MediaVariant, Season, Title, sequelize } from "../models/index.js";
import {
    adminTitleInclude,
    createAdminTitle,
    listAdminTitles,
    loadCreditsForTitleId,
    toClient,
    updateAdminTitle,
} from "./adminTitles.controller.js";

const SERIES_TYPE = "series";
const MEDIA_PURPOSES = new Set(["content", "trailer"]);
const EPISODE_SCOPE = "episode";
const ACCESS_TIERS = new Set(["free", "vip"]);

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

function normalizeText(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
}

function normalizeNumber(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    const num = Number(value);
    return Number.isNaN(num) ? null : num;
}

function normalizeAccessTier(value) {
    const normalized = normalizeText(value);
    if (!normalized) return null;
    const tier = normalized.toLowerCase();
    return ACCESS_TIERS.has(tier) ? tier : null;
}

function mapOrigin(originInstance) {
    const origin = originInstance?.toJSON ? originInstance.toJSON() : originInstance;
    const variants = Array.isArray(origin?.MediaVariants) ? origin.MediaVariants : [];

    return {
        id: origin.id,
        scope_type: origin.scope_type,
        scope_id: origin.scope_id,
        purpose: origin.purpose,
        delivery: origin.delivery,
        audio_type: origin.audio_type,
        has_subtitles: !!origin.has_subtitles,
        url: origin.url,
        hls_master_path: origin.hls_master_path ?? null,
        source_file_path: origin.source_file_path ?? null,
        source_file_name: origin.source_file_name ?? null,
        processing_status: origin.processing_status ?? "ready",
        processing_error: origin.processing_error ?? null,
        duration_sec: origin.duration_sec ?? null,
        last_processed_at: origin.last_processed_at ?? null,
        is_active: !!origin.is_active,
        is_primary: !!origin.is_primary,
        variants: variants.map((v) => ({
            id: v.id,
            origin_id: v.origin_id,
            quality: v.quality,
            required_tier: v.required_tier,
            bitrate_kbps: v.bitrate_kbps ?? null,
            playlist_url: v.playlist_url ?? null,
            width: v.width ?? null,
            height: v.height ?? null,
            codec_video: v.codec_video ?? null,
            codec_audio: v.codec_audio ?? null,
        })),
    };
}

async function findSeriesById(id, include, options = {}) {
    return Title.findOne({
        where: { id, type: SERIES_TYPE },
        ...(include ? { include } : {}),
        ...options,
    });
}

async function deleteEpisodeOriginsByIds(episodeIds, transaction) {
    if (!episodeIds.length) return;
    const origins = await MediaOrigin.findAll({
        where: { scope_type: EPISODE_SCOPE, scope_id: episodeIds },
        attributes: ["id"],
        raw: true,
        transaction,
    });
    const originIds = origins.map((o) => o.id);
    if (!originIds.length) return;
    await MediaVariant.destroy({ where: { origin_id: originIds }, transaction });
    await MediaOrigin.destroy({ where: { id: originIds }, transaction });
}

// ===== Series (phim bộ) =====

export const listAdminSeries = async (req, res) => {
    req.query.type = SERIES_TYPE;
    if (req.query.q && !req.query.keyword) {
        req.query.keyword = req.query.q;
    }
    return listAdminTitles(req, res);
};

export const createAdminSeries = async (req, res) => {
    req.body = req.body || {};
    req.body.type = SERIES_TYPE;
    return createAdminTitle(req, res);
};

export const getAdminSeriesDetail = async (req, res) => {
    try {
        const row = await findSeriesById(req.params.id, adminTitleInclude);
        if (!row) {
            return res.status(404).json({ success: false, message: "Không tìm thấy series" });
        }

        const credits = await loadCreditsForTitleId(row.id);
        return res.json({ success: true, data: toClient(row, null, credits) });
    } catch (err) {
        console.error("getAdminSeriesDetail error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

export const updateAdminSeries = async (req, res) => {
    try {
        const series = await findSeriesById(req.params.id);
        if (!series) {
            return res.status(404).json({ success: false, message: "Không tìm thấy series" });
        }

        req.body = req.body || {};
        req.body.type = SERIES_TYPE;
        return updateAdminTitle(req, res);
    } catch (err) {
        console.error("updateAdminSeries error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

export const deleteAdminSeries = async (req, res) => {
    try {
        const deleted = await sequelize.transaction(async (transaction) => {
            const series = await findSeriesById(req.params.id, null, { transaction });
            if (!series) {
                return false;
            }

            const titleOrigins = await MediaOrigin.findAll({
                where: { scope_type: "title", scope_id: series.id },
                attributes: ["id"],
                raw: true,
                transaction,
            });
            const titleOriginIds = titleOrigins.map((o) => o.id);
            if (titleOriginIds.length) {
                await MediaVariant.destroy({ where: { origin_id: titleOriginIds }, transaction });
                await MediaOrigin.destroy({ where: { id: titleOriginIds }, transaction });
            }

            const seasons = await Season.findAll({
                where: { title_id: series.id },
                attributes: ["id"],
                raw: true,
                transaction,
            });
            const seasonIds = seasons.map((s) => s.id);
            if (seasonIds.length) {
                const episodes = await Episode.findAll({
                    where: { season_id: seasonIds },
                    attributes: ["id"],
                    raw: true,
                    transaction,
                });
                const episodeIds = episodes.map((e) => e.id);
                await deleteEpisodeOriginsByIds(episodeIds, transaction);
                if (episodeIds.length) {
                    await Episode.destroy({ where: { id: episodeIds }, transaction });
                }
                await Season.destroy({ where: { id: seasonIds }, transaction });
            }

            await series.destroy({ transaction });
            return true;
        });

        if (!deleted) {
            return res.status(404).json({ success: false, message: "Không tìm thấy series" });
        }

        return res.json({ success: true, message: "Đã xóa series" });
    } catch (err) {
        console.error("deleteAdminSeries error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// ===== Seasons =====

export const listSeriesSeasons = async (req, res) => {
    try {
        const series = await findSeriesById(req.params.seriesId);
        if (!series) {
            return res.status(404).json({ success: false, message: "Không tìm thấy series" });
        }

        const seasons = await Season.findAll({
            where: { title_id: series.id },
            order: [
                ["season_number", "ASC"],
                ["id", "ASC"],
            ],
        });

        return res.json({ success: true, data: seasons });
    } catch (err) {
        console.error("listSeriesSeasons error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

export const createSeriesSeason = async (req, res) => {
    try {
        const series = await findSeriesById(req.params.seriesId);
        if (!series) {
            return res.status(404).json({ success: false, message: "Không tìm thấy series" });
        }

        const {
            season_number,
            name,
            overview,
            poster_url,
            release_year,
            access_tier,
        } = req.body || {};

        const seasonNumber = normalizeNumber(season_number);
        if (!Number.isInteger(seasonNumber) || seasonNumber < 1) {
            return res.status(400).json({ success: false, message: "season_number không hợp lệ" });
        }
        const normalizedAccessTier = access_tier === undefined
            ? undefined
            : normalizeAccessTier(access_tier);
        if (access_tier !== undefined && !normalizedAccessTier) {
            return res.status(400).json({ success: false, message: "access_tier không hợp lệ" });
        }

        const existing = await Season.findOne({
            where: { title_id: series.id, season_number: seasonNumber },
        });
        if (existing) {
            return res.status(409).json({
                success: false,
                message: "Season_number đã tồn tại trong series này",
            });
        }

        const created = await Season.create({
            title_id: series.id,
            season_number: seasonNumber,
            name: name ?? null,
            overview: overview ?? null,
            poster_url: poster_url ?? null,
            release_year: normalizeNumber(release_year),
            access_tier: normalizedAccessTier || "free",
        });

        return res.status(201).json({ success: true, data: created });
    } catch (err) {
        console.error("createSeriesSeason error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

export const updateSeason = async (req, res) => {
    try {
        const season = await Season.findByPk(req.params.seasonId);
        if (!season) {
            return res.status(404).json({ success: false, message: "Không tìm thấy season" });
        }

        const {
            season_number,
            name,
            overview,
            poster_url,
            release_year,
            access_tier,
        } = req.body || {};

        const normalizedAccessTier = access_tier === undefined
            ? undefined
            : normalizeAccessTier(access_tier);
        if (access_tier !== undefined && !normalizedAccessTier) {
            return res.status(400).json({ success: false, message: "access_tier không hợp lệ" });
        }

        if (season_number !== undefined) {
            const seasonNumber = normalizeNumber(season_number);
            if (!Number.isInteger(seasonNumber) || seasonNumber < 1) {
                return res.status(400).json({ success: false, message: "season_number không hợp lệ" });
            }
            const existing = await Season.findOne({
                where: {
                    title_id: season.title_id,
                    season_number: seasonNumber,
                    id: { [Op.ne]: season.id },
                },
            });
            if (existing) {
                return res.status(409).json({
                    success: false,
                    message: "Season_number đã tồn tại trong series này",
                });
            }
            season.season_number = seasonNumber;
        }

        if (name !== undefined) season.name = name ?? null;
        if (overview !== undefined) season.overview = overview ?? null;
        if (poster_url !== undefined) season.poster_url = poster_url ?? null;
        if (release_year !== undefined) season.release_year = normalizeNumber(release_year);
        if (access_tier !== undefined) season.access_tier = normalizedAccessTier;

        await season.save();
        return res.json({ success: true, data: season });
    } catch (err) {
        console.error("updateSeason error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

export const deleteSeason = async (req, res) => {
    try {
        const season = await Season.findByPk(req.params.seasonId);
        if (!season) {
            return res.status(404).json({ success: false, message: "Không tìm thấy season" });
        }

        const episodes = await Episode.findAll({
            where: { season_id: season.id },
            attributes: ["id"],
            raw: true,
        });
        const episodeIds = episodes.map((e) => e.id);
        await deleteEpisodeOriginsByIds(episodeIds);
        if (episodeIds.length) {
            await Episode.destroy({ where: { id: episodeIds } });
        }

        await season.destroy();
        return res.json({ success: true, message: "Đã xóa season" });
    } catch (err) {
        console.error("deleteSeason error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// ===== Episodes =====

export const listSeasonEpisodes = async (req, res) => {
    try {
        const season = await Season.findByPk(req.params.seasonId);
        if (!season) {
            return res.status(404).json({ success: false, message: "Không tìm thấy season" });
        }

        const episodes = await Episode.findAll({
            where: { season_id: season.id },
            order: [
                ["episode_number", "ASC"],
                ["id", "ASC"],
            ],
        });

        return res.json({ success: true, data: episodes });
    } catch (err) {
        console.error("listSeasonEpisodes error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

export const createSeasonEpisode = async (req, res) => {
    try {
        const season = await Season.findByPk(req.params.seasonId);
        if (!season) {
            return res.status(404).json({ success: false, message: "Không tìm thấy season" });
        }

        const {
            episode_number,
            name,
            overview,
            still_url,
            runtime_min,
            access_tier,
        } = req.body || {};

        const episodeNumber = normalizeNumber(episode_number);
        if (!Number.isInteger(episodeNumber) || episodeNumber < 1) {
            return res.status(400).json({ success: false, message: "episode_number không hợp lệ" });
        }
        const normalizedAccessTier = access_tier === undefined
            ? undefined
            : normalizeAccessTier(access_tier);
        if (access_tier !== undefined && !normalizedAccessTier) {
            return res.status(400).json({ success: false, message: "access_tier không hợp lệ" });
        }

        const existing = await Episode.findOne({
            where: { season_id: season.id, episode_number: episodeNumber },
        });
        if (existing) {
            return res.status(409).json({
                success: false,
                message: "Episode_number đã tồn tại trong season này",
            });
        }

        const created = await Episode.create({
            season_id: season.id,
            episode_number: episodeNumber,
            name: name ?? null,
            overview: overview ?? null,
            still_url: still_url ?? null,
            runtime_min: normalizeNumber(runtime_min),
            access_tier: normalizedAccessTier || "free",
        });

        return res.status(201).json({ success: true, data: created });
    } catch (err) {
        console.error("createSeasonEpisode error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

export const updateEpisode = async (req, res) => {
    try {
        const episode = await Episode.findByPk(req.params.episodeId);
        if (!episode) {
            return res.status(404).json({ success: false, message: "Không tìm thấy episode" });
        }

        const {
            episode_number,
            name,
            overview,
            still_url,
            runtime_min,
            access_tier,
        } = req.body || {};

        const normalizedAccessTier = access_tier === undefined
            ? undefined
            : normalizeAccessTier(access_tier);
        if (access_tier !== undefined && !normalizedAccessTier) {
            return res.status(400).json({ success: false, message: "access_tier không hợp lệ" });
        }

        if (episode_number !== undefined) {
            const episodeNumber = normalizeNumber(episode_number);
            if (!Number.isInteger(episodeNumber) || episodeNumber < 1) {
                return res.status(400).json({ success: false, message: "episode_number không hợp lệ" });
            }
            const existing = await Episode.findOne({
                where: {
                    season_id: episode.season_id,
                    episode_number: episodeNumber,
                    id: { [Op.ne]: episode.id },
                },
            });
            if (existing) {
                return res.status(409).json({
                    success: false,
                    message: "Episode_number đã tồn tại trong season này",
                });
            }
            episode.episode_number = episodeNumber;
        }

        if (name !== undefined) episode.name = name ?? null;
        if (overview !== undefined) episode.overview = overview ?? null;
        if (still_url !== undefined) episode.still_url = still_url ?? null;
        if (runtime_min !== undefined) episode.runtime_min = normalizeNumber(runtime_min);
        if (access_tier !== undefined) episode.access_tier = normalizedAccessTier;

        await episode.save();
        return res.json({ success: true, data: episode });
    } catch (err) {
        console.error("updateEpisode error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

export const deleteEpisode = async (req, res) => {
    try {
        const episode = await Episode.findByPk(req.params.episodeId);
        if (!episode) {
            return res.status(404).json({ success: false, message: "Không tìm thấy episode" });
        }

        await deleteEpisodeOriginsByIds([episode.id]);
        await episode.destroy();
        return res.json({ success: true, message: "Đã xóa episode" });
    } catch (err) {
        console.error("deleteEpisode error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// ===== Managed media origins (episode multi) =====

export const listEpisodeMediaOrigins = async (req, res) => {
    try {
        const episode = await Episode.findByPk(req.params.episodeId, {
            attributes: ["id", "season_id"],
        });
        if (!episode) {
            return res.status(404).json({ success: false, message: "Không tìm thấy episode" });
        }

        const purpose = req.query.purpose ? String(req.query.purpose).toLowerCase() : null;
        if (purpose && !MEDIA_PURPOSES.has(purpose)) {
            return res.status(400).json({
                success: false,
                message: "purpose chỉ nhận content hoặc trailer",
            });
        }

        const where = { scope_type: EPISODE_SCOPE, scope_id: episode.id };
        if (purpose) where.purpose = purpose;

        const origins = await MediaOrigin.findAll({
            where,
            include: [{ model: MediaVariant }],
            order: [
                ["purpose", "ASC"],
                ["is_primary", "DESC"],
                ["updated_at", "DESC"],
                ["id", "DESC"],
                [MediaVariant, "quality", "ASC"],
            ],
        });

        const data = origins.map((origin) => mapOrigin(origin));
        return res.json({ success: true, data });
    } catch (err) {
        console.error("listEpisodeMediaOrigins error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};
