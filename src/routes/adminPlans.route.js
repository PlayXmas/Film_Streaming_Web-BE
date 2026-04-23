import express from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import {
    createAdminPlan,
    deleteAdminPlan,
    getAdminPlanDetail,
    getAdminPlans,
    updateAdminPlan,
    updateAdminPlanStatus,
} from "../controllers/plan.controller.js";

const router = express.Router();

router.use(authenticate, authorizeRoles("admin"));

router.get("/plans", getAdminPlans);
router.get("/plans/:id", getAdminPlanDetail);
router.post("/plans", createAdminPlan);
router.put("/plans/:id", updateAdminPlan);
router.patch("/plans/:id/status", updateAdminPlanStatus);
router.delete("/plans/:id", deleteAdminPlan);

export default router;
