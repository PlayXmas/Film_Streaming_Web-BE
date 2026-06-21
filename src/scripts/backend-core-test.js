import jwt from "jsonwebtoken";
import app from "../app.js";
import { MediaJob, MediaOrigin, User, sequelize } from "../models/index.js";

const results = [];

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function readBody(response) {
    const text = await response.text();
    try {
        return text ? JSON.parse(text) : {};
    } catch {
        return text;
    }
}

async function request(baseUrl, path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, options);
    return { status: response.status, body: await readBody(response) };
}

async function runCase(id, description, test) {
    try {
        const detail = await test();
        results.push({ id, description, status: "PASS", detail });
        console.log(`[PASS] ${id} - ${description}: ${detail}`);
    } catch (error) {
        results.push({ id, description, status: "FAIL", detail: error.message });
        console.error(`[FAIL] ${id} - ${description}: ${error.message}`);
    }
}

async function main() {
    const server = app.listen(0);
    let testUserId = null;

    try {
        await new Promise((resolve, reject) => {
            server.once("listening", resolve);
            server.once("error", reject);
        });

        const { port } = server.address();
        const baseUrl = `http://127.0.0.1:${port}/api`;
        const email = `backend.core.${Date.now()}@example.com`;
        const password = "Password123!";
        let freeToken;
        let adminToken;

        await runCase("AUTH-01", "Đăng ký bằng dữ liệu hợp lệ", async () => {
            const result = await request(baseUrl, "/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email,
                    password,
                    display_name: "Backend Core Test",
                    gender: "unspecified",
                }),
            });
            assert(result.status === 201, `mong đợi 201, nhận ${result.status}`);
            assert(result.body?.data?.token, "response không có token");
            testUserId = result.body?.data?.user?.id;
            freeToken = result.body.data.token;
            return `HTTP ${result.status}, user_id=${testUserId}`;
        });

        await runCase("AUTH-02", "Đăng ký thiếu trường bắt buộc", async () => {
            const result = await request(baseUrl, "/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            assert(result.status === 400, `mong đợi 400, nhận ${result.status}`);
            return `HTTP ${result.status}`;
        });

        await runCase("AUTH-03", "Từ chối mật khẩu 7 ký tự", async () => {
            const result = await request(baseUrl, "/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: `short.${Date.now()}@example.com`,
                    password: "1234567",
                    display_name: "Short Password",
                }),
            });
            assert(result.status === 400, `mong đợi 400, nhận ${result.status}`);
            return `HTTP ${result.status}`;
        });

        await runCase("AUTH-04", "Từ chối email đã đăng ký", async () => {
            const result = await request(baseUrl, "/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password, display_name: "Duplicate" }),
            });
            assert(result.status === 400, `mong đợi 400, nhận ${result.status}`);
            return `HTTP ${result.status}`;
        });

        await runCase("AUTH-06", "Từ chối mật khẩu đăng nhập sai", async () => {
            const result = await request(baseUrl, "/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password: "WrongPassword!" }),
            });
            assert(result.status === 401, `mong đợi 401, nhận ${result.status}`);
            return `HTTP ${result.status}`;
        });

        await runCase("AUTH-05-API", "Đăng nhập đúng trả token", async () => {
            const result = await request(baseUrl, "/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            assert(result.status === 200, `mong đợi 200, nhận ${result.status}`);
            assert(result.body?.data?.token, "response không có token");
            return `HTTP ${result.status}, có token`;
        });

        await runCase("AUTH-07", "Từ chối đăng nhập tài khoản bị khóa", async () => {
            await User.update({ is_active: false }, { where: { id: testUserId } });
            const result = await request(baseUrl, "/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            await User.update({ is_active: true }, { where: { id: testUserId } });
            assert(result.status === 403, `mong đợi 403, nhận ${result.status}`);
            return `HTTP ${result.status}`;
        });

        await runCase("AUTH-08", "Từ chối token hết hạn", async () => {
            const expiredToken = jwt.sign(
                { id: testUserId, email, role: "free" },
                process.env.JWT_SECRET,
                { expiresIn: -1 }
            );
            const result = await request(baseUrl, "/users/me", {
                headers: { Authorization: `Bearer ${expiredToken}` },
            });
            assert(result.status === 401, `mong đợi 401, nhận ${result.status}`);
            return `HTTP ${result.status}`;
        });

        await runCase("PAY-02", "Từ chối planId không hợp lệ", async () => {
            const result = await request(baseUrl, "/users/subscription/vnpay/create", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${freeToken}`,
                },
                body: JSON.stringify({ planId: 0 }),
            });
            assert(result.status === 400, `mong đợi 400, nhận ${result.status}`);
            return `HTTP ${result.status}`;
        });

        await runCase("PAY-03", "Từ chối gói không tồn tại", async () => {
            const result = await request(baseUrl, "/users/subscription/vnpay/create", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${freeToken}`,
                },
                body: JSON.stringify({ planId: 999999999 }),
            });
            assert(result.status === 404, `mong đợi 404, nhận ${result.status}`);
            return `HTTP ${result.status}`;
        });

        await runCase("MED-04", "Từ chối user thường gọi API upload", async () => {
            const result = await request(baseUrl, "/admin/titles/17/media-upload", {
                method: "POST",
                headers: { Authorization: `Bearer ${freeToken}` },
            });
            assert(result.status === 403, `mong đợi 403, nhận ${result.status}`);
            return `HTTP ${result.status}`;
        });

        await User.update({ role: "admin" }, { where: { id: testUserId } });
        const adminLogin = await request(baseUrl, "/auth/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        adminToken = adminLogin.body?.data?.token;

        await runCase("MED-02", "Từ chối upload thiếu field video", async () => {
            assert(adminLogin.status === 200 && adminToken, "không tạo được token admin kiểm thử");
            const form = new FormData();
            form.set("purpose", "content");
            const result = await request(baseUrl, "/admin/titles/17/media-upload", {
                method: "POST",
                headers: { Authorization: `Bearer ${adminToken}` },
                body: form,
            });
            assert(result.status === 400, `mong đợi 400, nhận ${result.status}`);
            return `HTTP ${result.status}`;
        });

        await runCase("MED-03", "Từ chối upload file không phải video bằng HTTP 400", async () => {
            const form = new FormData();
            form.set("purpose", "content");
            form.set("video", new Blob(["not a video"], { type: "text/plain" }), "invalid.txt");
            const result = await request(baseUrl, "/admin/titles/17/media-upload", {
                method: "POST",
                headers: { Authorization: `Bearer ${adminToken}` },
                body: form,
            });
            assert(result.status === 400, `mong đợi 400, nhận ${result.status}`);
            return `HTTP ${result.status}`;
        });

        await runCase("MED-09", "Từ chối truy cập HLS không có token", async () => {
            const result = await request(baseUrl, "/media/origins/46/hls/master.m3u8");
            assert(result.status === 401, `mong đợi 401, nhận ${result.status}`);
            return `HTTP ${result.status}`;
        });

        await User.update({ role: "free" }, { where: { id: testUserId } });
        const freeLogin = await request(baseUrl, "/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        freeToken = freeLogin.body?.data?.token;

        await runCase("MED-08-API", "Free user lấy trailer phim VIP và master HLS", async () => {
            assert(freeLogin.status === 200 && freeToken, "không tạo được token free kiểm thử");
            const play = await request(baseUrl, "/titles/17/play?purpose=trailer", {
                headers: { Authorization: `Bearer ${freeToken}` },
            });
            assert(play.status === 200, `play mong đợi 200, nhận ${play.status}`);
            const hlsPath = play.body?.data?.url;
            assert(hlsPath, "play response không có URL HLS");
            const master = await request(baseUrl, hlsPath.replace(/^\/api/, ""), {
                headers: { Authorization: `Bearer ${freeToken}` },
            });
            assert(master.status === 200, `master HLS mong đợi 200, nhận ${master.status}`);
            return `play HTTP ${play.status}, master HTTP ${master.status}`;
        });

        await runCase("MED-05-DATA", "Job 2 và origin 46 đã xử lý thành công", async () => {
            const [job, origin] = await Promise.all([
                MediaJob.findByPk(2),
                MediaOrigin.findByPk(46),
            ]);
            assert(job, "không tìm thấy job 2");
            assert(origin, "không tìm thấy origin 46");
            assert(job.status === "completed", `job status=${job.status}`);
            assert(origin.processing_status === "ready", `origin status=${origin.processing_status}`);
            return `job=${job.status}, origin=${origin.processing_status}`;
        });

        await User.update({ role: "free", is_active: true }, { where: { id: testUserId } });

        const passed = results.filter((item) => item.status === "PASS").length;
        const failed = results.length - passed;
        console.log(`\nBackend core summary: total=${results.length}, passed=${passed}, failed=${failed}`);
        if (failed > 0) process.exitCode = 1;
    } finally {
        if (testUserId) {
            await User.update({ role: "free", is_active: true }, { where: { id: testUserId } });
        }
        await new Promise((resolve) => server.close(resolve));
        await sequelize.close();
    }
}

main().catch((error) => {
    console.error("Backend core tests could not complete:", error);
    process.exitCode = 1;
});
