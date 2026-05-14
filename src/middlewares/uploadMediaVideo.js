import "../bootstrap.js";
import fs from "fs";
import multer from "multer";
import path from "path";
import { getMediaTempRoot } from "../config/mediaStorage.js";

const uploadDir = getMediaTempRoot();
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || "");
        const suffix = Math.random().toString(36).slice(2, 10);
        cb(null, `video_${Date.now()}_${suffix}${ext}`);
    },
});

const allowedMimeTypes = new Set([
    "video/mp4",
    "video/x-matroska",
    "video/webm",
    "video/quicktime",
    "video/x-msvideo",
    "application/octet-stream",
]);

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const ok =
        allowedMimeTypes.has(file.mimetype) ||
        [".mp4", ".mkv", ".mov", ".webm", ".avi"].includes(ext);

    cb(ok ? null : new Error("Chỉ hỗ trợ file video MP4/MKV/MOV/WEBM/AVI"), ok);
};

const maxFileSize = Number.parseInt(
    process.env.MEDIA_UPLOAD_MAX_BYTES || `${10 * 1024 * 1024 * 1024}`,
    10
);

export const uploadMediaVideo = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: Number.isInteger(maxFileSize) && maxFileSize > 0
            ? maxFileSize
            : 10 * 1024 * 1024 * 1024,
    },
});
