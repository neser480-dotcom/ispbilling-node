"use strict";
/*
| routes/mobile/admin.js   (mount: /api/mobile/admin)
| Phase 1: Customer-à¦à¦° Mobile à¦…à§à¦¯à¦¾à¦•à¦¾à¦‰à¦¨à§à¦Ÿ à¦¤à§ˆà¦°à¦¿/à¦°à¦¿à¦¸à§‡à¦Ÿ (ISP Admin/Staff Web UI à¦›à¦¾à¦¡à¦¼à¦¾à¦‡)à¥¤
| Dashboard/Area/Package à¦‡à¦¤à§à¦¯à¦¾à¦¦à¦¿ Admin API Phase 2 (à¦¬à¦¿à¦¦à§à¦¯à¦®à¦¾à¦¨ Service à¦ªà§à¦¨à¦ƒà¦¬à§à¦¯à¦¬à¦¹à¦¾à¦° à¦•à¦°à§‡)à¥¤
*/
const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const db = require("../../config/database");
const tokens = require("../../services/mobile/token.service");
const { requireBearer, requireMobilePermission, scopeCompanyId } = require("../../middleware/mobileAuth");
const { requireMobileSoftwareBilling, billingStatus } = require("../../middleware/mobileSoftwareBilling");
const { invokeRouter } = require("../../services/mobile/webBridge");
const { MEDIUMS, MEDIUM_DB_NAME, mapDashboard, emptySummary, daysIn, n } = require("../../services/mobile/adminMap");

/* à¦¬à¦¿à¦¦à§à¦¯à¦®à¦¾à¦¨ Web Router (cached module; Web à¦«à¦¾à¦‡à¦² à¦…à¦ªà¦°à¦¿à¦¬à¦°à§à¦¤à¦¿à¦¤) */
const dashboardRouter = require("../dashboard/dashboard.route");
const areaRouter = require("../area/area");

const router = express.Router();
router.use(requireBearer("admin"));

/* Software Billing: à¦…à¦¬à¦¸à§à¦¥à¦¾ à¦¦à§‡à¦–à¦¾ à¦—à§‡à¦Ÿà§‡à¦° à¦¬à¦¾à¦‡à¦°à§‡ (à¦†à¦Ÿà¦•à§‡ à¦—à§‡à¦²à§‡à¦“ à¦…à§à¦¯à¦¾à¦ª à¦¬à¦¿à¦² à¦¦à§‡à¦–à¦¾à¦¤à§‡ à¦ªà¦¾à¦°à§‡); à¦¬à¦¾à¦•à¦¿ à¦¸à¦¬ Admin API à¦—à§‡à¦Ÿà§‡à¦° à¦­à§‡à¦¤à¦°à§‡ (Web-à¦à¦° à¦®à¦¤à§‹ à§ªà§¦à§¨) */
router.get("/billing-status", billingStatus);
router.use(requireMobileSoftwareBilling());

const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
function randomPassword(len = 10) {
    let out = "";
    for (let i = 0; i < len; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
    return out;
}

/* POST /api/mobile/admin/customers/:id/mobile-account   body: { password? }  (customers.id) */
router.post("/customers/:id/mobile-account", requireMobilePermission("customer_edit"), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, code: "BAD_REQUEST", message: "à¦­à§à¦² Customer IDà¥¤" });
        }
        const company = scopeCompanyId(req);               // super_admin à¦›à¦¾à¦¡à¦¼à¦¾ à¦¸à¦¬à¦¸à¦®à¦¯à¦¼ à¦¨à¦¿à¦œà§‡à¦° Company
        const [rows] = await db.execute(
            `SELECT id, company_id, customer_id FROM customers
             WHERE id = ? AND deleted_at IS NULL ${company ? "AND company_id = ?" : ""} LIMIT 1`,
            company ? [id, company] : [id]);
        if (!rows.length) {
            return res.status(404).json({ success: false, code: "NOT_FOUND", message: "Customer à¦ªà¦¾à¦“à¦¯à¦¼à¦¾ à¦¯à¦¾à¦¯à¦¼à¦¨à¦¿à¥¤" });
        }
        const c = rows[0];
        const given = String(req.body?.password || "");
        if (given && (given.length < 8 || given.length > 100)) {
            return res.status(400).json({ success: false, code: "WEAK_PASSWORD", message: "Password à§®â€“à§§à§¦à§¦ à¦…à¦•à§à¦·à¦°à§‡à¦° à¦¹à¦¤à§‡ à¦¹à¦¬à§‡à¥¤" });
        }
        const plain = given || randomPassword();
        const hash = await bcrypt.hash(plain, 10);
        await db.execute(
            `INSERT INTO customer_mobile_accounts (company_id, customer_pk, password_hash, must_change_password, status)
             VALUES (?, ?, ?, 1, 'active')
             ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash),
                                     must_change_password = 1, status = 'active'`,
            [c.company_id, c.id, hash]);
        await tokens.revokeAllForSubject("customer", c.id);   // à¦ªà§à¦°à¦¨à§‹ à¦¸à¦¬ Session à¦¬à¦¾à¦¤à¦¿à¦²
        res.json({ success: true, customer_id: c.customer_id,
            temporary_password: given ? undefined : plain });  // à¦¶à§à¦§à§ à¦à¦•à¦¬à¦¾à¦° à¦¦à§‡à¦–à¦¾à¦¨à§‹ à¦¹à¦¯à¦¼
    } catch (e) { next(e); }
});

/* =========================== Phase 2 =========================== */

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : "");

function ym(req) {
    const now = new Date();
    let year = Number(req.query.year) || now.getFullYear();
    let month = Number(req.query.month) || now.getMonth() + 1;
    if (!Number.isInteger(year) || year < 2000 || year > 2100) year = now.getFullYear();
    if (!Number.isInteger(month) || month < 1 || month > 12) month = now.getMonth() + 1;
    return { year, month };
}
function medium(req) {
    const m = String(req.query.medium || "all").toLowerCase();
    return m === "all" || MEDIUM_DB_NAME[m] ? m : null;
}
const bad = (res, message) => res.status(400).json({ success: false, code: "BAD_REQUEST", message });

/* Payment Medium: customer-recharge.service.js-à¦à¦° PAYMENT_METHODS-à¦à¦° à¦¸à¦¾à¦¥à§‡ à¦®à¦¿à¦² */
router.get("/mediums", (req, res) => res.json(MEDIUMS));

/* Dashboard: Web-à¦à¦° /api/dashboard/data à¦¹à§à¦¬à¦¹à§ à¦ªà§à¦¨à¦ƒà¦¬à§à¦¯à¦¬à¦¹à¦¾à¦° (Permission-à¦­à¦¿à¦¤à§à¦¤à¦¿à¦• à¦•à¦¾à¦°à§à¦¡ Web-à¦à¦° à¦®à¦¤à§‹à¦‡) */
router.get("/dashboard", async (req, res, next) => {
    try {
        const { year, month } = ym(req);
        const med = medium(req);
        if (!med) return bad(res, "à¦­à§à¦² Payment Mediumà¥¤");

        const r = await invokeRouter(dashboardRouter, req, {
            url: "/data", query: { month: `${year}-${String(month).padStart(2, "0")}` } });
        if (r.status !== 200 || !r.body || r.body.success === false) {
            return res.status(r.status || 502).json(r.body || { success: false, message: "Dashboard à¦²à§‹à¦¡ à¦¹à¦¯à¦¼à¦¨à¦¿à¥¤" });
        }
        if (r.body.type === "super_admin") {
            return res.json({ ...emptySummary(), type: "super_admin", super_admin: r.body });
        }
        const summary = mapDashboard(r.body);
        if (med !== "all" && r.body.collection) {            // à¦¶à§à¦§à§ à¦¸à¦‚à¦—à§à¦°à¦¹/à¦¶à¦¤à¦¾à¦‚à¦¶ Medium à¦…à¦¨à§à¦¯à¦¾à¦¯à¦¼à§€ à¦«à¦¿à¦²à§à¦Ÿà¦¾à¦°
            const [rows] = await db.execute(
                `SELECT COALESCE(SUM(amount), 0) AS v FROM payments
                 WHERE company_id = ? AND MONTH(payment_date) = ? AND YEAR(payment_date) = ?
                   AND deleted_at IS NULL AND LOWER(payment_method) = LOWER(?)`,
                [req.auth.companyId, month, year, MEDIUM_DB_NAME[med]]);
            summary.collection = n(rows[0]?.v);
            summary.percent = summary.potential > 0
                ? Math.min(100, (summary.collection / summary.potential) * 100) : 0;
        }
        res.json(summary);
    } catch (e) { next(e); }
});

/* Chart: Web-à¦à¦° /chart (Permission à¦¸à¦¹) + Medium à¦¹à¦²à§‡ à¦à¦•à¦‡ à¦®à¦¾à¦¸à§‡à¦° Payment à¦«à¦¿à¦²à§à¦Ÿà¦¾à¦° */
router.get("/dashboard/chart", async (req, res, next) => {
    try {
        const { year, month } = ym(req);
        const med = medium(req);
        if (!med) return bad(res, "à¦­à§à¦² Payment Mediumà¥¤");
        const mode = req.query.mode === "count" ? "count" : "amount";

        const r = await invokeRouter(dashboardRouter, req, {
            url: "/chart", query: { year: String(year), month: String(month) } });
        if (r.status !== 200 || !r.body || r.body.success === false) {
            return res.status(r.status || 502).json(r.body || { success: false, message: "Chart à¦²à§‹à¦¡ à¦¹à¦¯à¦¼à¦¨à¦¿à¥¤" });
        }
        let values = mode === "count" ? r.body.bill : r.body.amount;
        if (med !== "all") {
            const [rows] = await db.execute(
                `SELECT DAY(payment_date) AS d, COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS bills
                 FROM payments WHERE company_id = ? AND deleted_at IS NULL
                   AND YEAR(payment_date) = ? AND MONTH(payment_date) = ? AND LOWER(payment_method) = LOWER(?)
                 GROUP BY DAY(payment_date)`,
                [req.auth.companyId, year, month, MEDIUM_DB_NAME[med]]);
            values = new Array(daysIn(year, month)).fill(0);
            for (const row of rows) {
                const i = Number(row.d) - 1;
                if (i >= 0 && i < values.length) values[i] = n(mode === "count" ? row.bills : row.amount);
            }
        }
        res.json({ success: true, values });
    } catch (e) { next(e); }
});

/* Collector à¦¤à¦¾à¦²à¦¿à¦•à¦¾ (à¦®à¦¾à¦¸à§‡à¦° à¦¸à¦‚à¦—à§à¦°à¦¹)à¥¤ Reseller-à¦à¦° à¦Ÿà§‡à¦¬à¦¿à¦² à¦¨à§‡à¦‡, à¦¤à¦¾à¦‡ à¦–à¦¾à¦²à¦¿à¥¤ */
router.get("/dashboard/people", requireMobilePermission("dashboard_collection_data"), async (req, res, next) => {
    try {
        const { year, month } = ym(req);
        if (req.query.type === "reseller" || req.auth.isSuperAdmin) return res.json({ balance: 0, items: [] });
        const [rows] = await db.execute(
            `SELECT u.id, u.fullname AS name, COALESCE(SUM(p.amount), 0) AS amount, COUNT(p.id) AS cnt
             FROM users u
             LEFT JOIN payments p ON p.created_by = u.id AND p.company_id = u.company_id
               AND p.deleted_at IS NULL AND MONTH(p.payment_date) = ? AND YEAR(p.payment_date) = ?
             WHERE u.company_id = ? AND u.role = 'collector'
             GROUP BY u.id, u.fullname ORDER BY amount DESC, u.fullname ASC`,
            [month, year, req.auth.companyId]);
        res.json({
            balance: rows.reduce((s, r) => s + n(r.amount), 0),
            items: rows.map((r) => ({ name: r.name || "", amount: n(r.amount), count: n(r.cnt) }))
        });
    } catch (e) { next(e); }
});

/* Area à¦¤à¦¾à¦²à¦¿à¦•à¦¾: à¦¨à¦¿à¦°à¦¾à¦ªà¦¦ read-only (Web-à¦à¦° /areas/data MikroTik sync à¦•à¦°à§‡ à¦ªà§à¦°à¦¨à§‹ Area à¦®à§à¦›à§‡ à¦«à§‡à¦²à§‡, à¦¤à¦¾à¦‡ à¦¸à§‡à¦Ÿà¦¿ à¦¡à¦¾à¦•à¦¾ à¦¹à¦¯à¦¼ à¦¨à¦¾) */
router.get("/areas", async (req, res, next) => {
    try {
        const company = scopeCompanyId(req);
        const [rows] = await db.execute(
            `SELECT a.id, a.name, a.remarks, a.mikrotik_id,
                    (SELECT COUNT(*) FROM sub_areas sa WHERE sa.area_id = a.id AND sa.company_id = a.company_id) AS subs
             FROM areas a ${company ? "WHERE a.company_id = ?" : ""} ORDER BY a.name ASC`,
            company ? [company] : []);
        res.json(rows.map((r) => ({
            id: r.id, name: r.name || "", description: r.remarks || "",
            subtitle: `${n(r.subs)} sub-area${r.mikrotik_id ? " Â· MikroTik" : ""}`
        })));
    } catch (e) { next(e); }
});

/* Area à¦¤à§ˆà¦°à¦¿/à¦¸à¦®à§à¦ªà¦¾à¦¦à¦¨à¦¾/à¦®à§‹à¦›à¦¾: Web-à¦à¦° /areas/action à¦¹à§à¦¬à¦¹à§ (area_management Permission, MikroTik Area à¦¸à§à¦°à¦•à§à¦·à¦¾ à¦¸à¦¹) */
async function areaAction(req, res, next, action, id) {
    try {
        const r = await invokeRouter(areaRouter, req, { method: "POST", url: "/action", body: {
            action, id, name: String(req.body?.name || "").trim(),
            remarks: String(req.body?.description || "").trim() } });
        res.status(r.status || 500).json(r.body || { success: false, message: "à¦¬à§à¦¯à¦°à§à¦¥ à¦¹à¦¯à¦¼à§‡à¦›à§‡à¥¤" });
    } catch (e) { next(e); }
}
const areaId = (req) => { const v = Number(req.params.id); return Number.isInteger(v) && v > 0 ? v : 0; };
router.post("/areas", (req, res, next) => areaAction(req, res, next, "add", 0));
router.put("/areas/:id", (req, res, next) =>
    areaId(req) ? areaAction(req, res, next, "update", areaId(req)) : bad(res, "à¦­à§à¦² Area IDà¥¤"));
router.delete("/areas/:id", (req, res, next) =>
    areaId(req) ? areaAction(req, res, next, "delete", areaId(req)) : bad(res, "à¦­à§à¦² Area IDà¥¤"));

/* Package: Area-à¦° MikroTik router-à¦à¦° Package (à¦¶à§à¦§à§ à¦ªà¦¡à¦¼à¦¾) */
router.get("/packages", async (req, res, next) => {
    try {
        const company = scopeCompanyId(req);
        const where = []; const params = [];
        if (company) { where.push("p.company_id = ?"); params.push(company); }
        if (req.query.area_id) {
            const aid = Number(req.query.area_id);
            if (!Number.isInteger(aid) || aid <= 0) return bad(res, "à¦­à§à¦² Area IDà¥¤");
            const [a] = await db.execute(
                `SELECT mikrotik_id FROM areas WHERE id = ? ${company ? "AND company_id = ?" : ""} LIMIT 1`,
                company ? [aid, company] : [aid]);
            if (!a.length || !a[0].mikrotik_id) return res.json({ count: 0, items: [] });
            where.push("p.router_id = ?"); params.push(a[0].mikrotik_id);
        }
        const [rows] = await db.execute(
            `SELECT p.id, COALESCE(NULLIF(p.alias_name, ''), p.package_name) AS name, p.price, p.created_at
             FROM mikrotik_packages p ${where.length ? "WHERE " + where.join(" AND ") : ""}
             ORDER BY p.price ASC, p.id ASC`, params);
        res.json({ count: rows.length, items: rows.map((r) => ({
            id: r.id, name: r.name, price: n(r.price), created_at: iso(r.created_at) })) });
    } catch (e) { next(e); }
});

/* Customer Ticket à¦“ Package-à¦ªà¦°à¦¿à¦¬à¦°à§à¦¤à¦¨à§‡à¦° à¦…à¦¨à§à¦°à§‹à¦§ (à¦¦à§‡à¦–à¦¾: customer_list, à¦¹à¦¾à¦²à¦¨à¦¾à¦—à¦¾à¦¦: customer_edit) */
router.get("/tickets", requireMobilePermission("customer_list"), async (req, res, next) => {
    try {
        const company = scopeCompanyId(req);
        const st = ["open", "in_progress", "resolved", "rejected"].includes(req.query.status) ? req.query.status : null;
        const where = []; const params = [];
        if (company) { where.push("t.company_id = ?"); params.push(company); }
        if (st) { where.push("t.status = ?"); params.push(st); }
        const [rows] = await db.execute(
            `SELECT t.id, t.type, t.subject, t.message, t.status, t.admin_note, t.requested_package_id, t.created_at,
                    c.customer_id AS customer_code, c.name AS customer_name, c.phone
             FROM customer_tickets t JOIN customers c ON c.id = t.customer_pk AND c.company_id = t.company_id
             ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY t.id DESC LIMIT 100`, params);
        res.json({ count: rows.length, items: rows.map((r) => ({ ...r, created_at: iso(r.created_at) })) });
    } catch (e) { next(e); }
});

router.put("/tickets/:id", requireMobilePermission("customer_edit"), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const status = String(req.body?.status || "");
        if (!Number.isInteger(id) || id <= 0 || !["open", "in_progress", "resolved", "rejected"].includes(status)) {
            return bad(res, "à¦­à§à¦² à¦…à¦¨à§à¦°à§‹à¦§à¥¤");
        }
        const company = scopeCompanyId(req);
        const note = String(req.body?.admin_note || "").trim().slice(0, 500) || null;
        const [r] = await db.execute(
            `UPDATE customer_tickets SET status = ?, admin_note = ? WHERE id = ? ${company ? "AND company_id = ?" : ""}`,
            company ? [status, note, id, company] : [status, note, id]);
        if (!r.affectedRows) return res.status(404).json({ success: false, code: "NOT_FOUND", message: "à¦ªà¦¾à¦“à¦¯à¦¼à¦¾ à¦¯à¦¾à¦¯à¦¼à¦¨à¦¿à¥¤" });
        res.json({ success: true });
    } catch (e) { next(e); }
});

/* Phase 3 */
router.use("/mikrotik", require("./adminMikrotik"));
router.use("/customers", require("./adminCustomers"));
router.use("/super", require("./adminSuper"));

module.exports = router;

