"use strict";

const express = require("express");
const router = express.Router();

const path = require("path");
const db = require("../config/database");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

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

    /*
    |--------------------------------------------------------------------------
    | mysql2 returns:
    |
    | [
    |     [ rows ],
    |     [ fields ]
    | ]
    |--------------------------------------------------------------------------
    */

    if (
        Array.isArray(result) &&
        Array.isArray(result[0])
    ) {
        return result[0];
    }

    if (Array.isArray(result)) {
        return result;
    }

    return [];
}

async function query(sql, params = []) {

    try {

        const result =
            await db.query(sql, params);

        return normalizeRows(result);

    } catch (error) {

        console.error("================================");
        console.error("[Dashboard SQL ERROR]");
        console.error(error.message);
        console.error("[SQL]");
        console.error(sql);
        console.error("[PARAMS]");
        console.error(params);
        console.error("================================");

        throw error;
    }
}

/*
|--------------------------------------------------------------------------
| Optional metrics
|--------------------------------------------------------------------------
| New dashboard cards (new customers, per-status amounts, today values,
| collectors, daily chart) must never break the main dashboard:
| - they run through safeQuery(), which logs and returns a fallback on error
| - they only touch columns that really exist (checked once, then cached)
*/

async function safeQuery(sql, params = [], fallback = []) {

    try {

        const result =
            await db.query(sql, params);

        return normalizeRows(result);

    } catch (error) {

        console.warn(
            "[Dashboard] optional query skipped:",
            error.message
        );

        return fallback;
    }
}

const columnCache = new Map();

const COLUMN_CACHE_MS = 10 * 60 * 1000;

async function tableColumns(table) {

    const cached = columnCache.get(table);

    if (
        cached &&
        Date.now() - cached.time < COLUMN_CACHE_MS
    ) {
        return cached.columns;
    }

    let columns = new Set();

    try {

        const rows = normalizeRows(
            await db.query(`SHOW COLUMNS FROM \`${table}\``)
        );

        columns = new Set(
            rows.map(row => row.Field)
        );

    } catch (_) {
        // Missing table → empty set → dependent metrics stay at 0.
    }

    columnCache.set(table, {
        columns,
        time: Date.now()
    });

    return columns;
}

// Candidates are hard-coded identifiers, never user input.
async function firstColumn(table, candidates) {

    const columns = await tableColumns(table);

    return candidates.find(name => columns.has(name)) || null;
}

function monthRange(year, month) {

    const pad = n => String(n).padStart(2, "0");

    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;

    return {
        start: `${year}-${pad(month)}-01`,
        end: `${nextYear}-${pad(nextMonth)}-01`
    };
}

/*
|--------------------------------------------------------------------------
| Dashboard HTML
|--------------------------------------------------------------------------
*/

router.get("/", (req, res) => {

    res.sendFile("dashboard/dashboard.html", {
        root: path.join(
            __dirname,
            "..",
            "views"
        )
    });

});

/*
|--------------------------------------------------------------------------
| Dashboard Data
|--------------------------------------------------------------------------
*/

router.get("/data", async (req, res) => {

    try {

        /*
        |--------------------------------------------------------------------------
        | Session
        |--------------------------------------------------------------------------
        */

        const userId =
            Number(
                req.session.user_id ||
                req.session.userId ||
                0
            );

        const companyId =
            Number(
                req.session.company_id ||
                req.session.companyId ||
                0
            );

        const role =
            String(
                req.session.role || ""
            ).toLowerCase();

        const isSuperAdmin =
            role === "super_admin";

        /*
        |--------------------------------------------------------------------------
        | SUPER ADMIN
        |--------------------------------------------------------------------------
        */

        if (isSuperAdmin) {

            const [
                registeredUsers,
                activeUsers,
                registrationInvoices,
                paidRegistration,
                unpaidRegistration,
                registrationAmounts,
                mikrotikTotal,
                oltTotal
            ] = await Promise.all([

                query(`
                    SELECT
                        COUNT(*) AS total
                    FROM users
                `),

                query(`
                    SELECT
                        COUNT(*) AS total
                    FROM users
                    WHERE status = 'active'
                `),

                query(`
                    SELECT
                        COUNT(*) AS total
                    FROM software_billing_notifications
                    WHERE billing_type = 'registration'
                `),

                query(`
                    SELECT
                        COUNT(*) AS total
                    FROM software_billing_notifications
                    WHERE billing_type = 'registration'
                      AND status = 'paid'
                `),

                query(`
                    SELECT
                        COUNT(*) AS total
                    FROM software_billing_notifications
                    WHERE billing_type = 'registration'
                      AND status <> 'paid'
                `),

                query(`
                    SELECT

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN billing_type = 'registration'
                                    THEN amount
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS total_amount,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN billing_type = 'registration'
                                     AND status = 'paid'
                                    THEN amount
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS paid_amount,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN billing_type = 'registration'
                                     AND status <> 'paid'
                                    THEN amount
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS unpaid_amount

                    FROM software_billing_notifications
                `),

                query(`
                    SELECT
                        COUNT(*) AS total
                    FROM mikrotik_servers
                `),

                query(`
                    SELECT
                        COUNT(*) AS total
                    FROM olts
                `)

            ]);

            const amount =
                registrationAmounts[0] || {};

            return res.json({

                success: true,

                type: "super_admin",

                registered_users:
                    toNumber(
                        registeredUsers[0]?.total
                    ),

                active_users:
                    toNumber(
                        activeUsers[0]?.total
                    ),

                registration_invoices:
                    toNumber(
                        registrationInvoices[0]?.total
                    ),

                paid_registration:
                    toNumber(
                        paidRegistration[0]?.total
                    ),

                unpaid_registration:
                    toNumber(
                        unpaidRegistration[0]?.total
                    ),

                registration_collection:
                    toNumber(
                        amount.total_amount
                    ),

                registration_paid_amount:
                    toNumber(
                        amount.paid_amount
                    ),

                registration_unpaid_amount:
                    toNumber(
                        amount.unpaid_amount
                    ),

                mikrotik_total:
                    toNumber(
                        mikrotikTotal[0]?.total
                    ),

                olt_total:
                    toNumber(
                        oltTotal[0]?.total
                    ),

                software_payments: 0
            });
        }

        /*
        |--------------------------------------------------------------------------
        | COMPANY CONTEXT
        |--------------------------------------------------------------------------
        */

        if (!companyId || !userId) {

            return res.status(403).json({

                success: false,

                message:
                    "Company context is missing."
            });
        }

        /*
        |--------------------------------------------------------------------------
        | Current Billing Period
        |--------------------------------------------------------------------------
        */

        const periodRows =
            await query(`
                SELECT
                    YEAR(CURDATE()) AS billing_year,
                    MONTH(CURDATE()) AS billing_month
            `);

        let billingYear =
            Number(
                periodRows[0]?.billing_year ||
                new Date().getFullYear()
            );

        let billingMonth =
            Number(
                periodRows[0]?.billing_month ||
                (new Date().getMonth() + 1)
            );

        /*
        |--------------------------------------------------------------------------
        | Selected Month (?month=YYYY-MM from the dashboard Filter button)
        |--------------------------------------------------------------------------
        */

        const monthParam =
            String(req.query.month || "");

        if (/^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)) {

            billingYear =
                Number(monthParam.slice(0, 4));

            billingMonth =
                Number(monthParam.slice(5, 7));
        }

        const period =
            monthRange(billingYear, billingMonth);

        /*
        |--------------------------------------------------------------------------
        | Main Company Metrics
        |--------------------------------------------------------------------------
        */

        const [
            customerStats,
            billingStats,
            paymentStats,
            todayCollection,
            connectionFee,
            expenditure,
            salary,
            mikrotikTotal,
            mikrotikRouter,
            softwareBilling,
            chartRows
        ] = await Promise.all([

            /*
            |--------------------------------------------------------------------------
            | Customers
            |--------------------------------------------------------------------------
            */

            query(`
                SELECT

                    COUNT(*) AS total_customer,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN status = 'Active'
                                THEN 1
                                ELSE 0
                            END
                        ),
                        0
                    ) AS active_customer,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN status <> 'Active'
                                  OR status IS NULL
                                THEN 1
                                ELSE 0
                            END
                        ),
                        0
                    ) AS inactive_customer,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN promise_date IS NOT NULL
                                 AND promise_date < NOW()
                                THEN 1
                                ELSE 0
                            END
                        ),
                        0
                    ) AS expired_customer,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN COALESCE(monthly_bill, 0) = 0
                                THEN 1
                                ELSE 0
                            END
                        ),
                        0
                    ) AS free_customer,

                    COALESCE(
                        SUM(
                            COALESCE(monthly_bill, 0)
                        ),
                        0
                    ) AS total_bill

                FROM customers

                WHERE company_id = ?
                  AND deleted_at IS NULL
            `, [
                companyId
            ]),

            /*
            |--------------------------------------------------------------------------
            | Paid / Unpaid Customers
            |--------------------------------------------------------------------------
            */

            query(`
                SELECT

                    COUNT(
                        DISTINCT CASE
                            WHEN p.customer_id IS NOT NULL
                            THEN c.id
                        END
                    ) AS paid_customer,

                    COUNT(
                        DISTINCT CASE
                            WHEN p.customer_id IS NULL
                            THEN c.id
                        END
                    ) AS unpaid_customer

                FROM customers c

                LEFT JOIN (

                    SELECT DISTINCT
                        customer_id

                    FROM payments

                    WHERE company_id = ?
                      AND billing_month = ?
                      AND billing_year = ?
                      AND deleted_at IS NULL

                ) p

                    ON p.customer_id = c.id

                WHERE c.company_id = ?
                  AND c.deleted_at IS NULL
            `, [
                companyId,
                billingMonth,
                billingYear,
                companyId
            ]),

            /*
            |--------------------------------------------------------------------------
            | Current Month Collection
            |--------------------------------------------------------------------------
            */

            query(`
                SELECT

                    COALESCE(
                        SUM(amount),
                        0
                    ) AS total_collection

                FROM payments

                WHERE company_id = ?
                  AND billing_month = ?
                  AND billing_year = ?
                  AND deleted_at IS NULL
            `, [
                companyId,
                billingMonth,
                billingYear
            ]),

            /*
            |--------------------------------------------------------------------------
            | Today Collection
            |--------------------------------------------------------------------------
            */

            query(`
                SELECT

                    COALESCE(
                        SUM(amount),
                        0
                    ) AS today_collection

                FROM payments

                WHERE company_id = ?
                  AND DATE(payment_date) = CURDATE()
                  AND deleted_at IS NULL
            `, [
                companyId
            ]),

            /*
            |--------------------------------------------------------------------------
            | Connection Fee
            |--------------------------------------------------------------------------
            */

            query(`
                SELECT

                    COALESCE(
                        SUM(connection_fee),
                        0
                    ) AS connection_fee

                FROM customers

                WHERE company_id = ?
                  AND deleted_at IS NULL
            `, [
                companyId
            ]),

            /*
            |--------------------------------------------------------------------------
            | Expenditure
            |--------------------------------------------------------------------------
            */

            query(`
                SELECT

                    COALESCE(
                        SUM(amount),
                        0
                    ) AS expenditure

                FROM expenditures

                WHERE company_id = ?
            `, [
                companyId
            ]),

            /*
            |--------------------------------------------------------------------------
            | Salary
            |--------------------------------------------------------------------------
            */

            Promise.resolve([
                {
                    salary: 0
                }
            ]),

            /*
            |--------------------------------------------------------------------------
            | MikroTik Total
            |--------------------------------------------------------------------------
            */

            query(`
                SELECT

                    COUNT(*) AS total

                FROM mikrotik_servers

                WHERE company_id = ?
            `, [
                companyId
            ]),

            /*
            |--------------------------------------------------------------------------
            | MikroTik Router
            |--------------------------------------------------------------------------
            |
            | Get the company's first configured router.
            |
            | For company_id = 30 this currently returns:
            |
            | id   = 32
            | name = neser uddin
            |
            |--------------------------------------------------------------------------
            */

            query(`
                SELECT

                    id,
                    name

                FROM mikrotik_servers

                WHERE company_id = ?

                ORDER BY id ASC

                LIMIT 1
            `, [
                companyId
            ]),

            /*
            |--------------------------------------------------------------------------
            | Software Billing
            |--------------------------------------------------------------------------
            */

            query(`
                SELECT

                    id,
                    amount,
                    status,
                    due_date,
                    NULL AS message

                FROM software_billing_notifications

                WHERE company_id = ?

                  AND (
                        user_id = ?
                        OR user_id IS NULL
                      )

                ORDER BY

                    CASE
                        WHEN status <> 'paid'
                        THEN 0
                        ELSE 1
                    END,

                    due_date ASC,
                    id DESC

                LIMIT 1
            `, [
                companyId,
                userId
            ]),

            Promise.resolve([])

        ]);

        /*
        |--------------------------------------------------------------------------
        | Normalize Result Rows
        |--------------------------------------------------------------------------
        */

        const customer =
            customerStats[0] || {};

        const billing =
            billingStats[0] || {};

        const payment =
            paymentStats[0] || {};

        const today =
            todayCollection[0] || {};

        const fee =
            connectionFee[0] || {};

        const expense =
            expenditure[0] || {};

        const salaryRow =
            salary[0] || {};

        const software =
            softwareBilling[0] || null;

        const routerRow =
            mikrotikRouter[0] || null;

        /*
        |--------------------------------------------------------------------------
        | Customer Values
        |--------------------------------------------------------------------------
        */

        const totalCustomer =
            toNumber(
                customer.total_customer
            );

        const activeCustomer =
            toNumber(
                customer.active_customer
            );

        const inactiveCustomer =
            toNumber(
                customer.inactive_customer
            );

        const expiredCustomer =
            toNumber(
                customer.expired_customer
            );

        const paidCustomer =
            toNumber(
                billing.paid_customer
            );

        const unpaidCustomer =
            toNumber(
                billing.unpaid_customer
            );

        const freeCustomer =
            toNumber(
                customer.free_customer
            );

        /*
        |--------------------------------------------------------------------------
        | Financial Values
        |--------------------------------------------------------------------------
        */

        const totalBill =
            toNumber(
                customer.total_bill
            );

        const totalCollection =
            toNumber(
                payment.total_collection
            );

        const todayCollectionValue =
            toNumber(
                today.today_collection
            );

        const connectionFeeValue =
            toNumber(
                fee.connection_fee
            );

        const expenditureValue =
            toNumber(
                expense.expenditure
            );

        const salaryValue =
            toNumber(
                salaryRow.salary
            );

        /*
        |--------------------------------------------------------------------------
        | Business Balance
        |--------------------------------------------------------------------------
        */

        const businessBalance =
            totalCollection -
            expenditureValue -
            salaryValue;

        /*
        |--------------------------------------------------------------------------
        | Collection Percentage
        |--------------------------------------------------------------------------
        */

        const collectionPercent =
            totalBill > 0

                ? clamp(
                    (
                        totalCollection /
                        totalBill
                    ) * 100,
                    0,
                    100
                )

                : 0;

        /*
        |--------------------------------------------------------------------------
        | Chart Data
        |--------------------------------------------------------------------------
        */

        /*
        |--------------------------------------------------------------------------
        | Extra metrics for the NetFee style cards
        |--------------------------------------------------------------------------
        */

        const customerCols =
            await tableColumns("customers");

        const paymentCols =
            await tableColumns("payments");

        const hasCreatedAt =
            customerCols.has("created_at");

        // "New customer" = created inside the selected month.
        const newExpression =
            hasCreatedAt
                ? "COALESCE(c.created_at >= ? AND c.created_at < ?, 0)"
                : "0";

        const newParams =
            hasCreatedAt
                ? [period.start, period.end]
                : [];

        const extraRows =
            await safeQuery(`
                SELECT

                    COALESCE(SUM(is_new), 0) AS new_customer,

                    COALESCE(SUM(CASE WHEN is_active = 1 THEN bill ELSE 0 END), 0) AS active_amount,
                    COALESCE(SUM(CASE WHEN is_active = 1 AND is_new = 1 THEN 1 ELSE 0 END), 0) AS active_new_customer,
                    COALESCE(SUM(CASE WHEN is_active = 1 AND is_new = 1 THEN bill ELSE 0 END), 0) AS active_new_amount,

                    COALESCE(SUM(paid), 0) AS paid_amount,
                    COALESCE(SUM(CASE WHEN has_paid = 1 AND is_new = 1 THEN 1 ELSE 0 END), 0) AS paid_new_customer,
                    COALESCE(SUM(CASE WHEN has_paid = 1 AND is_new = 1 THEN paid ELSE 0 END), 0) AS paid_new_amount,

                    COALESCE(SUM(CASE WHEN has_paid = 0 THEN bill ELSE 0 END), 0) AS unpaid_amount,
                    COALESCE(SUM(CASE WHEN has_paid = 0 AND is_new = 1 THEN 1 ELSE 0 END), 0) AS unpaid_new_customer,
                    COALESCE(SUM(CASE WHEN has_paid = 0 AND is_new = 1 THEN bill ELSE 0 END), 0) AS unpaid_new_amount,

                    COALESCE(SUM(CASE WHEN is_expired = 1 THEN bill ELSE 0 END), 0) AS expired_amount,
                    COALESCE(SUM(CASE WHEN is_expired = 1 AND is_new = 1 THEN 1 ELSE 0 END), 0) AS expired_new_customer,
                    COALESCE(SUM(CASE WHEN is_expired = 1 AND is_new = 1 THEN bill ELSE 0 END), 0) AS expired_new_amount,

                    COALESCE(SUM(CASE WHEN is_active = 0 THEN bill ELSE 0 END), 0) AS inactive_amount,
                    COALESCE(SUM(CASE WHEN is_active = 0 AND is_new = 1 THEN 1 ELSE 0 END), 0) AS inactive_new_customer,
                    COALESCE(SUM(CASE WHEN is_active = 0 AND is_new = 1 THEN bill ELSE 0 END), 0) AS inactive_new_amount

                FROM (

                    SELECT

                        COALESCE(c.monthly_bill, 0) AS bill,

                        COALESCE(c.status = 'Active', 0) AS is_active,

                        COALESCE(
                            c.promise_date IS NOT NULL
                            AND c.promise_date < NOW(),
                            0
                        ) AS is_expired,

                        ${newExpression} AS is_new,

                        COALESCE(p.paid, 0) AS paid,

                        (p.customer_id IS NOT NULL) AS has_paid

                    FROM customers c

                    LEFT JOIN (

                        SELECT
                            customer_id,
                            SUM(amount) AS paid

                        FROM payments

                        WHERE company_id = ?
                          AND billing_month = ?
                          AND billing_year = ?
                          AND deleted_at IS NULL

                        GROUP BY customer_id

                    ) p

                        ON p.customer_id = c.id

                    WHERE c.company_id = ?
                      AND c.deleted_at IS NULL

                ) x
            `, [
                ...newParams,
                companyId,
                billingMonth,
                billingYear,
                companyId
            ]);

        const extra =
            extraRows[0] || {};

        const x = key =>
            toNumber(extra[key]);


        /* Connection fee: selected month + today (by customer created_at) */

        let monthConnectionFee = 0;
        let todayConnectionFee = 0;

        if (hasCreatedAt) {

            const feeRows =
                await safeQuery(`
                    SELECT

                        COALESCE(SUM(
                            CASE
                                WHEN created_at >= ? AND created_at < ?
                                THEN connection_fee
                                ELSE 0
                            END
                        ), 0) AS month_fee,

                        COALESCE(SUM(
                            CASE
                                WHEN DATE(created_at) = CURDATE()
                                THEN connection_fee
                                ELSE 0
                            END
                        ), 0) AS today_fee

                    FROM customers

                    WHERE company_id = ?
                      AND deleted_at IS NULL
                `, [
                    period.start,
                    period.end,
                    companyId
                ]);

            monthConnectionFee =
                toNumber(feeRows[0]?.month_fee);

            todayConnectionFee =
                toNumber(feeRows[0]?.today_fee);
        }


        /* Discount (only when payments.discount exists) */

        let monthDiscount = 0;
        let todayDiscount = 0;

        if (paymentCols.has("discount")) {

            const discountRows =
                await safeQuery(`
                    SELECT

                        COALESCE(SUM(
                            CASE
                                WHEN billing_month = ? AND billing_year = ?
                                THEN discount
                                ELSE 0
                            END
                        ), 0) AS month_discount,

                        COALESCE(SUM(
                            CASE
                                WHEN DATE(payment_date) = CURDATE()
                                THEN discount
                                ELSE 0
                            END
                        ), 0) AS today_discount

                    FROM payments

                    WHERE company_id = ?
                      AND deleted_at IS NULL
                `, [
                    billingMonth,
                    billingYear,
                    companyId
                ]);

            monthDiscount =
                toNumber(discountRows[0]?.month_discount);

            todayDiscount =
                toNumber(discountRows[0]?.today_discount);
        }


        /* Today's expenditure (needs a date column on expenditures) */

        let todayExpenditure = 0;

        const expenseDateColumn =
            await firstColumn(
                "expenditures",
                [
                    "expense_date",
                    "expenditure_date",
                    "date",
                    "created_at"
                ]
            );

        if (expenseDateColumn) {

            const expenseRows =
                await safeQuery(`
                    SELECT
                        COALESCE(SUM(amount), 0) AS total

                    FROM expenditures

                    WHERE company_id = ?
                      AND DATE(\`${expenseDateColumn}\`) = CURDATE()
                `, [
                    companyId
                ]);

            todayExpenditure =
                toNumber(expenseRows[0]?.total);
        }


        /* Collectors (users whose role contains "collector") */

        const userCols =
            await tableColumns("users");

        const collectorColumn =
            await firstColumn(
                "payments",
                [
                    "collector_id",
                    "collected_by",
                    "received_by"
                ]
            );

        let collectors = [];

        if (
            userCols.has("company_id") &&
            userCols.has("role")
        ) {

            const nameColumn =
                userCols.has("name")
                    ? "name"
                    : (
                        userCols.has("username")
                            ? "username"
                            : "id"
                    );

            collectors =
                await safeQuery(`
                    SELECT
                        id,
                        \`${nameColumn}\` AS name

                    FROM users

                    WHERE company_id = ?
                      AND LOWER(role) LIKE '%collector%'

                    ORDER BY \`${nameColumn}\` ASC
                `, [
                    companyId
                ]);
        }

        let collectorMonthTotal = 0;
        let collectorTodayTotal = 0;

        if (collectorColumn && collectors.length) {

            const collectorIds =
                collectors.map(row => Number(row.id));

            const collectorRows =
                await safeQuery(`
                    SELECT

                        COALESCE(SUM(
                            CASE
                                WHEN billing_month = ? AND billing_year = ?
                                THEN amount
                                ELSE 0
                            END
                        ), 0) AS month_total,

                        COALESCE(SUM(
                            CASE
                                WHEN DATE(payment_date) = CURDATE()
                                THEN amount
                                ELSE 0
                            END
                        ), 0) AS today_total

                    FROM payments

                    WHERE company_id = ?
                      AND deleted_at IS NULL
                      AND \`${collectorColumn}\` IN (${collectorIds.map(() => "?").join(",")})
                `, [
                    billingMonth,
                    billingYear,
                    companyId,
                    ...collectorIds
                ]);

            collectorMonthTotal =
                toNumber(collectorRows[0]?.month_total);

            collectorTodayTotal =
                toNumber(collectorRows[0]?.today_total);
        }


        /*
        |--------------------------------------------------------------------------
        | Collection chart (daily values for one month)
        |--------------------------------------------------------------------------
        | ?chart_year=2026 &chart_month=10 &chart_type=amount|bill
        | &collector_id=3   (collector filter needs a collector column on payments)
        | "bill" = number of payments received that day.
        */

        const now =
            new Date();

        const chartYearParam =
            Number(req.query.chart_year);

        const chartMonthParam =
            Number(req.query.chart_month);

        const chartYear =
            Number.isInteger(chartYearParam) &&
            chartYearParam >= 2000 &&
            chartYearParam <= 2100
                ? chartYearParam
                : now.getFullYear();

        const chartMonth =
            Number.isInteger(chartMonthParam) &&
            chartMonthParam >= 1 &&
            chartMonthParam <= 12
                ? chartMonthParam
                : now.getMonth() + 1;

        const chartType =
            req.query.chart_type === "bill"
                ? "bill"
                : "amount";

        const chartCollectorId =
            parseInt(req.query.collector_id, 10) || 0;

        const chartRange =
            monthRange(chartYear, chartMonth);

        const chartParams = [
            companyId,
            chartRange.start,
            chartRange.end
        ];

        let chartCollectorSql = "";

        if (chartCollectorId > 0 && collectorColumn) {

            chartCollectorSql =
                ` AND \`${collectorColumn}\` = ?`;

            chartParams.push(chartCollectorId);
        }

        const dailyRows =
            await safeQuery(`
                SELECT

                    DAY(payment_date) AS day_no,

                    COALESCE(SUM(amount), 0) AS amount,

                    COUNT(*) AS bills

                FROM payments

                WHERE company_id = ?
                  AND deleted_at IS NULL
                  AND payment_date >= ?
                  AND payment_date < ?
                  ${chartCollectorSql}

                GROUP BY DAY(payment_date)
            `, chartParams);

        const dailyMap = {};

        for (const row of dailyRows) {

            dailyMap[Number(row.day_no)] =
                chartType === "bill"
                    ? toNumber(row.bills)
                    : toNumber(row.amount);
        }

        const daysInMonth =
            new Date(chartYear, chartMonth, 0).getDate();

        const isCurrentMonth =
            chartYear === now.getFullYear() &&
            chartMonth === now.getMonth() + 1;

        const chartLabels = [];
        const chartValues = [];

        for (let day = 1; day <= daysInMonth; day++) {

            chartLabels.push(String(day));

            // Future days of the running month stay empty (no line).
            chartValues.push(
                isCurrentMonth && day > now.getDate()
                    ? null
                    : toNumber(dailyMap[day])
            );
        }


        /*
        |--------------------------------------------------------------------------
        | Fields used only by the new cards
        |--------------------------------------------------------------------------
        */

        const extraFields = {

            filter_month:
                `${billingYear}-${String(billingMonth).padStart(2, "0")}`,

            new_customer:
                x("new_customer"),

            active_amount:         x("active_amount"),
            active_new_customer:   x("active_new_customer"),
            active_new_amount:     x("active_new_amount"),

            paid_amount:           x("paid_amount"),
            paid_new_customer:     x("paid_new_customer"),
            paid_new_amount:       x("paid_new_amount"),

            unpaid_amount:         x("unpaid_amount"),
            unpaid_new_customer:   x("unpaid_new_customer"),
            unpaid_new_amount:     x("unpaid_new_amount"),

            expired_amount:        x("expired_amount"),
            expired_new_customer:  x("expired_new_customer"),
            expired_new_amount:    x("expired_new_amount"),

            inactive_amount:       x("inactive_amount"),
            inactive_new_customer: x("inactive_new_customer"),
            inactive_new_amount:   x("inactive_new_amount"),

            collection_customer:
                paidCustomer,

            collection_new_customer:
                x("paid_new_customer"),

            collection_new_amount:
                x("paid_new_amount"),

            total_collection_with_new:
                totalCollection,

            total_connection_fee:
                monthConnectionFee,

            today_connection_fee:
                todayConnectionFee,

            total_bill_with_fee:
                totalBill + monthConnectionFee,

            today_discount:
                todayDiscount,

            today_expenditure:
                todayExpenditure,

            admin_connection_fee:
                monthConnectionFee,

            collector_total:
                collectors.length,

            collector_total_amount:
                collectorMonthTotal,

            collector_today_collection:
                collectorTodayTotal,

            collectors:
                collectors.map(row => ({
                    id: Number(row.id),
                    name: String(row.name ?? "")
                })),

            chart_type:
                chartType
        };


        /*
        |--------------------------------------------------------------------------
        | Response
        |--------------------------------------------------------------------------
        */

        return res.json({

            success: true,

            type: "company",

            ...extraFields,

            billing_year:
                billingYear,

            billing_month:
                billingMonth,

            /*
            |--------------------------------------------------------------------------
            | Customers
            |--------------------------------------------------------------------------
            */

            total_customer:
                totalCustomer,

            active_customer:
                activeCustomer,

            inactive_customer:
                inactiveCustomer,

            expired_customer:
                expiredCustomer,

            paid_customer:
                paidCustomer,

            unpaid_customer:
                unpaidCustomer,

            free_customer:
                freeCustomer,

            /*
            |--------------------------------------------------------------------------
            | Financial
            |--------------------------------------------------------------------------
            */

            total_bill:
                totalBill,

            total_collection:
                totalCollection,

            today_collection:
                todayCollectionValue,

            connection_fee:
                connectionFeeValue,

            discount:
                monthDiscount,

            expenditure:
                expenditureValue,

            salary:
                salaryValue,

            business_balance:
                businessBalance,

            /*
            |--------------------------------------------------------------------------
            | PPPoE / MikroTik
            |--------------------------------------------------------------------------
            */

            total_pppoe:
                totalCustomer,

            online_user:
                null,

            offline_user:
                null,

            mikrotik_total:
                toNumber(
                    mikrotikTotal[0]?.total
                ),

            /*
            |--------------------------------------------------------------------------
            | IMPORTANT:
            | Actual Router ID + Name
            |--------------------------------------------------------------------------
            */

            mikrotik_router_id:
                routerRow
                    ? Number(routerRow.id)
                    : null,

            mikrotik_router_name:
                routerRow
                    ? routerRow.name
                    : null,

            collection_percent:
                collectionPercent,

            /*
            |--------------------------------------------------------------------------
            | Pending Software Billing
            |--------------------------------------------------------------------------
            */

            pending_billing:

                software

                    ? {

                        id:
                            Number(
                                software.id
                            ),

                        amount:
                            toNumber(
                                software.amount
                            ),

                        status:
                            software.status,

                        due_date:
                            software.due_date,

                        invoice_date:
                            null,

                        message:
                            software.message ||
                            ""

                    }

                    : null,

            /*
            |--------------------------------------------------------------------------
            | Chart
            |--------------------------------------------------------------------------
            */

            chart: {

                labels:
                    chartLabels,

                values:
                    chartValues
            }

        });

    } catch (error) {

        console.error(
            "[Dashboard] Data error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Failed to load dashboard data."
        });
    }
});

module.exports = router;