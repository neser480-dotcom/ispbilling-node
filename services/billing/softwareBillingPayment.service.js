"use strict";

/*
|--------------------------------------------------------------------------
| SOFTWARE BILLING - ONLINE GATEWAY PAYMENT
|--------------------------------------------------------------------------
| Same ledger steps as softwareBilling.controller.js -> manualPay:
|   lock billing row -> insert software_billing_payments
|   -> billing status paid -> invoice paid (by billing_id) -> commit
|
| The amount ALWAYS comes from software_billing_notifications.
| softwareBilling.controller.js is intentionally left unchanged.
|--------------------------------------------------------------------------
*/

const db = require("../../config/database");

class SoftwareBillingError extends Error {
    constructor(message, code) {
        super(message);
        this.name = "SoftwareBillingError";
        this.code = code || "SOFTWARE_BILLING_ERROR";
    }
}

/*
 * Read-only: the unpaid billing row owned by this company + user.
 * Used to decide the checkout amount.
 */
async function getPayableBilling({ billingId, companyId, userId }) {
    billingId = Number(billingId);
    companyId = Number(companyId);
    userId = Number(userId);

    if (
        !Number.isInteger(billingId) || billingId <= 0 ||
        !Number.isInteger(companyId) || companyId <= 0 ||
        !Number.isInteger(userId) || userId <= 0
    ) {
        throw new SoftwareBillingError(
            "Invalid billing request.", "INVALID"
        );
    }

    const [rows] = await db.execute(
        `
        SELECT id, company_id, user_id, billing_type, amount, status
        FROM software_billing_notifications
        WHERE id = ?
          AND company_id = ?
          AND user_id = ?
        LIMIT 1
        `,
        [billingId, companyId, userId]
    );

    if (!rows.length) {
        throw new SoftwareBillingError(
            "Billing record not found.", "NOT_FOUND"
        );
    }

    const billing = rows[0];

    if (String(billing.status).toLowerCase() !== "unpaid") {
        throw new SoftwareBillingError(
            "This billing is already paid.", "ALREADY_PAID"
        );
    }

    const amount = Number(billing.amount || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
        throw new SoftwareBillingError(
            "Invalid billing amount.", "INVALID_AMOUNT"
        );
    }

    billing.amount = amount;

    return billing;
}

/*
 * Apply a VERIFIED gateway payment. One DB transaction.
 * beforeCommit(conn, info) lets the caller mark payment_transactions
 * as applied atomically with the ledger.
 */
async function applyGatewayPayment({
    billingId,
    companyId,
    userId,
    gateway,
    transactionId,
    gatewayReference,
    paidAmount,
    gatewayResponse,
    beforeCommit
}) {
    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const [rows] = await conn.execute(
            `
            SELECT id, company_id, user_id, billing_type, amount, status
            FROM software_billing_notifications
            WHERE id = ?
              AND company_id = ?
              AND user_id = ?
            LIMIT 1
            FOR UPDATE
            `,
            [Number(billingId), Number(companyId), Number(userId)]
        );

        if (!rows.length) {
            throw new SoftwareBillingError(
                "Billing record not found.", "NOT_FOUND"
            );
        }

        const billing = rows[0];

        if (String(billing.status).toLowerCase() !== "unpaid") {
            throw new SoftwareBillingError(
                "This billing is already paid.", "ALREADY_PAID"
            );
        }

        const amount = Number(billing.amount || 0);

        if (
            !Number.isFinite(amount) || amount <= 0 ||
            Math.abs(amount - Number(paidAmount)) > 0.009
        ) {
            throw new SoftwareBillingError(
                "Billing amount differs from the paid amount.",
                "AMOUNT_CHANGED"
            );
        }

        const [paymentResult] = await conn.execute(
            `
            INSERT INTO software_billing_payments
            (
                billing_id, company_id, user_id,
                payment_mode, gateway, transaction_id, reference_no,
                amount, currency, status,
                payment_note, gateway_response,
                created_by, paid_at
            )
            VALUES
            (?, ?, ?, 'gateway', ?, ?, ?, ?, 'BDT', 'paid', ?, ?, ?, NOW())
            `,
            [
                billing.id,
                billing.company_id,
                billing.user_id,
                gateway,
                transactionId,
                gatewayReference || null,
                amount,
                `Online payment via ${gateway}`,
                gatewayResponse
                    ? JSON.stringify(gatewayResponse)
                    : null,
                billing.user_id
            ]
        );

        const paymentId = Number(paymentResult.insertId);

        if (paymentId <= 0) {
            throw new SoftwareBillingError(
                "Payment record was not created."
            );
        }

        const [billingUpdate] = await conn.execute(
            `
            UPDATE software_billing_notifications
            SET status = 'paid', paid_at = NOW(), updated_at = NOW()
            WHERE id = ?
              AND status = 'unpaid'
            LIMIT 1
            `,
            [billing.id]
        );

        if (billingUpdate.affectedRows !== 1) {
            throw new SoftwareBillingError(
                "Billing status could not be updated.", "ALREADY_PAID"
            );
        }

        await conn.execute(
            `
            UPDATE invoices
            SET status = 'paid', paid_date = NOW()
            WHERE billing_id = ?
              AND company_id = ?
              AND user_id = ?
              AND status = 'unpaid'
            `,
            [billing.id, billing.company_id, billing.user_id]
        );

        if (typeof beforeCommit === "function") {
            await beforeCommit(conn, { payment_id: paymentId });
        }

        await conn.commit();

        return {
            billing_id: billing.id,
            payment_id: paymentId,
            amount,
            receipt:
                `/software-billing/receipt?billing_id=${billing.id}&payment_id=${paymentId}`
        };
    } catch (error) {
        try {
            await conn.rollback();
        } catch (_) {
            // keep original error
        }

        throw error;
    } finally {
        conn.release();
    }
}

module.exports = {
    SoftwareBillingError,
    getPayableBilling,
    applyGatewayPayment
};
