// src/routes/recommendation.route.js
import { Router } from "express";
import { getPersonalizedRecommendations } from "../controllers/recommendation.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

// GET /api/recommendations/personalized?limit=20
router.get("/personalized", authenticate, getPersonalizedRecommendations);

export default router;
