import { Op, fn, col } from "sequelize";
import {
    Review,
    Report,
    Title,
    Episode,
    Season,
    User,
    sequelize,
} from "../models/index.js";

const USER_ROLE_VALUES = ["admin", "vip", "free"];
const USER_GENDER_VALUES = ["male", "female", "unspecified"];
const USER_SORT_FIELDS = {
    id: "id",
    display_name: "display_name",
    email: "email",
    created_at: "created_at",
    updated_at: "updated_at",
};

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

function normalizeId(value) {
    const parsed = parsePositiveInt(value, null);
    if (!parsed) {
        throw createServiceError("ID không hợp lệ", 400);
    }
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

function normalizeRoleFilter(value) {
    const normalized = normalizeString(value).toLowerCase();
    if (!normalized || normalized === "all") return null;
    if (!USER_ROLE_VALUES.includes(normalized)) {
        throw createServiceError("role không hợp lệ", 400);
    }
    return normalized;
}

function normalizeRoleValue(value) {
    const normalized = normalizeNullableString(value)?.toLowerCase() || null;
    if (!normalized) {
        throw createServiceError("role không hợp lệ", 400);
    }
    if (!USER_ROLE_VALUES.includes(normalized)) {
        throw createServiceError("role không hợp lệ", 400);
    }
    return normalized;
}

function parseBooleanValue(value, fieldName = "is_active") {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
        if (value === 1) return true;
        if (value === 0) return false;
    }
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "1", "yes"].includes(normalized)) return true;
        if (["false", "0", "no"].includes(normalized)) return false;
    }
    throw createServiceError(`${fieldName} không hợp lệ`, 400);
}

function normalizeStatusFilter(value) {
    const normalized = normalizeString(value).toLowerCase();
    if (!normalized || normalized === "all") return null;
    if (normalized === "active") return true;
    if (normalized === "inactive") return false;
    return parseBooleanValue(normalized, "is_active");
}

function normalizeGenderValue(value) {
    const normalized = normalizeNullableString(value)?.toLowerCase() || null;
    if (!normalized) {
        throw createServiceError("gender không hợp lệ", 400);
    }
    if (!USER_GENDER_VALUES.includes(normalized)) {
        throw createServiceError("gender không hợp lệ", 400);
    }
    return normalized;
}

function normalizeSortBy(value) {
    const normalized = normalizeString(value).toLowerCase() || "updated_at";
    if (!Object.prototype.hasOwnProperty.call(USER_SORT_FIELDS, normalized)) {
        throw createServiceError("sortBy không hợp lệ", 400);
    }
    return {
        key: normalized,
        field: USER_SORT_FIELDS[normalized],
    };
}

function normalizeOrder(value) {
    const normalized = normalizeString(value).toLowerCase() || "desc";
    if (!["asc", "desc"].includes(normalized)) {
        throw createServiceError("order không hợp lệ", 400);
    }
    return normalized.toUpperCase();
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

function buildPagination(page, limit, totalItems) {
    return {
        page,
        limit,
        totalItems,
        totalPages: totalItems > 0 ? Math.ceil(totalItems / limit) : 0,
    };
}

function mapUser(user, reviewCount = 0) {
    return {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url || null,
        gender: user.gender || "unspecified",
        role: user.role,
        is_active: !!user.is_active,
        review_count: Number(reviewCount || 0),
        created_at: readValue(user, "created_at", "createdAt"),
        updated_at: readValue(user, "updated_at", "updatedAt"),
    };
}

function mapReview(review) {
    const episode = review.episode || null;
    const season = episode?.Season || null;

    return {
        id: review.id,
        body: review.body,
        is_spoiler: !!review.is_spoiler,
        review_type: review.episode_id ? "episode" : "title",
        created_at: readValue(review, "created_at", "createdAt"),
        updated_at: readValue(review, "updated_at", "updatedAt"),
        title: review.title
            ? {
                  id: review.title.id,
                  name: review.title.name,
                  original_name: review.title.original_name || null,
                  type: review.title.type || null,
              }
            : null,
        episode: episode
            ? {
                  id: episode.id,
                  name: episode.name || null,
                  episode_number: episode.episode_number ?? null,
                  season_id: episode.season_id ?? null,
                  season_number: season?.season_number ?? null,
              }
            : null,
    };
}

async function buildUsersSummary() {
    const [total_users, active_users, vip_users] = await Promise.all([
        User.count(),
        User.count({ where: { is_active: true } }),
        User.count({ where: { role: "vip" } }),
    ]);

    return {
        total_users,
        active_users,
        vip_users,
    };
}

async function buildReviewCountMap(userIds) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
        return new Map();
    }

    const rows = await Review.findAll({
        attributes: [
            "user_id",
            [fn("COUNT", col("id")), "review_count"],
        ],
        where: {
            user_id: {
                [Op.in]: userIds,
            },
        },
        group: ["user_id"],
        raw: true,
    });

    return new Map(rows.map((row) => [Number(row.user_id), Number(row.review_count || 0)]));
}

function buildUserWhere(query = {}) {
    const keyword = normalizeNullableString(query.q ?? query.keyword);
    const role = normalizeRoleFilter(query.role);
    const isActive = normalizeStatusFilter(query.is_active ?? query.status);
    const where = {};

    if (keyword) {
        const likeValue = `%${keyword}%`;
        const orConditions = [
            { display_name: { [Op.like]: likeValue } },
            { email: { [Op.like]: likeValue } },
        ];

        if (/^\d+$/.test(keyword)) {
            orConditions.unshift({ id: Number(keyword) });
        }

        where[Op.or] = orConditions;
    }

    if (role) {
        where.role = role;
    }

    if (typeof isActive === "boolean") {
        where.is_active = isActive;
    }

    return {
        where,
        filters: {
            q: keyword,
            role: role || "all",
            is_active: typeof isActive === "boolean" ? isActive : "all",
        },
    };
}

async function findUserOrThrow(userId) {
    const id = normalizeId(userId);
    const user = await User.findByPk(id);
    if (!user) {
        throw createServiceError("Không tìm thấy người dùng", 404);
    }
    return user;
}

async function ensureAdminSafeguards(user, actorUserId, nextRole, nextIsActive) {
    const isSelf = Number(actorUserId) === Number(user.id);
    const finalRole = nextRole ?? user.role;
    const finalIsActive =
        typeof nextIsActive === "boolean" ? nextIsActive : !!user.is_active;
    const removingActiveAdmin =
        user.role === "admin" &&
        !!user.is_active &&
        (finalRole !== "admin" || finalIsActive === false);

    if (isSelf) {
        if (finalRole !== "admin") {
            throw createServiceError(
                "Không thể tự thay đổi quyền admin của chính mình",
                400
            );
        }
        if (finalIsActive === false) {
            throw createServiceError(
                "Không thể tự vô hiệu hóa tài khoản của chính mình",
                400
            );
        }
    }

    if (!removingActiveAdmin) return;

    const activeAdminCount = await User.count({
        where: {
            role: "admin",
            is_active: true,
        },
    });

    if (activeAdminCount <= 1) {
        throw createServiceError(
            "Không thể thay đổi admin active cuối cùng của hệ thống",
            400
        );
    }
}

export async function listAdminUsers(query = {}) {
    const page = parsePositiveInt(query.page, 1);
    const limit = clampLimit(query.limit);
    const offset = (page - 1) * limit;
    const sortBy = normalizeSortBy(query.sortBy);
    const order = normalizeOrder(query.order);
    const { where, filters } = buildUserWhere(query);

    const [{ rows, count }, summary] = await Promise.all([
        User.findAndCountAll({
            where,
            attributes: [
                "id",
                "email",
                "display_name",
                "avatar_url",
                "gender",
                "role",
                "is_active",
                "created_at",
                "updated_at",
            ],
            order: [
                [sortBy.field, order],
                ["id", "DESC"],
            ],
            limit,
            offset,
        }),
        buildUsersSummary(),
    ]);

    const reviewCountMap = await buildReviewCountMap(rows.map((row) => row.id));
    const items = rows.map((user) => mapUser(user, reviewCountMap.get(Number(user.id)) || 0));

    return {
        items,
        pagination: buildPagination(page, limit, count),
        filters: {
            ...filters,
            sortBy: sortBy.key,
            order: order.toLowerCase(),
        },
        summary,
    };
}

export async function getAdminUserDetail(userId) {
    const user = await findUserOrThrow(userId);
    const review_count = await Review.count({
        where: { user_id: user.id },
    });

    return {
        ...mapUser(user, review_count),
    };
}

export async function updateAdminUser(userId, payload = {}, actorUserId) {
    const user = await findUserOrThrow(userId);
    const updatePayload = {};
    let nextIsActive;

    if (payload.display_name !== undefined) {
        const displayName = normalizeString(payload.display_name);
        if (!displayName) {
            throw createServiceError("display_name không được để trống", 400);
        }
        updatePayload.display_name = displayName;
    }

    if (payload.gender !== undefined) {
        updatePayload.gender = normalizeGenderValue(payload.gender);
    }

    if (payload.is_active !== undefined) {
        nextIsActive = parseBooleanValue(payload.is_active, "is_active");
        updatePayload.is_active = nextIsActive;
    }

    if (payload.role !== undefined) {
        throw createServiceError(
            "API này không hỗ trợ cập nhật role. Hãy dùng nghiệp vụ subscription/VIP riêng",
            400
        );
    }

    if (Object.keys(updatePayload).length === 0) {
        throw createServiceError("Không có dữ liệu cập nhật hợp lệ", 400);
    }

    await ensureAdminSafeguards(user, actorUserId, undefined, nextIsActive);
    await user.update(updatePayload);

    return getAdminUserDetail(user.id);
}

export async function updateAdminUserStatus(userId, payload = {}, actorUserId) {
    if (!Object.prototype.hasOwnProperty.call(payload, "is_active")) {
        throw createServiceError("Thiếu trường is_active", 400);
    }

    const user = await findUserOrThrow(userId);
    const nextIsActive = parseBooleanValue(payload.is_active, "is_active");

    await ensureAdminSafeguards(user, actorUserId, undefined, nextIsActive);
    user.is_active = nextIsActive;
    await user.save();

    return getAdminUserDetail(user.id);
}

export async function listAdminUserReviews(userId, query = {}) {
    const user = await findUserOrThrow(userId);
    const page = parsePositiveInt(query.page, 1);
    const limit = clampLimit(query.limit);
    const offset = (page - 1) * limit;
    const keyword = normalizeNullableString(query.q ?? query.keyword);

    const where = {
        user_id: user.id,
    };

    if (keyword) {
        const likeValue = `%${keyword}%`;
        where[Op.and] = [
            {
                [Op.or]: [
                    { body: { [Op.like]: likeValue } },
                    { "$title.name$": { [Op.like]: likeValue } },
                    { "$title.original_name$": { [Op.like]: likeValue } },
                ],
            },
        ];
    }

    const { rows, count } = await Review.findAndCountAll({
        where,
        include: [
            {
                model: Title,
                as: "title",
                attributes: ["id", "name", "original_name", "type"],
                required: false,
            },
            {
                model: Episode,
                as: "episode",
                attributes: ["id", "season_id", "episode_number", "name"],
                required: false,
                include: [
                    {
                        model: Season,
                        attributes: ["id", "season_number"],
                        required: false,
                    },
                ],
            },
        ],
        order: [
            ["created_at", "DESC"],
            ["id", "DESC"],
        ],
        limit,
        offset,
        distinct: true,
        subQuery: false,
    });

    return {
        user: {
            id: user.id,
            display_name: user.display_name,
            email: user.email,
        },
        items: rows.map((review) => mapReview(review)),
        pagination: buildPagination(page, limit, count),
        filters: {
            q: keyword,
        },
    };
}

export async function deleteAdminReview(reviewId) {
    const id = normalizeId(reviewId);
    return sequelize.transaction(async (transaction) => {
        const review = await Review.findByPk(id, {
            include: [
                {
                    model: Title,
                    as: "title",
                    attributes: ["id", "name", "original_name", "type"],
                    required: false,
                },
                {
                    model: Episode,
                    as: "episode",
                    attributes: ["id", "season_id", "episode_number", "name"],
                    required: false,
                    include: [
                        {
                            model: Season,
                            attributes: ["id", "season_number"],
                            required: false,
                        },
                    ],
                },
                {
                    model: User,
                    as: "user",
                    attributes: ["id", "display_name", "email"],
                    required: false,
                },
            ],
            transaction,
        });

        if (!review) {
            throw createServiceError("Không tìm thấy bình luận", 404);
        }

        const deletedReview = {
            ...mapReview(review),
            user: review.user
                ? {
                      id: review.user.id,
                      display_name: review.user.display_name,
                      email: review.user.email,
                  }
                : null,
        };

        const deleted_reports_count = await Report.destroy({
            where: {
                scope_type: "review",
                scope_id: review.id,
            },
            transaction,
        });

        await review.destroy({ transaction });

        return {
            review: deletedReview,
            deleted_reports_count,
        };
    });
}
