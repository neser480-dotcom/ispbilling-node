"use strict";
/*
| services/mobile/token.service.js
| Mobile access token (HS256 signed, short-lived) + refresh token (opaque, DB-stored hash, rotating).
| কোনো নতুন npm package লাগে না (Node crypto ব্যবহার করা হয়েছে)।
*/
const crypto = require("crypto");
const db = require("../../config/database");

const ISSUER = "ispbilling-mobile";
const ACCESS_TTL_SEC = Number(process.env.MOBILE_ACCESS_TTL_SEC || 900);          // 15 min
const REFRESH_TTL_DAYS = Number(process.env.MOBILE_REFRESH_TTL_DAYS || 30);

function secret() {
    const s = process.env.MOBILE_JWT_SECRET;
    if (!s || s.length < 32) {
        const e = new Error("MOBILE_JWT_SECRET (min 32 chars) is not configured.");
        e.status = 503;
        e.code = "MOBILE_AUTH_NOT_CONFIGURED";
        throw e;
    }
    return s;
}

const b64u = (x) => Buffer.from(x).toString("base64url");
const sha256 = (x) => crypto.createHash("sha256").update(x).digest("hex");

function sign(input) {
    return crypto.createHmac("sha256", secret()).update(input).digest("base64url");
}

/* ---------------- access token ---------------- */
function signAccess(claims) {
    const now = Math.floor(Date.now() / 1000);
    const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = b64u(JSON.stringify({
        ...claims, iss: ISSUER, iat: now, exp: now + ACCESS_TTL_SEC
    }));
    return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

function verifyAccess(token) {
    if (typeof token !== "string" || token.length > 2048) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    let header, payload;
    try {
        header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
        payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    } catch (_) { return null; }
    if (!header || header.alg !== "HS256" || header.typ !== "JWT") return null;

    const expected = Buffer.from(sign(`${h}.${p}`));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.iss !== ISSUER || !payload.exp || payload.exp <= now) return null;
    return payload;
}

/* ---------------- refresh token ---------------- */
async function issueRefresh(conn, { subjectType, subjectId, companyId, deviceName, ip, familyId }) {
    const raw = crypto.randomBytes(48).toString("base64url");
    const family = familyId || crypto.randomUUID();
    const [r] = await conn.execute(
        `INSERT INTO mobile_refresh_tokens
            (subject_type, subject_id, company_id, family_id, token_hash, device_name, ip_address, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
        [subjectType, subjectId, companyId, family, sha256(raw),
         deviceName ? String(deviceName).slice(0, 100) : null,
         ip ? String(ip).slice(0, 45) : null, REFRESH_TTL_DAYS]
    );
    return { raw, familyId: family, id: r.insertId };
}

function buildTokens(subjectType, subjectId, companyId, role, rt) {
    return {
        access_token: signAccess({
            typ: subjectType === "user" ? "admin" : "customer",
            sub: subjectId, cid: companyId, role: role || null, fam: rt.familyId
        }),
        refresh_token: rt.raw,
        token_type: "Bearer",
        expires_in: ACCESS_TTL_SEC
    };
}

/* নতুন লগইন: refresh token + access token */
async function startSession({ subjectType, subjectId, companyId, role, deviceName, ip }) {
    const rt = await issueRefresh(db, { subjectType, subjectId, companyId, deviceName, ip });
    return buildTokens(subjectType, subjectId, companyId, role, rt);
}

/*
| Rotation: পুরনো refresh token বাতিল, নতুন দেওয়া হয়।
| বাতিল হওয়া token আবার ব্যবহার হলে (reuse/চুরি সন্দেহ) পুরো family বাতিল।
| ফেরত: { row, rt } | { reuse:true } | null
*/
async function rotateRefresh(raw, { ip, deviceName } = {}) {
    if (typeof raw !== "string" || raw.length < 40 || raw.length > 200) return null;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.execute(
            `SELECT id, subject_type, subject_id, company_id, family_id, revoked_at,
                    (expires_at <= NOW()) AS expired
             FROM mobile_refresh_tokens WHERE token_hash = ? LIMIT 1 FOR UPDATE`,
            [sha256(raw)]
        );
        if (!rows.length) { await conn.rollback(); return null; }
        const row = rows[0];

        if (row.revoked_at) {
            await conn.execute(
                `UPDATE mobile_refresh_tokens SET revoked_at = NOW()
                 WHERE family_id = ? AND revoked_at IS NULL`, [row.family_id]);
            await conn.commit();
            return { reuse: true };
        }
        if (Number(row.expired) === 1) { await conn.rollback(); return null; }

        const rt = await issueRefresh(conn, {
            subjectType: row.subject_type, subjectId: row.subject_id,
            companyId: row.company_id, deviceName, ip, familyId: row.family_id
        });
        await conn.execute(
            `UPDATE mobile_refresh_tokens
             SET revoked_at = NOW(), replaced_by = ?, last_used_at = NOW() WHERE id = ?`,
            [rt.id, row.id]
        );
        await conn.commit();
        return { row, rt };
    } catch (e) {
        try { await conn.rollback(); } catch (_) {}
        throw e;
    } finally {
        conn.release();
    }
}

async function revokeFamilyByRaw(raw) {
    if (typeof raw !== "string" || !raw) return;
    const [r] = await db.execute(
        "SELECT family_id FROM mobile_refresh_tokens WHERE token_hash = ? LIMIT 1", [sha256(raw)]);
    if (r.length) await revokeFamily(r[0].family_id);
}

async function revokeFamily(familyId) {
    await db.execute(
        `UPDATE mobile_refresh_tokens SET revoked_at = NOW()
         WHERE family_id = ? AND revoked_at IS NULL`, [familyId]);
}

async function revokeAllForSubject(subjectType, subjectId, exceptFamilyId = null) {
    await db.execute(
        `UPDATE mobile_refresh_tokens SET revoked_at = NOW()
         WHERE subject_type = ? AND subject_id = ? AND revoked_at IS NULL
           AND (? IS NULL OR family_id <> ?)`,
        [subjectType, subjectId, exceptFamilyId, exceptFamilyId]
    );
}

async function isFamilyActive(familyId) {
    const [r] = await db.execute(
        `SELECT 1 FROM mobile_refresh_tokens
         WHERE family_id = ? AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1`,
        [familyId]
    );
    return r.length > 0;
}

module.exports = {
    signAccess, verifyAccess, startSession, buildTokens,
    rotateRefresh, revokeFamilyByRaw, revokeFamily, revokeAllForSubject, isFamilyActive,
    ACCESS_TTL_SEC
};
