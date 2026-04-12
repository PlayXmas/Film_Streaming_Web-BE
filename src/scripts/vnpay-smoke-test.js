import app from "../app.js";
import { sequelize } from "../models/index.js";
import { signVnpayParams, toVnpayDate } from "../utils/vnpay.util.js";

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function readJson(response) {
    const text = await response.text();
    try {
        return text ? JSON.parse(text) : {};
    } catch (err) {
        throw new Error(`Response không phải JSON hợp lệ. Status=${response.status}, body=${text}`);
    }
}

function buildSignedParams(params) {
    const vnp_SecureHash = signVnpayParams(params, process.env.VNP_HASH_SECRET);
    const search = new URLSearchParams();
    Object.entries({ ...params, vnp_SecureHash }).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        search.set(key, String(value));
    });
    return search.toString();
}

async function main() {
    const server = app.listen(0);

    try {
        await new Promise((resolve, reject) => {
            server.once("listening", resolve);
            server.once("error", reject);
        });

        const { port } = server.address();
        const baseUrl = `http://127.0.0.1:${port}/api`;
        const email = `vnpay.test.${Date.now()}@example.com`;
        const password = "Password123!";
        const displayName = "VNPay Test User";

        console.log(`Using base URL: ${baseUrl}`);
        console.log(`Registering test user: ${email}`);

        const registerRes = await fetch(`${baseUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email,
                password,
                display_name: displayName,
                gender: "unspecified",
            }),
        });
        const registerJson = await readJson(registerRes);
        assert(registerRes.ok, `Đăng ký thất bại: ${JSON.stringify(registerJson)}`);
        const token = registerJson?.data?.token;
        assert(token, "Register không trả token");

        const plansRes = await fetch(`${baseUrl}/plans`);
        const plansJson = await readJson(plansRes);
        assert(plansRes.ok, `Lấy plans thất bại: ${JSON.stringify(plansJson)}`);
        const plan = Array.isArray(plansJson?.data) ? plansJson.data[0] : null;
        assert(plan?.id, "Không tìm thấy plan để test");
        console.log(`Using plan: ${plan.code || plan.id}`);

        const createRes = await fetch(`${baseUrl}/users/subscription/vnpay/create`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                planId: plan.id,
            }),
        });
        const createJson = await readJson(createRes);
        assert(createRes.ok, `Tạo payment thất bại: ${JSON.stringify(createJson)}`);
        const paymentId = createJson?.data?.payment_id;
        const txnRef = createJson?.data?.txn_ref;
        assert(paymentId && txnRef, "Create payment không trả payment_id/txn_ref");
        console.log(`Created payment ${paymentId} with txn_ref ${txnRef}`);

        const amountVnp = Number(plan.price_cents) * 100;
        const payDate = toVnpayDate(new Date());
        const commonParams = {
            vnp_Amount: amountVnp,
            vnp_BankCode: "NCB",
            vnp_BankTranNo: `BANK${Date.now()}`,
            vnp_CardType: "ATM",
            vnp_OrderInfo: `Thanh toan goi ${plan.code || plan.id}`,
            vnp_PayDate: payDate,
            vnp_ResponseCode: "00",
            vnp_TransactionNo: `TXN${Date.now()}`,
            vnp_TransactionStatus: "00",
            vnp_TxnRef: txnRef,
        };

        const returnQuery = buildSignedParams(commonParams);
        const returnRes = await fetch(`${baseUrl}/payments/vnpay/return?${returnQuery}`, {
            redirect: "manual",
        });
        const redirectLocation = returnRes.headers.get("location");
        assert(
            returnRes.status === 302 || returnRes.ok,
            `VNPay return thất bại, status=${returnRes.status}`
        );
        console.log(`Return handler status=${returnRes.status}, redirect=${redirectLocation || "none"}`);

        const ipnQuery = buildSignedParams(commonParams);
        const ipnRes = await fetch(`${baseUrl}/payments/vnpay/ipn?${ipnQuery}`);
        const ipnJson = await readJson(ipnRes);
        assert(ipnRes.ok, `IPN thất bại: ${JSON.stringify(ipnJson)}`);
        assert(ipnJson?.RspCode === "00", `IPN không confirm success: ${JSON.stringify(ipnJson)}`);
        console.log(`IPN response: ${JSON.stringify(ipnJson)}`);

        const paymentsRes = await fetch(`${baseUrl}/users/payments`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        const paymentsJson = await readJson(paymentsRes);
        assert(paymentsRes.ok, `Lấy payments thất bại: ${JSON.stringify(paymentsJson)}`);
        const testedPayment = Array.isArray(paymentsJson?.data)
            ? paymentsJson.data.find((item) => Number(item.id) === Number(paymentId))
            : null;
        assert(testedPayment, "Không tìm thấy payment vừa test");
        assert(testedPayment.status === "succeeded", `Payment chưa success: ${testedPayment.status}`);
        assert(testedPayment.subscription_id, "Payment chưa gắn subscription_id");

        const subscriptionRes = await fetch(`${baseUrl}/users/subscription`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        const subscriptionJson = await readJson(subscriptionRes);
        assert(subscriptionRes.ok, `Lấy subscription thất bại: ${JSON.stringify(subscriptionJson)}`);
        assert(subscriptionJson?.data?.status === "active", "Subscription chưa active sau IPN");

        console.log("VNPay smoke test passed.");
        console.log(
            JSON.stringify(
                {
                    user_email: email,
                    payment_id: paymentId,
                    txn_ref: txnRef,
                    payment_status: testedPayment.status,
                    subscription_id: testedPayment.subscription_id,
                },
                null,
                2
            )
        );
    } finally {
        await new Promise((resolve) => server.close(resolve));
        await sequelize.close();
    }
}

main().catch((err) => {
    console.error("VNPay smoke test failed:", err.message);
    process.exitCode = 1;
});
