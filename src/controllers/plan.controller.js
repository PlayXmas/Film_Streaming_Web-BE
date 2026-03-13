// src/controllers/plan.controller.js
import { Plan } from "../models/index.js";

/**
 * GET /api/plans
 * Public: trả list plan để FE render
 */
export const getPlans = async (req, res) => {
    try {
        const plans = await Plan.findAll({
            order: [["duration_days", "ASC"]],
        });

        return res.status(200).json({
            success: true,
            data: plans,
        });
    } catch (err) {
        console.error("getPlans error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi lấy danh sách gói",
        });
    }
};
