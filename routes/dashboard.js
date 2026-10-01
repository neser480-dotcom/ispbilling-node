const express = require("express");
const path = require("path");
const db = require("../config/database");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}


/*
|--------------------------------------------------------------------------
| DASHBOARD PAGE
|--------------------------------------------------------------------------
*/

router.get("/", requireAuth, (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "..",
            "views",
            "dashboard.html"
        )
    );

});


/*
|--------------------------------------------------------------------------
| DASHBOARD DATA
|--------------------------------------------------------------------------
*/

router.get("/data", requireAuth, async (req, res) => {

    try {

        const userId =
            Number(req.session.user_id || 0);

        const companyId =
            Number(req.session.company_id || 0);

        const role =
            String(req.session.role || "staff").toLowerCase();

        const isSuperAdmin =
            role === "super_admin";


        /*
        |--------------------------------------------------------------------------
        | SUPER ADMIN
        |--------------------------------------------------------------------------
        */

        if (isSuperAdmin) {

            const [
                [registeredRows],
                [activeRows],
                [registrationRows],
                [registrationPaidRows],
                [registrationUnpaidRows],
                [registrationAmountRows],
                [registrationPaidAmountRows],
                [registrationUnpaidAmountRows],
                [mikrotikRows],
                [oltRows]
            ] = await Promise.all([

                db.query(`
                    SELECT COUNT(*) AS total
                    FROM users
                `),

                db.query(`
                    SELECT COUNT(*) AS total
                    FROM users
                    WHERE LOWER(status) = 'active'
                `),

                db.query(`
                    SELECT COUNT(*) AS total
                    FROM software_billing_notifications
                    WHERE billing_type = 'registration'
                `),

                db.query(`
                    SELECT COUNT(*) AS total
                    FROM software_billing_notifications
                    WHERE billing_type = 'registration'
                    AND LOWER(status) = 'paid'
                `),

                db.query(`
                    SELECT COUNT(*) AS total
                    FROM software_billing_notifications
                    WHERE billing_type = 'registration'
                    AND LOWER(status) = 'unpaid'
                `),

                db.query(`
                    SELECT COALESCE(SUM(amount),0) AS total
                    FROM software_billing_notifications
                    WHERE billing_type = 'registration'
                `),

                db.query(`
                    SELECT COALESCE(SUM(amount),0) AS total
                    FROM software_billing_notifications
                    WHERE billing_type = 'registration'
                    AND LOWER(status) = 'paid'
                `),

                db.query(`
                    SELECT COALESCE(SUM(amount),0) AS total
                    FROM software_billing_notifications
                    WHERE billing_type = 'registration'
                    AND LOWER(status) = 'unpaid'
                `),

                db.query(`
                    SELECT COUNT(*) AS total
                    FROM mikrotik_servers
                `),

                db.query(`
                    SELECT COUNT(*) AS total
                    FROM olts
                `)

            ]);


            return res.json({

                success: true,

                type: "super_admin",

                data: {

                    registered_users:
                        toNumber(registeredRows[0]?.total),

                    active_users:
                        toNumber(activeRows[0]?.total),

                    registration_invoices:
                        toNumber(registrationRows[0]?.total),

                    registration_collection:
                        toNumber(registrationAmountRows[0]?.total),

                    paid_registration:
                        toNumber(registrationPaidRows[0]?.total),

                    unpaid_registration:
                        toNumber(registrationUnpaidRows[0]?.total),

                    software_payments:
                        0,

                    registration_paid_amount:
                        toNumber(registrationPaidAmountRows[0]?.total),

                    registration_unpaid_amount:
                        toNumber(registrationUnpaidAmountRows[0]?.total),

                    mikrotik_total:
                        toNumber(mikrotikRows[0]?.total),

                    olt_total:
                        toNumber(oltRows[0]?.total)

                }

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

                message:
                    "Company access is not configured for this account."

            });

        }


        /*
        |--------------------------------------------------------------------------
        | CUSTOMER COUNTS
        |--------------------------------------------------------------------------
        */

        const [
            [totalCustomerRows],
            [activeCustomerRows],
            [inactiveCustomerRows],
            [expiredCustomerRows],
            [paidCustomerRows],
            [freeCustomerRows],
            [billRows],
            [collectionRows],
            [todayCollectionRows],
            [connectionFeeRows],
            [expenseRows],
            [salaryRows],
            [mikrotikCustomerRows],
            [pendingBillingRows]
        ] = await Promise.all([

            db.query(`
                SELECT COUNT(*) AS total
                FROM customers
                WHERE company_id = ?
            `, [companyId]),


            db.query(`
                SELECT COUNT(*) AS total
                FROM customers
                WHERE company_id = ?
                AND LOWER(status) = 'active'
            `, [companyId]),


            db.query(`
                SELECT COUNT(*) AS total
                FROM customers
                WHERE company_id = ?
                AND LOWER(status) = 'inactive'
            `, [companyId]),


            db.query(`
                SELECT COUNT(*) AS total
                FROM customers
                WHERE company_id = ?
                AND promise_date IS NOT NULL
                AND promise_date < CURDATE()
            `, [companyId]),


            db.query(`
                SELECT COUNT(DISTINCT p.customer_id) AS total
                FROM payments p
                INNER JOIN customers c
                    ON c.customer_id = p.customer_id
                WHERE c.company_id = ?
                AND p.billing_month = MONTH(CURDATE())
                AND p.billing_year = YEAR(CURDATE())
                AND p.deleted_at IS NULL
            `, [companyId]),


            db.query(`
                SELECT COUNT(*) AS total
                FROM customers
                WHERE company_id = ?
                AND package_name = 'Free'
            `, [companyId]),


            db.query(`
                SELECT COALESCE(SUM(monthly_bill),0) AS total
                FROM customers
                WHERE company_id = ?
            `, [companyId]),


            db.query(`
                SELECT COALESCE(SUM(p.amount),0) AS total
                FROM payments p
                INNER JOIN customers c
                    ON c.customer_id = p.customer_id
                WHERE c.company_id = ?
                AND p.deleted_at IS NULL
            `, [companyId]),


            db.query(`
                SELECT COALESCE(SUM(p.amount),0) AS total
                FROM payments p
                INNER JOIN customers c
                    ON c.customer_id = p.customer_id
                WHERE c.company_id = ?
                AND p.payment_date = CURDATE()
                AND p.deleted_at IS NULL
            `, [companyId]),


            db.query(`
                SELECT COALESCE(SUM(connection_fee),0) AS total
                FROM customers
                WHERE company_id = ?
            `, [companyId]),


            db.query(`
                SELECT COALESCE(SUM(amount),0) AS total
                FROM expenditures
                WHERE company_id = ?
            `, [companyId]),


            db.query(`
                SELECT COALESCE(SUM(amount),0) AS total
                FROM salaries
                WHERE company_id = ?
            `, [companyId]),


            db.query(`
                SELECT COUNT(DISTINCT mikrotik_id) AS total
                FROM customers
                WHERE company_id = ?
                AND mikrotik_id IS NOT NULL
                AND mikrotik_id != 0
            `, [companyId]),


            db.query(`
                SELECT
                    id,
                    billing_type,
                    package_id,
                    package_code,
                    amount,
                    status,
                    due_date
                FROM software_billing_notifications
                WHERE company_id = ?
                AND user_id = ?
                AND LOWER(status) = 'unpaid'
                ORDER BY id DESC
                LIMIT 1
            `, [companyId, userId])

        ]);


        const totalCustomer =
            toNumber(totalCustomerRows[0]?.total);

        const activeCustomer =
            toNumber(activeCustomerRows[0]?.total);

        const inactiveCustomer =
            toNumber(inactiveCustomerRows[0]?.total);

        const expiredCustomer =
            toNumber(expiredCustomerRows[0]?.total);

        const paidCustomer =
            toNumber(paidCustomerRows[0]?.total);

        const freeCustomer =
            toNumber(freeCustomerRows[0]?.total);

        const totalBill =
            toNumber(billRows[0]?.total);

        const totalCollection =
            toNumber(collectionRows[0]?.total);

        const todayCollection =
            toNumber(todayCollectionRows[0]?.total);

        const connectionFee =
            toNumber(connectionFeeRows[0]?.total);

        const totalExpense =
            toNumber(expenseRows[0]?.total);

        const totalSalary =
            toNumber(salaryRows[0]?.total);

        const unpaidCustomer =
            Math.max(
                totalCustomer - paidCustomer,
                0
            );


        const businessBalance =
            totalCollection -
            totalExpense -
            totalSalary;


        let collectionPercent = 0;

        if (totalBill > 0) {

            collectionPercent =
                (totalCollection / totalBill) * 100;

            collectionPercent =
                Math.max(
                    0,
                    Math.min(
                        collectionPercent,
                        100
                    )
                );

        }


        /*
        |--------------------------------------------------------------------------
        | RESPONSE
        |--------------------------------------------------------------------------
        */

        return res.json({

            success: true,

            type: "company",

            user: {

                id: userId,

                company_id: companyId,

                role

            },

            pendingBilling:
                pendingBillingRows[0] || null,

            data: {

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

                total_bill:
                    totalBill,

                total_collection:
                    totalCollection,

                today_collection:
                    todayCollection,

                connection_fee:
                    connectionFee,

                discount:
                    0,

                expenditure:
                    totalExpense,

                salary:
                    totalSalary,

                business_balance:
                    businessBalance,

                total_pppoe:
                    totalCustomer,

                online_user:
                    activeCustomer,

                offline_user:
                    inactiveCustomer,

                mikrotik_total:
                    toNumber(
                        mikrotikCustomerRows[0]?.total
                    ),

                collection_percent:
                    Number(
                        collectionPercent.toFixed(2)
                    )

            }

        });


    } catch (error) {

        console.error(
            "Dashboard data error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to load dashboard data."

        });

    }

});


module.exports = router;