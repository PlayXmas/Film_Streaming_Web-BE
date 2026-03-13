// src/routes/title.route.js
import { Router } from "express";
import {
    getTitleMedia,
    getTitlePlay,
    getTitleTrailer,
    getTitleCast,
    getTitleRatingSummary,
    rateTitle,
    increaseEpisodeView,
} from "../controllers/title.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

// Nếu xem phim bắt buộc đăng nhập:
router.get("/:id/media", authenticate, getTitleMedia);
router.get("/:id/play", authenticate, getTitlePlay);

router.get("/:id/trailer", getTitleTrailer);

router.get("/:id/cast", getTitleCast);

router.post("/:id/rating", authenticate, rateTitle);

// GET /api/titles/:id/rating-summary – thống kê rating
router.get("/:id/rating-summary", getTitleRatingSummary);

router.post("/episode/:id/view", increaseEpisodeView);
export default router;
