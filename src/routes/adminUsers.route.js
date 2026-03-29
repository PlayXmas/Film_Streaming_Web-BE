import express from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import {
    getAdminUserById,
    getAdminUserReviews,
    getAdminUsers,
    patchAdminUser,
    patchAdminUserStatus,
    removeAdminReview,
} from "../controllers/adminUsers.controller.js";

const router = express.Router();

router.use(authenticate, authorizeRoles("admin"));

router.get("/users", getAdminUsers);
router.get("/users/:id", getAdminUserById);
router.patch("/users/:id", patchAdminUser);
router.patch("/users/:id/status", patchAdminUserStatus);
router.get("/users/:id/reviews", getAdminUserReviews);
router.delete("/reviews/:reviewId", removeAdminReview);

export default router;
