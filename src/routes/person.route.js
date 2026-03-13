// src/routes/person.route.js
import { Router } from "express";
import {
    getPersonById,
    getPersonTitles,
    getPeople
} from "../controllers/person.controller.js";

const router = Router();

// Danh sách toàn bộ diễn viên
router.get("/people", getPeople);
// Info 1 diễn viên
router.get("/:id", getPersonById);
// Danh sách phim có diễn viên đó
router.get("/:id/titles", getPersonTitles);


export default router;
