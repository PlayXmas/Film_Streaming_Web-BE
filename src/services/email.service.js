// src/services/email.service.js
import nodemailer from "nodemailer";

const smtpPort = Number(process.env.SMTP_PORT || 587);

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort,
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || smtpPort === 465,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

function assertMailConfig() {
    const requiredEnv = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];
    const missingEnv = requiredEnv.filter((key) => !process.env[key]);

    if (missingEnv.length > 0) {
        throw new Error(`Missing email config: ${missingEnv.join(", ")}`);
    }
}

export async function sendPasswordResetCode(toEmail, otpCode) {
    assertMailConfig();

    return transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: toEmail,
        subject: "Ma xac nhan khoi phuc mat khau",
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
                <h2 style="margin: 0 0 16px; color: #111827;">Khoi phuc mat khau</h2>
                <p style="color: #374151;">Ban vua yeu cau dat lai mat khau cho tai khoan Film Streaming.</p>
                <p style="color: #374151;">Ma xac nhan cua ban la:</p>
                <div style="text-align: center; margin: 24px 0;">
                    <span style="display: inline-block; font-size: 32px; letter-spacing: 6px; font-weight: 700; color: #111827; background: #f3f4f6; padding: 12px 20px; border-radius: 8px;">
                        ${otpCode}
                    </span>
                </div>
                <p style="color: #dc2626;">Ma nay se het han sau 15 phut. Khong chia se ma nay voi bat ky ai.</p>
                <p style="color: #6b7280;">Neu ban khong yeu cau dat lai mat khau, vui long bo qua email nay.</p>
            </div>
        `,
    });
}
