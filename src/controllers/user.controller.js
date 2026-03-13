// src/controllers/user.controller.js
import { hashPassword, comparePassword } from "../utils/password.util.js";
import { deleteUploadFileByUrl } from "../utils/file.util.js";

const ALLOWED_GENDERS = ["male", "female", "unspecified"];

export const getMe = async (req, res) => {
    // nhờ middleware authenticate nên ở đây luôn có req.user
    const user = req.user;

    return res.status(200).json({
        success: true,
        data: {
            user: {
                id: user.id,
                email: user.email,
                display_name: user.display_name,
                avatar_url: user.avatar_url,
                gender: user.gender,
                role: user.role,
                is_active: user.is_active,
                created_at: user.createdAt,
                updated_at: user.updatedAt,
            },
        },
    });
};


export const updateMe = async (req, res) => {
    try {
        const user = req.user; // có từ middleware authenticate
        const { display_name, gender } = req.body;

        // update display_name
        if (display_name !== undefined) {
            const v = String(display_name).trim();
            user.display_name = v;
        }

        // update gender: chỉ cho 3 giá trị
        if (gender !== undefined) {
            const g = String(gender).trim();
            const allowed = ["male", "female", "unspecified"];
            user.gender = allowed.includes(g) ? g : "unspecified";
        }

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Cập nhật thông tin thành công",
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    display_name: user.display_name,
                    avatar_url: user.avatar_url, // vẫn trả về để FE hiển thị
                    gender: user.gender,
                    role: user.role,
                    is_active: user.is_active,
                    created_at: user.createdAt,
                    updated_at: user.updatedAt,
                },
            },
        });
    } catch (err) {
        console.error("updateMe error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi cập nhật thông tin",
        });
    }
};


export const changePassword = async (req, res) => {
    try {
        const user = req.user;
        const { current_password, new_password, confirm_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập current_password và new_password",
            });
        }

        if (new_password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Mật khẩu mới phải có ít nhất 8 ký tự",
            });
        }

        if (
            confirm_password !== undefined &&
            new_password !== confirm_password
        ) {
            return res.status(400).json({
                success: false,
                message: "Mật khẩu xác nhận không khớp",
            });
        }

        // Nếu user chưa có password_hash (tài khoản Google chẳng hạn)
        if (!user.password_hash) {
            return res.status(400).json({
                success: false,
                message:
                    "Tài khoản này chưa có mật khẩu hoặc đăng nhập bằng Google, không thể đổi mật khẩu theo cách này",
            });
        }

        // So sánh mật khẩu hiện tại
        const isMatch = await comparePassword(
            current_password,
            user.password_hash
        );

        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: "Mật khẩu hiện tại không đúng",
            });
        }

        // Hash mật khẩu mới và lưu
        const newHash = await hashPassword(new_password);
        user.password_hash = newHash;
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Đổi mật khẩu thành công",
        });
    } catch (err) {
        console.error("Change password error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi đổi mật khẩu",
        });
    }
};

export const uploadMyAvatar = async (req, res) => {
    try {
        const user = req.user;

        if (!req.file) {
            return res.status(400).json({ success: false, message: "Chưa chọn file ảnh" });
        }

        const oldAvatarUrl = user.avatar_url;

        // URL public để FE dùng
        const avatarUrl = `/uploads/avatars/${req.file.filename}`;

        user.avatar_url = avatarUrl;
        await user.save();

        if (oldAvatarUrl && oldAvatarUrl !== avatarUrl) {
            deleteUploadFileByUrl(oldAvatarUrl).catch((err) => {
                console.warn("delete old avatar failed:", err);
            });
        }

        return res.json({
            success: true,
            message: "Cập nhật avatar thành công",
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    display_name: user.display_name,
                    avatar_url: user.avatar_url,
                    gender: user.gender,
                },
            },
        });
    } catch (err) {
        console.error("uploadMyAvatar error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server khi upload avatar" });
    }
};

export const deleteMyAvatar = async (req, res) => {
    try {
        const user = req.user;
        const oldAvatarUrl = user.avatar_url;

        if (!oldAvatarUrl) {
            return res.status(400).json({ success: false, message: "Chưa có avatar để xóa" });
        }

        user.avatar_url = null;
        await user.save();

        deleteUploadFileByUrl(oldAvatarUrl).catch((err) => {
            console.warn("delete avatar file failed:", err);
        });

        return res.json({
            success: true,
            message: "Đã xóa avatar",
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    display_name: user.display_name,
                    avatar_url: user.avatar_url,
                    gender: user.gender,
                },
            },
        });
    } catch (err) {
        console.error("deleteMyAvatar error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server khi xóa avatar" });
    }
};


