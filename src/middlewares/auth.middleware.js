// src/middlewares/auth.middleware.js
import { verifyToken } from "../utils/jwt.util.js";
import { User } from "../models/index.js";
import { applyEffectiveVipAccess } from "../services/subscriptionAccess.service.js";

async function resolveAuthenticatedUser(authHeader) {
    if (!authHeader) {
        return {
            error: {
                status: 401,
                message: "Không có header Authorization",
            },
        };
    }

    const [scheme, token] = authHeader.trim().split(/\s+/);
    if (scheme !== "Bearer" || !token) {
        return {
            error: {
                status: 401,
                message: "Token không hợp lệ",
            },
        };
    }

    let decoded;
    try {
        decoded = verifyToken(token);
    } catch (err) {
        return {
            error: {
                status: 401,
                message: "Token không hợp lệ hoặc đã hết hạn",
            },
        };
    }

    const user = await User.findByPk(decoded.id);
    if (!user || !user.is_active) {
        return {
            error: {
                status: 401,
                message: "Tài khoản không tồn tại hoặc đã bị vô hiệu hóa",
            },
        };
    }

    applyEffectiveVipAccess(user);
    return { user };
}

export const authenticate = async (req, res, next) => {
    try {
        const resolved = await resolveAuthenticatedUser(req.headers.authorization);
        if (resolved.error) {
            return res.status(resolved.error.status).json({
                success: false,
                message: resolved.error.message,
            });
        }

        req.user = resolved.user;
        next();
    } catch (err) {
        console.error("Auth middleware error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi xác thực",
        });
    }
};

export const optionalAuthenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return next();
        }

        const resolved = await resolveAuthenticatedUser(authHeader);
        if (resolved.error) {
            return next();
        }

        req.user = resolved.user;
        next();
    } catch (err) {
        console.error("Auth middleware error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi xác thực",
        });
    }
};
