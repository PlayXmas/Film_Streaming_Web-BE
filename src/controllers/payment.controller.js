import { sequelize, Payment, PaymentEvent, Subscription, Plan } from "../models/index.js";
import {
    activateSubscriptionForPayment,
    createPaymentEvent,
    mergePayload,
} from "../services/paymentCore.service.js";
import {
    addMinutes,
    amountFromVnpay,
    buildRedirectUrl,
    buildTxnRef,
    buildVnpayPaymentUrl,
    formatIpnResponse,
    getClientIp,
    getVnpayConfig,
    isVnpaySuccess,
    mapPaymentStatusFromVnpay,
    mapVnpayMessage,
    normalizeVnpayParams,
    parseVnpayDate,
    verifyVnpaySignature,
} from "../utils/vnpay.util.js";

function buildReturnStatus({ payment, signatureValid, success }) {
    if (!signatureValid) return "invalid_signature";
    if (!payment) return "not_found";
    if (success) return "success";
    return payment?.status || "failed";
}

export const createVnpayPayment = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const userId = req.user.id;
        const planId = Number(req.body?.planId);
        const bankCode = req.body?.bankCode ? String(req.body.bankCode).trim() : "";

        if (!Number.isInteger(planId) || planId <= 0) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "planId không hợp lệ" });
        }

        const config = getVnpayConfig();
        const plan = await Plan.findByPk(planId, { transaction });
        if (!plan) {
            await transaction.rollback();
            return res.status(404).json({ success: false, message: "Gói không tồn tại" });
        }

        const now = new Date();
        const txnRef = buildTxnRef(userId);
        const expiresAt = addMinutes(now, config.expireMinutes);
        const orderInfo = `Thanh toan goi ${plan.code} cho user ${userId}`;
        const ipAddr = getClientIp(req);

        console.log("[VNPAY][CREATE] start", {
            user_id: userId,
            plan_id: plan.id,
            plan_code: plan.code,
            amount_expected: plan.price_cents,
            bank_code: bankCode || null,
            ip_addr: ipAddr,
        });

        const payment = await Payment.create(
            {
                user_id: userId,
                plan_id: plan.id,
                provider: "VNPAY",
                txn_ref: txnRef,
                provider_txn_id: null,
                amount_cents: plan.price_cents,
                amount_expected: plan.price_cents,
                amount_paid: null,
                currency: plan.currency || "VND",
                currency_snapshot: plan.currency || "VND",
                plan_code_snapshot: plan.code,
                plan_name_snapshot: plan.name,
                duration_days_snapshot: plan.duration_days,
                status: "pending",
                payload: {
                    order_info: orderInfo,
                    bank_code: bankCode || null,
                    create_ip: ipAddr,
                },
                initiated_at: now,
                expires_at: expiresAt,
            },
            { transaction }
        );

        await createPaymentEvent(
            payment.id,
            {
                event_type: "created",
                event_source: "system",
                message: "Tạo payment VNPay pending",
                normalized_payload: {
                    plan_id: plan.id,
                    txn_ref: txnRef,
                    amount_expected: plan.price_cents,
                },
                processed_at: now,
            },
            { transaction }
        );

        const payUrl = buildVnpayPaymentUrl({
            config,
            txnRef,
            amount: payment.amount_expected,
            ipAddr,
            orderInfo,
            createDate: now,
            expireDate: expiresAt,
            bankCode,
        });

        await createPaymentEvent(
            payment.id,
            {
                event_type: "redirect_requested",
                event_source: "system",
                is_success: true,
                message: "Đã tạo URL thanh toán VNPay",
                normalized_payload: {
                    pay_url: payUrl,
                },
                processed_at: new Date(),
            },
            { transaction }
        );

        console.log("[VNPAY][CREATE] payment_created", {
            payment_id: payment.id,
            txn_ref: payment.txn_ref,
            user_id: payment.user_id,
            plan_id: payment.plan_id,
            amount_expected: payment.amount_expected,
            expires_at: payment.expires_at,
        });

        await transaction.commit();

        console.log("[VNPAY][CREATE] committed", {
            payment_id: payment.id,
            txn_ref: payment.txn_ref,
        });

        return res.status(201).json({
            success: true,
            message: "Tạo yêu cầu thanh toán VNPay thành công",
            data: {
                payment_id: payment.id,
                txn_ref: payment.txn_ref,
                amount: payment.amount_expected,
                expires_at: payment.expires_at,
                pay_url: payUrl,
            },
        });
    } catch (err) {
        await transaction.rollback();
        console.error("createVnpayPayment error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi tạo yêu cầu thanh toán VNPay",
        });
    }
};

export const handleVnpayReturn = async (req, res) => {
    try {
        const config = getVnpayConfig();
        const vnpParams = normalizeVnpayParams(req.query);
        const signatureValid = verifyVnpaySignature(vnpParams, config.hashSecret);
        const txnRef = vnpParams.vnp_TxnRef;
        const success = isVnpaySuccess(vnpParams);
        const payment = txnRef ? await Payment.findOne({ where: { txn_ref: txnRef } }) : null;

        console.log("[VNPAY][RETURN] received", {
            txn_ref: txnRef || null,
            payment_id: payment?.id || null,
            signature_valid: signatureValid,
            response_code: vnpParams.vnp_ResponseCode || null,
            transaction_status: vnpParams.vnp_TransactionStatus || null,
            transaction_no: vnpParams.vnp_TransactionNo || null,
            amount: vnpParams.vnp_Amount || null,
            bank_code: vnpParams.vnp_BankCode || null,
            pay_date: vnpParams.vnp_PayDate || null,
        });

        if (payment) {
            payment.signature_valid = signatureValid;
            payment.last_response_code = vnpParams.vnp_ResponseCode || null;
            payment.last_transaction_status = vnpParams.vnp_TransactionStatus || null;
            payment.payload = mergePayload(payment.payload, {
                last_return: vnpParams,
            });
            await payment.save();

            await createPaymentEvent(payment.id, {
                event_type: "return_received",
                event_source: "vnpay_return",
                is_success: success,
                signature_valid: signatureValid,
                response_code: vnpParams.vnp_ResponseCode || null,
                transaction_status: vnpParams.vnp_TransactionStatus || null,
                message: mapVnpayMessage(vnpParams),
                raw_payload: vnpParams,
                normalized_payload: {
                    txn_ref: txnRef,
                    status: buildReturnStatus({ payment, signatureValid, success }),
                },
                processed_at: new Date(),
            });

            console.log("[VNPAY][RETURN] payment_updated", {
                payment_id: payment.id,
                txn_ref: payment.txn_ref,
                status: payment.status,
                signature_valid: payment.signature_valid,
                last_response_code: payment.last_response_code,
                last_transaction_status: payment.last_transaction_status,
            });
        }

        const status = buildReturnStatus({ payment, signatureValid, success });
        const redirectUrl = buildRedirectUrl(config.paymentReturnRedirectUrl, {
            status,
            txn_ref: txnRef,
            payment_id: payment?.id,
            response_code: vnpParams.vnp_ResponseCode,
            transaction_status: vnpParams.vnp_TransactionStatus,
        });

        console.log("[VNPAY][RETURN] completed", {
            txn_ref: txnRef || null,
            payment_id: payment?.id || null,
            final_status: status,
            redirect_url: redirectUrl || null,
        });

        if (redirectUrl) {
            return res.redirect(302, redirectUrl);
        }

        return res.status(signatureValid ? 200 : 400).json({
            success: signatureValid,
            message: mapVnpayMessage(vnpParams),
            data: {
                status,
                payment_id: payment?.id || null,
                txn_ref: txnRef || null,
                response_code: vnpParams.vnp_ResponseCode || null,
                transaction_status: vnpParams.vnp_TransactionStatus || null,
            },
        });
    } catch (err) {
        console.error("handleVnpayReturn error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi xử lý VNPay return",
        });
    }
};

export const handleVnpayIpn = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const config = getVnpayConfig();
        const vnpParams = normalizeVnpayParams(req.query);
        const signatureValid = verifyVnpaySignature(vnpParams, config.hashSecret);

        console.log("[VNPAY][IPN] received", {
            txn_ref: vnpParams.vnp_TxnRef || null,
            signature_valid: signatureValid,
            response_code: vnpParams.vnp_ResponseCode || null,
            transaction_status: vnpParams.vnp_TransactionStatus || null,
            transaction_no: vnpParams.vnp_TransactionNo || null,
            amount: vnpParams.vnp_Amount || null,
            bank_code: vnpParams.vnp_BankCode || null,
            pay_date: vnpParams.vnp_PayDate || null,
        });

        if (!signatureValid) {
            console.warn("[VNPAY][IPN] invalid_signature", {
                txn_ref: vnpParams.vnp_TxnRef || null,
            });
            await transaction.rollback();
            return res.status(200).json(formatIpnResponse("97", "Invalid signature"));
        }

        const txnRef = vnpParams.vnp_TxnRef;
        if (!txnRef) {
            console.warn("[VNPAY][IPN] missing_txn_ref");
            await transaction.rollback();
            return res.status(200).json(formatIpnResponse("01", "Order not found"));
        }

        const payment = await Payment.findOne({
            where: { txn_ref: txnRef },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!payment) {
            console.warn("[VNPAY][IPN] payment_not_found", {
                txn_ref: txnRef,
            });
            await transaction.rollback();
            return res.status(200).json(formatIpnResponse("01", "Order not found"));
        }

        console.log("[VNPAY][IPN] payment_loaded", {
            payment_id: payment.id,
            txn_ref: payment.txn_ref,
            user_id: payment.user_id,
            current_status: payment.status,
            subscription_id: payment.subscription_id,
            amount_expected: payment.amount_expected,
        });

        await createPaymentEvent(
            payment.id,
            {
                event_type: "ipn_received",
                event_source: "vnpay_ipn",
                is_success: isVnpaySuccess(vnpParams),
                signature_valid: true,
                response_code: vnpParams.vnp_ResponseCode || null,
                transaction_status: vnpParams.vnp_TransactionStatus || null,
                message: mapVnpayMessage(vnpParams),
                raw_payload: vnpParams,
                normalized_payload: {
                    txn_ref: txnRef,
                },
                processed_at: new Date(),
            },
            { transaction }
        );

        if (payment.status === "succeeded") {
            console.log("[VNPAY][IPN] duplicate_success", {
                payment_id: payment.id,
                txn_ref: payment.txn_ref,
                subscription_id: payment.subscription_id,
            });
            await createPaymentEvent(
                payment.id,
                {
                    event_type: "ipn_processed",
                    event_source: "vnpay_ipn",
                    is_success: true,
                    signature_valid: true,
                    response_code: vnpParams.vnp_ResponseCode || null,
                    transaction_status: vnpParams.vnp_TransactionStatus || null,
                    message: "Payment đã được xác nhận trước đó",
                    processed_at: new Date(),
                },
                { transaction }
            );

            await transaction.commit();
            return res.status(200).json(formatIpnResponse("00", "Confirm Success"));
        }

        const amountPaid = amountFromVnpay(vnpParams.vnp_Amount);
        if (amountPaid === null || Number(amountPaid) !== Number(payment.amount_expected)) {
            console.warn("[VNPAY][IPN] amount_mismatch", {
                payment_id: payment.id,
                txn_ref: payment.txn_ref,
                amount_expected: payment.amount_expected,
                amount_paid: amountPaid,
            });
            payment.status = "failed";
            payment.failed_at = new Date();
            payment.ipn_received_at = new Date();
            payment.signature_valid = true;
            payment.last_response_code = vnpParams.vnp_ResponseCode || null;
            payment.last_transaction_status = vnpParams.vnp_TransactionStatus || null;
            payment.failure_reason = "amount_mismatch";
            payment.payload = mergePayload(payment.payload, {
                last_ipn: vnpParams,
            });
            await payment.save({ transaction });

            await createPaymentEvent(
                payment.id,
                {
                    event_type: "marked_failed",
                    event_source: "vnpay_ipn",
                    is_success: false,
                    signature_valid: true,
                    response_code: vnpParams.vnp_ResponseCode || null,
                    transaction_status: vnpParams.vnp_TransactionStatus || null,
                    message: "Số tiền thanh toán không khớp",
                    processed_at: new Date(),
                },
                { transaction }
            );

            await transaction.commit();
            return res.status(200).json(formatIpnResponse("04", "Invalid amount"));
        }

        payment.status = mapPaymentStatusFromVnpay(vnpParams);
        payment.amount_paid = amountPaid;
        payment.provider_txn_id = vnpParams.vnp_TransactionNo || payment.provider_txn_id || null;
        payment.ipn_received_at = new Date();
        payment.signature_valid = true;
        payment.last_response_code = vnpParams.vnp_ResponseCode || null;
        payment.last_transaction_status = vnpParams.vnp_TransactionStatus || null;
        payment.bank_code = vnpParams.vnp_BankCode || null;
        payment.bank_tran_no = vnpParams.vnp_BankTranNo || null;
        payment.card_type = vnpParams.vnp_CardType || null;
        payment.payload = mergePayload(payment.payload, {
            last_ipn: vnpParams,
        });

        console.log("[VNPAY][IPN] payment_mapped", {
            payment_id: payment.id,
            txn_ref: payment.txn_ref,
            mapped_status: payment.status,
            amount_paid: payment.amount_paid,
            provider_txn_id: payment.provider_txn_id,
        });

        if (payment.status === "succeeded") {
            payment.paid_at = parseVnpayDate(vnpParams.vnp_PayDate, config.timeZone) || new Date();
            const { subscription } = await activateSubscriptionForPayment(payment, transaction);
            await payment.save({ transaction });

            console.log("[VNPAY][IPN] success_activated", {
                payment_id: payment.id,
                txn_ref: payment.txn_ref,
                user_id: payment.user_id,
                subscription_id: subscription.id,
                ends_at: subscription.ends_at,
                paid_at: payment.paid_at,
            });

            await createPaymentEvent(
                payment.id,
                {
                    event_type: "marked_succeeded",
                    event_source: "vnpay_ipn",
                    is_success: true,
                    signature_valid: true,
                    response_code: vnpParams.vnp_ResponseCode || null,
                    transaction_status: vnpParams.vnp_TransactionStatus || null,
                    message: "Thanh toán thành công và đã kích hoạt gói",
                    normalized_payload: {
                        subscription_id: subscription.id,
                    },
                    processed_at: new Date(),
                },
                { transaction }
            );
        } else {
            const now = new Date();
            payment.failure_reason = mapVnpayMessage(vnpParams);

            if (payment.status === "cancelled") {
                payment.cancelled_at = now;
            } else if (payment.status === "expired") {
                payment.expired_at = now;
            } else {
                payment.failed_at = now;
            }

            await payment.save({ transaction });

            console.log("[VNPAY][IPN] non_success_updated", {
                payment_id: payment.id,
                txn_ref: payment.txn_ref,
                status: payment.status,
                failure_reason: payment.failure_reason,
            });

            await createPaymentEvent(
                payment.id,
                {
                    event_type:
                        payment.status === "cancelled"
                            ? "marked_cancelled"
                            : payment.status === "expired"
                              ? "marked_expired"
                              : "marked_failed",
                    event_source: "vnpay_ipn",
                    is_success: false,
                    signature_valid: true,
                    response_code: vnpParams.vnp_ResponseCode || null,
                    transaction_status: vnpParams.vnp_TransactionStatus || null,
                    message: payment.failure_reason,
                    processed_at: new Date(),
                },
                { transaction }
            );
        }

        await createPaymentEvent(
            payment.id,
            {
                event_type: "ipn_processed",
                event_source: "vnpay_ipn",
                is_success: payment.status === "succeeded",
                signature_valid: true,
                response_code: vnpParams.vnp_ResponseCode || null,
                transaction_status: vnpParams.vnp_TransactionStatus || null,
                message: "Đã xử lý IPN VNPay",
                processed_at: new Date(),
            },
            { transaction }
        );

        await transaction.commit();
        console.log("[VNPAY][IPN] committed", {
            payment_id: payment.id,
            txn_ref: payment.txn_ref,
            final_status: payment.status,
            subscription_id: payment.subscription_id || null,
        });
        return res.status(200).json(formatIpnResponse("00", "Confirm Success"));
    } catch (err) {
        await transaction.rollback();
        console.error("[VNPAY][IPN] error:", err);
        return res.status(200).json(formatIpnResponse("99", "Unknown error"));
    }
};

export const getMyPayments = async (req, res) => {
    try {
        const userId = req.user.id;

        const payments = await Payment.findAll({
            where: { user_id: userId },
            order: [["created_at", "DESC"]],
            include: [
                {
                    model: Plan,
                },
                {
                    model: Subscription,
                    include: [{ model: Plan }],
                },
                {
                    model: PaymentEvent,
                    separate: true,
                    limit: 5,
                    order: [["created_at", "DESC"]],
                },
            ],
        });

        return res.json({ success: true, data: payments });
    } catch (err) {
        console.error("getMyPayments error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server khi lấy lịch sử thanh toán" });
    }
};
