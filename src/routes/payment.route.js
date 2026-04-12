import express from "express";
import { handleVnpayIpn, handleVnpayReturn } from "../controllers/payment.controller.js";

const router = express.Router();

router.get("/vnpay/return", handleVnpayReturn);
router.get("/vnpay/ipn", handleVnpayIpn);

export default router;
