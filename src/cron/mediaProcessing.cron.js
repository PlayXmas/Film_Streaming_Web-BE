import { processNextMediaJob } from "../services/mediaPipeline.service.js";

const DEFAULT_INTERVAL_MS = 5000;

function readIntervalMs() {
    const raw = Number.parseInt(process.env.MEDIA_JOB_INTERVAL_MS || "", 10);
    if (!Number.isInteger(raw) || raw < 1000) {
        return DEFAULT_INTERVAL_MS;
    }

    return raw;
}

export function startMediaProcessingCron() {
    if (process.env.DISABLE_MEDIA_PROCESSING_CRON === "true") {
        console.log("[media-processing-cron] disabled by env");
        return null;
    }

    const intervalMs = readIntervalMs();
    let isRunning = false;

    const run = async (source) => {
        if (isRunning) return;
        isRunning = true;

        try {
            const result = await processNextMediaJob();
            if (result) {
                console.log("[media-processing-cron] processed job", {
                    source,
                    job_id: result.id,
                    origin_id: result.origin_id,
                    status: result.status,
                });
            }
        } catch (error) {
            console.error(`[media-processing-cron] ${source} failed`, error);
        } finally {
            isRunning = false;
        }
    };

    void run("startup");

    const timer = setInterval(() => {
        void run("interval");
    }, intervalMs);

    if (typeof timer.unref === "function") {
        timer.unref();
    }

    console.log(`[media-processing-cron] started, interval=${intervalMs}ms`);

    return timer;
}
