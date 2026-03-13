// src/controllers/favorite.controller.js
import { Favorite, Title } from "../models/index.js";

export const getMyFavorites = async (req, res, next) => {
    try {
        // 1. Lấy user hiện tại từ token (middleware auth phải gắn req.user.id)
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: "Chưa đăng nhập" });
        }

        // 2. Pagination (optional)
        const pageRaw = parseInt(req.query.page, 10);
        const limitRaw = parseInt(req.query.limit, 10);

        const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
        const limit =
            Number.isNaN(limitRaw) || limitRaw < 1 || limitRaw > 100 ? 20 : limitRaw;
        const offset = (page - 1) * limit;

        // 3. Lấy danh sách favorites theo user_id (chỉ id phim + created_at)
        const { count, rows } = await Favorite.findAndCountAll({
            where: { user_id: userId },
            order: [["created_at", "DESC"]],
            offset,
            limit,
        });

        const titleIds = rows.map((fav) => fav.title_id);

        // 4. Nếu không có phim yêu thích
        if (titleIds.length === 0) {
            return res.json({
                data: [],
                pagination: {
                    total: 0,
                    page,
                    limit,
                    totalPages: 0,
                },
            });
        }

        // 5. Lấy thông tin phim tương ứng
        const titles = await Title.findAll({
            where: {
                id: titleIds,
                is_public: true,
            },
            attributes: [
                "id",
                "name",
                "slug",
                "poster_url",
                "backdrop_url",
                "type",
                "access_tier",
                "release_year",
                "imdb_score",
                "popularity",
            ],
        });

        // 6. Giữ thứ tự theo created_at (mới like đứng trước)
        const orderMap = new Map();
        rows.forEach((fav, index) => {
            orderMap.set(String(fav.title_id), index);
        });

        const sortedTitles = titles.sort(
            (a, b) =>
                orderMap.get(String(a.id)) - orderMap.get(String(b.id))
        );

        // 7. Trả về cho FE
        return res.json({
            data: sortedTitles,
            pagination: {
                total: count,
                page,
                limit,
                totalPages: Math.ceil(count / limit),
            },
        });
    } catch (err) {
        // Nếu bạn có errorMiddleware thì next(err), còn không thì dùng res.status(500) cũng được
        console.error("Error getMyFavorites:", err);
        return res.status(500).json({ message: "Lỗi server khi lấy danh sách yêu thích" });
        // hoặc: next(err);
    }
};

export const addFavorite = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: "Chưa đăng nhập" });
        }

        // Lấy titleId từ params và ép về số
        const titleIdRaw = req.params.titleId;
        const titleId = parseInt(titleIdRaw, 10);

        if (Number.isNaN(titleId) || titleId <= 0) {
            return res.status(400).json({ message: "titleId không hợp lệ" });
        }

        // 1. Kiểm tra phim có tồn tại không
        const title = await Title.findByPk(titleId);
        if (!title) {
            return res.status(404).json({ message: "Phim không tồn tại" });
        }


        if (!title.is_public) {
            return res.status(403).json({ message: "Phim này chưa public" });
        }

        // 2. Tạo bản ghi yêu thích (hoặc bỏ qua nếu đã tồn tại)
        const [favorite, created] = await Favorite.findOrCreate({
            where: {
                user_id: userId,
                title_id: titleId,
            },
            defaults: {
                created_at: new Date(),
            },
        });

        // Nếu đã tồn tại rồi
        if (!created) {
            return res.status(200).json({
                message: "Phim này đã nằm trong danh sách yêu thích",
            });
        }

        // 3. Trả về kết quả
        return res.status(201).json({
            message: "Đã thêm vào danh sách yêu thích",
            data: {
                user_id: favorite.user_id,
                title_id: favorite.title_id,
                created_at: favorite.created_at,
            },
        });
    } catch (err) {
        console.error("Error addFavorite:", err);
        return res
            .status(500)
            .json({ message: "Lỗi server khi thêm vào danh sách yêu thích" });
    }
};

export const removeFavorite = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: "Chưa đăng nhập" });
        }

        const titleIdRaw = req.params.titleId;
        const titleId = parseInt(titleIdRaw, 10);

        if (Number.isNaN(titleId) || titleId <= 0) {
            return res.status(400).json({ message: "titleId không hợp lệ" });
        }

        // Xóa record trong favorites
        const deletedCount = await Favorite.destroy({
            where: {
                user_id: userId,
                title_id: titleId,
            },
        });

        // Nếu không có gì để xóa → chưa từng like phim này
        if (deletedCount === 0) {
            return res.status(404).json({
                message: "Phim này không nằm trong danh sách yêu thích",
            });
        }

        return res.json({
            message: "Đã bỏ khỏi danh sách yêu thích",
        });
    } catch (err) {
        console.error("Error removeFavorite:", err);
        return res
            .status(500)
            .json({ message: "Lỗi server khi bỏ khỏi danh sách yêu thích" });
    }
};
