
"use strict";

const crypto = require("crypto");
const db = require("../config/database");

const MONTHLY_NOTICE_DAYS = 7;
const MONTHLY_NOTICE_MS =
    MONTHLY_NOTICE_DAYS * 24 * 60 * 60 * 1000;

function normalizeRole(role) {
    return String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
}

function isSuperAdmin(req) {
    return normalizeRole(req.session?.role) === "superadmin";
}

function createCsrfToken() {
    return crypto.randomBytes(32).toString("hex");
}

function ensureCsrf(req) {
    if (!req.session.csrf_token) {
        req.session.csrf_token = createCsrfToken();
    }

    return req.session.csrf_token;
}

function verifyCsrf(req) {
    const sessionToken = String(req.session?.csrf_token || "");
    const postedToken = String(
        req.body?.csrf_token ||
        req.body?.csrf ||
        ""
    );

    if (
        !sessionToken ||
        !postedToken ||
        sessionToken.length !== postedToken.length
    ) {
        return false;
    }

    return crypto.timingSafeEqual(
        Buffer.from(sessionToken),
        Buffer.from(postedToken)
    );
}

function userId(req) {
    return Number(req.session?.user_id || 0);
}

function companyId(req) {
    return Number(
        req.session?.company_id ||
        req.session?.companyId ||
        0
    );
}

function getMonthlyInfo(billing) {
    if (
        !billing ||
        String(billing.billing_type || "").toLowerCase() !== "monthly"
    ) {
        return {
            monthly_notice: false,
            monthly_expired: false,
            monthly_required: false,
            monthly_days_remaining: null
        };
    }

    if (!billing.due_date) {
        return {
            monthly_notice: true,
            monthly_expired: true,
            monthly_required: true,
            monthly_days_remaining: null
        };
    }

    const dueTimestamp = new Date(billing.due_date).getTime();

    if (!Number.isFinite(dueTimestamp)) {
        return {
            monthly_notice: true,
            monthly_expired: true,
            monthly_required: true,
            monthly_days_remaining: null
        };
    }

    const remainingMs = dueTimestamp - Date.now();
    const expired = remainingMs <= 0;

    return {
        monthly_notice:
            expired || remainingMs <= MONTHLY_NOTICE_MS,

        monthly_expired: expired,

        monthly_required: expired,

        monthly_days_remaining: Math.max(
            0,
            Math.ceil(remainingMs / (24 * 60 * 60 * 1000))
        )
    };
}

/*
|--------------------------------------------------------------------------
| CURRENT BILLING
|--------------------------------------------------------------------------
*/

async function current(req, res) {
    try {
        if (isSuperAdmin(req)) {
            return res.json({
                success: true,
                required: false,
                super_admin: true,
                billing: null,
                monthly_notice: false,
                csrf_token: ensureCsrf(req)
            });
        }

        const uid = userId(req);
        const cid = companyId(req);

        if (uid <= 0 || cid <= 0) {
            return res.status(403).json({
                success: false,
                message: "Company information is missing."
            });
        }

        const [rows] = await db.execute(
            `
            SELECT
                s.id,
                s.company_id,
                s.user_id,
                s.billing_type,
                s.package_id,
                s.package_code,
                s.user_count,
                s.rate_per_user,
                s.amount,
                s.status,
                s.due_date,
                s.paid_at,
                s.created_at,
                s.updated_at,
                p.package_name
            FROM software_billing_notifications s
            LEFT JOIN software_packages p
                ON p.id = s.package_id
            WHERE s.user_id = ?
              AND s.company_id = ?
              AND s.status = 'unpaid'
            ORDER BY
                CASE
                    WHEN s.billing_type = 'registration' THEN 0
                    ELSE 1
                END,
                s.id DESC
            LIMIT 1
            `,
            [uid, cid]
        );

        const billing = rows.length ? rows[0] : null;
        const type = String(billing?.billing_type || "").toLowerCase();

        let required = Boolean(billing);
        let monthlyInfo = {
            monthly_notice: false,
            monthly_expired: false,
            monthly_required: false,
            monthly_days_remaining: null
        };

        if (type === "monthly") {
            monthlyInfo = getMonthlyInfo(billing);
            required = monthlyInfo.monthly_required;
        }

        return res.json({
            success: true,
            required,
            super_admin: false,
            billing,
            ...monthlyInfo,
            csrf_token: ensureCsrf(req)
        });

    } catch (error) {
        console.error("CURRENT BILLING ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load billing information."
        });
    }
}

/*
|--------------------------------------------------------------------------
| PAYMENT HISTORY
|--------------------------------------------------------------------------
*/

async function history(req, res) {
    try {
        const uid = userId(req);
        const cid = companyId(req);

        if (isSuperAdmin(req)) {
            const [rows] = await db.execute(
                `
                SELECT
                    p.*,
                    s.billing_type,
                    s.package_code,
                    u.username,
                    u.name,
                    u.fullname
                FROM software_billing_payments p
                LEFT JOIN software_billing_notifications s
                    ON s.id = p.billing_id
                LEFT JOIN users u
                    ON u.id = p.user_id
                ORDER BY p.id DESC
                `
            );

            return res.json({
                success: true,
                payments: rows
            });
        }

        if (uid <= 0 || cid <= 0) {
            return res.status(403).json({
                success: false,
                message: "Company information is missing."
            });
        }

        const [rows] = await db.execute(
            `
            SELECT
                p.*,
                s.billing_type,
                s.package_code
            FROM software_billing_payments p
            INNER JOIN software_billing_notifications s
                ON s.id = p.billing_id
            WHERE p.user_id = ?
              AND p.company_id = ?
            ORDER BY p.id DESC
            `,
            [uid, cid]
        );

        return res.json({
            success: true,
            payments: rows
        });

    } catch (error) {
        console.error("BILLING HISTORY ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load payment history."
        });
    }
}

/*
|--------------------------------------------------------------------------
| SUPER ADMIN BILLING LIST
|--------------------------------------------------------------------------
*/

async function adminList(req, res) {
    if (!isSuperAdmin(req)) {
        return res.status(403).json({
            success: false,
            message: "Super Admin access required."
        });
    }

    try {
        const [rows] = await db.execute(
            `
            SELECT
                s.*,
                COALESCE(
                    u.name,
                    u.username,
                    CONCAT('User #', s.user_id)
                ) AS user_name,
                u.username,
                u.email,
                u.mobile,
                p.package_name
            FROM software_billing_notifications s
            LEFT JOIN users u
                ON u.id = s.user_id
            LEFT JOIN software_packages p
                ON p.id = s.package_id
            ORDER BY
                CASE
                    WHEN s.status = 'unpaid' THEN 0
                    ELSE 1
                END,
                s.id DESC
            `
        );

        return res.json({
            success: true,
            billing: rows
        });

    } catch (error) {
        console.error("ADMIN BILLING LIST ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load software billing."
        });
    }
}

/*
|--------------------------------------------------------------------------
| MANUAL PAYMENT - SUPER ADMIN
|--------------------------------------------------------------------------
*/

async function manualPay(req, res) {
    let connection = null;

    try {
        if (!isSuperAdmin(req)) {
            return res.status(403).json({
                success: false,
                message: "Super Admin access required."
            });
        }

        if (!verifyCsrf(req)) {
            return res.status(403).json({
                success: false,
                message: "Invalid CSRF token.",
                csrf_token: ensureCsrf(req)
            });
        }

        const billingId = Number(req.body.billing_id || 0);

        if (!Number.isInteger(billingId) || billingId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid billing ID."
            });
        }

        const method = String(req.body.method || "Other")
            .trim()
            .slice(0, 100);

        const reference = String(req.body.reference || "")
            .trim()
            .slice(0, 150);

        const note = String(req.body.note || "")
            .trim()
            .slice(0, 1000);

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [billingRows] = await connection.execute(
            `
            SELECT
                id,
                company_id,
                user_id,
                billing_type,
                amount,
                status
            FROM software_billing_notifications
            WHERE id = ?
            LIMIT 1
            FOR UPDATE
            `,
            [billingId]
        );

        if (!billingRows.length) {
            throw new Error("Billing record not found.");
        }

        const billing = billingRows[0];

        if (String(billing.status).toLowerCase() !== "unpaid") {
            throw new Error("This billing is already paid.");
        }

        const amount = Number(billing.amount || 0);

        if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error("Invalid billing amount.");
        }

        const paymentNote =
            "Manual method: " +
            method +
            (note ? " | " + note : "");

        const [paymentResult] = await connection.execute(
            `
            INSERT INTO software_billing_payments
            (
                billing_id,
                company_id,
                user_id,
                payment_mode,
                gateway,
                transaction_id,
                reference_no,
                amount,
                currency,
                status,
                payment_note,
                gateway_response,
                created_by,
                paid_at
            )
            VALUES
            (?, ?, ?, 'manual', NULL, NULL, ?, ?, 'BDT',
             'paid', ?, NULL, ?, NOW())
            `,
            [
                billing.id,
                billing.company_id,
                billing.user_id,
                reference || null,
                amount,
                paymentNote,
                userId(req)
            ]
        );

        const paymentId = Number(paymentResult.insertId);

        if (paymentId <= 0) {
            throw new Error("Payment record was not created.");
        }

        const [billingUpdate] = await connection.execute(
            `
            UPDATE software_billing_notifications
            SET
                status = 'paid',
                paid_at = NOW(),
                updated_at = NOW()
            WHERE id = ?
              AND status = 'unpaid'
            LIMIT 1
            `,
            [billing.id]
        );

        if (billingUpdate.affectedRows !== 1) {
            throw new Error("Billing status could not be updated.");
        }

        /*
         * Invoice is linked by billing_id.
         * This avoids accidentally updating another invoice
         * belonging to the same user with the same amount.
         */
        await connection.execute(
            `
            UPDATE invoices
            SET
                status = 'paid',
                paid_date = NOW()
            WHERE billing_id = ?
              AND company_id = ?
              AND user_id = ?
              AND status = 'unpaid'
            `,
            [
                billing.id,
                billing.company_id,
                billing.user_id
            ]
        );

        await connection.commit();

        return res.json({
            success: true,
            message: "Payment recorded successfully.",
            billing_id: billing.id,
            payment_id: paymentId,
            csrf_token: ensureCsrf(req),
            redirect:
                `/software-billing/receipt?billing_id=${billing.id}&payment_id=${paymentId}`
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    "MANUAL PAYMENT ROLLBACK ERROR:",
                    rollbackError
                );
            }
        }

        console.error("MANUAL PAYMENT ERROR:", error);

        return res.status(400).json({
            success: false,
            message: error.message || "Payment failed.",
            csrf_token: ensureCsrf(req)
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
}

/*
|--------------------------------------------------------------------------
| RECEIPT
|--------------------------------------------------------------------------
*/

async function receipt(req, res) {
    try {
        const billingId = Number(req.query.billing_id || 0);
        const paymentId = Number(req.query.payment_id || 0);

        if (
            !Number.isInteger(billingId) ||
            billingId <= 0 ||
            !Number.isInteger(paymentId) ||
            paymentId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid receipt request."
            });
        }

        let rows;

        if (isSuperAdmin(req)) {
            [rows] = await db.execute(
                `
                SELECT
                    p.*,
                    s.billing_type,
                    s.package_code,
                    s.amount AS billing_amount,
                    s.status AS billing_status,
                    u.username,
                    u.name,
                    u.fullname,
                    u.email,
                    u.mobile,
                    u.company_id
                FROM software_billing_payments p
                INNER JOIN software_billing_notifications s
                    ON s.id = p.billing_id
                LEFT JOIN users u
                    ON u.id = p.user_id
                WHERE p.id = ?
                  AND p.billing_id = ?
                LIMIT 1
                `,
                [paymentId, billingId]
            );

        } else {
            const uid = userId(req);
            const cid = companyId(req);

            if (uid <= 0 || cid <= 0) {
                return res.status(403).json({
                    success: false,
                    message: "Company information is missing."
                });
            }

            [rows] = await db.execute(
                `
                SELECT
                    p.*,
                    s.billing_type,
                    s.package_code,
                    s.amount AS billing_amount,
                    s.status AS billing_status,
                    u.username,
                    u.name,
                    u.fullname,
                    u.email,
                    u.mobile,
                    u.company_id
                FROM software_billing_payments p
                INNER JOIN software_billing_notifications s
                    ON s.id = p.billing_id
                LEFT JOIN users u
                    ON u.id = p.user_id
                WHERE p.id = ?
                  AND p.billing_id = ?
                  AND p.user_id = ?
                  AND p.company_id = ?
                LIMIT 1
                `,
                [paymentId, billingId, uid, cid]
            );
        }

        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message: "Receipt not found."
            });
        }

        return res.json({
            success: true,
            receipt: rows[0]
        });

    } catch (error) {
        console.error("RECEIPT ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load receipt."
        });
    }
}

/*
|--------------------------------------------------------------------------
| CSRF
|--------------------------------------------------------------------------
*/

async function csrf(req, res) {
    return res.json({
        success: true,
        csrf_token: ensureCsrf(req)
    });
}

module.exports = {
    current,
    history,
    adminList,
    manualPay,
    receipt,
    csrf
};
