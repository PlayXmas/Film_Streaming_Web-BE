// src/controllers/subscription.controller.js
import { Op } from "sequelize";
import { Plan, Subscription } from "../models/index.js";

/**
 * GET /api/me/subscription
 * -> Lấy gói hiện tại của user (active + chưa hết hạn)
 */
export const getMySubscription = async (req, res) => {
    try {
        const userId = req.user.id;
        const now = new Date();

        const currentSub = await Subscription.findOne({
            where: {
                user_id: userId,
                status: "active",
                ends_at: {
                    [Op.gt]: now, // chỉ lấy gói còn hạn
                },
            },
            include: [
                {
                    model: Plan,
                    foreignKey: "plan_id",
                },
            ],
            order: [["starts_at", "DESC"]],
        });

        return res.status(200).json({
            success: true,
            data: currentSub, // null => đang dùng gói free (chưa mua)
        });
    } catch (error) {
        console.error("[GET /api/me/subscription] ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi lấy gói hiện tại",
        });
    }
};

