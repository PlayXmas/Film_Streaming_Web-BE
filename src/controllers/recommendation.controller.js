// src/controllers/recommendation.controller.js
import { Op } from "sequelize";
import { UserRecommendation, Title, Genre } from "../models/index.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const parseLimit = (raw) => {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n) || n < 1) return DEFAULT_LIMIT;
    return Math.min(n, MAX_LIMIT);
};

const getAccessWhere = (isVip) => (isVip ? {} : { access_tier: "free" });

const getPopularTitles = async (limit, isVip) =>
    Title.findAll({
        where: {
            is_public: true,
            ...getAccessWhere(isVip),
        },
        include: [
            {
                model: Genre,
                as: "genres",
                through: { attributes: [] },
            },
        ],
        order: [
            ["popularity", "DESC"],
            ["imdb_score", "DESC"],
        ],
        limit,
    });

// GET /api/recommendations/personalized?limit=20
export const getPersonalizedRecommendations = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Chưa đăng nhập",
            });
        }

        const role = req.user?.role;
        const isVip = role === "vip" || role === "admin";
        const limit = parseLimit(req.query.limit);
        const fetchN = limit * 3;

        const rows = await UserRecommendation.findAll({
            where: { user_id: userId },
            attributes: ["title_id", "score"],
            order: [["score", "DESC"]],
            limit: fetchN,
            raw: true,
        });

        // cold-start: chưa có rec
        if (!rows.length) {
            const hot = await getPopularTitles(limit, isVip);
            return res.json({ success: true, data: hot });
        }

        const ids = rows.map((r) => r.title_id);

        const titles = await Title.findAll({
            where: {
                id: { [Op.in]: ids },
                is_public: true,
                ...getAccessWhere(isVip),
            },
            include: [
                {
                    model: Genre,
                    as: "genres",
                    through: { attributes: [] },
                },
            ],
        });

        if (!titles.length) {
            const hot = await getPopularTitles(limit, isVip);
            return res.json({ success: true, data: hot });
        }

        const rank = new Map(rows.map((r, idx) => [String(r.title_id), idx]));
        titles.sort(
            (a, b) =>
                (rank.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER) -
                (rank.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER)
        );

        return res.json({ success: true, data: titles.slice(0, limit) });
    } catch (err) {
        console.error("getPersonalizedRecommendations error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi lấy gợi ý cá nhân",
        });
    }
};
