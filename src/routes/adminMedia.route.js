import express from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import {
    deleteManagedMediaOrigin,
    listMediaOriginJobs,
    reprocessMediaOrigin,
    updateMediaOriginSettings,
    updateMediaVariantTier,
} from "../controllers/adminMediaPipeline.controller.js";

const router = express.Router();

router.use(authenticate, authorizeRoles("admin"));

router.patch("/media-origins/:originId", updateMediaOriginSettings);
router.delete("/media-origins/:originId", deleteManagedMediaOrigin);
router.get("/media-origins/:originId/jobs", listMediaOriginJobs);
router.post("/media-origins/:originId/reprocess", reprocessMediaOrigin);
router.patch("/media-variants/:id/tier", updateMediaVariantTier);

export default router;
