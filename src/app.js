// src/app.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import routes from "./routes/index.js";
import "./config/db.js";
import path from "path";
import { handleVnpayIpn, handleVnpayReturn } from "./controllers/payment.controller.js";

// load env sớm
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

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

export default app;
