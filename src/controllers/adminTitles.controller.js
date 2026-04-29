import { Op } from "sequelize";
import { Credit, Genre, MediaOrigin, MediaVariant, Person, Title, sequelize } from "../models/index.js";
import { deleteUploadFileByUrl } from "../utils/file.util.js";

function slugify(input = "") {
    return String(input)
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 190);
}

function escapeRegExp(value = "") {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function ensureUniqueSlug(base, excludeId = null) {
    const baseSlug = base || "title";
    const where = {
        slug: {
            [Op.like]: `${baseSlug}%`,
        },
    };
    if (excludeId) where.id = { [Op.ne]: excludeId };

    const existing = await Title.findAll({
        where,
        attributes: ["slug"],
        raw: true,
    });

    if (existing.length === 0) return baseSlug;

    const taken = new Set(existing.map((row) => row.slug));
    if (!taken.has(baseSlug)) return baseSlug;

    const pattern = new RegExp(`^${escapeRegExp(baseSlug)}-(\\d+)$`);
    let maxSuffix = 1;
    for (const row of existing) {
        const match = pattern.exec(row.slug);
        if (!match) continue;
        const num = Number(match[1]);
        if (Number.isInteger(num) && num >= maxSuffix) maxSuffix = num;
    }

    const suffix = maxSuffix + 1;
    const suffixText = `-${suffix}`;
    let trimmedBase = baseSlug;
    if (trimmedBase.length + suffixText.length > 190) {
        trimmedBase = trimmedBase.slice(0, 190 - suffixText.length).replace(/-+$/g, "");
    }
    return `${trimmedBase}${suffixText}`;
}

function computeStatusFromTitle(row) {
    if (!row.is_public) return "paused";
    const year = row.release_year ? Number(row.release_year) : null;
    const currentYear = new Date().getFullYear();
    if (year && year > currentYear) return "upcoming";
    return "now_showing";
}

export const adminTitleInclude = [
    {
        model: Genre,
        as: "genres",
        through: { attributes: [] },
        attributes: ["id", "name", "slug"],
    },
];

const MEDIA_SCOPE_TYPE = "title";
const MEDIA_TITLE_TYPE = "movie";

const adminCreditAttributes = [
    "id",
    "title_id",
    "person_id",
    "credit_type",
    "role_name",
    "order_no",
];

const adminCreditInclude = [
    {
        model: Person,
        attributes: ["id", "name", "also_known_as", "avatar_url"],
    },
];

function getUploadedFileUrl(req, fieldName) {
    const files = req.files?.[fieldName];
    const file = Array.isArray(files) ? files[0] : null;
    return file ? `/uploads/titles/${file.filename}` : null;
}

function normalizeUrl(value) {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
}

function normalizeText(value) {
    if (value === undefined || value === null) return undefined;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : undefined;
}

function normalizeNullableText(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
}

function normalizeInteger(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    const num = Number(value);
    if (!Number.isInteger(num) || num < 0) return null;
    return num;
}

function normalizePersonId(value) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < 1) return null;
    return num;
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

async function findMovieForMedia(id) {
    const title = await Title.findByPk(id, { attributes: ["id", "type"] });
    if (!title || title.type !== MEDIA_TITLE_TYPE) return null;
    return title;
}

function normalizeNumber(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    const num = Number(value);
    return Number.isNaN(num) ? null : num;
}

function normalizeGenreIds(value) {
    if (value === undefined || value === null) return null;

    let raw = value;
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            try {
                raw = JSON.parse(trimmed);
            } catch {
                raw = trimmed;
            }
        }
    }

    const items = Array.isArray(raw) ? raw : String(raw).split(",");
    const ids = items
        .map((v) => Number(String(v).trim()))
        .filter((v) => Number.isInteger(v) && v > 0);

    return Array.from(new Set(ids));
}

function extractGenres(row) {
    const list = row.genres ?? row.Genres ?? [];
    if (!Array.isArray(list)) return [];
    return list.map((g) => ({
        id: g.id,
        name: g.name,
        slug: g.slug,
    }));
}

async function loadGenresForTitleIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return {};

    const rows = await Title.findAll({
        where: { id: ids },
        attributes: ["id"],
        include: adminTitleInclude,
    });

    const map = {};
    for (const row of rows) {
        map[row.id] = extractGenres(row);
    }
    return map;
}

function buildCredits(creditRows = []) {
    const cast = [];
    const crew = [];

    for (const credit of creditRows) {
        const person = credit.Person;
        if (!person) continue;

        const item = {
            id: credit.id,
            title_id: credit.title_id,
            person_id: credit.person_id,
            credit_type: credit.credit_type,
            role_name: credit.role_name ?? "",
            order_no: credit.order_no ?? null,
            person: {
                id: person.id,
                name: person.name,
                also_known_as: person.also_known_as ?? "",
                avatar_url: person.avatar_url ?? "",
            },
        };

        if (credit.credit_type === "cast") cast.push(item);
        else if (credit.credit_type === "crew") crew.push(item);
    }

    return { cast, crew };
}

function parseCreditList(list, creditType) {
    const items = [];
    const errors = [];

    list.forEach((raw, index) => {
        const personId = normalizePersonId(raw?.person_id ?? raw?.personId);
        if (!personId) {
            errors.push(`${creditType}[${index}].person_id không hợp lệ`);
            return;
        }

        const roleName = normalizeNullableText(raw?.role_name ?? raw?.roleName);

        const orderRaw = raw?.order_no ?? raw?.orderNo;
        const orderNo = normalizeInteger(orderRaw);
        if (orderRaw !== undefined && orderRaw !== null) {
            const rawText = String(orderRaw).trim();
            if (rawText !== "" && orderNo === null) {
                errors.push(`${creditType}[${index}].order_no không hợp lệ`);
                return;
            }
        }

        items.push({
            person_id: personId,
            credit_type: creditType,
            role_name: roleName ?? null,
            order_no: orderNo ?? null,
        });
    });

    return { items, errors };
}

export async function loadCreditsForTitleId(id) {
    if (!id) return { cast: [], crew: [] };

    const creditRows = await Credit.findAll({
        where: { title_id: id },
        attributes: adminCreditAttributes,
        include: adminCreditInclude,
        order: [
            ["credit_type", "ASC"],
            ["order_no", "ASC"],
            ["id", "ASC"],
        ],
    });

    return buildCredits(creditRows);
}

export function toClient(row, genresOverride, credits) {
    const genres = Array.isArray(genresOverride) ? genresOverride : extractGenres(row);
    const payload = {
        id: row.id,
        slug: row.slug,
        name: row.name,
        original_name: row.original_name ?? "",
        description: row.overview ?? "",
        overview: row.overview ?? "",
        release_year: row.release_year ?? "",
        runtime_min: row.runtime_min ?? "",
        age_rating: row.age_rating ?? "",
        imdb_id: row.imdb_id ?? "",
        imdb_score: row.imdb_score != null ? Number(row.imdb_score) : "",
        popularity: row.popularity != null ? Number(row.popularity) : "",
        country_code: row.country_code ?? "",
        original_lang: row.original_lang ?? "",
        type: row.type,
        access_tier: row.access_tier,
        is_public: !!row.is_public,
        status: computeStatusFromTitle(row),
        poster_url: row.poster_url ?? "",
        backdrop_url: row.backdrop_url ?? "",
        genres,
        genre_ids: genres.map((g) => g.id),
        created_at: row.created_at ?? row.createdAt ?? "",
        updated_at: row.updated_at ?? row.updatedAt ?? "",
    };

    if (credits !== undefined) {
        payload.credits = credits;
    }

    return payload;
}

// GET /api/admin/titles?keyword=&type=&tier=&status=&is_public=
export const listAdminTitles = async (req, res) => {
    try {
        const pageRaw = parseInt(req.query.page, 10);
        const limitRaw = parseInt(req.query.limit, 10);
        const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
        const limit = Number.isNaN(limitRaw) || limitRaw < 1 ? 50 : limitRaw;
        const offset = (page - 1) * limit;

        const { keyword, type, tier, status, is_public } = req.query;

        const where = {};

        const kw = (keyword || "").trim();
        if (kw) {
            const like = `%${kw}%`;
            const yearValue = Number(kw);
            const orConditions = [
                { name: { [Op.like]: like } },
                { slug: { [Op.like]: like } },
                { overview: { [Op.like]: like } },
                { original_name: { [Op.like]: like } },
            ];
            if (!Number.isNaN(yearValue)) {
                orConditions.push({ release_year: yearValue });
            }
            where[Op.or] = orConditions;
        }

        if (type) where.type = type;
        if (tier) where.access_tier = tier;

        if (is_public === "true") where.is_public = true;
        if (is_public === "false") where.is_public = false;

        if (status) {
            if (status === "paused") where.is_public = false;
            else where.is_public = true;
        }

        const { rows, count } = await Title.findAndCountAll({
            where,
            order: [["updated_at", "DESC"]],
            limit,
            offset,
        });

        const ids = rows.map((row) => row.id);
        const genresByTitleId = await loadGenresForTitleIds(ids);
        const data = rows.map((row) => toClient(row, genresByTitleId[row.id] || []));

        return res.json({
            success: true,
            data,
            pagination: {
                page,
                limit,
                totalItems: count,
                totalPages: Math.max(Math.ceil(count / limit), 1),
            },
        });
    } catch (err) {
        console.error("listAdminTitles error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// GET /api/admin/titles/:id
export const getAdminTitle = async (req, res) => {
    try {
        const row = await Title.findByPk(req.params.id, {
            include: adminTitleInclude,
        });
        if (!row) {
            return res.status(404).json({ success: false, message: "Không tìm thấy title" });
        }
        const credits = await loadCreditsForTitleId(row.id);
        return res.json({ success: true, data: toClient(row, null, credits) });
    } catch (err) {
        console.error("getAdminTitle error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// PUT /api/admin/titles/:id/credits
export const replaceTitleCredits = async (req, res) => {
    const t = await sequelize.transaction();
    let committed = false;
    try {
        const title = await Title.findByPk(req.params.id, { attributes: ["id"] });
        if (!title) {
            await t.rollback();
            return res.status(404).json({ success: false, message: "Không tìm thấy title" });
        }

        const body = req.body || {};
        const hasCast = Object.prototype.hasOwnProperty.call(body, "cast");
        const hasCrew = Object.prototype.hasOwnProperty.call(body, "crew");

        if (!hasCast && !hasCrew) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: "Thiếu dữ liệu cast hoặc crew",
            });
        }

        if (hasCast && !Array.isArray(body.cast)) {
            await t.rollback();
            return res.status(400).json({ success: false, message: "cast phải là mảng" });
        }
        if (hasCrew && !Array.isArray(body.crew)) {
            await t.rollback();
            return res.status(400).json({ success: false, message: "crew phải là mảng" });
        }

        const castList = hasCast ? body.cast : [];
        const crewList = hasCrew ? body.crew : [];

        const castParsed = parseCreditList(castList, "cast");
        const crewParsed = parseCreditList(crewList, "crew");
        const errors = [...castParsed.errors, ...crewParsed.errors];

        if (errors.length) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: "Dữ liệu credits không hợp lệ",
                errors,
            });
        }

        const items = [...castParsed.items, ...crewParsed.items];
        const personIds = Array.from(new Set(items.map((item) => item.person_id)));

        if (personIds.length) {
            const existing = await Person.findAll({
                where: { id: personIds },
                attributes: ["id"],
                raw: true,
                transaction: t,
            });
            const existingIds = new Set(existing.map((row) => row.id));
            const missingIds = personIds.filter((id) => !existingIds.has(id));

            if (missingIds.length) {
                await t.rollback();
                return res.status(400).json({
                    success: false,
                    message: "Person không tồn tại",
                    missing_person_ids: missingIds,
                });
            }
        }

        const replaceTypes = [];
        if (hasCast) replaceTypes.push("cast");
        if (hasCrew) replaceTypes.push("crew");

        const deleteWhere = { title_id: title.id };
        if (replaceTypes.length === 1) {
            deleteWhere.credit_type = replaceTypes[0];
        }

        await Credit.destroy({ where: deleteWhere, transaction: t });

        if (items.length) {
            const payload = items.map((item) => ({
                ...item,
                title_id: title.id,
            }));
            await Credit.bulkCreate(payload, { transaction: t });
        }

        await t.commit();
        committed = true;

        const credits = await loadCreditsForTitleId(title.id);
        return res.json({ success: true, data: credits });
    } catch (err) {
        if (!committed) {
            await t.rollback();
        }
        console.error("replaceTitleCredits error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// POST /api/admin/titles
export const createAdminTitle = async (req, res) => {
    try {
        const {
            name,
            description,
            overview,
            release_year,
            type = "movie",
            access_tier = "free",
            status,
            is_public,
            poster_url,
            backdrop_url,
            runtime_min,
            original_name,
            age_rating,
            imdb_id,
            imdb_score,
            popularity,
            country_code,
            original_lang,
            genre_ids,
            genreIds,
            genres,
        } = req.body || {};

        if (!name || !String(name).trim()) {
            return res.status(400).json({ success: false, message: "Thiếu tên phim (name)" });
        }
        if (!["movie", "series"].includes(type)) {
            return res.status(400).json({ success: false, message: "type không hợp lệ" });
        }
        if (!["free", "vip"].includes(access_tier)) {
            return res.status(400).json({ success: false, message: "access_tier không hợp lệ" });
        }

        const baseSlug = slugify(name);
        const finalSlug = await ensureUniqueSlug(baseSlug);

        const publicFlagInput = parseBoolean(is_public);
        let publicFlag = publicFlagInput !== null ? publicFlagInput : true;
        if (publicFlagInput === null && status === "paused") publicFlag = false;

        const posterFileUrl = getUploadedFileUrl(req, "poster");
        const backdropFileUrl = getUploadedFileUrl(req, "backdrop");

        const overviewInput = description ?? overview;
        const releaseYearValue = normalizeNumber(release_year);
        const runtimeValue = normalizeNumber(runtime_min);
        const imdbScoreValue = normalizeNumber(imdb_score);
        const popularityValue = normalizeNumber(popularity);

        const created = await Title.create({
            type,
            slug: finalSlug,
            name: String(name).trim(),
            original_name: original_name ?? null,
            overview: overviewInput ? String(overviewInput).trim() : null,
            release_year: releaseYearValue ?? null,
            age_rating: age_rating ?? null,
            imdb_id: imdb_id ?? null,
            imdb_score: imdbScoreValue ?? null,
            country_code: country_code ?? null,
            original_lang: original_lang ?? null,
            poster_url: posterFileUrl ?? normalizeUrl(poster_url),
            backdrop_url: backdropFileUrl ?? normalizeUrl(backdrop_url),
            runtime_min: runtimeValue ?? null,
            is_public: publicFlag,
            access_tier,
            popularity: popularityValue === undefined ? undefined : popularityValue,
        });

        const genreIdsInput = normalizeGenreIds(genre_ids ?? genreIds ?? genres);
        if (genreIdsInput !== null) {
            const idsToSet = genreIdsInput.length
                ? (
                    await Genre.findAll({
                        where: { id: genreIdsInput },
                        attributes: ["id"],
                    })
                ).map((g) => g.id)
                : [];
            await created.setGenres(idsToSet);
        }

        await created.reload({ include: adminTitleInclude });
        const credits = await loadCreditsForTitleId(created.id);
        return res.status(201).json({ success: true, data: toClient(created, null, credits) });
    } catch (err) {
        console.error("createAdminTitle error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// PUT /api/admin/titles/:id
export const updateAdminTitle = async (req, res) => {
    try {
        const row = await Title.findByPk(req.params.id);
        if (!row) {
            return res.status(404).json({ success: false, message: "Không tìm thấy title" });
        }

        const oldPosterUrl = row.poster_url;
        const oldBackdropUrl = row.backdrop_url;

        const {
            name,
            description,
            overview,
            release_year,
            type,
            access_tier,
            status,
            is_public,
            poster_url,
            backdrop_url,
            runtime_min,
            original_name,
            age_rating,
            imdb_id,
            imdb_score,
            popularity,
            country_code,
            original_lang,
            genre_ids,
            genreIds,
            genres,
        } = req.body || {};

        if (type && !["movie", "series"].includes(type)) {
            return res.status(400).json({ success: false, message: "type không hợp lệ" });
        }
        if (access_tier && !["free", "vip"].includes(access_tier)) {
            return res.status(400).json({ success: false, message: "access_tier không hợp lệ" });
        }

        const overviewInput = description ?? overview;
        const nameInput = name != null ? String(name).trim() : null;
        if (nameInput != null) row.name = nameInput;
        if (overviewInput != null) row.overview = String(overviewInput).trim();
        if (release_year !== undefined) row.release_year = normalizeNumber(release_year);
        if (type) row.type = type;
        if (access_tier) row.access_tier = access_tier;

        const posterFileUrl = getUploadedFileUrl(req, "poster");
        const backdropFileUrl = getUploadedFileUrl(req, "backdrop");

        if (posterFileUrl) row.poster_url = posterFileUrl;
        else if (poster_url !== undefined) row.poster_url = normalizeUrl(poster_url);

        if (backdropFileUrl) row.backdrop_url = backdropFileUrl;
        else if (backdrop_url !== undefined) row.backdrop_url = normalizeUrl(backdrop_url);

        if (runtime_min !== undefined) row.runtime_min = normalizeNumber(runtime_min);

        if (original_name !== undefined) row.original_name = original_name ?? null;
        if (age_rating !== undefined) row.age_rating = age_rating ?? null;
        if (imdb_id !== undefined) row.imdb_id = imdb_id ?? null;
        if (imdb_score !== undefined) row.imdb_score = normalizeNumber(imdb_score);
        if (popularity !== undefined) row.popularity = normalizeNumber(popularity);
        if (country_code !== undefined) row.country_code = country_code ?? null;
        if (original_lang !== undefined) row.original_lang = original_lang ?? null;

        if (nameInput) {
            const baseSlug = slugify(nameInput);
            if (baseSlug && baseSlug !== row.slug) {
                row.slug = await ensureUniqueSlug(baseSlug, row.id);
            }
        }

        const publicFlagInput = parseBoolean(is_public);
        if (publicFlagInput !== null) row.is_public = publicFlagInput;
        else if (status != null) row.is_public = status === "paused" ? false : true;

        await row.save();

        if (posterFileUrl && oldPosterUrl && oldPosterUrl !== posterFileUrl) {
            deleteUploadFileByUrl(oldPosterUrl).catch((err) => {
                console.warn("delete old poster failed:", err);
            });
        }

        if (backdropFileUrl && oldBackdropUrl && oldBackdropUrl !== backdropFileUrl) {
            deleteUploadFileByUrl(oldBackdropUrl).catch((err) => {
                console.warn("delete old backdrop failed:", err);
            });
        }

        const genreIdsInput = normalizeGenreIds(genre_ids ?? genreIds ?? genres);
        if (genreIdsInput !== null) {
            const idsToSet = genreIdsInput.length
                ? (
                    await Genre.findAll({
                        where: { id: genreIdsInput },
                        attributes: ["id"],
                    })
                ).map((g) => g.id)
                : [];
            await row.setGenres(idsToSet);
        }

        await row.reload({ include: adminTitleInclude });
        const credits = await loadCreditsForTitleId(row.id);
        return res.json({ success: true, data: toClient(row, null, credits) });
    } catch (err) {
        console.error("updateAdminTitle error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// DELETE /api/admin/titles/:id
export const deleteAdminTitle = async (req, res) => {
    try {
        const row = await Title.findByPk(req.params.id);
        if (!row) {
            return res.status(404).json({ success: false, message: "Không tìm thấy title" });
        }

        await row.destroy();

        return res.json({ success: true, message: "Đã xóa title" });
    } catch (err) {
        console.error("deleteAdminTitle error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// ===== Managed media origins (movie only) =====

// GET /api/admin/titles/:id/media-origins
export const listTitleMediaOrigins = async (req, res) => {
    try {
        const title = await findMovieForMedia(req.params.id);
        if (!title) {
            return res.status(404).json({ success: false, message: "Không tìm thấy movie" });
        }

        const origins = await MediaOrigin.findAll({
            where: { scope_type: MEDIA_SCOPE_TYPE, scope_id: title.id },
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
        console.error("listTitleMediaOrigins error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};
