import {
    buildAdminReportDetail,
    buildAdminReportsList,
    buildAdminReportsSummary,
    updateAdminReport,
} from "../services/adminReports.service.js";

function handleError(res, error, fallbackMessage) {
    console.error(fallbackMessage, error);
    return res.status(error.status || 500).json({
        success: false,
        message: error.status ? error.message : fallbackMessage,
    });
}

export const getAdminReportsSummary = async (req, res) => {
    try {
        const data = await buildAdminReportsSummary();
        return res.json({
            success: true,
            data,
        });
    } catch (error) {
        return handleError(res, error, "Lỗi server khi lấy tổng quan report");
    }
};

export const getAdminReports = async (req, res) => {
    try {
        const data = await buildAdminReportsList(req.query);
        return res.json({
            success: true,
            data: data.items,
            pagination: data.pagination,
            filters: data.filters,
        });
    } catch (error) {
        return handleError(res, error, "Lỗi server khi lấy danh sách report");
    }
};

export const getAdminReportById = async (req, res) => {
    try {
        const data = await buildAdminReportDetail(req.params.id);
        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy report",
            });
        }

        return res.json({
            success: true,
            data,
        });
    } catch (error) {
        return handleError(res, error, "Lỗi server khi lấy chi tiết report");
    }
};

export const patchAdminReport = async (req, res) => {
    try {
        const data = await updateAdminReport(req.params.id, req.body, req.user?.id);
        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy report",
            });
        }

        return res.json({
            success: true,
            data,
        });
    } catch (error) {
        return handleError(res, error, "Lỗi server khi cập nhật report");
    }
};
