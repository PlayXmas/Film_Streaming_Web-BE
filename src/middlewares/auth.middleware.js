// src/middlewares/auth.middleware.js
import { verifyToken } from "../utils/jwt.util.js";
import { User } from "../models/index.js";
import { syncUserVipAccess } from "../services/subscriptionAccess.service.js";

export const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: "Không có header Authorization",
            });
        }

        // Hỗ trợ mọi kiểu space: "Bearer xxx", "Bearer   xxx"
        const [scheme, token] = authHeader.trim().split(/\s+/);

        if (scheme !== "Bearer" || !token) {
            return res.status(401).json({
                success: false,
                message: "Token không hợp lệ",
            });
        }

        let decoded;
        try {
            decoded = verifyToken(token); // { id, email, role, iat, exp }
        } catch (err) {
            return res.status(401).json({
                success: false,
                message: "Token không hợp lệ hoặc đã hết hạn",
            });
        }

        const user = await User.findByPk(decoded.id);

        if (!user || !user.is_active) {
            return res.status(401).json({
                success: false,
                message: "Tài khoản không tồn tại hoặc đã bị vô hiệu hóa",
            });
        }

        await syncUserVipAccess(user);

        req.user = user;
        next();
    } catch (err) {
        console.error("Auth middleware error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi xác thực",
        });
    }
};
