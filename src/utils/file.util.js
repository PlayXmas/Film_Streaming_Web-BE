import fs from "fs/promises";
import path from "path";

const uploadRoot = path.resolve(process.cwd(), "uploads");

export async function deleteUploadFileByUrl(url) {
    if (!url) return false;

    const raw = String(url);
    const clean = raw.split("?")[0].split("#")[0];
    if (!clean.startsWith("/uploads/")) return false;

    const relativePath = clean.replace(/^\/+/, "");
    const filePath = path.resolve(process.cwd(), relativePath);

    if (filePath === uploadRoot || !filePath.startsWith(`${uploadRoot}${path.sep}`)) {
        return false;
    }

    try {
        await fs.unlink(filePath);
        return true;
    } catch (err) {
        if (err?.code === "ENOENT") return false;
        throw err;
    }
}
