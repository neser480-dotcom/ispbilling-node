"use strict";
/* node test/phase2.test.js — webBridge ও Dashboard mapping (Mock; কিছু লেখে না) */
const assert = require("assert");
const { invokeRouter } = require("../services/mobile/webBridge");
const { mapDashboard, MEDIUMS, MEDIUM_DB_NAME, emptySummary } = require("../services/mobile/adminMap");

(async () => {
    let n = 0; const ok = (m) => console.log("  ✓", m, ++n);

    /* Express 5-এর মতো getter-only query */
    const proto = { get query() { return { leaked: "x" }; } };
    const mobileReq = Object.create(proto);
    mobileReq.auth = { type: "admin", userId: 7, username: "u", fullname: "U", role: "staff", companyId: 33 };
    mobileReq.headers = {};

    /* Web router-এর মতো ফাংশন */
    const webRouter = (req, res, next) => {
        if (req.url !== "/data") return next();
        if (!req.session || !req.session.user_id) return res.status(401).json({ success: false });
        res.json({ ok: true, session: req.session, q: req.query, method: req.method, body: req.body });
    };

    let r = await invokeRouter(webRouter, mobileReq, { url: "/data", query: { month: "2026-11" } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.session.company_id, 33);
    assert.strictEqual(r.body.session.role, "staff");
    assert.deepStrictEqual(r.body.q, { month: "2026-11" }); ok("inner session & query set (getter-only safe)");
    assert.strictEqual(mobileReq.url, undefined);
    assert.deepStrictEqual(mobileReq.query, { leaked: "x" }); ok("original request not mutated");

    r = await invokeRouter(webRouter, mobileReq, { url: "/nope" });
    assert.strictEqual(r.status, 404); ok("unknown path -> 404");

    await assert.rejects(invokeRouter(webRouter, { auth: { type: "customer" } }, { url: "/data" }), /unauthenticated/); ok("customer token cannot use bridge");
    await assert.rejects(invokeRouter(webRouter, {}, { url: "/data" }), /unauthenticated/); ok("no auth cannot use bridge");

    const throwing = () => { throw new Error("boom"); };
    await assert.rejects(invokeRouter(throwing, mobileReq, { url: "/x" }), /boom/); ok("handler error propagates");

    const redirecting = (req, res) => res.redirect("/login");
    r = await invokeRouter(redirecting, mobileReq, { url: "/x" });
    assert.strictEqual(r.status, 401); ok("web redirect becomes 401 JSON");

    const echo = (req, res) => res.json({ b: req.body, m: req.method });
    r = await invokeRouter(echo, mobileReq, { method: "POST", url: "/action", body: { action: "add", name: "A" } });
    assert.deepStrictEqual(r.body, { b: { action: "add", name: "A" }, m: "POST" }); ok("POST body passed to web handler");

    /* mapping */
    const web = {
        type: "company",
        customers: { counts: { total: 572, active: 563, paid: 400 }, new_counts: { total: 10, active: 9, paid: 5 },
            amounts: { active: 5000, paid: 3000 }, new_amounts: { active: 400, paid: 250 } },
        collection: { expected: 10000, collection: 7500, percent: 75 }
    };
    const m = mapDashboard(web);
    assert.deepStrictEqual({
        potential:m.potential, collection:m.collection, percent:m.percent,
        total_customers:m.total_customers, new_customers:m.new_customers,
        connected_customers:m.connected_customers, connected_new:m.connected_new,
        paid_customers:m.paid_customers, paid_new:m.paid_new,
        connected_amount:m.connected_amount, connected_new_amount:m.connected_new_amount,
        paid_new_amount:m.paid_new_amount
    }, {
        potential:10000, collection:7500, percent:75,
        total_customers:572, new_customers:10,
        connected_customers:563, connected_new:9,
        paid_customers:400, paid_new:5,
        connected_amount:5000, connected_new_amount:400,
        paid_new_amount:250
    });
    ok("dashboard mapped");
    assert.deepStrictEqual(mapDashboard({ type: "company" }), emptySummary()); ok("missing permission blocks -> zeros, no crash");
    assert(MEDIUMS[0].id === "all" && MEDIUMS.length === 5 && MEDIUM_DB_NAME.bkash === "Bkash"); ok("mediums list");
    console.log(`\nALL ${n} CHECKS PASSED`);
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
