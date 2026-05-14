// src/app.js
import "./bootstrap.js";
import cors from "cors";
import express from "express";
import multer from "multer";
import path from "path";
import { handleVnpayIpn, handleVnpayReturn } from "./controllers/payment.controller.js";
import "./config/db.js";
import routes from "./routes/index.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "1mb" }));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_BODY_LIMIT || "1mb" }));

// Chặn media gốc/HLS khỏi static public, giữ nguyên ảnh public để không đổi contract FE.
app.use("/uploads/media", (req, res) => {
    return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài nguyên",
    });
});

// serve static uploads
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// VNPay callback aliases để khớp nhiều kiểu cấu hình URL khác nhau
app.get("/vnpay_ipn", handleVnpayIpn);
app.get("/vnpay_return", handleVnpayReturn);
app.get("/IPN", handleVnpayIpn);
app.get("/RETURN", handleVnpayReturn);

// prefix chung cho API
app.use("/api", routes);

app.get("/", (req, res) => {
    res.send("Film backend is running");
});

app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            success: false,
            message: err.message,
        });
    }

    const status = Number.isInteger(err?.status) ? err.status : 500;
    const message = status >= 500
        ? "Lỗi server"
        : err?.message || "Yêu cầu không hợp lệ";

    if (status >= 500) {
        console.error("Unhandled app error:", err);
    }

    return res.status(status).json({
        success: false,
        message,
    });
});

export default app;
