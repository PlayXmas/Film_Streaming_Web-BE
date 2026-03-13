// src/utils/password.util.js
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export async function hashPassword(plainPassword) {
    return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

export async function comparePassword(plainPassword, hashedPassword) {
    if (!hashedPassword) {
        return false;
    }
    return bcrypt.compare(plainPassword, hashedPassword);
}
