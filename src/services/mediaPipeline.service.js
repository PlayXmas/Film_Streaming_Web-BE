import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { MediaJob, MediaOrigin, MediaVariant, sequelize } from "../models/index.js";
import {
    getOriginHlsDir,
    getOriginSourceDir,
    getOriginVariantDir,
    toUploadsUrl,
    uploadsUrlToAbsolutePath,
} from "../config/mediaStorage.js";

export const VIDEO_QUALITY_PROFILES = [
    {
        quality: "360p",
        width: 640,
        height: 360,
        bitrateKbps: 800,
        audioBitrateKbps: 96,
        requiredTier: "free",
    },
    {
        quality: "480p",
        width: 854,
        height: 480,
        bitrateKbps: 1400,
        audioBitrateKbps: 128,
        requiredTier: "free",
    },
    {
        quality: "720p",
        width: 1280,
        height: 720,
        bitrateKbps: 2800,
        audioBitrateKbps: 128,
        requiredTier: "vip",
    },
    {
        quality: "1080p",
        width: 1920,
        height: 1080,
        bitrateKbps: 5000,
        audioBitrateKbps: 192,
        requiredTier: "vip",
    },
];

function shouldKeepVariant(profile) {
    const maxHeightRaw = Number.parseInt(process.env.MEDIA_MAX_OUTPUT_HEIGHT || "", 10);
    if (!Number.isInteger(maxHeightRaw) || maxHeightRaw < 360) return true;
    return profile.height <= maxHeightRaw;
}

function getEnabledProfiles() {
    return VIDEO_QUALITY_PROFILES.filter(shouldKeepVariant);
}

function parseFfprobeDuration(output) {
    const value = Number.parseFloat(String(output || "").trim());
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.round(value);
}

function parseFfprobeVideoDimensions(output) {
    try {
        const parsed = JSON.parse(String(output || "{}"));
        const stream = Array.isArray(parsed.streams) ? parsed.streams[0] : null;
        const width = Number.parseInt(stream?.width, 10);
        const height = Number.parseInt(stream?.height, 10);

        if (
            !Number.isInteger(width) ||
            width <= 0 ||
            !Number.isInteger(height) ||
            height <= 0
        ) {
            return null;
        }

        return { width, height };
    } catch {
        return null;
    }
}

function formatMediaProcessingError(error) {
    return String(error?.stderr || error?.message || error || "Unknown error");
}

function buildMasterManifest(variants) {
    const lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-INDEPENDENT-SEGMENTS",
    ];

    for (const variant of variants) {
        const bandwidth = Math.max(1, Number(variant.bitrateKbps || 0) * 1000);
        const resolution =
            variant.width && variant.height ? `${variant.width}x${variant.height}` : null;

        lines.push(
            [
                "#EXT-X-STREAM-INF:BANDWIDTH=" + bandwidth,
                resolution ? `RESOLUTION=${resolution}` : null,
                "CODECS=\"avc1.64001f,mp4a.40.2\"",
                `NAME="${variant.quality}"`,
            ]
                .filter(Boolean)
                .join(",")
        );
        lines.push(`${variant.quality}/index.m3u8`);
    }

    lines.push("");
    return lines.join("\n");
}

function runProcess(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });

        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });

        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
                return;
            }

            const error = new Error(stderr || `${command} exited with code ${code}`);
            error.code = code;
            error.stdout = stdout;
            error.stderr = stderr;
            reject(error);
        });
    });
}

async function ensureEmptyDirectory(dirPath) {
    await fs.rm(dirPath, { recursive: true, force: true });
    await fs.mkdir(dirPath, { recursive: true });
}

async function moveUploadedFileToOrigin(origin, file) {
    const ext = path.extname(file.originalname || file.filename || "").toLowerCase() || ".mp4";
    const sourceDir = getOriginSourceDir(origin.id);
    await fs.mkdir(sourceDir, { recursive: true });

    const targetPath = path.join(sourceDir, `source${ext}`);
    await fs.rm(targetPath, { force: true });
    await fs.rename(file.path, targetPath);

    return {
        sourceFilePath: toUploadsUrl(targetPath),
        sourceFileName: file.originalname || path.basename(targetPath),
    };
}

export async function attachUploadedVideoToOrigin({
    origin,
    file,
    audioType,
    hasSubtitles,
    transaction,
}) {
    if (!origin?.id) {
        throw new Error("Origin không hợp lệ");
    }
    if (!file?.path) {
        throw new Error("Thiếu file video upload");
    }

    const moved = await moveUploadedFileToOrigin(origin, file);

    await MediaJob.destroy({
        where: {
            origin_id: origin.id,
            status: "pending",
        },
        transaction,
    });

    await origin.update(
        {
            delivery: "HLS",
            audio_type: audioType || origin.audio_type || "sub",
            has_subtitles: hasSubtitles ?? origin.has_subtitles ?? true,
            source_file_path: moved.sourceFilePath,
            source_file_name: moved.sourceFileName,
            hls_master_path: null,
            url: "",
            processing_status: "queued",
            processing_error: null,
            duration_sec: null,
            last_processed_at: null,
            is_active: true,
        },
        { transaction }
    );

    return MediaJob.create(
        {
            origin_id: origin.id,
            job_type: "transcode_hls",
            status: "pending",
            payload: {
                source_file_name: moved.sourceFileName,
            },
        },
        { transaction }
    );
}

export async function enqueueReprocessForOrigin(origin, transaction) {
    if (!origin?.id) {
        throw new Error("Origin không hợp lệ");
    }
    if (!origin.source_file_path) {
        throw new Error("Origin chưa có source file để xử lý");
    }

    await MediaJob.destroy({
        where: {
            origin_id: origin.id,
            status: "pending",
        },
        transaction,
    });

    await origin.update(
        {
            processing_status: "queued",
            processing_error: null,
        },
        { transaction }
    );

    return MediaJob.create(
        {
            origin_id: origin.id,
            job_type: "transcode_hls",
            status: "pending",
        },
        { transaction }
    );
}

async function readSourceAbsolutePath(origin) {
    if (!origin?.source_file_path) {
        throw new Error("Origin chưa có source file path");
    }

    return uploadsUrlToAbsolutePath(origin.source_file_path);
}

async function probeDurationSeconds(inputPath) {
    try {
        const { stdout } = await runProcess("ffprobe", [
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            inputPath,
        ]);
        return parseFfprobeDuration(stdout);
    } catch {
        return null;
    }
}

async function probeVideoDimensions(inputPath) {
    try {
        const { stdout } = await runProcess("ffprobe", [
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "json",
            inputPath,
        ]);
        return parseFfprobeVideoDimensions(stdout);
    } catch {
        return null;
    }
}

async function getProfilesForSource(inputPath) {
    const enabledProfiles = getEnabledProfiles();
    const sourceDimensions = await probeVideoDimensions(inputPath);

    if (!sourceDimensions) {
        return enabledProfiles;
    }

    return enabledProfiles.filter(
        (profile) =>
            profile.width <= sourceDimensions.width ||
            profile.height <= sourceDimensions.height
    );
}

async function transcodeProfile(inputPath, originId, profile) {
    const outputDir = getOriginVariantDir(originId, profile.quality);
    await fs.mkdir(outputDir, { recursive: true });

    const playlistPath = path.join(outputDir, "index.m3u8");
    const segmentPattern = path.join(outputDir, "segment_%03d.ts");
    const gop = Number.parseInt(process.env.MEDIA_HLS_GOP || "48", 10);
    const hlsTime = Number.parseInt(process.env.MEDIA_HLS_SEGMENT_SECONDS || "6", 10);

    await runProcess("ffmpeg", [
        "-y",
        "-i",
        inputPath,
        "-vf",
        `scale=w=${profile.width}:h=${profile.height}:force_original_aspect_ratio=decrease,pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2`,
        "-c:a",
        "aac",
        "-ar",
        "48000",
        "-b:a",
        `${profile.audioBitrateKbps}k`,
        "-c:v",
        "libx264",
        "-profile:v",
        "main",
        "-preset",
        process.env.MEDIA_FFMPEG_PRESET || "veryfast",
        "-crf",
        process.env.MEDIA_FFMPEG_CRF || "21",
        "-sc_threshold",
        "0",
        "-g",
        `${gop}`,
        "-keyint_min",
        `${gop}`,
        "-b:v",
        `${profile.bitrateKbps}k`,
        "-maxrate",
        `${Math.round(profile.bitrateKbps * 1.07)}k`,
        "-bufsize",
        `${Math.round(profile.bitrateKbps * 1.5)}k`,
        "-hls_time",
        `${hlsTime}`,
        "-hls_playlist_type",
        "vod",
        "-hls_segment_filename",
        segmentPattern,
        playlistPath,
    ]);

    return {
        ...profile,
        playlistUrl: toUploadsUrl(playlistPath),
    };
}

async function transcodeOriginToHls(origin) {
    const inputPath = await readSourceAbsolutePath(origin);
    const originHlsDir = getOriginHlsDir(origin.id);
    const profiles = await getProfilesForSource(inputPath);

    if (!profiles.length) {
        throw new Error("Không có profile quality nào phù hợp với video nguồn");
    }

    await ensureEmptyDirectory(originHlsDir);

    const processedVariants = [];
    for (const profile of profiles) {
        const variant = await transcodeProfile(inputPath, origin.id, profile);
        processedVariants.push(variant);
    }

    const masterPath = path.join(originHlsDir, "master.m3u8");
    await fs.writeFile(masterPath, buildMasterManifest(processedVariants), "utf8");

    const durationSeconds = await probeDurationSeconds(inputPath);

    await sequelize.transaction(async (transaction) => {
        await MediaVariant.destroy({
            where: { origin_id: origin.id },
            transaction,
        });

        await MediaVariant.bulkCreate(
            processedVariants.map((variant) => ({
                origin_id: origin.id,
                quality: variant.quality,
                required_tier: variant.requiredTier,
                bitrate_kbps: variant.bitrateKbps,
                playlist_url: variant.playlistUrl,
                width: variant.width,
                height: variant.height,
                codec_video: "avc1.64001f",
                codec_audio: "mp4a.40.2",
            })),
            { transaction }
        );

        await origin.update(
            {
                delivery: "HLS",
                hls_master_path: toUploadsUrl(masterPath),
                url: toUploadsUrl(masterPath),
                processing_status: "ready",
                processing_error: null,
                duration_sec: durationSeconds,
                last_processed_at: new Date(),
                is_active: true,
            },
            { transaction }
        );
    });
}

async function cleanupFailedOriginOutput(originId, error) {
    const processingError = formatMediaProcessingError(error);

    await fs.rm(getOriginHlsDir(originId), { recursive: true, force: true });

    await sequelize.transaction(async (transaction) => {
        await MediaVariant.destroy({
            where: { origin_id: originId },
            transaction,
        });

        await MediaOrigin.update(
            {
                hls_master_path: null,
                url: "",
                processing_status: "failed",
                processing_error: processingError,
                duration_sec: null,
                last_processed_at: null,
            },
            {
                where: { id: originId },
                transaction,
            }
        );
    });
}

async function claimNextMediaJob() {
    return sequelize.transaction(async (transaction) => {
        const job = await MediaJob.findOne({
            where: { status: "pending" },
            order: [["created_at", "ASC"], ["id", "ASC"]],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!job) return null;

        job.status = "running";
        job.started_at = new Date();
        job.finished_at = null;
        job.last_error = null;
        job.attempts = Number(job.attempts || 0) + 1;
        await job.save({ transaction });

        return job;
    });
}

export async function processNextMediaJob() {
    const job = await claimNextMediaJob();
    if (!job) {
        return null;
    }

    try {
        const origin = await MediaOrigin.findByPk(job.origin_id);
        if (!origin) {
            throw new Error("Origin không còn tồn tại");
        }

        await origin.update({
            processing_status: "processing",
            processing_error: null,
        });

        if (job.job_type !== "transcode_hls") {
            throw new Error(`job_type không hỗ trợ: ${job.job_type}`);
        }

        await transcodeOriginToHls(origin);

        job.status = "completed";
        job.finished_at = new Date();
        job.last_error = null;
        await job.save();

        return { id: job.id, status: job.status, origin_id: job.origin_id };
    } catch (error) {
        job.status = "failed";
        job.finished_at = new Date();
        job.last_error = formatMediaProcessingError(error);
        await job.save();
        await cleanupFailedOriginOutput(job.origin_id, error);
        throw error;
    }
}
