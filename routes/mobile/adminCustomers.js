"use strict";
/*
| routes/mobile/adminCustomers.js   (mount: /api/mobile/admin/customers)
| শুধু পড়া (read-only): Customer তালিকা ও বিস্তারিত।
| Permission: customer_list (Web-এর মতো; admin/super_admin সব পায়)।
| Company isolation: super_admin ছাড়া সবসময় নিজের Company।
| Collection/Payment নেওয়া এখানে নেই (বিদ্যমান customer-recharge service ও MikroTik জড়িত)।
*/
const express = require("express");
const db = require("../../config/database");
const { requireMobilePermission, scopeCompanyId } = require("../../middleware/mobileAuth");

const router = express.Router();

const bad = (res, message) =>
    res.status(400).json({ success: false, code: "BAD_REQUEST", message });
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : "");
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => "\\" + c);

function shape(r) {
    return {
        id: Number(r.id),
        customer_code: r.customer_id || "",
        name: r.name || "",
        phone: r.phone || "",
        address: r.address || "",
        package_name: r.package_name || "",
        monthly_bill: num(r.monthly_bill),
        balance: num(r.balance),
        status: r.status || "",
        payment_status: r.payment_status || "",
        promise_date: iso(r.promise_date),
        connection_date: iso(r.connection_date),
        company_id: Number(r.company_id)
    };
}

const COLS = `id, company_id, customer_id, name, phone, address, package_name, monthly_bill,
              balance, status, payment_status, promise_date, connection_date`;

/* GET /?search=&status=&payment_status=&page=&limit= */
router.get("/", requireMobilePermission("customer_list"), async (req, res, next) => {
    try {
        const company = scopeCompanyId(req);
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
        const offset = (page - 1) * limit;

        const where = ["deleted_at IS NULL"];
        const params = [];

        if (company) { where.push("company_id = ?"); params.push(company); }

        const search = String(req.query.search || "").trim().slice(0, 60);
        if (search) {
            const like = `%${likeEscape(search)}%`;
            where.push("(name LIKE ? OR phone LIKE ? OR customer_id LIKE ? OR address LIKE ?)");
            params.push(like, like, like, like);
        }

        const status = String(req.query.status || "").trim().slice(0, 30);
        if (status) { where.push("status = ?"); params.push(status); }

        const pay = String(req.query.payment_status || "").trim().slice(0, 30);
        if (pay) { where.push("payment_status = ?"); params.push(pay); }

        const w = where.join(" AND ");

        const [[tot]] = await db.execute(`SELECT COUNT(*) AS total FROM customers WHERE ${w}`, params);
        const [rows] = await db.execute(
            `SELECT ${COLS} FROM customers WHERE ${w} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`,
            params);

        res.json({ page, limit, total: num(tot && tot.total), items: rows.map(shape) });
    } catch (e) { next(e); }
});

/* GET /:id  (customers.id) — বিস্তারিত + সাম্প্রতিক Payment */
router.get("/:id", requireMobilePermission("customer_list"), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return bad(res, "ভুল Customer ID।");

        const company = scopeCompanyId(req);
        const [rows] = await db.execute(
            `SELECT ${COLS} FROM customers WHERE id = ? AND deleted_at IS NULL
             ${company ? "AND company_id = ?" : ""} LIMIT 1`,
            company ? [id, company] : [id]);

        if (!rows.length) {
            return res.status(404).json({ success: false, code: "NOT_FOUND", message: "পাওয়া যায়নি।" });
        }

        const c = rows[0];

        const [pay] = await db.execute(
            `SELECT amount, billing_month, billing_year, payment_date, payment_method
             FROM payments
             WHERE customer_id = ? AND company_id = ? AND deleted_at IS NULL AND payment_cancelled_at IS NULL
             ORDER BY payment_date DESC, id DESC LIMIT 12`,
            [c.id, c.company_id]);

        res.json({
            ...shape(c),
            payments: pay.map((p) => ({
                amount: num(p.amount),
                month: p.billing_year && p.billing_month
                    ? `${p.billing_year}-${String(p.billing_month).padStart(2, "0")}` : iso(p.payment_date),
                date: iso(p.payment_date),
                method: p.payment_method || ""
            }))
        });
    } catch (e) { next(e); }
});

module.exports = router;
