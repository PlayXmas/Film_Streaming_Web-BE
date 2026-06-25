// src/server.js
import "./bootstrap.js";
import app from "./app.js";
import { startMediaProcessingCron } from "./cron/mediaProcessing.cron.js";
import { startRecommendationCron } from "./cron/recommendation.cron.js";
import { startSubscriptionCron } from "./cron/subscription.cron.js";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startSubscriptionCron();
    startMediaProcessingCron();
    startRecommendationCron();
});
