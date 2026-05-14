// src/utils/jwt.util.js
import "../bootstrap.js";
import jwt from "jsonwebtoken";

function readJwtSecret() {
    const secret = String(process.env.JWT_SECRET || "").trim();
    if (!secret) {
        throw new Error("Thiếu cấu hình JWT_SECRET");
    }
    return secret;
}

function readJwtExpiresIn() {
    return String(process.env.JWT_EXPIRES_IN || "7d").trim() || "7d";
}

export function signToken(payload) {
    return jwt.sign(payload, readJwtSecret(), { expiresIn: readJwtExpiresIn() });
}

export function verifyToken(token) {
    return jwt.verify(token, readJwtSecret());
}
