"use strict";

const express = require("express");
const router = express.Router();

const path = require("path");
const db = require("../../config/database");
const { requireAuth } = require("../../middleware/auth");

router.use(requireAuth);

/*
|--------------------------------------------------------------------------
| PERMISSIONS
|--------------------------------------------------------------------------
|
| Admin (company owner) sees everything.
| Manager / Collector / Employee / Staff see only the dashboard blocks that
| were ticked on the Staff Add / Edit page.
|
| Keys (put these as checkboxes on the staff add page):
|
|   dashboard.customers          customer cards (total, active, paid ...)
|   dashboard.collection         expected/collection circle + collection cards
|   dashboard.finance            connection fee, discount, expenditure, salary, balance
|   dashboard.mikrotik           MikroTik monitoring (online / offline)
|   dashboard.chart              collection chart
|   dashboard.admin_summary      "Admin" block
|   dashboard.collector_summary  "Collector" block
|
*/

const ALL_PERMISSIONS = [
    "dashboard.customers",
    "dashboard.collection",
    "dashboard.finance",
    "dashboard.mikrotik",
    "dashboard.chart",
    "dashboard.admin_summary",
    "dashboard.collector_summary"
];

const ADMIN_ROLES = ["superadmin", "admin", "companyadmin", "owner"];

/* used ONLY when no permission list was saved for the staff member at all */
const ROLE_DEFAULTS = {
    manager: [
        "dashboard.customers",
        "dashboard.collection",
        "dashboard.finance",
        "dashboard.mikrotik",
        "dashboard.chart"
    ],
    collector: [
        "dashboard.customers",
        "dashboard.collection"
    ],
    employee: ["dashboard.customers"],
    staff: ["dashboard.customers"]
};

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function normalizeRows(result) {
    if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
    if (Array.isArray(result)) return result;
    return [];
}

async function query(sql, params = []) {
    try {
        return normalizeRows(await db.query(sql, params));
    } catch (error) {
        console.error("[Dashboard SQL ERROR]", error.message);
        console.error(sql);
        throw error;
    }
}

/* optional data: a missing table/column must not break the whole dashboard */
async function safeQuery(sql, params = [], fallback = []) {
    try {
        return normalizeRows(await db.query(sql, params));
    } catch (error) {
        console.warn("[Dashboard] optional query skipped:", error.message);
        return fallback;
    }
}

/*
 * null      -> nothing saved (use role defaults)
 * []        -> saved, but empty (no access)
 * [ ... ]   -> saved list
 */
function parsePermissions(value) {
    if (value === undefined || value === null) return null;

    if (Array.isArray(value)) return value.map(String);

    const text = String(value).trim();

    if (text === "") return null;

    try {
        const parsed = JSON.parse(text);

        if (Array.isArray(parsed)) return parsed.map(String);

        if (parsed && typeof parsed === "object") {
            return Object.keys(parsed).filter(k => parsed[k]);
        }
    } catch (e) {
        /* not JSON – comma list */
    }

    return text.split(",").map(s => s.trim()).filter(Boolean);
}

async function resolvePermissions(req, userId, role) {
    if (ADMIN_ROLES.includes(role)) {
        return new Set(ALL_PERMISSIONS);
    }

    let list = parsePermissions(req.session.permissions);

    if (list === null) {
        const rows = await safeQuery(
            "SELECT permissions FROM users WHERE id = ? LIMIT 1",
            [userId]
        );

        list = parsePermissions(rows[0]?.permissions);
    }

    if (list === null) {
        list = ROLE_DEFAULTS[role] || ["dashboard.customers"];
    }

    return new Set(list.filter(p => ALL_PERMISSIONS.includes(p)));
}

async function getContext(req) {
    const userId = Number(req.session.user_id || req.session.userId || 0);
    const companyId = Number(req.session.company_id || req.session.companyId || 0);
    const role = String(req.session.role || "").trim().toLowerCase().replace(/[\s_-]+/g, "");

    return {
        userId,
        companyId,
        role,
        isSuperAdmin: role === "superadmin",
        permissions: await resolvePermissions(req, userId, role)
    };
}

function parseMonth(value) {
    const m = /^(\d{4})-(\d{1,2})$/.exec(String(value || ""));
    const now = new Date();

    let year = now.getFullYear();
    let month = now.getMonth() + 1;

    if (m) {
        const y = Number(m[1]);
        const mo = Number(m[2]);

        if (y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12) {
            year = y;
            month = mo;
        }
    }

    return { year, month };
}

/*
|--------------------------------------------------------------------------
| HTML
|--------------------------------------------------------------------------
*/

router.get("/", (req, res) => {
    res.sendFile("dashboard/dashboard.html", {
        root: path.join(__dirname, "..", "views")
    });
});

/*
|--------------------------------------------------------------------------
| DATA
|--------------------------------------------------------------------------
*/

router.get("/data", async (req, res) => {
    try {
        const ctx = await getContext(req);
        const can = key => ctx.permissions.has(key);

        /* -------------------- SUPER ADMIN -------------------- */

        if (ctx.isSuperAdmin) {
            const [
                registeredUsers, activeUsers, registrationInvoices,
                paidRegistration, unpaidRegistration, registrationAmounts
            ] = await Promise.all([
                query(`SELECT COUNT(*) AS total FROM users`),
                query(`SELECT COUNT(*) AS total FROM users WHERE status = 'active'`),
                query(`SELECT COUNT(*) AS total FROM software_billing_notifications WHERE billing_type = 'registration'`),
                query(`SELECT COUNT(*) AS total FROM software_billing_notifications WHERE billing_type = 'registration' AND status = 'paid'`),
                query(`SELECT COUNT(*) AS total FROM software_billing_notifications WHERE billing_type = 'registration' AND status <> 'paid'`),
                query(`
                    SELECT
                        COALESCE(SUM(CASE WHEN billing_type = 'registration' THEN amount ELSE 0 END), 0) AS total_amount,
                        COALESCE(SUM(CASE WHEN billing_type = 'registration' AND status = 'paid' THEN amount ELSE 0 END), 0) AS paid_amount,
                        COALESCE(SUM(CASE WHEN billing_type = 'registration' AND status <> 'paid' THEN amount ELSE 0 END), 0) AS unpaid_amount
                    FROM software_billing_notifications
                `)
            ]);

            const amount = registrationAmounts[0] || {};

            return res.json({
                success: true,
                type: "super_admin",
                registered_users: toNumber(registeredUsers[0]?.total),
                active_users: toNumber(activeUsers[0]?.total),
                registration_invoices: toNumber(registrationInvoices[0]?.total),
                paid_registration: toNumber(paidRegistration[0]?.total),
                unpaid_registration: toNumber(unpaidRegistration[0]?.total),
                registration_collection: toNumber(amount.total_amount),
                registration_paid_amount: toNumber(amount.paid_amount),
                registration_unpaid_amount: toNumber(amount.unpaid_amount),
                software_payments: 0
            });
        }

        /* -------------------- COMPANY -------------------- */

        if (!ctx.companyId || !ctx.userId) {
            return res.status(403).json({
                success: false,
                message: "Company context is missing."
            });
        }

        const { year, month } = parseMonth(req.query.month);
        const companyId = ctx.companyId;

        const out = {
            success: true,
            type: "company",
            role: ctx.role,
            permissions: Array.from(ctx.permissions),
            month: `${year}-${String(month).padStart(2, "0")}`,
            year,
            month_number: month
        };

        const needCustomers =
            can("dashboard.customers") ||
            can("dashboard.collection") ||
            can("dashboard.finance") ||
            can("dashboard.admin_summary") ||
            can("dashboard.collector_summary");

        /* ---------- per-customer rows (all customer / collection cards) ---------- */

        let totals = null;

        if (needCustomers) {
            const sqlWith = `
                SELECT
                    c.status,
                    COALESCE(c.monthly_bill, 0) AS bill,
                    c.promise_date,
                    c.created_at,
                    p.paid_amount,
                    (p.customer_id IS NOT NULL) AS paid
                FROM customers c
                LEFT JOIN (
                    SELECT customer_id, SUM(amount) AS paid_amount
                    FROM payments
                    WHERE company_id = ?
                      AND billing_month = ?
                      AND billing_year = ?
                      AND deleted_at IS NULL
                    GROUP BY customer_id
                ) p ON p.customer_id = c.id
                WHERE c.company_id = ?
                  AND c.deleted_at IS NULL
            `;

            const params = [companyId, month, year, companyId];

            let rows;

            try {
                rows = await query(sqlWith, params);
            } catch (e) {
                /* customers.created_at missing -> "New Customer" shows 0 */
                rows = await query(
                    sqlWith.replace("c.created_at,", "NULL AS created_at,"),
                    params
                );
            }

            const now = new Date();

            const blank = () => ({
                total: 0, active: 0, paid: 0, unpaid: 0,
                expired: 0, inactive: 0, free: 0,
                a_active: 0, a_paid: 0, a_unpaid: 0, a_expired: 0, a_inactive: 0,
                collected: 0
            });

            const all = blank();
            const fresh = blank();

            for (const r of rows) {
                const bill = toNumber(r.bill);
                const isActive = String(r.status || "") === "Active";
                const isPaid = Number(r.paid) === 1;
                const paidAmount = toNumber(r.paid_amount);
                const isExpired = r.promise_date && new Date(r.promise_date) < now;
                const isFree = bill === 0;

                const created = r.created_at ? new Date(r.created_at) : null;
                const isNew =
                    created &&
                    created.getFullYear() === year &&
                    created.getMonth() + 1 === month;

                const bucket = (b) => {
                    b.total += 1;
                    if (isActive) { b.active += 1; b.a_active += bill; }
                    else { b.inactive += 1; b.a_inactive += bill; }
                    if (isPaid) { b.paid += 1; b.a_paid += paidAmount; b.collected += paidAmount; }
                    else { b.unpaid += 1; b.a_unpaid += bill; }
                    if (isExpired) { b.expired += 1; b.a_expired += bill; }
                    if (isFree) b.free += 1;
                };

                bucket(all);
                if (isNew) bucket(fresh);

                all.bill = (all.bill || 0) + bill;
            }

            totals = { all, fresh, totalBill: all.bill || 0 };
        }

        /* ---------- customers block ---------- */

        if (can("dashboard.customers") && totals) {
            out.customers = {
                counts: {
                    total: totals.all.total,
                    active: totals.all.active,
                    paid: totals.all.paid,
                    unpaid: totals.all.unpaid,
                    expired: totals.all.expired,
                    inactive: totals.all.inactive,
                    free: totals.all.free
                },
                amounts: {
                    active: totals.all.a_active,
                    paid: totals.all.a_paid,
                    unpaid: totals.all.a_unpaid,
                    expired: totals.all.a_expired,
                    inactive: totals.all.a_inactive
                },
                new_counts: {
                    total: totals.fresh.total,
                    active: totals.fresh.active,
                    paid: totals.fresh.paid,
                    unpaid: totals.fresh.unpaid,
                    expired: totals.fresh.expired,
                    inactive: totals.fresh.inactive
                },
                new_amounts: {
                    active: totals.fresh.a_active,
                    paid: totals.fresh.a_paid,
                    unpaid: totals.fresh.a_unpaid,
                    expired: totals.fresh.a_expired,
                    inactive: totals.fresh.a_inactive
                }
            };
        }

        /* ---------- shared money numbers ---------- */

        const needMoney =
            can("dashboard.collection") ||
            can("dashboard.finance") ||
            can("dashboard.admin_summary") ||
            can("dashboard.collector_summary");

        let money = null;

        if (needMoney) {
            const [
                paymentRows, todayRows, feeRows, todayFeeRows,
                expenseRows, todayExpenseRows, discountRows, todayDiscountRows
            ] = await Promise.all([
                query(`
                    SELECT COALESCE(SUM(amount), 0) AS v
                    FROM payments
                    WHERE company_id = ? AND billing_month = ? AND billing_year = ? AND deleted_at IS NULL
                `, [companyId, month, year]),

                query(`
                    SELECT COALESCE(SUM(amount), 0) AS v
                    FROM payments
                    WHERE company_id = ? AND DATE(payment_date) = CURDATE() AND deleted_at IS NULL
                `, [companyId]),

                safeQuery(`
                    SELECT COALESCE(SUM(connection_fee), 0) AS v
                    FROM customers
                    WHERE company_id = ? AND deleted_at IS NULL
                      AND YEAR(created_at) = ? AND MONTH(created_at) = ?
                `, [companyId, year, month]),

                safeQuery(`
                    SELECT COALESCE(SUM(connection_fee), 0) AS v
                    FROM customers
                    WHERE company_id = ? AND deleted_at IS NULL AND DATE(created_at) = CURDATE()
                `, [companyId]),

                safeQuery(`SELECT COALESCE(SUM(amount), 0) AS v FROM expenditures WHERE company_id = ?`, [companyId]),

                safeQuery(`
                    SELECT COALESCE(SUM(amount), 0) AS v
                    FROM expenditures
                    WHERE company_id = ? AND DATE(created_at) = CURDATE()
                `, [companyId]),

                safeQuery(`
                    SELECT COALESCE(SUM(discount), 0) AS v
                    FROM payments
                    WHERE company_id = ? AND billing_month = ? AND billing_year = ? AND deleted_at IS NULL
                `, [companyId, month, year]),

                safeQuery(`
                    SELECT COALESCE(SUM(discount), 0) AS v
                    FROM payments
                    WHERE company_id = ? AND DATE(payment_date) = CURDATE() AND deleted_at IS NULL
                `, [companyId])
            ]);

            money = {
                collection: toNumber(paymentRows[0]?.v),
                today: toNumber(todayRows[0]?.v),
                connFee: toNumber(feeRows[0]?.v),
                todayConnFee: toNumber(todayFeeRows[0]?.v),
                expenditure: toNumber(expenseRows[0]?.v),
                todayExpenditure: toNumber(todayExpenseRows[0]?.v),
                discount: toNumber(discountRows[0]?.v),
                todayDiscount: toNumber(todayDiscountRows[0]?.v),
                salary: 0
            };

            money.balance = money.collection - money.expenditure - money.salary;
        }

        /* ---------- collection block ---------- */

        if (can("dashboard.collection") && money && totals) {
            const expected = totals.totalBill;

            out.collection = {
                expected,
                collection: money.collection,
                percent: expected > 0 ? clamp((money.collection / expected) * 100, 0, 100) : 0,
                paid_count: totals.all.paid,
                new_paid_count: totals.fresh.paid,
                new_paid_amount: totals.fresh.collected,
                bill_and_fee: expected + money.connFee,
                today: money.today
            };
        }

        /* ---------- finance block ---------- */

        if (can("dashboard.finance") && money) {
            out.finance = {
                connection_fee: money.connFee,
                today_connection_fee: money.todayConnFee,
                discount: money.discount,
                today_discount: money.todayDiscount,
                expenditure: money.expenditure,
                today_expenditure: money.todayExpenditure,
                salary: money.salary,
                balance: money.balance
            };
        }

        /* ---------- mikrotik ---------- */

        if (can("dashboard.mikrotik")) {
            const [routerTotal, routerRow] = await Promise.all([
                query(`SELECT COUNT(*) AS total FROM mikrotik_servers WHERE company_id = ?`, [companyId]),
                query(`SELECT id, name FROM mikrotik_servers WHERE company_id = ? ORDER BY id ASC LIMIT 1`, [companyId])
            ]);

            out.mikrotik = {
                total: toNumber(routerTotal[0]?.total),
                router_id: routerRow[0] ? Number(routerRow[0].id) : null,
                router_name: routerRow[0] ? routerRow[0].name : null
            };
        }

        /* ---------- chart: collector list ---------- */

        if (can("dashboard.chart")) {
            out.collectors = (await safeQuery(
                `SELECT id, name FROM users WHERE company_id = ? AND role = 'collector' ORDER BY name ASC`,
                [companyId]
            )).map(r => ({ id: Number(r.id), name: r.name }));
        }

        /* ---------- admin summary ---------- */

        if (can("dashboard.admin_summary") && money) {
            out.admin = {
                collection: money.collection,
                today_collection: money.today,
                connection_fee: money.connFee,
                today_connection_fee: money.todayConnFee,
                expenditure: money.expenditure,
                discount: money.discount,
                today_discount: money.todayDiscount,
                salary: money.salary,
                deposit: 0,
                balance: money.balance,
                messages: { masking: 0, non_masking: 0, fixed: 0 }
            };
        }

        /* ---------- collector summary ---------- */

        if (can("dashboard.collector_summary") && money) {
            const collectorCount = await safeQuery(
                `SELECT COUNT(*) AS total FROM users WHERE company_id = ? AND role = 'collector'`,
                [companyId]
            );

            out.collector = {
                total: toNumber(collectorCount[0]?.total),
                today_collection: money.today,
                connection_fee: 0,
                deposit: 0,
                expenditure: 0,
                balance: 0
            };
        }

        /* ---------- software billing (admin only) ---------- */

        if (ADMIN_ROLES.includes(ctx.role)) {
            const billing = await safeQuery(`
                SELECT id, amount, status, due_date, NULL AS message
                FROM software_billing_notifications
                WHERE company_id = ? AND (user_id = ? OR user_id IS NULL)
                ORDER BY CASE WHEN status <> 'paid' THEN 0 ELSE 1 END, due_date ASC, id DESC
                LIMIT 1
            `, [companyId, ctx.userId]);

            const software = billing[0] || null;

            out.pending_billing = software
                ? {
                    id: Number(software.id),
                    amount: toNumber(software.amount),
                    status: software.status,
                    due_date: software.due_date,
                    invoice_date: null,
                    message: software.message || ""
                }
                : null;
        }

        return res.json(out);

    } catch (error) {
        console.error("[Dashboard] Data error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load dashboard data."
        });
    }
});

/*
|--------------------------------------------------------------------------
| CHART  (daily amount / bill count of one month)
|--------------------------------------------------------------------------
*/

router.get("/chart", async (req, res) => {
    try {
        const ctx = await getContext(req);

        if (!ctx.isSuperAdmin && !ctx.permissions.has("dashboard.chart")) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to view this chart."
            });
        }

        const year = clamp(toNumber(req.query.year) || new Date().getFullYear(), 2000, 2100);
        const month = clamp(toNumber(req.query.month) || (new Date().getMonth() + 1), 1, 12);
        const collectorId = Number(req.query.collector_id || 0);

        const base = `
            SELECT DAY(payment_date) AS d, COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS bills
            FROM payments
            WHERE company_id = ?
              AND deleted_at IS NULL
              AND YEAR(payment_date) = ?
              AND MONTH(payment_date) = ?
        `;

        let rows;

        if (collectorId > 0) {
            /* needs payments.collected_by – if the column is named differently change it here */
            rows = await safeQuery(
                `${base} AND collected_by = ? GROUP BY DAY(payment_date)`,
                [ctx.companyId, year, month, collectorId],
                null
            );
        }

        if (!rows) {
            rows = await query(
                `${base} GROUP BY DAY(payment_date)`,
                [ctx.companyId, year, month]
            );
        }

        const days = new Date(year, month, 0).getDate();
        const amount = new Array(days).fill(0);
        const bills = new Array(days).fill(0);

        for (const r of rows) {
            const i = Number(r.d) - 1;

            if (i >= 0 && i < days) {
                amount[i] = toNumber(r.amount);
                bills[i] = toNumber(r.bills);
            }
        }

        return res.json({
            success: true,
            labels: Array.from({ length: days }, (_, i) => String(i + 1)),
            amount,
            bill: bills
        });

    } catch (error) {
        console.error("[Dashboard] Chart error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load chart."
        });
    }
});

module.exports = router;
