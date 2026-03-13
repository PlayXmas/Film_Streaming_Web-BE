import { Op, fn, col } from "sequelize";
import {
    User,
    Title,
    Subscription,
    Payment,
    WatchHistory,
    Review,
    Report,
    Plan,
} from "../models/index.js";
import { addDays, daysBetween, formatISODate } from "../utils/dateRange.js";

function getFieldName(model, attribute) {
    const attr = model?.rawAttributes?.[attribute];
    if (attr?.field) return attr.field;
    if (attribute === "createdAt") {
        return model?.options?.createdAt || "created_at";
    }
    if (attribute === "updatedAt") {
        return model?.options?.updatedAt || "updated_at";
    }
    return attribute;
}

function normalizeDateKey(value) {
    if (!value) return null;
    if (typeof value === "string") return value.slice(0, 10);
    if (value instanceof Date) return formatISODate(value);
    return String(value).slice(0, 10);
}

function calcDeltaPct(current, previous) {
    const cur = Number(current || 0);
    const prev = Number(previous || 0);
    if (prev === 0) return cur === 0 ? 0 : 100;
    return Number((((cur - prev) / prev) * 100).toFixed(1));
}

function fillDaily(from, to, rows) {
    const map = new Map(
        rows.map((row) => [normalizeDateKey(row.date), Number(row.value || 0)])
    );
    const totalDays = daysBetween(from, to) || 0;
    const output = [];
    for (let i = 0; i < totalDays; i += 1) {
        const date = addDays(from, i);
        output.push({ date, value: map.get(date) ?? 0 });
    }
    return output;
}

export async function buildDashboard({ from, to }) {
    const totalDays = daysBetween(from, to);
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(totalDays - 1));
    const endExclusive = addDays(to, 1);
    const prevEndExclusive = addDays(prevTo, 1);

    const paymentDateField = getFieldName(Payment, "createdAt");
    const reviewDateField = getFieldName(Review, "createdAt");
    const userDateField = getFieldName(User, "createdAt");
    const titleDateField = getFieldName(Title, "createdAt");
    const reportDateField = getFieldName(Report, "createdAt");

    const [
        totalTitles,
        totalUsers,
        newTitlesCur,
        newTitlesPrev,
        newUsersCur,
        newUsersPrev,
        revenueCur,
        revenuePrev,
        viewsCur,
        viewsPrev,
        reviewsCur,
        reviewsPrev,
        openReportsValue,
        openReportsCur,
        openReportsPrev,
        activeSubsCur,
        activeSubsPrev,
        vipMixRows,
        revenueDailyRows,
        viewsDailyRows,
        newUsersDailyRows,
        recentPaymentsRows,
        topTitlesRows,
        reportsQueueRows,
    ] = await Promise.all([
        Title.count({
            where: {
                [titleDateField]: {
                    [Op.lt]: endExclusive,
                },
            },
        }),
        User.count({
            where: {
                [userDateField]: {
                    [Op.lt]: endExclusive,
                },
            },
        }),
        Title.count({
            where: {
                [titleDateField]: {
                    [Op.gte]: from,
                    [Op.lt]: endExclusive,
                },
            },
        }),
        Title.count({
            where: {
                [titleDateField]: {
                    [Op.gte]: prevFrom,
                    [Op.lt]: prevEndExclusive,
                },
            },
        }),
        User.count({
            where: {
                [userDateField]: {
                    [Op.gte]: from,
                    [Op.lt]: endExclusive,
                },
            },
        }),
        User.count({
            where: {
                [userDateField]: {
                    [Op.gte]: prevFrom,
                    [Op.lt]: prevEndExclusive,
                },
            },
        }),
        Payment.sum("amount_cents", {
            where: {
                status: "succeeded",
                [paymentDateField]: {
                    [Op.gte]: from,
                    [Op.lt]: endExclusive,
                },
            },
        }),
        Payment.sum("amount_cents", {
            where: {
                status: "succeeded",
                [paymentDateField]: {
                    [Op.gte]: prevFrom,
                    [Op.lt]: prevEndExclusive,
                },
            },
        }),
        WatchHistory.count({
            where: {
                last_watched_at: {
                    [Op.gte]: from,
                    [Op.lt]: endExclusive,
                },
            },
        }),
        WatchHistory.count({
            where: {
                last_watched_at: {
                    [Op.gte]: prevFrom,
                    [Op.lt]: prevEndExclusive,
                },
            },
        }),
        Review.count({
            where: {
                [reviewDateField]: {
                    [Op.gte]: from,
                    [Op.lt]: endExclusive,
                },
            },
        }),
        Review.count({
            where: {
                [reviewDateField]: {
                    [Op.gte]: prevFrom,
                    [Op.lt]: prevEndExclusive,
                },
            },
        }),
        Report.count({
            where: {
                status: "open",
            },
        }),
        Report.count({
            where: {
                status: "open",
                [reportDateField]: {
                    [Op.gte]: from,
                    [Op.lt]: endExclusive,
                },
            },
        }),
        Report.count({
            where: {
                status: "open",
                [reportDateField]: {
                    [Op.gte]: prevFrom,
                    [Op.lt]: prevEndExclusive,
                },
            },
        }),
        Subscription.count({
            where: {
                status: "active",
                starts_at: {
                    [Op.lt]: endExclusive,
                },
                ends_at: {
                    [Op.gte]: to,
                },
            },
        }),
        Subscription.count({
            where: {
                status: "active",
                starts_at: {
                    [Op.lt]: prevEndExclusive,
                },
                ends_at: {
                    [Op.gte]: prevTo,
                },
            },
        }),
        User.findAll({
            attributes: [
                "role",
                [fn("COUNT", col("id")), "cnt"],
            ],
            group: ["role"],
            raw: true,
        }),
        Payment.findAll({
            attributes: [
                [fn("DATE", col(paymentDateField)), "date"],
                [fn("SUM", col("amount_cents")), "value"],
            ],
            where: {
                status: "succeeded",
                [paymentDateField]: {
                    [Op.gte]: from,
                    [Op.lt]: endExclusive,
                },
            },
            group: [fn("DATE", col(paymentDateField))],
            order: [[fn("DATE", col(paymentDateField)), "ASC"]],
            raw: true,
        }),
        WatchHistory.findAll({
            attributes: [
                [fn("DATE", col("last_watched_at")), "date"],
                [fn("COUNT", col("id")), "value"],
            ],
            where: {
                last_watched_at: {
                    [Op.gte]: from,
                    [Op.lt]: endExclusive,
                },
            },
            group: [fn("DATE", col("last_watched_at"))],
            order: [[fn("DATE", col("last_watched_at")), "ASC"]],
            raw: true,
        }),
        User.findAll({
            attributes: [
                [fn("DATE", col(userDateField)), "date"],
                [fn("COUNT", col("id")), "value"],
            ],
            where: {
                [userDateField]: {
                    [Op.gte]: from,
                    [Op.lt]: endExclusive,
                },
            },
            group: [fn("DATE", col(userDateField))],
            order: [[fn("DATE", col(userDateField)), "ASC"]],
            raw: true,
        }),
        Payment.findAll({
            attributes: [
                "id",
                [col(`${Payment.name}.${paymentDateField}`), "created_at"],
                "provider",
                "amount_cents",
                "status",
            ],
            include: [
                {
                    model: User,
                    attributes: ["display_name"],
                },
                {
                    model: Subscription,
                    attributes: ["id"],
                    include: [
                        {
                            model: Plan,
                            attributes: ["code"],
                        },
                    ],
                },
            ],
            order: [[col(`${Payment.name}.${paymentDateField}`), "DESC"]],
            limit: 10,
            raw: true,
            nest: true,
        }),
        WatchHistory.findAll({
            attributes: [
                "title_id",
                [fn("COUNT", col("WatchHistory.id")), "views"],
            ],
            include: [
                {
                    model: Title,
                    attributes: ["name", "release_year", "access_tier"],
                },
            ],
            where: {
                last_watched_at: {
                    [Op.gte]: from,
                    [Op.lt]: endExclusive,
                },
            },
            group: [
                "title_id",
                "Title.id",
                "Title.name",
                "Title.release_year",
                "Title.access_tier",
            ],
            order: [[fn("COUNT", col("WatchHistory.id")), "DESC"]],
            limit: 10,
            raw: true,
        }),
        Report.findAll({
            attributes: ["id", "scope_type", "reason", "status"],
            where: {
                status: {
                    [Op.in]: ["open", "processing"],
                },
            },
            order: [[col(`${Report.name}.${reportDateField}`), "ASC"]],
            limit: 10,
            raw: true,
        }),
    ]);

    const vipMix = { free: 0, vip: 0, admin: 0 };
    vipMixRows.forEach((row) => {
        vipMix[row.role] = Number(row.cnt || 0);
    });

    const revenueDaily = fillDaily(from, to, revenueDailyRows);
    const viewsDaily = fillDaily(from, to, viewsDailyRows);
    const newUsersDaily = fillDaily(from, to, newUsersDailyRows);

    const recentPayments = recentPaymentsRows.map((payment) => ({
        id: payment.id,
        created_at: payment.created_at,
        user_display_name: payment.User?.display_name || null,
        plan_code: payment.Subscription?.Plan?.code || null,
        provider: payment.provider,
        amount: Number(payment.amount_cents || 0),
        status: payment.status,
    }));

    const topTitles = topTitlesRows.map((row) => ({
        title_id: row.title_id,
        title_name: row["Title.name"],
        release_year: row["Title.release_year"],
        access_tier: row["Title.access_tier"],
        views: Number(row.views || 0),
    }));

    const reportsQueue = reportsQueueRows.map((row) => ({
        id: row.id,
        scope_type: row.scope_type,
        reason: row.reason,
        status: row.status,
    }));

    const revenueCurValue = Number(revenueCur || 0);
    const revenuePrevValue = Number(revenuePrev || 0);
    const viewsCurValue = Number(viewsCur || 0);
    const viewsPrevValue = Number(viewsPrev || 0);
    const reviewsCurValue = Number(reviewsCur || 0);
    const reviewsPrevValue = Number(reviewsPrev || 0);
    const activeSubsCurValue = Number(activeSubsCur || 0);
    const activeSubsPrevValue = Number(activeSubsPrev || 0);

    return {
        range: { from, to },
        kpis: {
            totalTitles: {
                value: Number(totalTitles || 0),
                deltaPct: calcDeltaPct(newTitlesCur, newTitlesPrev),
            },
            totalUsers: {
                value: Number(totalUsers || 0),
                deltaPct: calcDeltaPct(newUsersCur, newUsersPrev),
            },
            activeSubscriptions: {
                value: activeSubsCurValue,
                deltaPct: calcDeltaPct(activeSubsCurValue, activeSubsPrevValue),
            },
            revenue: {
                value: revenueCurValue,
                deltaPct: calcDeltaPct(revenueCurValue, revenuePrevValue),
            },
            views: {
                value: viewsCurValue,
                deltaPct: calcDeltaPct(viewsCurValue, viewsPrevValue),
            },
            reviews: {
                value: reviewsCurValue,
                deltaPct: calcDeltaPct(reviewsCurValue, reviewsPrevValue),
            },
            openReports: {
                value: Number(openReportsValue || 0),
                deltaPct: calcDeltaPct(openReportsCur, openReportsPrev),
            },
            vipMix,
        },
        series: {
            revenueDaily,
            viewsDaily,
            newUsersDaily,
        },
        tables: {
            recentPayments,
            topTitles,
            reportsQueue,
        },
    };
}
