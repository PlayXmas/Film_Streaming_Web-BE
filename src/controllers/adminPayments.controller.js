import {
    getAdminPaymentDetail,
    listAdminPayments,
    manualConfirmAdminPayment,
    markFailedAdminPayment,
    querydrAdminPayment,
} from "../services/adminPayments.service.js";

function handleError(res, error, fallbackMessage) {
    console.error(fallbackMessage, error);
    return res.status(error.status || 500).json({
        success: false,
        message: error.status ? error.message : fallbackMessage,
    });
}

export const getAdminPayments = async (req, res) => {
    try {
        const data = await listAdminPayments(req.query);
        return res.json({
            success: true,
            data,
        });
    } catch (error) {
        return handleError(res, error, "Loi server khi lay danh sach giao dich");
    }
};

export const getAdminPaymentById = async (req, res) => {
    try {
        const data = await getAdminPaymentDetail(req.params.id);
        return res.json({
            success: true,
            data,
        });
    } catch (error) {
        return handleError(res, error, "Loi server khi lay chi tiet giao dich");
    }
};

export const postAdminPaymentQuerydr = async (req, res) => {
    try {
        const data = await querydrAdminPayment(req.params.id, req.user, {
            ipAddress: req.ip,
        });
        return res.json({
            success: true,
            data,
        });
    } catch (error) {
        return handleError(res, error, "Loi server khi truy van VNPay");
    }
};

export const postAdminPaymentManualConfirm = async (req, res) => {
    try {
        const data = await manualConfirmAdminPayment(req.params.id, req.body, req.user);
        return res.json({
            success: true,
            data,
        });
    } catch (error) {
        return handleError(res, error, "Loi server khi duyet giao dich thu cong");
    }
};

export const postAdminPaymentMarkFailed = async (req, res) => {
    try {
        const data = await markFailedAdminPayment(req.params.id, req.body, req.user);
        return res.json({
            success: true,
            data,
        });
    } catch (error) {
        return handleError(res, error, "Loi server khi danh dau giao dich that bai");
    }
};
