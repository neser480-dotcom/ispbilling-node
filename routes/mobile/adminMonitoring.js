"use strict";
/*
| routes/mobile/adminMonitoring.js   (mount: /api/mobile/admin)
| Active PPPoE, Network Fault, Interface Monitor, Customer Traffic —
| বিদ্যমান Web Handler ভেতর থেকে পুনঃব্যবহার (Company-scope ও লজিক Web-এর সার্ভিসেই থাকে)।
|
| Web-এ এই চারটি পেজে আলাদা Permission key নেই (শুধু লগইন + Billing-গেট), তাই পড়ার endpoint-ও তা-ই।
| মোবাইল-স্তরের অতিরিক্ত সুরক্ষা:
|  • Ping / Remove (রাউটারে লেখার/কমান্ড চালানোর কাজ) শুধু admin/super_admin।
|  • সব ইনপুট whitelist (সংখ্যা, মাস, ইন্টারফেস নাম, MAC, IP)।
|
| ⚠ scrub সিদ্ধান্ত (adminStaffReports.js থেকে ভিন্ন):
|  সেখানে /pppoe/ নামের সব ফিল্ড মুছে ফেলা হয়। এখানে মুছি না, কারণ Active PPPoE-তে Admin-এর
|  PPPoE *username* (লগইন নাম, গোপন নয়), IP, MAC, uptime দেখা প্রয়োজন; Web-ও তা দেখায়।
|  তবুও password/secret/token/hash/api-key/private/nid নামের কোনো ফিল্ড কখনো যাবে না।
|  রাউটারের ip/port/username/password/use_ssl/timeout কখনো মোবাইলে যায় না — শুধু {id, name}।
*/
const express = require("express");
const { requireBearer } = require("../../middleware/mobileAuth");
const { invokeRouter } = require("../../services/mobile/webBridge");

const activeRouter = require("../customers/activeCustomerRoutes");
const monitoringRouter = require("../monitoring/monitoring");
const interfaceRouter = require("../monitoring/interfaceMonitor");
const trafficRouter = require("../monitoring/customerTraffic");

const router = express.Router();
router.use(requireBearer("admin"));

/* ---------------- সহায়ক ---------------- */
const SENSITIVE = /pass(word)?|token|secret|hash|salt|csrf|api[_-]?key|private|^nid/i;
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
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const IFACE = /^[A-Za-z0-9_.\-\/ :@]{1,64}$/;
const PON = /^[A-Za-z0-9_.\-\/: ]{1,40}$/;
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const MAC = /^([0-9A-Fa-f]{2}[:\-]?){5}[0-9A-Fa-f]{2}$/;
const ACTIVE_ID = /^\*[0-9A-Fa-f]{1,12}$/;

/* রাউটার তালিকা: শুধু {id, name} */
const slimRouters = (list) => Array.isArray(list)
    ? list.map((r) => ({ id: r.id, name: r.name })) : [];
const slimRouter = (r) => (r && typeof r === "object") ? { id: r.id, name: r.name } : r;

async function bridge(res, next, target, opts, timeoutMs, transform) {
    try {
        const r = await invokeRouter(target, res.req, opts, timeoutMs);
        let body = r.body;
        if (body && typeof body === "object") {
            body = scrub(body);
            if (transform && r.status >= 200 && r.status < 300) body = transform(body);
        }
        res.status(r.status || 502).json(body || { success: false, message: "ব্যর্থ হয়েছে।" });
    } catch (e) { next(e); }
}

/* =====================================================================
   Active PPPoE        base: /monitoring/active-pppoe
===================================================================== */
router.get("/monitoring/active-pppoe/routers", (req, res, next) =>
    bridge(res, next, activeRouter, { url: "/api/routers" }, 20000,
        (b) => ({ ...b, data: slimRouters(b.data) })));

const ACTIVE_FIELDS = ["id", "customer_id", "username", "customer_name", "address", "caller_id", "package",
    "download_mbps", "upload_mbps", "download_display", "upload_display", "download_gb", "upload_gb",
    "uptime", "login_time", "logout_time", "status", "customer_status", "interface", ".id"];

/*
| GET ?router_id&package&area&sub_area&connection_status(all|active|offline)
|     &search&page(=1)&limit(=50, সর্বোচ্চ 200)
| Web পুরো তালিকা দেয়; মোবাইলে সার্ভার-সাইড search + পেজিনেশন + হালকা ফিল্ড।
| total/active/offline = Web-এর সম্পূর্ণ গণনা (search-এর আগে); matched = search-এর পরে।
*/
router.get("/monitoring/active-pppoe", (req, res, next) => {
    const routerId = intId(req.query.router_id);
    if (!routerId) return bad(res, "রাউটার নির্বাচন করুন।");
    const q = { router_id: String(routerId) };
    const pkg = clean(req.query.package, 100); if (pkg) q.package = pkg;
    const area = clean(req.query.area, 50); if (area) q.area = area;
    const sub = clean(req.query.sub_area, 50); if (sub) q.sub_area = sub;
    const cs = clean(req.query.connection_status, 10).toLowerCase();
    q.connection_status = ["all", "active", "offline"].includes(cs) ? cs : "all";

    const search = clean(req.query.search, 60).toLowerCase();
    const page = Math.max(1, Math.min(parseInt(req.query.page, 10) || 1, 10000));
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 50, 200));

    return bridge(res, next, activeRouter, { url: "/api/data", query: q }, 60000, (b) => {
        let rows = Array.isArray(b.data) ? b.data : [];
        if (search) {
            rows = rows.filter((r) => [r.username, r.customer_name, r.customer_id, r.id, r.address, r.caller_id]
                .some((x) => String(x ?? "").toLowerCase().includes(search)));
        }
        const matched = rows.length;
        const slice = rows.slice((page - 1) * limit, page * limit).map((r) => {
            const o = {};
            for (const k of ACTIVE_FIELDS) if (k in r) o[k] = r[k];
            return o;
        });
        return {
            success: b.success, router: slimRouter(b.router),
            total: b.total, active: b.active, offline: b.offline,
            matched, page, limit, total_pages: Math.max(1, Math.ceil(matched / limit)),
            data: slice
        };
    });
});

/* Ping: শুধু Admin; শুধু IPv4 */
router.post("/monitoring/active-pppoe/ping", adminOnly, (req, res, next) => {
    const routerId = intId(req.body?.router_id);
    const address = clean(req.body?.address, 15);
    if (!routerId) return bad(res, "রাউটার নির্বাচন করুন।");
    if (!IPV4.test(address) || address.split(".").some((n) => Number(n) > 255)) return bad(res, "ভুল IP ঠিকানা।");
    return bridge(res, next, activeRouter, {
        method: "POST", url: "/api/ping", body: { router_id: routerId, address }, csrf: true }, 30000);
});

/* Remove (সংযোগ বিচ্ছিন্ন): শুধু Admin; active_id = MikroTik ".id" (যেমন *1A) */
router.post("/monitoring/active-pppoe/remove", adminOnly, (req, res, next) => {
    const routerId = intId(req.body?.router_id);
    const activeId = clean(req.body?.active_id, 14);
    if (!routerId) return bad(res, "রাউটার নির্বাচন করুন।");
    if (!ACTIVE_ID.test(activeId)) return bad(res, "ভুল সংযোগ ID।");
    return bridge(res, next, activeRouter, {
        method: "POST", url: "/api/remove", body: { router_id: routerId, active_id: activeId }, csrf: true }, 20000);
});

router.get("/monitoring/active-pppoe/mac-vendor", (req, res, next) => {
    const mac = clean(req.query.mac, 17);
    if (!MAC.test(mac)) return bad(res, "ভুল MAC।");
    return bridge(res, next, activeRouter, { url: "/api/mac-vendor", query: { mac } }, 15000);
});

/* =====================================================================
   Network Fault (Live Fault)     base: /monitoring/faults, /monitoring/fault-details
===================================================================== */
/* GET ?page&limit&search&severity(critical|warning) */
router.get("/monitoring/faults", (req, res, next) => {
    const q = {};
    const page = parseInt(req.query.page, 10); if (page > 0) q.page = String(Math.min(page, 10000));
    const limit = parseInt(req.query.limit, 10); if (limit > 0) q.limit = String(Math.min(limit, 100));
    const search = clean(req.query.search, 60); if (search) q.search = search;
    const sev = clean(req.query.severity, 10).toLowerCase();
    if (["critical", "warning"].includes(sev)) q.severity = sev;
    return bridge(res, next, monitoringRouter, { url: "/faults", query: q }, 30000);
});

/* GET ?olt_id&pon */
router.get("/monitoring/fault-details", (req, res, next) => {
    const oltId = intId(req.query.olt_id);
    const pon = clean(req.query.pon, 40);
    if (!oltId || !PON.test(pon)) return bad(res, "olt_id ও pon দিন।");
    return bridge(res, next, monitoringRouter, {
        url: "/fault-details/api", query: { olt_id: String(oltId), pon } }, 30000);
});

/* =====================================================================
   Interface Monitor     base: /monitoring/interface
===================================================================== */
/* GET ?id(router) -> { success, routers[{id,name}], router?, ethernet_interfaces[], vlan_interfaces[] } */
router.get("/monitoring/interface", (req, res, next) => {
    const id = intId(req.query.id);
    return bridge(res, next, interfaceRouter, { url: "/data", query: id ? { id: String(id) } : {} }, 40000,
        (b) => ({ ...b, routers: slimRouters(b.routers), router: slimRouter(b.router) }));
});

/* GET ?id(router)&interface(name) -> এক-সেকেন্ডের ডাউনলোড/আপলোড Mbps */
router.get("/monitoring/interface/bandwidth", (req, res, next) => {
    const id = intId(req.query.id);
    const iface = clean(req.query.interface, 64);
    if (!id) return bad(res, "রাউটার নির্বাচন করুন।");
    if (!IFACE.test(iface) || iface.includes("<") || /pppoe/i.test(iface)) return bad(res, "ভুল ইন্টারফেস নাম।");
    return bridge(res, next, interfaceRouter, {
        url: "/bandwidth", query: { id: String(id), interface: iface } }, 30000,
        (b) => ({ ...b, router: slimRouter(b.router) }));
});

/* =====================================================================
   Customer Traffic     base: /monitoring/customer-traffic
===================================================================== */
/* GET live ?id(router) -> { routers, router, customers[], totals, chart[], lastUpdate } */
router.get("/monitoring/customer-traffic/live", (req, res, next) => {
    const id = intId(req.query.id);
    return bridge(res, next, trafficRouter, { url: "/live", query: id ? { id: String(id) } : {} }, 60000,
        (b) => ({ ...b, routers: slimRouters(b.routers), router: slimRouter(b.router) }));
});

/* GET monthly ?month=YYYY-MM -> { month, days, totals, customers[] } */
router.get("/monitoring/customer-traffic/monthly", (req, res, next) => {
    const month = clean(req.query.month, 7);
    if (month && !MONTH.test(month)) return bad(res, "মাস YYYY-MM ফরম্যাটে দিন।");
    return bridge(res, next, trafficRouter, { url: "/monthly", query: month ? { month } : {} }, 30000);
});

module.exports = router;
