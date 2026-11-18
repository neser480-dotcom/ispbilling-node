"use strict";
/*
| routes/mobile/auth.js   (mount: /api/mobile/auth)
| Admin:    POST /admin/login | /admin/refresh | /admin/logout   GET /admin/me | /admin/permissions
| Customer: POST /customer/login | /customer/refresh | /customer/logout
| CSRF লাগে না: Cookie/Session ব্যবহার হয় না, Bearer Token ব্যবহার হয়।
*/
const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../../config/database");
const tokens = require("../../services/mobile/token.service");
const { requireBearer, ADMIN_ROLES } = require("../../middleware/mobileAuth");
const security = require("../../middleware/security");

const router = express.Router();
const loginLimiter = security.authLimiter({ max: 30 });

const MAX_FAILS = 5;
const LOCK_SECONDS = 300;
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 10);

const clientIp = (req) => req.ip || req.socket?.remoteAddress || null;
const bad = (res, status, message, code = "BAD_REQUEST") =>
    res.status(status).json({ success: false, code, message });

/* ---------- lockout (বিদ্যমান login_attempts টেবিল, আলাদা key prefix `m:`) ---------- */
async function lockRemaining(key) {
    const [r] = await db.execute(
        `SELECT GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), locked_until)) AS remaining
         FROM login_attempts WHERE username = ? LIMIT 1`, [key]);
    return r.length ? Number(r[0].remaining || 0) : 0;
}
async function recordFail(key, ip) {
    await db.execute(
        `INSERT INTO login_attempts (username, failed_attempts, first_failed_at, last_ip)
         VALUES (?, 1, NOW(), ?)
         ON DUPLICATE KEY UPDATE
           failed_attempts = IF(locked_until IS NOT NULL AND locked_until <= NOW(), 1, failed_attempts + 1),
           locked_until    = IF(locked_until IS NOT NULL AND locked_until <= NOW(), NULL, locked_until),
           last_ip = VALUES(last_ip)`, [key, ip]);
    const [r] = await db.execute("SELECT failed_attempts FROM login_attempts WHERE username = ?", [key]);
    if (r.length && Number(r[0].failed_attempts) >= MAX_FAILS) {
        await db.execute(
            "UPDATE login_attempts SET locked_until = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE username = ?",
            [LOCK_SECONDS, key]);
    }
}
const clearFails = (key) => db.execute("DELETE FROM login_attempts WHERE username = ?", [key]);

function tooMany(res, secs) {
    return bad(res, 429, `অনেকবার ভুল চেষ্টা। ${secs} সেকেন্ড পরে আবার চেষ্টা করুন।`, "TOO_MANY_ATTEMPTS");
}

/* =========================== ADMIN =========================== */
router.post("/admin/login", loginLimiter, async (req, res, next) => {
    try {
        const username = String(req.body?.username || "").trim().toLowerCase();
        const password = String(req.body?.password || "");
        if (!username || !password || username.length > 50 || password.length > 200) {
            return bad(res, 400, "Username ও Password দিন।");
        }
        const key = `m:a:${username}`.slice(0, 100);
        const wait = await lockRemaining(key);
        if (wait > 0) return tooMany(res, wait);

        const [rows] = await db.execute(
            `SELECT id, company_id, username, fullname, password, role, status
             FROM users WHERE LOWER(username) = ? LIMIT 1`, [username]);
        const u = rows[0];
        const ok = await bcrypt.compare(password, u ? String(u.password) : DUMMY_HASH);
        if (!u || !ok) {
            await recordFail(key, clientIp(req));
            return bad(res, 401, "Username বা Password সঠিক নয়।", "INVALID_CREDENTIALS");
        }
        if (u.status !== "active") return bad(res, 403, "আপনার অ্যাকাউন্ট সক্রিয় নয়।", "ACCOUNT_INACTIVE");
        if (!ADMIN_ROLES.includes(u.role)) return bad(res, 403, "এই Role-এ লগইন অনুমোদিত নয়।", "ROLE_NOT_ALLOWED");
        if (u.role !== "super_admin" && Number(u.company_id) <= 0) {
            return bad(res, 403, "অ্যাকাউন্টে বৈধ Company নেই।", "NO_COMPANY");
        }

        await clearFails(key);
        await db.execute("UPDATE users SET last_login = NOW() WHERE id = ?", [u.id]);
        const t = await tokens.startSession({
            subjectType: "user", subjectId: u.id, companyId: Number(u.company_id),
            role: u.role, deviceName: req.body?.device_name, ip: clientIp(req)
        });
        return res.json({
            success: true, ...t,
            user: { id: u.id, username: u.username, name: u.fullname, role: u.role, company_id: Number(u.company_id) }
        });
    } catch (e) { next(e); }
});

router.post("/admin/refresh", async (req, res, next) => {
    try {
        const out = await tokens.rotateRefresh(req.body?.refresh_token, {
            ip: clientIp(req), deviceName: req.body?.device_name });
        if (!out || out.reuse || out.row.subject_type !== "user") {
            return bad(res, 401, "আবার লগইন করুন।", "UNAUTHORIZED");
        }
        const [rows] = await db.execute(
            "SELECT id, company_id, role, status FROM users WHERE id = ? LIMIT 1", [out.row.subject_id]);
        const u = rows[0];
        if (!u || u.status !== "active" || !ADMIN_ROLES.includes(u.role)
            || Number(u.company_id) !== Number(out.row.company_id)) {
            await tokens.revokeFamily(out.rt.familyId);
            return bad(res, 401, "আবার লগইন করুন।", "UNAUTHORIZED");
        }
        return res.json({ success: true, ...tokens.buildTokens("user", u.id, Number(u.company_id), u.role, out.rt) });
    } catch (e) { next(e); }
});

router.post("/admin/logout", async (req, res, next) => {
    try { await tokens.revokeFamilyByRaw(req.body?.refresh_token); res.json({ success: true }); }
    catch (e) { next(e); }
});

router.get("/admin/me", requireBearer("admin"), async (req, res, next) => {
    try {
        const [rows] = await db.execute(
            `SELECT id, company_id, username, fullname, email, mobile, role, status, company_name
             FROM users WHERE id = ? LIMIT 1`, [req.auth.userId]);
        res.json({ success: true, user: rows[0] });
    } catch (e) { next(e); }
});

router.get("/admin/permissions", requireBearer("admin"), async (req, res, next) => {
    try {
        let permissions = [];
        if (!req.auth.hasFullAccess) {
            const [rows] = await db.execute(
                `SELECT permission_key FROM user_permissions
                 WHERE user_id = ? AND company_id = ? AND allowed = 1`,
                [req.auth.userId, req.auth.companyId]);
            permissions = rows.map((r) => r.permission_key);
        }
        res.json({ success: true, role: req.auth.role, full_access: req.auth.hasFullAccess, permissions });
    } catch (e) { next(e); }
});

/* =========================== CUSTOMER =========================== */
router.post("/customer/login", loginLimiter, async (req, res, next) => {
    try {
        const ispCode = String(req.body?.isp_code || "").trim().toUpperCase();
        const customerId = String(req.body?.customer_id || "").trim();
        const password = String(req.body?.password || "");
        if (!ispCode || !customerId || !password
            || ispCode.length > 30 || customerId.length > 50 || password.length > 200) {
            return bad(res, 400, "ISP Code, Customer ID ও Password দিন।");
        }
        const key = `m:c:${ispCode}:${customerId}`.slice(0, 100);
        const wait = await lockRemaining(key);
        if (wait > 0) return tooMany(res, wait);

        const generic = () => bad(res, 401, "তথ্য সঠিক নয়।", "INVALID_CREDENTIALS");

        const [isp] = await db.execute(
            `SELECT company_id FROM users
             WHERE customer_id = ? AND role = 'admin' AND status = 'active' LIMIT 1`, [ispCode]);
        let acct = null;
        if (isp.length && Number(isp[0].company_id) > 0) {
            const [rows] = await db.execute(
                `SELECT c.id, c.company_id, c.customer_id, c.name,
                        a.password_hash, a.status AS acct_status, a.must_change_password
                 FROM customers c
                 JOIN customer_mobile_accounts a
                   ON a.customer_pk = c.id AND a.company_id = c.company_id
                 WHERE c.company_id = ? AND c.customer_id = ? AND c.deleted_at IS NULL LIMIT 1`,
                [Number(isp[0].company_id), customerId]);
            acct = rows[0] || null;
        }
        const ok = await bcrypt.compare(password, acct ? String(acct.password_hash) : DUMMY_HASH);
        if (!acct || !ok || acct.acct_status !== "active") {
            await recordFail(key, clientIp(req));
            return generic();
        }

        await clearFails(key);
        await db.execute(
            "UPDATE customer_mobile_accounts SET last_login = NOW() WHERE customer_pk = ? AND company_id = ?",
            [acct.id, acct.company_id]);
        const t = await tokens.startSession({
            subjectType: "customer", subjectId: acct.id, companyId: Number(acct.company_id),
            role: null, deviceName: req.body?.device_name, ip: clientIp(req)
        });
        return res.json({
            success: true, ...t,
            must_change_password: Number(acct.must_change_password) === 1,
            user: { id: acct.customer_id, name: acct.name }
        });
    } catch (e) { next(e); }
});

router.post("/customer/refresh", async (req, res, next) => {
    try {
        const out = await tokens.rotateRefresh(req.body?.refresh_token, {
            ip: clientIp(req), deviceName: req.body?.device_name });
        if (!out || out.reuse || out.row.subject_type !== "customer") {
            return bad(res, 401, "আবার লগইন করুন।", "UNAUTHORIZED");
        }
        const [rows] = await db.execute(
            `SELECT c.id, c.company_id, a.status AS acct_status
             FROM customers c JOIN customer_mobile_accounts a
               ON a.customer_pk = c.id AND a.company_id = c.company_id
             WHERE c.id = ? AND c.company_id = ? AND c.deleted_at IS NULL LIMIT 1`,
            [out.row.subject_id, out.row.company_id]);
        if (!rows.length || rows[0].acct_status !== "active") {
            await tokens.revokeFamily(out.rt.familyId);
            return bad(res, 401, "আবার লগইন করুন।", "UNAUTHORIZED");
        }
        return res.json({ success: true,
            ...tokens.buildTokens("customer", rows[0].id, Number(rows[0].company_id), null, out.rt) });
    } catch (e) { next(e); }
});

router.post("/customer/logout", async (req, res, next) => {
    try { await tokens.revokeFamilyByRaw(req.body?.refresh_token); res.json({ success: true }); }
    catch (e) { next(e); }
});

module.exports = router;
