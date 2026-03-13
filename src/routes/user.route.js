// src/routes/user.route.js
import express from "express";
import { getMe, updateMe, changePassword, uploadMyAvatar, deleteMyAvatar } from "../controllers/user.controller.js";
import { uploadAvatar } from "../middlewares/uploadAvatar.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";

import {
    getMyWatchHistory,
    updateMyWatchHistory,
    deleteMyWatchHistoryItem,
    clearMyWatchHistory
} from "../controllers/watchHistory.controller.js";
import { getMyFavorites, addFavorite, removeFavorite } from "../controllers/favorite.controller.js";
import { changeMySubscription, getMySubscription } from "../controllers/subscription.controller.js";
import { getMyPayments } from "../controllers/payment.controller.js";

const router = express.Router();

//  chỉ free/vip mới được dùng các API /users/*
const userOnly = [authenticate, authorizeRoles("free", "vip")];

router.get("/me", ...userOnly, getMe);
router.put("/me", ...userOnly, updateMe);
router.put("/me/password", ...userOnly, changePassword);
router.post("/me/avatar", ...userOnly, uploadAvatar.single("avatar"), uploadMyAvatar);
router.delete("/me/avatar", ...userOnly, deleteMyAvatar);

router.get("/watch-history", ...userOnly, getMyWatchHistory);
router.put("/watch-history", ...userOnly, updateMyWatchHistory);
router.delete("/watch-history/:id", ...userOnly, deleteMyWatchHistoryItem);
router.delete("/watch-history", ...userOnly, clearMyWatchHistory);

router.get("/favorites", ...userOnly, getMyFavorites);
router.post("/favorites/:titleId", ...userOnly, addFavorite);
router.delete("/favorites/:titleId", ...userOnly, removeFavorite);

router.get("/subscription", ...userOnly, getMySubscription);
router.post("/subscription", ...userOnly, changeMySubscription);

router.get("/payments", ...userOnly, getMyPayments);

export default router;
