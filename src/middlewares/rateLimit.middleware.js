const DEFAULT_MESSAGE = "Bạn thao tác quá nhanh. Vui lòng thử lại sau.";

function getClientIp(req) {
    const forwardedFor = req.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string" && forwardedFor.trim()) {
        return forwardedFor.split(",")[0].trim();
    }

    return (
        req.headers["x-real-ip"] ||
        req.socket?.remoteAddress ||
        req.ip ||
        "unknown"
    );
}

export function createRateLimit({
    windowMs,
    max,
    message = DEFAULT_MESSAGE,
    keyGenerator,
} = {}) {
    if (!Number.isInteger(windowMs) || windowMs <= 0) {
        throw new Error("windowMs phải là số nguyên dương");
    }
    if (!Number.isInteger(max) || max <= 0) {
        throw new Error("max phải là số nguyên dương");
    }

    const store = new Map();

    return (req, res, next) => {
        const now = Date.now();
        const key = keyGenerator
            ? keyGenerator(req)
            : `${req.method}:${req.baseUrl || ""}${req.path}:${getClientIp(req)}`;

        const existing = store.get(key);
        if (!existing || existing.resetAt <= now) {
            store.set(key, {
                count: 1,
                resetAt: now + windowMs,
            });
            return next();
        }

        if (existing.count >= max) {
            const retryAfterSeconds = Math.max(
                1,
                Math.ceil((existing.resetAt - now) / 1000)
            );

            res.setHeader("Retry-After", String(retryAfterSeconds));
            return res.status(429).json({
                success: false,
                message,
                data: {
                    retry_after_seconds: retryAfterSeconds,
                },
            });
        }

        existing.count += 1;

        if (store.size > 5000) {
            for (const [entryKey, entry] of store.entries()) {
                if (entry.resetAt <= now) {
                    store.delete(entryKey);
                }
            }
        }

        return next();
    };
}
