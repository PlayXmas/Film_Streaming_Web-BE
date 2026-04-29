import express from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { uploadTitleImages } from "../middlewares/uploadTitleImages.js";
import { uploadMediaVideo } from "../middlewares/uploadMediaVideo.js";
import {
    listAdminTitles,
    getAdminTitle,
    createAdminTitle,
    updateAdminTitle,
    deleteAdminTitle,
    replaceTitleCredits,
    listTitleMediaOrigins,
} from "../controllers/adminTitles.controller.js";
import {
    uploadTitleSourceVideo,
} from "../controllers/adminMediaPipeline.controller.js";

const router = express.Router();

router.use(authenticate, authorizeRoles("admin"));

const uploadImages = uploadTitleImages.fields([
    { name: "poster", maxCount: 1 },
    { name: "backdrop", maxCount: 1 },
]);

router.get("/titles", listAdminTitles);
router.get("/titles/:id", getAdminTitle);
router.post("/titles", uploadImages, createAdminTitle);
router.put("/titles/:id", uploadImages, updateAdminTitle);
router.delete("/titles/:id", deleteAdminTitle);
router.put("/titles/:id/credits", replaceTitleCredits);

router.get("/titles/:id/media-origins", listTitleMediaOrigins);
router.post("/titles/:id/media-upload", uploadMediaVideo.single("video"), uploadTitleSourceVideo);

export default router;
