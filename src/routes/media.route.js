import express from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import {
    getProtectedVariantAsset,
    getProtectedMasterPlaylist,
    getProtectedVariantPlaylist,
} from "../controllers/mediaStream.controller.js";

const router = express.Router();

router.use(authenticate);
router.get("/origins/:originId/hls/master.m3u8", getProtectedMasterPlaylist);
router.get("/origins/:originId/hls/:quality/index.m3u8", getProtectedVariantPlaylist);
router.get("/origins/:originId/hls/:quality/assets/:assetName", getProtectedVariantAsset);

export default router;
