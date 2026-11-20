"use strict";
/*
| routes/mobile/adminSuper.js   (mount: /api/mobile/admin/super)  — শুধু Super Admin
|  GET  /software-billing            সব ISP-র Software Bill (সারাংশসহ), read-only
|  GET  /pricing/companies           Company-wise Pricing তালিকা
|  GET  /pricing/companies/:id       এক Company + History
|  POST /pricing/companies/:id/rules                      Rule সংরক্ষণ
|  POST /pricing/companies/:id/rules/:feeType/toggle     Enable/Disable
|  POST /pricing/companies/:id/rules/:feeType/reset      Default-এ ফেরা
| Pricing-এর সব নিয়ম/যাচাই services/billing/pricing.service.js-এ (Web পেজের সঙ্গে একই)।
| সেই Service ইনস্টল না থাকলে শুধু Pricing endpoint ৫০১ দেয়; বাকি Mobile API অক্ষত।
*/
const express = require("express");
const db = require("../../config/database");

const router = express.Router();

const DT = "%Y-%m-%d %H:%i:%s";
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => "\\" + c);

/* Super Admin ছাড়া কেউ নয় (req.auth Bearer + DB থেকে যাচাই হওয়া) */
router.use((req, res, next) => {
    if (!req.auth || req.auth.type !== "admin" || !req.auth.isSuperAdmin) {
        return res.status(403).json({
            success: false, code: "FORBIDDEN", message: "Super Admin access required."
        });
    }
    next();
});

/* ---------------- Software Billing (read-only) ---------------- */

router.get("/software-billing", async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
        const offset = (page - 1) * limit;

        const where = ["1 = 1"];
        const params = [];

        const status = String(req.query.status || "");
        if (["unpaid", "paid", "cancelled"].includes(status)) { where.push("b.status = ?"); params.push(status); }

        const type = String(req.query.type || "");
        if (["registration", "monthly"].includes(type)) { where.push("b.billing_type = ?"); params.push(type); }

        const search = String(req.query.search || "").trim().slice(0, 60);
        if (search) {
            const like = `%${likeEscape(search)}%`;
            where.push("(u.company_name LIKE ? OR u.username LIKE ? OR u.mobile LIKE ? OR CAST(b.company_id AS CHAR) = ?)");
            params.push(like, like, like, search);
        }

        const w = where.join(" AND ");

        const [[tot]] = await db.execute(
            `SELECT COUNT(*) AS total
             FROM software_billing_notifications b LEFT JOIN users u ON u.id = b.user_id
             WHERE ${w}`, params);

        const [rows] = await db.execute(
            `SELECT b.id, b.company_id, b.billing_type, b.package_code, b.amount, b.status,
                    b.billing_period,
                    DATE_FORMAT(b.due_date, '${DT}') AS due_date,
                    DATE_FORMAT(b.paid_at, '${DT}') AS paid_at,
                    DATE_FORMAT(b.created_at, '${DT}') AS created_at,
                    u.company_name, u.owner_name, u.mobile, u.username
             FROM software_billing_notifications b
             LEFT JOIN users u ON u.id = b.user_id
             WHERE ${w}
             ORDER BY CASE WHEN b.status = 'unpaid' THEN 0 ELSE 1 END, b.id DESC
             LIMIT ${limit} OFFSET ${offset}`, params);

        const [sum] = await db.execute(
            `SELECT status, COUNT(*) AS c, COALESCE(SUM(amount), 0) AS s
             FROM software_billing_notifications GROUP BY status`);

        const summary = { unpaid_count: 0, unpaid_amount: 0, paid_count: 0, paid_amount: 0 };
        for (const r of sum) {
            if (r.status === "unpaid") { summary.unpaid_count = num(r.c); summary.unpaid_amount = num(r.s); }
            if (r.status === "paid") { summary.paid_count = num(r.c); summary.paid_amount = num(r.s); }
        }

        res.json({
            page, limit, total: num(tot && tot.total), summary,
            items: rows.map((r) => ({
                id: Number(r.id),
                company_id: Number(r.company_id),
                company_name: r.company_name || "",
                owner_name: r.owner_name || "",
                mobile: r.mobile || "",
                username: r.username || "",
                billing_type: r.billing_type,
                package_code: r.package_code || "",
                billing_period: r.billing_period || "",
                amount: num(r.amount),
                status: r.status,
                due_date: r.due_date || "",
                paid_at: r.paid_at || "",
                created_at: r.created_at || ""
            }))
        });
    } catch (e) { next(e); }
});

/* ---------------- Pricing (pricing.service.js পুনঃব্যবহার) ---------------- */

function pricingService(res) {
    try {
        return require("../../services/billing/pricing.service");
    } catch (_) {
        res.status(501).json({
            success: false, code: "PRICING_NOT_INSTALLED",
            message: "Pricing module ইনস্টল করা নেই।"
        });
        return null;
    }
}

function actor(req) {
    return {
        userId: Number(req.auth.userId),
        companyId: Number(req.auth.companyId || 0),
        name: req.auth.fullname || req.auth.username || "",
        role: req.auth.role,
        ip: req.ip || (req.socket && req.socket.remoteAddress) || null
    };
}

function fail(res, error, next) {
    const status = Number(error && error.httpCode) || 0;
    if (status >= 400 && status < 500) {
        return res.status(status).json({ success: false, code: "REJECTED", message: error.message });
    }
    return next(error);
}

router.get("/pricing/companies", async (req, res, next) => {
    const svc = pricingService(res); if (!svc) return;
    try {
        res.json({ companies: await svc.listCompanies(req.query.search) });
    } catch (e) { fail(res, e, next); }
});

router.get("/pricing/companies/:id", async (req, res, next) => {
    const svc = pricingService(res); if (!svc) return;
    try {
        res.json(await svc.getCompanyDetail(req.params.id));
    } catch (e) { fail(res, e, next); }
});

router.post("/pricing/companies/:id/rules", async (req, res, next) => {
    const svc = pricingService(res); if (!svc) return;
    try {
        const b = req.body || {};
        await svc.saveRule({
            companyId: req.params.id, feeType: b.fee_type, mode: b.mode, value: b.value,
            isEnabled: b.is_enabled, startsAt: b.starts_at, expiresAt: b.expires_at, note: b.note
        }, actor(req));
        res.json({ success: true, ...(await svc.getCompanyDetail(req.params.id)) });
    } catch (e) { fail(res, e, next); }
});

router.post("/pricing/companies/:id/rules/:feeType/toggle", async (req, res, next) => {
    const svc = pricingService(res); if (!svc) return;
    try {
        const b = req.body || {};
        await svc.setEnabled({
            companyId: req.params.id, feeType: req.params.feeType, enabled: b.enabled, note: b.note
        }, actor(req));
        res.json({ success: true, ...(await svc.getCompanyDetail(req.params.id)) });
    } catch (e) { fail(res, e, next); }
});

router.post("/pricing/companies/:id/rules/:feeType/reset", async (req, res, next) => {
    const svc = pricingService(res); if (!svc) return;
    try {
        const b = req.body || {};
        await svc.resetRule({
            companyId: req.params.id, feeType: req.params.feeType, note: b.note
        }, actor(req));
        res.json({ success: true, ...(await svc.getCompanyDetail(req.params.id)) });
    } catch (e) { fail(res, e, next); }
});


// ---------------- Super Admin Users (read-only) ----------------

router.get("/users", async (req, res, next) => {
    try {
        const search = String(req.query.search || "").trim().slice(0, 100);
        const where = [];
        const params = [];

        if (search) {
            const like = `%${likeEscape(search)}%`;
            where.push(`(
                company_name LIKE ? OR owner_name LIKE ? OR fullname LIKE ?
                OR name LIKE ? OR mobile LIKE ? OR phone LIKE ?
                OR email LIKE ? OR username LIKE ? OR customer_id LIKE ?
            )`);
            params.push(...Array(9).fill(like));
        }

        const [rows] = await db.execute(
            `SELECT id, company_id, username, fullname, name, company_name,
                    owner_name, mobile, phone, email, role, status,
                    customer_id, created_at
             FROM users
             ${where.length ? "WHERE " + where.join(" AND ") : ""}
             ORDER BY id DESC`,
            params
        );

        res.json({ success: true, users: rows, data: rows });
    } catch (e) { next(e); }
});

router.get("/users/:id", async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                success: false, message: "Invalid user ID."
            });
        }

        const [rows] = await db.execute(
            `SELECT id, company_id, username, fullname, name, company_name,
                    owner_name, mobile, phone, email, address, role, status,
                    customer_id, client_type, created_at
             FROM users WHERE id = ? LIMIT 1`,
            [id]
        );

        if (!rows.length) {
            return res.status(404).json({
                success: false, message: "User not found."
            });
        }

        res.json({ success: true, data: rows[0] });
    } catch (e) { next(e); }
});

// ---------------- Super Admin Permissions ----------------

const SYSTEM_PERMISSIONS = {
    customer_id_auto_generate: "Customer ID Auto Generate",
    bulk_area_edit: "Bulk Area Edit",
    area_management: "Area Management",
    bulk_status_edit: "Bulk Status Edit",
    bulk_auto_disable_edit: "Bulk Auto Disable Edit",
    bulk_package_edit: "Bulk Package Edit",
    bulk_customer_delete: "Bulk Customer Delete",
    bulk_customer_mikrotik_update: "Bulk Customer MikroTik Update",
    customer_auto_connection: "Customer Auto Connection",
    bulk_customer_recharge: "Bulk Customer Recharge",
    add_customer_with_mobile: "Add Customer With Mobile",
    inactive_offline_customer_delete: "Inactive / Offline Customer Delete",
    unpaid_customer_bulk_sms: "Unpaid Customer Bulk SMS",
    show_customer_panel_package: "Show Customer Panel Package",
    customer_invoice: "Customer Invoice",
    without_mikrotik_customer_minus_balance: "Without MikroTik Customer Minus Balance",
    customer_portal: "Customer Portal",
    mikrotik_add: "MikroTik Add",
    mikrotik_delete: "MikroTik Delete",
    promise_date: "Promise Date",
    report_delete: "Report Delete",
    expenditure_delete: "Expenditure Delete",
    bulk_billing_cycle_edit: "Bulk Billing Cycle Edit",
    bulk_promise_date_edit: "Bulk Promise Date Edit",
    bulk_payment_status_edit: "Bulk Payment Status Edit",
    fixed_billing_cycle_date: "Fixed Billing Cycle Date",
    instant_recharge_bill_print: "Instant Recharge Bill Print",
    daily_recharge_feature: "Daily Recharge Feature",
    deposit_update: "Deposit Update",
    dashboard_probability_amount_with_new_customer: "Dashboard Probability Amount With New Customer",
    network_diagram: "Network Diagram",
    network_monitoring: "Network Monitoring",
    traffic_monitoring: "Traffic Monitoring",
    interface_monitor: "Interface Monitor",
    pole_box: "Pole Box",
    olt_add: "OLT Add",
    olt_delete: "OLT Delete",
    olt_user_monitoring: "OLT User Monitoring",
    reseller_add: "Reseller Add",
    multiple_manager: "Multiple Manager",
    reseller_customer_bulk_status_edit: "Reseller Customer Bulk Status Edit",
    reseller_customer_bulk_promise_date_edit: "Reseller Customer Bulk Promise Date Edit",
    reseller_customer_bulk_billing_cycle_edit: "Reseller Customer Bulk Billing Cycle Edit",
    reseller_minus_balance: "Reseller Minus Balance",
    reseller_customer_bulk_auto_connection_edit: "Reseller Customer Bulk Auto Connection Edit",
    reseller_customer_bulk_area_edit: "Reseller Customer Bulk Area Edit",
    reseller_customer_bulk_payment_status_edit: "Reseller Customer Bulk Payment Status Edit",
    bulk_transfer_to_reseller: "Bulk Transfer To Reseller",
    bandwidth_reseller: "Bandwidth Reseller"
};

const PERMISSION_KEYS = Object.keys(SYSTEM_PERMISSIONS);

function normalizePermissionRole(role) {
    return String(role || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

router.get("/permissions/:userId", async (req, res, next) => {
    try {
        const userId = Number(req.params.userId);
        const currentId = Number(req.auth.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({ success: false, message: "Invalid user ID." });
        }

        const [users] = await db.execute(
            `SELECT id, company_id, username, fullname, name, role, status
             FROM users WHERE id = ? LIMIT 1`,
            [userId]
        );

        if (!users.length) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        const target = users[0];
        const [rows] = await db.execute(
            `SELECT permission_key, allowed FROM user_permissions WHERE user_id = ?`,
            [userId]
        );

        const saved = {};
        for (const key of PERMISSION_KEYS) saved[key] = false;

        for (const row of rows) {
            if (Object.prototype.hasOwnProperty.call(saved, row.permission_key)) {
                saved[row.permission_key] = Number(row.allowed) === 1;
            }
        }

        res.json({
            success: true,
            user: target,
            permissions: saved,
            system_permissions: SYSTEM_PERMISSIONS,
            permission_keys: PERMISSION_KEYS,
            can_edit: userId !== currentId &&
                normalizePermissionRole(target.role) !== "superadmin"
        });
    } catch (e) {
        next(e);
    }
});

router.post("/permissions/update", async (req, res, next) => {
    let connection = null;

    try {
        const currentId = Number(req.auth.userId);
        const targetId = Number(req.body && req.body.user_id);

        if (!Number.isInteger(targetId) || targetId <= 0) {
            return res.status(400).json({ success: false, message: "Invalid user ID." });
        }

        if (targetId === currentId) {
            return res.status(403).json({
                success: false,
                message: "Super Admin permissions cannot be changed."
            });
        }

        const [users] = await db.execute(
            `SELECT id, company_id, role FROM users WHERE id = ? LIMIT 1`,
            [targetId]
        );

        if (!users.length) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        if (normalizePermissionRole(users[0].role) === "superadmin") {
            return res.status(403).json({
                success: false,
                message: "Super Admin permissions cannot be modified."
            });
        }

        let permissions = req.body && req.body.permissions || [];
        if (!Array.isArray(permissions)) permissions = [permissions];

        const allowedSet = new Set(
            permissions
                .map(key => String(key || "").trim())
                .filter(key => PERMISSION_KEYS.includes(key))
        );

        connection = await db.getConnection();
        await connection.beginTransaction();

        await connection.execute(
            `DELETE FROM user_permissions WHERE user_id = ?`,
            [targetId]
        );

        for (const key of PERMISSION_KEYS) {
            await connection.execute(
                `INSERT INTO user_permissions
                 (user_id, company_id, permission_key, allowed, created_at, updated_at)
                 VALUES (?, ?, ?, ?, NOW(), NOW())`,
                [
                    targetId,
                    Number(users[0].company_id || 0),
                    key,
                    allowedSet.has(key) ? 1 : 0
                ]
            );
        }

        await connection.commit();

        res.json({ success: true, message: "Permissions updated successfully." });
    } catch (e) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
        }
        next(e);
    } finally {
        if (connection) connection.release();
    }
});


/* ---------------- Registration Invoices (read-only) ---------------- */

router.get("/registration-invoices", async (req, res, next) => {
    try {
        const [rows] = await db.execute(`
            SELECT
                i.id, i.company_id, i.user_id, i.type, i.message_type,
                i.amount, i.status, i.invoice_date, i.due_date, i.paid_date,
                COALESCE(u.name, u.username, CONCAT('User #', i.user_id)) AS user_name,
                u.username
            FROM invoices i
            LEFT JOIN users u ON u.id = i.user_id
            WHERE LOWER(TRIM(COALESCE(i.type, ''))) = 'registration'
               OR LOWER(TRIM(COALESCE(i.message_type, ''))) = 'registration_fee'
            ORDER BY i.id DESC
        `);

        const paid = rows.filter(r => String(r.status || '').toLowerCase() === 'paid').length;
        const unpaid = rows.filter(r => String(r.status || '').toLowerCase() === 'unpaid').length;

        res.json({
            success: true,
            rows,
            summary: { total: rows.length, paid, unpaid }
        });
    } catch (e) {
        next(e);
    }
});

router.get("/registration-invoices/:id", async (req, res, next) => {
    try {
        const invoiceId = Number(req.params.id);

        if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
            return res.status(400).json({ success: false, message: "Invalid invoice ID." });
        }

        const [rows] = await db.execute(`
            SELECT
                i.id, i.company_id, i.user_id, i.type, i.message_type,
                i.amount, i.status, i.invoice_date, i.due_date, i.paid_date,
                COALESCE(u.name, u.username, CONCAT('User #', i.user_id)) AS user_name,
                u.username
            FROM invoices i
            LEFT JOIN users u ON u.id = i.user_id
            WHERE i.id = ?
              AND (
                  LOWER(TRIM(COALESCE(i.type, ''))) = 'registration'
                  OR LOWER(TRIM(COALESCE(i.message_type, ''))) = 'registration_fee'
              )
            LIMIT 1
        `, [invoiceId]);

        if (!rows.length) {
            return res.status(404).json({ success: false, message: "Registration invoice not found." });
        }

        res.json({ success: true, invoice: rows[0] });
    } catch (e) {
        next(e);
    }
});


/* ---------------- Manual Payment Review ---------------- */

router.get("/manual-payments/pending", async (req, res, next) => {
    try {
        const [rows] = await db.execute(`
            SELECT
                p.id, p.billing_id, p.company_id, p.user_id,
                p.payment_mode, p.reference_no, p.amount, p.currency,
                p.status, p.payment_note, p.created_at,
                s.billing_type, s.package_code,
                COALESCE(u.name, u.username, CONCAT('User #', p.user_id)) AS user_name
            FROM software_billing_payments p
            INNER JOIN software_billing_notifications s
                ON s.id = p.billing_id
               AND s.company_id = p.company_id
               AND s.user_id = p.user_id
            LEFT JOIN users u ON u.id = p.user_id
            WHERE p.payment_mode = 'manual'
              AND p.status = 'pending'
            ORDER BY p.created_at ASC, p.id ASC
        `);

        res.json({ success: true, rows });
    } catch (e) {
        next(e);
    }
});

async function reviewMobileManualPayment(req, res, decision) {
    let connection = null;

    try {
        const paymentId = Number(req.params.id);

        if (!Number.isInteger(paymentId) || paymentId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment ID."
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [paymentRows] = await connection.execute(`
            SELECT
                p.id, p.billing_id, p.company_id, p.user_id,
                p.status AS payment_status,
                s.status AS billing_status
            FROM software_billing_payments p
            INNER JOIN software_billing_notifications s
                ON s.id = p.billing_id
               AND s.company_id = p.company_id
               AND s.user_id = p.user_id
            WHERE p.id = ?
              AND p.payment_mode = 'manual'
            LIMIT 1
            FOR UPDATE
        `, [paymentId]);

        if (!paymentRows.length) {
            throw new Error("Manual payment not found.");
        }

        const payment = paymentRows[0];

        if (String(payment.payment_status).toLowerCase() !== "pending") {
            throw new Error("This payment has already been reviewed.");
        }

        if (decision === "approve") {
            if (String(payment.billing_status).toLowerCase() !== "unpaid") {
                throw new Error("Billing is not unpaid. Approval is not allowed.");
            }

            const [billingUpdate] = await connection.execute(`
                UPDATE software_billing_notifications
                SET status = 'paid', paid_at = NOW(), updated_at = NOW()
                WHERE id = ? AND company_id = ? AND user_id = ?
                  AND status = 'unpaid'
                LIMIT 1
            `, [payment.billing_id, payment.company_id, payment.user_id]);

            if (billingUpdate.affectedRows !== 1) {
                throw new Error("Billing could not be marked paid.");
            }

            const [invoiceUpdate] = await connection.execute(`
                UPDATE invoices
                SET status = 'paid', paid_date = NOW()
                WHERE billing_id = ? AND company_id = ? AND user_id = ?
                  AND status = 'unpaid'
            `, [payment.billing_id, payment.company_id, payment.user_id]);

            if (invoiceUpdate.affectedRows < 1) {
                throw new Error("Software invoice not found or already paid. Approval cancelled.");
            }

            const [paymentUpdate] = await connection.execute(`
                UPDATE software_billing_payments
                SET status = 'paid', paid_at = NOW(), updated_at = NOW()
                WHERE id = ? AND status = 'pending'
                LIMIT 1
            `, [paymentId]);

            if (paymentUpdate.affectedRows !== 1) {
                throw new Error("Payment approval could not be saved.");
            }
        } else {
            const [paymentUpdate] = await connection.execute(`
                UPDATE software_billing_payments
                SET status = 'rejected', updated_at = NOW()
                WHERE id = ? AND status = 'pending'
                LIMIT 1
            `, [paymentId]);

            if (paymentUpdate.affectedRows !== 1) {
                throw new Error("Payment rejection could not be saved.");
            }
        }

        await connection.commit();

        return res.json({
            success: true,
            message: decision === "approve"
                ? "Payment approved. Billing and invoice marked paid."
                : "Payment rejected. Billing remains unpaid."
        });
    } catch (e) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
        }

        return res.status(400).json({
            success: false,
            message: e.message || "Unable to review payment."
        });
    } finally {
        if (connection) connection.release();
    }
}

router.post("/manual-payments/:id/approve", (req, res) =>
    reviewMobileManualPayment(req, res, "approve")
);

router.post("/manual-payments/:id/reject", (req, res) =>
    reviewMobileManualPayment(req, res, "reject")
);


// SUPER ADMIN: EXTEND MONTHLY BILL DUE DATE
const MOBILE_BD_OFFSET_MS = 6 * 60 * 60 * 1000;
const MOBILE_MAX_EXTEND_DAYS = 90;

function parseMobileDue(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?$/.exec(String(value || "").trim());
    if (!m) return null;

    const [y, mo, d, h, mi] = m.slice(1).map(Number);
    const date = new Date(Date.UTC(y, mo - 1, d, h, mi) - MOBILE_BD_OFFSET_MS);
    const check = new Date(date.getTime() + MOBILE_BD_OFFSET_MS);

    if (
        check.getUTCFullYear() !== y ||
        check.getUTCMonth() !== mo - 1 ||
        check.getUTCDate() !== d ||
        check.getUTCHours() !== h ||
        check.getUTCMinutes() !== mi ||
        y < 2020 || y > 2100
    ) return null;

    return {
        text: `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:00`,
        date
    };
}

router.get("/billing-extend/list", async (req, res) => {
    try {
        const nowBd = new Date(Date.now() + MOBILE_BD_OFFSET_MS)
            .toISOString().slice(0, 19).replace("T", " ");

        const [rows] = await db.execute(`
            SELECT s.id, s.company_id, s.user_id, s.package_code, s.amount,
                   DATE_FORMAT(s.due_date, '%Y-%m-%d %H:%i') AS due_date,
                   DATE_FORMAT(s.original_due_date, '%Y-%m-%d %H:%i') AS original_due_date,
                   DATE_FORMAT(s.extended_at, '%Y-%m-%d %H:%i') AS extended_at,
                   (s.due_date < ?) AS overdue,
                   COALESCE(u.company_name, u.fullname, u.name, u.username,
                            CONCAT('User #', s.user_id)) AS user_name,
                   u.username
            FROM software_billing_notifications s
            LEFT JOIN users u ON u.id = s.user_id
            WHERE s.status = 'unpaid' AND s.billing_type = 'monthly'
            ORDER BY s.due_date ASC, s.id DESC
        `, [nowBd]);

        return res.json({ success: true, rows });
    } catch (e) {
        console.error("MOBILE BILLING EXTEND LIST ERROR:", e);
        return res.status(500).json({
            success: false,
            message: "Unable to load bills."
        });
    }
});

router.post("/billing-extend", async (req, res) => {
    const id = Number(req.body && req.body.billing_id);
    const parsed = parseMobileDue(req.body && req.body.due_date);

    if (!Number.isInteger(id) || id <= 0 || !parsed) {
        return res.status(400).json({
            success: false,
            message: "Invalid bill or date."
        });
    }

    if (parsed.date.getTime() <= Date.now()) {
        return res.status(400).json({
            success: false,
            message: "The new date must be in the future."
        });
    }

    if (parsed.date.getTime() > Date.now() + MOBILE_MAX_EXTEND_DAYS * 24 * 3600 * 1000) {
        return res.status(400).json({
            success: false,
            message: `Maximum ${MOBILE_MAX_EXTEND_DAYS} days from today.`
        });
    }

    let connection = null;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.execute(`
            SELECT id, company_id, user_id
            FROM software_billing_notifications
            WHERE id = ? AND status = 'unpaid' AND billing_type = 'monthly'
            LIMIT 1 FOR UPDATE
        `, [id]);

        if (!rows.length) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Bill not found or already paid."
            });
        }

        const nowBd = new Date(Date.now() + MOBILE_BD_OFFSET_MS)
            .toISOString().slice(0, 19).replace("T", " ");

        await connection.execute(`
            UPDATE software_billing_notifications
            SET original_due_date = COALESCE(original_due_date, due_date),
                due_date = ?, extended_by = ?, extended_at = ?, updated_at = ?
            WHERE id = ?
        `, [parsed.text, Number(req.auth.userId), nowBd, nowBd, id]);

        await connection.execute(`
            UPDATE invoices
            SET due_date = ?
            WHERE billing_id = ? AND company_id = ? AND user_id = ?
              AND status = 'unpaid'
        `, [parsed.text, id, rows[0].company_id, rows[0].user_id]);

        await connection.commit();

        return res.json({
            success: true,
            message: "Due date extended."
        });
    } catch (e) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
        }

        console.error("MOBILE BILLING EXTEND ERROR:", e);
        return res.status(500).json({
            success: false,
            message: "Unable to extend due date."
        });
    } finally {
        if (connection) connection.release();
    }
});


// MOBILE SUPER ADMIN NOTICES
function parseNoticeDateTime(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value || '').trim());
    if (!m) return null;

    const parts = m.slice(1).map((v, i) => v == null && i === 5 ? 0 : Number(v));
    const [year, month, day, hour, minute, second] = parts;
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day ||
        hour > 23 || minute > 59 || second > 59
    ) return null;

    return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] || '00'}`;
}

function validateMobileNotice(body) {
    const type = String(body.notice_type || '').trim();
    const title = String(body.title || '').trim();
    const message = String(body.message || '').trim();
    const startsAt = parseNoticeDateTime(body.starts_at);
    const endsAt = parseNoticeDateTime(body.ends_at);
    const status = body.status === 'inactive' ? 'inactive' : 'active';

    if (type !== 'maintenance') return { error: 'Only maintenance notices can be created here.' };
    if (!title || title.length > 190) return { error: 'Title is required (max 190 characters).' };
    if (!message || message.length > 3000) return { error: 'Message is required (max 3000 characters).' };
    if (!startsAt || !endsAt) return { error: 'Start and end time are required.' };
    if (endsAt <= startsAt) return { error: 'End time must be after start time.' };

    let companyId = null;
    const rawCompany = String(body.company_id ?? '').trim();
    if (rawCompany !== '') {
        const n = Number(rawCompany);
        if (!Number.isInteger(n) || n <= 0) {
            return { error: 'Company ID must be a positive number (or empty for all companies).' };
        }
        companyId = n;
    }

    return { values: { type, title, message, startsAt, endsAt, companyId, status } };
}

router.get('/notices/list', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT id, notice_type, title, message,
                   DATE_FORMAT(starts_at, '%Y-%m-%d %H:%i:%s') AS starts_at,
                   DATE_FORMAT(ends_at, '%Y-%m-%d %H:%i:%s') AS ends_at,
                   company_id, status,
                   CASE
                       WHEN status = 'inactive' THEN 'inactive'
                       WHEN NOW() < starts_at THEN 'scheduled'
                       WHEN NOW() > ends_at THEN 'expired'
                       ELSE 'live'
                   END AS state
            FROM notices
            ORDER BY id DESC
        `);
        return res.json({ success: true, rows });
    } catch (error) {
        console.error('MOBILE NOTICE LIST ERROR:', error);
        return res.status(500).json({
            success: false,
            message: 'Unable to load notices. Did you create the notices table?'
        });
    }
});

router.post('/notices', async (req, res) => {
    const { values, error } = validateMobileNotice(req.body || {});
    if (error) return res.status(400).json({ success: false, message: error });

    try {
        const [result] = await db.execute(`
            INSERT INTO notices
                (notice_type, title, message, starts_at, ends_at, company_id, status, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            values.type, values.title, values.message, values.startsAt,
            values.endsAt, values.companyId, values.status, Number(req.auth.userId)
        ]);

        return res.status(201).json({
            success: true, message: 'Notice created.', id: result.insertId
        });
    } catch (error) {
        console.error('MOBILE NOTICE CREATE ERROR:', error);
        return res.status(500).json({ success: false, message: 'Unable to create notice.' });
    }
});

router.put('/notices/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid notice id.' });
    }

    const { values, error } = validateMobileNotice(req.body || {});
    if (error) return res.status(400).json({ success: false, message: error });

    try {
        const [result] = await db.execute(`
            UPDATE notices
            SET notice_type = ?, title = ?, message = ?, starts_at = ?,
                ends_at = ?, company_id = ?, status = ?
            WHERE id = ?
        `, [
            values.type, values.title, values.message, values.startsAt,
            values.endsAt, values.companyId, values.status, id
        ]);

        if (!result.affectedRows) {
            const [found] = await db.execute('SELECT id FROM notices WHERE id = ? LIMIT 1', [id]);
            if (!found.length) {
                return res.status(404).json({ success: false, message: 'Notice not found.' });
            }
        }

        return res.json({ success: true, message: 'Notice updated.' });
    } catch (error) {
        console.error('MOBILE NOTICE UPDATE ERROR:', error);
        return res.status(500).json({ success: false, message: 'Unable to update notice.' });
    }
});

router.delete('/notices/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid notice id.' });
    }

    try {
        const [result] = await db.execute('DELETE FROM notices WHERE id = ?', [id]);
        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'Notice not found.' });
        }
        return res.json({ success: true, message: 'Notice deleted.' });
    } catch (error) {
        console.error('MOBILE NOTICE DELETE ERROR:', error);
        return res.status(500).json({ success: false, message: 'Unable to delete notice.' });
    }
});


/* Super Admin: Payment Gateway configuration */
const MOBILE_GATEWAY_FIELDS = {
    nagad: ["merchantId", "merchantNumber", "publicKey", "privateKey"],
    bkash: ["app_key", "app_secret", "username", "password"],
    sslcommerz: ["store_id", "store_password"],
    shurjopay: ["username", "password", "prefix"]
};
const MOBILE_GATEWAY_PUBLIC_FIELDS = [
    "merchantId", "merchantNumber", "app_key", "username", "store_id", "prefix"
];

router.get("/payment-gateways/list", async (req, res) => {
    try {
        const scope = String(req.query.scope || "central").trim().toLowerCase();
        if (!["central", "customer"].includes(scope)) {
            return res.status(400).json({ success: false, message: "Invalid merchant account scope." });
        }

        const companyId = scope === "central" ? 0 : Number(req.query.company_id);
        if (scope === "customer" && (!Number.isInteger(companyId) || companyId <= 0)) {
            return res.status(400).json({ success: false, message: "Select a valid ISP company." });
        }

        const gateways = [];
        for (const gateway of paymentService.SUPPORTED_GATEWAYS) {
            const config = await paymentService.getGateway(companyId, gateway, scope);
            const credentials = config?.credentials || {};
            const publicCredentials = {};
            const credentialsSet = {};

            for (const key of MOBILE_GATEWAY_FIELDS[gateway] || []) {
                credentialsSet[key] = Boolean(
                    typeof credentials[key] === "string" && credentials[key].length
                );
                if (MOBILE_GATEWAY_PUBLIC_FIELDS.includes(key) && credentialsSet[key]) {
                    publicCredentials[key] = credentials[key];
                }
            }

            gateways.push({
                gateway,
                scope,
                enabled: Boolean(config?.enabled),
                environment: config?.environment || "sandbox",
                settings: config?.settings || {},
                credentials_public: publicCredentials,
                credentials_set: credentialsSet
            });
        }

        return res.json({ success: true, scope, gateways });
    } catch (error) {
        console.error("MOBILE PAYMENT GATEWAY LIST:", error);
        return res.status(500).json({ success: false, message: "Unable to load payment gateways." });
    }
});

router.post("/payment-gateways/save", async (req, res) => {
    try {
        const body = req.body || {};
        const scope = String(body.scope || "central").trim().toLowerCase();
        const gateway = String(body.gateway || "").trim().toLowerCase();

        if (!["central", "customer"].includes(scope)) {
            return res.status(400).json({ success: false, message: "Invalid merchant account scope." });
        }
        if (!Object.prototype.hasOwnProperty.call(MOBILE_GATEWAY_FIELDS, gateway)) {
            return res.status(400).json({
                success: false,
                message: "This gateway has no online payment-confirmation API. It remains Manual Submit."
            });
        }

        const companyId = scope === "central" ? 0 : Number(body.company_id);
        if (scope === "customer" && (!Number.isInteger(companyId) || companyId <= 0)) {
            return res.status(400).json({ success: false, message: "Select a valid ISP company." });
        }

        const environment = String(body.environment || "sandbox").trim().toLowerCase();
        if (!["sandbox", "live"].includes(environment)) {
            return res.status(400).json({ success: false, message: "Invalid gateway environment." });
        }

        const incoming = body.credentials || {};
        const credentials = {};
        for (const key of MOBILE_GATEWAY_FIELDS[gateway]) {
            if (typeof incoming[key] === "string") {
                credentials[key] = incoming[key].trim().slice(0, 4000);
            }
        }

        if (gateway === "nagad") {
            const nagadService = require("../../services/payment/nagad.service");
            if (credentials.publicKey) nagadService._test.loadPublicKey(credentials.publicKey);
            if (credentials.privateKey) nagadService._test.loadPrivateKey(credentials.privateKey);
        }

        const settings = {};
        const rawSettings = body.settings || {};
        const slug = String(rawSettings.slug || "").trim().toLowerCase();

        if (slug) {
            if (scope !== "customer") {
                return res.status(400).json({
                    success: false,
                    message: "Checkout link applies to ISP gateways only."
                });
            }
            if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) {
                return res.status(400).json({
                    success: false,
                    message: "Checkout link: use 3-40 letters, digits or hyphens."
                });
            }
            settings.slug = slug;
        }

        await paymentService.saveGateway({
            companyId,
            scope,
            gateway,
            enabled: Boolean(body.enabled),
            environment,
            credentials,
            settings
        });

        return res.json({
            success: true,
            message: "Payment gateway configuration saved."
        });
    } catch (error) {
        const known = error.status || error.name === "NagadError" ||
            /Invalid|Unsupported|required|taken|Checkout|company/i.test(error.message || "");
        if (!known) console.error("MOBILE PAYMENT GATEWAY SAVE:", error);
        return res.status(error.status || (known ? 400 : 500)).json({
            success: false,
            message: known ? error.message : "Unable to save gateway configuration."
        });
    }
});
module.exports = router;

