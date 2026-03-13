// src/controllers/person.controller.js
import { Person, Title, Credit } from "../models/index.js";

/**
 * GET /api/people/:id
 * Lấy info 1 diễn viên
 */
export const getPersonById = async (req, res) => {
    try {
        const id = req.params.id;

        const person = await Person.findByPk(id);

        if (!person) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy diễn viên",
            });
        }

        return res.json({
            success: true,
            data: person,
        });
    } catch (err) {
        console.error("getPersonById error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi lấy thông tin diễn viên",
        });
    }
};

/**
 * GET /api/people/:id/titles
 * Lấy danh sách phim mà diễn viên đó tham gia (cast)
 * Hỗ trợ phân trang: ?page=1&limit=20
 */
export const getPersonTitles = async (req, res) => {
    try {
        const personId = req.params.id;

        // 1. Check diễn viên tồn tại
        const person = await Person.findByPk(personId);
        if (!person) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy diễn viên",
            });
        }

        // 2. Pagination
        const pageRaw = parseInt(req.query.page, 10);
        const limitRaw = parseInt(req.query.limit, 10);

        const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
        const limit = Number.isNaN(limitRaw) || limitRaw < 1 ? 20 : limitRaw;
        const offset = (page - 1) * limit;

        // 3. Lấy danh sách phim có personId trong bảng credits (chỉ lấy cast)
        const { rows, count } = await Title.findAndCountAll({
            include: [
                {
                    model: Credit,
                    attributes: ["id", "credit_type", "role_name", "order_no"],
                    where: {
                        person_id: personId,
                        credit_type: "cast",
                    },
                },
            ],
            order: [
                ["popularity", "DESC"],
                ["release_year", "DESC"],
            ],
            limit,
            offset,
        });

        return res.json({
            success: true,
            data: rows,
            pagination: {
                total: count,
                page,
                limit,
                totalPages: Math.ceil(count / limit),
            },
        });
    } catch (err) {
        console.error("getPersonTitles error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi lấy danh sách phim của diễn viên",
        });
    }
};

/**
 * GET /api/person/people
 * Query: page, limit, keyword
 */
export const getPeople = async (req, res) => {
    try {
        // 1) Search
        const keyword = String(req.query.keyword || "").trim();

        // 2) Pagination (đúng style bạn muốn)
        const pageRaw = parseInt(req.query.page, 10);
        const limitRaw = parseInt(req.query.limit, 10);

        const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
        const limit = Number.isNaN(limitRaw) || limitRaw < 1 ? 20 : limitRaw;
        const offset = (page - 1) * limit;

        // 3) Where
        const where = {};
        if (keyword) {
            where[Op.or] = [
                { name: { [Op.like]: `%${keyword}%` } },
                { also_known_as: { [Op.like]: `%${keyword}%` } },
                { description: { [Op.like]: `%${keyword}%` } },
            ];
        }

        // 4) Query
        const { rows, count } = await Person.findAndCountAll({
            where,
            limit,
            offset,
            order: [["id", "DESC"]],
            attributes: ["id", "name", "description", "avatar_url"],
        });

        const totalPages = Math.max(Math.ceil(count / limit), 1);

        return res.json({
            success: true,
            data: rows,
            pagination: {
                page,
                limit,
                total: count,
                totalPages,
            },
        });
    } catch (err) {
        console.error("getPeople error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi lấy danh sách diễn viên",
        });
    }
};

