import app from "../app.js";
import { Payment, Subscription, sequelize } from "../models/index.js";
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

function buildSignedQuery(params) {
    const vnp_SecureHash = signVnpayParams(params, process.env.VNP_HASH_SECRET);
    const search = new URLSearchParams();

    Object.entries({ ...params, vnp_SecureHash }).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        search.set(key, String(value));
    });

    return search.toString();
}

async function registerUser(baseUrl, suffix) {
    const email = `vnpay.edge.${suffix}.${Date.now()}@example.com`;
    const res = await fetch(`${baseUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email,
            password: "Password123!",
            display_name: `VNPay Edge ${suffix}`,
            gender: "unspecified",
        }),
    });
    const json = await readJson(res);
    assert(res.ok, `Đăng ký user ${suffix} thất bại: ${JSON.stringify(json)}`);
    return {
        email,
        token: json?.data?.token,
        userId: json?.data?.user?.id,
    };
}

async function getFirstPlan(baseUrl) {
    const res = await fetch(`${baseUrl}/plans`);
    const json = await readJson(res);
    assert(res.ok, `Lấy plans thất bại: ${JSON.stringify(json)}`);
    const plan = Array.isArray(json?.data) ? json.data[0] : null;
    assert(plan?.id, "Không có plan để test");
    return plan;
}

async function createCheckout(baseUrl, token, planId) {
    const res = await fetch(`${baseUrl}/users/subscription/vnpay/create`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ planId }),
    });
    const json = await readJson(res);
    assert(res.ok, `Tạo checkout thất bại: ${JSON.stringify(json)}`);
    return json.data;
}

function buildVnpParams({ txnRef, amount, responseCode, transactionStatus, transactionNo }) {
    const nowSuffix = Date.now();
    return {
        vnp_Amount: Number(amount) * 100,
        vnp_BankCode: "NCB",
        vnp_BankTranNo: `BANK${nowSuffix}`,
        vnp_CardType: "ATM",
        vnp_OrderInfo: `Thanh toan VNPay test ${txnRef}`,
        vnp_PayDate: toVnpayDate(new Date()),
        vnp_ResponseCode: responseCode,
        vnp_TransactionNo: transactionNo || `TXN${nowSuffix}`,
        vnp_TransactionStatus: transactionStatus,
        vnp_TxnRef: txnRef,
    };
}

async function callIpn(baseUrl, params) {
    const res = await fetch(`${baseUrl}/payments/vnpay/ipn?${buildSignedQuery(params)}`);
    const json = await readJson(res);
    assert(res.ok, `IPN call thất bại: ${JSON.stringify(json)}`);
    return json;
}

async function callIpnWithRawQuery(baseUrl, queryString) {
    const res = await fetch(`${baseUrl}/payments/vnpay/ipn?${queryString}`);
    const json = await readJson(res);
    assert(res.ok, `IPN raw call thất bại: ${JSON.stringify(json)}`);
    return json;
}

async function getMySubscription(baseUrl, token) {
    const res = await fetch(`${baseUrl}/users/subscription`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const json = await readJson(res);
    assert(res.ok, `Lấy subscription thất bại: ${JSON.stringify(json)}`);
    return json.data;
}

async function testPaymentFailed(baseUrl, plan) {
    const user = await registerUser(baseUrl, "failed");
    const checkout = await createCheckout(baseUrl, user.token, plan.id);
    const ipnJson = await callIpn(
        baseUrl,
        buildVnpParams({
            txnRef: checkout.txn_ref,
            amount: checkout.amount,
            responseCode: "51",
            transactionStatus: "02",
        })
    );

    assert(ipnJson?.RspCode === "00", `IPN failed-case không trả confirm success: ${JSON.stringify(ipnJson)}`);

    const payment = await Payment.findByPk(checkout.payment_id);
    assert(payment, "Không tìm thấy payment fail");
    assert(payment.status === "failed", `Expected failed, got ${payment.status}`);
    assert(!payment.subscription_id, "Payment failed không được gắn subscription");

    const subscriptionCount = await Subscription.count({ where: { user_id: user.userId } });
    assert(subscriptionCount === 0, `Payment failed tạo subscription ngoài ý muốn: ${subscriptionCount}`);

    const currentSub = await getMySubscription(baseUrl, user.token);
    assert(currentSub === null, "Payment failed nhưng user vẫn có subscription active");

    return {
        email: user.email,
        payment_id: checkout.payment_id,
        status: payment.status,
    };
}

async function testPaymentCancelled(baseUrl, plan) {
    const user = await registerUser(baseUrl, "cancelled");
    const checkout = await createCheckout(baseUrl, user.token, plan.id);
    const ipnJson = await callIpn(
        baseUrl,
        buildVnpParams({
            txnRef: checkout.txn_ref,
            amount: checkout.amount,
            responseCode: "24",
            transactionStatus: "02",
        })
    );

    assert(ipnJson?.RspCode === "00", `IPN cancel-case không trả confirm success: ${JSON.stringify(ipnJson)}`);

    const payment = await Payment.findByPk(checkout.payment_id);
    assert(payment, "Không tìm thấy payment cancel");
    assert(payment.status === "cancelled", `Expected cancelled, got ${payment.status}`);
    assert(!payment.subscription_id, "Payment cancelled không được gắn subscription");

    const subscriptionCount = await Subscription.count({ where: { user_id: user.userId } });
    assert(subscriptionCount === 0, `Payment cancelled tạo subscription ngoài ý muốn: ${subscriptionCount}`);

    const currentSub = await getMySubscription(baseUrl, user.token);
    assert(currentSub === null, "Payment cancelled nhưng user vẫn có subscription active");

    return {
        email: user.email,
        payment_id: checkout.payment_id,
        status: payment.status,
    };
}

async function testDuplicateIpn(baseUrl, plan) {
    const user = await registerUser(baseUrl, "duplicate");
    const checkout = await createCheckout(baseUrl, user.token, plan.id);
    const params = buildVnpParams({
        txnRef: checkout.txn_ref,
        amount: checkout.amount,
        responseCode: "00",
        transactionStatus: "00",
        transactionNo: `TXN${Date.now()}`,
    });

    const firstIpn = await callIpn(baseUrl, params);
    assert(firstIpn?.RspCode === "00", `First IPN không thành công: ${JSON.stringify(firstIpn)}`);

    const afterFirstPayment = await Payment.findByPk(checkout.payment_id);
    assert(afterFirstPayment?.status === "succeeded", "First IPN không chuyển payment sang succeeded");
    const firstSubscriptionId = afterFirstPayment.subscription_id;
    assert(firstSubscriptionId, "First IPN không tạo subscription");

    const subCountAfterFirst = await Subscription.count({ where: { user_id: user.userId } });
    assert(subCountAfterFirst === 1, `Expected 1 subscription sau first IPN, got ${subCountAfterFirst}`);

    const secondIpn = await callIpn(baseUrl, params);
    assert(secondIpn?.RspCode === "00", `Second IPN không trả confirm success: ${JSON.stringify(secondIpn)}`);

    const afterSecondPayment = await Payment.findByPk(checkout.payment_id);
    const subCountAfterSecond = await Subscription.count({ where: { user_id: user.userId } });
    assert(subCountAfterSecond === 1, `Duplicate IPN tạo thêm subscription: ${subCountAfterSecond}`);
    assert(
        Number(afterSecondPayment.subscription_id) === Number(firstSubscriptionId),
        "Duplicate IPN đã thay đổi subscription_id"
    );

    const currentSub = await getMySubscription(baseUrl, user.token);
    assert(currentSub?.id === firstSubscriptionId, "Subscription active sau duplicate IPN không đúng");

    return {
        email: user.email,
        payment_id: checkout.payment_id,
        status: afterSecondPayment.status,
        subscription_id: firstSubscriptionId,
    };
}

async function testRepurchaseExtendsSubscription(baseUrl, plan) {
    const user = await registerUser(baseUrl, "extend");

    const firstCheckout = await createCheckout(baseUrl, user.token, plan.id);
    const firstIpn = await callIpn(
        baseUrl,
        buildVnpParams({
            txnRef: firstCheckout.txn_ref,
            amount: firstCheckout.amount,
            responseCode: "00",
            transactionStatus: "00",
            transactionNo: `TXN${Date.now()}A`,
        })
    );
    assert(firstIpn?.RspCode === "00", `First repurchase IPN failed: ${JSON.stringify(firstIpn)}`);

    const firstPayment = await Payment.findByPk(firstCheckout.payment_id);
    const firstSubscription = await Subscription.findByPk(firstPayment.subscription_id);
    assert(firstSubscription, "Không tìm thấy subscription sau lần mua đầu");

    const originalEndsAt = new Date(firstSubscription.ends_at);
    const secondCheckout = await createCheckout(baseUrl, user.token, plan.id);
    const secondIpn = await callIpn(
        baseUrl,
        buildVnpParams({
            txnRef: secondCheckout.txn_ref,
            amount: secondCheckout.amount,
            responseCode: "00",
            transactionStatus: "00",
            transactionNo: `TXN${Date.now()}B`,
        })
    );
    assert(secondIpn?.RspCode === "00", `Second repurchase IPN failed: ${JSON.stringify(secondIpn)}`);

    const secondPayment = await Payment.findByPk(secondCheckout.payment_id);
    const updatedSubscription = await Subscription.findByPk(firstSubscription.id);
    assert(secondPayment.subscription_id === firstSubscription.id, "Mua thêm phải giữ nguyên subscription hiện tại");

    const expectedEndsAt = new Date(
        originalEndsAt.getTime() + Number(plan.duration_days) * 24 * 60 * 60 * 1000
    );
    assert(
        updatedSubscription.ends_at.getTime() === expectedEndsAt.getTime(),
        `Expected ends_at=${expectedEndsAt.toISOString()}, got ${updatedSubscription.ends_at.toISOString()}`
    );

    const subscriptionCount = await Subscription.count({ where: { user_id: user.userId } });
    assert(subscriptionCount === 1, `Mua thêm không được tạo subscription mới, got ${subscriptionCount}`);

    const currentSub = await getMySubscription(baseUrl, user.token);
    assert(currentSub?.id === firstSubscription.id, "Subscription active sau mua thêm không đúng");

    return {
        email: user.email,
        first_payment_id: firstCheckout.payment_id,
        second_payment_id: secondCheckout.payment_id,
        subscription_id: firstSubscription.id,
        ends_at: updatedSubscription.ends_at,
    };
}

async function testInvalidSignature(baseUrl, plan) {
    const user = await registerUser(baseUrl, "invalid-signature");
    const checkout = await createCheckout(baseUrl, user.token, plan.id);
    const params = buildVnpParams({
        txnRef: checkout.txn_ref,
        amount: checkout.amount,
        responseCode: "00",
        transactionStatus: "00",
    });

    const tamperedQuery = new URLSearchParams();
    Object.entries({ ...params, vnp_SecureHash: "INVALID_SIGNATURE" }).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        tamperedQuery.set(key, String(value));
    });

    const ipnJson = await callIpnWithRawQuery(baseUrl, tamperedQuery.toString());
    assert(ipnJson?.RspCode === "97", `Expected invalid signature code 97, got ${JSON.stringify(ipnJson)}`);

    const payment = await Payment.findByPk(checkout.payment_id);
    assert(payment, "Không tìm thấy payment invalid signature");
    assert(payment.status === "pending", `Invalid signature không được đổi trạng thái, got ${payment.status}`);
    assert(!payment.subscription_id, "Invalid signature không được tạo subscription");

    const subscriptionCount = await Subscription.count({ where: { user_id: user.userId } });
    assert(subscriptionCount === 0, `Invalid signature tạo subscription ngoài ý muốn: ${subscriptionCount}`);

    return {
        email: user.email,
        payment_id: checkout.payment_id,
        status: payment.status,
        rsp_code: ipnJson.RspCode,
    };
}

async function testAmountMismatch(baseUrl, plan) {
    const user = await registerUser(baseUrl, "amount-mismatch");
    const checkout = await createCheckout(baseUrl, user.token, plan.id);
    const ipnJson = await callIpn(
        baseUrl,
        buildVnpParams({
            txnRef: checkout.txn_ref,
            amount: Number(checkout.amount) + 1,
            responseCode: "00",
            transactionStatus: "00",
        })
    );

    assert(ipnJson?.RspCode === "04", `Expected amount mismatch code 04, got ${JSON.stringify(ipnJson)}`);

    const payment = await Payment.findByPk(checkout.payment_id);
    assert(payment, "Không tìm thấy payment amount mismatch");
    assert(payment.status === "failed", `Amount mismatch phải failed, got ${payment.status}`);
    assert(payment.failure_reason === "amount_mismatch", `Failure reason sai: ${payment.failure_reason}`);
    assert(!payment.subscription_id, "Amount mismatch không được tạo subscription");

    const subscriptionCount = await Subscription.count({ where: { user_id: user.userId } });
    assert(subscriptionCount === 0, `Amount mismatch tạo subscription ngoài ý muốn: ${subscriptionCount}`);

    return {
        email: user.email,
        payment_id: checkout.payment_id,
        status: payment.status,
        failure_reason: payment.failure_reason,
        rsp_code: ipnJson.RspCode,
    };
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
        const plan = await getFirstPlan(baseUrl);

        console.log(`Using base URL: ${baseUrl}`);
        console.log(`Using plan: ${plan.code || plan.id}`);

        const failed = await testPaymentFailed(baseUrl, plan);
        console.log("payment fail case passed", failed);

        const cancelled = await testPaymentCancelled(baseUrl, plan);
        console.log("payment cancel case passed", cancelled);

        const duplicate = await testDuplicateIpn(baseUrl, plan);
        console.log("duplicate IPN case passed", duplicate);

        const repurchase = await testRepurchaseExtendsSubscription(baseUrl, plan);
        console.log("repurchase extends subscription case passed", repurchase);

        const invalidSignature = await testInvalidSignature(baseUrl, plan);
        console.log("invalid signature case passed", invalidSignature);

        const amountMismatch = await testAmountMismatch(baseUrl, plan);
        console.log("amount mismatch case passed", amountMismatch);

        console.log("VNPay edge tests passed.");
    } finally {
        await new Promise((resolve) => server.close(resolve));
        await sequelize.close();
    }
}

main().catch((err) => {
    console.error("VNPay edge tests failed:", err.message);
    process.exitCode = 1;
});
