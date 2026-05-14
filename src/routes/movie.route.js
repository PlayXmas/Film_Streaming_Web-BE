// src/routes/movie.route.js
import { Router } from "express";
import { getMovies, searchMovies, getMovieDetail, getMovieEpisodes } from "../controllers/title.controller.js";
import { logMovieSearch, recordMovieSearchClick } from "../controllers/searchLog.controller.js";
import { optionalAuthenticate } from "../middlewares/auth.middleware.js";


const router = Router();

// GET /api/movies
router.get("/", getMovies);
router.get("/search", searchMovies);
router.post("/search/log", optionalAuthenticate, logMovieSearch);
router.post("/search/click", optionalAuthenticate, recordMovieSearchClick);
router.get("/:id", getMovieDetail);
router.get("/:id/episodes", getMovieEpisodes);

export default router;
