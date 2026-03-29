// src/controllers/auth.controller.js
import { OAuth2Client } from "google-auth-library";
import { User } from "../models/index.js";
import { hashPassword, comparePassword } from "../utils/password.util.js";
import { signToken } from "../utils/jwt.util.js";
import { syncUserVipAccess } from "../services/subscriptionAccess.service.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
const USER_ALLOWED_ROLES = ["free", "vip"];
const USER_LOGIN_ROLE_ERROR = "Tài khoản admin không thể đăng nhập vào trang người dùng";
const googleOAuthClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const USER_DISPLAY_NAME_MAX_LENGTH = 120;
const USER_AVATAR_URL_MAX_LENGTH = 255;
const USER_GOOGLE_ID_MAX_LENGTH = 64;

function createHttpError(message, status) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function toAuthUser(user) {
    return {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        gender: user.gender,
        role: user.role,
        vip_expires_at: user.vip_expires_at ?? null,
        is_active: user.is_active,
        created_at: user.created_at ?? null,
    };
}

function buildAuthData(user) {
    return {
        user: toAuthUser(user),
        token: signToken({
            id: user.id,
            email: user.email,
            role: user.role,
        }),
    };
}

function normalizeDisplayName(value, fallbackEmail = "") {
    const trimmed = String(value || "").trim();
    if (trimmed) return trimmed.slice(0, USER_DISPLAY_NAME_MAX_LENGTH);

    const email = String(fallbackEmail || "").trim();
    if (!email) return "Google User";

    return (email.split("@")[0] || "Google User").slice(0, USER_DISPLAY_NAME_MAX_LENGTH);
}

function normalizeAvatarUrl(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return null;
    if (trimmed.length > USER_AVATAR_URL_MAX_LENGTH) {
        return null;
    }

    return trimmed;
}

function validateUserRoleForLogin(user, allowedRoles, roleErrorMessage) {
    if (!allowedRoles.includes(user.role)) {
        return {
            status: 403,
            body: {
                success: false,
                message: roleErrorMessage,
            },
        };
    }

    return null;
}

async function verifyGoogleIdToken(idToken) {
    if (!GOOGLE_CLIENT_ID) {
        throw createHttpError("GOOGLE_CLIENT_ID is not configured", 500);
    }
    if (!googleOAuthClient) {
        throw createHttpError("Google OAuth client is not initialized", 500);
    }

    let payload;
    try {
        const ticket = await googleOAuthClient.verifyIdToken({
            idToken,
            audience: GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
    } catch (err) {
        throw createHttpError(err?.message || "Invalid Google token", 401);
    }

    if (!payload.sub || !payload.email) {
        throw createHttpError("Google token payload is incomplete", 401);
    }

    const emailVerified = payload.email_verified === true || payload.email_verified === "true";
    if (!emailVerified) {
        throw createHttpError("Google email is not verified", 401);
    }

    if (payload.iss && !["https://accounts.google.com", "accounts.google.com"].includes(payload.iss)) {
        throw createHttpError("Google token issuer is invalid", 401);
    }

    const googleId = String(payload.sub).trim();
    if (!googleId || googleId.length > USER_GOOGLE_ID_MAX_LENGTH) {
        throw createHttpError("Google account identifier is invalid", 400);
    }

    return {
        googleId,
        email: String(payload.email).trim().toLowerCase(),
        displayName: normalizeDisplayName(payload.name, payload.email),
        avatarUrl: normalizeAvatarUrl(payload.picture),
    };
}

async function findOrCreateGoogleUser(googleProfile) {
    const { googleId, email, displayName, avatarUrl } = googleProfile;

    let user = await User.findOne({ where: { google_id: googleId } });
    if (user) {
        let shouldSave = false;

        if (!user.avatar_url && avatarUrl) {
            user.avatar_url = avatarUrl;
            shouldSave = true;
        }
        if (!user.display_name) {
            user.display_name = displayName;
            shouldSave = true;
        }

        if (shouldSave) {
            await user.save();
        }

        return user;
    }

    user = await User.findOne({ where: { email } });
    if (user) {
        if (user.google_id && user.google_id !== googleId) {
            return {
                error: {
                    status: 409,
                    message: "Email này đã được liên kết với một tài khoản Google khác",
                },
            };
        }

        let shouldSave = false;
        if (!user.google_id) {
            user.google_id = googleId;
            shouldSave = true;
        }
        if (!user.avatar_url && avatarUrl) {
            user.avatar_url = avatarUrl;
            shouldSave = true;
        }
        if (!user.display_name) {
            user.display_name = displayName;
            shouldSave = true;
        }

        if (shouldSave) {
            await user.save();
        }

        return user;
    }

    return User.create({
        email,
        google_id: googleId,
        display_name: displayName,
        avatar_url: avatarUrl,
        gender: "unspecified",
        role: "free",
    });
}



export const register = async (req, res, next) => {
    try {
        const { email, password, display_name, gender } = req.body;

        // 1. Validate
        if (!email || !password || !display_name) {
            return res.status(400).json({
                message: "Vui lòng nhập đầy đủ email, mật khẩu và display_name",
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: "Mật khẩu phải có ít nhất 8 ký tự",
            });
        }

        // 2. Check email trùng
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({
                message: "Email đã được đăng ký",
            });
        }

        // 3. Hash password
        const passwordHash = await hashPassword(password);

        // 4. Tạo user
        const newUser = await User.create({
            email,
            password_hash: passwordHash,          // đúng tên cột trong model
            display_name,
            gender: gender || "unspecified",      // male | female | unspecified
            // role, is_active dùng default trong model
        });

        // 5. JWT
        return res.status(201).json({
            success: true,
            message: "Đăng ký thành công",
            data: buildAuthData(newUser),
        });
    } catch (err) {
        console.error("Register error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi đăng ký",
        });
    }
};



export const registerAdmin = async (req, res) => {
    try {
        const { email, password, display_name, gender } = req.body || {};

        if (!email || !password || !display_name) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập đầy đủ email, mật khẩu và display_name",
            });
        }

        if (String(password).length < 8) {
            return res.status(400).json({
                success: false,
                message: "Mật khẩu phải có ít nhất 8 ký tự",
            });
        }

        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "Email đã được đăng ký",
            });
        }

        const passwordHash = await hashPassword(password);

        const newUser = await User.create({
            email,
            password_hash: passwordHash,
            display_name,
            gender: gender || "unspecified",
            role: "admin",
        });

        return res.status(201).json({
            success: true,
            message: "Đăng ký admin thành công",
            data: buildAuthData(newUser),
        });
    } catch (err) {
        console.error("registerAdmin error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi đăng ký admin",
        });
    }
};

export const loginWithGoogle = async (req, res) => {
    try {
        const idToken = String(req.body?.idToken || "").trim();
        if (!idToken) {
            return res.status(400).json({
                success: false,
                message: "Thiếu Google ID token",
            });
        }

        let googleProfile;
        try {
            googleProfile = await verifyGoogleIdToken(idToken);
        } catch (err) {
            console.error("verifyGoogleIdToken error:", err.message);
            return res.status(err.status || 500).json({
                success: false,
                message:
                    err.status === 500
                        ? "Server chưa cấu hình Google Sign-In"
                        : "Google token không hợp lệ hoặc đã hết hạn",
            });
        }

        const result = await findOrCreateGoogleUser(googleProfile);
        if (result?.error) {
            return res.status(result.error.status).json({
                success: false,
                message: result.error.message,
            });
        }

        const user = result;
        if (user.is_active === false) {
            return res.status(403).json({
                success: false,
                message: "Tài khoản đã bị khóa",
            });
        }

        await syncUserVipAccess(user);

        const roleError = validateUserRoleForLogin(
            user,
            USER_ALLOWED_ROLES,
            USER_LOGIN_ROLE_ERROR
        );
        if (roleError) {
            return res.status(roleError.status).json(roleError.body);
        }

        return res.status(200).json({
            success: true,
            message: "Đăng nhập Google thành công",
            data: buildAuthData(user),
        });
    } catch (err) {
        console.error("loginWithGoogle error:", {
            message: err.message,
            name: err.name,
            sqlMessage: err.parent?.sqlMessage,
            sqlState: err.parent?.sqlState,
            code: err.parent?.code,
        });
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi đăng nhập Google",
        });
    }
};

// ========== LOGIN ==========
const doLogin = (allowedRoles, roleErrorMessage) => async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập đầy đủ email và mật khẩu",
            });
        }

        const user = await User.findOne({ where: { email } });

        if (!user || !user.password_hash) {
            return res.status(401).json({
                success: false,
                message: "Email hoặc mật khẩu không đúng",
            });
        }

        const isMatch = await comparePassword(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Email hoặc mật khẩu không đúng",
            });
        }

        if (user.is_active === false) {
            return res.status(403).json({
                success: false,
                message: "Tài khoản đã bị khóa",
            });
        }

        await syncUserVipAccess(user);

        const roleError = validateUserRoleForLogin(user, allowedRoles, roleErrorMessage);
        if (roleError) {
            return res.status(roleError.status).json(roleError.body);
        }

        return res.status(200).json({
            success: true,
            message: "Đăng nhập thành công",
            data: buildAuthData(user),
        });
    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi server khi đăng nhập",
        });
    }
};

// User login: chỉ free/vip
export const loginUser = doLogin(
    USER_ALLOWED_ROLES,
    USER_LOGIN_ROLE_ERROR
);

// Admin login: chỉ admin
export const loginAdmin = doLogin(
    ["admin"],
    "Chỉ tài khoản admin mới được đăng nhập trang quản trị"
);

// Giữ tương thích FE user hiện tại đang gọi /auth/login
export const login = loginUser;
