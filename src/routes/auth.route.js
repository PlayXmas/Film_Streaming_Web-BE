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
import { authorizeRoles } from "../middlewares/role.middleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/admin/register", authenticate, authorizeRoles("admin"), registerAdmin);

// user FE dùng route này (free/vip)
router.post("/login", login);
router.post("/google", loginWithGoogle);

// admin FE dùng route này (admin)
router.post("/admin/login", loginAdmin);

router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);

export default router;
