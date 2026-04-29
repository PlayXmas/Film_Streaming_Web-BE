export function getUserPlaybackTier(user) {
    return user?.role === "vip" || user?.role === "admin" ? "vip" : "free";
}

export function filterVariantsForTier(variants, userTier) {
    return (Array.isArray(variants) ? variants : []).filter((variant) => {
        if (variant.required_tier === "free") return true;
        return userTier === "vip";
    });
}

export function buildProtectedMasterPlaylistPath(originId) {
    return `/api/media/origins/${originId}/hls/master.m3u8`;
}

export function buildProtectedVariantPlaylistPath(originId, quality) {
    return `/api/media/origins/${originId}/hls/${encodeURIComponent(quality)}/index.m3u8`;
}

export function resolvePlaybackUrl(origin) {
    if (
        origin?.delivery === "HLS" &&
        origin?.processing_status === "ready" &&
        (origin?.hls_master_path || origin?.url)
    ) {
        return buildProtectedMasterPlaylistPath(origin.id);
    }

    return origin?.url || null;
}
