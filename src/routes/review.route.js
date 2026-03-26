// src/routes/review.route.js
import { Router } from "express";
import {
    getEpisodeReviews,
    createEpisodeReview,
    getTitleReviews,
    createTitleReview,
} from "../controllers/review.controller.js";
import { createReviewReport } from "../controllers/report.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

/**
 * EPISODE REVIEWS
 * GET  /api/reviews/episode/:id?page=&limit=   (hoặc pageSize=)
 * POST /api/reviews/episode/:id
 */
router.get("/episode/:id", getEpisodeReviews);
router.post("/episode/:id", authenticate, createEpisodeReview);
/**
 * TITLE REVIEWS (movie comment)
 * GET  /api/reviews/title/:id?page=&limit=   (hoặc pageSize=)
 * POST /api/reviews/title/:id
 */
router.get("/title/:id", getTitleReviews);
router.post("/title/:id", authenticate, createTitleReview);
router.post("/:id/report", authenticate, createReviewReport);

export default router;
