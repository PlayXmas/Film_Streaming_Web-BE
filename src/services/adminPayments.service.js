import { Op } from "sequelize";
import { sequelize, Payment, PaymentEvent, Plan, Subscription, User } from "../models/index.js";
import {
    activateSubscriptionForPayment,
    clampLimit,
    createPaymentEvent,
    createServiceError,
    mergePayload,
    normalizeNullableString,
    normalizeString,
    parseBooleanFilter,
    parseDateInput,
    parsePositiveInt,
    toPaymentDto,
} from "./paymentCore.service.js";
import {
    amountFromVnpay,
    buildVnpayQuerydrResponseChecksumData,
    getVnpayConfig,
    parseVnpayDate,
    signVnpayQuerydrRequest,
    toVnpayDate,
    verifyVnpayQuerydrResponse,
} from "../utils/vnpay.util.js";

const PAYMENT_STATUS_VALUES = new Set([
    "pending",
    "processing",
    "succeeded",
    "failed",
    "cancelled",
    "expired",
    "refunded",
    "all",
]);
const SIGNATURE_FILTER_VALUES = new Set(["valid", "invalid", "unknown"]);
const MUTABLE_PENDING_STATUSES = new Set(["pending", "processing"]);
const QUERYDR_SETTLED_FAILED_CODES = new Set(["02", "04", "07", "09"]);
const QUERYDR_PROCESSING_CODES = new Set(["01", "05", "06"]);
const QUERYDR_TIMEOUT_MS = 15000;

function buildActorSnapshot(actor) {
    if (!actor?.id) return {};
    return {
        actor_user_id: actor.id,
        actor_name: actor.display_name || actor.email || `admin-${actor.id}`,
        actor_email: actor.email || null,
    };
}

function normalizeStatusFilter(value) {
    const status = normalizeString(value).toLowerCase() || "all";
    if (!PAYMENT_STATUS_VALUES.has(status)) {
        throw createServiceError("status khong hop le", 400);
    }
    return status;
}

function normalizeSignatureFilter(value) {
    const signature = normalizeNullableString(value)?.toLowerCase() || null;
    if (!signature) return null;
    if (!SIGNATURE_FILTER_VALUES.has(signature)) {
        throw createServiceError("signature khong hop le", 400);
    }
    return signature;
}

function parsePaymentId(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw createServiceError("payment id khong hop le", 400);
    }
    return parsed;
}

function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function ensureObjectOrNull(value, fieldName) {
    if (value === undefined || value === null || value === "") return null;
    if (!isPlainObject(value)) {
        throw createServiceError(`${fieldName} phai la object JSON`, 400);
    }
    return value;
}

function buildListBaseQuery(filters) {
    const where = {};
    const include = [
        {
            model: User,
            attributes: ["id", "display_name", "email"],
            required: false,
        },
        {
            model: Plan,
            attributes: ["id", "code", "name", "duration_days"],
            required: false,
        },
    ];

    if (filters.status !== "all") {
        where.status = filters.status;
    }

    if (filters.txn_ref) {
        where.txn_ref = filters.txn_ref;
    }

    if (filters.response_code) {
        where.last_response_code = filters.response_code;
    }

    if (filters.has_ipn === true) {
        where.ipn_received_at = { [Op.ne]: null };
    } else if (filters.has_ipn === false) {
        where.ipn_received_at = null;
    }

    if (filters.vip_granted === true) {
        where.subscription_id = { [Op.ne]: null };
    } else if (filters.vip_granted === false) {
        where.subscription_id = null;
    }

    if (filters.signature === "valid") {
        where.signature_valid = true;
    } else if (filters.signature === "invalid") {
        where.signature_valid = false;
    } else if (filters.signature === "unknown") {
        where.signature_valid = null;
    }

    if (filters.from || filters.to) {
        where.created_at = {};
        if (filters.from) where.created_at[Op.gte] = filters.from;
        if (filters.to) where.created_at[Op.lte] = filters.to;
    }

    if (filters.keyword) {
        const likeValue = `%${filters.keyword}%`;
        where[Op.or] = [
            { txn_ref: { [Op.like]: likeValue } },
            { provider_txn_id: { [Op.like]: likeValue } },
            { "$User.email$": { [Op.like]: likeValue } },
            { "$User.display_name$": { [Op.like]: likeValue } },
        ];
    }

    return {
        where,
        include,
    };
}

function buildAggregateQuery(baseQuery, where = {}) {
    return {
        where,
        include: (baseQuery.include || []).map((item) => ({
            ...item,
            attributes: [],
        })),
    };
}

function parseListFilters(query = {}) {
    const from = parseDateInput(query.from, "from");
    const to = parseDateInput(query.to, "to", { endOfDay: true });
    if (from && to && from.getTime() > to.getTime()) {
        throw createServiceError("Khoang thoi gian khong hop le", 400);
    }

    return {
        page: parsePositiveInt(query.page, 1),
        limit: clampLimit(query.limit, 20, 100),
        keyword: normalizeNullableString(query.keyword),
        txn_ref: normalizeNullableString(query.txn_ref),
        status: normalizeStatusFilter(query.status),
        response_code: normalizeNullableString(query.response_code),
        has_ipn: parseBooleanFilter(query.has_ipn),
        vip_granted: parseBooleanFilter(query.vip_granted),
        signature: normalizeSignatureFilter(query.signature),
        from,
        to,
    };
}

function buildPagination(page, limit, totalItems) {
    return {
        page,
        limit,
        total_items: totalItems,
        total_pages: Math.max(1, Math.ceil(totalItems / limit)),
    };
}

function mapQuerydrOutcome(response = {}) {
    const apiCode = normalizeString(response.vnp_ResponseCode);
    const transactionStatus = normalizeString(response.vnp_TransactionStatus);

    if (apiCode && apiCode !== "00") {
        return response.vnp_Message || `VNPay query error ${apiCode}`;
    }

    if (transactionStatus === "00") return "Giao dich thanh cong";
    if (QUERYDR_PROCESSING_CODES.has(transactionStatus)) return "Giao dich dang duoc xu ly";
    if (QUERYDR_SETTLED_FAILED_CODES.has(transactionStatus)) {
        return "Giao dich khong thanh cong tai VNPay";
    }

    return response.vnp_Message || "Khong xac dinh duoc ket qua QueryDR";
}

function mapPaymentStatusFromQuerydr(response = {}) {
    const apiCode = normalizeString(response.vnp_ResponseCode);
    const transactionStatus = normalizeString(response.vnp_TransactionStatus);

    if (apiCode !== "00") return null;
    if (transactionStatus === "00") return "succeeded";
    if (QUERYDR_PROCESSING_CODES.has(transactionStatus)) return "processing";
    if (QUERYDR_SETTLED_FAILED_CODES.has(transactionStatus)) return "failed";
    return "failed";
}

function getOrderInfo(payment) {
    return (
        payment?.payload?.order_info ||
        `Query transaction result, txn_ref=${payment.txn_ref || payment.id || "unknown"}`
    );
}

async function fetchPaymentById(paymentId, options = {}) {
    const includeTimeline = options.includeTimeline === true;
    const include = [
        {
            model: User,
            attributes: ["id", "display_name", "email"],
            required: false,
        },
        {
            model: Plan,
            attributes: ["id", "code", "name", "duration_days"],
            required: false,
        },
        {
            model: Subscription,
            required: false,
        },
    ];

    if (includeTimeline) {
        include.push({
            model: PaymentEvent,
            separate: true,
            order: [["created_at", "ASC"]],
        });
    }

    const payment = await Payment.findByPk(paymentId, {
        include,
        transaction: options.transaction,
        lock: options.lock ? options.transaction?.LOCK?.UPDATE : undefined,
    });

    if (!payment) {
        throw createServiceError("Khong tim thay giao dich", 404);
    }

    return payment;
}

async function ensureProviderTxnIdAvailable(providerTxnId, currentPaymentId, transaction) {
    const normalized = normalizeNullableString(providerTxnId);
    if (!normalized) return null;

    const existing = await Payment.findOne({
        where: {
            provider_txn_id: normalized,
            id: { [Op.ne]: currentPaymentId },
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
    });

    if (existing) {
        throw createServiceError("provider_txn_id da ton tai o giao dich khac", 409);
    }

    return normalized;
}

function createQuerydrRequestPayload(payment, actor, requestIp, config) {
    const now = new Date();
    const requestId = `QDR${payment.id}${Date.now()}`.slice(0, 32);
    const payload = {
        vnp_RequestId: requestId,
        vnp_Version: "2.1.0",
        vnp_Command: "querydr",
        vnp_TmnCode: config.tmnCode,
        vnp_TxnRef: payment.txn_ref,
        vnp_OrderInfo: getOrderInfo(payment),
        vnp_TransactionNo: payment.provider_txn_id || undefined,
        vnp_TransactionDate: toVnpayDate(payment.initiated_at, config.timeZone),
        vnp_CreateDate: toVnpayDate(now, config.timeZone),
        vnp_IpAddr: requestIp || config.apiIp || "127.0.0.1",
    };

    payload.vnp_SecureHash = signVnpayQuerydrRequest(payload, config.hashSecret);

    return {
        requestedAt: now,
        requestPayload: payload,
        actorSnapshot: buildActorSnapshot(actor),
    };
}

async function postVnpayQuerydr(requestPayload, config) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QUERYDR_TIMEOUT_MS);

    try {
        const response = await fetch(config.apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestPayload),
            signal: controller.signal,
        });

        const rawText = await response.text();
        let json = null;
        try {
            json = rawText ? JSON.parse(rawText) : null;
        } catch (error) {
            throw createServiceError(`VNPay tra ve du lieu khong phai JSON: ${rawText}`, 502);
        }

        if (!response.ok) {
            throw createServiceError(
                `VNPay QueryDR HTTP ${response.status}: ${json?.vnp_Message || rawText}`,
                502
            );
        }

        if (!json || typeof json !== "object") {
            throw createServiceError("VNPay QueryDR tra ve du lieu rong", 502);
        }

        return json;
    } catch (error) {
        if (error.name === "AbortError") {
            throw createServiceError("VNPay QueryDR bi timeout", 504);
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

function applyQuerydrDataToPayment(payment, responsePayload, responseSignatureValid) {
    payment.signature_valid = responseSignatureValid;
    payment.last_response_code = responsePayload.vnp_ResponseCode || null;
    payment.last_transaction_status = responsePayload.vnp_TransactionStatus || null;
    payment.provider_txn_id =
        responsePayload.vnp_TransactionNo || payment.provider_txn_id || null;
    payment.bank_code = responsePayload.vnp_BankCode || payment.bank_code || null;
    payment.card_type = responsePayload.vnp_CardType || payment.card_type || null;

    const amountPaid = amountFromVnpay(responsePayload.vnp_Amount);
    if (amountPaid !== null) {
        payment.amount_paid = amountPaid;
    }

    const payDate = parseVnpayDate(responsePayload.vnp_PayDate, getVnpayConfig().timeZone);
    if (payDate) {
        payment.paid_at = payDate;
    }
}

async function buildSummary(baseQuery) {
    const aggregateBaseQuery = buildAggregateQuery(baseQuery, baseQuery.where);
    const succeededAggregateQuery = buildAggregateQuery(baseQuery, {
        ...baseQuery.where,
        status: "succeeded",
    });
    const pendingAggregateQuery = buildAggregateQuery(baseQuery, {
        ...baseQuery.where,
        status: "pending",
    });
    const processingAggregateQuery = buildAggregateQuery(baseQuery, {
        ...baseQuery.where,
        status: "processing",
    });
    const failedAggregateQuery = buildAggregateQuery(baseQuery, {
        ...baseQuery.where,
        status: "failed",
    });

    const [totalCount, succeededCount, pendingCount, processingCount, failedCount, totalRevenue] =
        await Promise.all([
            Payment.count({
                ...aggregateBaseQuery,
                col: "id",
                distinct: true,
            }),
            Payment.count({
                ...succeededAggregateQuery,
                col: "id",
                distinct: true,
            }),
            Payment.count({
                ...pendingAggregateQuery,
                col: "id",
                distinct: true,
            }),
            Payment.count({
                ...processingAggregateQuery,
                col: "id",
                distinct: true,
            }),
            Payment.count({
                ...failedAggregateQuery,
                col: "id",
                distinct: true,
            }),
            Payment.sum("amount_paid", {
                ...succeededAggregateQuery,
            }),
        ]);

    return {
        total_count: Number(totalCount || 0),
        total_revenue: Number(totalRevenue || 0),
        succeeded_count: Number(succeededCount || 0),
        pending_count: Number(pendingCount || 0),
        processing_count: Number(processingCount || 0),
        failed_count: Number(failedCount || 0),
    };
}

function assertPendingMutable(payment, actionLabel) {
    if (!MUTABLE_PENDING_STATUSES.has(payment.status)) {
        throw createServiceError(
            `${actionLabel} chi ho tro giao dich dang pending hoac processing`,
            409
        );
    }
}

export async function listAdminPayments(query = {}) {
    const filters = parseListFilters(query);
    const baseQuery = buildListBaseQuery(filters);
    const offset = (filters.page - 1) * filters.limit;

    const [rows, totalItems, summary] = await Promise.all([
        Payment.findAll({
            ...baseQuery,
            order: [["created_at", "DESC"], ["id", "DESC"]],
            limit: filters.limit,
            offset,
            subQuery: false,
        }),
        Payment.count({
            ...baseQuery,
            distinct: true,
        }),
        buildSummary(baseQuery),
    ]);

    return {
        items: rows.map((payment) => toPaymentDto(payment)),
        pagination: buildPagination(filters.page, filters.limit, totalItems),
        summary,
    };
}

export async function getAdminPaymentDetail(paymentId) {
    const payment = await fetchPaymentById(parsePaymentId(paymentId), {
        includeTimeline: true,
    });

    return toPaymentDto(payment, { includeTimeline: true });
}

export async function querydrAdminPayment(paymentId, actor, requestMeta = {}) {
    const numericPaymentId = parsePaymentId(paymentId);
    const config = getVnpayConfig();
    let paymentLoaded = false;

    const transaction = await sequelize.transaction();

    try {
        const payment = await fetchPaymentById(numericPaymentId, {
            transaction,
            lock: true,
        });
        paymentLoaded = true;

        if (normalizeString(payment.provider).toUpperCase() !== "VNPAY") {
            throw createServiceError("Chi ho tro QueryDR cho giao dich VNPay", 400);
        }

        const querydrRequest = createQuerydrRequestPayload(
            payment,
            actor,
            requestMeta.ipAddress || config.apiIp,
            config
        );

        await createPaymentEvent(
            payment.id,
            {
                event_type: "querydr_requested",
                event_source: "admin",
                is_success: true,
                message: "Bat dau QueryDR voi VNPay",
                raw_payload: querydrRequest.requestPayload,
                normalized_payload: {
                    ...querydrRequest.actorSnapshot,
                    action: "querydr",
                    request_id: querydrRequest.requestPayload.vnp_RequestId,
                },
                processed_at: new Date(),
            },
            { transaction }
        );

        const querydrResponse = await postVnpayQuerydr(querydrRequest.requestPayload, config);
        const responseHasSignature = Boolean(querydrResponse?.vnp_SecureHash);
        const responseSignatureValid = responseHasSignature
            ? verifyVnpayQuerydrResponse(querydrResponse, config.hashSecret)
            : null;

        if (responseHasSignature && !responseSignatureValid) {
            const checksumData = buildVnpayQuerydrResponseChecksumData(querydrResponse);
            console.error("[VNPAY][QUERYDR] invalid_response_signature", {
                payment_id: payment.id,
                txn_ref: payment.txn_ref,
                provided_signature: querydrResponse?.vnp_SecureHash || null,
                checksum_data: checksumData,
                response_payload: querydrResponse,
            });
            throw createServiceError("Chu ky response QueryDR khong hop le", 502);
        }

        if (!responseHasSignature && querydrResponse?.vnp_ResponseCode === "00") {
            throw createServiceError("VNPay QueryDR thieu chu ky response", 502);
        }

        applyQuerydrDataToPayment(payment, querydrResponse, responseSignatureValid);

        const nextStatus = mapPaymentStatusFromQuerydr(querydrResponse);
        let synced = false;

        if (nextStatus === "succeeded" && payment.status !== "succeeded") {
            const { subscription, action } = await activateSubscriptionForPayment(payment, transaction);
            payment.status = "succeeded";
            payment.failure_reason = null;
            payment.failed_at = null;
            payment.cancelled_at = null;
            payment.expired_at = null;
            if (!payment.paid_at) {
                payment.paid_at = new Date();
            }
            synced = true;

            await createPaymentEvent(
                payment.id,
                {
                    event_type: "marked_succeeded",
                    event_source: "admin",
                    is_success: true,
                    response_code: querydrResponse.vnp_ResponseCode || null,
                    transaction_status: querydrResponse.vnp_TransactionStatus || null,
                    message: "Dong bo thanh cong tu QueryDR va da cap VIP",
                    normalized_payload: {
                        ...buildActorSnapshot(actor),
                        action: "querydr_auto_sync",
                        subscription_id: subscription.id,
                        vip_action: action,
                    },
                    processed_at: new Date(),
                },
                { transaction }
            );
        } else if (nextStatus === "failed" && payment.status !== "succeeded") {
            payment.status = "failed";
            payment.failure_reason = mapQuerydrOutcome(querydrResponse);
            payment.failed_at = new Date();
            synced = true;

            await createPaymentEvent(
                payment.id,
                {
                    event_type: "marked_failed",
                    event_source: "admin",
                    is_success: false,
                    response_code: querydrResponse.vnp_ResponseCode || null,
                    transaction_status: querydrResponse.vnp_TransactionStatus || null,
                    message: payment.failure_reason,
                    normalized_payload: {
                        ...buildActorSnapshot(actor),
                        action: "querydr_auto_sync",
                    },
                    processed_at: new Date(),
                },
                { transaction }
            );
        } else if (nextStatus === "processing" && payment.status === "pending") {
            payment.status = "processing";
            synced = true;
        }

        payment.payload = mergePayload(payment.payload, {
            last_querydr: {
                queried_at: querydrRequest.requestedAt.toISOString(),
                outcome: mapQuerydrOutcome(querydrResponse),
                synced,
                response_code: querydrResponse.vnp_ResponseCode || null,
                transaction_status: querydrResponse.vnp_TransactionStatus || null,
                response_signature_valid: responseSignatureValid,
                actor_user_id: actor?.id || null,
                actor_name: actor?.display_name || actor?.email || null,
                actor_email: actor?.email || null,
                request_payload: querydrRequest.requestPayload,
                response_payload: querydrResponse,
            },
        });

        await payment.save({ transaction });

        await createPaymentEvent(
            payment.id,
            {
                event_type: "querydr_completed",
                event_source: "admin",
                is_success: querydrResponse.vnp_ResponseCode === "00",
                signature_valid: responseSignatureValid,
                response_code: querydrResponse.vnp_ResponseCode || null,
                transaction_status: querydrResponse.vnp_TransactionStatus || null,
                message: mapQuerydrOutcome(querydrResponse),
                raw_payload: querydrResponse,
                normalized_payload: {
                    ...buildActorSnapshot(actor),
                    action: "querydr",
                    synced,
                },
                processed_at: new Date(),
            },
            { transaction }
        );

        await transaction.commit();
        return getAdminPaymentDetail(numericPaymentId);
    } catch (error) {
        await transaction.rollback();

        if (paymentLoaded) {
            await createPaymentEvent(numericPaymentId, {
                event_type: "querydr_failed",
                event_source: "admin",
                is_success: false,
                message: error.message || "QueryDR that bai",
                raw_payload: {
                    error: error.message || "Unknown QueryDR error",
                },
                normalized_payload: {
                    ...buildActorSnapshot(actor),
                    action: "querydr",
                },
                processed_at: new Date(),
            });
        }

        throw error;
    }
}

export async function manualConfirmAdminPayment(paymentId, payload = {}, actor) {
    const numericPaymentId = parsePaymentId(paymentId);
    const transaction = await sequelize.transaction();

    try {
        const payment = await fetchPaymentById(numericPaymentId, {
            transaction,
            lock: true,
        });

        assertPendingMutable(payment, "Duyet thu cong");

        const reason = normalizeNullableString(payload.reason);
        if (!reason) {
            throw createServiceError("reason la bat buoc", 400);
        }

        const paidAt = parseDateInput(payload.paid_at, "paid_at") || new Date();
        const providerTxnId = await ensureProviderTxnIdAvailable(
            payload.provider_txn_id,
            payment.id,
            transaction
        );
        const bankCode = normalizeNullableString(payload.bank_code);
        const bankTranNo = normalizeNullableString(payload.bank_tran_no);
        const auditNote = normalizeNullableString(payload.audit_note);
        const evidencePayload = ensureObjectOrNull(payload.evidence_payload, "evidence_payload");

        payment.status = "succeeded";
        payment.paid_at = paidAt;
        payment.amount_paid = payment.amount_expected;
        payment.provider_txn_id = providerTxnId;
        payment.bank_code = bankCode;
        payment.bank_tran_no = bankTranNo;
        payment.failure_reason = null;
        payment.failed_at = null;
        payment.cancelled_at = null;
        payment.expired_at = null;

        const { subscription, action } = await activateSubscriptionForPayment(payment, transaction);

        payment.payload = mergePayload(payment.payload, {
            last_manual_confirm: {
                reason,
                paid_at: paidAt.toISOString(),
                provider_txn_id: providerTxnId,
                bank_code: bankCode,
                bank_tran_no: bankTranNo,
                audit_note: auditNote,
                evidence_payload: evidencePayload,
                actor_user_id: actor?.id || null,
                actor_name: actor?.display_name || actor?.email || null,
                actor_email: actor?.email || null,
            },
        });

        await payment.save({ transaction });

        await createPaymentEvent(
            payment.id,
            {
                event_type: "manual_updated",
                event_source: "admin",
                is_success: true,
                message: reason,
                raw_payload: {
                    reason,
                    paid_at: paidAt.toISOString(),
                    provider_txn_id: providerTxnId,
                    bank_code: bankCode,
                    bank_tran_no: bankTranNo,
                    audit_note: auditNote,
                    evidence_payload: evidencePayload,
                },
                normalized_payload: {
                    ...buildActorSnapshot(actor),
                    action: "manual_confirm",
                    subscription_id: subscription.id,
                    vip_action: action,
                },
                processed_at: new Date(),
            },
            { transaction }
        );

        await transaction.commit();
        return getAdminPaymentDetail(numericPaymentId);
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

export async function markFailedAdminPayment(paymentId, payload = {}, actor) {
    const numericPaymentId = parsePaymentId(paymentId);
    const transaction = await sequelize.transaction();

    try {
        const payment = await fetchPaymentById(numericPaymentId, {
            transaction,
            lock: true,
        });

        assertPendingMutable(payment, "Danh dau that bai");

        const reason = normalizeNullableString(payload.reason);
        if (!reason) {
            throw createServiceError("reason la bat buoc", 400);
        }

        const responseCode = normalizeNullableString(payload.response_code);
        const transactionStatus = normalizeNullableString(payload.transaction_status);
        const rawPayload = payload.raw_payload ?? null;

        payment.status = "failed";
        payment.failure_reason = reason;
        payment.failed_at = new Date();
        payment.last_response_code = responseCode;
        payment.last_transaction_status = transactionStatus;
        payment.payload = mergePayload(payment.payload, {
            last_admin_failure: {
                reason,
                response_code: responseCode,
                transaction_status: transactionStatus,
                raw_payload: rawPayload,
                actor_user_id: actor?.id || null,
                actor_name: actor?.display_name || actor?.email || null,
                actor_email: actor?.email || null,
            },
        });

        await payment.save({ transaction });

        await createPaymentEvent(
            payment.id,
            {
                event_type: "marked_failed",
                event_source: "admin",
                is_success: false,
                response_code: responseCode,
                transaction_status: transactionStatus,
                message: reason,
                raw_payload: rawPayload,
                normalized_payload: {
                    ...buildActorSnapshot(actor),
                    action: "mark_failed",
                    reason,
                },
                processed_at: new Date(),
            },
            { transaction }
        );

        await transaction.commit();
        return getAdminPaymentDetail(numericPaymentId);
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}
