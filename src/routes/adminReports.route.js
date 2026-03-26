import express from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import {
    getAdminReportById,
    getAdminReports,
    getAdminReportsSummary,
    patchAdminReport,
} from "../controllers/adminReports.controller.js";

const router = express.Router();

router.use(authenticate, authorizeRoles("admin"));

router.get("/reports/summary", getAdminReportsSummary);
router.get("/reports", getAdminReports);
router.get("/reports/:id", getAdminReportById);
router.patch("/reports/:id", patchAdminReport);

export default router;
