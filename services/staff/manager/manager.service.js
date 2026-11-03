"use strict";

const db = require("../../../config/database");

class ManagerError extends Error {
    constructor(message, httpCode = 400) {
        super(message);
        this.httpCode = httpCode;
    }
}

const clean = (v) => String(v ?? "").trim();

/* Reset Password > Default Password */
const DEFAULT_RESET_PASSWORD = process.env.DEFAULT_RESET_PASSWORD || "12345678";

/* staff টেবিলে role = 'Manager', users টেবিলে লগইনের role = 'manager' */
const STAFF_ROLE = "Manager";
const LOGIN_ROLE = "manager";

/*
 * Permission list (key -> label), Add Manager স্ক্রিনের ক্রম অনুযায়ী।
 * প্রথম ১৮টি key collector.service এর সাথে একই। বাকি key গুলো লেবেল থেকে বানানো,
 * সেগুলো কাজ করতে অ্যাপের বাকি অংশে (middleware / পেইজ) এই key ধরে চেক করতে হবে।
 */
const PERMISSIONS = [
    ["dashboard_collection_data", "Dashboard Collection Data"],
    ["customer_add", "Customer Add"],
    ["customer_edit", "Customer Edit"],
    ["customer_delete", "Customer Delete"],
    ["billing_cycle_update", "Billing Cycle Update"],
    ["customer_activate", "Customer Activate"],
    ["customer_deactivate", "Customer Deactivate"],
    ["monthly_fee_edit", "Monthly Fee Edit"],
    ["update_customer_balance", "Update Customer Balance"],
    ["bill_posting", "Bill Posting"],
    ["bill_discount", "Bill Discount"],
    ["instant_recharge_bill_print", "Instant Recharge Bill Print"],
    ["bulk_area_edit", "Bulk Area Edit"],
    ["bulk_status_edit", "Bulk Status Edit"],
    ["bulk_billing_cycle_edit", "Bulk Billing Cycle Edit"],
    ["bulk_promise_date_edit", "Bulk Promise Date Edit"],
    ["bulk_auto_disable_edit", "Bulk Auto Disable Edit"],
    ["bulk_package_edit", "Bulk Package Edit"],
    ["bulk_customer_transfer_to_reseller", "Bulk Customer Transfer To Reseller"],
    ["bulk_customer_delete", "Bulk Customer Delete"],
    ["bulk_customer_mikrotik_update", "Bulk Customer Mikrotik Update"],
    ["bulk_customer_recharge", "Bulk Customer Recharge"],
    ["bulk_payment_status_edit", "Bulk Payment Status Edit"],
    ["customer_invoice", "Customer Invoice"],
    ["bill_report_delete", "Bill Report Delete"],
    ["collector_add", "Collector Add"],
    ["collector_edit", "Collector Edit"],
    ["view_collector_report", "View Collector Report"],
    ["staff_salary", "Staff Salary"],
    ["sms_board", "SMS Board"],
    ["message_log", "Message Log"],
    ["customer_package_update", "Customer Package Update"],
    ["support_ticket_category", "Support Ticket Category"],
    ["expenditure_delete", "Expenditure Delete"],
    ["expenditure_update", "Expenditure Update"],
    ["olt_user_monitoring", "OLT User Monitoring"],
    ["webhook_message_log", "Webhook Message Log"],
    ["ipn_message_log", "IPN Message Log"],
    ["daily_recharge_feature", "Daily Recharge Feature"],
    ["monthly_bill_adjustment_on_recharge", "Monthly Bill Adjustment On Recharge"]
].map(([key, label]) => ({ key, label }));

const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);
const PERMISSION_SET = new Set(PERMISSION_KEYS);

const isMissingTable = (e) => e && e.code === "ER_NO_SUCH_TABLE";

const roleOf = (req) =>
    String(req.session?.role || req.session?.user_role || "").toLowerCase().replace(/[\s_-]+/g, "");

function isSuperAdmin(req) {
    return roleOf(req) === "superadmin";
}

/* ম্যানেজার তৈরি, বদল ও ডিলিট শুধু Admin / Super Admin করতে পারবেন */
function requireAdmin(req) {
    const r = roleOf(req);
    if (r !== "admin" && r !== "superadmin") {
        throw new ManagerError("শুধু Admin ম্যানেজার পরিচালনা করতে পারবেন।", 403);
    }
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

function targetCompanyId(req, body = {}) {
    if (isSuperAdmin(req)) {
        const id = Number(body.company_id || req.session?.selected_company_id || companyIdOf(req));
        return Number.isSafeInteger(id) && id > 0 ? id : 0;
    }
    return companyIdOf(req);
}

function positiveId(v, label = "ID") {
    const id = Number(v);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ManagerError(`Invalid ${label}.`);
    return id;
}

const idList = (v) => [...new Set((Array.isArray(v) ? v : [])
    .map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];

function wantsLogin(body) {
    return body.add_staff === true || body.add_staff === 1 ||
        body.add_staff === "1" || body.add_staff === "true";
}

/* Add / Edit form rules: Name, Mobile, NID, Address ও E-mail সবই বাধ্যতামূলক */
function validateProfile(body) {
    const name = clean(body.name);
    const mobile = clean(body.mobile);
    const nid = clean(body.nid_no).replace(/\s+/g, "");
    const address = clean(body.address);
    const email = clean(body.email);

    if (!name) throw new ManagerError("Name is required.");
    if (!/^01\d{9}$/.test(mobile)) {
        throw new ManagerError("Mobile must be 11 digits, like 01XXXXXXXXX.");
    }
    if (!/^(\d{10}|\d{13}|\d{17})$/.test(nid)) {
        throw new ManagerError("NID No must be 10, 13 or 17 digits.");
    }
    if (!address) throw new ManagerError("Address is required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ManagerError("A valid E-mail is required.");
    }

    const status = clean(body.status).toLowerCase() === "inactive" ? "inactive" : "active";
    return { name, mobile, nid, address, email, status };
}

function loadBcrypt() {
    for (const name of ["bcrypt", "bcryptjs"]) {
        try { return require(name); } catch (_) { /* try next */ }
    }
    throw new ManagerError("bcrypt প্যাকেজ ইনস্টল করা নেই।", 500);
}

/* ---------- sub-areas ---------- */

async function subAreasOf(executor, companyId) {
    const [rows] = await executor.execute(
        "SELECT id, area_id, name FROM sub_areas WHERE company_id = ? ORDER BY name ASC", [companyId]);
    return rows;
}

async function assignedSubAreaIds(executor, companyId, staffId) {
    try {
        const [rows] = await executor.execute(
            "SELECT sub_area_id FROM staff_sub_area_assignments WHERE company_id = ? AND staff_id = ?",
            [companyId, staffId]);
        return rows.map((r) => Number(r.sub_area_id));
    } catch (e) {
        if (isMissingTable(e)) return [];
        throw e;
    }
}

/* Sub-areas are kept only when their parent area is also selected. */
async function saveSubAreas(conn, companyId, staffId, subIds, areaIds) {
    try {
        await conn.execute(
            "DELETE FROM staff_sub_area_assignments WHERE company_id = ? AND staff_id = ?",
            [companyId, staffId]);
    } catch (e) {
        if (isMissingTable(e)) {
            if (subIds.length) {
                throw new ManagerError(
                    "Sub-area সেভ করতে staff_sub_area_assignments টেবিল দরকার।", 500);
            }
            return;
        }
        throw e;
    }
    if (!subIds.length || !areaIds.length) return;
    const [valid] = await conn.query(
        "SELECT id FROM sub_areas WHERE company_id = ? AND id IN (?) AND area_id IN (?)",
        [companyId, subIds, areaIds]);
    for (const r of valid) {
        await conn.execute(
            "INSERT INTO staff_sub_area_assignments (company_id, staff_id, sub_area_id) VALUES (?, ?, ?)",
            [companyId, staffId, r.id]);
    }
}

async function saveAreas(conn, companyId, staffId, areaIds, subIds) {
    await conn.execute(
        "DELETE FROM staff_area_assignments WHERE company_id = ? AND staff_id = ?",
        [companyId, staffId]);
    if (areaIds.length) {
        const [valid] = await conn.query(
            "SELECT id FROM areas WHERE company_id = ? AND id IN (?)", [companyId, areaIds]);
        for (const a of valid) {
            await conn.execute(
                "INSERT INTO staff_area_assignments (company_id, staff_id, area_id) VALUES (?, ?, ?)",
                [companyId, staffId, a.id]);
        }
    }
    await saveSubAreas(conn, companyId, staffId, subIds, areaIds);
}

/* ---------- login (users table) ---------- */

/* লগইন: company + manager role + mobile */
async function findLoginUserId(executor, manager) {
    const [rows] = await executor.execute(
        `SELECT id FROM users
         WHERE company_id = ? AND LOWER(role) = ? AND mobile = ?
         ORDER BY id ASC LIMIT 1`,
        [manager.company_id, LOGIN_ROLE, manager.mobile]);
    return rows.length ? Number(rows[0].id) : 0;
}

/* Add Staff: Username ও Password দুটোই মোবাইল নম্বর */
async function createLoginUser(conn, req, companyId, f) {
    const username = f.mobile;

    const [taken] = await conn.execute(
        "SELECT id FROM users WHERE LOWER(username) = ? LIMIT 1", [username.toLowerCase()]);
    if (taken.length) {
        throw new ManagerError("এই মোবাইল নম্বর দিয়ে আগে থেকেই একটি লগইন (Username) আছে।", 409);
    }

    const [owner] = await conn.execute(
        "SELECT package_id, client_type, company_name FROM users WHERE id = ? LIMIT 1", [companyId]);
    const o = owner[0] || {};

    const hash = await loadBcrypt().hash(f.mobile, 12);
    const creator = Number(req.session?.user_id || 0) || null;
    const loginStatus = f.status === "active" ? "active" : "inactive";

    const [r] = await conn.execute(
        `INSERT INTO users
            (company_id, username, password, fullname, name, email, mobile, phone, role, status,
             package_id, client_type, company_name, address, nid, add_staff, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [companyId, username, hash, f.name, f.name, f.email, f.mobile, f.mobile,
         LOGIN_ROLE, loginStatus, o.package_id ?? null, o.client_type ?? null,
         o.company_name ?? null, f.address, f.nid, creator]);
    return r.insertId;
}

/* শুধু এই তালিকার key বদলায়; অন্য key (যদি থাকে) অক্ষত থাকে */
async function savePermissions(conn, userId, companyId, keys) {
    await conn.query(
        "DELETE FROM user_permissions WHERE user_id = ? AND company_id = ? AND permission_key IN (?)",
        [userId, companyId, PERMISSION_KEYS]);
    for (const key of keys) {
        await conn.execute(
            "INSERT INTO user_permissions (user_id, company_id, permission_key, allowed) VALUES (?, ?, ?, 1)",
            [userId, companyId, key]);
    }
}

/* ---------- reads ---------- */

async function findManager(executor, req, id) {
    const sc = scope(req, "s");
    const [rows] = await executor.execute(
        `SELECT s.id, s.company_id, s.name, s.mobile, s.email, s.address,
                s.nid_no, s.status, s.role
         FROM staff AS s
         WHERE s.id = ? AND LOWER(COALESCE(s.role, '')) = 'manager' AND ${sc.sql}
         LIMIT 1`,
        [id, ...sc.params]);
    if (!rows.length) throw new ManagerError("Manager not found or access denied.", 404);
    return rows[0];
}

async function list(req, filters = {}) {
    const sc = scope(req, "s");
    const where = ["LOWER(COALESCE(s.role, '')) = 'manager'", sc.sql];
    const params = [...sc.params];
    const search = clean(filters.search).slice(0, 150);

    if (search) {
        where.push("(s.name LIKE ? OR s.mobile LIKE ? OR s.email LIKE ?)");
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const [managers] = await db.execute(
        `SELECT s.id, s.name, s.mobile, s.email, s.address, s.status
         FROM staff AS s WHERE ${where.join(" AND ")} ORDER BY s.id DESC`,
        params);
    return { managers, totalData: managers.length };
}

async function profile(req, rawId) {
    return { manager: await findManager(db, req, positiveId(rawId, "manager ID")) };
}

async function editData(req, rawId) {
    const manager = await findManager(db, req, positiveId(rawId, "manager ID"));
    const companyId = manager.company_id;

    const [areas] = await db.execute(
        "SELECT id, name FROM areas WHERE company_id = ? ORDER BY name ASC", [companyId]);
    const [assigned] = await db.execute(
        "SELECT area_id FROM staff_area_assignments WHERE company_id = ? AND staff_id = ?",
        [companyId, manager.id]);

    const userId = await findLoginUserId(db, manager);
    let granted = [];
    if (userId) {
        const [rows] = await db.execute(
            "SELECT permission_key FROM user_permissions WHERE user_id = ? AND company_id = ? AND allowed = 1",
            [userId, companyId]);
        granted = rows.map((r) => r.permission_key).filter((k) => PERMISSION_SET.has(k));
    }

    return {
        manager, areas,
        sub_areas: await subAreasOf(db, companyId),
        assigned_area_ids: assigned.map((r) => Number(r.area_id)),
        assigned_sub_area_ids: await assignedSubAreaIds(db, companyId, manager.id),
        permissions: PERMISSIONS,
        granted_permissions: granted,
        has_login_user: userId > 0
    };
}

async function areasList(req) {
    const companyId = targetCompanyId(req, req.query || {});
    if (!companyId) return { areas: [], sub_areas: [], permissions: PERMISSIONS };
    const [areas] = await db.execute(
        "SELECT id, name FROM areas WHERE company_id = ? ORDER BY name ASC", [companyId]);
    return { areas, sub_areas: await subAreasOf(db, companyId), permissions: PERMISSIONS };
}

/* ---------- writes ---------- */

async function create(req, body = {}) {
    requireAdmin(req);
    const companyId = targetCompanyId(req, body);
    if (!companyId) throw new ManagerError("Company account is not configured.", 403);

    const f = validateProfile(body);
    const areaIds = idList(body.area_ids);
    const subIds = idList(body.sub_area_ids);
    const keys = [...new Set((Array.isArray(body.permissions) ? body.permissions : [])
        .map(clean).filter((k) => PERMISSION_SET.has(k)))];

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [dup] = await conn.execute(
            `SELECT id FROM staff
             WHERE company_id = ? AND LOWER(COALESCE(role, '')) = 'manager' AND mobile = ? LIMIT 1`,
            [companyId, f.mobile]);
        if (dup.length) {
            throw new ManagerError("এই মোবাইল নম্বর দিয়ে ইতিমধ্যে একজন ম্যানেজার আছে।", 409);
        }

        const [result] = await conn.execute(
            `INSERT INTO staff (company_id, name, mobile, nid_no, email, address, role, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [companyId, f.name, f.mobile, f.nid, f.email, f.address, STAFF_ROLE, f.status]);

        await saveAreas(conn, companyId, result.insertId, areaIds, subIds);

        let loginCreated = false;
        if (wantsLogin(body)) {
            const userId = await createLoginUser(conn, req, companyId, f);
            await savePermissions(conn, userId, companyId, keys);
            loginCreated = true;
        }

        await conn.commit();
        return { id: result.insertId, login_created: loginCreated };
    } catch (e) {
        try { await conn.rollback(); } catch (_) {}
        throw e;
    } finally {
        conn.release();
    }
}

async function update(req, rawId, body = {}) {
    requireAdmin(req);
    const id = positiveId(rawId, "manager ID");

    const areaIds = idList(body.area_ids);
    const subIds = idList(body.sub_area_ids);
    const keys = [...new Set((Array.isArray(body.permissions) ? body.permissions : [])
        .map(clean).filter((k) => PERMISSION_SET.has(k)))];

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const manager = await findManager(conn, req, id);
        const companyId = manager.company_id;
        const f = validateProfile(body);

        const [dup] = await conn.execute(
            `SELECT id FROM staff
             WHERE company_id = ? AND id <> ? AND LOWER(COALESCE(role, '')) = 'manager' AND mobile = ? LIMIT 1`,
            [companyId, id, f.mobile]);
        if (dup.length) {
            throw new ManagerError("এই মোবাইল নম্বর দিয়ে অন্য একজন ম্যানেজার আছে।", 409);
        }

        /* পুরোনো মোবাইল দিয়ে লগইন খুঁজতে হবে, তাই staff আপডেটের আগে */
        let userId = await findLoginUserId(conn, manager);
        if (wantsLogin(body) && !userId) {
            userId = await createLoginUser(conn, req, companyId, f);
        }

        await conn.execute(
            `UPDATE staff SET name = ?, mobile = ?, nid_no = ?, email = ?, address = ?, status = ?
             WHERE id = ? AND company_id = ?`,
            [f.name, f.mobile, f.nid, f.email, f.address, f.status, id, companyId]);

        await saveAreas(conn, companyId, id, areaIds, subIds);

        if (userId) {
            await savePermissions(conn, userId, companyId, keys);
            /* Username অপরিবর্তিত থাকে; মোবাইল, ইমেইল ও স্ট্যাটাস মিলিয়ে রাখা হয় */
            await conn.execute(
                `UPDATE users SET fullname = ?, name = ?, mobile = ?, phone = ?, email = ?, status = ?
                 WHERE id = ? AND company_id = ?`,
                [f.name, f.name, f.mobile, f.mobile, f.email,
                 f.status === "active" ? "active" : "inactive", userId, companyId]);
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

async function remove(req, rawId) {
    requireAdmin(req);
    const id = positiveId(rawId, "manager ID");
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const manager = await findManager(conn, req, id);
        await conn.execute(
            "DELETE FROM staff_area_assignments WHERE company_id = ? AND staff_id = ?",
            [manager.company_id, id]);
        try {
            await conn.execute(
                "DELETE FROM staff_sub_area_assignments WHERE company_id = ? AND staff_id = ?",
                [manager.company_id, id]);
        } catch (e) { if (!isMissingTable(e)) throw e; }

        /* লগইন থাকলে বন্ধ করো, নইলে ডিলিট করা ম্যানেজার ঢুকতে পারবে */
        const loginId = await findLoginUserId(conn, manager);
        if (loginId) {
            await conn.execute(
                "UPDATE users SET status = 'inactive' WHERE id = ? AND company_id = ?",
                [loginId, manager.company_id]);
            try { await conn.execute("DELETE FROM user_remember_tokens WHERE user_id = ?", [loginId]); } catch (_) {}
        }

        await conn.execute(
            "DELETE FROM staff WHERE id = ? AND company_id = ?", [id, manager.company_id]);
        await conn.commit();
    } catch (e) {
        try { await conn.rollback(); } catch (_) {}
        throw e;
    } finally {
        conn.release();
    }
}

/* ---------- Reset Password: default | mobile | manual (শুধু Admin / Super Admin) ---------- */

async function resetPassword(req, rawId, body = {}) {
    requireAdmin(req);

    const mode = clean(body.mode).toLowerCase();
    if (!["default", "mobile", "manual"].includes(mode)) throw new ManagerError("Invalid reset type.");

    const manager = await findManager(db, req, positiveId(rawId, "manager ID"));
    const userId = await findLoginUserId(db, manager);
    if (!userId) {
        throw new ManagerError(
            "এই ম্যানেজারের কোনো লগইন নেই। Edit → Add Staff দিয়ে আগে লগইন তৈরি করুন।", 404);
    }

    let password;
    if (mode === "default") password = DEFAULT_RESET_PASSWORD;
    else if (mode === "mobile") password = manager.mobile;
    else password = String(body.password ?? "");

    if (password.length < 8) {
        throw new ManagerError(mode === "manual"
            ? "Password must be at least 8 characters."
            : "এই পাসওয়ার্ড ৮ অক্ষরের কম, অন্য ধরন বেছে নিন।");
    }
    if (password.length > 72) throw new ManagerError("পাসওয়ার্ড সর্বোচ্চ ৭২ অক্ষরের হতে পারে।");

    const [u] = await db.execute(
        "SELECT username FROM users WHERE id = ? AND company_id = ? LIMIT 1",
        [userId, manager.company_id]);
    if (!u.length) throw new ManagerError("Login user not found.", 404);

    const hash = await loadBcrypt().hash(password, 12);
    await db.execute(
        "UPDATE users SET password = ? WHERE id = ? AND company_id = ?",
        [hash, userId, manager.company_id]);

    /* ভুল পাসওয়ার্ডে লক থাকলে খুলে দাও, পুরোনো remember-me বাতিল করো */
    try { await db.execute("DELETE FROM login_attempts WHERE username = ?", [String(u[0].username).toLowerCase()]); } catch (_) {}
    try { await db.execute("DELETE FROM user_remember_tokens WHERE user_id = ?", [userId]); } catch (_) {}

    return { username: u[0].username, mode };
}

/* ---------- Activity (popup) ---------- */

async function activity(req, rawId) {
    const manager = await findManager(db, req, positiveId(rawId, "manager ID"));
    const userId = await findLoginUserId(db, manager);

    if (!userId) {
        return { manager_name: manager.name, has_login_user: false, logs: [] };
    }

    const [logs] = await db.execute(
        `SELECT id, user_name, role_name, action, description, module, ip_address, created_at
         FROM activity_logs
         WHERE company_id = ? AND user_id = ?
         ORDER BY id DESC LIMIT 200`,
        [manager.company_id, userId]);

    return { manager_name: manager.name, has_login_user: true, logs };
}

module.exports = {
    ManagerError, list, profile, editData, update, remove, activity,
    areasList, create, resetPassword
};
