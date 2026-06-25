import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const DEFAULT_INTERVAL_MS = 3 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readIntervalMs() {
    const raw = Number.parseInt(process.env.RECOMMENDATION_CRON_INTERVAL_MS || "", 10);
    if (!Number.isInteger(raw) || raw < MIN_INTERVAL_MS) {
        return DEFAULT_INTERVAL_MS;
    }

    return raw;
}

function defaultMlDir() {
    return path.resolve(__dirname, "../../..", "Python_Recommend-Film");
}

function defaultPythonCommand(mlDir) {
    const venvPython = process.platform === "win32"
        ? path.join(mlDir, ".venv-ml", "Scripts", "python.exe")
        : path.join(mlDir, ".venv-ml", "bin", "python");

    return existsSync(venvPython) ? venvPython : "python";
}

function getRunnerConfig() {
    const mlDir = process.env.RECOMMENDATION_ML_DIR || defaultMlDir();

    return {
        mlDir,
        pythonCommand: process.env.RECOMMENDATION_PYTHON_COMMAND || defaultPythonCommand(mlDir),
        scriptName: process.env.RECOMMENDATION_ML_SCRIPT || "ml_train_hybrid_als.py",
    };
}

function runRecommendationJob(source) {
    const { mlDir, pythonCommand, scriptName } = getRunnerConfig();
    const scriptPath = path.join(mlDir, scriptName);

    if (!existsSync(scriptPath)) {
        return Promise.reject(new Error(`ML script not found: ${scriptPath}`));
    }

    console.log("[recommendation-cron] starting", {
        source,
        command: pythonCommand,
        script: scriptPath,
    });

    return new Promise((resolve, reject) => {
        const child = spawn(pythonCommand, [scriptName], {
            cwd: mlDir,
            env: process.env,
            windowsHide: true,
        });

        child.stdout?.on("data", (chunk) => {
            process.stdout.write(`[recommendation-cron] ${chunk}`);
        });

        child.stderr?.on("data", (chunk) => {
            process.stderr.write(`[recommendation-cron] ${chunk}`);
        });

        child.on("error", reject);

        child.on("close", (code, signal) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(new Error(`ML job exited with code=${code}, signal=${signal || "none"}`));
        });
    });
}

export function startRecommendationCron() {
    if (process.env.DISABLE_RECOMMENDATION_CRON === "true") {
        console.log("[recommendation-cron] disabled by env");
        return null;
    }

    const intervalMs = readIntervalMs();
    let isRunning = false;

    const run = async (source) => {
        if (isRunning) {
            console.warn(`[recommendation-cron] skipped overlapping run (${source})`);
            return;
        }

        isRunning = true;
        try {
            await runRecommendationJob(source);
            console.log(`[recommendation-cron] ${source} ok`);
        } catch (error) {
            console.error(`[recommendation-cron] ${source} failed`, error);
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

    console.log(`[recommendation-cron] started, interval=${intervalMs}ms`);

    return timer;
}
