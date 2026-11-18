"use strict";
/* node test/mobile-auth.test.js — Mock DB দিয়ে; আসল MySQL/ডেটা লাগে না, কিছু লেখে না */
const assert = require("assert");
const path = require("path");
const Module = require("module");

process.env.MOBILE_JWT_SECRET = "x".repeat(40);

/* ---- in-memory fake DB (শুধু যে SQL গুলো ব্যবহৃত হয়) ---- */
const tokensTbl = []; let nextId = 1;
const users = { 1: { id: 1, company_id: 33, role: "admin", status: "active", username: "a", fullname: "A" },
                2: { id: 2, company_id: 33, role: "staff", status: "active", username: "s", fullname: "S" } };
const perms = [{ user_id: 2, company_id: 33, permission_key: "customer_edit", allowed: 1 }];

async function exec(sql, p = []) {
    sql = sql.replace(/\s+/g, " ").trim();
    if (sql.startsWith("INSERT INTO mobile_refresh_tokens")) {
        const row = { id: nextId++, subject_type: p[0], subject_id: p[1], company_id: p[2], family_id: p[3],
            token_hash: p[4], revoked_at: null, expired: 0 };
        tokensTbl.push(row); return [{ insertId: row.id }];
    }
    if (sql.includes("FROM mobile_refresh_tokens WHERE token_hash = ? LIMIT 1 FOR UPDATE")) {
        return [tokensTbl.filter(r => r.token_hash === p[0]).map(r => ({ ...r }))];
    }
    if (sql.startsWith("UPDATE mobile_refresh_tokens SET revoked_at = NOW(), replaced_by")) {
        const r = tokensTbl.find(x => x.id === p[1]); r.revoked_at = new Date(); return [{}];
    }
    if (sql.startsWith("UPDATE mobile_refresh_tokens SET revoked_at = NOW() WHERE family_id")) {
        tokensTbl.filter(r => r.family_id === p[0] && !r.revoked_at).forEach(r => r.revoked_at = new Date()); return [{}];
    }
    if (sql.startsWith("UPDATE mobile_refresh_tokens SET revoked_at = NOW() WHERE subject_type")) {
        tokensTbl.filter(r => r.subject_type === p[0] && r.subject_id === p[1] && !r.revoked_at
            && (p[2] === null || r.family_id !== p[3])).forEach(r => r.revoked_at = new Date()); return [{}];
    }
    if (sql.startsWith("SELECT family_id FROM mobile_refresh_tokens")) {
        return [tokensTbl.filter(r => r.token_hash === p[0]).map(r => ({ family_id: r.family_id }))];
    }
    if (sql.includes("FROM mobile_refresh_tokens WHERE family_id = ? AND revoked_at IS NULL AND expires_at > NOW()")) {
        return [tokensTbl.filter(r => r.family_id === p[0] && !r.revoked_at && !r.expired).map(() => ({ 1: 1 }))];
    }
    if (sql.startsWith("SELECT id, company_id, role, status, username, fullname FROM users")) {
        return [users[p[0]] ? [users[p[0]]] : []];
    }
    if (sql.startsWith("SELECT allowed FROM user_permissions")) {
        return [perms.filter(x => x.user_id === p[0] && x.company_id === p[1] && x.permission_key === p[2])];
    }
    throw new Error("unmocked SQL: " + sql.slice(0, 80));
}
const fakeDb = { execute: exec, query: exec,
    getConnection: async () => ({ execute: exec, beginTransaction: async () => {}, commit: async () => {},
        rollback: async () => {}, release: () => {} }) };

const origLoad = Module._load;
Module._load = function (request, parent, ...rest) {
    if (request.endsWith("config/database")) return fakeDb;
    return origLoad.call(this, request, parent, ...rest);
};
const T = require("../services/mobile/token.service");
const M = require("../middleware/mobileAuth");

/* hashing in fake DB uses real sha256 inside service; adapt lookup */
const crypto = require("crypto");
const realSha = (x) => crypto.createHash("sha256").update(x).digest("hex");

function mkRes() { const r = { code: 200, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; }
async function run(mw, req) { const res = mkRes(); let nexted = false; await mw(req, res, (e) => { if (e) throw e; nexted = true; }); return { res, nexted }; }

(async () => {
    let n = 0; const ok = (name) => console.log("  ✓", name, ++n);

    /* ---- access token ---- */
    const good = T.signAccess({ typ: "admin", sub: 1, cid: 33, role: "admin", fam: "f1" });
    assert(T.verifyAccess(good)); ok("valid token verifies");
    const [h, p, s] = good.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url")), role: "super_admin" })).toString("base64url");
    assert.strictEqual(T.verifyAccess(`${h}.${forged}.${s}`), null); ok("tampered payload rejected");
    const noneH = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    assert.strictEqual(T.verifyAccess(`${noneH}.${p}.`), null); ok("alg=none rejected");
    assert.strictEqual(T.verifyAccess(`${noneH}.${p}.${s}`), null); ok("alg switch rejected");
    const expired = (() => { const o = Date.now; Date.now = () => o() - 3600e3; const t = T.signAccess({ typ: "admin", sub: 1, cid: 33, role: "admin", fam: "f1" }); Date.now = o; return t; })();
    assert.strictEqual(T.verifyAccess(expired), null); ok("expired token rejected");
    const saved = process.env.MOBILE_JWT_SECRET; process.env.MOBILE_JWT_SECRET = "short";
    assert.throws(() => T.signAccess({}), /MOBILE_JWT_SECRET/); process.env.MOBILE_JWT_SECRET = saved; ok("missing/short secret fails closed");

    /* fake DB stores raw hash param (service hashes) -> patch lookup to compare hashed */
    /* start session + rotation + reuse detection */
    const sess = await T.startSession({ subjectType: "user", subjectId: 1, companyId: 33, role: "admin", ip: "1.1.1.1" });
    assert(sess.access_token && sess.refresh_token); ok("login issues access+refresh");
    assert(!tokensTbl.some(r => r.token_hash === sess.refresh_token)); ok("refresh stored hashed, not raw");

    const r1 = await T.rotateRefresh(sess.refresh_token, {});
    assert(r1 && r1.rt && r1.row.subject_id === 1); ok("refresh rotates");
    const fam = r1.row.family_id;
    const replay = await T.rotateRefresh(sess.refresh_token, {});
    assert(replay && replay.reuse === true); ok("old refresh reuse detected");
    assert(tokensTbl.filter(r => r.family_id === fam).every(r => r.revoked_at)); ok("reuse revokes whole family");
    assert.strictEqual(await T.rotateRefresh("garbage", {}), null); ok("garbage refresh rejected");

    /* requireBearer */
    const s2 = await T.startSession({ subjectType: "user", subjectId: 1, companyId: 33, role: "admin" });
    const bearer = (t) => ({ headers: { authorization: "Bearer " + t }, query: {}, body: {} });
    let out = await run(M.requireBearer("admin"), bearer(s2.access_token));
    assert(out.nexted && out.res.body === null); ok("valid bearer passes (admin)");
    const req = bearer(s2.access_token); await run(M.requireBearer("admin"), req);
    assert.strictEqual(req.auth.companyId, 33); ok("req.auth bound to DB company");

    out = await run(M.requireBearer("admin"), { headers: {}, query: {}, body: {} });
    assert.strictEqual(out.res.code, 401); ok("no token -> 401");
    out = await run(M.requireBearer("customer"), bearer(s2.access_token));
    assert.strictEqual(out.res.code, 401); ok("admin token cannot call customer API");

    users[1].status = "inactive";
    out = await run(M.requireBearer("admin"), bearer(s2.access_token));
    assert.strictEqual(out.res.code, 401); users[1].status = "active"; ok("deactivated user blocked immediately");
    users[1].role = "manager";
    out = await run(M.requireBearer("admin"), bearer(s2.access_token));
    assert.strictEqual(out.res.code, 401); users[1].role = "admin"; ok("role change invalidates old token");
    users[1].company_id = 34;
    out = await run(M.requireBearer("admin"), bearer(s2.access_token));
    assert.strictEqual(out.res.code, 401); users[1].company_id = 33; ok("company mismatch blocked");

    await T.revokeFamily(req.auth.familyId);
    out = await run(M.requireBearer("admin"), bearer(s2.access_token));
    assert.strictEqual(out.res.code, 401); ok("logout/revoke kills access token immediately");

    /* permissions + company scope */
    const staffTok = await T.startSession({ subjectType: "user", subjectId: 2, companyId: 33, role: "staff" });
    const sr = bearer(staffTok.access_token); await run(M.requireBearer("admin"), sr);
    out = await run(M.requireMobilePermission("customer_edit"), sr); assert(out.nexted); ok("staff with permission allowed");
    out = await run(M.requireMobilePermission("customer_delete"), sr); assert.strictEqual(out.res.code, 403); ok("staff without permission -> 403");
    assert.strictEqual(M.scopeCompanyId({ auth: { isSuperAdmin: false, companyId: 33 }, query: { company_id: "99" }, body: {} }), 33); ok("non-super-admin cannot override company_id");
    assert.strictEqual(M.scopeCompanyId({ auth: { isSuperAdmin: true, companyId: 0 }, query: { company_id: "99" }, body: {} }), 99); ok("super_admin may choose company");

    console.log(`\nALL ${n} CHECKS PASSED`);
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
