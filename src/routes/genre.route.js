// src/routes/genre.route.js
import { Router } from "express";
import { getGenres, getGenreMovies } from "../controllers/genre.controller.js";

const router = Router();

// GET /api/genres
router.get("/", getGenres);
// GET /api/genres/:id/movies
router.get("/:id/movies", getGenreMovies);
export default router;
