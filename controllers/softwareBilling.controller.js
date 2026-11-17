
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
        if (isSuperAdmin(req)) {
            return res.status(403).json({
                success: false,
                message: "ISP Admin access required."
            });
        }

        if (!verifyCsrf(req)) {
            return res.status(403).json({
                success: false,
                message: "Invalid CSRF token.",
                csrf_token: ensureCsrf(req)
            });
        }

        const uid = userId(req);
        const cid = companyId(req);
        const billingId = Number(req.body.billing_id || 0);

        if (!uid || !cid || !Number.isInteger(billingId) || billingId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid billing information."
            });
        }

        const method = String(
            req.body.payment_method || req.body.method || "Other"
        ).trim().slice(0, 100);

        const reference = String(req.body.reference || "")
            .trim().slice(0, 150);

        const note = String(req.body.note || "")
            .trim().slice(0, 1000);

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [billingRows] = await connection.execute(
            `
            SELECT id, company_id, user_id, amount, status
            FROM software_billing_notifications
            WHERE id = ?
              AND company_id = ?
              AND user_id = ?
            LIMIT 1
            FOR UPDATE
            `,
            [billingId, cid, uid]
        );

        if (!billingRows.length) {
            throw new Error("Billing record not found.");
        }

        const billing = billingRows[0];

        if (String(billing.status).toLowerCase() !== "unpaid") {
            throw new Error("This billing is not unpaid.");
        }

        const amount = Number(billing.amount || 0);

        if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error("Invalid billing amount.");
        }

        const [pendingRows] = await connection.execute(
            `
            SELECT id
            FROM software_billing_payments
            WHERE billing_id = ?
              AND company_id = ?
              AND user_id = ?
              AND payment_mode = 'manual'
              AND status = 'pending'
            LIMIT 1
            FOR UPDATE
            `,
            [billing.id, cid, uid]
        );

        if (pendingRows.length) {
            throw new Error("A manual payment is already pending for this billing.");
        }

        const paymentNote =
            "Method: " + method + (note ? " | " + note : "");

        const [insertResult] = await connection.execute(
            `
            INSERT INTO software_billing_payments
            (
                billing_id, company_id, user_id,
                payment_mode, gateway, transaction_id,
                reference_no, amount, currency, status,
                payment_note, created_by, paid_at
            )
            VALUES (?, ?, ?, 'manual', NULL, NULL, ?, ?, 'BDT',
                    'pending', ?, ?, NULL)
            `,
            [
                billing.id,
                cid,
                uid,
                reference || null,
                amount,
                paymentNote,
                uid
            ]
        );

        await connection.commit();

        return res.json({
            success: true,
            message: "Manual payment submitted. Waiting for Super Admin approval.",
            billing_id: billing.id,
            payment_id: Number(insertResult.insertId),
            status: "pending"
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error("MANUAL PAYMENT ROLLBACK ERROR:", rollbackError);
            }
        }

        console.error("MANUAL PAYMENT ERROR:", error);

        return res.status(400).json({
            success: false,
            message: error.message || "Payment submission failed."
        });

    } finally {
        if (connection) connection.release();
    }
}


async function pendingManualPayments(req, res) {
    try {
        if (!isSuperAdmin(req)) {
            return res.status(403).json({
                success: false,
                message: "Super Admin access required."
            });
        }

        const [rows] = await db.execute(
            `
            SELECT
                p.id,
                p.billing_id,
                p.company_id,
                p.user_id,
                p.payment_mode,
                p.reference_no,
                p.amount,
                p.currency,
                p.status,
                p.payment_note,
                p.created_at,
                s.billing_type,
                s.package_code,
                COALESCE(u.name, u.username, CONCAT('User #', p.user_id)) AS user_name
            FROM software_billing_payments p
            INNER JOIN software_billing_notifications s
                ON s.id = p.billing_id
               AND s.company_id = p.company_id
               AND s.user_id = p.user_id
            LEFT JOIN users u
                ON u.id = p.user_id
            WHERE p.payment_mode = 'manual'
              AND p.status = 'pending'
            ORDER BY p.created_at ASC, p.id ASC
            `
        );

        return res.json({
            success: true,
            rows
        });

    } catch (error) {
        console.error("PENDING MANUAL PAYMENTS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load pending manual payments."
        });
    }
}


async function reviewManualPayment(req, res, decision) {
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

        if (decision !== "approve" && decision !== "reject") {
            return res.status(400).json({
                success: false,
                message: "Invalid payment decision."
            });
        }

        const paymentId = Number(
            req.params.id || req.body.payment_id || 0
        );

        if (!Number.isInteger(paymentId) || paymentId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment ID."
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [paymentRows] = await connection.execute(
            `
            SELECT
                p.id,
                p.billing_id,
                p.company_id,
                p.user_id,
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
            `,
            [paymentId]
        );

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

            const [billingUpdate] = await connection.execute(
                `
                UPDATE software_billing_notifications
                SET status = 'paid',
                    paid_at = NOW(),
                    updated_at = NOW()
                WHERE id = ?
                  AND company_id = ?
                  AND user_id = ?
                  AND status = 'unpaid'
                LIMIT 1
                `,
                [
                    payment.billing_id,
                    payment.company_id,
                    payment.user_id
                ]
            );

            if (billingUpdate.affectedRows !== 1) {
                throw new Error("Billing could not be marked paid.");
            }

            const [invoiceUpdate] = await connection.execute(
                `
                UPDATE invoices
                SET status = 'paid',
                    paid_date = NOW()
                WHERE billing_id = ?
                  AND company_id = ?
                  AND user_id = ?
                  AND status = 'unpaid'
                `,
                [
                    payment.billing_id,
                    payment.company_id,
                    payment.user_id
                ]
            );

            if (invoiceUpdate.affectedRows < 1) {
                throw new Error(
                    "Software invoice not found or already paid. Approval cancelled."
                );
            }

            const [paymentUpdate] = await connection.execute(
                `
                UPDATE software_billing_payments
                SET status = 'paid',
                    paid_at = NOW(),
                    updated_at = NOW()
                WHERE id = ?
                  AND status = 'pending'
                LIMIT 1
                `,
                [paymentId]
            );

            if (paymentUpdate.affectedRows !== 1) {
                throw new Error("Payment approval could not be saved.");
            }

        } else {
            const [paymentUpdate] = await connection.execute(
                `
                UPDATE software_billing_payments
                SET status = 'rejected',
                    updated_at = NOW()
                WHERE id = ?
                  AND status = 'pending'
                LIMIT 1
                `,
                [paymentId]
            );

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

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error("PAYMENT REVIEW ROLLBACK ERROR:", rollbackError);
            }
        }

        console.error("MANUAL PAYMENT REVIEW ERROR:", error);

        return res.status(400).json({
            success: false,
            message: error.message || "Unable to review payment."
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
}

async function approveManualPayment(req, res) {
    return reviewManualPayment(req, res, "approve");
}


async function rejectManualPayment(req, res) {
    return reviewManualPayment(req, res, "reject");
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
    pendingManualPayments,
    approveManualPayment,
    rejectManualPayment,
    receipt,
    csrf
};
