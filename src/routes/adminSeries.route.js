import express from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { uploadTitleImages } from "../middlewares/uploadTitleImages.js";
import { uploadMediaVideo } from "../middlewares/uploadMediaVideo.js";
import {
    createAdminSeries,
    createSeasonEpisode,
    createSeriesSeason,
    deleteAdminSeries,
    deleteEpisode,
    deleteSeason,
    getAdminSeriesDetail,
    listAdminSeries,
    listEpisodeMediaOrigins,
    listSeasonEpisodes,
    listSeriesSeasons,
    updateAdminSeries,
    updateEpisode,
    updateSeason,
} from "../controllers/adminSeries.controller.js";
import {
    uploadEpisodeSourceVideo,
} from "../controllers/adminMediaPipeline.controller.js";

const router = express.Router();

router.use(authenticate, authorizeRoles("admin"));

const uploadImages = uploadTitleImages.fields([
    { name: "poster", maxCount: 1 },
    { name: "backdrop", maxCount: 1 },
]);

// Series (phim bộ)
router.get("/series", listAdminSeries);
router.get("/series/:id", getAdminSeriesDetail);
router.post("/series", uploadImages, createAdminSeries);
router.put("/series/:id", uploadImages, updateAdminSeries);
router.delete("/series/:id", deleteAdminSeries);

// Seasons
router.get("/series/:seriesId/seasons", listSeriesSeasons);
router.post("/series/:seriesId/seasons", createSeriesSeason);
router.put("/seasons/:seasonId", updateSeason);
router.delete("/seasons/:seasonId", deleteSeason);

// Episodes
router.get("/seasons/:seasonId/episodes", listSeasonEpisodes);
router.post("/seasons/:seasonId/episodes", createSeasonEpisode);
router.put("/episodes/:episodeId", updateEpisode);
router.delete("/episodes/:episodeId", deleteEpisode);

// Episode media origins (multi)
router.get("/episodes/:episodeId/media-origins", listEpisodeMediaOrigins);
router.post("/episodes/:episodeId/media-upload", uploadMediaVideo.single("video"), uploadEpisodeSourceVideo);
export default router;
