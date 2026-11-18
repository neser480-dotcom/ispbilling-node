"use strict";

/*
|--------------------------------------------------------------------------
| MANUAL (SEND MONEY) PAYMENT
|--------------------------------------------------------------------------
| For ISPs without a merchant account.
|
|   Customer : pays the ISP's own bKash/Nagad number by Send Money, then
|              submits the TrxID on the public payment page.
|   ISP Admin: checks the TrxID in their own wallet app and Approves.
|   Approve  : runs the SAME ledger step as the online flow
|              (paymentSettlement -> Customer Recharge), once only.
|
| The amount is always calculated by the server (Customer Recharge
| calculation). The customer's TrxID/number are only claims until an
| admin approves them.
|--------------------------------------------------------------------------
*/

const path = require("path");

const db = require("../../config/database");
const paymentService = require("../../services/payment/payment.service");
const settlement = require("../../services/payment/paymentSettlement.service");
const main = require("./paymentGateway.controller");

const {
    verifyCsrf,
    getCsrfToken,
    quoteCustomerBill,
    companyFromSlug,
    CheckoutError,
    sendCheckoutError,
    slugTakenByAnotherCompany,
    SLUG_RE
} = main._internal;

const METHODS = { nagad: "Nagad", bkash: "Bkash" };
const PHONE_RE = /^01\d{9}$/;
const TRX_RE = /^[A-Z0-9]{6,20}$/;
const MAX_OPEN_PER_CUSTOMER = 3;

/*
|--------------------------------------------------------------------------
| ADMIN HELPERS  (ISP Admin of their OWN company)
|--------------------------------------------------------------------------
*/

function normalizeRole(role) {
    return String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
}

function isIspAdmin(req) {
    return ["superadmin", "admin", "companyadmin", "owner"].includes(
        normalizeRole(req.session?.role)
    );
}

function adminGuard(req, res, { json = true, csrf = false } = {}) {
    if (!req.session || !req.session.user_id) {
        if (json) {
            res.status(401).json({ success: false, message: "Not logged in." });
        } else {
            res.redirect("/");
        }

        return null;
    }

    if (!isIspAdmin(req)) {
        if (json) {
            res.status(403).json({
                success: false,
                message: "Administrator access required."
            });
        } else {
            res.status(403).send("Administrator access required.");
        }

        return null;
    }

    const companyId = Number(req.session.company_id || 0);

    if (!Number.isInteger(companyId) || companyId <= 0) {
        res.status(400).json({
            success: false,
            message: "Company ID is required."
        });

        return null;
    }

    if (csrf && !verifyCsrf(req)) {
        res.status(419).json({
            success: false,
            message: "Invalid CSRF token."
        });

        return null;
    }

    return companyId;
}

/*
|--------------------------------------------------------------------------
| ADMIN PAGE + SETTINGS
|--------------------------------------------------------------------------
*/

function page(req, res) {
    if (adminGuard(req, res, { json: false }) === null) {
        return;
    }

    return res.sendFile(
        path.join(
            __dirname, "..", "..", "views", "billing", "payment",
            "manual-payments.html"
        )
    );
}

async function getSettings(req, res) {
    const companyId = adminGuard(req, res);

    if (companyId === null) {
        return;
    }

    try {
        const row = await paymentService.getGateway(
            companyId, "manual", "customer"
        );

        return res.json({
            success: true,
            csrf_token: getCsrfToken(req),
            enabled: Boolean(row?.enabled),
            settings: row?.settings || {}
        });
    } catch (error) {
        console.error("MANUAL SETTINGS LOAD ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load settings."
        });
    }
}

async function saveSettings(req, res) {
    const companyId = adminGuard(req, res, { csrf: true });

    if (companyId === null) {
        return;
    }

    try {
        const body = req.body || {};
        const enabled = Boolean(body.enabled);

        const slug = String(body.slug || "").trim().toLowerCase();
        const nagadNumber = String(body.nagad_number || "").trim();
        const bkashNumber = String(body.bkash_number || "").trim();
        const note = String(body.note || "").trim().slice(0, 300);

        for (const number of [nagadNumber, bkashNumber]) {
            if (number && !PHONE_RE.test(number)) {
                throw new CheckoutError(
                    "Invalid mobile number (use 11 digits, e.g. 01XXXXXXXXX)."
                );
            }
        }

        if (enabled && !nagadNumber && !bkashNumber) {
            throw new CheckoutError(
                "Enter at least one Nagad or bKash number."
            );
        }

        if (enabled || slug) {
            if (!SLUG_RE.test(slug)) {
                throw new CheckoutError(
                    "Payment link name: use 3-40 letters, digits or hyphens."
                );
            }

            if (await slugTakenByAnotherCompany(slug, companyId)) {
                throw new CheckoutError(
                    "This payment link name is already taken."
                );
            }
        }

        await paymentService.saveGateway({
            companyId,
            scope: "customer",
            gateway: "manual",
            enabled,
            environment: "live",
            credentials: {},
            settings: {
                slug,
                nagad_number: nagadNumber,
                bkash_number: bkashNumber,
                note
            }
        });

        return res.json({
            success: true,
            message: "Saved."
        });
    } catch (error) {
        return sendCheckoutError(res, error, "MANUAL SETTINGS SAVE ERROR:");
    }
}

/*
|--------------------------------------------------------------------------
| ADMIN LIST / APPROVE / REJECT
|--------------------------------------------------------------------------
*/

async function list(req, res) {
    const companyId = adminGuard(req, res);

    if (companyId === null) {
        return;
    }

    try {
        const [rows] = await db.execute(
            `SELECT id, transaction_id, amount, status,
                    gateway_transaction_id, created_at, metadata
             FROM payment_transactions
             WHERE company_id = ?
               AND gateway = 'manual'
               AND status IN
                   ('awaiting_approval','verified','needs_review','paid','failed')
             ORDER BY (status = 'awaiting_approval') DESC, id DESC
             LIMIT 100`,
            [companyId]
        );

        return res.json({
            success: true,
            csrf_token: getCsrfToken(req),
            items: rows.map((row) => {
                const request =
                    paymentService.parseJson(row.metadata, {}).request || {};

                return {
                    transaction_id: row.transaction_id,
                    status: row.status,
                    amount: Number(row.amount),
                    customer_id: request.customer_id || "",
                    customer_name: request.customer_name || "",
                    method: request.method || "",
                    trx_id: request.trx_id || "",
                    sender_number: request.sender_number || "",
                    created_at: row.created_at
                };
            })
        });
    } catch (error) {
        console.error("MANUAL LIST ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load payments."
        });
    }
}

async function loadOwnTransaction(req, res, companyId) {
    const id = String(req.body?.transaction_id || "").trim();

    if (!/^[A-Za-z0-9]{6,40}$/.test(id)) {
        res.status(400).json({
            success: false,
            message: "Invalid transaction."
        });

        return null;
    }

    const transaction =
        await paymentService.getTransactionByTransactionId(id);

    /* company isolation: another ISP's payment looks like "not found" */
    if (
        !transaction ||
        transaction.gateway !== "manual" ||
        Number(transaction.company_id) !== Number(companyId)
    ) {
        res.status(404).json({
            success: false,
            message: "Payment not found."
        });

        return null;
    }

    return transaction;
}

async function approve(req, res) {
    const companyId = adminGuard(req, res, { csrf: true });

    if (companyId === null) {
        return;
    }

    try {
        const transaction = await loadOwnTransaction(req, res, companyId);

        if (!transaction) {
            return;
        }

        if (transaction.status === "awaiting_approval") {
            const meta = paymentService.parseJson(transaction.metadata, {});

            const claimed = await paymentService.changeStatus(
                transaction.id,
                ["awaiting_approval"],
                "verified",
                {
                    payment_date: new Date(),
                    verified_at: new Date(),
                    metadata: JSON.stringify({
                        ...meta,
                        approved_by: Number(req.session.user_id),
                        approved_at: new Date().toISOString()
                    })
                }
            );

            if (!claimed) {
                return res.status(409).json({
                    success: false,
                    message: "This payment was already handled."
                });
            }
        } else if (transaction.status !== "verified") {
            /* "verified" = approved earlier, ledger step to be retried */
            return res.status(409).json({
                success: false,
                message: "This payment cannot be approved."
            });
        }

        // Reload the transaction after approval so settlement receives
        // the current database status ("verified"), not the stale object.
        const approvedTransaction =
            await paymentService.getTransactionByTransactionId(
                String(req.body?.transaction_id || "").trim()
            );

        if (!approvedTransaction || approvedTransaction.status !== "verified") {
            return res.status(409).json({
                success: false,
                message: "Approved payment could not be reloaded. Please retry."
            });
        }

        const outcome = await settlement.settle(approvedTransaction);

        const messages = {
            paid: "Approved. Customer bill updated.",
            needs_review:
                "Approved, but the bill could not be updated automatically " +
                "(the customer's due changed). Please recharge the customer manually.",
            verified:
                "Approved, but a temporary error stopped the bill update. " +
                "Press Approve again to retry."
        };

        return res.json({
            success: outcome.state === "paid",
            state: outcome.state,
            message: messages[outcome.state] || "Done."
        });
    } catch (error) {
        console.error("MANUAL APPROVE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to approve the payment."
        });
    }
}

async function reject(req, res) {
    const companyId = adminGuard(req, res, { csrf: true });

    if (companyId === null) {
        return;
    }

    try {
        const transaction = await loadOwnTransaction(req, res, companyId);

        if (!transaction) {
            return;
        }

        const meta = paymentService.parseJson(transaction.metadata, {});

        const done = await paymentService.changeStatus(
            transaction.id,
            ["awaiting_approval"],
            "failed",
            {
                metadata: JSON.stringify({
                    ...meta,
                    rejected_by: Number(req.session.user_id),
                    reject_reason: String(req.body?.reason || "")
                        .trim()
                        .slice(0, 200)
                })
            }
        );

        if (!done) {
            return res.status(409).json({
                success: false,
                message: "This payment was already handled."
            });
        }

        return res.json({ success: true, message: "Rejected." });
    } catch (error) {
        console.error("MANUAL REJECT ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to reject the payment."
        });
    }
}

/*
|--------------------------------------------------------------------------
| PUBLIC: payment options + submit TrxID  (no login)
|--------------------------------------------------------------------------
*/

async function publicInfo(req, res) {
    try {
        const slug = String(req.body?.slug || "");

        const companyId = await companyFromSlug(slug, ["nagad", "manual"]);

        const manual = await paymentService.getGateway(
            companyId, "manual", "customer"
        );

        const online = await paymentService.getGateway(
            companyId, "nagad", "customer"
        );

        const settings = manual?.settings || {};

        return res.json({
            success: true,
            online_nagad: Boolean(online?.enabled),
            manual: manual?.enabled
                ? {
                    nagad_number: settings.nagad_number || "",
                    bkash_number: settings.bkash_number || "",
                    note: settings.note || ""
                }
                : null
        });
    } catch (error) {
        return sendCheckoutError(res, error, "PUBLIC INFO ERROR:");
    }
}

async function publicSubmit(req, res) {
    try {
        const body = req.body || {};

        const companyId = await companyFromSlug(body.slug, ["manual"]);

        const manual = await paymentService.getGateway(
            companyId, "manual", "customer"
        );

        if (!manual || !manual.enabled) {
            throw new CheckoutError("Payment link not found.", 404);
        }

        const method = String(body.method || "").trim().toLowerCase();

        if (!METHODS[method] || !manual.settings[`${method}_number`]) {
            throw new CheckoutError("Choose a valid payment method.");
        }

        const trxId = String(body.trx_id || "")
            .trim()
            .toUpperCase();

        if (!TRX_RE.test(trxId)) {
            throw new CheckoutError(
                "Enter the TrxID exactly as shown in your payment message."
            );
        }

        const sender = String(body.sender_number || "").trim();

        if (!PHONE_RE.test(sender)) {
            throw new CheckoutError(
                "Enter the sender mobile number (11 digits)."
            );
        }

        /* amount = server calculation, never the browser */
        const { quote, request } = await quoteCustomerBill({
            companyId,
            customerId: body.customer_id,
            form: body
        });

        request.input.payment_method = METHODS[method];
        request.method = method;
        request.trx_id = trxId;
        request.sender_number = sender;
        request.customer_name = quote.customer_name;

        const storedRef = `${method.toUpperCase()}:${trxId}`;

        const [dup] = await db.execute(
            `SELECT id FROM payment_transactions
             WHERE gateway = 'manual' AND gateway_transaction_id = ?
             LIMIT 1`,
            [storedRef]
        );

        if (dup.length) {
            throw new CheckoutError("This TrxID was already submitted.");
        }

        const [open] = await db.execute(
            `SELECT COUNT(*) AS c FROM payment_transactions
             WHERE company_id = ? AND gateway = 'manual'
               AND customer_id = ? AND status = 'awaiting_approval'`,
            [companyId, request.customer_db_id]
        );

        if (Number(open[0].c) >= MAX_OPEN_PER_CUSTOMER) {
            throw new CheckoutError(
                "You already have payments waiting for approval. " +
                "Please wait for the ISP to approve them."
            );
        }

        const transaction = await paymentService.createTransaction({
            companyId,
            userId: null,
            customerId: request.customer_db_id,
            gateway: "manual",
            purpose: "customer_bill",
            scope: "customer",
            amount: quote.amount,
            currency: "BDT",
            shortId: true,
            metadata: { request }
        });

        try {
            const [result] = await db.execute(
                `UPDATE payment_transactions
                 SET status = 'awaiting_approval',
                     gateway_transaction_id = ?
                 WHERE id = ? AND status = 'pending'`,
                [storedRef, transaction.id]
            );

            if (result.affectedRows !== 1) {
                throw new Error("Unable to record the payment.");
            }
        } catch (error) {
            await paymentService.changeStatus(
                transaction.id, ["pending"], "failed"
            );

            if (error.code === "ER_DUP_ENTRY") {
                throw new CheckoutError("This TrxID was already submitted.");
            }

            throw error;
        }

        return res.json({
            success: true,
            transaction_id: transaction.transactionId,
            amount: quote.amount,
            result_url:
                `/api/payment-gateway/result/${transaction.transactionId}`
        });
    } catch (error) {
        return sendCheckoutError(res, error, "MANUAL SUBMIT ERROR:");
    }
}

module.exports = {
    page,
    getSettings,
    saveSettings,
    list,
    approve,
    reject,
    publicInfo,
    publicSubmit
};
