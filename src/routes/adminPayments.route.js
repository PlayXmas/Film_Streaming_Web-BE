import express from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import {
    getAdminPaymentById,
    getAdminPayments,
    postAdminPaymentManualConfirm,
    postAdminPaymentMarkFailed,
    postAdminPaymentQuerydr,
} from "../controllers/adminPayments.controller.js";

const router = express.Router();

router.use(authenticate, authorizeRoles("admin"));

router.get("/payments", getAdminPayments);
router.get("/payments/:id", getAdminPaymentById);
router.post("/payments/:id/querydr", postAdminPaymentQuerydr);
router.post("/payments/:id/manual-confirm", postAdminPaymentManualConfirm);
router.post("/payments/:id/mark-failed", postAdminPaymentMarkFailed);

export default router;
