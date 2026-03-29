import { Op } from "sequelize";
import { sequelize, Subscription, User } from "../models/index.js";

function normalizeDate(value) {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function isStrictlyFuture(dateValue, now) {
    const date = normalizeDate(dateValue);
    if (!date) return false;
    return date.getTime() > now.getTime();
}

function shouldClearExpiry(user, hasValidVip) {
    if (user.role === "admin") return false;
    if (hasValidVip) return false;
    return !!user.vip_expires_at;
}

export async function syncUserVipAccess(user, options = {}) {
    if (!user) return user;
    if (user.role === "admin") return user;

    const now = options.now instanceof Date ? options.now : new Date();
    const hasValidVip = isStrictlyFuture(user.vip_expires_at, now);
    const nextRole = hasValidVip ? "vip" : "free";
    const nextVipExpiresAt = hasValidVip ? normalizeDate(user.vip_expires_at) : null;

    const shouldUpdateRole = user.role !== nextRole;
    const shouldUpdateExpiry = shouldClearExpiry(user, hasValidVip);

    if (!shouldUpdateRole && !shouldUpdateExpiry) {
        return user;
    }

    user.role = nextRole;
    if (shouldUpdateExpiry) {
        user.vip_expires_at = null;
    } else if (nextVipExpiresAt) {
        user.vip_expires_at = nextVipExpiresAt;
    }

    await user.save({
        transaction: options.transaction,
    });

    return user;
}

function readAffectedRows(metadata) {
    if (typeof metadata === "number") return metadata;
    if (Array.isArray(metadata) && typeof metadata[1] === "number") return metadata[1];
    if (metadata?.affectedRows !== undefined) return Number(metadata.affectedRows || 0);
    if (metadata?.rowCount !== undefined) return Number(metadata.rowCount || 0);
    return 0;
}

export async function reconcileVipAccessState(nowInput = new Date()) {
    const now = nowInput instanceof Date ? nowInput : new Date(nowInput);

    return sequelize.transaction(async (transaction) => {
        const [expiredSubscriptionsCount] = await Subscription.update(
            { status: "expired" },
            {
                where: {
                    status: "active",
                    ends_at: {
                        [Op.lte]: now,
                    },
                },
                transaction,
            }
        );

        const [, promoteMeta] = await sequelize.query(
            `
            UPDATE users u
            JOIN (
                SELECT s.user_id, MAX(s.ends_at) AS vip_expires_at
                FROM subscriptions s
                WHERE s.status = 'active'
                  AND s.ends_at > :now
                GROUP BY s.user_id
            ) sub ON sub.user_id = u.id
            SET
                u.role = 'vip',
                u.vip_expires_at = sub.vip_expires_at
            WHERE u.role <> 'admin'
              AND (
                    u.role <> 'vip'
                 OR u.vip_expires_at IS NULL
                 OR u.vip_expires_at <> sub.vip_expires_at
              )
            `,
            {
                replacements: { now },
                transaction,
            }
        );

        const [, downgradeMeta] = await sequelize.query(
            `
            UPDATE users u
            LEFT JOIN (
                SELECT DISTINCT s.user_id
                FROM subscriptions s
                WHERE s.status = 'active'
                  AND s.ends_at > :now
            ) sub ON sub.user_id = u.id
            SET
                u.role = 'free',
                u.vip_expires_at = NULL
            WHERE u.role <> 'admin'
              AND sub.user_id IS NULL
              AND (
                    u.role = 'vip'
                 OR u.vip_expires_at IS NOT NULL
              )
            `,
            {
                replacements: { now },
                transaction,
            }
        );

        return {
            expired_subscriptions_count: Number(expiredSubscriptionsCount || 0),
            promoted_users_count: readAffectedRows(promoteMeta),
            downgraded_users_count: readAffectedRows(downgradeMeta),
            executed_at: now,
        };
    });
}

export async function grantVipToUser(userId, vipExpiresAt, options = {}) {
    const expiresAt = normalizeDate(vipExpiresAt);
    if (!expiresAt) {
        throw new Error("vip_expires_at không hợp lệ");
    }

    await User.update(
        {
            role: "vip",
            vip_expires_at: expiresAt,
        },
        {
            where: { id: userId },
            transaction: options.transaction,
        }
    );
}
