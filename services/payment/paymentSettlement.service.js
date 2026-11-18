"use strict";

/*
|--------------------------------------------------------------------------
| PAYMENT SETTLEMENT
|--------------------------------------------------------------------------
| Takes a payment_transactions row, asks the gateway (server-to-server)
| whether it was really paid, and only then updates the ledger.
|
| Status flow
|   pending      created, waiting for the customer / callback
|   verified     gateway confirmed payment (money received), not yet in ledger
|   paid         ledger updated (applied_at set)       <- final
|   failed       gateway itself reported a terminal failure <- final
|   needs_review money received but the ledger could not be updated safely
|                (amount changed, already paid, ...)   <- manual follow-up
|
| Rules
|   * A callback / redirect NEVER changes the ledger by itself.
|   * An unverifiable or invalid callback leaves the transaction pending.
|   * Duplicate / concurrent callbacks are safe: status changes are
|     compare-and-set, and "applied" is marked inside the ledger DB
|     transaction.
|--------------------------------------------------------------------------
*/

const db = require("../../config/database");
const paymentService = require("./payment.service");
const { getProvider } = require("./payment.factory");
const recharge = require("../customers/customer-recharge.service");
const softwarePayment = require("../billing/softwareBillingPayment.service");
const demo = require("./demoMode");

const LABELS = {
    nagad: "Nagad",
    bkash: "bKash",
    sslcommerz: "SSLCommerz",
    shurjopay: "ShurjoPay"
};

const FINAL = new Set(["paid", "failed", "needs_review"]);

function methodLabel(transaction) {
    const method = String(metadataOf(transaction).method || "");

    if (method === "dbblmobilebanking") {
        return "Rocket";
    }

    if (method.startsWith("dbbl_")) {
        return "DBBL";
    }

    return LABELS[transaction.gateway] || transaction.gateway;
}

function metadataOf(transaction) {
    return paymentService.parseJson(transaction.metadata, {});
}

async function patchMetadata(transaction, patch) {
    const merged = { ...metadataOf(transaction), ...patch };

    await paymentService.updateTransaction(transaction.id, {
        metadata: JSON.stringify(merged)
    });

    transaction.metadata = JSON.stringify(merged);

    return merged;
}

/*
 * created_by for gateway recharges made without a logged-in user:
 * use the company's admin so the payment is attributable.
 */
async function resolveActorUserId(companyId) {
    try {
        const [rows] = await db.query(
            `SELECT id
             FROM users
             WHERE company_id = ?
             ORDER BY (LOWER(role) IN ('admin','companyadmin','owner')) DESC,
                      id ASC
             LIMIT 1`,
            [companyId]
        );

        if (rows[0]) {
            return Number(rows[0].id);
        }
    } catch (_) {
        // role column differs: fall back below
    }

    try {
        const [rows] = await db.query(
            `SELECT id FROM users WHERE company_id = ? ORDER BY id ASC LIMIT 1`,
            [companyId]
        );

        return rows[0] ? Number(rows[0].id) : 0;
    } catch (_) {
        return 0;
    }
}

/*
 * Marks the transaction as applied INSIDE the ledger DB transaction.
 * Only one caller can ever succeed.
 */
function markApplied(transaction, appliedRef) {
    return async (conn, info) => {
        const [result] = await conn.execute(
            `
            UPDATE payment_transactions
            SET status = 'paid',
                applied_at = NOW(),
                applied_payment_id = ?,
                applied_ref = ?
            WHERE id = ?
              AND applied_at IS NULL
              AND status = 'verified'
            `,
            [info.payment_id, appliedRef, transaction.id]
        );

        if (result.affectedRows !== 1) {
            const error = new Error("Payment was already applied.");
            error.code = "ALREADY_APPLIED";
            throw error;
        }
    };
}

async function applyToLedger(transaction, verification) {
    const meta = metadataOf(transaction);
    const request = meta.request || {};
    const gatewayRef =
        verification?.gatewayTransactionId ||
        transaction.gateway_transaction_id ||
        null;

    if (transaction.purpose === "customer_bill") {
        const actorId = await resolveActorUserId(transaction.company_id);

        const input = {
            ...(request.input || {}),
            payment_method: methodLabel(transaction),
            discount: 0,
            comment: `${metadataOf(transaction).demo ? "DEMO " : ""}` +
                `${methodLabel(transaction)} ${transaction.transaction_id}` +
                (gatewayRef ? ` / ${gatewayRef}` : "")
        };

        const result = await recharge.rechargeCustomer({
            user: {
                company_id: Number(transaction.company_id),
                user_id: actorId
            },
            customerDbId: request.customer_db_id,
            input,
            expectedAmount: Number(transaction.amount),
            beforeCommit: markApplied(transaction, "customer_payment")
        });

        return {
            payment_id: result.payment_id,
            receipt: null
        };
    }

    if (
        transaction.purpose === "software_billing" ||
        transaction.purpose === "software_registration"
    ) {
        const result = await softwarePayment.applyGatewayPayment({
            billingId: request.billing_id,
            companyId: transaction.company_id,
            userId: transaction.user_id,
            gateway: transaction.gateway,
            transactionId: transaction.transaction_id,
            gatewayReference: gatewayRef,
            paidAmount: Number(transaction.amount),
            gatewayResponse: verification?.raw || null,
            beforeCommit: markApplied(transaction, "software_payment")
        });

        return {
            payment_id: result.payment_id,
            receipt: result.receipt
        };
    }

    throw new Error("Unsupported payment purpose.");
}

async function reload(id) {
    return paymentService.getTransactionById(id);
}

/*
 * Main entry. Safe to call any number of times, from the callback,
 * the result page or a retry.
 *
 * Returns { state, transaction, receipt? }
 *   state: paid | pending | failed | needs_review
 */
async function settle(transaction, { clientIp } = {}) {
    transaction = (await reload(transaction.id)) || transaction;

    if (transaction.applied_at || FINAL.has(transaction.status)) {
        return { state: transaction.status, transaction };
    }

    let verification = null;

    /*
     * "verified" = money confirmed earlier, ledger step did not finish
     * (e.g. database error). Retry only the ledger step.
     */
    if (transaction.status !== "verified" && metadataOf(transaction).demo) {
        /* demo transaction: never talk to a gateway */
        if (!demo.enabled()) {
            return { state: "pending", transaction };
        }

        const outcome = metadataOf(transaction).demo_outcome;

        if (outcome === "fail") {
            await paymentService.changeStatus(
                transaction.id, ["pending"], "failed", {}
            );

            return { state: "failed", transaction: await reload(transaction.id) };
        }

        if (outcome !== "success") {
            return { state: "pending", transaction };
        }

        const claimedDemo = await paymentService.changeStatus(
            transaction.id,
            ["pending"],
            "verified",
            {
                gateway_transaction_id: `DEMO-${transaction.transaction_id}`,
                payment_date: new Date(),
                verified_at: new Date()
            }
        );

        transaction = await reload(transaction.id);

        if (!claimedDemo) {
            return { state: transaction.status, transaction };
        }

        verification = {
            gatewayTransactionId: `DEMO-${transaction.transaction_id}`,
            raw: { demo: true }
        };
    } else if (transaction.status !== "verified") {
        const gatewayRow = await paymentService.getGateway(
            transaction.company_id,
            transaction.gateway,
            transaction.scope
        );

        if (!gatewayRow) {
            return { state: "pending", transaction };
        }

        const provider = getProvider(transaction.gateway);

        try {
            verification = await provider.verify({
                credentials: gatewayRow.credentials,
                environment: gatewayRow.environment,
                settings: gatewayRow.settings,
                transaction,
                clientIp
            });
        } catch (error) {
            // Network / gateway problem: never fail the payment for it.
            console.error(
                `PAYMENT VERIFY ERROR [${transaction.transaction_id}]:`,
                error.message
            );

            return { state: "pending", transaction };
        }

        if (verification.state === "failed") {
            await paymentService.changeStatus(
                transaction.id,
                ["pending"],
                "failed",
                {
                    metadata: JSON.stringify({
                        ...metadataOf(transaction),
                        verification: verification.raw
                    })
                }
            );

            return { state: "failed", transaction: await reload(transaction.id) };
        }

        if (verification.state === "mismatch") {
            await paymentService.changeStatus(
                transaction.id,
                ["pending"],
                "needs_review",
                {
                    metadata: JSON.stringify({
                        ...metadataOf(transaction),
                        verification: verification.raw
                    })
                }
            );

            console.error(
                `PAYMENT NEEDS REVIEW [${transaction.transaction_id}]:`,
                verification.raw
            );

            return {
                state: "needs_review",
                transaction: await reload(transaction.id)
            };
        }

        if (!verification.verified) {
            return { state: "pending", transaction };
        }

        /*
         * Claim: only one request moves pending -> verified.
         */
        let claimed;

        try {
            claimed = await paymentService.changeStatus(
                transaction.id,
                ["pending"],
                "verified",
                {
                    gateway_transaction_id:
                        verification.gatewayTransactionId || null,
                    payment_date: new Date(),
                    verified_at: new Date(),
                    metadata: JSON.stringify({
                        ...metadataOf(transaction),
                        verification: verification.raw
                    })
                }
            );
        } catch (error) {
            if (error.code !== "ER_DUP_ENTRY") {
                throw error;
            }

            /* same gateway reference already used by another payment */
            await paymentService.changeStatus(
                transaction.id,
                ["pending"],
                "needs_review",
                {
                    metadata: JSON.stringify({
                        ...metadataOf(transaction),
                        verification: verification.raw,
                        apply_error: "Duplicate gateway reference."
                    })
                }
            );

            return {
                state: "needs_review",
                transaction: await reload(transaction.id)
            };
        }

        transaction = await reload(transaction.id);

        if (!claimed) {
            // Another request is handling it. Report what is stored.
            return { state: transaction.status, transaction };
        }
    }

    /*
     * Ledger step.
     */
    try {
        const applied = await applyToLedger(transaction, verification);

        return {
            state: "paid",
            transaction: await reload(transaction.id),
            receipt: applied.receipt
        };
    } catch (error) {
        const final = await reload(transaction.id);

        if (final.applied_at) {
            return { state: "paid", transaction: final };
        }

        const reviewCodes = [
            "AMOUNT_CHANGED",
            "ALREADY_PAID",
            "ALREADY_APPLIED",
            "NOT_FOUND",
            "INVALID_AMOUNT"
        ];

        const isBusinessError =
            reviewCodes.includes(error.code) ||
            error.name === "RechargeError" ||
            error.name === "SoftwareBillingError";

        if (isBusinessError) {
            await paymentService.changeStatus(
                transaction.id,
                ["verified"],
                "needs_review",
                {
                    metadata: JSON.stringify({
                        ...metadataOf(final),
                        apply_error: String(error.message).slice(0, 300),
                        apply_error_code: error.code || null
                    })
                }
            );

            console.error(
                `PAYMENT NEEDS REVIEW [${transaction.transaction_id}]:`,
                error.message
            );

            return {
                state: "needs_review",
                transaction: await reload(transaction.id)
            };
        }

        // Unexpected (DB down...): stays "verified"; the next call retries.
        console.error(
            `PAYMENT APPLY ERROR [${transaction.transaction_id}]:`,
            error
        );

        return { state: "verified", transaction: final };
    }
}

module.exports = {
    settle,
    patchMetadata,
    metadataOf
};
