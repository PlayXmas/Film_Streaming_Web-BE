// src/controllers/payment.controller.js
import { Payment, Subscription, Plan } from "../models/index.js";

export const getMyPayments = async (req, res) => {
    try {
        const userId = req.user.id;

        const payments = await Payment.findAll({
            where: { user_id: userId },
            order: [["createdAt", "DESC"]],
            include: [
                {
                    model: Subscription,
                    include: [{ model: Plan }],
                },
            ],
        });

        return res.json({ success: true, data: payments });
    } catch (err) {
        console.error("getMyPayments error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server khi lấy lịch sử thanh toán" });
    }
};
