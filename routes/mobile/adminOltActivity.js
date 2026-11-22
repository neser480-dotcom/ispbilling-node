"use strict";
/*
| routes/mobile/adminOltActivity.js   (mount: /api/mobile/admin)
| OLT তালিকা/বিস্তারিত/ONU, OLT মনিটর (dashboard/live) ও Activity Log —
| বিদ্যমান Web Handler ভেতর থেকে পুনঃব্যবহার (webBridge)। Web ফাইল অপরিবর্তিত।
|
| নিয়ম:
|  • পড়া (GET): লগইন + Company-scope (Web-এর মতোই; Web কন্ট্রোলার নিজেই scope করে)।
|  • লেখা/হার্ডওয়্যার অ্যাকশন (check/sync/auto-map/link/unlink/edit/delete): শুধু admin/super_admin।
|  • OLT যোগ: olt_add Permission (Web-এর মতো) — Permission থাকলে non-admin-ও পারবেন।
|  • সব উত্তর থেকে password/token/secret/community/pppoe* ফিল্ড মুছে ফেলা হয়।
|  • ইনপুট whitelist করা হয়; Billing-গেট /admin-এর ওপর আগেই প্রযোজ্য।
*/
const express = require("express");
const { requireBearer, requireMobilePermission } = require("../../middleware/mobileAuth");
const { invokeRouter } = require("../../services/mobile/webBridge");

const oltRouter = require("../olt/olt");
const oltMonitorRouter = require("../olt/olt-monitor");
const activityRouter = require("../activity/activity-log.server");

const router = express.Router();
router.use(requireBearer("admin"));

/* ---------------- সহায়ক ---------------- */
const SENSITIVE = /pass(word)?|token|secret|hash|salt|csrf|api[_-]?key|private|community|pppoe|^nid/i;
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

const intId = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : 0; };
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001F]/g, "").trim().slice(0, max);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LONG_MS = 120000;   // OLT-এ লগইন/SNMP/Sync ধীর হতে পারে

async function call(res, next, target, opts, timeoutMs) {
    try {
        const r = await invokeRouter(target, res.req, opts, timeoutMs);
        res.status(r.status || 502).json(scrub(r.body) || { success: false, message: "ব্যর্থ হয়েছে।" });
    } catch (e) { next(e); }
}

const withId = (fn) => (req, res, next) => {
    const id = intId(req.params.id);
    return id ? fn(id, req, res, next) : bad(res, "ভুল ID।");
};

const BOOL = (v) => v === true || v === "true" || v === 1 || v === "1";

/* OLT ফর্মের অনুমোদিত ফিল্ড (Web validateInput-এর সমান) */
function oltBody(b) {
    b = b || {};
    const out = {};
    const strs = { vendor: 50, name: 150, ip: 255, host: 255, username: 150, snmp_version: 10, community: 100, remarks: 1000 };
    for (const [k, max] of Object.entries(strs)) {
        if (b[k] !== undefined && b[k] !== null) out[k] = clean(b[k], max);
    }
    if (b.password !== undefined && b.password !== null) out.password = String(b.password).slice(0, 200);
    for (const k of ["port", "pon_ports"]) {
        if (b[k] !== undefined && b[k] !== null && b[k] !== "") out[k] = Number(b[k]);
    }
    if (b.mikrotik_id !== undefined && b.mikrotik_id !== null && b.mikrotik_id !== "") out.mikrotik_id = Number(b.mikrotik_id);
    return out;
}

/* ============ OLT তালিকা / বিস্তারিত / ONU (পড়া) ============ */
router.get("/olts", (req, res, next) => {
    const q = {};
    const search = clean(req.query.search, 150); if (search) q.search = search;
    return call(res, next, oltRouter, { url: "/", query: q });
});

router.get("/olts/:id/details", withId((id, req, res, next) =>
    call(res, next, oltRouter, { url: `/${id}/details` })));

router.get("/olts/:id/onus", withId((id, req, res, next) => {
    const q = {};
    const search = clean(req.query.search, 150); if (search) q.search = search;
    return call(res, next, oltRouter, { url: `/${id}/onus`, query: q });
}));

router.get("/olts/:id/customers/search", withId((id, req, res, next) =>
    call(res, next, oltRouter, { url: `/${id}/customers/search`, query: { q: clean(req.query.q, 100) } })));

/* ============ OLT ম্যানেজমেন্ট ============ */
router.post("/olts", requireMobilePermission("olt_add"), (req, res, next) =>
    call(res, next, oltRouter, { method: "POST", url: "/", body: oltBody(req.body), csrf: true }));

router.put("/olts/:id", adminOnly, withId((id, req, res, next) =>
    call(res, next, oltRouter, { method: "PUT", url: `/${id}`, body: oltBody(req.body), csrf: true })));

/* Web কন্ট্রোলার body.confirm === true চায়; মোবাইলেও স্পষ্ট নিশ্চিতকরণ বাধ্যতামূলক */
router.delete("/olts/:id", adminOnly, withId((id, req, res, next) => {
    if (!BOOL(req.body && req.body.confirm)) return bad(res, "মুছতে confirm: true পাঠান।");
    return call(res, next, oltRouter, { method: "DELETE", url: `/${id}`, body: { confirm: true }, csrf: true });
}));

/* ============ হার্ডওয়্যার অ্যাকশন (শুধু Admin, দীর্ঘ সময় লাগতে পারে) ============ */
router.post("/olts/:id/check", adminOnly, withId((id, req, res, next) =>
    call(res, next, oltRouter, { method: "POST", url: `/${id}/check`, body: {}, csrf: true }, LONG_MS)));

router.post("/olts/:id/sync/customers", adminOnly, withId((id, req, res, next) =>
    call(res, next, oltRouter, { method: "POST", url: `/${id}/sync/customers`,
        body: { dry_run: BOOL(req.body && req.body.dry_run) }, csrf: true }, LONG_MS)));

router.post("/olts/:id/sync/onu", adminOnly, withId((id, req, res, next) =>
    call(res, next, oltRouter, { method: "POST", url: `/${id}/sync/onu`, body: {}, csrf: true }, LONG_MS)));

router.post("/olts/:id/auto-map", adminOnly, withId((id, req, res, next) =>
    call(res, next, oltRouter, { method: "POST", url: `/${id}/auto-map`,
        body: { dry_run: BOOL(req.body && req.body.dry_run) }, csrf: true }, LONG_MS)));

/* ONU ↔ Customer */
router.post("/olts/:id/onus/:onuId/customer", adminOnly, withId((id, req, res, next) => {
    const onuId = intId(req.params.onuId);
    const customerId = intId(req.body && req.body.customer_id);
    if (!onuId || !customerId) return bad(res, "ভুল ONU বা গ্রাহক ID।");
    return call(res, next, oltRouter, { method: "POST", url: `/${id}/onus/${onuId}/customer`,
        body: { customer_id: customerId }, csrf: true });
}));

router.delete("/olts/:id/onus/:onuId/customer", adminOnly, withId((id, req, res, next) => {
    const onuId = intId(req.params.onuId);
    if (!onuId) return bad(res, "ভুল ONU ID।");
    return call(res, next, oltRouter, { method: "DELETE", url: `/${id}/onus/${onuId}/customer`, body: {}, csrf: true });
}));

/* ============ OLT মনিটর ============ */
router.get("/olt-monitor/dashboard", (req, res, next) => {
    const q = {};
    if (req.query.olt_id !== undefined && req.query.olt_id !== "") {
        const id = intId(req.query.olt_id);
        if (!id) return bad(res, "ভুল olt_id।");
        q.olt_id = String(id);
    }
    return call(res, next, oltMonitorRouter, { url: "/dashboard", query: q }, LONG_MS);
});

router.get("/olt-monitor/live", (req, res, next) => {
    const id = intId(req.query.olt_id);
    if (!id) return bad(res, "ভুল olt_id।");
    const q = { olt_id: String(id) };
    if (String(req.query.refresh) === "1") q.refresh = "1";
    return call(res, next, oltMonitorRouter, { url: "/live", query: q }, LONG_MS);
});

/* ============ Activity Log (শুধু পড়া; Web-এর Role/Company-scope হুবহু) ============ */
router.get("/activity-log", (req, res, next) => {
    const q = {};
    const page = parseInt(req.query.page, 10); if (page > 0) q.page = String(Math.min(page, 10000));
    const limit = parseInt(req.query.limit, 10); if (limit > 0) q.limit = String(Math.min(limit, 100));
    const search = clean(req.query.search, 100); if (search) q.search = search;
    for (const k of ["from_date", "to_date"]) {
        const v = clean(req.query[k], 10); if (v && DATE.test(v)) q[k] = v;
    }
    return call(res, next, activityRouter, { url: "/api", query: q });
});

module.exports = router;
module.exports._test = { scrub, oltBody };
