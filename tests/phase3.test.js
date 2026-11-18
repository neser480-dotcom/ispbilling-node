"use strict";
/* node test/phase3.test.js — Software Billing gate, Admin customers, Super Admin API (Mock DB; কিছু লেখে না) */
const assert = require("assert");
const Module = require("module");
const fs = require("fs");
const path = require("path");

/* ---------- mocks ---------- */
const dbCalls = [];
let dbHandler = () => [[]];
const fakeDb = { execute: async (sql, params) => { dbCalls.push({ sql: sql.replace(/\s+/g, " ").trim(), params }); return dbHandler(sql, params); } };

function makeRouter() {
    const r = { routes: [], mws: [] };
    for (const m of ["get", "post", "put", "delete"]) {
        r[m] = (p, ...h) => { r.routes.push({ method: m, path: p, handlers: h }); return r; };
    }
    r.use = (...h) => { r.mws.push(h); return r; };
    return r;
}
let pricingMock = null;

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === "express") return { Router: makeRouter };
    if (/config\/database$/.test(request)) return fakeDb;
    if (/middleware\/mobileAuth$/.test(request)) {
        return {
            requireMobilePermission: (key) => Object.assign((req, res, next) => next(), { permKey: key }),
            scopeCompanyId: (req) => {
                if (!req.auth.isSuperAdmin) return req.auth.companyId;
                const q = Number(req.query?.company_id || req.body?.company_id || 0);
                return Number.isInteger(q) && q > 0 ? q : null;
            }
        };
    }
    if (/services\/billing\/pricing\.service$/.test(request)) {
        if (!pricingMock) { const e = new Error("Cannot find module"); e.code = "MODULE_NOT_FOUND"; throw e; }
        return pricingMock;
    }
    return origLoad.apply(this, arguments);
};

const mkRes = () => {
    const res = { statusCode: 200, body: undefined };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
};
const call = async (handlers, req) => {
    const res = mkRes(); let nextCalled = false; let nextErr;
    const run = async (i) => {
        if (i >= handlers.length) return;
        await handlers[i](req, res, (err) => { if (err) nextErr = err; else { nextCalled = true; return run(i + 1); } });
    };
    await run(0);
    return { res, nextCalled, nextErr };
};
const find = (router, method, p) => router.routes.find((r) => r.method === method && r.path === p);

(async () => {
    let n = 0; const ok = (m) => console.log("  ✓", m, ++n);
    const unix = (msAgo) => Math.floor((Date.now() - msAgo) / 1000);

    /* ================= Software Billing gate ================= */
    const gate = require("../middleware/mobileSoftwareBilling");
    const mw = gate.requireMobileSoftwareBilling();
    const ispAdmin = { type: "admin", userId: 33, companyId: 33, role: "admin", isSuperAdmin: false };

    /* Super Admin: DB ছোঁয়া নয় */
    dbCalls.length = 0;
    let r = await call([mw], { auth: { type: "admin", userId: 1, companyId: 1, role: "super_admin", isSuperAdmin: true } });
    assert(r.nextCalled && dbCalls.length === 0); ok("super admin passes gate without DB");

    /* কোনো unpaid বিল নেই */
    dbHandler = () => [[]];
    r = await call([mw], { auth: ispAdmin });
    assert(r.nextCalled); ok("no unpaid bill -> allowed");

    /* Registration trial চলছে (১ ঘণ্টা আগে তৈরি) */
    dbHandler = () => [[{ id: 5, company_id: 33, user_id: 33, billing_type: "registration", amount: "2000.00", status: "unpaid", due_date: null, created_at: new Date(), created_at_unix: unix(3600e3) }]];
    r = await call([mw], { auth: ispAdmin, });
    assert(r.nextCalled && r.res.statusCode === 200); ok("registration trial active -> allowed");

    /* Registration trial শেষ (৫ ঘণ্টা) -> ৪০২ */
    dbHandler = () => [[{ id: 5, company_id: 33, user_id: 33, billing_type: "registration", amount: "2000.00", status: "unpaid", due_date: null, created_at: new Date(Date.now() - 5 * 3600e3), created_at_unix: unix(5 * 3600e3) }]];
    r = await call([mw], { auth: ispAdmin });
    assert(!r.nextCalled && r.res.statusCode === 402);
    assert.strictEqual(r.res.body.code, "BILLING_REQUIRED");
    assert.strictEqual(r.res.body.billing_id, 5);
    assert.strictEqual(r.res.body.amount, 2000);
    assert.strictEqual(r.res.body.trial_expired, true); ok("trial expired -> 402 BILLING_REQUIRED with billing_id & amount");

    /* Monthly: মেয়াদ আছে / নোটিশ / মেয়াদোত্তীর্ণ */
    const monthly = (days) => [[{ id: 9, company_id: 33, user_id: 33, billing_type: "monthly", amount: "6500.00", status: "unpaid", due_date: new Date(Date.now() + days * 86400e3), created_at: new Date(), created_at_unix: unix(86400e3) }]];
    dbHandler = () => monthly(20);
    r = await call([mw], { auth: ispAdmin });
    assert(r.nextCalled && r.nextErr === undefined); ok("monthly due in 20 days -> allowed");
    dbHandler = () => monthly(3);
    r = await call([mw], { auth: ispAdmin });
    assert(r.nextCalled); ok("monthly due in 3 days -> still allowed (notice only)");
    dbHandler = () => monthly(-1);
    r = await call([mw], { auth: ispAdmin });
    assert(!r.nextCalled && r.res.statusCode === 402 && r.res.body.monthly_expired === true && r.res.body.amount === 6500); ok("monthly overdue -> 402 with amount");

    /* DB ত্রুটি -> next(err) , খোলা নয় */
    dbHandler = () => { throw new Error("db down"); };
    r = await call([mw], { auth: ispAdmin });
    assert(!r.nextCalled && r.nextErr && /db down/.test(r.nextErr.message)); ok("DB error is not treated as paid (fails closed)");

    /* company_id ছাড়া ব্যবহারকারী -> বিল নেই ধরা হয় (Web-এর নিয়ম); কিন্তু Query-তে user+company দুটোই থাকে */
    dbCalls.length = 0; dbHandler = () => [[]];
    await call([mw], { auth: ispAdmin });
    assert(/user_id = \? AND company_id = \?/.test(dbCalls[0].sql) && dbCalls[0].params[0] === 33 && dbCalls[0].params[1] === 33); ok("gate query scoped by user_id AND company_id");

    /* billing-status endpoint: ডেটা + super admin */
    dbHandler = () => monthly(3);
    let res = mkRes(); await gate.billingStatus({ auth: ispAdmin }, res, () => {});
    assert(res.body.success && res.body.billing.amount === 6500 && res.body.monthly_notice === true && res.body.required === false); ok("billing-status returns notice state");
    res = mkRes(); await gate.billingStatus({ auth: { isSuperAdmin: true } }, res, () => {});
    assert(res.body.success && res.body.billing === null); ok("billing-status for super admin");

    /* admin.js ওয়্যারিং (স্ট্যাটিক): status গেটের আগে, গেট অন্য রাউটের আগে, নতুন mount আছে */
    const src = fs.readFileSync(path.join(__dirname, "..", "routes/mobile/admin.js"), "utf8");
    const iBearer = src.indexOf('router.use(requireBearer("admin"))');
    const iStatus = src.indexOf('router.get("/billing-status"');
    const iGate = src.indexOf("router.use(requireMobileSoftwareBilling())");
    const iFirstRoute = src.indexOf('router.post("/customers/:id/mobile-account"');
    assert(iBearer > 0 && iStatus > iBearer && iGate > iStatus && iFirstRoute > iGate); ok("admin.js: bearer -> billing-status -> gate -> all other routes");
    assert(src.includes('router.use("/customers", require("./adminCustomers"))') && src.includes('router.use("/super", require("./adminSuper"))')); ok("admin.js mounts customers & super");

    /* ================= Admin customers ================= */
    const cust = require("../routes/mobile/adminCustomers");
    const list = find(cust, "get", "/"); const det = find(cust, "get", "/:id");
    assert(list.handlers[0].permKey === "customer_list" && det.handlers[0].permKey === "customer_list"); ok("customers routes require customer_list");

    const crow = { id: 7, company_id: 33, customer_id: "C-7", name: "রহিম", phone: "017", address: "A", package_name: "10Mbps", monthly_bill: "500.00", balance: "-200.00", status: "Active", payment_status: "Unpaid", promise_date: null, connection_date: "2026-01-02" };
    dbCalls.length = 0;
    dbHandler = (sql) => /COUNT\(\*\)/.test(sql) ? [[{ total: 1 }]] : [[crow]];
    r = await call(list.handlers, { auth: ispAdmin, query: { search: "100%_x", status: "Active", page: "2", limit: "500" } });
    assert.strictEqual(r.res.body.total, 1); assert.strictEqual(r.res.body.items[0].balance, -200);
    assert.strictEqual(r.res.body.items[0].customer_code, "C-7");
    const q = dbCalls[1];
    assert(/company_id = \?/.test(q.sql) && q.params[0] === 33); ok("list scoped to own company");
    assert(q.params.includes("%100\\%\\_x%")); ok("LIKE wildcards escaped");
    assert(/LIMIT 100 OFFSET 100/.test(q.sql)); ok("limit capped at 100, offset from page");
    assert(!/'Active'|C-7|রহিম/.test(q.sql) && q.params.includes("Active")); ok("filters parameterised (no SQL injection)");

    /* company_id query ISP admin-কে অন্য Company দেখায় না */
    dbCalls.length = 0;
    await call(list.handlers, { auth: ispAdmin, query: { company_id: "99" } });
    assert(dbCalls[1].params[0] === 33 && !dbCalls[1].params.includes(99)); ok("ISP admin cannot override company_id");

    /* super admin: ফিল্টার ছাড়া সব; company_id দিলে সেটি */
    dbCalls.length = 0;
    await call(list.handlers, { auth: { type: "admin", isSuperAdmin: true, companyId: 1 }, query: {} });
    assert(!/company_id = \?/.test(dbCalls[1].sql)); ok("super admin sees all companies by default");
    dbCalls.length = 0;
    await call(list.handlers, { auth: { type: "admin", isSuperAdmin: true, companyId: 1 }, query: { company_id: "34" } });
    assert(/company_id = \?/.test(dbCalls[1].sql) && dbCalls[1].params[0] === 34); ok("super admin can pick a company");

    /* detail */
    r = await call(det.handlers, { auth: ispAdmin, params: { id: "abc" } });
    assert(r.res.statusCode === 400); ok("detail: bad id -> 400");
    dbHandler = () => [[]];
    r = await call(det.handlers, { auth: ispAdmin, params: { id: "7" }, query: {} });
    assert(r.res.statusCode === 404); ok("detail: other company's / missing -> 404");
    dbCalls.length = 0;
    dbHandler = (sql) => /FROM payments/.test(sql) ? [[{ amount: "500.00", billing_month: 11, billing_year: 2026, payment_date: "2026-11-05", payment_method: "Cash" }]] : [[crow]];
    r = await call(det.handlers, { auth: ispAdmin, params: { id: "7" }, query: {} });
    assert(r.res.body.payments[0].month === "2026-11" && r.res.body.payments[0].amount === 500);
    assert(/id = \? AND deleted_at IS NULL AND company_id = \?/.test(dbCalls[0].sql) && dbCalls[0].params.join() === "7,33"); ok("detail scoped by id+company, includes payments");
    assert(dbCalls[1].params.join() === "7,33"); ok("payments query scoped by customer+company");

    /* ================= Super Admin ================= */
    const sup = require("../routes/mobile/adminSuper");
    const guard = sup.mws[0][0];
    r = await call([guard], { auth: ispAdmin });
    assert(r.res.statusCode === 403 && !r.nextCalled); ok("super routes: ISP admin -> 403");
    r = await call([guard], { auth: { type: "customer" } });
    assert(r.res.statusCode === 403); ok("super routes: customer token -> 403");
    r = await call([guard], { auth: { type: "admin", isSuperAdmin: true } });
    assert(r.nextCalled); ok("super routes: super admin allowed");

    const sbl = find(sup, "get", "/software-billing");
    dbCalls.length = 0;
    dbHandler = (sql) => {
        if (/COUNT\(\*\) AS total/.test(sql)) return [[{ total: 2 }]];
        if (/GROUP BY status/.test(sql)) return [[{ status: "unpaid", c: 3, s: "9000.00" }, { status: "paid", c: 5, s: "20000.00" }]];
        return [[{ id: 1, company_id: 33, billing_type: "monthly", package_code: "P12", amount: "9000.00", status: "unpaid", billing_period: "2026-11", due_date: "2026-11-07 23:59:59", paid_at: null, created_at: "2026-10-31 00:00:00", company_name: "আযহার", owner_name: "o", mobile: "01", username: "u" }]];
    };
    r = await call(sbl.handlers, { auth: { isSuperAdmin: true, type: "admin" }, query: { status: "unpaid", type: "monthly", search: "আযহার" } });
    assert(r.res.body.summary.unpaid_amount === 9000 && r.res.body.summary.paid_count === 5 && r.res.body.items[0].amount === 9000); ok("software-billing list + summary");
    assert(dbCalls[0].params[0] === "unpaid" && dbCalls[0].params[1] === "monthly"); ok("status/type filters parameterised");
    dbCalls.length = 0;
    await call(sbl.handlers, { auth: { isSuperAdmin: true, type: "admin" }, query: { status: "x'; DROP TABLE users;--", type: "bogus" } });
    assert(!dbCalls[0].params.some((p) => /DROP/.test(String(p)))); ok("invalid status/type ignored");

    /* Pricing: service নেই -> ৫০১ */
    pricingMock = null;
    const pc = find(sup, "get", "/pricing/companies");
    r = await call(pc.handlers, { auth: { isSuperAdmin: true, type: "admin" }, query: {} });
    assert(r.res.statusCode === 501 && r.res.body.code === "PRICING_NOT_INSTALLED"); ok("pricing endpoints return 501 if service missing (rest unaffected)");

    /* Pricing: service আছে */
    const saved = [];
    class PErr extends Error { constructor(m, c) { super(m); this.httpCode = c; } }
    pricingMock = {
        listCompanies: async (s) => [{ company_id: 33, s }],
        getCompanyDetail: async (id) => ({ company: { company_id: Number(id) }, history: [] }),
        saveRule: async (input, actor) => { saved.push({ input, actor }); if (input.value === "bad") throw new PErr("Discount বেশি", 400); if (input.value === "boom") throw new Error("db"); },
        setEnabled: async (i, a) => { saved.push({ i, a }); },
        resetRule: async (i, a) => { saved.push({ i, a }); }
    };
    r = await call(pc.handlers, { auth: { isSuperAdmin: true, type: "admin" }, query: { search: "x" } });
    assert(r.res.body.companies[0].s === "x"); ok("pricing list delegates to service");

    const sv = find(sup, "post", "/pricing/companies/:id/rules");
    const authSA = { isSuperAdmin: true, type: "admin", userId: 1, companyId: 1, role: "super_admin", fullname: "SA", username: "sa" };
    r = await call(sv.handlers, { auth: authSA, params: { id: "33" }, body: { fee_type: "monthly", mode: "special_price", value: "6500", is_enabled: true, starts_at: "2026-11-18", expires_at: "2027-01-01", note: "n" }, ip: "1.2.3.4" });
    assert(r.res.body.success && r.res.body.company.company_id === 33);
    const s0 = saved[saved.length - 1];
    assert(s0.input.companyId === "33" && s0.input.feeType === "monthly" && s0.input.startsAt === "2026-11-18" && s0.actor.userId === 1 && s0.actor.name === "SA" && s0.actor.ip === "1.2.3.4"); ok("save maps body & actor (audit identity from token, not body)");
    r = await call(sv.handlers, { auth: authSA, params: { id: "33" }, body: { value: "bad" } });
    assert(r.res.statusCode === 400 && r.res.body.code === "REJECTED" && /Discount/.test(r.res.body.message)); ok("service validation error -> 400 with message");
    r = await call(sv.handlers, { auth: authSA, params: { id: "33" }, body: { value: "boom" } });
    assert(r.nextErr && /db/.test(r.nextErr.message) && r.res.statusCode === 200 && r.res.body === undefined); ok("unexpected error -> next(err) (no leak)");

    const tg = find(sup, "post", "/pricing/companies/:id/rules/:feeType/toggle");
    r = await call(tg.handlers, { auth: authSA, params: { id: "33", feeType: "monthly" }, body: { enabled: false } });
    assert(r.res.body.success && saved[saved.length - 1].i.feeType === "monthly" && saved[saved.length - 1].i.enabled === false); ok("toggle delegates");
    const rs = find(sup, "post", "/pricing/companies/:id/rules/:feeType/reset");
    r = await call(rs.handlers, { auth: authSA, params: { id: "33", feeType: "monthly" }, body: {} });
    assert(r.res.body.success); ok("reset delegates");

    Module._load = origLoad;
    console.log(`\nALL ${n} CHECKS PASSED`);
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
