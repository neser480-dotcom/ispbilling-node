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
const live = require("../../services/mobile/customerLive.service");
const security = require("../../middleware/security");
const paymentService = require("../../services/payment/payment.service");
const settlement = require("../../services/payment/paymentSettlement.service");
const demo = require("../../services/payment/demoMode");
const pg = require("../../controllers/billing/paymentGateway.controller")._mobile;

const router = express.Router();
router.use(requireBearer("customer"));

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : "");
const money = (v) => Number(v || 0);

async function loadCustomer(req) {
    const [rows] = await db.execute(
        `SELECT id, customer_id, name, phone, address, package_id, package_name, monthly_bill,
                balance, status, payment_status, promise_date, connection_date, billing_cycle,
                created_at, mikrotik_id, pppoe_username
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
            // "Last Date" = সংযোগের শেষ তারিখ (promise_date); বৃত্তের সংখ্যা = আর কত দিন বাকি
            last_payment_date: c.promise_date ? live.fmtDateTime(new Date(c.promise_date)) : iso(pay[0]?.last_date),
            deadline_day: c.promise_date
                ? Math.max(0, Math.ceil((new Date(c.promise_date).getTime() - Date.now()) / 86400000)) : 0,
            stats: await live.stats({ ...c, company_id: req.auth.companyId })
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
        const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
            "August", "September", "October", "November", "December"];
        res.json(rows.map((r) => {
            const pd = r.payment_date ? new Date(r.payment_date) : null;
            const m = Number(r.billing_month) >= 1 && Number(r.billing_month) <= 12
                ? Number(r.billing_month) : (pd ? pd.getMonth() + 1 : 0);   // মাস ফাঁকা হলে পেমেন্টের মাস
            const y = Number(r.billing_year) || (pd ? pd.getFullYear() : "");
            return { month: m ? `${MONTHS[m - 1]} ${y}` : String(y), amount: money(r.amount), status: "PAID" };
        }));
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
        const [customerTickets] = await db.execute(
            `SELECT id, subject, status, created_at
             FROM customer_tickets
             WHERE customer_pk = ? AND company_id = ? AND type = 'package_change'
             ORDER BY id DESC LIMIT 50`,
            [req.auth.customerPk, req.auth.companyId]);

        const [supportTickets] = await db.execute(
            `SELECT id, ticket_code, message, status, created_at
             FROM support_tickets
             WHERE customer_id = ? AND company_id = ?
             ORDER BY id DESC LIMIT 50`,
            [req.auth.customerPk, req.auth.companyId]);

        const rows = [
            ...customerTickets.map((r) => ({
                id: `package-${r.id}`,
                subject: `[Package] ${r.subject}`,
                status: r.status === "pending" ? "open" : r.status,
                created_at: r.created_at
            })),
            ...supportTickets.map((r) => {
                const parts = String(r.message || "").split("\n\n");
                const adminStatus = String(r.status || "").toLowerCase();
                return {
                    id: r.id,
                    subject: parts[0] || r.ticket_code || "Support Ticket",
                    status: adminStatus === "process" ? "in_progress"
                        : adminStatus === "completed" ? "closed" : "open",
                    date: iso(r.created_at),
                    created_at: r.created_at
                };
            })
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 50);

        res.json(rows.map((r) => ({
            id: r.id,
            subject: r.subject,
            status: r.status,
            date: r.date || iso(r.created_at)
        })));
    } catch (e) { next(e); }
});

router.post("/tickets", async (req, res, next) => {
    try {
        const subject = clean(req.body?.subject, 150);
        const message = clean(req.body?.message, 2000);
        if (!subject) {
            return res.status(400).json({ success: false, code: "BAD_REQUEST", message: "বিষয় লিখুন।" });
        }

        const customer = await loadCustomer(req);
        if (!customer) {
            return res.status(404).json({ success: false, code: "NOT_FOUND", message: "কাস্টমার তথ্য পাওয়া যায়নি।" });
        }

        const [open] = await db.execute(
            `SELECT COUNT(*) AS c FROM support_tickets
             WHERE customer_id = ? AND company_id = ? AND status IN ('Pending','Process')`,
            [req.auth.customerPk, req.auth.companyId]);
        if (Number(open[0].c) >= 5) {
            return res.status(429).json({ success: false, code: "TOO_MANY_OPEN",
                message: "আগের টিকেটগুলো নিষ্পত্তি না হওয়া পর্যন্ত নতুন টিকেট খোলা যাবে না।" });
        }

        const ticketCode = "CUS-" + Date.now().toString();
        const fullMessage = message ? `${subject}\n\n${message}` : subject;
        const [result] = await db.execute(
            `INSERT INTO support_tickets
             (company_id, ticket_code, customer_id, customer_name, message, ticket_type, status)
             VALUES (?, ?, ?, ?, ?, 'Medium', 'Pending')`,
            [req.auth.companyId, ticketCode, req.auth.customerPk, customer.name, fullMessage]);

        res.status(201).json({
            success: true,
            id: result.insertId,
            ticket_code: ticketCode,
            message: "সাপোর্ট টিকিট জমা হয়েছে।"
        });
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
/* ====================== অনলাইন পেমেন্ট (bKash / Nagad / SSLCommerz / ShurjoPay) ======================
   টাকার পরিমাণ সবসময় সার্ভার হিসাব করে (Customer Recharge dry-run); অ্যাপ থেকে আসা amount কখনো ধরা হয় না।
   ISP-র নিজস্ব merchant account (scope=customer) ব্যবহার হয়। Settlement ও ledger বিদ্যমান যাচাই-করা flow-ই করে। */
const GATEWAY_LABELS = {
    bkash: "bKash", nagad: "Nagad", sslcommerz: "SSLCommerz", shurjopay: "ShurjoPay",
    rocket: "Rocket", dbbl: "DBBL Nexus / Card"
};
const payLimiter = security.authLimiter({
    windowMs: 10 * 60 * 1000, max: 20,
    message: { success: false, code: "TOO_MANY_REQUESTS", message: "অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।" }
});

function payForm(body) {
    const advance = Number(body.advance || 0);
    const months = Math.floor(Number(body.recharge_month || 1));
    return {
        bill_type: body.bill_type === "Advance" ? "Advance" : "Bill",
        recharge_month: months >= 1 && months <= 12 ? months : 1,
        advance: Number.isFinite(advance) && advance > 0 && advance <= 100000 ? advance : 0
    };
}

function payError(res, e, label) {
    if (e instanceof pg.CheckoutError) return res.status(e.status).json({ success: false, message: e.message });
    if (e && (e.name === "RechargeError" || e.name === "SoftwareBillingError"))
        return res.status(400).json({ success: false, message: e.message });
    console.error(label, e);
    return res.status(500).json({ success: false, message: "পেমেন্ট শুরু করা যায়নি।" });
}

router.get("/pay/options", async (req, res) => {
    try {
        const c = await loadCustomer(req);
        if (!c) return res.status(404).json({ success: false, code: "NOT_FOUND", message: "পাওয়া যায়নি।" });
        const gateways = [];
        for (const g of pg.CHECKOUT_GATEWAYS) {
            const row = await paymentService.getGateway(req.auth.companyId, g, "customer");
            if (demo.modeFor(g, row)) {
                gateways.push({ key: g, label: GATEWAY_LABELS[g] });
                if (g === "sslcommerz") {
                    gateways.push({ key: "rocket", label: GATEWAY_LABELS.rocket }, { key: "dbbl", label: GATEWAY_LABELS.dbbl });
                }
            }
        }
        let amount = 0;
        if (gateways.length) {
            try {
                const { quote } = await pg.quoteCustomerBill({
                    companyId: req.auth.companyId, customerId: c.customer_id, form: payForm({}) });
                amount = Number(quote.amount) || 0;
            } catch (e) { if (!(e instanceof pg.CheckoutError)) throw e; }
        }
        const bal = money(c.balance);
        res.json({ success: true, gateways, amount, due: bal < 0 ? -bal : 0, monthly_bill: money(c.monthly_bill) });
    } catch (e) { payError(res, e, "MOBILE PAY OPTIONS:"); }
});

router.post("/pay/quote", payLimiter, async (req, res) => {
    try {
        const c = await loadCustomer(req);
        if (!c) return res.status(404).json({ success: false, code: "NOT_FOUND", message: "পাওয়া যায়নি।" });
        const { quote } = await pg.quoteCustomerBill({
            companyId: req.auth.companyId, customerId: c.customer_id, form: payForm(req.body || {}) });
        res.json({ success: true, amount: Number(quote.amount) || 0 });
    } catch (e) { payError(res, e, "MOBILE PAY QUOTE:"); }
});

router.post("/pay/create", payLimiter, async (req, res) => {
    try {
        const c = await loadCustomer(req);
        if (!c) return res.status(404).json({ success: false, code: "NOT_FOUND", message: "পাওয়া যায়নি।" });
        const { gateway, method } = pg.resolveGateway(req.body?.gateway);
        const gatewayRow = await pg.loadEnabledGateway(req.auth.companyId, gateway, "customer");
        const { quote, request } = await pg.quoteCustomerBill({
            companyId: req.auth.companyId, customerId: c.customer_id, form: payForm(req.body || {}) });
        const out = await pg.startPayment({
            req, companyId: req.auth.companyId, userId: null, gateway, gatewayRow,
            scope: "customer", purpose: "customer_bill", amount: quote.amount,
            request, customerName: quote.customer_name, method
        });
        const url = String(out.redirect_url || "");
        res.json({
            success: true, transaction_id: out.transaction_id, amount: Number(quote.amount) || 0,
            redirect_url: url.startsWith("/") ? pg.baseUrl(req) + url : url
        });
    } catch (e) { payError(res, e, "MOBILE PAY CREATE:"); }
});

/* শুধু নিজের লেনদেন: company + customer দুটোই মিলতে হবে */
router.get("/pay/status/:transactionId", async (req, res) => {
    try {
        const id = String(req.params.transactionId || "").trim();
        if (!/^[A-Za-z0-9]{6,40}$/.test(id)) return res.status(404).json({ success: false, message: "পাওয়া যায়নি।" });
        let t = await paymentService.getTransactionByTransactionId(id);
        const meta = t ? paymentService.parseJson(t.metadata, {}) : {};
        const mine = t && Number(t.company_id) === Number(req.auth.companyId)
            && Number(meta?.request?.customer_db_id) === Number(req.auth.customerPk);
        if (!mine) return res.status(404).json({ success: false, message: "পাওয়া যায়নি।" });
        if (["pending", "verified"].includes(t.status)) {
            try {
                const outcome = await settlement.settle(t, { clientIp: pg.clientIpV4(req) });
                t = outcome.transaction || t;
            } catch (e) { console.error("MOBILE PAY SETTLE:", e.message); }
        }
        res.json({
            success: true, status: t.status, paid: t.status === "paid",
            final: ["paid", "failed", "needs_review"].includes(t.status), amount: Number(t.amount) || 0
        });
    } catch (e) { payError(res, e, "MOBILE PAY STATUS:"); }
});

router.get("/live-speed", async (req, res, next) => {
    try {
        const c = await loadCustomer(req);
        if (!c) return res.status(404).json({ success: false, code: "NOT_FOUND", message: "পাওয়া যায়নি।" });
        res.json(await live.liveSpeed({ ...c, company_id: req.auth.companyId }));
    } catch (e) { next(e); }
});

module.exports = router;
