import { Title, UserSearchLog } from "../models/index.js";

function toTrimmedString(value, maxLength = 255) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return null;
    return trimmed.slice(0, maxLength);
}

function toPositiveInt(value) {
    if (value == null || value === "") return null;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
}

function toNonNegativeInt(value) {
    if (value == null || value === "") return null;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 0) return null;
    return parsed;
}

function normalizeKeyword(keyword) {
    const cleaned = toTrimmedString(keyword, 255);
    if (!cleaned) return null;

    return cleaned
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
}

function pickSearchFilters(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return null;
    }

    const filters = {};
    const year = toPositiveInt(input.year);
    const genreId = toPositiveInt(input.genreId);
    const type = toTrimmedString(input.type, 20);
    const sort = toTrimmedString(input.sort, 50);
    const suggest = input.suggest === true || String(input.suggest || "") === "1";

    if (year) filters.year = year;
    if (genreId) filters.genreId = genreId;
    if (type && ["movie", "series"].includes(type)) filters.type = type;
    if (sort) filters.sort = sort;
    if (suggest) filters.suggest = true;

    return Object.keys(filters).length ? filters : null;
}

function buildSearchLogPayload(log) {
    return {
        id: log.id,
        user_id: log.user_id,
        session_id: log.session_id,
        keyword: log.keyword,
        normalized_keyword: log.normalized_keyword,
        result_count: log.result_count,
        filters: log.filters || null,
        source: log.source,
        clicked_title_id: log.clicked_title_id,
        searched_at: log.searched_at,
        clicked_at: log.clicked_at,
    };
}

function assertIdentity({ userId, sessionId }) {
    if (!userId && !sessionId) {
        const error = new Error("sessionId là bắt buộc với người dùng chưa đăng nhập");
        error.status = 400;
        throw error;
    }
}

async function ensureTitleExists(titleId) {
    const title = await Title.findByPk(titleId, {
        attributes: ["id"],
    });

    if (!title) {
        const error = new Error("Không tìm thấy phim để ghi nhận search click");
        error.status = 404;
        throw error;
    }
}

async function resolveOwnedSearchLog({ searchLogId, userId, sessionId }) {
    const log = await UserSearchLog.findByPk(searchLogId);
    if (!log) {
        const error = new Error("Không tìm thấy search log");
        error.status = 404;
        throw error;
    }

    const sameUser = userId && log.user_id && Number(log.user_id) === Number(userId);
    const sameSession = sessionId && log.session_id && log.session_id === sessionId;
    const canAdoptGuestLog = userId && !log.user_id && sameSession;

    if (log.user_id && !sameUser) {
        const error = new Error("Bạn không có quyền cập nhật search log này");
        error.status = 403;
        throw error;
    }

    if (!log.user_id && !sameSession && !canAdoptGuestLog) {
        const error = new Error("Bạn không có quyền cập nhật search log này");
        error.status = 403;
        throw error;
    }

    return { log, canAdoptGuestLog };
}

export const logMovieSearch = async (req, res) => {
    try {
        const userId = req.user?.id ?? null;
        const sessionId = toTrimmedString(req.body?.sessionId, 128);
        const keyword = toTrimmedString(req.body?.keyword, 255);
        const resultCount = toNonNegativeInt(req.body?.resultCount);
        const filters = pickSearchFilters(req.body?.filters);

        if (!keyword) {
            return res.status(400).json({
                success: false,
                message: "keyword là bắt buộc",
            });
        }

        assertIdentity({ userId, sessionId });

        const log = await UserSearchLog.create({
            user_id: userId,
            session_id: sessionId,
            keyword,
            normalized_keyword: normalizeKeyword(keyword),
            result_count: resultCount,
            filters,
            source: "submit",
            searched_at: new Date(),
        });

        return res.status(201).json({
            success: true,
            data: {
                search_log: buildSearchLogPayload(log),
            },
        });
    } catch (error) {
        console.error("[POST /api/movies/search/log] ERROR:", error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.status ? error.message : "Lỗi server khi lưu search log",
        });
    }
};

export const recordMovieSearchClick = async (req, res) => {
    try {
        const userId = req.user?.id ?? null;
        const sessionId = toTrimmedString(req.body?.sessionId, 128);
        const searchLogId = toPositiveInt(req.body?.searchLogId);
        const titleId = toPositiveInt(req.body?.titleId);
        const keyword = toTrimmedString(req.body?.keyword, 255);
        const resultCount = toNonNegativeInt(req.body?.resultCount);
        const filters = pickSearchFilters(req.body?.filters);

        if (!titleId) {
            return res.status(400).json({
                success: false,
                message: "titleId là bắt buộc",
            });
        }

        assertIdentity({ userId, sessionId });
        await ensureTitleExists(titleId);

        if (searchLogId) {
            const { log, canAdoptGuestLog } = await resolveOwnedSearchLog({
                searchLogId,
                userId,
                sessionId,
            });

            await log.update({
                ...(canAdoptGuestLog ? { user_id: userId } : {}),
                ...(resultCount != null ? { result_count: resultCount } : {}),
                ...(filters ? { filters } : {}),
                clicked_title_id: titleId,
                clicked_at: new Date(),
            });

            return res.status(200).json({
                success: true,
                data: {
                    search_log: buildSearchLogPayload(log),
                },
            });
        }

        if (!keyword) {
            return res.status(400).json({
                success: false,
                message: "keyword là bắt buộc khi không gửi searchLogId",
            });
        }

        const log = await UserSearchLog.create({
            user_id: userId,
            session_id: sessionId,
            keyword,
            normalized_keyword: normalizeKeyword(keyword),
            result_count: resultCount,
            filters,
            source: "click",
            clicked_title_id: titleId,
            searched_at: new Date(),
            clicked_at: new Date(),
        });

        return res.status(201).json({
            success: true,
            data: {
                search_log: buildSearchLogPayload(log),
            },
        });
    } catch (error) {
        console.error("[POST /api/movies/search/click] ERROR:", error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.status ? error.message : "Lỗi server khi lưu search click",
        });
    }
};
