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

/* Reset Password > Default Password */
const DEFAULT_RESET_PASSWORD = process.env.DEFAULT_RESET_PASSWORD || "12345678";

/* Permission list (key -> label), same items as the reference system */
const PERMISSIONS = [
    ["customer_add", "Customer Add"],
    ["customer_edit", "Customer Edit"],
    ["customer_activate", "Customer Activate"],
    ["customer_deactivate", "Customer Deactivate"],
    ["update_customer_balance", "Update Customer Balance"],
    ["customer_list", "Customer List"],
    ["connection_fee", "Connection Fee"],
    ["billing_cycle_update", "Billing Cycle Update"],
    ["mobile_number_update", "Mobile Number Update"],
    ["sms_board", "SMS Board"],
    ["bill_posting", "Bill Posting"],
    ["bill_invoice_print", "Bill invoice print"],
    ["bill_report_delete", "Bill Report Delete"],
    ["bulk_status_edit", "Bulk Status Edit"],
    ["dashboard_collection_data", "Dashboard Collection Data"],
    ["expenditure", "Expenditure"],
    ["bulk_payment_status_edit", "Bulk Payment Status Edit"],
    ["customer_package_update", "Customer Package Update"],
    ["olt_user_monitoring", "OLT User Monitoring"],
    ["webhook_message_log", "Webhook Message Log"],
    ["ipn_message_log", "IPN Message Log"],
    ["daily_recharge_feature", "Daily Recharge Feature"],
    ["monthly_bill_adjustment_on_recharge", "Monthly Bill Adjustment On Recharge"]
].map(([key, label]) => ({ key, label }));

const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);
const PERMISSION_SET = new Set(PERMISSION_KEYS);

const isMissingTable = (e) => e && e.code === "ER_NO_SUCH_TABLE";

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

function targetCompanyId(req, body = {}) {
    if (isSuperAdmin(req)) {
        const id = Number(body.company_id || req.session?.selected_company_id || companyIdOf(req));
        return Number.isSafeInteger(id) && id > 0 ? id : 0;
    }
    return companyIdOf(req);
}

function positiveId(v, label = "ID") {
    const id = Number(v);
    if (!Number.isSafeInteger(id) || id <= 0) throw new CollectorError(`Invalid ${label}.`);
    return id;
}

const idList = (v) => [...new Set((Array.isArray(v) ? v : [])
    .map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];

function wantsLogin(body) {
    return body.add_staff === true || body.add_staff === 1 ||
        body.add_staff === "1" || body.add_staff === "true";
}

/* Add / Edit form rules: NID, Address and E-mail are required (* in the form) */
function validateProfile(body, optional = false) {
    const name = clean(body.name);
    const mobile = clean(body.mobile);
    const nid = clean(body.nid_no).replace(/\s+/g, "");
    const address = clean(body.address);
    const email = clean(body.email);

    if (!name) throw new CollectorError("Name is required.");

    /* Employee (role staff) এর NID/Address/E-mail ঐচ্ছিক; দিলে সঠিক হতে হবে */
    if (optional) {
        if (!mobile) throw new CollectorError("Mobile is required.");
        if (nid && !/^(\d{10}|\d{13}|\d{17})$/.test(nid)) {
            throw new CollectorError("NID No must be 10, 13 or 17 digits.");
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new CollectorError("A valid E-mail is required.");
        }
    } else {
        if (!/^01\d{9}$/.test(mobile)) {
            throw new CollectorError("Mobile must be 11 digits, like 01XXXXXXXXX.");
        }
        if (!/^(\d{10}|\d{13}|\d{17})$/.test(nid)) {
            throw new CollectorError("NID No must be 10, 13 or 17 digits.");
        }
        if (!address) throw new CollectorError("Address is required.");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new CollectorError("A valid E-mail is required.");
        }
    }

    const status = clean(body.status).toLowerCase() === "inactive" ? "inactive" : "active";
    return {
        name, mobile, nid: nid || null, address: address || null, email: email || null, status
    };
}

function loadBcrypt() {
    for (const name of ["bcrypt", "bcryptjs"]) {
        try { return require(name); } catch (_) { /* try next */ }
    }
    throw new CollectorError("bcrypt প্যাকেজ ইনস্টল করা নেই।", 500);
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
                throw new CollectorError(
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

/* এই পেজে Collector ও Employee (role staff) দুটোই আসে; লগইনের role-ও সেই অনুযায়ী */
const isEmployee = (c) => String(c?.role || "").toLowerCase() === "staff";
const loginRoleOf = (c) => (isEmployee(c) ? "staff" : "collector");

/* লগইন: company + (collector | staff) role + mobile */
async function findLoginUserId(executor, collector) {
    const [rows] = await executor.execute(
        `SELECT id FROM users
         WHERE company_id = ? AND LOWER(role) = ? AND mobile = ?
         ORDER BY id ASC LIMIT 1`,
        [collector.company_id, loginRoleOf(collector), collector.mobile]);
    return rows.length ? Number(rows[0].id) : 0;
}

/* Add Staff: Username ও Password দুটোই মোবাইল নম্বর */
async function createLoginUser(conn, req, companyId, f, loginRole = "collector") {
    const username = f.mobile;

    const [taken] = await conn.execute(
        "SELECT id FROM users WHERE LOWER(username) = ? LIMIT 1", [username.toLowerCase()]);
    if (taken.length) {
        throw new CollectorError("এই মোবাইল নম্বর দিয়ে আগে থেকেই একটি লগইন (Username) আছে।", 409);
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
         loginRole, loginStatus, o.package_id ?? null, o.client_type ?? null,
         o.company_name ?? null, f.address, f.nid, creator]);
    return r.insertId;
}

/* শুধু এই ২৩টা key বদলায়; অন্য key (যদি থাকে) অক্ষত থাকে */
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

async function findCollector(executor, req, id) {
    const sc = scope(req, "s");
    const [rows] = await executor.execute(
        `SELECT s.id, s.company_id, s.name, s.mobile, s.email, s.address,
                s.nid_no, s.status, s.role
         FROM staff AS s
         WHERE s.id = ? AND LOWER(COALESCE(s.role, '')) IN ('collector', 'staff') AND ${sc.sql}
         LIMIT 1`,
        [id, ...sc.params]);
    if (!rows.length) throw new CollectorError("Collector not found or access denied.", 404);
    return rows[0];
}

async function list(req, filters = {}) {
    const sc = scope(req, "s");
    const where = ["LOWER(COALESCE(s.role, '')) IN ('collector', 'staff')", sc.sql];
    const params = [...sc.params];
    const search = clean(filters.search).slice(0, 150);

    if (search) {
        where.push("(s.name LIKE ? OR s.mobile LIKE ? OR s.email LIKE ?)");
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const [collectors] = await db.execute(
        `SELECT s.id, s.name, s.mobile, s.email, s.address, s.status
         FROM staff AS s WHERE ${where.join(" AND ")} ORDER BY s.id DESC`,
        params);
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

    const userId = await findLoginUserId(db, collector);
    let granted = [];
    if (userId) {
        const [rows] = await db.execute(
            "SELECT permission_key FROM user_permissions WHERE user_id = ? AND company_id = ? AND allowed = 1",
            [userId, companyId]);
        granted = rows.map((r) => r.permission_key).filter((k) => PERMISSION_SET.has(k));
    }

    return {
        collector, areas,
        sub_areas: await subAreasOf(db, companyId),
        assigned_area_ids: assigned.map((r) => Number(r.area_id)),
        assigned_sub_area_ids: await assignedSubAreaIds(db, companyId, collector.id),
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
    const companyId = targetCompanyId(req, body);
    if (!companyId) throw new CollectorError("Company account is not configured.", 403);

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
             WHERE company_id = ? AND LOWER(COALESCE(role, '')) = 'collector' AND mobile = ? LIMIT 1`,
            [companyId, f.mobile]);
        if (dup.length) {
            throw new CollectorError("এই মোবাইল নম্বর দিয়ে ইতিমধ্যে একজন কালেক্টর আছে।", 409);
        }

        const [result] = await conn.execute(
            `INSERT INTO staff (company_id, name, mobile, nid_no, email, address, role, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'Collector', ?, NOW())`,
            [companyId, f.name, f.mobile, f.nid, f.email, f.address, f.status]);

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
    const id = positiveId(rawId, "collector ID");

    const areaIds = idList(body.area_ids);
    const subIds = idList(body.sub_area_ids);
    const keys = [...new Set((Array.isArray(body.permissions) ? body.permissions : [])
        .map(clean).filter((k) => PERMISSION_SET.has(k)))];

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const collector = await findCollector(conn, req, id);
        const companyId = collector.company_id;
        const f = validateProfile(body, isEmployee(collector));

        const [dup] = await conn.execute(
            `SELECT id FROM staff
             WHERE company_id = ? AND id <> ? AND LOWER(COALESCE(role, '')) = ? AND mobile = ? LIMIT 1`,
            [companyId, id, String(collector.role).toLowerCase(), f.mobile]);
        if (dup.length) {
            throw new CollectorError("এই মোবাইল নম্বর দিয়ে অন্য একজন আছে।", 409);
        }

        /* পুরোনো মোবাইল দিয়ে লগইন খুঁজতে হবে, তাই staff আপডেটের আগে */
        let userId = await findLoginUserId(conn, collector);
        if (wantsLogin(body) && !userId) {
            userId = await createLoginUser(conn, req, companyId, f, loginRoleOf(collector));
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
    const id = positiveId(rawId, "collector ID");
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const collector = await findCollector(conn, req, id);
        await conn.execute(
            "DELETE FROM staff_area_assignments WHERE company_id = ? AND staff_id = ?",
            [collector.company_id, id]);
        try {
            await conn.execute(
                "DELETE FROM staff_sub_area_assignments WHERE company_id = ? AND staff_id = ?",
                [collector.company_id, id]);
        } catch (e) { if (!isMissingTable(e)) throw e; }

        /* লগইন থাকলে বন্ধ করো, নইলে ডিলিট করা কালেক্টর ঢুকতে পারবে */
        const loginId = await findLoginUserId(conn, collector);
        if (loginId) {
            await conn.execute(
                "UPDATE users SET status = 'inactive' WHERE id = ? AND company_id = ?",
                [loginId, collector.company_id]);
            try { await conn.execute("DELETE FROM user_remember_tokens WHERE user_id = ?", [loginId]); } catch (_) {}
        }

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

async function sms(req, body = {}) {
    const id = positiveId(body.staff_id, "collector ID");
    const message = clean(body.message);
    if (!message) throw new CollectorError("Message is required.");

    const collector = await findCollector(db, req, id);
    const type = ["non_masking", "masking", "fixed_number"].includes(clean(body.sms_type))
        ? clean(body.sms_type) : "non_masking";

    // No SMS gateway exists in this project yet, so nothing is sent.
    return { staff_id: collector.id, mobile: collector.mobile, sms_type: type,
             message_length: message.length, sent: false };
}

/* ---------- Reset Password: default | mobile | manual (শুধু Admin / Super Admin) ---------- */

async function resetPassword(req, rawId, body = {}) {
    const role = String(req.session?.role || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
    if (role !== "admin" && role !== "superadmin") {
        throw new CollectorError("শুধু Admin পাসওয়ার্ড রিসেট করতে পারবেন।", 403);
    }

    const mode = clean(body.mode).toLowerCase();
    if (!["default", "mobile", "manual"].includes(mode)) throw new CollectorError("Invalid reset type.");

    const collector = await findCollector(db, req, positiveId(rawId, "collector ID"));
    const userId = await findLoginUserId(db, collector);
    if (!userId) {
        throw new CollectorError(
            "এই কালেক্টরের কোনো লগইন নেই। Edit → Add Staff দিয়ে আগে লগইন তৈরি করুন।", 404);
    }

    let password;
    if (mode === "default") password = DEFAULT_RESET_PASSWORD;
    else if (mode === "mobile") password = collector.mobile;
    else password = String(body.password ?? "");

    if (password.length < 8) {
        throw new CollectorError(mode === "manual"
            ? "Password must be at least 8 characters."
            : "এই পাসওয়ার্ড ৮ অক্ষরের কম, অন্য ধরন বেছে নিন।");
    }
    if (password.length > 72) throw new CollectorError("পাসওয়ার্ড সর্বোচ্চ ৭২ অক্ষরের হতে পারে।");

    const [u] = await db.execute(
        "SELECT username FROM users WHERE id = ? AND company_id = ? LIMIT 1",
        [userId, collector.company_id]);
    if (!u.length) throw new CollectorError("Login user not found.", 404);

    const hash = await loadBcrypt().hash(password, 12);
    await db.execute(
        "UPDATE users SET password = ? WHERE id = ? AND company_id = ?",
        [hash, userId, collector.company_id]);

    /* ভুল পাসওয়ার্ডে লক থাকলে খুলে দাও, পুরোনো remember-me বাতিল করো */
    try { await db.execute("DELETE FROM login_attempts WHERE username = ?", [String(u[0].username).toLowerCase()]); } catch (_) {}
    try { await db.execute("DELETE FROM user_remember_tokens WHERE user_id = ?", [userId]); } catch (_) {}

    return { username: u[0].username, mode };
}

/* ---------- Activity (popup; আলাদা পেজ পরের ধাপে) ---------- */

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
        [collector.company_id, userId]);

    return { collector_name: collector.name, has_login_user: true, logs };
}

/* ---------- Previous Balance ---------- */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

const money = (v) => Math.round(Number(v || 0) * 100) / 100;

// Monthly Bill Report (collected) + Deposit -> rows with a running Balance.
function buildBalanceRows(bills, deposits) {
    const byMonth = new Map();
    const slot = (yr, mo) => {
        const key = yr * 100 + mo;
        if (!byMonth.has(key)) byMonth.set(key, { year: yr, mo, deposit: 0, bill_report: 0 });
        return byMonth.get(key);
    };
    for (const b of bills) slot(Number(b.yr), Number(b.mo)).bill_report += Number(b.total || 0);
    for (const d of deposits) slot(Number(d.yr), Number(d.mo)).deposit += Number(d.total || 0);

    let running = 0;
    return [...byMonth.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, r]) => {
            running += r.bill_report - r.deposit;
            return {
                mo: r.mo,
                month: MONTHS[r.mo - 1] || String(r.mo),
                year: r.year,
                deposit: money(r.deposit),
                bill_report: money(r.bill_report),
                balance: money(running)
            };
        })
        .reverse();
}

async function previousBalance(req, rawId) {
    const collector = await findCollector(db, req, positiveId(rawId, "collector ID"));

    // bill_reports.collected_by is a text column (not an id): match the collector's
    // staff name and, when a login account exists, its username / full name.
    const names = new Set([collector.name]);
    const userId = await findLoginUserId(db, collector);
    if (userId) {
        const [u] = await db.execute(
            "SELECT username, fullname, name FROM users WHERE id = ? LIMIT 1", [userId]);
        for (const v of [u[0]?.username, u[0]?.fullname, u[0]?.name]) {
            if (clean(v)) names.add(clean(v));
        }
    }

    const [bills] = await db.query(
        `SELECT YEAR(created_at) AS yr, MONTH(created_at) AS mo, SUM(collected_amount) AS total
         FROM bill_reports
         WHERE company_id = ? AND collected_by IN (?) AND created_at IS NOT NULL
         GROUP BY yr, mo`,
        [collector.company_id, [...names]]);

    // collector_deposit has no company_id; staff.id was already checked against the company.
    const [deposits] = await db.execute(
        `SELECT YEAR(deposit_date) AS yr, MONTH(deposit_date) AS mo, SUM(amount) AS total
         FROM collector_deposit
         WHERE collector_id = ? AND deposit_date IS NOT NULL
         GROUP BY yr, mo`,
        [collector.id]);

    return { collector_name: collector.name, rows: buildBalanceRows(bills, deposits) };
}

module.exports = {
    CollectorError, list, profile, editData, update, remove, activity,
    areasList, create, sms, resetPassword, previousBalance
};
