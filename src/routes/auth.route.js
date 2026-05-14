// src/routes/auth.route.js
import express from "express";
import {
    register,
    login,
    loginAdmin,
    loginWithGoogle,
    registerAdmin,
    forgotPassword,
    verifyOtp,
    resetPassword,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { createRateLimit } from "../middlewares/rateLimit.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";

const router = express.Router();
const authBurstLimit = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.",
});
const resetRequestLimit = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: "Bạn đã yêu cầu đặt lại mật khẩu quá nhiều lần. Vui lòng thử lại sau.",
});
const otpVerifyLimit = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Bạn đã nhập mã xác thực quá nhiều lần. Vui lòng thử lại sau.",
});

router.post("/register", register);
router.post("/admin/register", authenticate, authorizeRoles("admin"), registerAdmin);

// user FE dùng route này (free/vip)
router.post("/login", authBurstLimit, login);
router.post("/google", authBurstLimit, loginWithGoogle);

// admin FE dùng route này (admin)
router.post("/admin/login", authBurstLimit, loginAdmin);

router.post("/forgot-password", resetRequestLimit, forgotPassword);
router.post("/verify-otp", otpVerifyLimit, verifyOtp);
router.post("/reset-password", otpVerifyLimit, resetPassword);

export default router;
