import { reconcileVipAccessState } from "../services/subscriptionAccess.service.js";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

function readIntervalMs() {
    const raw = Number.parseInt(
        process.env.SUBSCRIPTION_CRON_INTERVAL_MS || "",
        10
    );

    if (!Number.isInteger(raw) || raw < 60 * 1000) {
        return DEFAULT_INTERVAL_MS;
    }

    return raw;
}

export function startSubscriptionCron() {
    if (process.env.DISABLE_SUBSCRIPTION_CRON === "true") {
        console.log("[subscription-cron] disabled by env");
        return null;
    }

    const intervalMs = readIntervalMs();
    let isRunning = false;

    const run = async (source) => {
        if (isRunning) {
            console.warn(`[subscription-cron] skipped overlapping run (${source})`);
            return;
        }

        isRunning = true;
        try {
            const result = await reconcileVipAccessState(new Date());
            console.log(
                `[subscription-cron] ${source} ok`,
                {
                    expired_subscriptions_count: result.expired_subscriptions_count,
                    promoted_users_count: result.promoted_users_count,
                    downgraded_users_count: result.downgraded_users_count,
                    executed_at: result.executed_at,
                }
            );
        } catch (error) {
            console.error(`[subscription-cron] ${source} failed`, error);
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

    console.log(`[subscription-cron] started, interval=${intervalMs}ms`);

    return timer;
}
