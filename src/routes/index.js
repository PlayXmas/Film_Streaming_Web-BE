// src/routes/index.js
import express from "express";
import authRoutes from "./auth.route.js";
import userRoutes from "./user.route.js";
import movieRoute from "./movie.route.js";
import genreRoute from "./genre.route.js";
import titleRoutes from "./title.route.js";
import personRouter from "./person.route.js"
import reviewRoutes from "./review.route.js";
import reportRoutes from "./report.route.js";
import planRoutes from "./plan.route.js";
import adminDashboardRoutes from "./adminDashboard.route.js";
import adminReportsRoutes from "./adminReports.route.js";
import adminTitlesRoutes from "./adminTitles.route.js";
import adminSeriesRoutes from "./adminSeries.route.js";
import adminPeopleRoutes from "./adminPeople.route.js";
import adminUsersRoutes from "./adminUsers.route.js";
import recommendationRoutes from "./recommendation.route.js";

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/movies", movieRoute);
router.use("/genres", genreRoute);
router.use("/titles", titleRoutes);
router.use("/person", personRouter);
router.use("/reviews", reviewRoutes);
router.use("/reports", reportRoutes);
router.use("/plans", planRoutes);
router.use("/admin", adminDashboardRoutes);
router.use("/admin", adminReportsRoutes);
router.use("/admin", adminTitlesRoutes);
router.use("/admin", adminSeriesRoutes);
router.use("/admin", adminPeopleRoutes);
router.use("/admin", adminUsersRoutes);
router.use("/recommendations", recommendationRoutes);
export default router;
