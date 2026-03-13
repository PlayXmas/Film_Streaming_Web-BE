import { MediaOrigin, MediaVariant, Title } from "../models/index.js";
import {
    adminTitleInclude,
    createAdminTitle,
    listAdminTitles,
    loadCreditsForTitleId,
    toClient,
    updateAdminTitle,
} from "./adminTitles.controller.js";

const MOVIE_TYPE = "movie";
const PURPOSES = new Set(["content", "trailer"]);

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

function buildOriginPayload(body = {}) {
    const payload = {};

    if (body.delivery !== undefined) payload.delivery = normalizeText(body.delivery);
    if (body.audio_type !== undefined) payload.audio_type = normalizeText(body.audio_type);
    if (body.url !== undefined) payload.url = normalizeText(body.url);

    const hasSubtitles = parseBoolean(body.has_subtitles);
    if (hasSubtitles !== null) payload.has_subtitles = hasSubtitles;

    const isActive = parseBoolean(body.is_active);
    if (isActive !== null) payload.is_active = isActive;

    return payload;
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
        is_active: !!origin.is_active,
        variants: variants.map((v) => ({
            id: v.id,
            origin_id: v.origin_id,
            quality: v.quality,
            required_tier: v.required_tier,
            bitrate_kbps: v.bitrate_kbps ?? null,
        })),
    };
}

async function findMovieById(id, include) {
    return Title.findOne({
        where: { id, type: MOVIE_TYPE },
        ...(include ? { include } : {}),
    });
}

// ===== Movies (phim lẻ) =====

export const listAdminMovies = async (req, res) => {
    req.query.type = MOVIE_TYPE;
    if (req.query.q && !req.query.keyword) {
        req.query.keyword = req.query.q;
    }
    return listAdminTitles(req, res);
};

export const createAdminMovie = async (req, res) => {
    req.body = req.body || {};
    req.body.type = MOVIE_TYPE;
    return createAdminTitle(req, res);
};

export const getAdminMovieDetail = async (req, res) => {
    try {
        const row = await findMovieById(req.params.id, adminTitleInclude);
        if (!row) {
            return res.status(404).json({ success: false, message: "Không tìm thấy movie" });
        }

        const credits = await loadCreditsForTitleId(row.id);

        const origins = await MediaOrigin.findAll({
            where: { scope_type: "title", scope_id: row.id },
            include: [{ model: MediaVariant }],
            order: [
                ["purpose", "ASC"],
                ["id", "ASC"],
                [MediaVariant, "quality", "ASC"],
            ],
        });

        const media_origins = origins.map((origin) => mapOrigin(origin));

        return res.json({
            success: true,
            data: {
                ...toClient(row, null, credits),
                media_origins,
            },
        });
    } catch (err) {
        console.error("getAdminMovieDetail error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

export const updateAdminMovie = async (req, res) => {
    try {
        const movie = await findMovieById(req.params.id);
        if (!movie) {
            return res.status(404).json({ success: false, message: "Không tìm thấy movie" });
        }

        req.body = req.body || {};
        req.body.type = MOVIE_TYPE;
        return updateAdminTitle(req, res);
    } catch (err) {
        console.error("updateAdminMovie error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

export const deleteAdminMovie = async (req, res) => {
    try {
        const movie = await findMovieById(req.params.id);
        if (!movie) {
            return res.status(404).json({ success: false, message: "Không tìm thấy movie" });
        }

        const origins = await MediaOrigin.findAll({
            where: { scope_type: "title", scope_id: movie.id },
            attributes: ["id"],
            raw: true,
        });

        const originIds = origins.map((o) => o.id);
        if (originIds.length) {
            await MediaVariant.destroy({ where: { origin_id: originIds } });
            await MediaOrigin.destroy({ where: { id: originIds } });
        }

        await movie.destroy();

        return res.json({ success: true, message: "Đã xóa movie" });
    } catch (err) {
        console.error("deleteAdminMovie error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// ===== Media Origins (theo movie) =====

export const listMovieOrigins = async (req, res) => {
    try {
        const movie = await findMovieById(req.params.id);
        if (!movie) {
            return res.status(404).json({ success: false, message: "Không tìm thấy movie" });
        }

        const origins = await MediaOrigin.findAll({
            where: { scope_type: "title", scope_id: movie.id },
            include: [{ model: MediaVariant }],
            order: [
                ["purpose", "ASC"],
                ["id", "ASC"],
                [MediaVariant, "quality", "ASC"],
            ],
        });

        const data = origins.map((origin) => mapOrigin(origin));

        return res.json({ success: true, data });
    } catch (err) {
        console.error("listMovieOrigins error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

export const upsertMovieOriginByPurpose = async (req, res) => {
    try {
        const purpose = String(req.params.purpose || "").toLowerCase();
        if (!PURPOSES.has(purpose)) {
            return res.status(400).json({
                success: false,
                message: "purpose chỉ nhận content hoặc trailer",
            });
        }

        const movie = await findMovieById(req.params.id);
        if (!movie) {
            return res.status(404).json({ success: false, message: "Không tìm thấy movie" });
        }

        const payload = buildOriginPayload(req.body || {});
        const hasPayload = Object.keys(payload).length > 0;

        const where = { scope_type: "title", scope_id: movie.id, purpose };
        const existing = await MediaOrigin.findOne({ where });

        if (!existing) {
            if (!payload.delivery) {
                return res.status(400).json({
                    success: false,
                    message: "delivery là bắt buộc",
                });
            }
            if (!payload.url) {
                return res.status(400).json({
                    success: false,
                    message: "url là bắt buộc",
                });
            }

            const created = await MediaOrigin.create({ ...where, ...payload });
            const full = await MediaOrigin.findByPk(created.id, {
                include: [{ model: MediaVariant }],
            });

            return res.status(201).json({ success: true, data: mapOrigin(full) });
        }

        if (!hasPayload) {
            return res.status(400).json({
                success: false,
                message: "Không có dữ liệu cập nhật",
            });
        }

        await existing.update(payload);
        const full = await MediaOrigin.findByPk(existing.id, {
            include: [{ model: MediaVariant }],
        });

        return res.json({ success: true, data: mapOrigin(full) });
    } catch (err) {
        console.error("upsertMovieOriginByPurpose error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

export const deleteOrigin = async (req, res) => {
    try {
        const origin = await MediaOrigin.findByPk(req.params.originId);
        if (!origin) {
            return res.status(404).json({ success: false, message: "Không tìm thấy origin" });
        }

        await MediaVariant.destroy({ where: { origin_id: origin.id } });
        await origin.destroy();

        return res.json({ success: true, message: "Đã xóa origin" });
    } catch (err) {
        console.error("deleteOrigin error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// ===== Media Variants =====

export const addVariant = async (req, res) => {
    try {
        const origin = await MediaOrigin.findByPk(req.params.originId);
        if (!origin) {
            return res.status(404).json({ success: false, message: "Không tìm thấy origin" });
        }

        const { quality, required_tier, bitrate_kbps } = req.body || {};
        if (!quality) {
            return res.status(400).json({ success: false, message: "quality là bắt buộc" });
        }
        if (!required_tier) {
            return res.status(400).json({ success: false, message: "required_tier là bắt buộc" });
        }

        const created = await MediaVariant.create({
            origin_id: origin.id,
            quality,
            required_tier,
            bitrate_kbps: bitrate_kbps ?? null,
        });

        return res.status(201).json({ success: true, data: created });
    } catch (err) {
        if (err?.name === "SequelizeUniqueConstraintError") {
            return res.status(409).json({
                success: false,
                message: "Variant quality đã tồn tại trong origin này",
            });
        }
        console.error("addVariant error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

export const updateVariant = async (req, res) => {
    try {
        const variant = await MediaVariant.findByPk(req.params.id);
        if (!variant) {
            return res.status(404).json({ success: false, message: "Không tìm thấy variant" });
        }

        const { quality, required_tier, bitrate_kbps } = req.body || {};
        const payload = {};
        if (quality !== undefined) payload.quality = quality;
        if (required_tier !== undefined) payload.required_tier = required_tier;
        if (bitrate_kbps !== undefined) payload.bitrate_kbps = bitrate_kbps;

        await variant.update(payload);
        return res.json({ success: true, data: variant });
    } catch (err) {
        if (err?.name === "SequelizeUniqueConstraintError") {
            return res.status(409).json({
                success: false,
                message: "Variant quality bị trùng trong origin",
            });
        }
        console.error("updateVariant error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

export const deleteVariant = async (req, res) => {
    try {
        const variant = await MediaVariant.findByPk(req.params.id);
        if (!variant) {
            return res.status(404).json({ success: false, message: "Không tìm thấy variant" });
        }

        await variant.destroy();
        return res.json({ success: true, message: "Đã xóa variant" });
    } catch (err) {
        console.error("deleteVariant error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};
