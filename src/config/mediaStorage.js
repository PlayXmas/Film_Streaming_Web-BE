import fs from "fs";
import path from "path";

const uploadsRoot = path.resolve(process.cwd(), "uploads");
const mediaRoot = path.resolve(
    process.env.MEDIA_STORAGE_ROOT || path.join(uploadsRoot, "media")
);
const tempRoot = path.join(mediaRoot, "tmp");
const sourceRoot = path.join(mediaRoot, "source");
const hlsRoot = path.join(mediaRoot, "hls");

for (const dir of [uploadsRoot, mediaRoot, tempRoot, sourceRoot, hlsRoot]) {
    fs.mkdirSync(dir, { recursive: true });
}

function normalizePathForUrl(value) {
    return String(value || "").replace(/\\/g, "/");
}

export function getMediaTempRoot() {
    return tempRoot;
}

export function getOriginSourceDir(originId) {
    return path.join(sourceRoot, String(originId));
}

export function getOriginHlsDir(originId) {
    return path.join(hlsRoot, String(originId));
}

export function getOriginVariantDir(originId, quality) {
    return path.join(getOriginHlsDir(originId), String(quality));
}

export function getUploadsRoot() {
    return uploadsRoot;
}

export function toUploadsUrl(absolutePath) {
    const relative = path.relative(uploadsRoot, absolutePath);
    if (!relative || relative.startsWith("..")) {
        throw new Error("Path nằm ngoài uploads root");
    }

    return `/uploads/${normalizePathForUrl(relative)}`;
}

export function uploadsUrlToAbsolutePath(urlPath) {
    const clean = String(urlPath || "").split("?")[0].split("#")[0];
    if (!clean.startsWith("/uploads/")) {
        throw new Error("URL media không hợp lệ");
    }

    const relative = clean.replace(/^\/+/, "");
    const absolute = path.resolve(process.cwd(), relative);
    if (absolute === uploadsRoot || !absolute.startsWith(`${uploadsRoot}${path.sep}`)) {
        throw new Error("URL media nằm ngoài uploads root");
    }

    return absolute;
}

export function buildPublicUrl(req, relativePath) {
    const base = `${req.protocol}://${req.get("host")}`;
    return new URL(relativePath, `${base}/`).toString();
}
