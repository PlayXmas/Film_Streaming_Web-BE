import {
    deleteAdminReview,
    getAdminUserDetail,
    listAdminUserReviews,
    listAdminUsers,
    updateAdminUser,
    updateAdminUserStatus,
} from "../services/adminUsers.service.js";

function handleError(res, error, fallbackMessage) {
    console.error(fallbackMessage, error);
    return res.status(error.status || 500).json({
        success: false,
        message: error.status ? error.message : fallbackMessage,
    });
}

export const getAdminUsers = async (req, res) => {
    try {
        const data = await listAdminUsers(req.query);
        return res.json({
            success: true,
            data: data.items,
            pagination: data.pagination,
            filters: data.filters,
            summary: data.summary,
        });
    } catch (error) {
        return handleError(res, error, "Lỗi server khi lấy danh sách người dùng");
    }
};

export const getAdminUserById = async (req, res) => {
    try {
        const data = await getAdminUserDetail(req.params.id);
        return res.json({
            success: true,
            data,
        });
    } catch (error) {
        return handleError(res, error, "Lỗi server khi lấy chi tiết người dùng");
    }
};

export const patchAdminUser = async (req, res) => {
    try {
        const data = await updateAdminUser(req.params.id, req.body, req.user?.id);
        return res.json({
            success: true,
            data,
        });
    } catch (error) {
        return handleError(res, error, "Lỗi server khi cập nhật người dùng");
    }
};

export const patchAdminUserStatus = async (req, res) => {
    try {
        const data = await updateAdminUserStatus(req.params.id, req.body, req.user?.id);
        return res.json({
            success: true,
            data,
        });
    } catch (error) {
        return handleError(res, error, "Lỗi server khi cập nhật trạng thái người dùng");
    }
};

export const getAdminUserReviews = async (req, res) => {
    try {
        const data = await listAdminUserReviews(req.params.id, req.query);
        return res.json({
            success: true,
            data: data.items,
            pagination: data.pagination,
            filters: data.filters,
            user: data.user,
        });
    } catch (error) {
        return handleError(res, error, "Lỗi server khi lấy bình luận của người dùng");
    }
};

export const removeAdminReview = async (req, res) => {
    try {
        const data = await deleteAdminReview(req.params.reviewId);
        return res.json({
            success: true,
            message: "Đã xóa bình luận",
            data,
        });
    } catch (error) {
        return handleError(res, error, "Lỗi server khi xóa bình luận");
    }
};
