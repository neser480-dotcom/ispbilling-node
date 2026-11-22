"use strict";
/*
| routes/mobile/adminRecharge.js   (mount: /api/mobile/admin)
| Customer Recharge (একক) ও Bulk Recharge — বিদ্যমান Web Handler/Service পুনঃব্যবহার;
| হিসাব, Company-scope ও যাচাই Web-এর সার্ভিসেই থাকে, এখানে নকল করা হয়নি।
|
| Endpoint (সব Bearer লাগবে; Billing-গেট admin.js-এ প্রযোজ্য):
|  GET  /recharge/form?id=         -> গ্রাহকের তথ্য + ফর্মের অপশন (JSON; Web-এ এটি HTML ছিল)   [bill_posting]
|  POST /recharge/quote            -> শুধু হিসাব (dry-run, কিছু সংরক্ষণ হয় না)                 [bill_posting]
|  POST /recharge                  -> রিচার্জ কার্যকর (Web /api/customers/recharge)              [bill_posting]
|  GET  /recharge/bulk/customers?ids=1,2,3 -> বাছাই করা গ্রাহকের তালিকা + ডিফল্ট amount       [bulk_customer_recharge]
|  POST /recharge/bulk             -> বাল্ক রিচার্জ (Web /api/customers/bulk-recharge)           [bulk_customer_recharge]
|
| মোবাইল-স্তরের অতিরিক্ত সুরক্ষা:
|  • ইনপুট whitelist (enum, সংখ্যা, দৈর্ঘ্য); বাল্কে সর্বোচ্চ MAX_BULK গ্রাহক।
|  • Daily Billing শুধু Admin বা daily_recharge_feature Permission থাকলে।
|  • সব উত্তর থেকে password, token, secret, hash, pppoe, nid নামের ফিল্ড মুছে ফেলা হয়।
|  • Web ফাইলে কোনো পরিবর্তন নেই।
*/
const express = require("express");
const db = require("../../config/database");
const { requireBearer, requireMobilePermission } = require("../../middleware/mobileAuth");
const { invokeRouter, webSession } = require("../../services/mobile/webBridge");
const rechargeService = require("../../services/customers/customer-recharge.service");

const singleRouter = require("../customers/customers-recharge");
const bulkRechargeRouter = require("../customers/customers-bulk-recharge");

const MAX_BULK = 500;
const BILL_TYPES = ["Bill", "Advance"];
const BILLING_TYPES = ["Monthly", "Daily"];
const METHODS = ["Hand Cash", "Bkash", "Nagad", "Bank"];
const BULK_BILLING = ["monthly", "yearly"];
const BULK_MEDIUMS = ["hand_cash", "bkash", "nagad", "bank"];

const router = express.Router();
router.use(requireBearer("admin"));

/* ---------------- সহায়ক ---------------- */
const SENSITIVE = /pass(word)?|token|secret|hash|salt|csrf|api[_-]?key|private|pppoe|^nid/i;
function scrub(v, depth = 0) {
    if (depth > 8 || v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map((x) => scrub(x, depth + 1));
    if (v instanceof Date) return v;
    const out = {};
    for (const [k, val] of Object.entries(v)) {
        if (SENSITIVE.test(k)) continue;
        out[k] = scrub(val, depth + 1);
    }
    return out;
}

const bad = (res, message) => res.status(400).json({ success: false, code: "BAD_REQUEST", message });
const intId = (v) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001F]/g, "").trim().slice(0, max);
const money = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : NaN; };
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const iso = (d) => d instanceof Date ? rechargeService._test.formatDate(d) : d ? String(d).slice(0, 19) : "";

/* Daily Billing অনুমতি: Admin অথবা daily_recharge_feature */
async function dailyAllowed(req) {
    if (req.auth.hasFullAccess) return true;
    const [rows] = await db.execute(
        `SELECT allowed FROM user_permissions
         WHERE user_id = ? AND company_id = ? AND permission_key = 'daily_recharge_feature' LIMIT 1`,
        [req.auth.userId, req.auth.companyId]
    );
    return rows.length > 0 && Number(rows[0].allowed) === 1;
}

/* একক রিচার্জের ইনপুট whitelist — অবৈধ মান হলে null-সহ message ফেরত */
function singleInput(b) {
    b = b || {};
    const out = {};
    const billType = clean(b.bill_type || "Bill", 10);
    if (!BILL_TYPES.includes(billType)) return { error: "ভুল Bill Type।" };
    out.bill_type = billType;

    const billingType = clean(b.billing_type || "Monthly", 10);
    if (!BILLING_TYPES.includes(billingType)) return { error: "ভুল Billing Type।" };
    out.billing_type = billingType;

    const rm = parseInt(b.recharge_month ?? 1, 10);
    if (!(rm >= 1 && rm <= 12)) return { error: "মাসের সংখ্যা ১–১২ হতে হবে।" };
    out.recharge_month = rm;

    const sd = parseInt(b.selected_days ?? 30, 10);
    if (!(sd >= 1 && sd <= 31)) return { error: "দিনের সংখ্যা ১–৩১ হতে হবে।" };
    out.selected_days = sd;

    let method = clean(b.payment_method || "Hand Cash", 20);
    if (method.toLowerCase() === "bkash") method = "Bkash";
    if (!METHODS.includes(method)) return { error: "ভুল Payment Method।" };
    out.payment_method = method;

    const discount = money(b.discount ?? 0);
    if (!Number.isFinite(discount) || discount < 0 || discount > 10000000) return { error: "ভুল Discount।" };
    out.discount = discount;

    const advance = money(b.advance ?? 0);
    if (!Number.isFinite(advance) || advance < 0 || advance > 10000000) return { error: "ভুল Advance।" };
    out.advance = advance;

    out.comment = clean(b.comment, 255);

    const bm = clean(b.base_month, 7);
    if (bm) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bm)) return { error: "ভুল base_month।" };
        out.base_month = bm;
    }
    return { input: out };
}

function failRecharge(res, e, next) {
    if (e instanceof rechargeService.RechargeError) {
        return res.status(400).json({ success: false, message: e.message });
    }
    return next(e);
}

async function bridge(res, next, target, opts) {
    try {
        const r = await invokeRouter(target, res.req, opts, 60000);
        return res.status(r.status || 502).json(scrub(r.body) || { success: false, message: "ব্যর্থ হয়েছে।" });
    } catch (e) { return next(e); }
}

/* ============ একক রিচার্জ ============ */

/* ফর্মের তথ্য (Web-এর recharge fragment-এর JSON রূপ) */
router.get("/recharge/form", requireMobilePermission("bill_posting"), async (req, res, next) => {
    try {
        const id = intId(req.query.id);
        if (!id) return bad(res, "ভুল গ্রাহক ID।");

        const companyId = Number(req.auth.companyId || 0);
        const [rows] = await db.execute(
            `SELECT id, customer_id, name, phone, monthly_bill, balance, status, payment_status,
                    promise_date, billing_cycle
             FROM customers
             WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1`,
            [id, companyId]
        );
        if (!rows.length) {
            return res.status(404).json({ success: false, code: "NOT_FOUND", message: "গ্রাহক পাওয়া যায়নি।" });
        }
        const c = rows[0];
        const t = rechargeService._test;

        const monthlyBill = num(c.monthly_bill);
        const balance = num(c.balance);
        const credit = Math.max(0, balance);
        const previousDue = Math.max(0, -balance);

        /* Web-এর নিয়ম: billing_cycle-এর মাস থেকে শুরু, ব্যালেন্সে ধরা মাসগুলো বাদ */
        const base = t.parseDate(t.dateString(c.billing_cycle)) || t.parseDate(t.formatDate(new Date())) || new Date();
        const held = monthlyBill > 0 ? Math.floor(credit / monthlyBill) : 0;
        const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const monthKeys = Array.from({ length: 12 }, (_, i) =>
            keyOf(new Date(base.getFullYear(), base.getMonth() + held + i, 1)));

        res.json({
            success: true,
            customer: {
                id: num(c.id),
                customer_code: c.customer_id || "",
                name: c.name || "",
                phone: c.phone || "",
                monthly_bill: monthlyBill,
                balance,
                previous_due: previousDue,
                status: c.status || "",
                payment_status: c.payment_status || "",
                billing_cycle: iso(c.billing_cycle),
                promise_date: iso(c.promise_date),
                already_paid: String(c.payment_status || "").toLowerCase() === "paid"
            },
            base_month: monthKeys[0],
            month_keys: monthKeys,                       // recharge_month = N মানে প্রথম N টি
            default_total: Math.max(0, monthlyBill - credit) + previousDue,
            allow_daily: await dailyAllowed(req),
            options: {
                bill_types: BILL_TYPES,
                billing_types: BILLING_TYPES,
                payment_methods: METHODS,
                max_months: 12,
                max_days: 31
            }
        });
    } catch (e) { next(e); }
});

/* শুধু হিসাব — কিছু সংরক্ষণ হয় না (Service-এর dryRun) */
router.post("/recharge/quote", requireMobilePermission("bill_posting"), async (req, res, next) => {
    try {
        const id = intId(req.body && req.body.customer_id);
        if (!id) return bad(res, "ভুল গ্রাহক ID।");
        const v = singleInput(req.body);
        if (v.error) return bad(res, v.error);
        if (v.input.billing_type === "Daily" && !(await dailyAllowed(req))) {
            return res.status(403).json({ success: false, code: "FORBIDDEN", message: "Daily রিচার্জের অনুমতি নেই।" });
        }
        const quote = await rechargeService.rechargeCustomer({
            user: webSession(req.auth), customerDbId: id, input: v.input, dryRun: true
        });
        res.json(scrub({ success: true, ...quote }));
    } catch (e) { failRecharge(res, e, next); }
});

/* রিচার্জ কার্যকর — Web handler (Payment, Balance, Billing date, MikroTik সব সেখানে) */
router.post("/recharge", requireMobilePermission("bill_posting"), async (req, res, next) => {
    try {
        const id = intId(req.body && req.body.customer_id);
        if (!id) return bad(res, "ভুল গ্রাহক ID।");
        const v = singleInput(req.body);
        if (v.error) return bad(res, v.error);
        if (v.input.billing_type === "Daily" && !(await dailyAllowed(req))) {
            return res.status(403).json({ success: false, code: "FORBIDDEN", message: "Daily রিচার্জের অনুমতি নেই।" });
        }
        return bridge(res, next, singleRouter, {
            method: "POST", url: "/recharge", body: { ...v.input, customer_id: id }, csrf: true
        });
    } catch (e) { next(e); }
});

/* ============ বাল্ক রিচার্জ ============ */

/* বাছাই করা গ্রাহকের সারাংশ (ডিফল্ট amount = মাসিক বিল) */
router.get("/recharge/bulk/customers", requireMobilePermission("bulk_customer_recharge"), async (req, res, next) => {
    try {
        const ids = [...new Set(String(req.query.ids || "").split(",").map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];
        if (!ids.length) return bad(res, "কোনো গ্রাহক বাছাই করা হয়নি।");
        if (ids.length > MAX_BULK) return bad(res, `একসাথে সর্বোচ্চ ${MAX_BULK} জন গ্রাহক।`);

        const companyId = Number(req.auth.companyId || 0);
        const [rows] = await db.query(
            `SELECT id, customer_id, name, phone, monthly_bill, balance, status, payment_status
             FROM customers
             WHERE id IN (?) AND company_id = ? AND deleted_at IS NULL`,
            [ids, companyId]
        );
        const items = rows.map((r) => ({
            id: num(r.id),
            customer_code: r.customer_id || "",
            name: r.name || "",
            phone: r.phone || "",
            monthly_bill: num(r.monthly_bill),
            balance: num(r.balance),
            status: r.status || "",
            payment_status: r.payment_status || "",
            amount: num(r.monthly_bill)
        }));
        res.json({
            success: true,
            total: items.length,
            total_amount: items.reduce((s, x) => s + x.amount, 0),
            max_bulk: MAX_BULK,
            billing_types: BULK_BILLING,
            mediums: BULK_MEDIUMS,
            items
        });
    } catch (e) { next(e); }
});

router.post("/recharge/bulk", requireMobilePermission("bulk_customer_recharge"), async (req, res, next) => {
    try {
        const b = req.body || {};
        const billingType = clean(b.billing_type || "monthly", 10).toLowerCase();
        if (!BULK_BILLING.includes(billingType)) return bad(res, "ভুল Billing Type।");
        const medium = clean(b.medium || "hand_cash", 15).toLowerCase();
        if (!BULK_MEDIUMS.includes(medium)) return bad(res, "ভুল Payment Medium।");

        if (!Array.isArray(b.items) || !b.items.length) return bad(res, "কোনো গ্রাহক বাছাই করা হয়নি।");
        if (b.items.length > MAX_BULK) return bad(res, `একসাথে সর্বোচ্চ ${MAX_BULK} জন গ্রাহক।`);

        const seen = new Set();
        const items = [];
        for (const it of b.items) {
            const id = intId(it && (it.customer_id ?? it.id));
            const amount = money(it && it.amount);
            if (!id || seen.has(id)) continue;
            if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) continue;
            seen.add(id);
            items.push({ customer_id: id, amount });
        }
        if (!items.length) return bad(res, "কোনো বৈধ amount পাওয়া যায়নি।");

        return bridge(res, next, bulkRechargeRouter, {
            method: "POST", url: "/bulk-recharge", csrf: true,
            body: { billing_type: billingType, medium, comment: clean(b.comment || "Bulk recharge", 1000), items }
        });
    } catch (e) { next(e); }
});

module.exports = router;
