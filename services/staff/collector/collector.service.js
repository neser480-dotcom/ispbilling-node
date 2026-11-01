"use strict";

const db = require("../../../config/database");

class CollectorError extends Error {
    constructor(message, httpCode = 400) {
        super(message);
        this.httpCode = httpCode;
    }
}

const clean = (v) => String(v ?? "").trim();
const nullable = (v) => clean(v) || null;

function isSuperAdmin(req) {
    return String(req.session?.role || req.session?.user_role || "")
        .toLowerCase().replace(/[\s_-]+/g, "") === "superadmin";
}

function companyIdOf(req) {
    const id = Number(req.session?.company_id || req.session?.companyId || 0);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function scope(req, alias = "s") {
    if (isSuperAdmin(req)) return { sql: "1=1", params: [] };
    const id = companyIdOf(req);
    return id ? { sql: `${alias}.company_id = ?`, params: [id] } : { sql: "1=0", params: [] };
}

function positiveId(v, label = "ID") {
    const id = Number(v);
    if (!Number.isSafeInteger(id) || id <= 0) throw new CollectorError(`Invalid ${label}.`);
    return id;
}

async function findCollector(executor, req, id) {
    const sc = scope(req, "s");
    const [rows] = await executor.execute(
        `SELECT s.id, s.company_id, s.name, s.mobile, s.email, s.address,
                s.nid_no, s.status
         FROM staff AS s
         WHERE s.id = ? AND LOWER(s.role) = 'collector' AND ${sc.sql}
         LIMIT 1`,
        [id, ...sc.params]
    );
    if (!rows.length) throw new CollectorError("Collector not found or access denied.", 404);
    return rows[0];
}

// staff -> users link (same rule as the PHP edit.php: company + role collector + mobile)
async function findLoginUserId(executor, collector) {
    const [rows] = await executor.execute(
        `SELECT id FROM users
         WHERE company_id = ? AND LOWER(role) = 'collector' AND mobile = ?
         ORDER BY id ASC LIMIT 1`,
        [collector.company_id, collector.mobile]
    );
    return rows.length ? Number(rows[0].id) : 0;
}

async function list(req, filters = {}) {
    const sc = scope(req, "s");
    const where = ["LOWER(s.role) = 'collector'", sc.sql];
    const params = [...sc.params];
    const search = clean(filters.search).slice(0, 150);

    if (search) {
        where.push("(s.name LIKE ? OR s.mobile LIKE ? OR s.email LIKE ?)");
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const [collectors] = await db.execute(
        `SELECT s.id, s.name, s.mobile, s.email, s.address, s.status
         FROM staff AS s WHERE ${where.join(" AND ")} ORDER BY s.id DESC`,
        params
    );
    return { collectors, totalData: collectors.length };
}

async function profile(req, rawId) {
    return { collector: await findCollector(db, req, positiveId(rawId, "collector ID")) };
}

async function editData(req, rawId) {
    const collector = await findCollector(db, req, positiveId(rawId, "collector ID"));
    const companyId = collector.company_id;

    const [areas] = await db.execute(
        "SELECT id, name FROM areas WHERE company_id = ? ORDER BY name ASC", [companyId]);
    const [assigned] = await db.execute(
        "SELECT area_id FROM staff_area_assignments WHERE company_id = ? AND staff_id = ?",
        [companyId, collector.id]);
    const [permissions] = await db.execute(
        "SELECT id, permission_key FROM permissions ORDER BY permission_key ASC");

    const userId = await findLoginUserId(db, collector);
    let granted = [];
    if (userId) {
        const [rows] = await db.execute(
            `SELECT permission_key FROM user_permissions
             WHERE user_id = ? AND allowed = 1 AND status = 1`, [userId]);
        granted = rows.map((r) => r.permission_key);
    }

    return {
        collector, areas, permissions,
        assigned_area_ids: assigned.map((r) => Number(r.area_id)),
        granted_permissions: granted,
        has_login_user: userId > 0
    };
}

async function update(req, rawId, body = {}) {
    const id = positiveId(rawId, "collector ID");
    const name = clean(body.name);
    const mobile = clean(body.mobile);
    if (!name || !mobile) throw new CollectorError("Name and mobile are required.");

    const status = clean(body.status).toLowerCase() === "inactive" ? "inactive" : "active";
    const areaIds = [...new Set((Array.isArray(body.area_ids) ? body.area_ids : [])
        .map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];
    const keys = [...new Set((Array.isArray(body.permissions) ? body.permissions : [])
        .map(clean).filter(Boolean))];

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const collector = await findCollector(conn, req, id);
        const companyId = collector.company_id;

        await conn.execute(
            `UPDATE staff SET name = ?, mobile = ?, email = ?, address = ?, status = ?
             WHERE id = ? AND company_id = ?`,
            [name, mobile, nullable(body.email), nullable(body.address), status, id, companyId]);

        // Areas: only areas that belong to the same company are accepted.
        await conn.execute(
            "DELETE FROM staff_area_assignments WHERE company_id = ? AND staff_id = ?",
            [companyId, id]);
        if (areaIds.length) {
            const [valid] = await conn.query(
                "SELECT id FROM areas WHERE company_id = ? AND id IN (?)", [companyId, areaIds]);
            for (const a of valid) {
                await conn.execute(
                    "INSERT INTO staff_area_assignments (company_id, staff_id, area_id) VALUES (?, ?, ?)",
                    [companyId, id, a.id]);
            }
        }

        // Permissions: user_permissions.user_id must be the real users.id.
        const userId = await findLoginUserId(conn, collector);
        if (userId) {
            await conn.execute(
                "UPDATE user_permissions SET allowed = 0, status = 0 WHERE user_id = ?", [userId]);
            for (const key of keys) {
                const [p] = await conn.execute(
                    "SELECT id FROM permissions WHERE permission_key = ? LIMIT 1", [key]);
                if (!p.length) continue;
                const [ex] = await conn.execute(
                    "SELECT id FROM user_permissions WHERE user_id = ? AND permission_id = ? LIMIT 1",
                    [userId, p[0].id]);
                if (ex.length) {
                    await conn.execute(
                        "UPDATE user_permissions SET allowed = 1, status = 1, permission_key = ? WHERE id = ?",
                        [key, ex[0].id]);
                } else {
                    await conn.execute(
                        `INSERT INTO user_permissions (user_id, permission_id, allowed, permission_key, status)
                         VALUES (?, ?, 1, ?, 1)`, [userId, p[0].id, key]);
                }
            }
        }

        await conn.commit();
        return { permissions_saved: userId > 0 };
    } catch (e) {
        try { await conn.rollback(); } catch (_) {}
        throw e;
    } finally {
        conn.release();
    }
}

async function activity(req, rawId) {
    const collector = await findCollector(db, req, positiveId(rawId, "collector ID"));
    const userId = await findLoginUserId(db, collector);

    if (!userId) {
        return { collector_name: collector.name, has_login_user: false, logs: [] };
    }

    const [logs] = await db.execute(
        `SELECT id, user_name, role_name, action, description, module, ip_address, created_at
         FROM activity_logs
         WHERE company_id = ? AND user_id = ?
         ORDER BY id DESC LIMIT 200`,
        [collector.company_id, userId]
    );

    return { collector_name: collector.name, has_login_user: true, logs };
}

async function remove(req, rawId) {
    const id = positiveId(rawId, "collector ID");
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const collector = await findCollector(conn, req, id);
        await conn.execute(
            "DELETE FROM staff_area_assignments WHERE company_id = ? AND staff_id = ?",
            [collector.company_id, id]);
        await conn.execute(
            "DELETE FROM staff WHERE id = ? AND company_id = ?", [id, collector.company_id]);
        await conn.commit();
    } catch (e) {
        try { await conn.rollback(); } catch (_) {}
        throw e;
    } finally {
        conn.release();
    }
}

module.exports = { CollectorError, list, profile, editData, update, remove, activity };
