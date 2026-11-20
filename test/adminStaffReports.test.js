"use strict";
/* node test/adminStaffReports.test.js — Mock; কিছু লেখে না */
const assert = require("assert");
const Module = require("module");

const routes = {};
function FakeRouter() {
    const r = { use() { return r; } };
    for (const m of ["get", "post", "put", "delete"]) r[m] = (p, ...hs) => { routes[`${m.toUpperCase()} ${p}`] = hs; return r; };
    return r;
}
let calls = [], reply = () => ({ status: 200, body: { success: true } });
const permCalls = [];
const orig = Module._load;
Module._load = function (request, parent, ...rest) {
    if (request === "express") return { Router: FakeRouter };
    if (request.endsWith("middleware/mobileAuth")) return {
        requireBearer: () => (q, s, n) => n(),
        requireMobilePermission: (key) => { const f = (q, s, n) => { permCalls.push(key); return q.auth.hasFullAccess || (q.auth.perms || []).includes(key) ? n() : s.status(403).json({ success: false, code: "FORBIDDEN" }); }; return f; }
    };
    if (request.endsWith("services/mobile/webBridge")) return { invokeRouter: async (t, req, o) => { calls.push(o); return reply(o); } };
    if (/\.\.\/(staff\/collector\/collector\.routes|staff\/manager\/manager\.routes|reports\/reports|billing\/expenditure\.routes)$/.test(request)) return function fake() {};
    return orig.call(this, request, parent, ...rest);
};
const mod = require("../routes/mobile/adminStaffReports");
const { scrub, listQuery } = mod._test;

const mkRes = (req) => { const r = { req, code: 200, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
async function hit(key, req) {
    const res = mkRes(req); let nexted = false, err;
    for (const h of routes[key]) { nexted = false; await h(req, res, (e) => { if (e) err = e; nexted = true; }); if (!nexted) break; }
    if (err) throw err; return res;
}
const A = (o = {}) => ({ auth: { type: "admin", hasFullAccess: true, isSuperAdmin: false, perms: [], ...o }, query: {}, params: {}, body: {} });
const STAFF = (perms = []) => A({ hasFullAccess: false, perms });

(async () => {
    let n = 0; const ok = (m) => console.log("  ✓", m, ++n);

    /* scrub */
    const s = scrub({ ok: 1, password: "x", nested: { api_key: "k", name: "A", list: [{ token: "t", v: 2 }] }, pppoe_password: "p", csrf_token: "c", salary: 5, payment_status: "paid" });
    assert.deepStrictEqual(s, { ok: 1, nested: { name: "A", list: [{ v: 2 }] }, salary: 5, payment_status: "paid" }); ok("scrub removes secrets, keeps salary/payment_status");
    assert.deepStrictEqual(scrub({ id: 1, pppoe_username: "u", nid_no: "123", name: "x" }), { id: 1, name: "x" }); ok("scrub removes pppoe_* and nid_*");

    /* listQuery whitelist */
    const q = listQuery({ page: "3", limit: "9999", search: "a\u0000b", from_date: "2026-11-01", to_date: "bad'; DROP", from_dt: "2026-11-01 10:00", evil: "1", tab: "x".repeat(99) }, ["tab"]);
    assert.strictEqual(q.limit, "100"); assert.strictEqual(q.search, "ab"); assert.strictEqual(q.from_date, "2026-11-01");
    assert.strictEqual(q.to_date, undefined); assert.strictEqual(q.evil, undefined); assert.strictEqual(q.tab.length, 30); ok("query whitelist: caps, dates validated, unknown dropped");

    /* collectors/managers: admin only */
    for (const base of ["collectors", "managers"]) {
        let r = await hit(`GET /${base}`, STAFF(["customer_list"])); assert.strictEqual(r.code, 403);
        r = await hit(`POST /${base}`, STAFF()); assert.strictEqual(r.code, 403);
        r = await hit(`PUT /${base}/:id`, { ...STAFF(), params: { id: "1" } }); assert.strictEqual(r.code, 403);
        r = await hit(`DELETE /${base}/:id`, { ...STAFF(), params: { id: "1" } }); assert.strictEqual(r.code, 403);
        r = await hit(`PUT /${base}/:id/password`, { ...STAFF(), params: { id: "1" } }); assert.strictEqual(r.code, 403);
    } ok("non-admin blocked on every collector/manager route");

    calls = []; reply = () => ({ status: 200, body: { success: true, data: [{ id: 1, name: "C", password_hash: "h" }] } });
    let r = await hit("GET /collectors", { ...A(), query: { page: "2", search: "ra" } });
    assert.strictEqual(r.code, 200); assert.strictEqual(calls[0].url, "/data"); assert(!JSON.stringify(r.body).includes("password")); ok("admin lists collectors; secrets scrubbed");
    r = await hit("GET /collectors/:id/balance", { ...A(), params: { id: "7" } }); assert.strictEqual(calls.at(-1).url, "/7/balance"); ok("collector balance routed");
    r = await hit("GET /managers/:id/profile", { ...A(), params: { id: "7" } }); assert.strictEqual(calls.at(-1).url, "/7/profile"); ok("manager profile routed");
    r = await hit("PUT /collectors/:id", { ...A(), params: { id: "7" }, body: { name: "N" } });
    assert.strictEqual(calls.at(-1).method, "PUT"); assert.strictEqual(calls.at(-1).csrf, true); assert.deepStrictEqual(calls.at(-1).body, { name: "N" }); ok("update passes body + internal csrf");
    r = await hit("PUT /collectors/:id/password", { ...A(), params: { id: "7" }, body: { password: "new" } });
    assert.strictEqual(calls.at(-1).url, "/7/password"); ok("password reset routed");
    for (const bad of ["abc", "0", "-3", "1.5", "7/../8"]) {
        const x = await hit("DELETE /collectors/:id", { ...A(), params: { id: bad } }); assert.strictEqual(x.code, 400);
    } ok("bad :id rejected (path injection safe)");
    const before = calls.length;
    r = await hit("DELETE /managers/:id", { ...A(), params: { id: "3" } });
    assert.strictEqual(calls.at(-1).method, "DELETE"); assert.strictEqual(calls.length, before + 1); ok("admin delete routed");

    /* reports parity + params */
    calls = []; reply = () => ({ status: 200, body: { status: true, collections: [] } });
    r = await hit("GET /reports/collection", { ...STAFF(), query: { from_date: "2026-11-01", to_date: "2026-11-30", page: "1" } });
    assert.strictEqual(r.code, 200); assert.strictEqual(calls[0].url, "/api/collection"); assert.strictEqual(calls[0].query.from_date, "2026-11-01"); ok("reports follow Web parity (staff allowed), params passed");
    r = await hit("GET /reports/collector-deposit", { ...A(), query: { tab: "pending", collector_id: "5" } });
    assert.strictEqual(calls.at(-1).query.collector_id, "5"); ok("collector-deposit params passed");
    r = await hit("GET /reports/deposit", A()); assert.strictEqual(calls.at(-1).url, "/api/deposit"); ok("deposit routed");

    /* expenditure */
    calls = []; reply = () => ({ status: 200, body: { success: true, types: [] } });
    r = await hit("GET /expenditures", { ...STAFF(), query: { date_from: "2026-11-01", date_to: "x'--", filter: "1", name: "rent" } });
    assert.strictEqual(calls[0].url, "/api/data"); assert.deepStrictEqual(calls[0].query, { date_from: "2026-11-01", filter: "1", name: "rent" }); ok("staff can view expenditures; filters whitelisted");
    for (const [k, p] of [["POST /expenditures", {}], ["PUT /expenditures/:id", { params: { id: "1" } }], ["POST /expenditure-types", {}], ["PUT /expenditure-types/:id", { params: { id: "1" } }], ["DELETE /expenditure-types/:id", { params: { id: "1" } }]]) {
        const x = await hit(k, { ...STAFF(["expenditure_delete"]), ...p }); assert.strictEqual(x.code, 403, k);
    } ok("expenditure add/edit/types admin-only");
    r = await hit("DELETE /expenditures/:id", { ...STAFF(), params: { id: "1" } }); assert.strictEqual(r.code, 403); ok("delete blocked without expenditure_delete");
    calls = [];
    r = await hit("DELETE /expenditures/:id", { ...STAFF(["expenditure_delete"]), params: { id: "9" } });
    assert.strictEqual(r.code, 200); assert.strictEqual(calls[0].url, "/api/expenditures/9"); assert.strictEqual(calls[0].csrf, true); ok("delete allowed with expenditure_delete");
    r = await hit("POST /expenditures", { ...A(), body: { amount: 100 } });
    assert.strictEqual(calls.at(-1).method, "POST"); assert.deepStrictEqual(calls.at(-1).body, { amount: 100 }); ok("admin add routed with body");

    /* web error passes through */
    reply = () => ({ status: 403, body: { success: false, message: "denied" } });
    r = await hit("GET /expenditures", A()); assert.strictEqual(r.code, 403); ok("Web handler denial passes through");

    console.log(`\nALL ${n} CHECKS PASSED`);
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
