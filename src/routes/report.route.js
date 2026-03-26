import { Router } from "express";
import {
    createPlaybackReport,
    getReportReasons,
} from "../controllers/report.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

// GET /api/reports/reasons
router.get("/reasons", getReportReasons);

// POST /api/reports/playback
router.post("/playback", authenticate, createPlaybackReport);

export default router;
