import express from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { uploadTitleImages } from "../middlewares/uploadTitleImages.js";
import {
    addMediaVariant,
    listAdminTitles,
    getAdminTitle,
    createAdminTitle,
    deleteMediaOrigin,
    updateAdminTitle,
    deleteMediaVariant,
    deleteAdminTitle,
    replaceTitleCredits,
    listTitleMediaOrigins,
    updateMediaVariant,
    upsertTitleMediaOriginByPurpose,
} from "../controllers/adminTitles.controller.js";

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
router.put("/titles/:id/media-origins/:purpose", upsertTitleMediaOriginByPurpose);
router.delete("/media-origins/:originId", deleteMediaOrigin);

router.post("/media-origins/:originId/variants", addMediaVariant);
router.put("/media-variants/:id", updateMediaVariant);
router.delete("/media-variants/:id", deleteMediaVariant);

export default router;
