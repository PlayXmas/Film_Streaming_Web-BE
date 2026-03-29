// src/controllers/subscription.controller.js
import { Op } from "sequelize";
import { sequelize, Plan, Subscription, User, Payment } from "../models/index.js";
import { grantVipToUser } from "../services/subscriptionAccess.service.js";

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

/**
 * POST /api/users/subscription
 * Body: { planId: number }
 * -> Không cần payment, click là đổi gói luôn
 */
export const changeMySubscription = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const userId = req.user.id;
        const { planId, method = "momo" } = req.body;

        if (!planId) {
            await t.rollback();
            return res.status(400).json({ success: false, message: "Thiếu planId" });
        }

        // 1) check plan
        const plan = await Plan.findByPk(planId, { transaction: t });
        if (!plan) {
            await t.rollback();
            return res.status(404).json({ success: false, message: "Gói không tồn tại" });
        }

        const now = new Date();
        const endsAt = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);

        // 2) nếu đang active -> expired
        const currentSub = await Subscription.findOne({
            where: {
                user_id: userId,
                status: "active",
                ends_at: { [Op.gt]: now },
            },
            order: [["starts_at", "DESC"]],
            transaction: t,
        });

        if (currentSub && currentSub.plan_id === Number(planId)) {
            await t.rollback();
            return res.status(400).json({ success: false, message: "Bạn đang sử dụng gói này rồi" });
        }

        if (currentSub) {
            currentSub.status = "expired";
            currentSub.ends_at = now;
            await currentSub.save({ transaction: t });
        }

        // 3) tạo subscription mới
        const newSub = await Subscription.create(
            {
                user_id: userId,
                plan_id: plan.id,
                starts_at: now,
                ends_at: endsAt,
                status: "active",
            },
            { transaction: t }
        );

        // 4) update role -> vip
        await grantVipToUser(userId, endsAt, { transaction: t });

        // 5) tạo payment demo (succeeded luôn)
        const provider =
            method === "momo" ? "MOMO" : method === "card" ? "STRIPE" : "VNPAY";

        const payment = await Payment.create(
            {
                user_id: userId,
                subscription_id: newSub.id,
                provider,
                provider_txn_id: `DEMO_${Date.now()}`,
                amount_cents: plan.price_cents,
                currency: plan.currency || "VND",
                status: "succeeded",
                payload: { demo: true, method },
            },
            { transaction: t }
        );

        await t.commit();

        // trả subscription kèm plan
        const subWithPlan = await Subscription.findByPk(newSub.id, {
            include: [{ model: Plan, foreignKey: "plan_id" }],
        });

        return res.status(201).json({
            success: true,
            message: "Đã nâng cấp VIP (demo)",
            data: {
                subscription: subWithPlan,
                payment,
            },
        });
    } catch (error) {
        await t.rollback();
        console.error("[POST /api/users/subscription] ERROR:", error);
        return res.status(500).json({ success: false, message: "Lỗi server khi đổi gói" });
    }
};

