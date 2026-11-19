"use strict";
/*
| middleware/mobileAuth.js
| শুধু /api/mobile/* এর জন্য। Web Session/CSRF/permission.js অক্ষত।
| প্রতি অনুরোধে: Token যাচাই + refresh-family সক্রিয় কি না + DB-তে অ্যাকাউন্ট/Company/Role পুনর্যাচাই।
*/
const db = require("../config/database");
const tokens = require("../services/mobile/token.service");

const ADMIN_ROLES = ["super_admin", "admin", "manager", "collector", "staff", "employee", "reseller"];
const FULL_ACCESS_ROLES = ["super_admin", "admin"];   // permission.js-এর মতোই

function deny(res, status, code, message) {
    return res.status(status).json({ success: false, code, message });
}

function requireBearer(expectedType) {
    return async (req, res, next) => {
        try {
            const header = String(req.headers.authorization || "");
            const m = /^Bearer\s+([A-Za-z0-9\-_.]+)$/.exec(header);
            if (!m) return deny(res, 401, "UNAUTHORIZED", "আবার লগইন করুন।");

            const claims = tokens.verifyAccess(m[1]);
            if (!claims || claims.typ !== expectedType || !claims.fam) {
                return deny(res, 401, "UNAUTHORIZED", "আবার লগইন করুন।");
            }
            if (!(await tokens.isFamilyActive(claims.fam))) {
                return deny(res, 401, "SESSION_REVOKED", "আবার লগইন করুন।");
            }

            if (expectedType === "admin") {
                const [rows] = await db.execute(
                    "SELECT id, company_id, role, status, username, fullname FROM users WHERE id = ? LIMIT 1",
                    [Number(claims.sub)]
                );
                const u = rows[0];
                if (!u || u.status !== "active" || !ADMIN_ROLES.includes(u.role)
                    || u.role !== claims.role
                    || Number(u.company_id) !== Number(claims.cid)
                    || (u.role !== "super_admin" && Number(u.company_id) <= 0)) {
                    return deny(res, 401, "UNAUTHORIZED", "আবার লগইন করুন।");
                }
                req.auth = {
                    type: "admin", userId: u.id, role: u.role, companyId: Number(u.company_id),
                    username: u.username, fullname: u.fullname, familyId: claims.fam,
                    isSuperAdmin: u.role === "super_admin",
                    hasFullAccess: FULL_ACCESS_ROLES.includes(u.role)
                };
            } else {
                const [rows] = await db.execute(
                    `SELECT c.id, c.company_id, a.status AS acct_status
                     FROM customers c
                     JOIN customer_mobile_accounts a
                       ON a.customer_pk = c.id AND a.company_id = c.company_id
                     WHERE c.id = ? AND c.company_id = ? AND c.deleted_at IS NULL LIMIT 1`,
                    [Number(claims.sub), Number(claims.cid)]
                );
                const c = rows[0];
                if (!c || c.acct_status !== "active") {
                    return deny(res, 401, "UNAUTHORIZED", "আবার লগইন করুন।");
                }
                req.auth = {
                    type: "customer", customerPk: c.id, companyId: Number(c.company_id),
                    familyId: claims.fam
                };
            }
            return next();
        } catch (e) {
            if (e && e.code === "MOBILE_AUTH_NOT_CONFIGURED") {
                return deny(res, 503, e.code, "Mobile সেবা কনফিগার করা নেই।");
            }
            return next(e);
        }
    };
}

/* permission.js-এর হুবহু নিয়ম: admin/super_admin সব পায়; বাকিরা user_permissions (user+company+key) */
function requireMobilePermission(key) {
    return async (req, res, next) => {
        try {
            if (!req.auth || req.auth.type !== "admin") {
                return deny(res, 401, "UNAUTHORIZED", "আবার লগইন করুন।");
            }
            if (req.auth.hasFullAccess) return next();
            const [rows] = await db.execute(
                `SELECT allowed FROM user_permissions
                 WHERE user_id = ? AND company_id = ? AND permission_key = ? LIMIT 1`,
                [req.auth.userId, req.auth.companyId, key]
            );
            if (rows.length && Number(rows[0].allowed) === 1) return next();
            return deny(res, 403, "FORBIDDEN", `আপনার এই কাজের অনুমতি নেই। (প্রয়োজন: ${key})`);
        } catch (e) { return next(e); }
    };
}

/*
| Company isolation: super_admin ছাড়া কেউ নিজের Company বদলাতে পারবে না (ক্লায়েন্টের পাঠানো company_id উপেক্ষিত)।
| super_admin কোনো নির্দিষ্ট company চাইলে ?company_id= দিতে পারে, না দিলে null (সব)।
*/
function scopeCompanyId(req) {
    if (!req.auth.isSuperAdmin) return req.auth.companyId;
    const q = Number(req.query?.company_id || req.body?.company_id || 0);
    return Number.isInteger(q) && q > 0 ? q : null;
}

module.exports = { requireBearer, requireMobilePermission, scopeCompanyId, ADMIN_ROLES };
