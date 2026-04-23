// src/controllers/plan.controller.js
import { Op, col, fn } from "sequelize";
import { Plan, Subscription } from "../models/index.js";

function normalizeText(value) {
    return String(value ?? "").trim();
}

function createValidationError(message) {
    const error = new Error(message);
    error.status = 400;
    return error;
}

function parseBoolean(value, fieldName = "is_active") {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
        const normalized = normalizeText(value).toLowerCase();
        if (["true", "1", "yes"].includes(normalized)) return true;
        if (["false", "0", "no"].includes(normalized)) return false;
    }

    throw createValidationError(`${fieldName} không hợp lệ`);
}

function normalizeFeatures(value) {
    if (value === undefined) return undefined;
    if (value === null || value === "") return [];

    let source = value;

    if (typeof value === "string") {
        const trimmed = normalizeText(value);
        if (!trimmed) return [];

        if (trimmed.startsWith("[")) {
            try {
                source = JSON.parse(trimmed);
            } catch {
                throw createValidationError("features phải là JSON array hợp lệ");
            }
        } else {
            source = trimmed
                .split(/\r?\n/)
                .map((item) => normalizeText(item))
                .filter(Boolean);
        }
    }

    if (!Array.isArray(source)) {
        throw createValidationError("features phải là mảng chuỗi");
    }

    const normalized = source
        .map((item) => normalizeText(item))
        .filter(Boolean);

    return normalized;
}

function validatePositiveInteger(value, fieldName) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw createValidationError(`${fieldName} phải là số nguyên dương`);
    }
    return parsed;
}

function buildPlanPayload(body = {}, { requireAll = false } = {}) {
    const payload = {};

    if (body.code !== undefined || requireAll) {
        const code = normalizeText(body.code);
        if (!code) throw createValidationError("code là bắt buộc");
        payload.code = code;
    }

    if (body.name !== undefined || requireAll) {
        const name = normalizeText(body.name);
        if (!name) throw createValidationError("name là bắt buộc");
        payload.name = name;
    }

    if (body.price_cents !== undefined || requireAll) {
        payload.price_cents = validatePositiveInteger(body.price_cents, "price_cents");
    }

    if (body.duration_days !== undefined || requireAll) {
        payload.duration_days = validatePositiveInteger(body.duration_days, "duration_days");
    }

    if (body.currency !== undefined || requireAll) {
        const currency = normalizeText(body.currency || "VND").toUpperCase();
        if (!currency || currency.length !== 3) {
            throw createValidationError("currency phải gồm 3 ký tự");
        }
        payload.currency = currency;
    }

    if (body.is_active !== undefined) {
        payload.is_active = parseBoolean(body.is_active);
    } else if (requireAll) {
        payload.is_active = true;
    }

    const features = normalizeFeatures(body.features);
    if (features !== undefined) {
        payload.features = features;
    } else if (requireAll) {
        payload.features = [];
    }

    return payload;
}

function mapPlan(plan, extra = {}) {
    return {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        price_cents: plan.price_cents,
        currency: plan.currency,
        duration_days: plan.duration_days,
        is_active: !!plan.is_active,
        features: Array.isArray(plan.features) ? plan.features : [],
        created_at: plan.createdAt ?? null,
        updated_at: plan.updatedAt ?? null,
        ...extra,
    };
}

async function loadActiveSubscriberStats(planIds = []) {
    if (!planIds.length) {
        return new Map();
    }

    const now = new Date();
    const rows = await Subscription.findAll({
        attributes: [
            "plan_id",
            [fn("COUNT", col("id")), "subscriber_count"],
        ],
        where: {
            plan_id: {
                [Op.in]: planIds,
            },
            status: "active",
            ends_at: {
                [Op.gt]: now,
            },
        },
        group: ["plan_id"],
        raw: true,
    });

    return new Map(
        rows.map((row) => [
            Number(row.plan_id),
            Number(row.subscriber_count || 0),
        ])
    );
}

function buildPlanMetrics(plan, subscriberCount = 0) {
    const durationDays = Number(plan.duration_days || 0);
    const price = Number(plan.price_cents || 0);
    const estimatedMonthlyRevenue =
        durationDays > 0
            ? Math.round((price * subscriberCount * 30) / durationDays)
            : 0;

    return {
        subscriber_count: subscriberCount,
        estimated_monthly_revenue: estimatedMonthlyRevenue,
    };
}

/**
 * GET /api/plans
 * Public: trả list plan để FE render
 */
export const getPlans = async (req, res) => {
    try {
        const plans = await Plan.findAll({
            where: {
                is_active: true,
            },
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

export const getAdminPlans = async (req, res) => {
    try {
        const query = normalizeText(req.query.q).toLowerCase();
        const status = req.query.is_active;
        const where = {};

        if (status !== undefined) {
            where.is_active = parseBoolean(status);
        }

        const plans = await Plan.findAll({
            where,
            order: [
                ["is_active", "DESC"],
                ["duration_days", "ASC"],
                ["price_cents", "ASC"],
            ],
        });

        const filtered = query
            ? plans.filter((plan) => {
                  const code = normalizeText(plan.code).toLowerCase();
                  const name = normalizeText(plan.name).toLowerCase();
                  return code.includes(query) || name.includes(query);
              })
            : plans;

        const statMap = await loadActiveSubscriberStats(filtered.map((plan) => plan.id));
        const items = filtered.map((plan) => {
            const metrics = buildPlanMetrics(plan, statMap.get(plan.id) || 0);
            return mapPlan(plan, metrics);
        });

        const totalSubscribers = items.reduce(
            (sum, item) => sum + Number(item.subscriber_count || 0),
            0
        );
        const estimatedMonthlyRevenue = items.reduce(
            (sum, item) => sum + Number(item.estimated_monthly_revenue || 0),
            0
        );

        return res.json({
            success: true,
            data: items,
            meta: {
                total_plans: items.length,
                total_subscribers: totalSubscribers,
                estimated_monthly_revenue: estimatedMonthlyRevenue,
            },
        });
    } catch (err) {
        if (err?.status === 400) {
            return res.status(400).json({ success: false, message: err.message });
        }

        console.error("getAdminPlans error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi lấy danh sách plan quản trị",
        });
    }
};

export const getAdminPlanDetail = async (req, res) => {
    try {
        const plan = await Plan.findByPk(req.params.id);
        if (!plan) {
            return res.status(404).json({ success: false, message: "Không tìm thấy plan" });
        }

        const statMap = await loadActiveSubscriberStats([plan.id]);
        const metrics = buildPlanMetrics(plan, statMap.get(plan.id) || 0);

        return res.json({
            success: true,
            data: mapPlan(plan, metrics),
        });
    } catch (err) {
        console.error("getAdminPlanDetail error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi lấy chi tiết plan",
        });
    }
};

export const createAdminPlan = async (req, res) => {
    try {
        const payload = buildPlanPayload(req.body, { requireAll: true });
        const created = await Plan.create(payload);

        return res.status(201).json({
            success: true,
            data: mapPlan(created),
        });
    } catch (err) {
        if (err?.name === "SequelizeUniqueConstraintError") {
            return res.status(409).json({
                success: false,
                message: "code của plan đã tồn tại",
            });
        }

        if (err?.status === 400) {
            return res.status(400).json({ success: false, message: err.message });
        }

        console.error("createAdminPlan error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi tạo plan",
        });
    }
};

export const updateAdminPlan = async (req, res) => {
    try {
        const plan = await Plan.findByPk(req.params.id);
        if (!plan) {
            return res.status(404).json({ success: false, message: "Không tìm thấy plan" });
        }

        const payload = buildPlanPayload(req.body || {});
        if (!Object.keys(payload).length) {
            return res.status(400).json({
                success: false,
                message: "Không có dữ liệu cập nhật",
            });
        }

        await plan.update(payload);

        return res.json({
            success: true,
            data: mapPlan(plan),
        });
    } catch (err) {
        if (err?.name === "SequelizeUniqueConstraintError") {
            return res.status(409).json({
                success: false,
                message: "code của plan đã tồn tại",
            });
        }

        if (err?.status === 400) {
            return res.status(400).json({ success: false, message: err.message });
        }

        console.error("updateAdminPlan error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi cập nhật plan",
        });
    }
};

export const updateAdminPlanStatus = async (req, res) => {
    try {
        const plan = await Plan.findByPk(req.params.id);
        if (!plan) {
            return res.status(404).json({ success: false, message: "Không tìm thấy plan" });
        }

        if (!Object.prototype.hasOwnProperty.call(req.body || {}, "is_active")) {
            return res.status(400).json({
                success: false,
                message: "Thiếu trường is_active",
            });
        }

        plan.is_active = parseBoolean(req.body.is_active);
        await plan.save();

        return res.json({
            success: true,
            data: mapPlan(plan),
        });
    } catch (err) {
        if (err?.status === 400) {
            return res.status(400).json({ success: false, message: err.message });
        }

        console.error("updateAdminPlanStatus error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi cập nhật trạng thái plan",
        });
    }
};

export const deleteAdminPlan = async (req, res) => {
    try {
        const plan = await Plan.findByPk(req.params.id);
        if (!plan) {
            return res.status(404).json({ success: false, message: "Không tìm thấy plan" });
        }

        plan.is_active = false;
        await plan.save();

        return res.json({
            success: true,
            message: "Đã ngừng bán gói cước",
            data: mapPlan(plan),
        });
    } catch (err) {
        console.error("deleteAdminPlan error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi ngừng bán plan",
        });
    }
};
