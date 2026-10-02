"use strict";

const express = require("express");
const router = express.Router();

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
    if (Array.isArray(result)) {
        return result;
    }

    if (result && Array.isArray(result[0])) {
        return result[0];
    }

    return [];
}

async function query(sql, params = []) {
    const result = await db.query(sql, params);
    return normalizeRows(result);
}

/*
|--------------------------------------------------------------------------
| Dashboard HTML
|--------------------------------------------------------------------------
*/

router.get("/", (req, res) => {
    res.sendFile("dashboard.html", {
        root: require("path").join(__dirname, "..", "views")
    });
});

/*
|--------------------------------------------------------------------------
| Dashboard Data
|--------------------------------------------------------------------------
*/

router.get("/data", async (req, res) => {
    try {
        const userId = Number(req.session.user_id || req.session.userId || 0);
        const companyId = Number(
            req.session.company_id ||
            req.session.companyId ||
            0
        );

        const role = String(req.session.role || "").toLowerCase();
        const isSuperAdmin = role === "super_admin";

        /*
        |--------------------------------------------------------------------------
        | SUPER ADMIN
        |--------------------------------------------------------------------------
        | Super Admin must not receive customer/business dashboard data.
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
                    SELECT COUNT(*) AS total
                    FROM users
                `),

                query(`
                    SELECT COUNT(*) AS total
                    FROM users
                    WHERE status = 'active'
                `),

                query(`
                    SELECT COUNT(*) AS total
                    FROM software_billing_notifications
                    WHERE billing_type = 'registration'
                `),

                query(`
                    SELECT COUNT(*) AS total
                    FROM software_billing_notifications
                    WHERE billing_type = 'registration'
                      AND status = 'paid'
                `),

                query(`
                    SELECT COUNT(*) AS total
                    FROM software_billing_notifications
                    WHERE billing_type = 'registration'
                      AND status <> 'paid'
                `),

                query(`
                    SELECT
                        COALESCE(
                            SUM(CASE
                                WHEN billing_type = 'registration'
                                THEN amount
                                ELSE 0
                            END),
                            0
                        ) AS total_amount,

                        COALESCE(
                            SUM(CASE
                                WHEN billing_type = 'registration'
                                 AND status = 'paid'
                                THEN amount
                                ELSE 0
                            END),
                            0
                        ) AS paid_amount,

                        COALESCE(
                            SUM(CASE
                                WHEN billing_type = 'registration'
                                 AND status <> 'paid'
                                THEN amount
                                ELSE 0
                            END),
                            0
                        ) AS unpaid_amount

                    FROM software_billing_notifications
                `),

                query(`
                    SELECT COUNT(*) AS total
                    FROM mikrotik_servers
                `),

                query(`
                    SELECT COUNT(*) AS total
                    FROM olts
                `)
            ]);

            const amount = registrationAmounts[0] || {};

            return res.json({
                success: true,
                type: "super_admin",

                registered_users: toNumber(
                    registeredUsers[0]?.total
                ),

                active_users: toNumber(
                    activeUsers[0]?.total
                ),

                registration_invoices: toNumber(
                    registrationInvoices[0]?.total
                ),

                paid_registration: toNumber(
                    paidRegistration[0]?.total
                ),

                unpaid_registration: toNumber(
                    unpaidRegistration[0]?.total
                ),

                registration_collection: toNumber(
                    amount.total_amount
                ),

                registration_paid_amount: toNumber(
                    amount.paid_amount
                ),

                registration_unpaid_amount: toNumber(
                    amount.unpaid_amount
                ),

                mikrotik_total: toNumber(
                    mikrotikTotal[0]?.total
                ),

                olt_total: toNumber(
                    oltTotal[0]?.total
                ),

                software_payments: 0
            });
        }

        /*
        |--------------------------------------------------------------------------
        | COMPANY DASHBOARD
        |--------------------------------------------------------------------------
        */

        if (!companyId || !userId) {
            return res.status(403).json({
                success: false,
                message: "Company context is missing."
            });
        }

        /*
        |--------------------------------------------------------------------------
        | Current billing period
        |--------------------------------------------------------------------------
        */

        const periodRows = await query(`
            SELECT
                YEAR(CURDATE()) AS billing_year,
                MONTH(CURDATE()) AS billing_month
        `);

        const billingYear = Number(
            periodRows[0]?.billing_year || new Date().getFullYear()
        );

        const billingMonth = Number(
            periodRows[0]?.billing_month ||
            (new Date().getMonth() + 1)
        );

        /*
        |--------------------------------------------------------------------------
        | Main company metrics
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

                    SUM(
                        CASE
                            WHEN status = 'Active'
                            THEN 1 ELSE 0
                        END
                    ) AS active_customer,

                    SUM(
                        CASE
                            WHEN status <> 'Active'
                              OR status IS NULL
                            THEN 1 ELSE 0
                        END
                    ) AS inactive_customer,

                    SUM(
                        CASE
                            WHEN promise_date IS NOT NULL
                             AND promise_date < NOW()
                            THEN 1 ELSE 0
                        END
                    ) AS expired_customer,

                    SUM(
                        CASE
                            WHEN COALESCE(monthly_bill, 0) = 0
                            THEN 1 ELSE 0
                        END
                    ) AS free_customer,

                    COALESCE(
                        SUM(monthly_bill),
                        0
                    ) AS total_bill

                FROM customers
                WHERE company_id = ?
                  AND deleted_at IS NULL
            `, [companyId]),

            /*
            |--------------------------------------------------------------------------
            | Current month billing/payment customer counts
            |--------------------------------------------------------------------------
            */

            query(`
                SELECT
                    COUNT(DISTINCT CASE
                        WHEN p.customer_id IS NOT NULL
                        THEN c.id
                    END) AS paid_customer,

                    COUNT(DISTINCT CASE
                        WHEN p.customer_id IS NULL
                        THEN c.id
                    END) AS unpaid_customer

                FROM customers c

                LEFT JOIN (
                    SELECT DISTINCT customer_id
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
            | Current month collection
            |--------------------------------------------------------------------------
            */

            query(`
                SELECT
                    COALESCE(SUM(amount), 0) AS total_collection

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
            | Today collection
            |--------------------------------------------------------------------------
            */

            query(`
                SELECT
                    COALESCE(SUM(amount), 0) AS today_collection

                FROM payments

                WHERE company_id = ?
                  AND DATE(payment_date) = CURDATE()
                  AND deleted_at IS NULL
            `, [companyId]),

            /*
            |--------------------------------------------------------------------------
            | Connection fee
            |--------------------------------------------------------------------------
            */

            query(`
                SELECT
                    COALESCE(SUM(connection_fee), 0) AS connection_fee

                FROM customers

                WHERE company_id = ?
                  AND deleted_at IS NULL
            `, [companyId]),

            /*
            |--------------------------------------------------------------------------
            | Expenditure
            |--------------------------------------------------------------------------
            */

            query(`
                SELECT
                    COALESCE(SUM(amount), 0) AS expenditure

                FROM expenditures

                WHERE company_id = ?
                  AND deleted_at IS NULL
            `, [companyId]),

            /*
            |--------------------------------------------------------------------------
            | Salary
            |--------------------------------------------------------------------------
            */

            query(`
                SELECT
                    COALESCE(SUM(amount), 0) AS salary

                FROM salaries

                WHERE company_id = ?
                  AND deleted_at IS NULL
            `, [companyId]),

            /*
            |--------------------------------------------------------------------------
            | MikroTik
            |--------------------------------------------------------------------------
            */

            query(`
                SELECT COUNT(*) AS total
                FROM mikrotik_servers
                WHERE company_id = ?
            `, [companyId]),

            /*
            |--------------------------------------------------------------------------
            | Software billing
            |--------------------------------------------------------------------------
            */

            query(`
                SELECT
                    id,
                    amount,
                    status,
                    due_date,
                    invoice_date,
                    message

                FROM software_billing_notifications

                WHERE company_id = ?
                  AND (
                        user_id = ?
                        OR user_id IS NULL
                      )

                ORDER BY
                    CASE
                        WHEN status <> 'paid' THEN 0
                        ELSE 1
                    END,
                    due_date ASC,
                    id DESC

                LIMIT 1
            `, [
                companyId,
                userId
            ]),

            /*
            |--------------------------------------------------------------------------
            | Last 6 months payment chart
            |--------------------------------------------------------------------------
            */

            query(`
                SELECT
                    YEAR(payment_date) AS payment_year,
                    MONTH(payment_date) AS payment_month,
                    COALESCE(SUM(amount), 0) AS amount

                FROM payments

                WHERE company_id = ?
                  AND deleted_at IS NULL
                  AND payment_date >= DATE_SUB(
                        DATE_FORMAT(CURDATE(), '%Y-%m-01'),
                        INTERVAL 5 MONTH
                      )

                GROUP BY
                    YEAR(payment_date),
                    MONTH(payment_date)

                ORDER BY
                    payment_year ASC,
                    payment_month ASC
            `, [companyId])
        ]);

        const customer = customerStats[0] || {};
        const billing = billingStats[0] || {};
        const payment = paymentStats[0] || {};
        const today = todayCollection[0] || {};
        const fee = connectionFee[0] || {};
        const expense = expenditure[0] || {};
        const salaryRow = salary[0] || {};
        const software = softwareBilling[0] || null;

        const totalCustomer = toNumber(customer.total_customer);
        const activeCustomer = toNumber(customer.active_customer);
        const inactiveCustomer = toNumber(customer.inactive_customer);
        const expiredCustomer = toNumber(customer.expired_customer);
        const paidCustomer = toNumber(billing.paid_customer);
        const unpaidCustomer = toNumber(billing.unpaid_customer);
        const freeCustomer = toNumber(customer.free_customer);

        const totalBill = toNumber(customer.total_bill);
        const totalCollection = toNumber(payment.total_collection);
        const todayCollectionValue = toNumber(today.today_collection);

        const connectionFeeValue = toNumber(fee.connection_fee);
        const expenditureValue = toNumber(expense.expenditure);
        const salaryValue = toNumber(salaryRow.salary);

        const businessBalance =
            totalCollection -
            expenditureValue -
            salaryValue;

        /*
        |--------------------------------------------------------------------------
        | Collection percentage
        |--------------------------------------------------------------------------
        */

        const collectionPercent =
            totalBill > 0
                ? clamp(
                    (totalCollection / totalBill) * 100,
                    0,
                    100
                )
                : 0;

        /*
        |--------------------------------------------------------------------------
        | Chart data
        |--------------------------------------------------------------------------
        */

        const chartMap = {};

        for (const row of chartRows) {
            const key =
                `${Number(row.payment_year)}-${String(
                    Number(row.payment_month)
                ).padStart(2, "0")}`;

            chartMap[key] = toNumber(row.amount);
        }

        const chartLabels = [];
        const chartValues = [];

        const now = new Date();

        for (let i = 5; i >= 0; i--) {
            const d = new Date(
                now.getFullYear(),
                now.getMonth() - i,
                1
            );

            const year = d.getFullYear();
            const month = d.getMonth() + 1;

            const key =
                `${year}-${String(month).padStart(2, "0")}`;

            chartLabels.push(
                d.toLocaleString("en-US", {
                    month: "short"
                })
            );

            chartValues.push(
                toNumber(chartMap[key])
            );
        }

        /*
        |--------------------------------------------------------------------------
        | Response
        |--------------------------------------------------------------------------
        */

        return res.json({
            success: true,
            type: "company",

            billing_year: billingYear,
            billing_month: billingMonth,

            total_customer: totalCustomer,
            active_customer: activeCustomer,
            inactive_customer: inactiveCustomer,
            expired_customer: expiredCustomer,

            paid_customer: paidCustomer,
            unpaid_customer: unpaidCustomer,
            free_customer: freeCustomer,

            total_bill: totalBill,
            total_collection: totalCollection,
            today_collection: todayCollectionValue,

            connection_fee: connectionFeeValue,

            /*
             * No discount table/source was supplied in the current
             * dashboard data contract, so do not fabricate a value.
             */
            discount: null,

            expenditure: expenditureValue,
            salary: salaryValue,

            business_balance: businessBalance,

            /*
             * These are customer counts, not MikroTik live-session counts.
             * Keep them separate from online_user.
             */
            total_pppoe: totalCustomer,
            online_user: null,
            offline_user: null,

            mikrotik_total: toNumber(
                mikrotikTotal[0]?.total
            ),

            collection_percent: collectionPercent,

            mikrotik_router_id: null,

            pending_billing: software
                ? {
                    id: Number(software.id),
                    amount: toNumber(software.amount),
                    status: software.status,
                    due_date: software.due_date,
                    invoice_date: software.invoice_date,
                    message: software.message || ""
                }
                : null,

            chart: {
                labels: chartLabels,
                values: chartValues
            }
        });

    } catch (error) {
        console.error(
            "[Dashboard] Data error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to load dashboard data."
        });
    }
});

module.exports = router;