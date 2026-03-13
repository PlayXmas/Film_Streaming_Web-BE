import express from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { uploadTitleImages } from "../middlewares/uploadTitleImages.js";
import {
    addVariant,
    createAdminMovie,
    deleteAdminMovie,
    deleteOrigin,
    deleteVariant,
    getAdminMovieDetail,
    listAdminMovies,
    listMovieOrigins,
    updateAdminMovie,
    updateVariant,
    upsertMovieOriginByPurpose,
} from "../controllers/adminMovies.controller.js";

const router = express.Router();

router.use(authenticate, authorizeRoles("admin"));

const uploadImages = uploadTitleImages.fields([
    { name: "poster", maxCount: 1 },
    { name: "backdrop", maxCount: 1 },
]);

// Movies (phim lẻ)
router.get("/movies", listAdminMovies);
router.get("/movies/:id", getAdminMovieDetail);
router.post("/movies", uploadImages, createAdminMovie);
router.put("/movies/:id", uploadImages, updateAdminMovie);
router.delete("/movies/:id", deleteAdminMovie);

// Media origins (theo movie)
router.get("/movies/:id/media-origins", listMovieOrigins);
router.put("/movies/:id/media-origins/:purpose", upsertMovieOriginByPurpose);
router.delete("/media-origins/:originId", deleteOrigin);

// Media variants
router.post("/media-origins/:originId/variants", addVariant);
router.put("/media-variants/:id", updateVariant);
router.delete("/media-variants/:id", deleteVariant);

export default router;
