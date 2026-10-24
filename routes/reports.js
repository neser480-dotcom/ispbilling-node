
"use strict";

const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| DATABASE
|--------------------------------------------------------------------------
*/

const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "ispbilling",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4"
});

/*
|--------------------------------------------------------------------------
| AUTH
|--------------------------------------------------------------------------
*/

function isLoggedIn(req) {
    return !!(req.session && req.session.user_id);
}

function requireLoginPage(req, res, next) {
    if (!isLoggedIn(req)) {
        return res.redirect("/");
    }
    next();
}

function requireLoginApi(req, res, next) {
    if (!isLoggedIn(req)) {
        return res.status(401).json({
            status: false,
            message: "Authentication required."
        });
    }
    next();
}

/*
|--------------------------------------------------------------------------
| COMPANY SCOPE
|--------------------------------------------------------------------------
*/

function getCompanyScope(req, alias) {
    const role = String(req.session?.role || "")
        .trim()
        .toLowerCase();

    const companyId = Number(req.session?.company_id || 0);

    if (role === "super_admin") {
        return { sql: "1=1", params: [] };
    }

    if (companyId <= 0) {
        return { sql: "1=0", params: [] };
    }

    return {
        sql: `${alias}.company_id = ?`,
        params: [companyId]
    };
}

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function clean(value) {
    return String(
        value === undefined || value === null ? "" : value
    ).trim();
}

function number(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function escapeCsv(value) {
    let text = "";

    if (value !== undefined && value !== null) {
        text = String(value);
    }

    return `"${text.replace(/"/g, '""')}"`;
}

function getCustomerId(req, res, csv = false) {
    if (req.query.customer_id === undefined) {
        return 0;
    }

    const raw = String(req.query.customer_id).trim();
    const id = Number(raw);

    if (
        raw === "" ||
        !/^\d+$/.test(raw) ||
        !Number.isSafeInteger(id) ||
        id <= 0
    ) {
        if (csv) {
            res.status(400).send("Invalid customer ID.");
        } else {
            res.status(400).json({
                status: false,
                message: "Invalid customer ID."
            });
        }

        return null;
    }

    return id;
}

/*
|--------------------------------------------------------------------------
| PAGE ROUTES
|--------------------------------------------------------------------------
*/

router.get("/collection", requireLoginPage, (req, res) => {
    res.sendFile(
        path.join(__dirname, "..", "views", "report-collection.html")
    );
});

router.get("/reseller-collection", requireLoginPage, (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "..",
            "views",
            "report-reseller-collection.html"
        )
    );
});

router.get("/deposit", requireLoginPage, (req, res) => {
    res.sendFile(
        path.join(__dirname, "..", "views", "report-deposit.html")
    );
});

/*
|--------------------------------------------------------------------------
| CUSTOMER BILL HISTORY API
|--------------------------------------------------------------------------
| Uses database customer ID.
| Shows all non-cancelled payments, newest first.
|--------------------------------------------------------------------------
*/

router.get(
    "/api/customer-bill-history/:customerId",
    requireLoginApi,
    async (req, res) => {
        try {
            const customerId = Number(req.params.customerId);

            if (
                !Number.isSafeInteger(customerId) ||
                customerId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid customer ID."
                });
            }

            const scope = getCompanyScope(req, "c");

            const [[customer]] = await pool.query(
                `
                SELECT
                    c.id,
                    c.customer_id,
                    c.name,
                    c.phone,
                    c.address,
                    c.pppoe_username,
                    c.package_name,
                    c.monthly_bill,
                    c.balance,
                    c.company_id
                FROM customers c
                WHERE c.id = ?
                  AND ${scope.sql}
                  AND c.deleted_at IS NULL
                LIMIT 1
                `,
                [customerId, ...scope.params]
            );

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found or access denied."
                });
            }

            const [rows] = await pool.query(
                `
                SELECT
                    p.id,
                    p.customer_id,
                    p.amount,
                    p.payment_method,
                    p.payment_date,
                    p.billing_month,
                    p.billing_year,
                    p.months_paid,
                    p.is_advance,
                    p.comments,
                    p.created_by,
                    p.balance_before,
                    p.balance_after,
                    p.billing_cycle_before,
                    p.promise_date_before,
                    p.status_before,
                    p.payment_status_before,
                   p.payment_date AS created_at,

                    COALESCE(br.discount, 0) AS discount,
                    br.bill_amount,
                    br.due_amount,
                    br.medium AS report_medium,
                    br.bill_type,
                    br.collected_by,
                    br.note AS report_note,

                    c.package_name,
                    c.monthly_bill

                FROM payments p

                INNER JOIN customers c
                    ON c.id = p.customer_id

                LEFT JOIN (
                    SELECT
                        payment_id,
                        MAX(id) AS latest_report_id
                    FROM bill_reports
                    WHERE payment_id IS NOT NULL
                    GROUP BY payment_id
                ) latest
                    ON latest.payment_id = p.id

                LEFT JOIN bill_reports br
                    ON br.id = latest.latest_report_id

                WHERE p.customer_id = ?
                  AND p.company_id = ?
                  AND c.company_id = ?
                  AND p.deleted_at IS NULL

                ORDER BY p.id DESC
                `,
                [
                    customerId,
                    customer.company_id,
                    customer.company_id
                ]
            );

            const history = rows.map(row => ({
                id: row.id,
                amount: Number(row.amount || 0),
                payment_method:
                    row.report_medium ||
                    row.payment_method ||
                    "—",

                payment_date: row.payment_date,
                created_at: row.created_at,

                package_name: row.package_name || "—",

                bill_amount: Number(
                    row.bill_amount ?? row.amount ?? 0
                ),

                discount: Number(row.discount || 0),
                due_amount: Number(row.due_amount || 0),

                bill_type: row.bill_type ||
                    (Number(row.is_advance || 0) ? "advance" : "bill"),

                collected_by: row.collected_by ||
                    (row.created_by ? `User #${row.created_by}` : "—"),

                balance_before: row.balance_before,
                balance_after: row.balance_after,

                bill_date: row.billing_month && row.billing_year
                    ? `${String(row.billing_year)}-${String(row.billing_month).padStart(2, "0")}`
                    : "—",

                promise_date: row.promise_date_before || "—",

                comments: row.comments || "",
                note: row.report_note || row.comments || ""
            }));

            return res.json({
                success: true,
                customer: {
                    id: customer.id,
                    customer_id: customer.customer_id,
                    name: customer.name,
                    phone: customer.phone,
                    address: customer.address,
                    pppoe_username: customer.pppoe_username,
                    package_name: customer.package_name,
                    monthly_bill: Number(customer.monthly_bill || 0),
                    balance: Number(customer.balance || 0)
                },
                rows: history
            });

        } catch (error) {
            console.error("Customer bill history error:", error);

            return res.status(500).json({
                success: false,
                message: "Unable to load customer bill history.",
                error: process.env.NODE_ENV === "development"
                    ? error.message
                    : undefined
            });
        }
    }
);



/*
|--------------------------------------------------------------------------
| CANCEL CUSTOMER PAYMENT
|--------------------------------------------------------------------------
| Permanently deletes payment and related bill_reports.
| Restores customer billing state from the payment snapshot.
| Does NOT call MikroTik or PPP service.
| Cancellation audit remains in activity_logs.
|--------------------------------------------------------------------------
*/

router.post(
    "/api/customer-bill-history/:paymentId/cancel",
    requireLoginApi,
    async (req, res) => {
        let connection;
        let transactionStarted = false;

        try {
            const paymentId = Number(req.params.paymentId);

            if (!Number.isSafeInteger(paymentId) || paymentId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid payment ID."
                });
            }

            // CSRF validation
            const sessionToken = clean(req.session?.csrf_token);
            const suppliedToken = clean(
                req.get("X-CSRF-Token") ||
                req.body?.csrf_token ||
                req.body?._csrf
            );

            if (
                !sessionToken ||
                !suppliedToken ||
                sessionToken !== suppliedToken
            ) {
                return res.status(403).json({
                    success: false,
                    message: "Invalid CSRF token."
                });
            }

            // Company access validation
            const role = String(req.session?.role || "")
                .trim()
                .toLowerCase();

            const sessionCompanyId = Number(
                req.session?.company_id || 0
            );

            if (role !== "super_admin" && sessionCompanyId <= 0) {
                return res.status(403).json({
                    success: false,
                    message: "Company access is required."
                });
            }

            connection = await pool.getConnection();
            await connection.beginTransaction();
            transactionStarted = true;

            const paymentScope = role === "super_admin"
                ? "1=1"
                : "c.company_id = ?";

            const paymentParams = role === "super_admin"
                ? [paymentId]
                : [paymentId, sessionCompanyId];

            // Lock payment and customer rows
            const [paymentRows] = await connection.query(
                `
                SELECT
                    p.id,
                    p.company_id,
                    p.customer_id,
                    p.amount,
                    p.deleted_at,
                    p.balance_before,
                    p.balance_after,
                    p.billing_cycle_before,
                    p.promise_date_before,
                    p.status_before,
                    p.payment_status_before,

                    c.balance AS customer_balance

                FROM payments p

                INNER JOIN customers c
                    ON c.id = p.customer_id
                   AND c.company_id = p.company_id

                WHERE p.id = ?
                  AND p.deleted_at IS NULL
                  AND ${paymentScope}

                LIMIT 1
                FOR UPDATE
                `,
                paymentParams
            );

            if (!paymentRows.length) {
                await connection.rollback();
                transactionStarted = false;

                return res.status(404).json({
                    success: false,
                    message: "Payment not found or access denied."
                });
            }

            const payment = paymentRows[0];

            // Only the newest active payment can be cancelled
            const [latestRows] = await connection.query(
                `
                SELECT id
                FROM payments
                WHERE customer_id = ?
                  AND company_id = ?
                  AND deleted_at IS NULL
                ORDER BY id DESC
                LIMIT 1
                FOR UPDATE
                `,
                [payment.customer_id, payment.company_id]
            );

            if (
                !latestRows.length ||
                Number(latestRows[0].id) !== paymentId
            ) {
                await connection.rollback();
                transactionStarted = false;

                return res.status(409).json({
                    success: false,
                    message:
                        "এই পেমেন্টের পরে আরও পেমেন্ট আছে। " +
                        "সর্বশেষ পেমেন্ট ছাড়া এটি বাতিল করা যাবে না।"
                });
            }

            /*
             * NULL billing_cycle_before and promise_date_before
             * are valid snapshots and must be restored as NULL.
             */
            const missingSnapshot =
                payment.balance_before === null ||
                payment.balance_before === undefined ||
                payment.balance_after === null ||
                payment.balance_after === undefined ||
                payment.status_before === null ||
                payment.status_before === undefined ||
                payment.payment_status_before === null ||
                payment.payment_status_before === undefined;

            if (missingSnapshot) {
                await connection.rollback();
                transactionStarted = false;

                return res.status(409).json({
                    success: false,
                    message:
                        "এই পেমেন্টের প্রয়োজনীয় Snapshot অসম্পূর্ণ। " +
                        "নিরাপত্তার জন্য Payment Cancel করা হয়নি।"
                });
            }

            // Do not overwrite subsequent balance changes
            const currentBalance = Number(payment.customer_balance);
            const recordedBalance = Number(payment.balance_after);

            if (
                !Number.isFinite(currentBalance) ||
                !Number.isFinite(recordedBalance) ||
                Math.abs(currentBalance - recordedBalance) > 0.0001
            ) {
                await connection.rollback();
                transactionStarted = false;

                return res.status(409).json({
                    success: false,
                    message:
                        "বর্তমান Balance পেমেন্টের সংরক্ষিত Balance-এর " +
                        "সঙ্গে মিলছে না। স্বয়ংক্রিয়ভাবে বাতিল করা হয়নি।"
                });
            }

            // Restore customer software state.
            // NULL snapshot values are restored as NULL.
            await connection.query(
                `
                UPDATE customers
                SET
                    balance = ?,
                    billing_cycle = ?,
                    promise_date = ?,
                    status = ?,
                    payment_status = ?
                WHERE id = ?
                  AND company_id = ?
                `,
                [
                    payment.balance_before,
                    payment.billing_cycle_before,
                    payment.promise_date_before,
                    payment.status_before,
                    payment.payment_status_before,
                    payment.customer_id,
                    payment.company_id
                ]
            );

            // Keep an audit record before permanently deleting payment.
            // The entire operation rolls back if logging fails.
            const sessionUserId = Number(
                req.session?.user_id || req.session?.id || 0
            );

            const userId = sessionUserId > 0
                ? sessionUserId
                : null;

            const userName =
                req.session?.user_name ||
                req.session?.username ||
                null;

            const roleName = req.session?.role || null;

            const ipAddress = String(
                req.ip || ""
            ).slice(0, 45) || null;

            const description =
                `Payment #${paymentId} cancelled permanently. ` +
                `Customer ID: ${payment.customer_id}. ` +
                `Amount: ${payment.amount}. ` +
                `Customer billing state restored from pre-payment snapshot. ` +
                `Related bill_reports deleted. MikroTik changed: No.`;

            await connection.query(
                `
                INSERT INTO activity_logs (
                    company_id,
                    user_id,
                    customer_id,
                    user_name,
                    action,
                    description,
                    module,
                    ip_address,
                    role_name,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                `,
                [
                    payment.company_id,
                    userId,
                    payment.customer_id,
                    userName,
                    "payment_cancelled",
                    description,
                    "payments",
                    ipAddress,
                    roleName
                ]
            );

            // Delete child records first because they reference payment_id
            await connection.query(
                `
                DELETE FROM bill_reports
                WHERE payment_id = ?
                  AND company_id = ?
                `,
                [paymentId, payment.company_id]
            );

            // Permanently delete the payment; no soft-delete
            const [deleteResult] = await connection.query(
                `
                DELETE FROM payments
                WHERE id = ?
                  AND company_id = ?
                  AND deleted_at IS NULL
                `,
                [paymentId, payment.company_id]
            );

            if (deleteResult.affectedRows !== 1) {
                throw new Error(
                    "Payment was not deleted. Transaction cancelled."
                );
            }

            await connection.commit();
            transactionStarted = false;

            return res.json({
                success: true,
                message:
                    "Payment cancelled. Payment and bill report deleted; " +
                    "customer billing state restored. MikroTik unchanged."
            });

        } catch (error) {
            if (connection && transactionStarted) {
                try {
                    await connection.rollback();
                } catch (_) {}
            }

            console.error(
                "Customer payment cancellation error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to cancel this payment.",
                error: process.env.NODE_ENV === "development"
                    ? error.message
                    : undefined
            });

        } finally {
            if (connection) {
                connection.release();
            }
        }
    }
);

/*
|--------------------------------------------------------------------------
| COLLECTION REPORT API
|--------------------------------------------------------------------------
| Supports optional customer_id.
| No customer_id = normal collection report.
|--------------------------------------------------------------------------
*/

router.get("/api/collection", requireLoginApi, async (req, res) => {
    try {
        const search = clean(req.query.search);
        let fromDate = clean(req.query.from_date);
        let toDate = clean(req.query.to_date);

        const customerId = getCustomerId(req, res);

        if (customerId === null) {
            return;
        }

        // Default date range: current month
        if (fromDate === "" && toDate === "") {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, "0");

            fromDate = `${year}-${month}-01`;

            const lastDay = new Date(
                year,
                now.getMonth() + 1,
                0
            ).getDate();

            toDate = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
        }

        if (fromDate !== "" && toDate === "") {
            toDate = fromDate;
        }

        if (fromDate === "" && toDate !== "") {
            fromDate = toDate;
        }

        const page = Math.max(
            1,
            Math.floor(number(req.query.page, 1))
        );

        const limit = Math.min(
            100000,
            Math.max(10, Math.floor(number(req.query.limit, 100)))
        );

        const offset = (page - 1) * limit;

        const scope = getCompanyScope(req, "b");
        const where = [scope.sql];
        const params = [...scope.params];

        // Only actual collections
        where.push("b.payment_id IS NOT NULL");
        where.push("b.collected_amount > 0");
        where.push("p.id IS NOT NULL");
        where.push("p.deleted_at IS NULL");

        // Selected customer's database ID
        if (customerId > 0) {
            where.push("p.customer_id = ?");
            params.push(customerId);
        }

        if (search !== "") {
            where.push(`
                (
                    CAST(b.user_id AS CHAR) LIKE ?
                    OR b.customer_name LIKE ?
                    OR b.pppoe_username LIKE ?
                    OR b.note LIKE ?
                    OR b.collected_by LIKE ?
                    OR b.package_name LIKE ?
                    OR b.area_name LIKE ?
                    OR b.medium LIKE ?
                    OR b.bill_type LIKE ?
                )
            `);

            const q = `%${search}%`;
            params.push(q, q, q, q, q, q, q, q, q);
        }

        if (fromDate !== "") {
            where.push("DATE(b.created_at) >= ?");
            params.push(fromDate);
        }

        if (toDate !== "") {
            where.push("DATE(b.created_at) <= ?");
            params.push(toDate);
        }

        const whereSql = where.join(" AND ");

        // Summary
        const [[summary]] = await pool.query(
            `
            SELECT
                COUNT(b.id) AS total_data,
                COALESCE(SUM(b.collected_amount), 0) AS total_bill
            FROM bill_reports b
            INNER JOIN payments p ON p.id = b.payment_id
            WHERE ${whereSql}
            `,
            params
        );

        // Pagination count
        const [[countRow]] = await pool.query(
            `
            SELECT COUNT(b.id) AS total
            FROM bill_reports b
            INNER JOIN payments p ON p.id = b.payment_id
            WHERE ${whereSql}
            `,
            params
        );

               // Collection rows
        const [rows] = await pool.query(
            `
            SELECT
                c.customer_id AS id,
                b.id AS bill_report_id,
                b.company_id,
                b.user_id,
                b.connection_type,
                b.customer_name,
                b.area_name,
                b.pppoe_username,
                b.package_name,
                b.bill_amount,
                b.discount,
                b.due_amount,
                b.collected_amount,
                b.medium,
                b.bill_type,
                b.collected_by,
                b.collector_role,
                b.note,
                b.created_at,
                b.payment_id
            FROM bill_reports b
            INNER JOIN payments p
                ON p.id = b.payment_id
            INNER JOIN customers c
                ON c.id = p.customer_id
            WHERE ${whereSql}
            ORDER BY b.id DESC
            LIMIT ${limit}
            OFFSET ${offset}
            `,
            params
        );
          const total = Number(countRow.total || 0);

        return res.json({
            status: true,
            summary: {
                total_data: Number(summary.total_data || 0),
                total_bill: Number(summary.total_bill || 0)
            },
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            filters: {
                from_date: fromDate,
                to_date: toDate
            },
            collections: rows
        });

    } catch (error) {
        console.error("Collection report error:", error);

        return res.status(500).json({
            status: false,
            message: "Unable to load collection report.",
            error: process.env.NODE_ENV === "development"
                ? error.message
                : undefined
        });
    }
});      
/*
|--------------------------------------------------------------------------
| RESELLER LIST
|--------------------------------------------------------------------------
*/

router.get("/api/resellers", requireLoginApi, async (req, res) => {
    try {
        const scope = getCompanyScope(req, "c");

        const [rows] = await pool.query(
            `
            SELECT
                c.reseller_id,
                MAX(c.name) AS reseller_name
            FROM customers c
            WHERE
                ${scope.sql}
                AND c.reseller_id IS NOT NULL
                AND c.reseller_id > 0
            GROUP BY c.reseller_id
            ORDER BY reseller_name ASC
            `,
            scope.params
        );

        return res.json({
            status: true,
            resellers: rows
        });

    } catch (error) {
        console.error("Reseller list error:", error);

        return res.status(500).json({
            status: false,
            message: "Unable to load resellers."
        });
    }
});

/*
|--------------------------------------------------------------------------
| RESELLER COLLECTION REPORT
|--------------------------------------------------------------------------
*/

router.get(
    "/api/reseller-collection",
    requireLoginApi,
    async (req, res) => {
        try {
            const search = clean(req.query.search);
            const fromDate = clean(req.query.from_date);
            const toDate = clean(req.query.to_date);

            const resellerId = number(req.query.reseller_id, 0);

            const page = Math.max(
                1,
                Math.floor(number(req.query.page, 1))
            );

            const limit = Math.min(
                100000,
                Math.max(
                    10,
                    Math.floor(number(req.query.limit, 100))
                )
            );

            const offset = (page - 1) * limit;
            const scope = getCompanyScope(req, "c");

            const where = [scope.sql];
            const params = [...scope.params];

            if (resellerId > 0) {
                where.push("c.reseller_id = ?");
                params.push(resellerId);
            }

            if (search !== "") {
                where.push(`
                    (
                        CAST(c.customer_id AS CHAR) LIKE ?
                        OR c.name LIKE ?
                        OR c.phone LIKE ?
                        OR c.pppoe_username LIKE ?
                        OR c.package_name LIKE ?
                        OR br.note LIKE ?
                        OR br.collected_by LIKE ?
                        OR br.medium LIKE ?
                        OR br.bill_type LIKE ?
                    )
                `);

                const q = `%${search}%`;
                params.push(q, q, q, q, q, q, q, q, q);
            }

            if (fromDate !== "") {
                where.push("DATE(br.created_at) >= ?");
                params.push(fromDate);
            }

            if (toDate !== "") {
                where.push("DATE(br.created_at) <= ?");
                params.push(toDate);
            }

            const whereSql = where.join(" AND ");

            const joins = `
                FROM bill_reports br
                INNER JOIN payments p ON p.id = br.payment_id
                INNER JOIN customers c ON c.id = p.customer_id
            `;

            const [[summary]] = await pool.query(
                `
                SELECT
                    COUNT(br.id) AS total_data,
                    COALESCE(SUM(br.collected_amount), 0) AS total_bill
                ${joins}
                WHERE ${whereSql}
                `,
                params
            );

            const [[countRow]] = await pool.query(
                `
                SELECT COUNT(*) AS total
                ${joins}
                WHERE ${whereSql}
                `,
                params
            );

            const [rows] = await pool.query(
                `
                SELECT
                    br.id,
                    br.payment_id,
                    br.company_id,
                    br.connection_type,
                    br.area_name,
                    br.package_name,
                    br.bill_amount,
                    br.discount,
                    br.due_amount,
                    br.collected_amount,
                    br.medium,
                    br.bill_type,
                    br.collected_by,
                    br.collector_role,
                    br.note,
                    br.created_at,
                    c.id AS database_customer_id,
                    c.customer_id AS software_customer_id,
                    c.name AS customer_real_name,
                    c.phone AS customer_phone,
                    c.address AS customer_address,
                    c.pppoe_username,
                    c.reseller_id
                ${joins}
                WHERE ${whereSql}
                ORDER BY br.id DESC
                LIMIT ? OFFSET ?
                `,
                [...params, limit, offset]
            );

            const collections = rows.map(row => ({
                id: row.id,
                payment_id: row.payment_id,
                customer_id: row.software_customer_id,
                database_customer_id: row.database_customer_id,

                name_info: {
                    name: row.customer_real_name,
                    pppoe: row.pppoe_username || "",
                    phone: row.customer_phone || "",
                    address: row.customer_address || "",
                    area: row.area_name || ""
                },

                package_bill: {
                    package: row.package_name || "",
                    bill: Number(row.bill_amount || 0)
                },

                discount: Number(row.discount || 0),
                due: Number(row.due_amount || 0),

                medium_type: {
                    medium: row.medium || "",
                    type: row.bill_type || ""
                },

                collected: Number(row.collected_amount || 0),
                commission: 0,
                collected_by: row.collected_by || "",
                collector_role: row.collector_role || "",
                note: row.note || "",
                date: row.created_at
            }));

            const total = Number(countRow.total || 0);

            return res.json({
                status: true,
                summary: {
                    total_data: Number(summary.total_data || 0),
                    total_bill: Number(summary.total_bill || 0)
                },
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                },
                collections
            });

        } catch (error) {
            console.error("Reseller collection error:", error);

            return res.status(500).json({
                status: false,
                message: "Unable to load reseller collection report.",
                error: process.env.NODE_ENV === "development"
                    ? error.message
                    : undefined
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| DEPOSIT TABLE DETECTION
|--------------------------------------------------------------------------
*/

const DEPOSIT_TABLES = [
    "deposits",
    "deposit",
    "account_deposits",
    "reseller_deposits",
    "collector_deposits"
];

async function detectDepositTable() {
    const placeholders = DEPOSIT_TABLES.map(() => "?").join(",");

    const [tables] = await pool.query(
        `
        SELECT TABLE_NAME
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME IN (${placeholders})
        ORDER BY FIELD(
            TABLE_NAME,
            ${DEPOSIT_TABLES.map(() => "?").join(",")}
        )
        LIMIT 1
        `,
        [
            process.env.DB_NAME || "ispbilling",
            ...DEPOSIT_TABLES,
            ...DEPOSIT_TABLES
        ]
    );

    if (!tables.length) {
        return null;
    }

    return tables[0].TABLE_NAME;
}

async function getColumns(table) {
    const [rows] = await pool.query(
        `SHOW COLUMNS FROM \`${table}\``
    );

    return rows.map(row => row.Field);
}

function firstExisting(columns, candidates) {
    for (const name of candidates) {
        if (columns.includes(name)) {
            return name;
        }
    }

    return null;
}

/*
|--------------------------------------------------------------------------
| DEPOSIT REPORT API
|--------------------------------------------------------------------------
*/

router.get("/api/deposit", requireLoginApi, async (req, res) => {
    try {
        const table = await detectDepositTable();

        if (!table) {
            return res.json({
                status: true,
                available: false,
                message: "No deposit table was found in the current database.",
                summary: {
                    total_data: 0,
                    total_amount: 0
                },
                pagination: {
                    page: 1,
                    limit: 100,
                    total: 0,
                    totalPages: 0
                },
                deposits: []
            });
        }

        const columns = await getColumns(table);

        const idColumn = firstExisting(
            columns,
            ["id", "deposit_id"]
        );

        const amountColumn = firstExisting(
            columns,
            ["amount", "deposit_amount", "total_amount", "deposit"]
        );

        const dateColumn = firstExisting(
            columns,
            ["deposit_date", "payment_date", "created_at", "date"]
        );

        if (!amountColumn || !dateColumn) {
            return res.json({
                status: true,
                available: false,
                message: `Deposit table "${table}" does not contain a usable amount/date structure.`,
                summary: {
                    total_data: 0,
                    total_amount: 0
                },
                pagination: {
                    page: 1,
                    limit: 100,
                    total: 0,
                    totalPages: 0
                },
                deposits: []
            });
        }

        const companyColumn = firstExisting(columns, ["company_id"]);

        const methodColumn = firstExisting(
            columns,
            ["payment_method", "method", "medium"]
        );

        const noteColumn = firstExisting(
            columns,
            ["note", "comments", "description"]
        );

        const userColumn = firstExisting(
            columns,
            ["created_by", "user_id", "collected_by"]
        );

        const search = clean(req.query.search);
        const fromDate = clean(req.query.from_date);
        const toDate = clean(req.query.to_date);

        const page = Math.max(
            1,
            Math.floor(number(req.query.page, 1))
        );

        const limit = Math.min(
            100000,
            Math.max(
                10,
                Math.floor(number(req.query.limit, 100))
            )
        );

        const offset = (page - 1) * limit;

        const where = [];
        const params = [];

        if (companyColumn) {
            const scope = getCompanyScope(req, "d");
            where.push(scope.sql);
            params.push(...scope.params);
        } else {
            const role = String(req.session?.role || "")
                .trim()
                .toLowerCase();

            if (role !== "super_admin") {
                const companyId = Number(req.session?.company_id || 0);

                if (companyId <= 0) {
                    where.push("1=0");
                } else {
                    return res.json({
                        status: true,
                        available: false,
                        message: "Deposit table has no company_id column, so tenant isolation cannot be guaranteed.",
                        summary: {
                            total_data: 0,
                            total_amount: 0
                        },
                        pagination: {
                            page,
                            limit,
                            total: 0,
                            totalPages: 0
                        },
                        deposits: []
                    });
                }
            }
        }

        if (search !== "") {
            const searchParts = [];

            if (methodColumn) {
                searchParts.push(`d.\`${methodColumn}\` LIKE ?`);
                params.push(`%${search}%`);
            }

            if (noteColumn) {
                searchParts.push(`d.\`${noteColumn}\` LIKE ?`);
                params.push(`%${search}%`);
            }

            if (userColumn) {
                searchParts.push(
                    `CAST(d.\`${userColumn}\` AS CHAR) LIKE ?`
                );
                params.push(`%${search}%`);
            }

            if (searchParts.length) {
                where.push(`(${searchParts.join(" OR ")})`);
            }
        }

        if (fromDate) {
            where.push(`DATE(d.\`${dateColumn}\`) >= ?`);
            params.push(fromDate);
        }

        if (toDate) {
            where.push(`DATE(d.\`${dateColumn}\`) <= ?`);
            params.push(toDate);
        }

        if (!where.length) {
            where.push("1=1");
        }

        const whereSql = where.join(" AND ");

        const [[summary]] = await pool.query(
            `
            SELECT
                COUNT(*) AS total_data,
                COALESCE(SUM(d.\`${amountColumn}\`), 0) AS total_amount
            FROM \`${table}\` d
            WHERE ${whereSql}
            `,
            params
        );

        const [[countRow]] = await pool.query(
            `
            SELECT COUNT(*) AS total
            FROM \`${table}\` d
            WHERE ${whereSql}
            `,
            params
        );

        const selectColumns = [
            idColumn
                ? `d.\`${idColumn}\` AS id`
                : "NULL AS id",

            `d.\`${amountColumn}\` AS amount`,
            `d.\`${dateColumn}\` AS deposit_date`,

            methodColumn
                ? `d.\`${methodColumn}\` AS payment_method`
                : "'' AS payment_method",

            noteColumn
                ? `d.\`${noteColumn}\` AS note`
                : "'' AS note",

            userColumn
                ? `d.\`${userColumn}\` AS created_by`
                : "NULL AS created_by"
        ];

        const [rows] = await pool.query(
            `
            SELECT ${selectColumns.join(",\n")}
            FROM \`${table}\` d
            WHERE ${whereSql}
            ORDER BY d.\`${dateColumn}\` DESC
            LIMIT ? OFFSET ?
            `,
            [...params, limit, offset]
        );

        const total = Number(countRow.total || 0);

        return res.json({
            status: true,
            available: true,
            table,
            summary: {
                total_data: Number(summary.total_data || 0),
                total_amount: Number(summary.total_amount || 0)
            },
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            deposits: rows
        });

    } catch (error) {
        console.error("Deposit report error:", error);

        return res.status(500).json({
            status: false,
            message: "Unable to load deposit report.",
            error: process.env.NODE_ENV === "development"
                ? error.message
                : undefined
        });
    }
});

/*
|--------------------------------------------------------------------------
| COLLECTION CSV EXPORT
|--------------------------------------------------------------------------
| Supports customer_id while preserving the normal CSV export.
|--------------------------------------------------------------------------
*/

router.get(
    "/api/collection/csv",
    requireLoginApi,
    async (req, res) => {
        try {
            const search = clean(req.query.search);
            const fromDate = clean(req.query.from_date);
            const toDate = clean(req.query.to_date);

            const customerId = getCustomerId(req, res, true);

            if (customerId === null) {
                return;
            }

            const scope = getCompanyScope(req, "b");

            const where = [scope.sql];
            const params = [...scope.params];

            // Actual collections only
            where.push("b.payment_id IS NOT NULL");
            where.push("b.collected_amount > 0");

            where.push(`
                EXISTS (
                    SELECT 1
                    FROM payments p
                    WHERE p.id = b.payment_id
                      AND p.deleted_at IS NULL
                )
            `);

            // Selected customer only
            if (customerId > 0) {
                where.push(`
                    EXISTS (
                        SELECT 1
                        FROM payments p2
                        WHERE p2.id = b.payment_id
                          AND p2.customer_id = ?
                          AND p2.deleted_at IS NULL
                    )
                `);

                params.push(customerId);
            }

            if (search !== "") {
                where.push(`
                    (
                        CAST(b.user_id AS CHAR) LIKE ?
                        OR b.customer_name LIKE ?
                        OR b.pppoe_username LIKE ?
                        OR b.note LIKE ?
                        OR b.collected_by LIKE ?
                        OR b.package_name LIKE ?
                        OR b.area_name LIKE ?
                        OR b.medium LIKE ?
                        OR b.bill_type LIKE ?
                    )
                `);

                const q = `%${search}%`;
                params.push(q, q, q, q, q, q, q, q, q);
            }

            if (fromDate !== "") {
                where.push("DATE(b.created_at) >= ?");
                params.push(fromDate);
            }

            if (toDate !== "") {
                where.push("DATE(b.created_at) <= ?");
                params.push(toDate);
            }

            const [rows] = await pool.query(
                `
                SELECT
                    b.id,
                    b.connection_type,
                    b.customer_name,
                    b.area_name,
                    b.pppoe_username,
                    b.package_name,
                    b.bill_amount,
                    b.discount,
                    b.due_amount,
                    b.medium,
                    b.bill_type,
                    b.collected_amount,
                    b.collected_by,
                    b.collector_role,
                    b.note,
                    b.created_at
                FROM bill_reports b
                WHERE ${where.join(" AND ")}
                ORDER BY b.id DESC
                `,
                params
            );

            const headers = [
                "ID",
                "Connection Type",
                "Customer",
                "Area",
                "PPPoE",
                "Package",
                "Bill",
                "Discount",
                "Due",
                "Medium",
                "Bill Type",
                "Collected",
                "Collected By",
                "Collector Role",
                "Note",
                "Date"
            ];

            const lines = [
                headers.map(escapeCsv).join(",")
            ];

            for (const row of rows) {
                lines.push(
                    [
                        row.id,
                        row.connection_type,
                        row.customer_name,
                        row.area_name,
                        row.pppoe_username,
                        row.package_name,
                        row.bill_amount,
                        row.discount,
                        row.due_amount,
                        row.medium,
                        row.bill_type,
                        row.collected_amount,
                        row.collected_by,
                        row.collector_role,
                        row.note,
                        row.created_at
                    ]
                    .map(escapeCsv)
                    .join(",")
                );
            }

            const filename = customerId > 0
                ? `customer_${customerId}_bill_report.csv`
                : "collection_report.csv";

            res.setHeader(
                "Content-Type",
                "text/csv; charset=utf-8"
            );

            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${filename}"`
            );

            return res.send(
                "\uFEFF" + lines.join("\r\n")
            );

        } catch (error) {
            console.error("Collection CSV error:", error);

            return res.status(500).send(
                "Unable to export collection report."
            );
        }
    }
);

module.exports = router;
