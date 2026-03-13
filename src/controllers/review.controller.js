// src/controllers/review.controller.js
import { Review, User, Episode, Season, Title } from "../models/index.js";

// GET /api/reviews/episode/:id?page=&limit=
export const getEpisodeReviews = async (req, res, next) => {
    try {
        const episodeId = Number(req.params.id);

        if (!Number.isInteger(episodeId) || episodeId <= 0) {
            return res.status(400).json({
                success: false,
                message: "episode id không hợp lệ",
            });
        }

        const pageRaw = parseInt(req.query.page, 10);
        // hỗ trợ cả limit và pageSize cho thống nhất
        const limitRaw =
            parseInt(req.query.limit, 10) || parseInt(req.query.pageSize, 10);

        const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
        const limit = Number.isNaN(limitRaw) || limitRaw < 1 ? 10 : limitRaw;
        const offset = (page - 1) * limit;

        const { rows, count } = await Review.findAndCountAll({
            where: { episode_id: episodeId },
            include: [
                {
                    model: User,
                    as: "user",
                    attributes: ["id", "display_name", "avatar_url"],
                },
            ],
            order: [["created_at", "DESC"]],
            offset,
            limit,
        });

        return res.json({
            success: true,
            data: rows,
            pagination: {
                page,
                limit,
                totalItems: count,
                totalPages: Math.ceil(count / limit),
            },
        });
    } catch (err) {
        next(err);
    }
};

// POST /api/reviews/episode/:id
export const createEpisodeReview = async (req, res, next) => {
    try {
        const episodeId = Number(req.params.id);
        const userId = req.user?.id;

        //  DB dùng body + is_spoiler
        const bodyRaw = req.body?.body ?? req.body?.content; // hỗ trợ FE gửi content
        const is_spoiler = req.body?.is_spoiler;

        if (!Number.isInteger(episodeId) || episodeId <= 0) {
            return res.status(400).json({
                success: false,
                message: "episode id không hợp lệ",
            });
        }

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Bạn cần đăng nhập để bình luận",
            });
        }

        if (!bodyRaw || !String(bodyRaw).trim()) {
            return res.status(400).json({
                success: false,
                message: "Nội dung review không được để trống",
            });
        }

        // Lấy episode + suy ra title_id (episode -> season -> title)
        const episode = await Episode.findByPk(episodeId, {
            attributes: ["id", "season_id"],
            include: [{ model: Season, attributes: ["title_id"] }],
        });

        if (!episode) {
            return res.status(404).json({
                success: false,
                message: "Episode không tồn tại",
            });
        }

        const titleId = episode?.Season?.title_id;
        if (!titleId) {
            return res.status(500).json({
                success: false,
                message: "Không suy ra được title_id từ episode",
            });
        }

        //  tạo review: bắt buộc có title_id theo DB mới
        const review = await Review.create({
            user_id: userId,
            title_id: titleId,
            episode_id: episodeId,
            body: String(bodyRaw).trim(),
            is_spoiler: Boolean(is_spoiler),
        });

        // lấy lại kèm info user cho FE dùng luôn
        const reviewWithUser = await Review.findByPk(review.id, {
            include: [
                {
                    model: User,
                    as: "user",
                    attributes: ["id", "display_name", "avatar_url"],
                },
            ],
        });

        return res.status(201).json({
            success: true,
            data: reviewWithUser,
        });
    } catch (err) {
        next(err);
    }
};

// GET /api/reviews/title/:id?page=&limit= (hoặc pageSize)
export const getTitleReviews = async (req, res, next) => {
    try {
        const titleId = Number(req.params.id);

        if (!Number.isInteger(titleId) || titleId <= 0) {
            return res.status(400).json({
                success: false,
                message: "title id không hợp lệ",
            });
        }

        const pageRaw = parseInt(req.query.page, 10);
        const limitRaw =
            parseInt(req.query.limit, 10) || parseInt(req.query.pageSize, 10);

        const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
        const limit = Number.isNaN(limitRaw) || limitRaw < 1 ? 10 : limitRaw;
        const offset = (page - 1) * limit;

        const { rows, count } = await Review.findAndCountAll({
            where: { title_id: titleId },
            include: [
                {
                    model: User,
                    as: "user",
                    attributes: ["id", "display_name", "avatar_url"],
                },
            ],
            order: [["created_at", "DESC"]],
            offset,
            limit,
        });

        return res.json({
            success: true,
            data: rows,
            pagination: {
                page,
                limit,
                totalItems: count,
                totalPages: Math.ceil(count / limit),
            },
        });
    } catch (err) {
        next(err);
    }
};

// POST /api/reviews/title/:id
export const createTitleReview = async (req, res, next) => {
    try {
        const titleId = Number(req.params.id);
        const userId = req.user?.id;

        const bodyRaw = req.body?.body ?? req.body?.content; // hỗ trợ FE gửi content
        const is_spoiler = req.body?.is_spoiler;

        if (!Number.isInteger(titleId) || titleId <= 0) {
            return res.status(400).json({
                success: false,
                message: "title id không hợp lệ",
            });
        }

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Bạn cần đăng nhập để bình luận",
            });
        }

        if (!bodyRaw || !String(bodyRaw).trim()) {
            return res.status(400).json({
                success: false,
                message: "Nội dung review không được để trống",
            });
        }

        // (giữ theo style cũ) check title tồn tại
        const title = await Title.findByPk(titleId);
        if (!title) {
            return res.status(404).json({
                success: false,
                message: "Title không tồn tại",
            });
        }

        const review = await Review.create({
            user_id: userId,
            title_id: titleId,
            episode_id: null,
            body: String(bodyRaw).trim(),
            is_spoiler: Boolean(is_spoiler),
        });

        const reviewWithUser = await Review.findByPk(review.id, {
            include: [
                {
                    model: User,
                    as: "user",
                    attributes: ["id", "display_name", "avatar_url"],
                },
            ],
        });

        return res.status(201).json({
            success: true,
            data: reviewWithUser,
        });
    } catch (err) {
        next(err);
    }
};
