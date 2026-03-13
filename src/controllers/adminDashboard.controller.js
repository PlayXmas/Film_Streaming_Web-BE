import { buildDashboard } from "../services/adminDashboard.service.js";
import { isValidISODate, parseISODate } from "../utils/dateRange.js";

export const getAdminDashboard = async (req, res) => {
    try {
        const { from, to } = req.query;

        if (!isValidISODate(from) || !isValidISODate(to)) {
            return res.status(400).json({
                message: "Missing or invalid from/to (YYYY-MM-DD)",
            });
        }

        const fromDate = parseISODate(from);
        const toDate = parseISODate(to);

        if (!fromDate || !toDate || fromDate > toDate) {
            return res.status(400).json({
                message: "Invalid date range",
            });
        }

        const data = await buildDashboard({ from, to });
        return res.json(data);
    } catch (error) {
        console.error("getAdminDashboard error:", error);
        return res.status(500).json({
            message: "Lỗi server khi lấy dashboard",
        });
    }
};
