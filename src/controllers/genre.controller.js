// src/controllers/genre.controller.js
import { Genre, Title } from "../models/index.js";
import { Op } from "sequelize";

const MAX_PUBLIC_PAGE_LIMIT = 50;

// GET /api/genres - lấy tất cả thể loại
export const getGenres = async (req, res) => {
    try {
        const genres = await Genre.findAll({
            attributes: ["id", "slug", "name"],
            order: [["name", "ASC"]],
        });

        return res.status(200).json({
            success: true,
            data: genres,
        });
    } catch (error) {
        console.error("[GET /api/genres] DB ERROR:", {
            message: error.message,
            name: error.name,
            sql: error.sql,
            sqlMessage: error.parent?.sqlMessage,
            sqlState: error.parent?.sqlState,
            code: error.parent?.code,
        });

        return res.status(500).json({
            success: false,
            message: "Lỗi server khi lấy danh sách thể loại",
            error: error.parent?.sqlMessage || error.message,
        });
    }
};

// GET /api/genres/:id/movies - danh sách phim theo thể loại, hỗ trợ sỏt theo year,toprated,ibmscore.
export const getGenreMovies = async (req, res) => {
    try {
        const genreIdRaw = parseInt(req.params.id, 10);

        // ID thể loại không hợp lệ
        if (Number.isNaN(genreIdRaw) || genreIdRaw < 1) {
            return res.status(400).json({
                success: false,
                message: "ID thể loại không hợp lệ",
            });
        }

        const genreId = genreIdRaw;

        // 1. Kiểm tra genre có tồn tại không
        const genre = await Genre.findByPk(genreId, {
            attributes: ["id", "slug", "name"],
        });

        if (!genre) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy thể loại",
            });
        }

        // 2. Pagination
        const pageRaw = parseInt(req.query.page, 10);
        const limitRaw = parseInt(req.query.limit, 10);

        const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
        const limit =
            Number.isNaN(limitRaw) || limitRaw < 1
                ? 20
                : Math.min(limitRaw, MAX_PUBLIC_PAGE_LIMIT);
        const offset = (page - 1) * limit;

        // 3. Filter khác: keyword, year, type, sort
        const { keyword, year, type, sort } = req.query;

        const where = {
            is_public: true,
        };

        if (keyword) {
            where.name = { [Op.like]: `%${keyword}%` };
        }

        if (year) {
            where.release_year = year;
        }

        if (type) {
            where.type = type; // "movie" | "series"
        }

        // 4. Include genre (bắt buộc = genreId)
        const include = [
            {
                model: Genre,
                as: "genres",
                through: { attributes: [] },
                where: { id: genreId },
                attributes: ["id", "slug", "name"],
            },
        ];

        // 5. Sort
        const order = [];
        const sortKey = (sort || "").toLowerCase();

        switch (sortKey) {
            case "latest":
                order.push(["release_year", "DESC"]);
                break;
            case "toprated":
            case "top-rated":
                order.push(["imdb_score", "DESC"]);
                break;
            case "trending":
                order.push(["popularity", "DESC"]);
                break;
            default:
                order.push(["release_year", "DESC"]);
                order.push(["id", "DESC"]);
        }

        // 6. Query Title thuộc genre này
        const result = await Title.findAndCountAll({
            where,
            include,
            distinct: true,
            limit,
            offset,
            order,
            attributes: [
                "id",
                "type",
                "slug",
                "name",
                "original_name",
                "overview",
                "release_year",
                "age_rating",
                "poster_url",
                "backdrop_url",
                "imdb_score",
                "popularity",
                "access_tier",
            ],
        });

        const totalItems = result.count;
        const totalPages = Math.max(Math.ceil(totalItems / limit), 1);

        return res.status(200).json({
            success: true,
            genre, // thông tin thể loại
            data: result.rows, // danh sách phim
            pagination: {
                page,
                limit,
                totalPages,
                totalItems,
            },
        });
    } catch (error) {
        console.error("[GET /api/genres/:id/movies] DB ERROR:", {
            message: error.message,
            name: error.name,
            sql: error.sql,
            sqlMessage: error.parent?.sqlMessage,
            sqlState: error.parent?.sqlState,
            code: error.parent?.code,
        });

        return res.status(500).json({
            success: false,
            message: "Lỗi server khi lấy danh sách phim theo thể loại",
            error: error.parent?.sqlMessage || error.message,
        });
    }
};
