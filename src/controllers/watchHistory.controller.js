// src/controllers/watchHistory.controller.js
import { WatchHistory, Title, Episode } from "../models/index.js";
import { Op } from "sequelize";

/**
 * PUT /api/me/watch-history
 * Body:
 * {
 *   "titleId": 1,
 *   "episodeId": 10,   // optional, null nếu movie
 *   "currentTime": 523, // giây
 *   "duration": 1800,   // giây
 *   "isFinished": false // optional
 * }
 */
export const updateMyWatchHistory = async (req, res) => {
    try {
        const userId = req.user?.id; // lấy từ auth.middleware
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Chưa đăng nhập",
            });
        }

        const { titleId, episodeId, currentTime, duration, isFinished } = req.body;

        if (!titleId || currentTime == null || !duration) {
            return res.status(400).json({
                success: false,
                message: "titleId, currentTime, duration là bắt buộc",
            });
        }

        const titleIdNum = Number(titleId);
        const episodeIdNum = episodeId ? Number(episodeId) : null;
        const currentTimeNum = Number(currentTime);
        const durationNum = Number(duration);

        if (
            Number.isNaN(titleIdNum) ||
            (episodeId && Number.isNaN(episodeIdNum)) ||
            Number.isNaN(currentTimeNum) ||
            Number.isNaN(durationNum)
        ) {
            return res.status(400).json({
                success: false,
                message: "Giá trị số không hợp lệ",
            });
        }

        const progressPercent = Math.min(
            100,
            Math.max(0, Math.round((currentTimeNum / durationNum) * 100))
        );

        const finished =
            typeof isFinished === "boolean" ? isFinished : progressPercent >= 90;

        const now = new Date();

        // Giả định các cột trong bảng watch_history:
        // user_id, title_id, episode_id, current_time_sec, duration_sec,
        // progress_percent, is_finished, last_watched_at
        const where = {
            user_id: userId,
            title_id: titleIdNum,
            episode_id: episodeIdNum ?? null,
        };

        let record = await WatchHistory.findOne({ where });

        if (!record) {
            record = await WatchHistory.create({
                user_id: userId,
                title_id: titleIdNum,
                episode_id: episodeIdNum ?? null,
                current_time_sec: currentTimeNum,
                duration_sec: durationNum,
                progress_percent: progressPercent,
                is_finished: finished,
                last_watched_at: now,
            });
        } else {
            await record.update({
                current_time_sec: currentTimeNum,
                duration_sec: durationNum,
                progress_percent: progressPercent,
                is_finished: finished,
                last_watched_at: now,
            });
        }

        return res.status(200).json({
            success: true,
            data: record,
        });
    } catch (error) {
        console.error("[PUT /api/me/watch-history] DB ERROR:", {
            message: error.message,
            name: error.name,
            sql: error.sql,
            sqlMessage: error.parent?.sqlMessage,
            sqlState: error.parent?.sqlState,
            code: error.parent?.code,
        });

        return res.status(500).json({
            success: false,
            message: "Lỗi server khi cập nhật lịch sử xem",
            error: error.parent?.sqlMessage || error.message,
        });
    }
};

/**
 * GET /api/me/watch-history
 * Query:
 *  - type = continue | finished | all (default: all)
 *  - page, limit
 *  - titleId (optional, để WatchPage lấy riêng 1 phim)
 */
export const getMyWatchHistory = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Chưa đăng nhập",
            });
        }

        const type = (req.query.type || "all").toLowerCase();
        const titleIdRaw = req.query.titleId;

        // Pagination
        const pageRaw = parseInt(req.query.page, 10);
        const limitRaw = parseInt(req.query.limit, 10);

        const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
        const limit = Number.isNaN(limitRaw) || limitRaw < 1 ? 20 : limitRaw;
        const offset = (page - 1) * limit;

        const where = {
            user_id: userId,
        };

        if (titleIdRaw) {
            const titleId = parseInt(titleIdRaw, 10);
            if (!Number.isNaN(titleId)) {
                where.title_id = titleId;
            }
        }

        if (type === "continue") {
            // chưa xem xong, đã xem >= 5%
            where.is_finished = false;
            where.progress_percent = {
                [Op.gte]: 5,
            };
        } else if (type === "finished") {
            where.is_finished = true;
        }

        const result = await WatchHistory.findAndCountAll({
            where,
            include: [
                {
                    model: Title,
                    attributes: [
                        "id",
                        "type",
                        "slug",
                        "name",
                        "poster_url",
                        "backdrop_url",
                        "access_tier",
                    ],
                },
                {
                    model: Episode,
                    attributes: [
                        "id",
                        "season_id",
                        "episode_number",
                        "name",
                        "still_url",
                        "runtime_min",
                    ],
                },
            ],
            order: [["last_watched_at", "DESC"]],
            limit,
            offset,
        });

        const totalItems = result.count;
        const totalPages = Math.max(Math.ceil(totalItems / limit), 1);

        return res.status(200).json({
            success: true,
            data: result.rows,
            pagination: {
                page,
                limit,
                totalItems,
                totalPages,
            },
        });
    } catch (error) {
        console.error("[GET /api/me/watch-history] DB ERROR:", {
            message: error.message,
            name: error.name,
            sql: error.sql,
            sqlMessage: error.parent?.sqlMessage,
            sqlState: error.parent?.sqlState,
            code: error.parent?.code,
        });

        return res.status(500).json({
            success: false,
            message: "Lỗi server khi lấy lịch sử xem",
            error: error.parent?.sqlMessage || error.message,
        });
    }
};

// DELETE /api/user/watch-history/:id  - xóa 1 dòng history của chính user
export const deleteMyWatchHistoryItem = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Chưa đăng nhập",
            });
        }

        const historyId = parseInt(req.params.id, 10);
        if (Number.isNaN(historyId) || historyId < 1) {
            return res.status(400).json({
                success: false,
                message: "ID history không hợp lệ",
            });
        }

        // chỉ xóa record thuộc về user hiện tại
        const record = await WatchHistory.findOne({
            where: {
                id: historyId,
                user_id: userId,
            },
        });

        if (!record) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy lịch sử xem tương ứng",
            });
        }

        await record.destroy();

        return res.status(200).json({
            success: true,
            message: "Đã xóa lịch sử xem",
        });
    } catch (error) {
        console.error("[DELETE /api/user/watch-history/:id] DB ERROR:", {
            message: error.message,
            name: error.name,
            sql: error.sql,
            sqlMessage: error.parent?.sqlMessage,
            sqlState: error.parent?.sqlState,
            code: error.parent?.code,
        });

        return res.status(500).json({
            success: false,
            message: "Lỗi server khi xóa lịch sử xem",
            error: error.parent?.sqlMessage || error.message,
        });
    }
};

/**
 * DELETE /api/user/watch-history
 * Query optional:
 *   - titleId: nếu gửi -> xóa lịch sử của 1 phim (và các tập thuộc phim đó)
 *   - nếu không gửi -> xóa toàn bộ lịch sử của user
 */
export const clearMyWatchHistory = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Chưa đăng nhập",
            });
        }

        const where = { user_id: userId };

        const titleIdRaw = req.query.titleId;
        if (titleIdRaw) {
            const titleId = parseInt(titleIdRaw, 10);
            if (!Number.isNaN(titleId)) {
                where.title_id = titleId;
            }
        }

        const deletedCount = await WatchHistory.destroy({ where });

        return res.status(200).json({
            success: true,
            message: "Đã xóa lịch sử xem",
            deleted: deletedCount,
        });
    } catch (error) {
        console.error("[DELETE /api/user/watch-history] DB ERROR:", {
            message: error.message,
            name: error.name,
            sql: error.sql,
            sqlMessage: error.parent?.sqlMessage,
            sqlState: error.parent?.sqlState,
            code: error.parent?.code,
        });

        return res.status(500).json({
            success: false,
            message: "Lỗi server khi xóa lịch sử xem",
            error: error.parent?.sqlMessage || error.message,
        });
    }
};
