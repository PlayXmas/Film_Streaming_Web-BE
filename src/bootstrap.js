import dotenv from "dotenv";

let loaded = false;

function ensureEnvLoaded() {
    if (loaded) return;
    dotenv.config({ quiet: true });
    loaded = true;
}

ensureEnvLoaded();
