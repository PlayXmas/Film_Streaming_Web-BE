import express from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { uploadPersonAvatar } from "../middlewares/uploadPersonAvatar.js";
import {
    createAdminPerson,
    deleteAdminPerson,
    deleteAdminPersonAvatar,
    getAdminPerson,
    listAdminPeople,
    uploadAdminPersonAvatar,
    updateAdminPerson,
} from "../controllers/adminPeople.controller.js";

const router = express.Router();

router.use(authenticate, authorizeRoles("admin"));

router.get("/people", listAdminPeople);
router.get("/people/:id", getAdminPerson);
router.post("/people", createAdminPerson);
router.put("/people/:id", updateAdminPerson);
router.post("/people/:id/avatar", uploadPersonAvatar.single("avatar"), uploadAdminPersonAvatar);
router.delete("/people/:id/avatar", deleteAdminPersonAvatar);
router.delete("/people/:id", deleteAdminPerson);

export default router;
