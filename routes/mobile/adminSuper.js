"use strict";
/*
| routes/mobile/adminSuper.js   (mount: /api/mobile/admin/super)  — শুধু Super Admin
|  GET  /software-billing            সব ISP-র Software Bill (সারাংশসহ), read-only
|  GET  /pricing/companies           Company-wise Pricing তালিকা
|  GET  /pricing/companies/:id       এক Company + History
|  POST /pricing/companies/:id/rules                      Rule সংরক্ষণ
|  POST /pricing/companies/:id/rules/:feeType/toggle     Enable/Disable
|  POST /pricing/companies/:id/rules/:feeType/reset      Default-এ ফেরা
| Pricing-এর সব নিয়ম/যাচাই services/billing/pricing.service.js-এ (Web পেজের সঙ্গে একই)।
| সেই Service ইনস্টল না থাকলে শুধু Pricing endpoint ৫০১ দেয়; বাকি Mobile API অক্ষত।
*/
const express = require("express");
const db = require("../../config/database");

const router = express.Router();

const DT = "%Y-%m-%d %H:%i:%s";
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => "\\" + c);

/* Super Admin ছাড়া কেউ নয় (req.auth Bearer + DB থেকে যাচাই হওয়া) */
router.use((req, res, next) => {
    if (!req.auth || req.auth.type !== "admin" || !req.auth.isSuperAdmin) {
        return res.status(403).json({
            success: false, code: "FORBIDDEN", message: "Super Admin access required."
        });
    }
    next();
});

/* ---------------- Software Billing (read-only) ---------------- */

router.get("/software-billing", async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
        const offset = (page - 1) * limit;

        const where = ["1 = 1"];
        const params = [];

        const status = String(req.query.status || "");
        if (["unpaid", "paid", "cancelled"].includes(status)) { where.push("b.status = ?"); params.push(status); }

        const type = String(req.query.type || "");
        if (["registration", "monthly"].includes(type)) { where.push("b.billing_type = ?"); params.push(type); }

        const search = String(req.query.search || "").trim().slice(0, 60);
        if (search) {
            const like = `%${likeEscape(search)}%`;
            where.push("(u.company_name LIKE ? OR u.username LIKE ? OR u.mobile LIKE ? OR CAST(b.company_id AS CHAR) = ?)");
            params.push(like, like, like, search);
        }

        const w = where.join(" AND ");

        const [[tot]] = await db.execute(
            `SELECT COUNT(*) AS total
             FROM software_billing_notifications b LEFT JOIN users u ON u.id = b.user_id
             WHERE ${w}`, params);

        const [rows] = await db.execute(
            `SELECT b.id, b.company_id, b.billing_type, b.package_code, b.amount, b.status,
                    b.billing_period,
                    DATE_FORMAT(b.due_date, '${DT}') AS due_date,
                    DATE_FORMAT(b.paid_at, '${DT}') AS paid_at,
                    DATE_FORMAT(b.created_at, '${DT}') AS created_at,
                    u.company_name, u.owner_name, u.mobile, u.username
             FROM software_billing_notifications b
             LEFT JOIN users u ON u.id = b.user_id
             WHERE ${w}
             ORDER BY CASE WHEN b.status = 'unpaid' THEN 0 ELSE 1 END, b.id DESC
             LIMIT ${limit} OFFSET ${offset}`, params);

        const [sum] = await db.execute(
            `SELECT status, COUNT(*) AS c, COALESCE(SUM(amount), 0) AS s
             FROM software_billing_notifications GROUP BY status`);

        const summary = { unpaid_count: 0, unpaid_amount: 0, paid_count: 0, paid_amount: 0 };
        for (const r of sum) {
            if (r.status === "unpaid") { summary.unpaid_count = num(r.c); summary.unpaid_amount = num(r.s); }
            if (r.status === "paid") { summary.paid_count = num(r.c); summary.paid_amount = num(r.s); }
        }

        res.json({
            page, limit, total: num(tot && tot.total), summary,
            items: rows.map((r) => ({
                id: Number(r.id),
                company_id: Number(r.company_id),
                company_name: r.company_name || "",
                owner_name: r.owner_name || "",
                mobile: r.mobile || "",
                username: r.username || "",
                billing_type: r.billing_type,
                package_code: r.package_code || "",
                billing_period: r.billing_period || "",
                amount: num(r.amount),
                status: r.status,
                due_date: r.due_date || "",
                paid_at: r.paid_at || "",
                created_at: r.created_at || ""
            }))
        });
    } catch (e) { next(e); }
});

/* ---------------- Pricing (pricing.service.js পুনঃব্যবহার) ---------------- */

function pricingService(res) {
    try {
        return require("../../services/billing/pricing.service");
    } catch (_) {
        res.status(501).json({
            success: false, code: "PRICING_NOT_INSTALLED",
            message: "Pricing module ইনস্টল করা নেই।"
        });
        return null;
    }
}

function actor(req) {
    return {
        userId: Number(req.auth.userId),
        companyId: Number(req.auth.companyId || 0),
        name: req.auth.fullname || req.auth.username || "",
        role: req.auth.role,
        ip: req.ip || (req.socket && req.socket.remoteAddress) || null
    };
}

function fail(res, error, next) {
    const status = Number(error && error.httpCode) || 0;
    if (status >= 400 && status < 500) {
        return res.status(status).json({ success: false, code: "REJECTED", message: error.message });
    }
    return next(error);
}

router.get("/pricing/companies", async (req, res, next) => {
    const svc = pricingService(res); if (!svc) return;
    try {
        res.json({ companies: await svc.listCompanies(req.query.search) });
    } catch (e) { fail(res, e, next); }
});

router.get("/pricing/companies/:id", async (req, res, next) => {
    const svc = pricingService(res); if (!svc) return;
    try {
        res.json(await svc.getCompanyDetail(req.params.id));
    } catch (e) { fail(res, e, next); }
});

router.post("/pricing/companies/:id/rules", async (req, res, next) => {
    const svc = pricingService(res); if (!svc) return;
    try {
        const b = req.body || {};
        await svc.saveRule({
            companyId: req.params.id, feeType: b.fee_type, mode: b.mode, value: b.value,
            isEnabled: b.is_enabled, startsAt: b.starts_at, expiresAt: b.expires_at, note: b.note
        }, actor(req));
        res.json({ success: true, ...(await svc.getCompanyDetail(req.params.id)) });
    } catch (e) { fail(res, e, next); }
});

router.post("/pricing/companies/:id/rules/:feeType/toggle", async (req, res, next) => {
    const svc = pricingService(res); if (!svc) return;
    try {
        const b = req.body || {};
        await svc.setEnabled({
            companyId: req.params.id, feeType: req.params.feeType, enabled: b.enabled, note: b.note
        }, actor(req));
        res.json({ success: true, ...(await svc.getCompanyDetail(req.params.id)) });
    } catch (e) { fail(res, e, next); }
});

router.post("/pricing/companies/:id/rules/:feeType/reset", async (req, res, next) => {
    const svc = pricingService(res); if (!svc) return;
    try {
        const b = req.body || {};
        await svc.resetRule({
            companyId: req.params.id, feeType: req.params.feeType, note: b.note
        }, actor(req));
        res.json({ success: true, ...(await svc.getCompanyDetail(req.params.id)) });
    } catch (e) { fail(res, e, next); }
});

module.exports = router;
