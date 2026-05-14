import fs from "fs/promises";
import path from "path";
import { Episode, MediaOrigin, MediaVariant, Season, Title } from "../models/index.js";
import {
    filterVariantsForTier,
    getUserPlaybackTier,
} from "../services/mediaPlayback.service.js";
import {
    uploadsUrlToAbsolutePath,
} from "../config/mediaStorage.js";

async function assertOriginAccess(origin, userTier) {
    if (origin.scope_type === "title") {
        const title = await Title.findByPk(origin.scope_id, {
            attributes: ["id", "is_public", "access_tier"],
        });

        if (!title || !title.is_public) {
            return { status: 404, message: "Không tìm thấy media" };
        }
        if (title.access_tier === "vip" && userTier !== "vip") {
            return { status: 403, message: "Bạn cần nâng cấp gói VIP để xem nội dung này" };
        }

        return null;
    }

    if (origin.scope_type === "episode") {
        const episode = await Episode.findByPk(origin.scope_id, {
            attributes: ["id", "access_tier"],
            include: [
                {
                    model: Season,
                    attributes: ["id", "access_tier", "title_id"],
                    include: [
                        {
                            model: Title,
                            attributes: ["id", "is_public", "access_tier"],
                        },
                    ],
                },
            ],
        });

        const title = episode?.Season?.Title;
        if (!episode || !title || !title.is_public) {
            return { status: 404, message: "Không tìm thấy media" };
        }
        if (title.access_tier === "vip" && userTier !== "vip") {
            return { status: 403, message: "Bạn cần nâng cấp gói VIP để xem nội dung này" };
        }
        if (episode.Season?.access_tier === "vip" && userTier !== "vip") {
            return { status: 403, message: "Bạn cần nâng cấp gói VIP để xem season này" };
        }
        if (episode.access_tier === "vip" && userTier !== "vip") {
            return { status: 403, message: "Bạn cần nâng cấp gói VIP để xem tập này" };
        }

        return null;
    }

    return { status: 400, message: "Origin không hỗ trợ stream protected" };
}

function buildMasterManifest(origin, variants) {
    const sortedVariants = [...variants].sort((a, b) => {
        const heightA = Number(a.height || 0);
        const heightB = Number(b.height || 0);
        if (heightA !== heightB) return heightA - heightB;
        return Number(a.bitrate_kbps || 0) - Number(b.bitrate_kbps || 0);
    });

    const lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-INDEPENDENT-SEGMENTS",
    ];

    for (const variant of sortedVariants) {
        const bandwidth = Math.max(1, Number(variant.bitrate_kbps || 0) * 1000);
        const resolution =
            variant.width && variant.height ? `${variant.width}x${variant.height}` : null;
        const qualityPath = `${encodeURIComponent(String(variant.quality || "").trim())}/index.m3u8`;

        lines.push(
            [
                "#EXT-X-STREAM-INF:BANDWIDTH=" + bandwidth,
                resolution ? `RESOLUTION=${resolution}` : null,
                variant.codec_video && variant.codec_audio
                    ? `CODECS="${variant.codec_video},${variant.codec_audio}"`
                    : null,
                `NAME="${variant.quality}"`,
            ]
                .filter(Boolean)
                .join(",")
        );
        lines.push(qualityPath);
    }

    lines.push("");
    return lines.join("\n");
}

function rewritePlaylistText(content) {
    return String(content || "")
        .split(/\r?\n/)
        .map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) {
                return line;
            }
            if (/^(https?:)?\/\//i.test(trimmed)) {
                return trimmed;
            }

            return `assets/${encodeURIComponent(trimmed)}`;
        })
        .join("\n");
}

function setPrivateMediaCacheHeaders(res) {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
}

function normalizeAssetName(value) {
    const assetName = String(value || "").trim();
    if (!assetName) return null;
    if (assetName.includes("/") || assetName.includes("\\")) return null;
    if (!/^[A-Za-z0-9._-]+$/.test(assetName)) return null;
    return assetName;
}

function getMediaAssetContentType(assetName) {
    const extension = path.extname(assetName).toLowerCase();
    if (extension === ".ts") return "video/mp2t";
    if (extension === ".m4s") return "video/iso.segment";
    if (extension === ".mp4") return "video/mp4";
    return "application/octet-stream";
}

async function findReadyOrigin(originId) {
    return MediaOrigin.findOne({
        where: {
            id: originId,
            delivery: "HLS",
            processing_status: "ready",
            is_active: true,
        },
        include: [{ model: MediaVariant }],
    });
}

export const getProtectedMasterPlaylist = async (req, res) => {
    try {
        const originId = Number.parseInt(req.params.originId, 10);
        if (!Number.isInteger(originId) || originId < 1) {
            return res.status(400).json({ success: false, message: "originId không hợp lệ" });
        }

        const origin = await findReadyOrigin(originId);
        if (!origin) {
            return res.status(404).json({ success: false, message: "Không tìm thấy stream HLS" });
        }

        const userTier = getUserPlaybackTier(req.user);
        const accessError = await assertOriginAccess(origin, userTier);
        if (accessError) {
            return res.status(accessError.status).json({
                success: false,
                message: accessError.message,
            });
        }

        const allowedVariants = filterVariantsForTier(origin.MediaVariants || [], userTier);
        if (!allowedVariants.length) {
            return res.status(403).json({
                success: false,
                message: "Không có quality nào phù hợp với gói hiện tại",
            });
        }

        setPrivateMediaCacheHeaders(res);
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
        return res.status(200).send(buildMasterManifest(origin, allowedVariants));
    } catch (error) {
        console.error("getProtectedMasterPlaylist error:", error);
        return res.status(500).json({ success: false, message: "Lỗi server khi tạo master playlist" });
    }
};

export const getProtectedVariantPlaylist = async (req, res) => {
    try {
        const originId = Number.parseInt(req.params.originId, 10);
        const quality = String(req.params.quality || "").trim();
        if (!Number.isInteger(originId) || originId < 1 || !quality) {
            return res.status(400).json({ success: false, message: "originId hoặc quality không hợp lệ" });
        }

        const origin = await findReadyOrigin(originId);
        if (!origin) {
            return res.status(404).json({ success: false, message: "Không tìm thấy stream HLS" });
        }

        const userTier = getUserPlaybackTier(req.user);
        const accessError = await assertOriginAccess(origin, userTier);
        if (accessError) {
            return res.status(accessError.status).json({
                success: false,
                message: accessError.message,
            });
        }

        const variant = filterVariantsForTier(origin.MediaVariants || [], userTier).find(
            (item) => item.quality === quality
        );
        if (!variant?.playlist_url) {
            return res.status(404).json({ success: false, message: "Không tìm thấy quality" });
        }

        const absolutePath = uploadsUrlToAbsolutePath(variant.playlist_url);
        const content = await fs.readFile(absolutePath, "utf8");
        const rewritten = rewritePlaylistText(content);

        setPrivateMediaCacheHeaders(res);
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
        return res.status(200).send(rewritten);
    } catch (error) {
        console.error("getProtectedVariantPlaylist error:", error);
        return res.status(500).json({ success: false, message: "Lỗi server khi đọc variant playlist" });
    }
};

export const getProtectedVariantAsset = async (req, res) => {
    try {
        const originId = Number.parseInt(req.params.originId, 10);
        const quality = String(req.params.quality || "").trim();
        const assetName = normalizeAssetName(req.params.assetName);

        if (!Number.isInteger(originId) || originId < 1 || !quality || !assetName) {
            return res.status(400).json({
                success: false,
                message: "originId, quality hoặc assetName không hợp lệ",
            });
        }

        const origin = await findReadyOrigin(originId);
        if (!origin) {
            return res.status(404).json({ success: false, message: "Không tìm thấy stream HLS" });
        }

        const userTier = getUserPlaybackTier(req.user);
        const accessError = await assertOriginAccess(origin, userTier);
        if (accessError) {
            return res.status(accessError.status).json({
                success: false,
                message: accessError.message,
            });
        }

        const variant = filterVariantsForTier(origin.MediaVariants || [], userTier).find(
            (item) => item.quality === quality
        );
        if (!variant) {
            return res.status(404).json({ success: false, message: "Không tìm thấy quality" });
        }

        const playlistAbsolutePath = uploadsUrlToAbsolutePath(variant.playlist_url);
        const variantDir = path.dirname(playlistAbsolutePath);
        const absolutePath = path.resolve(path.join(variantDir, assetName));
        if (
            absolutePath !== path.join(variantDir, assetName) ||
            !absolutePath.startsWith(`${variantDir}${path.sep}`)
        ) {
            return res.status(400).json({ success: false, message: "assetName không hợp lệ" });
        }

        const fileBuffer = await fs.readFile(absolutePath);
        setPrivateMediaCacheHeaders(res);
        res.setHeader("Content-Type", getMediaAssetContentType(assetName));
        return res.status(200).send(fileBuffer);
    } catch (error) {
        if (error?.code === "ENOENT") {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy segment media",
            });
        }

        console.error("getProtectedVariantAsset error:", error);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi đọc segment media",
        });
    }
};
