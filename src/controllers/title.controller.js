// src/controllers/title.controller.js

import {
    Title,
    Genre,
    Credit,
    Person,
    Season,
    Episode,
    MediaOrigin,
    MediaVariant,
    Rating,
    User,
} from "../models/index.js";
import { Op } from "sequelize";

// GET /api/movies, đã có sort toprated và trending
export const getMovies = async (req, res, next) => {
    try {
        // 1. Pagination
        const pageRaw = parseInt(req.query.page, 10);
        const limitRaw = parseInt(req.query.limit, 10);

        const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
        const limit = Number.isNaN(limitRaw) || limitRaw < 1 ? 20 : limitRaw;
        const offset = (page - 1) * limit;

        // suggest mode (dùng cho dropdown search ở header)
        // gọi: /api/movies?suggest=1&keyword=...&limit=10&page=1
        const isSuggest = String(req.query.suggest || "") === "1";

        // 2. Query params
        const { keyword, year, type, genreId, sort } = req.query;

        // 3. WHERE: chỉ lấy nội dung public
        const where = {
            is_public: true,
        };

        // tìm theo tên phim
        const kw = (keyword || "").trim();
        if (kw) {
            // tìm theo cột "name" (tên phim)
            where.name = {
                [Op.like]: `%${kw}%`,
            };
        }

        // lọc theo năm phát hành
        if (year) {
            where.release_year = year;
        }

        // lọc theo type: movie / series
        if (type) {
            where.type = type; // ENUM("movie", "series")
        }

        //NEW: attributes nhẹ cho suggest (autocomplete)
        // các mode khác giữ nguyên (trả full columns như trước)
        const attributes = isSuggest
            ? [
                "id",
                "type",
                "slug",
                "name",
                "release_year",
                "poster_url",
                "backdrop_url",
                "imdb_score",
                "popularity",
                "access_tier",
            ]
            : undefined;

        // 4. Include genres
        const include = [];

        // NEW: nếu suggest thì mặc định KHÔNG join genres (nhanh hơn)
        // nhưng nếu có genreId thì vẫn join để filter đúng như cũ
        if (genreId) {
            include.push({
                model: Genre,
                as: "genres",
                through: { attributes: [] },
                where: { id: genreId },
                // suggest thì không cần trả genres về (nhẹ hơn)
                ...(isSuggest ? { attributes: [] } : {}),
            });
        } else if (!isSuggest) {
            // giữ nguyên behavior cũ: không có genreId thì vẫn include genres
            include.push({
                model: Genre,
                as: "genres",
                through: { attributes: [] },
            });
        }

        // 5. Sort
        const order = [];
        const sortKey = (sort || "").toLowerCase();

        switch (sortKey) {
            case "latest":
                order.push(["release_year", "DESC"]);
                break;
            case "toprated":
            case "top-rated":
                // dùng điểm imdb_score
                order.push(["imdb_score", "DESC"]);
                break;
            case "trending":
                // dùng độ phổ biến popularity
                order.push(["popularity", "DESC"]);
                break;
            default:
                order.push(["release_year", "DESC"]);
                order.push(["id", "DESC"]);
        }

        // 6. Query DB (find + count)
        const result = await Title.findAndCountAll({
            where,
            attributes,
            include,
            distinct: true, // để count đúng khi join nhiều bảng
            limit,
            offset,
            order,
        });

        const totalItems = result.count;
        const totalPages = Math.max(Math.ceil(totalItems / limit), 1);

        // 7. Response
        return res.status(200).json({
            success: true,
            data: result.rows,
            pagination: {
                page,
                limit,
                totalPages,
                totalItems,
            },
        });
    } catch (error) {
        console.error("[GET /api/movies] DB ERROR:", {
            message: error.message,
            name: error.name,
            sql: error.sql,
            sqlMessage: error.parent?.sqlMessage,
            sqlState: error.parent?.sqlState,
            code: error.parent?.code,
        });

        return res.status(500).json({
            success: false,
            message: "Lỗi server khi lấy danh sách phim",
            error: error.parent?.sqlMessage || error.message,
        });
    }
};



// GET /api/movies/:id?seasonId=xx - chi tiết 1 phim (title + optional season overlay)

export const getMovieDetail = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const seasonIdRaw = req.query.seasonId;
        const seasonId = seasonIdRaw ? parseInt(seasonIdRaw, 10) : null;

        if (Number.isNaN(id) || id < 1) {
            return res.status(400).json({ success: false, message: "ID phim không hợp lệ" });
        }
        if (seasonIdRaw && (Number.isNaN(seasonId) || seasonId < 1)) {
            return res.status(400).json({ success: false, message: "seasonId không hợp lệ" });
        }

        // 1) Title (public)
        const title = await Title.findOne({
            where: { id, is_public: true },
            attributes: [
                "id",
                "type",
                "slug",
                "name",
                "original_name",
                "overview",
                "release_year",
                "age_rating",
                "country_code",
                "original_lang",
                "poster_url",
                "backdrop_url",
                "imdb_score",
                "popularity",
                "access_tier",
            ],
            include: [
                {
                    model: Genre,
                    as: "genres",
                    through: { attributes: [] },
                    attributes: ["id", "name", "slug"],
                },
            ],
        });

        if (!title) {
            return res.status(404).json({ success: false, message: "Không tìm thấy phim" });
        }

        // 2) Credits riêng để tách cast/crew rõ ràng
        const creditRows = await Credit.findAll({
            where: { title_id: id },
            attributes: ["id", "person_id", "credit_type", "role_name", "order_no"],
            include: [
                {
                    model: Person,
                    attributes: ["id", "name", "avatar_url"],
                },
            ],
            order: [
                ["credit_type", "ASC"],
                ["order_no", "ASC"],
            ],
        });

        const cast = [];
        const crew = [];

        for (const c of creditRows) {
            const p = c.Person;
            if (!p) continue;

            const item = {
                id: c.id,
                person: {
                    id: p.id,
                    name: p.name,
                    avatar_url: p.avatar_url,
                },
                role_name: c.role_name,
                order_no: c.order_no,
            };

            if (c.credit_type === "cast") cast.push(item);
            else if (c.credit_type === "crew") crew.push(item);
        }

        const CAST_LIMIT = 18;
        const CREW_LIMIT = 18;

        // 3) Season overlay (chỉ khi series + truyền seasonId)
        let season = null;
        if (seasonId && title.type === "series") {
            season = await Season.findOne({
                where: { id: seasonId, title_id: id },
                attributes: ["id", "name", "overview", "poster_url", "season_number", "release_year"],
            });

            // nếu truyền seasonId nhưng không thuộc title này
            if (!season) {
                return res.status(404).json({
                    success: false,
                    message: "Season không tồn tại hoặc không thuộc title này",
                });
            }
        }

        const titleJson = title.toJSON();

        // 4) Display overlay cho FE (đỡ phải merge)
        const display = {
            name:
                season && Number(season.season_number) > 1
                    ? `${titleJson.name} - ${season.name || `Mùa ${season.season_number}`}`
                    : titleJson.name,

            poster_url: (season && season.poster_url) || titleJson.poster_url,
            overview: (season && season.overview) || titleJson.overview,
            release_year: (season && season.release_year) || titleJson.release_year,

            // backdrop thường theo title
            backdrop_url: titleJson.backdrop_url,
        };

        return res.status(200).json({
            success: true,
            data: {
                title: {
                    id: titleJson.id,
                    type: titleJson.type,
                    slug: titleJson.slug,
                    name: titleJson.name,
                    original_name: titleJson.original_name,
                    overview: titleJson.overview,
                    release_year: titleJson.release_year,
                    age_rating: titleJson.age_rating,
                    country_code: titleJson.country_code,
                    original_lang: titleJson.original_lang,
                    poster_url: titleJson.poster_url,
                    backdrop_url: titleJson.backdrop_url,
                    imdb_score: titleJson.imdb_score != null ? Number(titleJson.imdb_score) : null,
                    popularity: titleJson.popularity != null ? Number(titleJson.popularity) : null,
                    access_tier: titleJson.access_tier,
                    genres: titleJson.genres || [],
                },

                season: season
                    ? {
                        id: season.id,
                        name: season.name,
                        overview: season.overview,
                        poster_url: season.poster_url,
                        season_number: season.season_number,
                        release_year: season.release_year,
                    }
                    : null,

                display,

                credits: {
                    cast: cast.slice(0, CAST_LIMIT),
                    crew: crew.slice(0, CREW_LIMIT),
                },

                meta: {
                    requested_season_id: seasonId || null,
                    current_season_id: season?.id || null,
                    current_season_number: season?.season_number || null,
                },
            },
        });
    } catch (error) {
        console.error("[GET /api/movies/:id] ERROR:", {
            message: error.message,
            name: error.name,
            sql: error.sql || "N/A",
        });

        return res.status(500).json({
            success: false,
            message: "Lỗi server khi lấy chi tiết phim",
            error: error.message,
        });
    }
};


// GET /api/movies/:id/episodes - danh sách season + tập của 1 title 
export const getMovieEpisodes = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        if (Number.isNaN(id) || id < 1) {
            return res.status(400).json({
                success: false,
                message: "ID phim không hợp lệ",
            });
        }

        const movie = await Title.findOne({
            where: { id, is_public: true },
            attributes: ["id", "type", "slug", "name"],
        });

        if (!movie) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy phim",
            });
        }

        // Không chặn movie nữa: nếu DB có season/episode thì vẫn trả ra
        const seasons = await Season.findAll({
            where: { title_id: id },
            attributes: [
                "id",
                "title_id",
                "season_number",
                "name",
                "overview",
                "poster_url",
                "access_tier",
            ],
            include: [
                {
                    model: Episode,
                    attributes: [
                        "id",
                        "season_id",
                        "episode_number",
                        "name",
                        "overview",
                        "runtime_min",
                        "still_url",
                        "access_tier",
                    ],
                },
            ],
            order: [["season_number", "ASC"]],
        });

        const seasonsData = seasons.map((season) => {
            const s = season.toJSON();
            if (Array.isArray(s.Episodes)) {
                s.Episodes.sort((a, b) => a.episode_number - b.episode_number);
            }
            return s;
        });

        return res.status(200).json({
            success: true,
            data: {
                titleId: movie.id,
                titleName: movie.name,
                type: movie.type,
                slug: movie.slug,
                seasons: seasonsData,
            },
        });
    } catch (error) {
        console.error("[GET /api/movies/:id/episodes] DB ERROR:", {
            message: error.message,
            name: error.name,
            sql: error.sql,
            sqlMessage: error.parent?.sqlMessage,
            sqlState: error.parent?.sqlState,
            code: error.parent?.code,
        });

        return res.status(500).json({
            success: false,
            message: "Lỗi server khi lấy danh sách tập phim",
            error: error.parent?.sqlMessage || error.message,
        });
    }
};



// GET /api/titles/:id/media?seasonId=xx&episodeNumber=yy
export const getTitleMedia = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        if (Number.isNaN(id) || id < 1) {
            return res.status(400).json({
                success: false,
                message: "ID title không hợp lệ",
            });
        }

        // tránh crash khi thiếu auth middleware
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Bạn cần đăng nhập để xem nội dung này",
            });
        }

        // 1) Lấy user tier
        const user = await User.findByPk(userId, { attributes: ["id", "role"] });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Bạn cần đăng nhập để xem nội dung này",
            });
        }

        const userTier = user.role === "vip" || user.role === "admin" ? "vip" : "free";

        // 2) Lấy title
        const title = await Title.findOne({
            where: { id, is_public: true },
            attributes: [
                "id",
                "type",
                "slug",
                "name",
                "access_tier",
                "age_rating",
                "poster_url",
                "backdrop_url",
            ],
        });

        if (!title) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy title",
            });
        }

        // 3) Check quyền theo access_tier của title
        if (title.access_tier === "vip" && userTier !== "vip") {
            return res.status(403).json({
                success: false,
                message: "Bạn cần nâng cấp gói VIP để xem nội dung này",
            });
        }

        // 4) Resolve scope cho movie/series
        let scopeType = "title";
        let scopeId = id;
        let resolvedEpisode = null;

        if (title.type === "series") {
            const seasonId = parseInt(req.query.seasonId, 10);
            const episodeNumber = parseInt(req.query.episodeNumber, 10);

            if (Number.isNaN(seasonId) || seasonId < 1) {
                return res.status(400).json({
                    success: false,
                    message: "seasonId không hợp lệ",
                });
            }

            if (Number.isNaN(episodeNumber) || episodeNumber < 1) {
                return res.status(400).json({
                    success: false,
                    message: "episodeNumber không hợp lệ",
                });
            }

            const season = await Season.findOne({
                where: { id: seasonId, title_id: id },
                attributes: ["id", "title_id", "access_tier"],
            });

            if (!season) {
                return res.status(404).json({
                    success: false,
                    message: "Season không tồn tại hoặc không thuộc title này",
                });
            }

            // (tuỳ bạn) check thêm tier ở season
            if (season.access_tier === "vip" && userTier !== "vip") {
                return res.status(403).json({
                    success: false,
                    message: "Bạn cần nâng cấp gói VIP để xem season này",
                });
            }

            const episode = await Episode.findOne({
                where: { season_id: seasonId, episode_number: episodeNumber },
                attributes: ["id", "season_id", "episode_number", "access_tier"],
            });

            if (!episode) {
                return res.status(404).json({
                    success: false,
                    message: "Episode không tồn tại",
                });
            }

            if (episode.access_tier === "vip" && userTier !== "vip") {
                return res.status(403).json({
                    success: false,
                    message: "Bạn cần nâng cấp gói VIP để xem tập này",
                });
            }

            scopeType = "episode";
            scopeId = episode.id;

            resolvedEpisode = {
                id: episode.id,
                season_id: episode.season_id,
                episode_number: episode.episode_number,
            };
        }

        // 5) Lấy media origins theo scope
        const origins = await MediaOrigin.findAll({
            where: {
                scope_type: scopeType, // title | episode
                scope_id: scopeId,
                purpose: "content",
                is_active: true,
            },
            include: [
                {
                    model: MediaVariant,
                    attributes: ["id", "quality", "required_tier", "bitrate_kbps"],
                },
            ],
            order: [
                ["is_primary", "DESC"],
                ["updated_at", "DESC"],
                ["id", "DESC"],
            ],
        });

        if (!origins || origins.length === 0) {
            return res.status(404).json({
                success: false,
                message:
                    scopeType === "episode"
                        ? "Episode này chưa được cấu hình nguồn media"
                        : "Title này chưa được cấu hình nguồn media",
            });
        }

        // 6) Filter variant theo quyền user
        const media = origins.map((originInstance) => {
            const origin = originInstance.toJSON();

            const allowedVariants = (origin.MediaVariants || []).filter((v) => {
                if (v.required_tier === "free") return true;
                return userTier === "vip";
            });

            return {
                id: origin.id,
                scopeType: origin.scope_type,
                delivery: origin.delivery,
                audioType: origin.audio_type,
                hasSubtitles: origin.has_subtitles,
                url: origin.url,
                variants: allowedVariants.map((v) => ({
                    id: v.id,
                    quality: v.quality,
                    requiredTier: v.required_tier,
                    bitrateKbps: v.bitrate_kbps,
                })),
            };
        });

        return res.status(200).json({
            success: true,
            data: {
                title,
                episode: resolvedEpisode, // null nếu movie
                media,
            },
        });
    } catch (error) {
        console.error("[GET /api/titles/:id/media] DB ERROR:", {
            message: error.message,
            name: error.name,
            sql: error.sql,
            sqlMessage: error.parent?.sqlMessage,
            sqlState: error.parent?.sqlState,
            code: error.parent?.code,
        });

        return res.status(500).json({
            success: false,
            message: "Lỗi server khi lấy nguồn media cho title",
            error: error.parent?.sqlMessage || error.message,
        });
    }
};

// GET /api/titles/:id/play?episodeId=xx&purpose=content|trailer
export const getTitlePlay = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id) || id < 1) {
            return res.status(400).json({
                success: false,
                message: "ID title không hợp lệ",
            });
        }

        const purpose = String(req.query.purpose || "content").toLowerCase();
        if (!["content", "trailer"].includes(purpose)) {
            return res.status(400).json({
                success: false,
                message: "purpose chỉ nhận content hoặc trailer",
            });
        }

        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Bạn cần đăng nhập để xem nội dung này",
            });
        }

        const user = await User.findByPk(userId, { attributes: ["id", "role"] });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Bạn cần đăng nhập để xem nội dung này",
            });
        }

        const userTier = user.role === "vip" || user.role === "admin" ? "vip" : "free";

        const title = await Title.findOne({
            where: { id, is_public: true },
            attributes: ["id", "type", "slug", "name", "access_tier"],
        });
        if (!title) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy title",
            });
        }

        if (title.access_tier === "vip" && userTier !== "vip") {
            return res.status(403).json({
                success: false,
                message: "Bạn cần nâng cấp gói VIP để xem nội dung này",
            });
        }

        let scopeType = "title";
        let scopeId = id;
        let resolvedEpisode = null;

        if (title.type === "series" && purpose !== "trailer") {
            let episode = null;

            if (req.query.episodeId) {
                const episodeId = parseInt(req.query.episodeId, 10);
                if (Number.isNaN(episodeId) || episodeId < 1) {
                    return res.status(400).json({
                        success: false,
                        message: "episodeId không hợp lệ",
                    });
                }

                episode = await Episode.findOne({
                    where: { id: episodeId },
                    attributes: ["id", "season_id", "episode_number", "access_tier"],
                    include: [{ model: Season, attributes: ["id", "title_id", "access_tier"] }],
                });
                if (!episode || episode.Season?.title_id !== id) {
                    return res.status(404).json({
                        success: false,
                        message: "Episode không tồn tại hoặc không thuộc title này",
                    });
                }
            } else {
                const seasonId = parseInt(req.query.seasonId, 10);
                const episodeNumber = parseInt(req.query.episodeNumber, 10);

                if (Number.isNaN(seasonId) || seasonId < 1) {
                    return res.status(400).json({
                        success: false,
                        message: "seasonId không hợp lệ",
                    });
                }

                if (Number.isNaN(episodeNumber) || episodeNumber < 1) {
                    return res.status(400).json({
                        success: false,
                        message: "episodeNumber không hợp lệ",
                    });
                }

                const season = await Season.findOne({
                    where: { id: seasonId, title_id: id },
                    attributes: ["id", "title_id", "access_tier"],
                });
                if (!season) {
                    return res.status(404).json({
                        success: false,
                        message: "Season không tồn tại hoặc không thuộc title này",
                    });
                }

                if (season.access_tier === "vip" && userTier !== "vip") {
                    return res.status(403).json({
                        success: false,
                        message: "Bạn cần nâng cấp gói VIP để xem season này",
                    });
                }

                episode = await Episode.findOne({
                    where: { season_id: seasonId, episode_number: episodeNumber },
                    attributes: ["id", "season_id", "episode_number", "access_tier"],
                });
                if (!episode) {
                    return res.status(404).json({
                        success: false,
                        message: "Episode không tồn tại",
                    });
                }
            }

            if (episode?.Season?.access_tier === "vip" && userTier !== "vip") {
                return res.status(403).json({
                    success: false,
                    message: "Bạn cần nâng cấp gói VIP để xem season này",
                });
            }

            if (episode?.access_tier === "vip" && userTier !== "vip") {
                return res.status(403).json({
                    success: false,
                    message: "Bạn cần nâng cấp gói VIP để xem tập này",
                });
            }

            scopeType = "episode";
            scopeId = episode.id;
            resolvedEpisode = {
                id: episode.id,
                season_id: episode.season_id,
                episode_number: episode.episode_number,
            };
        }

        const origins = await MediaOrigin.findAll({
            where: {
                scope_type: scopeType,
                scope_id: scopeId,
                purpose,
                is_active: true,
            },
            include: [
                {
                    model: MediaVariant,
                    attributes: ["id", "quality", "required_tier", "bitrate_kbps"],
                },
            ],
            order: [
                ["is_primary", "DESC"],
                ["updated_at", "DESC"],
                ["id", "DESC"],
                [MediaVariant, "quality", "ASC"],
            ],
        });

        if (!origins || origins.length === 0) {
            return res.status(404).json({
                success: false,
                message:
                    scopeType === "episode"
                        ? "Episode này chưa được cấu hình nguồn media"
                        : "Title này chưa được cấu hình nguồn media",
            });
        }

        const origin = origins[0].toJSON();
        const allowedVariants = (origin.MediaVariants || []).filter((v) => {
            if (v.required_tier === "free") return true;
            return userTier === "vip";
        });

        let defaultQuality = null;
        if (allowedVariants.length) {
            const freeVariant = allowedVariants.find((v) => v.required_tier === "free");
            defaultQuality = (freeVariant || allowedVariants[0]).quality;
        }

        return res.status(200).json({
            success: true,
            data: {
                delivery: origin.delivery,
                url: origin.url,
                origin_id: origin.id,
                provider: origin.provider ?? null,
                variants: allowedVariants.map((v) => ({
                    quality: v.quality,
                    required_tier: v.required_tier,
                    bitrate_kbps: v.bitrate_kbps ?? null,
                })),
                default_quality: defaultQuality,
                episode: resolvedEpisode,
            },
        });
    } catch (error) {
        console.error("[GET /api/titles/:id/play] DB ERROR:", {
            message: error.message,
            name: error.name,
            sql: error.sql,
            sqlMessage: error.parent?.sqlMessage,
            sqlState: error.parent?.sqlState,
            code: error.parent?.code,
        });

        return res.status(500).json({
            success: false,
            message: "Lỗi server khi lấy nguồn phát cho title",
            error: error.parent?.sqlMessage || error.message,
        });
    }
};




export const getTitleTrailer = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        if (Number.isNaN(id) || id < 1) {
            return res.status(400).json({
                success: false,
                message: "ID title không hợp lệ",
            });
        }

        // kiểm tra title tồn tại
        const title = await Title.findOne({
            where: { id, is_public: true },
            attributes: ["id", "name", "slug", "type"],
        });

        if (!title) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy title",
            });
        }

        const origins = await MediaOrigin.findAll({
            where: {
                scope_type: "title",
                scope_id: id,
                purpose: "trailer",   // <--- trailer
                is_active: true,
            },
            include: [
                {
                    model: MediaVariant,
                    attributes: ["id", "quality", "required_tier", "bitrate_kbps"],
                },
            ],
            order: [
                ["is_primary", "DESC"],
                ["updated_at", "DESC"],
                ["id", "DESC"],
            ],
        });

        if (!origins || origins.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Title này chưa có trailer",
            });
        }

        const trailers = origins.map((originInstance) => {
            const origin = originInstance.toJSON();
            return {
                id: origin.id,
                delivery: origin.delivery,
                audioType: origin.audio_type,
                hasSubtitles: origin.has_subtitles,
                url: origin.url,
                variants: (origin.MediaVariants || []).map((v) => ({
                    id: v.id,
                    quality: v.quality,
                    requiredTier: v.required_tier,
                    bitrateKbps: v.bitrate_kbps,
                })),
            };
        });

        return res.status(200).json({
            success: true,
            data: {
                title,
                trailers,
            },
        });
    } catch (error) {
        console.error("[GET /api/titles/:id/trailer] DB ERROR:", {
            message: error.message,
            name: error.name,
            sql: error.sql,
            sqlMessage: error.parent?.sqlMessage,
            sqlState: error.parent?.sqlState,
            code: error.parent?.code,
        });

        return res.status(500).json({
            success: false,
            message: "Lỗi server khi lấy trailer",
            error: error.parent?.sqlMessage || error.message,
        });
    }
};


/**
 * GET /api/titles/:id/cast
 * Lấy toàn bộ danh sách diễn viên (actor) của 1 phim
 */
export const getTitleCast = async (req, res) => {
    try {
        const titleId = req.params.id;

        // 1. Kiểm tra phim có tồn tại không
        const title = await Title.findByPk(titleId);
        if (!title) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy phim",
            });
        }

        // 2. Lấy danh sách credit type = 'cast' + join với Person
        const credits = await Credit.findAll({
            where: {
                title_id: titleId,
                credit_type: "cast",
            },
            include: [
                {
                    model: Person,
                    attributes: ["id", "name", "also_known_as", "avatar_url"],
                },
            ],
            order: [["order_no", "ASC"]], // diễn viên chính xuất hiện trước
        });

        // 3. Map ra data gọn cho FE
        const actors = credits.map((credit) => ({
            id: credit.Person.id,
            name: credit.Person.name,
            also_known_as: credit.Person.also_known_as,
            avatar_url: credit.Person.avatar_url,
            role_name: credit.role_name, // tên nhân vật
            order_no: credit.order_no,
        }));

        return res.json({
            success: true,
            data: actors,
        });
    } catch (err) {
        console.error("getTitleCast error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi lấy danh sách diễn viên của phim",
        });
    }
};

// POST /api/titles/:id/rating
export const rateTitle = async (req, res, next) => {
    try {
        const titleId = Number(req.params.id);
        const userId = req.user?.id; // lấy từ auth middleware
        const { score } = req.body;

        if (!Number.isInteger(titleId) || titleId <= 0) {
            return res.status(400).json({
                success: false,
                message: "title id không hợp lệ",
            });
        }

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Bạn cần đăng nhập để chấm điểm",
            });
        }

        if (score === undefined || score === null) {
            return res.status(400).json({
                success: false,
                message: "Score là bắt buộc",
            });
        }

        const numericScore = Number(score);
        // Bạn muốn 1–5 nên check kỹ ở đây
        if (
            Number.isNaN(numericScore) ||
            numericScore < 1 ||
            numericScore > 5
        ) {
            return res.status(400).json({
                success: false,
                message: "Score phải là số nguyên từ 1 đến 5",
            });
        }

        // kiểm tra title tồn tại
        const title = await Title.findByPk(titleId);
        if (!title) {
            return res.status(404).json({
                success: false,
                message: "Title không tồn tại",
            });
        }

        // Rating có PK (user_id, title_id) nên dùng upsert
        await Rating.upsert({
            user_id: userId,
            title_id: titleId,
            score: numericScore,
            rated_at: new Date(),
        });

        return res.json({
            success: true,
            message: "Chấm điểm thành công",
        });
    } catch (err) {
        next(err);
    }
};

// GET /api/titles/:id/rating-summary
export const getTitleRatingSummary = async (req, res, next) => {
    try {
        const titleId = Number(req.params.id);
        const userId = req.user?.id || null;

        if (!Number.isInteger(titleId) || titleId <= 0) {
            return res.status(400).json({
                success: false,
                message: "title id không hợp lệ",
            });
        }

        // kiểm tra title tồn tại
        const title = await Title.findByPk(titleId, {
            attributes: ["id", "name"],
        });

        if (!title) {
            return res.status(404).json({
                success: false,
                message: "Title không tồn tại",
            });
        }

        // avg + total
        const stats = await Rating.findOne({
            where: { title_id: titleId },
            attributes: [
                [Rating.sequelize.fn("AVG", Rating.sequelize.col("score")), "avgScore"],
                [Rating.sequelize.fn("COUNT", Rating.sequelize.col("score")), "totalRatings"],
            ],
            raw: true,
        });

        // breakdown counts theo score (1..5)
        const rows = await Rating.findAll({
            where: { title_id: titleId },
            attributes: [
                "score",
                [Rating.sequelize.fn("COUNT", Rating.sequelize.col("score")), "count"],
            ],
            group: ["score"],
            raw: true,
        });

        const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        rows.forEach((r) => {
            const s = Number(r.score);
            const c = Number(r.count || 0);
            if (s >= 1 && s <= 5) counts[s] = c;
        });

        // myRating (nếu login)
        let myRating = null;
        if (userId) {
            const r = await Rating.findOne({
                where: { user_id: userId, title_id: titleId },
                attributes: ["score"],
                raw: true,
            });
            myRating = r ? Number(r.score) : null;
        }

        const average = stats?.avgScore ? Number(Number(stats.avgScore).toFixed(1)) : 0;
        const total = Number(stats?.totalRatings || 0);

        return res.json({
            success: true,
            data: {
                titleId: title.id,
                titleName: title.name,
                average,
                total,
                counts,
                myRating,
            },
        });
    } catch (err) {
        next(err);
    }
};

// POST /api/titles/episode/:id/view
export const increaseEpisodeView = async (req, res, next) => {
    try {
        const episodeId = Number(req.params.id);

        if (!Number.isInteger(episodeId) || episodeId <= 0) {
            return res.status(400).json({
                success: false,
                message: "episode id không hợp lệ",
            });
        }

        // kiểm tra episode tồn tại
        const episode = await Episode.findByPk(episodeId);
        if (!episode) {
            return res.status(404).json({
                success: false,
                message: "Episode không tồn tại",
            });
        }

        // tăng view_count lên 1
        await Episode.increment("view_count", {
            by: 1,
            where: { id: episodeId },
        });

        // lấy lại giá trị mới (nếu FE cần)
        const updated = await Episode.findByPk(episodeId, {
            attributes: ["id", "season_id", "episode_number", "view_count"],
        });

        return res.json({
            success: true,
            message: "Tăng lượt xem thành công",
            data: updated,
        });
    } catch (err) {
        next(err);
    }
};
