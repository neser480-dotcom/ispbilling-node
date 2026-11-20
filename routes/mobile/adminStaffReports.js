"use strict";
/*
| routes/mobile/adminStaffReports.js   (mount: /api/mobile/admin)
| Collector, Manager, Report/Deposit, Expenditure — বিদ্যমান Web Handler ভেতর থেকে পুনঃব্যবহার
| (Business Logic, Company-scope ও যাচাই Web-এর সার্ভিসেই থাকে; এখানে নকল করা হয়নি)।
|
| মোবাইল-স্তরের অতিরিক্ত সুরক্ষা:
|  • Collector/Manager ম্যানেজমেন্ট শুধু admin/super_admin (Web-এর সার্ভিসও তা-ই চায়)।
|  • Expenditure যোগ/সম্পাদনা ও Type ম্যানেজমেন্ট শুধু admin/super_admin; মোছা: expenditure_delete Permission।
|  • Report: Web-এর সমান (লগইন + Company-scope)। কঠোর করতে নিচে REPORT_PERMISSION-এ একটি Permission key বসান।
|  • সব উত্তর থেকে password/token/secret/hash নামের ফিল্ড মুছে ফেলা হয়।
|  • ইনপুট whitelist করা হয় (তারিখ, সংখ্যা, :id)।
*/
const express = require("express");
const { requireBearer, requireMobilePermission } = require("../../middleware/mobileAuth");
const { invokeRouter } = require("../../services/mobile/webBridge");

const collectorRouter = require("../staff/collector/collector.routes");
const managerRouter = require("../staff/manager/manager.routes");
const reportsRouter = require("../reports/reports");
const expenditureRouter = require("../billing/expenditure.routes");

/* null = Web-এর সমান আচরণ (সবাই দেখতে পারে)। কঠোর করতে যেমন: "bill_posting" */
const REPORT_PERMISSION = null;

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
const adminOnly = (req, res, next) => req.auth.hasFullAccess ? next()
    : res.status(403).json({ success: false, code: "FORBIDDEN", message: "শুধু Admin এই কাজ করতে পারবেন।" });
const reportGate = REPORT_PERMISSION ? requireMobilePermission(REPORT_PERMISSION) : (req, res, next) => next();

const intId = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : 0; };
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001F]/g, "").trim().slice(0, max);
const DATE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;

function listQuery(q, extra = []) {
    const out = {};
    const page = parseInt(q.page, 10); if (page > 0) out.page = String(Math.min(page, 10000));
    const limit = parseInt(q.limit, 10); if (limit > 0) out.limit = String(Math.min(limit, 100));
    const search = clean(q.search, 60); if (search) out.search = search;
    for (const k of ["from_date", "to_date", "from_dt", "to_dt"]) {
        const v = clean(q[k], 19); if (v && DATE.test(v)) out[k] = v;
    }
    for (const k of extra) {
        const v = clean(q[k], 30); if (v) out[k] = v;
    }
    return out;
}

async function call(res, next, target, opts) {
    try {
        const r = await invokeRouter(target, res.req, opts);
        res.status(r.status || 502).json(scrub(r.body) || { success: false, message: "ব্যর্থ হয়েছে।" });
    } catch (e) { next(e); }
}

/* ============ Collector ও Manager (একই কাঠামো) ============ */
function staffRoutes(name, target, extras) {
    const base = `/${name}`;
    router.get(base, adminOnly, (req, res, next) =>
        call(res, next, target, { url: "/data", query: listQuery(req.query, ["status"]) }));
    router.get(`${base}/areas`, adminOnly, (req, res, next) =>
        call(res, next, target, { url: "/areas" }));
    router.post(base, adminOnly, (req, res, next) =>
        call(res, next, target, { method: "POST", url: "/", body: req.body || {}, csrf: true }));

    const sub = (path, method = "GET") => (req, res, next) => {
        const id = intId(req.params.id);
        if (!id) return bad(res, "ভুল ID।");
        return call(res, next, target, {
            method, url: `/${id}${path}`, body: method === "GET" ? {} : (req.body || {}), csrf: method !== "GET" });
    };
    for (const p of ["profile", "edit-data", "activity", ...extras]) {
        router.get(`${base}/:id/${p}`, adminOnly, sub(`/${p}`));
    }
    router.put(`${base}/:id/password`, adminOnly, sub("/password", "PUT"));
    router.put(`${base}/:id`, adminOnly, sub("", "PUT"));
    router.delete(`${base}/:id`, adminOnly, sub("", "DELETE"));
}
staffRoutes("collectors", collectorRouter, ["balance"]);
staffRoutes("managers", managerRouter, []);

/* ============ Report / Deposit (শুধু পড়া) ============ */
const rep = (path, extra = []) => (req, res, next) =>
    call(res, next, reportsRouter, { url: path, query: listQuery(req.query, extra) });
router.get("/reports/collection", reportGate, rep("/api/collection"));
router.get("/reports/collection/filters", reportGate, rep("/api/collection/filters", ["reseller_id"]));
router.get("/reports/deposit", reportGate, rep("/api/deposit"));
router.get("/reports/collector-deposit/collectors", reportGate, rep("/api/collector-deposit/collectors", ["tab", "collector_id"]));
router.get("/reports/collector-deposit", reportGate, rep("/api/collector-deposit", ["tab", "collector_id"]));

/* ============ Expenditure ============ */
router.get("/expenditures", (req, res, next) => {
    const q = {};
    for (const k of ["date_from", "date_to"]) {
        const v = clean(req.query[k], 10); if (DATE.test(v)) q[k] = v;
    }
    if (req.query.filter === "1") q.filter = "1";
    const name = clean(req.query.name, 100); if (name) q.name = name;
    const type = clean(req.query.type, 100); if (type) q.type = type;
    return call(res, next, expenditureRouter, { url: "/api/data", query: q });
});
router.post("/expenditures", adminOnly, (req, res, next) =>
    call(res, next, expenditureRouter, { method: "POST", url: "/api/expenditures", body: req.body || {}, csrf: true }));

const withId = (fn) => (req, res, next) => {
    const id = intId(req.params.id);
    return id ? fn(id, req, res, next) : bad(res, "ভুল ID।");
};
router.put("/expenditures/:id", adminOnly, withId((id, req, res, next) =>
    call(res, next, expenditureRouter, { method: "PUT", url: `/api/expenditures/${id}`, body: req.body || {}, csrf: true })));
router.delete("/expenditures/:id", requireMobilePermission("expenditure_delete"), withId((id, req, res, next) =>
    call(res, next, expenditureRouter, { method: "DELETE", url: `/api/expenditures/${id}`, csrf: true })));

router.post("/expenditure-types", adminOnly, (req, res, next) =>
    call(res, next, expenditureRouter, { method: "POST", url: "/api/types", body: req.body || {}, csrf: true }));
router.put("/expenditure-types/:id", adminOnly, withId((id, req, res, next) =>
    call(res, next, expenditureRouter, { method: "PUT", url: `/api/types/${id}`, body: req.body || {}, csrf: true })));
router.delete("/expenditure-types/:id", adminOnly, withId((id, req, res, next) =>
    call(res, next, expenditureRouter, { method: "DELETE", url: `/api/types/${id}`, csrf: true })));

module.exports = router;
module.exports._test = { scrub, listQuery };
