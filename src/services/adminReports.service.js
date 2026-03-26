import { Op } from "sequelize";
import {
    Episode,
    Report,
    Review,
    Season,
    Title,
    User,
} from "../models/index.js";
import {
    PLAYBACK_SCOPE_TYPES,
    REPORT_PENDING_STATUSES,
    REPORT_RESOLUTION_VALUES,
    REPORT_STATUS_VALUES,
    getReportReasonLabel,
    getReportStatusLabel,
} from "../constants/report.constants.js";

const TAB_VALUES = new Set(["all", "playback", "review"]);
const STATUS_FILTER_VALUES = new Set([
    "all",
    ...REPORT_STATUS_VALUES,
    ...REPORT_RESOLUTION_VALUES,
]);
const UPDATE_ACTION_VALUES = new Set([
    "open",
    "processing",
    "resolved",
    "dismissed",
]);

function createServiceError(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function clampLimit(value) {
    const parsed = parsePositiveInt(value, 20);
    return Math.min(parsed, 100);
}

function normalizeString(value) {
    return String(value || "").trim();
}

function normalizeNullableString(value) {
    const normalized = normalizeString(value);
    return normalized || null;
}

function normalizeTab(value) {
    const tab = normalizeString(value).toLowerCase() || "all";
    if (!TAB_VALUES.has(tab)) {
        throw createServiceError("tab không hợp lệ", 400);
    }
    return tab;
}

function normalizeStatusFilter(value) {
    const status = normalizeString(value).toLowerCase() || "all";
    if (!STATUS_FILTER_VALUES.has(status)) {
        throw createServiceError("status không hợp lệ", 400);
    }
    return status;
}

function readValue(instance, snakeKey, camelKey) {
    if (!instance) return null;
    if (typeof instance.get === "function") {
        const snakeValue = instance.get(snakeKey);
        if (snakeValue !== undefined) return snakeValue;
        if (camelKey) {
            const camelValue = instance.get(camelKey);
            if (camelValue !== undefined) return camelValue;
        }
    }
    if (instance[snakeKey] !== undefined) return instance[snakeKey];
    if (camelKey && instance[camelKey] !== undefined) return instance[camelKey];
    return null;
}

function truncateText(value, maxLength = 80) {
    const text = normalizeString(value);
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
}

function padNumber(value, size = 3) {
    return String(value).padStart(size, "0");
}

function buildReportCode(report) {
    if (!report?.id) return null;
    if (report.scope_type === "review") return `cmt-${padNumber(report.id)}`;
    if (report.scope_type === "episode") return `ep-${padNumber(report.id)}`;
    return `mov-${padNumber(report.id)}`;
}

function mapUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        display_name: user.display_name,
        avatar_url: user.avatar_url || null,
    };
}

function mapTitle(title, fallbackId = null) {
    if (!title && !fallbackId) return null;
    return {
        id: title?.id ?? fallbackId ?? null,
        name: title?.name || null,
        type: title?.type || null,
    };
}

function mapEpisode(episode) {
    if (!episode) return null;
    const season = episode.Season || null;
    return {
        id: episode.id,
        name: episode.name || null,
        episode_number: episode.episode_number,
        season_id: episode.season_id,
        season_number: season?.season_number ?? null,
    };
}

function mapPlaybackMeta(meta) {
    return {
        origin_id: meta?.origin_id ?? null,
        variant_id: meta?.variant_id ?? null,
        purpose: meta?.purpose ?? null,
        player_time_sec: meta?.player_time_sec ?? null,
    };
}

function buildEpisodeDisplay(episode) {
    if (!episode) return null;
    if (episode.episode_number) return `Tập ${episode.episode_number}`;
    return null;
}

function buildStatusWhere(status) {
    switch (status) {
        case "open":
            return { status: "open" };
        case "processing":
            return { status: "processing" };
        case "closed":
            return { status: "closed" };
        case "resolved":
            return { status: "closed", resolution: "resolved" };
        case "dismissed":
            return { status: "closed", resolution: "dismissed" };
        default:
            return {};
    }
}

function buildTabWhere(tab) {
    if (tab === "review") return { scope_type: "review" };
    if (tab === "playback") {
        return {
            scope_type: {
                [Op.in]: PLAYBACK_SCOPE_TYPES,
            },
        };
    }
    return {};
}

async function findEpisodeIdsByTitleIds(titleIds) {
    if (!titleIds.length) return [];
    const rows = await Episode.findAll({
        attributes: ["id"],
        include: [
            {
                model: Season,
                attributes: [],
                where: {
                    title_id: {
                        [Op.in]: titleIds,
                    },
                },
            },
        ],
        raw: true,
    });
    return rows.map((row) => Number(row.id));
}

async function findReviewIdsByTitleIds(titleIds) {
    if (!titleIds.length) return [];
    const rows = await Review.findAll({
        attributes: ["id"],
        where: {
            title_id: {
                [Op.in]: titleIds,
            },
        },
        raw: true,
    });
    return rows.map((row) => Number(row.id));
}

async function buildKeywordFilters(tab, keyword) {
    const normalizedKeyword = normalizeNullableString(keyword);
    if (!normalizedKeyword) return [];

    const likeValue = `%${normalizedKeyword}%`;
    const orFilters = [{ "$reporter.display_name$": { [Op.like]: likeValue } }];

    const titleRows = await Title.findAll({
        attributes: ["id"],
        where: {
            [Op.or]: [
                { name: { [Op.like]: likeValue } },
                { original_name: { [Op.like]: likeValue } },
            ],
        },
        raw: true,
    });
    const titleIds = titleRows.map((row) => Number(row.id));

    if (!titleIds.length) {
        return orFilters;
    }

    if (tab === "review" || tab === "all") {
        const reviewIds = await findReviewIdsByTitleIds(titleIds);
        if (reviewIds.length) {
            orFilters.push({
                scope_type: "review",
                scope_id: {
                    [Op.in]: reviewIds,
                },
            });
        }
    }

    if (tab === "playback" || tab === "all") {
        orFilters.push({
            scope_type: "title",
            scope_id: {
                [Op.in]: titleIds,
            },
        });

        const episodeIds = await findEpisodeIdsByTitleIds(titleIds);
        if (episodeIds.length) {
            orFilters.push({
                scope_type: "episode",
                scope_id: {
                    [Op.in]: episodeIds,
                },
            });
        }
    }

    return orFilters;
}

async function loadTargetMaps(reports) {
    const titleIds = [];
    const episodeIds = [];
    const reviewIds = [];

    reports.forEach((report) => {
        if (report.scope_type === "title") titleIds.push(report.scope_id);
        else if (report.scope_type === "episode") episodeIds.push(report.scope_id);
        else if (report.scope_type === "review") reviewIds.push(report.scope_id);
    });

    const [titles, episodes, reviews] = await Promise.all([
        titleIds.length
            ? Title.findAll({
                  where: { id: { [Op.in]: titleIds } },
                  attributes: ["id", "name", "type"],
              })
            : [],
        episodeIds.length
            ? Episode.findAll({
                  where: { id: { [Op.in]: episodeIds } },
                  attributes: ["id", "season_id", "episode_number", "name"],
                  include: [
                      {
                          model: Season,
                          attributes: ["id", "title_id", "season_number"],
                          include: [
                              {
                                  model: Title,
                                  attributes: ["id", "name", "type"],
                              },
                          ],
                      },
                  ],
              })
            : [],
        reviewIds.length
            ? Review.findAll({
                  where: { id: { [Op.in]: reviewIds } },
                  attributes: [
                      "id",
                      "user_id",
                      "title_id",
                      "episode_id",
                      "body",
                      "is_spoiler",
                  ],
                  include: [
                      {
                          model: User,
                          as: "user",
                          attributes: ["id", "display_name", "avatar_url"],
                      },
                      {
                          model: Title,
                          as: "title",
                          attributes: ["id", "name", "type"],
                      },
                      {
                          model: Episode,
                          as: "episode",
                          attributes: ["id", "season_id", "episode_number", "name"],
                          include: [
                              {
                                  model: Season,
                                  attributes: ["id", "title_id", "season_number"],
                              },
                          ],
                      },
                  ],
              })
            : [],
    ]);

    return {
        titleMap: new Map(titles.map((row) => [Number(row.id), row])),
        episodeMap: new Map(episodes.map((row) => [Number(row.id), row])),
        reviewMap: new Map(reviews.map((row) => [Number(row.id), row])),
    };
}

function serializePlaybackTarget(report, targetMaps) {
    if (report.scope_type === "title") {
        const title = targetMaps.titleMap.get(Number(report.scope_id));
        return {
            type: "playback",
            title: mapTitle(title, report.meta?.title_id ?? report.scope_id),
            episode: null,
            episode_label: null,
            playback: mapPlaybackMeta(report.meta),
        };
    }

    const episode = targetMaps.episodeMap.get(Number(report.scope_id));
    const title = episode?.Season?.Title || null;

    return {
        type: "playback",
        title: mapTitle(title, report.meta?.title_id ?? null),
        episode: mapEpisode(episode) || {
            id: report.meta?.episode_id ?? report.scope_id,
            name: null,
            episode_number: null,
            season_id: null,
            season_number: null,
        },
        episode_label: buildEpisodeDisplay(mapEpisode(episode) || {
            id: report.meta?.episode_id ?? report.scope_id,
            name: null,
            episode_number: null,
            season_id: null,
            season_number: null,
        }),
        playback: mapPlaybackMeta(report.meta),
    };
}

function serializeReviewTarget(report, targetMaps, detail = false) {
    const review = targetMaps.reviewMap.get(Number(report.scope_id));
    const episode = review?.episode || null;

    return {
        type: "review",
        title: mapTitle(review?.title, report.meta?.title_id ?? review?.title_id ?? null),
        episode: mapEpisode(episode),
        episode_label: buildEpisodeDisplay(mapEpisode(episode)),
        review: {
            id: review?.id ?? report.scope_id,
            body: detail ? review?.body || null : null,
            body_preview: truncateText(review?.body, 80) || null,
            is_spoiler: review?.is_spoiler ?? null,
        },
        comment_user_id: review?.user?.id ?? review?.user_id ?? null,
        comment_user: mapUser(review?.user),
    };
}

function serializeReport(report, targetMaps, detail = false) {
    const target =
        report.scope_type === "review"
            ? serializeReviewTarget(report, targetMaps, detail)
            : serializePlaybackTarget(report, targetMaps);
    const title = target?.title || null;
    const episode = target?.episode || null;
    const review = target?.review || null;
    const commentUser = target?.comment_user || null;

    return {
        id: report.id,
        report_code: buildReportCode(report),
        reporter_id: report.reporter?.id ?? report.reporter_id ?? null,
        scope_type: report.scope_type,
        scope_id: report.scope_id,
        reason: report.reason,
        reason_label: getReportReasonLabel(report.reason),
        note: report.note || null,
        meta: report.meta || null,
        status: report.status,
        resolution: report.resolution || null,
        status_label: getReportStatusLabel(report.status, report.resolution),
        created_at: readValue(report, "created_at", "createdAt"),
        updated_at: readValue(report, "updated_at", "updatedAt"),
        handled_at: readValue(report, "handled_at", "handledAt"),
        handled_by: report.handler?.id ?? report.handled_by ?? null,
        title_id: title?.id ?? null,
        title_name: title?.name ?? null,
        episode_id: episode?.id ?? null,
        episode_number: episode?.episode_number ?? null,
        episode_label: target?.episode_label ?? null,
        review_id: review?.id ?? null,
        review_body_preview: review?.body_preview ?? null,
        review_body: detail ? review?.body ?? null : null,
        comment_user_id: target?.comment_user_id ?? null,
        comment_user_name: commentUser?.display_name ?? null,
        reporter_name: report.reporter?.display_name || null,
        handler_name: report.handler?.display_name || null,
        reporter: mapUser(report.reporter),
        handler: mapUser(report.handler),
        target,
    };
}

function buildPagination(page, limit, totalItems) {
    return {
        page,
        limit,
        totalItems,
        totalPages: totalItems > 0 ? Math.ceil(totalItems / limit) : 0,
    };
}

function normalizeUpdatePayload(payload = {}) {
    const action = normalizeNullableString(payload.action)?.toLowerCase() || null;
    if (action) {
        if (!UPDATE_ACTION_VALUES.has(action)) {
            throw createServiceError("action không hợp lệ", 400);
        }
        if (action === "resolved") {
            return { status: "closed", resolution: "resolved" };
        }
        if (action === "dismissed") {
            return { status: "closed", resolution: "dismissed" };
        }
        return { status: action, resolution: null };
    }

    const status = normalizeNullableString(payload.status)?.toLowerCase() || null;
    const resolution = normalizeNullableString(payload.resolution)?.toLowerCase() || null;

    if (!status) {
        throw createServiceError("Thiếu action hoặc status", 400);
    }

    if (!REPORT_STATUS_VALUES.includes(status)) {
        throw createServiceError("status không hợp lệ", 400);
    }

    if (status === "closed") {
        if (!resolution || !REPORT_RESOLUTION_VALUES.includes(resolution)) {
            throw createServiceError(
                "resolution là bắt buộc khi status = closed",
                400
            );
        }
        return { status, resolution };
    }

    if (resolution) {
        throw createServiceError(
            "resolution chỉ được gửi khi status = closed",
            400
        );
    }

    return { status, resolution: null };
}

function buildReportIncludes() {
    return [
        {
            model: User,
            as: "reporter",
            attributes: ["id", "display_name", "avatar_url"],
            required: false,
        },
        {
            model: User,
            as: "handler",
            attributes: ["id", "display_name", "avatar_url"],
            required: false,
        },
    ];
}

function buildReportAttributes(includeMeta = false) {
    const baseAttributes = [
        "id",
        "reporter_id",
        "scope_type",
        "scope_id",
        "reason",
        "note",
        "status",
        "resolution",
        "handled_by",
        "handled_at",
        "created_at",
        "updated_at",
    ];

    if (includeMeta) {
        return [...baseAttributes, "meta"];
    }

    return baseAttributes;
}

export async function buildAdminReportsSummary() {
    const [playbackTotal, reviewTotal, playbackPending, reviewPending, openCount, processingCount, resolvedCount, dismissedCount] =
        await Promise.all([
            Report.count({
                where: {
                    scope_type: {
                        [Op.in]: PLAYBACK_SCOPE_TYPES,
                    },
                },
            }),
            Report.count({
                where: {
                    scope_type: "review",
                },
            }),
            Report.count({
                where: {
                    scope_type: {
                        [Op.in]: PLAYBACK_SCOPE_TYPES,
                    },
                    status: {
                        [Op.in]: REPORT_PENDING_STATUSES,
                    },
                },
            }),
            Report.count({
                where: {
                    scope_type: "review",
                    status: {
                        [Op.in]: REPORT_PENDING_STATUSES,
                    },
                },
            }),
            Report.count({ where: { status: "open" } }),
            Report.count({ where: { status: "processing" } }),
            Report.count({
                where: {
                    status: "closed",
                    resolution: "resolved",
                },
            }),
            Report.count({
                where: {
                    status: "closed",
                    resolution: "dismissed",
                },
            }),
        ]);

    return {
        pending_total: playbackPending + reviewPending,
        playback: {
            total: playbackTotal,
            pending: playbackPending,
        },
        review: {
            total: reviewTotal,
            pending: reviewPending,
        },
        by_status: {
            open: openCount,
            processing: processingCount,
            resolved: resolvedCount,
            dismissed: dismissedCount,
        },
    };
}

export async function buildAdminReportsList(query = {}) {
    const tab = normalizeTab(query.tab);
    const status = normalizeStatusFilter(query.status);
    const keyword = normalizeNullableString(query.keyword);
    const page = parsePositiveInt(query.page, 1);
    const limit = clampLimit(query.limit);
    const offset = (page - 1) * limit;

    const where = {
        ...buildTabWhere(tab),
        ...buildStatusWhere(status),
    };

    const keywordFilters = await buildKeywordFilters(tab, keyword);
    if (keywordFilters.length) {
        where[Op.and] = [{ [Op.or]: keywordFilters }];
    }

    const { rows, count } = await Report.findAndCountAll({
        attributes: buildReportAttributes(false),
        where,
        include: buildReportIncludes(),
        order: [
            ["created_at", "DESC"],
            ["id", "DESC"],
        ],
        limit,
        offset,
        distinct: true,
        subQuery: false,
    });

    const targetMaps = await loadTargetMaps(rows);
    const items = rows.map((report) => serializeReport(report, targetMaps, false));

    return {
        items,
        pagination: buildPagination(page, limit, count),
        filters: {
            tab,
            status,
            keyword,
        },
    };
}

export async function buildAdminReportDetail(reportId) {
    const id = parsePositiveInt(reportId, null);
    if (!id) {
        throw createServiceError("report id không hợp lệ", 400);
    }

    const report = await Report.findByPk(id, {
        attributes: buildReportAttributes(true),
        include: buildReportIncludes(),
    });

    if (!report) return null;

    const targetMaps = await loadTargetMaps([report]);
    return serializeReport(report, targetMaps, true);
}

export async function updateAdminReport(reportId, payload, adminUserId) {
    const id = parsePositiveInt(reportId, null);
    if (!id) {
        throw createServiceError("report id không hợp lệ", 400);
    }

    const normalizedPayload = normalizeUpdatePayload(payload);
    const report = await Report.findByPk(id);
    if (!report) return null;

    report.status = normalizedPayload.status;
    report.resolution = normalizedPayload.resolution;

    if (normalizedPayload.status === "closed") {
        report.handled_by = adminUserId;
        report.handled_at = new Date();
    } else {
        report.handled_by = null;
        report.handled_at = null;
    }

    await report.save();
    return buildAdminReportDetail(id);
}
