"use strict";
/*
| routes/mobile/customer.js   (mount: /api/mobile/customer)
| Customer শুধু নিজের তথ্য দেখে: customerPk ও companyId সবসময় Token/DB থেকে, কখনো client input থেকে নয়।
| pppoe_password, nid, mikrotik/OLT তথ্য কখনো ফেরত যায় না।
| বিদ্যমান Billing/Payment লজিক পরিবর্তন বা পুনর্নির্মাণ করা হয়নি — শুধু পড়া (read-only)।
*/
const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../../config/database");
const tokens = require("../../services/mobile/token.service");
const { requireBearer } = require("../../middleware/mobileAuth");

const router = express.Router();
router.use(requireBearer("customer"));

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : "");
const money = (v) => Number(v || 0);

async function loadCustomer(req) {
    const [rows] = await db.execute(
        `SELECT id, customer_id, name, phone, address, package_id, package_name, monthly_bill,
                balance, status, payment_status, promise_date, connection_date, billing_cycle,
                created_at, mikrotik_id
         FROM customers WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1`,
        [req.auth.customerPk, req.auth.companyId]);
    return rows[0] || null;
}

router.get("/profile", async (req, res, next) => {
    try {
        const c = await loadCustomer(req);
        if (!c) return res.status(404).json({ success: false, code: "NOT_FOUND", message: "পাওয়া যায়নি।" });
        res.json({
            id: c.customer_id, name: c.name, mobile: c.phone, package: c.package_name,
            monthly_fee: money(c.monthly_bill), balance: money(c.balance),
            status: c.status, payment_status: c.payment_status, address: c.address,
            billing_date: c.billing_cycle || "", promise_date: iso(c.promise_date),
            connection_date: iso(c.connection_date), create_date: iso(c.created_at), photo: ""
        });
    } catch (e) { next(e); }
});

router.get("/dashboard", async (req, res, next) => {
    try {
        const c = await loadCustomer(req);
        if (!c) return res.status(404).json({ success: false, code: "NOT_FOUND", message: "পাওয়া যায়নি।" });

        const [sr] = await db.execute(
            "SELECT company_name FROM settings WHERE company_id = ? LIMIT 1", [req.auth.companyId]);
        const s = sr[0] || {};
        const [pay] = await db.execute(
            `SELECT MAX(payment_date) AS last_date FROM payments
             WHERE customer_id = ? AND company_id = ? AND deleted_at IS NULL AND payment_cancelled_at IS NULL`,
            [c.id, req.auth.companyId]);
        const balance = money(c.balance);                    // + = advance, − = due (customer-recharge.service)
        res.json({
            isp_name: (s && s.company_name) || "", name: c.name,
            monthly_bill: money(c.monthly_bill), balance: balance > 0 ? balance : 0,
            due: balance < 0 ? -balance : 0, status: c.status,
            last_payment_date: iso(pay[0]?.last_date),
            deadline_day: c.promise_date ? new Date(c.promise_date).getDate() : 0,
            stats: {}      // Live uptime/speed MikroTik থেকে আসে; Phase 2-তে নিরাপদ backend service দিয়ে
        });
    } catch (e) { next(e); }
});

router.get("/reports", async (req, res, next) => {
    try {
        const [rows] = await db.execute(
            `SELECT amount, billing_month, billing_year, payment_date
             FROM payments
             WHERE customer_id = ? AND company_id = ? AND deleted_at IS NULL AND payment_cancelled_at IS NULL
             ORDER BY payment_date DESC, id DESC LIMIT 36`,
            [req.auth.customerPk, req.auth.companyId]);
        res.json(rows.map((r) => ({
            month: r.billing_year && r.billing_month
                ? `${r.billing_year}-${String(r.billing_month).padStart(2, "0")}` : iso(r.payment_date),
            amount: money(r.amount), status: "PAID"
        })));
    } catch (e) { next(e); }
});

router.get("/packages", async (req, res, next) => {
    try {
        const c = await loadCustomer(req);
        if (!c) return res.json([]);
        const [rows] = await db.execute(
            `SELECT id, COALESCE(NULLIF(alias_name, ''), package_name) AS name, price
             FROM mikrotik_packages WHERE company_id = ? AND router_id = ? ORDER BY price ASC`,
            [req.auth.companyId, c.mikrotik_id || 0]);
        res.json(rows.map((r) => ({ id: r.id, name: r.name, price: money(r.price),
            active: Number(r.id) === Number(c.package_id) })));
    } catch (e) { next(e); }
});

router.post("/change-password", async (req, res, next) => {
    try {
        const oldP = String(req.body?.old_password || "");
        const newP = String(req.body?.new_password || "");
        if (newP.length < 8 || newP.length > 100) {
            return res.status(400).json({ success: false, code: "WEAK_PASSWORD", message: "নতুন Password কমপক্ষে ৮ অক্ষরের হতে হবে।" });
        }
        const [rows] = await db.execute(
            "SELECT password_hash FROM customer_mobile_accounts WHERE customer_pk = ? AND company_id = ? LIMIT 1",
            [req.auth.customerPk, req.auth.companyId]);
        if (!rows.length || !(await bcrypt.compare(oldP, String(rows[0].password_hash)))) {
            return res.status(400).json({ success: false, code: "WRONG_PASSWORD", message: "পুরনো Password সঠিক নয়।" });
        }
        await db.execute(
            `UPDATE customer_mobile_accounts SET password_hash = ?, must_change_password = 0
             WHERE customer_pk = ? AND company_id = ?`,
            [await bcrypt.hash(newP, 10), req.auth.customerPk, req.auth.companyId]);
        await tokens.revokeAllForSubject("customer", req.auth.customerPk, req.auth.familyId); // অন্য ডিভাইস লগআউট
        res.json({ success: true });
    } catch (e) { next(e); }
});

/*
| Phase 2: Support Number, Ticket ও Package-পরিবর্তনের *অনুরোধ*।
| Package সরাসরি বদলানো হয় না (Billing/MikroTik লজিক জড়িত); ISP অনুমোদন দিয়ে Web থেকে বদলাবে।
*/
const clean = (v, max) => String(v || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);

router.get("/support-numbers", async (req, res, next) => {
    try {
        const [s] = await db.execute(
            "SELECT company_name, company_phone, phone FROM settings WHERE company_id = ? LIMIT 1", [req.auth.companyId]);
        const [u] = await db.execute(
            "SELECT company_name, mobile FROM users WHERE company_id = ? AND role = 'admin' ORDER BY id ASC LIMIT 1",
            [req.auth.companyId]);
        const phone = (s[0] && (s[0].company_phone || s[0].phone)) || (u[0] && u[0].mobile) || "";
        const name = (s[0] && s[0].company_name) || (u[0] && u[0].company_name) || "Support";
        res.json(phone ? [{ name, phone, start_time: "", end_time: "", photo: "" }] : []);
    } catch (e) { next(e); }
});

router.get("/tickets", async (req, res, next) => {
    try {
        const [rows] = await db.execute(
            `SELECT id, type, subject, status, created_at FROM customer_tickets
             WHERE customer_pk = ? AND company_id = ? ORDER BY id DESC LIMIT 50`,
            [req.auth.customerPk, req.auth.companyId]);
        res.json(rows.map((r) => ({
            id: r.id, subject: r.type === "package_change" ? `[Package] ${r.subject}` : r.subject,
            status: r.status, date: iso(r.created_at) })));
    } catch (e) { next(e); }
});

router.post("/tickets", async (req, res, next) => {
    try {
        const subject = clean(req.body?.subject, 150);
        const message = clean(req.body?.message, 2000);
        if (!subject) {
            return res.status(400).json({ success: false, code: "BAD_REQUEST", message: "বিষয় লিখুন।" });
        }
        const [open] = await db.execute(
            `SELECT COUNT(*) AS c FROM customer_tickets
             WHERE customer_pk = ? AND company_id = ? AND status IN ('open','in_progress')`,
            [req.auth.customerPk, req.auth.companyId]);
        if (Number(open[0].c) >= 5) {
            return res.status(429).json({ success: false, code: "TOO_MANY_OPEN",
                message: "আগের টিকেটগুলো নিষ্পত্তি না হওয়া পর্যন্ত নতুন টিকেট খোলা যাবে না।" });
        }
        await db.execute(
            `INSERT INTO customer_tickets (company_id, customer_pk, type, subject, message)
             VALUES (?, ?, 'ticket', ?, ?)`,
            [req.auth.companyId, req.auth.customerPk, subject, message]);
        res.json({ success: true });
    } catch (e) { next(e); }
});

router.post("/packages/change", async (req, res, next) => {
    try {
        const pid = Number(req.body?.package_id);
        if (!Number.isInteger(pid) || pid <= 0) {
            return res.status(400).json({ success: false, code: "BAD_REQUEST", message: "ভুল Package।" });
        }
        const c = await loadCustomer(req);
        if (!c) return res.status(404).json({ success: false, code: "NOT_FOUND", message: "পাওয়া যায়নি।" });
        if (Number(c.package_id) === pid) {
            return res.status(400).json({ success: false, code: "SAME_PACKAGE", message: "এটি আপনার বর্তমান Package।" });
        }
        const [p] = await db.execute(
            `SELECT id, COALESCE(NULLIF(alias_name, ''), package_name) AS name, price
             FROM mikrotik_packages WHERE id = ? AND company_id = ? AND router_id = ? LIMIT 1`,
            [pid, req.auth.companyId, c.mikrotik_id || 0]);
        if (!p.length) {
            return res.status(400).json({ success: false, code: "BAD_PACKAGE", message: "এই Package নির্বাচন করা যাবে না।" });
        }
        const [dup] = await db.execute(
            `SELECT id FROM customer_tickets WHERE customer_pk = ? AND company_id = ?
               AND type = 'package_change' AND status IN ('open','in_progress') LIMIT 1`,
            [req.auth.customerPk, req.auth.companyId]);
        if (dup.length) {
            return res.status(409).json({ success: false, code: "PENDING_EXISTS", message: "আগের অনুরোধটি এখনো বিবেচনাধীন।" });
        }
        await db.execute(
            `INSERT INTO customer_tickets (company_id, customer_pk, type, subject, message, requested_package_id)
             VALUES (?, ?, 'package_change', ?, ?, ?)`,
            [req.auth.companyId, req.auth.customerPk, `${p[0].name} (${money(p[0].price)})`,
             `বর্তমান: ${c.package_name || "-"}`, pid]);
        res.json({ success: true, message: "অনুরোধ জমা হয়েছে। ISP অনুমোদন করলে Package বদলাবে।" });
    } catch (e) { next(e); }
});

/* Live speed MikroTik জড়িত — Phase 3 (বিদ্যমান driver পড়ে নিরাপদে) */
router.get("/live-speed", (req, res) => res.status(501).json({
    success: false, code: "NOT_IMPLEMENTED", message: "এই ফিচার এখনো চালু হয়নি।" }));

module.exports = router;
