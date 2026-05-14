import "../bootstrap.js";
import crypto from "node:crypto";

const DEFAULT_TIMEZONE = process.env.VNP_TIMEZONE || "Asia/Ho_Chi_Minh";
const DEFAULT_QUERYDR_SANDBOX_URL = "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction";
const DEFAULT_QUERYDR_PRODUCTION_URL = "https://pay.vnpay.vn/merchant_webapi/api/transaction";

function hmacSha512(secret, value) {
    return crypto.createHmac("sha512", secret).update(Buffer.from(value, "utf-8")).digest("hex");
}

function encodeVnpayValue(value) {
    return encodeURIComponent(String(value)).replace(/%20/g, "+");
}

function formatParts(date, timeZone = DEFAULT_TIMEZONE) {
    const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const read = (type) => parts.find((part) => part.type === type)?.value;

    return {
        year: read("year"),
        month: read("month"),
        day: read("day"),
        hour: read("hour"),
        minute: read("minute"),
        second: read("second"),
    };
}

export function toVnpayDate(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
    const parts = formatParts(date, timeZone);
    return [
        parts.year,
        parts.month,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
    ].join("");
}

export function parseVnpayDate(value, timeZone = DEFAULT_TIMEZONE) {
    if (!value || String(value).length !== 14) return null;

    const text = String(value);
    const year = Number(text.slice(0, 4));
    const month = Number(text.slice(4, 6));
    const day = Number(text.slice(6, 8));
    const hour = Number(text.slice(8, 10));
    const minute = Number(text.slice(10, 12));
    const second = Number(text.slice(12, 14));

    if ([year, month, day, hour, minute, second].some((part) => Number.isNaN(part))) {
        return null;
    }

    const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });

    const localParts = formatter.formatToParts(utcGuess);
    const read = (type) => localParts.find((part) => part.type === type)?.value;
    const localIso = `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}:${read("second")}Z`;
    const shifted = new Date(localIso);
    const diffMs = utcGuess.getTime() - shifted.getTime();

    return new Date(utcGuess.getTime() + diffMs);
}

export function normalizeVnpayParams(input = {}) {
    const output = {};

    Object.keys(input)
        .filter((key) => key.startsWith("vnp_"))
        .sort()
        .forEach((key) => {
            const value = input[key];
            if (value === undefined || value === null || value === "") return;
            output[key] = Array.isArray(value) ? String(value[0]) : String(value);
        });

    return output;
}

export function buildVnpayQueryString(params = {}) {
    return Object.keys(params)
        .sort()
        .map((key) => `${encodeVnpayValue(key)}=${encodeVnpayValue(params[key])}`)
        .join("&");
}

export function signVnpayParams(params = {}, hashSecret = process.env.VNP_HASH_SECRET) {
    const signData = { ...params };
    delete signData.vnp_SecureHash;
    delete signData.vnp_SecureHashType;

    const query = buildVnpayQueryString(signData);
    return hmacSha512(hashSecret, query);
}

export function verifyVnpaySignature(params = {}, hashSecret = process.env.VNP_HASH_SECRET) {
    const normalized = normalizeVnpayParams(params);
    const providedSignature = normalized.vnp_SecureHash;
    if (!providedSignature || !hashSecret) return false;

    const expectedSignature = signVnpayParams(normalized, hashSecret);
    return expectedSignature.toLowerCase() === providedSignature.toLowerCase();
}

export function getVnpayConfig() {
    const paymentUrl = process.env.VNP_URL;
    const inferredApiUrl =
        process.env.VNP_API_URL ||
        (String(paymentUrl || "").includes("sandbox")
            ? DEFAULT_QUERYDR_SANDBOX_URL
            : DEFAULT_QUERYDR_PRODUCTION_URL);
    const config = {
        tmnCode: process.env.VNP_TMNCODE,
        hashSecret: process.env.VNP_HASH_SECRET,
        url: paymentUrl,
        apiUrl: inferredApiUrl,
        apiIp: process.env.VNP_API_IP || "127.0.0.1",
        returnUrl: process.env.VNP_RETURN_URL,
        ipnUrl: process.env.VNP_IPN_URL,
        locale: process.env.VNP_LOCALE || "vn",
        orderType: process.env.VNP_ORDER_TYPE || "other",
        expireMinutes: Number(process.env.VNP_EXPIRE_MINUTES || 15),
        timeZone: process.env.VNP_TIMEZONE || DEFAULT_TIMEZONE,
        paymentReturnRedirectUrl: process.env.PAYMENT_RETURN_REDIRECT_URL || "",
    };

    const missingKeys = ["tmnCode", "hashSecret", "url", "returnUrl", "ipnUrl"].filter(
        (key) => !config[key]
    );

    if (missingKeys.length > 0) {
        throw new Error(`Thiếu cấu hình VNPay: ${missingKeys.join(", ")}`);
    }

    return config;
}

export function buildTxnRef(userId) {
    const random = crypto.randomBytes(4).toString("hex").toUpperCase();
    return `VIP${userId}${Date.now()}${random}`.slice(0, 64);
}

export function getClientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
        return forwarded.split(",")[0].trim();
    }

    return (
        req.headers["x-real-ip"] ||
        req.socket?.remoteAddress ||
        req.ip ||
        "127.0.0.1"
    );
}

export function amountToVnpay(amount) {
    return Number(amount || 0) * 100;
}

export function amountFromVnpay(amount) {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed)) return null;
    return Math.round(parsed / 100);
}

export function buildVnpayPaymentUrl({
    config,
    txnRef,
    amount,
    ipAddr,
    orderInfo,
    createDate = new Date(),
    expireDate,
    bankCode,
}) {
    const params = {
        vnp_Version: "2.1.0",
        vnp_Command: "pay",
        vnp_TmnCode: config.tmnCode,
        vnp_Locale: config.locale,
        vnp_CurrCode: "VND",
        vnp_TxnRef: txnRef,
        vnp_OrderInfo: orderInfo,
        vnp_OrderType: config.orderType,
        vnp_Amount: amountToVnpay(amount),
        vnp_ReturnUrl: config.returnUrl,
        vnp_IpAddr: ipAddr,
        vnp_CreateDate: toVnpayDate(createDate, config.timeZone),
    };

    if (expireDate) {
        params.vnp_ExpireDate = toVnpayDate(expireDate, config.timeZone);
    }

    if (bankCode) {
        params.vnp_BankCode = bankCode;
    }

    const secureHash = signVnpayParams(params, config.hashSecret);
    const query = buildVnpayQueryString({
        ...params,
        vnp_SecureHash: secureHash,
    });

    return `${config.url}?${query}`;
}

export function isVnpaySuccess(params = {}) {
    return params.vnp_ResponseCode === "00" && params.vnp_TransactionStatus === "00";
}

export function mapPaymentStatusFromVnpay(params = {}) {
    if (isVnpaySuccess(params)) return "succeeded";
    if (params.vnp_ResponseCode === "24") return "cancelled";
    if (params.vnp_ResponseCode === "11") return "expired";
    return "failed";
}

export function mapVnpayMessage(params = {}) {
    if (isVnpaySuccess(params)) return "Giao dịch thành công";
    if (params.vnp_ResponseCode === "24") return "Khách hàng hủy giao dịch";
    if (params.vnp_ResponseCode === "11") return "Giao dịch đã hết hạn";
    if (params.vnp_ResponseCode) return `VNPay response code: ${params.vnp_ResponseCode}`;
    return "Không xác định được trạng thái giao dịch";
}

export function buildRedirectUrl(baseUrl, params = {}) {
    if (!baseUrl) return "";

    const url = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        url.searchParams.set(key, String(value));
    });

    return url.toString();
}

export function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60 * 1000);
}

export function formatIpnResponse(RspCode, Message) {
    return { RspCode, Message };
}

export function buildVnpayQuerydrChecksumData(params = {}) {
    return [
        params.vnp_RequestId,
        params.vnp_Version,
        params.vnp_Command,
        params.vnp_TmnCode,
        params.vnp_TxnRef,
        params.vnp_TransactionDate,
        params.vnp_CreateDate,
        params.vnp_IpAddr,
        params.vnp_OrderInfo,
    ]
        .map((value) => String(value ?? ""))
        .join("|");
}

export function signVnpayQuerydrRequest(params = {}, hashSecret = process.env.VNP_HASH_SECRET) {
    return hmacSha512(hashSecret, buildVnpayQuerydrChecksumData(params));
}

export function buildVnpayQuerydrResponseChecksumData(params = {}) {
    return [
        params.vnp_ResponseId,
        params.vnp_Command,
        params.vnp_ResponseCode,
        params.vnp_Message,
        params.vnp_TmnCode,
        params.vnp_TxnRef,
        params.vnp_Amount,
        params.vnp_BankCode,
        params.vnp_PayDate,
        params.vnp_TransactionNo,
        params.vnp_TransactionType,
        params.vnp_TransactionStatus,
        params.vnp_OrderInfo,
        params.vnp_PromotionCode,
        params.vnp_PromotionAmount,
    ]
        .map((value) => String(value ?? ""))
        .join("|");
}

export function verifyVnpayQuerydrResponse(params = {}, hashSecret = process.env.VNP_HASH_SECRET) {
    const providedSignature = params?.vnp_SecureHash;
    if (!providedSignature || !hashSecret) return false;
    const expectedSignature = hmacSha512(
        hashSecret,
        buildVnpayQuerydrResponseChecksumData(params)
    );
    return expectedSignature.toLowerCase() === String(providedSignature).toLowerCase();
}
