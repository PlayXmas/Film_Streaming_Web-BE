import express from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { getAdminDashboard } from "../controllers/adminDashboard.controller.js";

const router = express.Router();

router.get("/dashboard", authenticate, authorizeRoles("admin"), getAdminDashboard);

export default router;
