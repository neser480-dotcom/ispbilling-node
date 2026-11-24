"use strict";

const express = require("express");
const db = require("../../config/database");
const { requireAuth } = require("../../middleware/auth");
const { requirePermission, isSuperAdmin } = require("../../middleware/permission");
const sms = require("../../services/sms/sms.service");

const router = express.Router();

const EVENTS = [
    "bill_confirmation", "connection_fee", "alert", "calendar_alert", "new_customer",
    "expired_customer", "salary", "reseller_recharge", "customer_ticket", "customer_notify",
    "assign_ticket", "manual_active_inactive",
];

const companyId = (req) => Number(req.session?.company_id || req.session?.companyId || 0);

/* every route: logged in + 'sms_board' permission + a company */
router.use(requireAuth, requirePermission("sms_board"), (req, res, next) => {
    if (!companyId(req) && !isSuperAdmin(req)) {
        return res.status(400).json({ success: false, status: false, message: "Company পাওয়া যায়নি।" });
    }
    next();
});

const wrap = (fn) => (req, res) =>
    fn(req, res).catch((e) => {
        console.error("[message]", e.message);
        res.status(400).json({ success: false, status: false, message: e.message });
    });

router.get("/balance", wrap(async (req, res) => res.json({ success: true, data: await sms.getBalance(companyId(req)) })));

router.get("/areas", wrap(async (req, res) => res.json({ success: true, data: await sms.listAreas(companyId(req)) })));

router.post("/bulk/preview", wrap(async (req, res) =>
    res.json({ success: true, data: await sms.previewBulk(companyId(req), req.body || {}) })));

router.post("/bulk/send", wrap(async (req, res) =>
    res.json({ success: true, data: await sms.sendBulk(companyId(req), req.body || {}) })));

/* ---------- templates ---------- */
router.get("/templates", wrap(async (req, res) => {
    const [rows] = await db.query("SELECT * FROM sms_templates WHERE company_id = ?", [companyId(req)]);
    const map = Object.fromEntries(rows.map((r) => [r.event_key, r]));
    res.json({
        success: true,
        data: EVENTS.map((k) => map[k] || { event_key: k, enabled: 1, message_type: "text", send_type: "non_masking", title: "", body: "" }),
    });
}));

router.put("/templates/:event", wrap(async (req, res) => {
    const key = req.params.event;
    if (!EVENTS.includes(key)) throw new Error("Unknown template");
    const b = req.body || {};
    const mt = b.message_type === "voice" ? "voice" : "text";
    const st = ["non_masking", "masking", "fixed"].includes(b.send_type) ? b.send_type : "non_masking";
    await db.query(
        `INSERT INTO sms_templates (company_id, event_key, enabled, message_type, send_type, title, body)
         VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE enabled=VALUES(enabled), message_type=VALUES(message_type),
           send_type=VALUES(send_type), title=VALUES(title), body=VALUES(body)`,
        [companyId(req), key, b.enabled ? 1 : 0, mt, st, String(b.title || "").slice(0, 120), String(b.body || "").slice(0, 2000)]
    );
    res.json({ success: true });
}));

/* ---------- log ---------- */
router.get("/log", wrap(async (req, res) => {
    const q = req.query;
    const channel = sms.CHANNELS.includes(q.channel) ? q.channel : "non_masking";
    const where = ["company_id = ?", "channel = ?"];
    const args = [companyId(req), channel];
    if (q.kind) { where.push("kind = ?"); args.push(String(q.kind)); }
    if (["sent", "failed", "pending"].includes(q.status)) { where.push("status = ?"); args.push(q.status); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.from || "")) { where.push("created_at >= ?"); args.push(q.from); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.to || "")) { where.push("created_at < DATE_ADD(?, INTERVAL 1 DAY)"); args.push(q.to); }
    if (q.q) { where.push("(mobile LIKE ? OR message LIKE ?)"); args.push(`%${q.q}%`, `%${q.q}%`); }
    const w = where.join(" AND ");
    const size = Math.min(Math.max(Number(q.size) || 50, 1), 200);
    const page = Math.max(Number(q.page) || 1, 1);
    const [[t]] = await db.query(`SELECT COUNT(*) AS total, COALESCE(SUM(sms_count),0) AS cnt FROM sms_message_log WHERE ${w}`, args);
    const [rows] = await db.query(`SELECT * FROM sms_message_log WHERE ${w} ORDER BY id DESC LIMIT ? OFFSET ?`, [...args, size, (page - 1) * size]);
    res.json({ success: true, total: t.total, count: Number(t.cnt), size, rows });
}));

/* ---------- purchase ---------- */
router.get("/purchase/price", wrap(async (req, res) =>
    res.json({ success: true, amount: await sms.price(req.query.type, Number(req.query.count) || 0) })));

router.post("/purchase", wrap(async (req, res) =>
    res.json({ success: true, data: await sms.createPurchase(companyId(req), String(req.body?.type), Number(req.body?.count)) })));

/* Only super admin (or your verified payment callback calling the service) may credit SMS */
router.post("/purchase/:id/confirm", wrap(async (req, res) => {
    if (!isSuperAdmin(req)) throw new Error("অনুমতি নেই");
    res.json({ success: true, data: await sms.confirmPurchase(Number(req.params.id), String(req.body?.payment_ref || "") || null) });
}));

module.exports = router;
