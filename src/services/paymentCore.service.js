import { Op } from "sequelize";
import { PaymentEvent, Subscription } from "../models/index.js";
import { grantVipToUser } from "./subscriptionAccess.service.js";

const EVENT_LABELS = {
    created: "Khoi tao giao dich",
    redirect_requested: "Chuyen huong sang VNPay",
    return_received: "Nhan ket qua return tu VNPay",
    ipn_received: "Nhan IPN tu VNPay",
    ipn_processed: "Da xu ly IPN VNPay",
    querydr_requested: "Gui yeu cau QueryDR",
    querydr_completed: "Hoan tat QueryDR",
    querydr_failed: "QueryDR that bai",
    marked_succeeded: "Danh dau giao dich thanh cong",
    marked_failed: "Danh dau giao dich that bai",
    marked_cancelled: "Danh dau giao dich da huy",
    marked_expired: "Danh dau giao dich het han",
    refund_requested: "Yeu cau hoan tien",
    refund_completed: "Hoan tien thanh cong",
    manual_updated: "Cap nhat thu cong",
};

const MUTABLE_PENDING_STATUSES = new Set(["pending", "processing"]);

function normalizePlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value;
}

export function mergePayload(existingPayload, nextPartial) {
    const base = normalizePlainObject(existingPayload) || {};
    const next = normalizePlainObject(nextPartial) || {};
    return {
        ...base,
        ...next,
    };
}

export async function createPaymentEvent(payment_id, payload, options = {}) {
    return PaymentEvent.create(
        {
            payment_id,
            ...payload,
        },
        options
    );
}

export async function activateSubscriptionForPayment(payment, transaction) {
    const now = new Date();
    const durationDays = Number(payment.duration_days_snapshot || 0);
    if (!durationDays) {
        throw new Error("Payment thieu duration_days_snapshot de kich hoat goi");
    }

    const currentSub = await Subscription.findOne({
        where: {
            user_id: payment.user_id,
            status: "active",
            ends_at: { [Op.gt]: now },
        },
        order: [["starts_at", "DESC"]],
        transaction,
        lock: transaction.LOCK.UPDATE,
    });

    if (currentSub) {
        const nextEndsAt = new Date(
            new Date(currentSub.ends_at).getTime() + durationDays * 24 * 60 * 60 * 1000
        );

        currentSub.plan_id = payment.plan_id;
        currentSub.ends_at = nextEndsAt;
        await currentSub.save({ transaction });

        await grantVipToUser(payment.user_id, nextEndsAt, { transaction });

        payment.subscription_id = currentSub.id;
        return { subscription: currentSub, endsAt: nextEndsAt, action: "extended" };
    }

    const endsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const subscription = await Subscription.create(
        {
            user_id: payment.user_id,
            plan_id: payment.plan_id,
            starts_at: now,
            ends_at: endsAt,
            status: "active",
        },
        { transaction }
    );

    await grantVipToUser(payment.user_id, endsAt, { transaction });

    payment.subscription_id = subscription.id;
    return { subscription, endsAt, action: "created" };
}

export function createServiceError(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    return error;
}

export function readValue(instance, snakeKey, camelKey) {
    if (!instance) return null;
    if (typeof instance.get === "function") {
        const snakeValue = instance.get(snakeKey);
        if (snakeValue !== undefined) return snakeValue;
        if (camelKey) {
            const camelValue = instance.get(camelKey);
            if (camelValue !== undefined) return camelValue;
        }
    }
    if (instance[snakeKey] !== undefined) return instance[snakeKey];
    if (camelKey && instance[camelKey] !== undefined) return instance[camelKey];
    return null;
}

export function normalizeString(value) {
    return String(value ?? "").trim();
}

export function normalizeNullableString(value) {
    const normalized = normalizeString(value);
    return normalized || null;
}

export function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
    return parsed;
}

export function clampLimit(value, fallback = 20, max = 100) {
    return Math.min(parsePositiveInt(value, fallback), max);
}

export function parseBooleanFilter(value) {
    if (value === undefined || value === null || value === "") return null;
    const normalized = normalizeString(value).toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
    throw createServiceError("Gia tri boolean khong hop le", 400);
}

export function parseDateInput(value, fieldName, options = {}) {
    const normalized = normalizeString(value);
    if (!normalized) return null;

    const hasExplicitTime =
        normalized.includes("T") || /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(normalized);

    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        const suffix = options.endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
        const parsed = new Date(`${normalized}${suffix}`);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
        throw createServiceError(`${fieldName} khong hop le`, 400);
    }

    if (options.endOfDay && !hasExplicitTime) {
        parsed.setUTCHours(23, 59, 59, 999);
    }

    return parsed;
}

export function formatDurationLabel(durationDays) {
    const totalDays = Number(durationDays || 0);
    if (!totalDays) return null;
    return `${totalDays} ngay`;
}

export function buildPaymentCode(paymentId) {
    return paymentId ? `PAY-${String(paymentId).padStart(6, "0")}` : null;
}

export function buildAllowedActions(payment) {
    const status = normalizeString(payment?.status).toLowerCase();
    const isPendingLike = MUTABLE_PENDING_STATUSES.has(status);
    const provider = normalizeString(payment?.provider).toUpperCase();

    return {
        can_manual_confirm: isPendingLike,
        can_mark_failed: isPendingLike,
        can_querydr: provider === "VNPAY" && status !== "refunded",
    };
}

export function extractQuerydrState(payload) {
    const normalized = normalizePlainObject(payload);
    const querydr = normalizePlainObject(normalized?.last_querydr);
    if (!querydr) return null;

    return {
        queried_at: querydr.queried_at || null,
        outcome: querydr.outcome || null,
        synced: Boolean(querydr.synced),
        response_code: querydr.response_code || null,
        transaction_status: querydr.transaction_status || null,
        response_signature_valid: querydr.response_signature_valid ?? null,
    };
}

function inferEventStatus(event) {
    const eventType = normalizeString(event?.event_type).toLowerCase();
    if (event?.is_success === true) return "ok";
    if (event?.is_success === false) return "fail";
    if (eventType.endsWith("_failed") || eventType === "marked_failed") return "fail";
    if (eventType.includes("requested") || eventType.includes("received")) return "info";
    return "ok";
}

export function mapPaymentEventDto(event) {
    const normalizedPayload = normalizePlainObject(event.normalized_payload) || {};
    const actorName =
        normalizedPayload.actor_name ||
        normalizePlainObject(event.raw_payload)?.actor_name ||
        null;

    return {
        id: event.id,
        event_type: event.event_type,
        event_label: EVENT_LABELS[event.event_type] || event.event_type,
        event_status: inferEventStatus(event),
        event_source: event.event_source,
        actor_name: actorName,
        created_at: readValue(event, "created_at", "createdAt"),
        response_code: event.response_code ?? null,
        transaction_status: event.transaction_status ?? null,
        signature_valid: event.signature_valid ?? null,
        raw_payload: event.raw_payload ?? null,
    };
}

export function toPaymentDto(payment, options = {}) {
    const includeTimeline = options.includeTimeline === true;
    const events = Array.isArray(payment?.PaymentEvents)
        ? payment.PaymentEvents
        : Array.isArray(payment?.payment_events)
          ? payment.payment_events
          : [];
    const plan = payment?.Plan || null;
    const user = payment?.User || null;
    const amountPaid = payment.amount_paid ?? null;
    const amountExpected = payment.amount_expected ?? payment.amount_cents ?? null;

    const dto = {
        id: payment.id,
        payment_id: buildPaymentCode(payment.id),
        txn_ref: payment.txn_ref,
        provider: normalizeString(payment.provider).toLowerCase(),
        provider_txn_id: payment.provider_txn_id || null,
        amount: amountPaid ?? amountExpected ?? 0,
        amount_expected: amountExpected ?? 0,
        amount_paid: amountPaid,
        currency: payment.currency_snapshot || payment.currency || "VND",
        status: payment.status,
        response_code: payment.last_response_code || null,
        transaction_status: payment.last_transaction_status || null,
        signature_valid: payment.signature_valid ?? null,
        created_at: readValue(payment, "created_at", "createdAt"),
        initiated_at: payment.initiated_at || null,
        expires_at: payment.expires_at || null,
        paid_at: payment.paid_at || null,
        failed_at: payment.failed_at || null,
        cancelled_at: payment.cancelled_at || null,
        expired_at: payment.expired_at || null,
        subscription_id: payment.subscription_id || null,
        ipn_received_at: payment.ipn_received_at || null,
        has_ipn: !!payment.ipn_received_at,
        bank_code: payment.bank_code || null,
        bank_tran_no: payment.bank_tran_no || null,
        card_type: payment.card_type || null,
        failure_reason: payment.failure_reason || null,
        user: user
            ? {
                  id: user.id,
                  display_name: user.display_name,
                  email: user.email,
              }
            : null,
        plan: {
            id: payment.plan_id || plan?.id || null,
            code: payment.plan_code_snapshot || plan?.code || null,
            name: payment.plan_name_snapshot || plan?.name || null,
            duration_label: formatDurationLabel(payment.duration_days_snapshot || plan?.duration_days),
        },
        querydr: extractQuerydrState(payment.payload),
        allowed_actions: buildAllowedActions(payment),
    };

    if (includeTimeline) {
        dto.timeline = events.map(mapPaymentEventDto);
    }

    return dto;
}
