// src/routes/movie.route.js
import { Router } from "express";
import { getMovies, getMovieDetail, getMovieEpisodes } from "../controllers/title.controller.js";


const router = Router();

// GET /api/movies
router.get("/", getMovies);
router.get("/:id", getMovieDetail);
router.get("/:id/episodes", getMovieEpisodes);

export default router;
