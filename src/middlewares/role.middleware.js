// src/middlewares/role.middleware.js
export const authorizeRoles = (...roles) => (req, res, next) => {
    const role = req.user?.role;
    if (!role) {
        return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
    }
    if (!roles.includes(role)) {
        return res.status(403).json({ success: false, message: "Không có quyền truy cập" });
    }
    next();
};
