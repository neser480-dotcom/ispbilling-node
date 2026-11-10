"use strict";

/*
|--------------------------------------------------------------------------
| CUSTOMER BULK RECHARGE SERVICE
|--------------------------------------------------------------------------
| PHP Source:
| customers/bulk_recharge/bulk_recharge_process.php
|
| Supported item formats:
|   { customer_id: 22302, amount: 500 }
|   { id: 22302, amount: 500 }
|
| Features:
|   - Company-scoped customer access
|   - Bulk recharge transactions
|   - Payment balance/state snapshots for cancellation
|   - Customer balance and billing-date updates
|   - Duplicate customer ID protection
|   - Per-customer success/failure results
|--------------------------------------------------------------------------
*/

const db = require("../../config/database");
const ppp = require("../ppp.service");

/*
|--------------------------------------------------------------------------
| ERROR
|--------------------------------------------------------------------------
*/

class BulkRechargeError extends Error {
    constructor(message, httpCode = 400) {
        super(message);
        this.name = "BulkRechargeError";
        this.httpCode = httpCode;
    }
}

/*
|--------------------------------------------------------------------------
| MONEY
|--------------------------------------------------------------------------
*/

function money(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return 0;
    }

    return Math.round((number + Number.EPSILON) * 100) / 100;
}

/*
|--------------------------------------------------------------------------
| DATE HELPERS
|--------------------------------------------------------------------------
*/

function todayString() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function isValidDateString(value) {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return false;
    }

    const date = new Date(`${value}T00:00:00`);

    return (
        !Number.isNaN(date.getTime()) &&
        date.getFullYear() === Number(value.slice(0, 4)) &&
        date.getMonth() + 1 === Number(value.slice(5, 7)) &&
        date.getDate() === Number(value.slice(8, 10))
    );
}

function timePartOf(value) {

    if (!value) return "";

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const pad = (n) => String(n).padStart(2, "0");
        return `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
    }

    const match = String(value).match(/(\d{2}:\d{2}:\d{2})/);

    return match ? match[1] : "";
}

function dateOnly(value) {
    if (!value) {
        return "";
    }

    if (value instanceof Date) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, "0");
        const day = String(value.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    return String(value).slice(0, 10);
}

function addMonths(dateString, months) {
    if (!isValidDateString(dateString)) {
        throw new BulkRechargeError("Invalid billing date.", 400);
    }

    const date = new Date(`${dateString}T00:00:00`);
    const originalDay = date.getDate();

    date.setDate(1);
    date.setMonth(date.getMonth() + Number(months));

    const lastDay = new Date(
        date.getFullYear(),
        date.getMonth() + 1,
        0
    ).getDate();

    date.setDate(Math.min(originalDay, lastDay));

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

/*
|--------------------------------------------------------------------------
| COMPANY
|--------------------------------------------------------------------------
*/

async function getCompanyId(user) {
    const sessionCompanyId = Number(user?.company_id || 0);

    if (sessionCompanyId > 0) {
        return sessionCompanyId;
    }

    const userId = Number(user?.user_id || user?.id || 0);

    if (userId <= 0) {
        throw new BulkRechargeError(
            "User information is missing.",
            401
        );
    }

    const [rows] = await db.execute(
        `
        SELECT company_id
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
        [userId]
    );

    if (
        !rows.length ||
        Number(rows[0].company_id || 0) <= 0
    ) {
        throw new BulkRechargeError(
            "Company information is missing.",
            400
        );
    }

    const companyId = Number(rows[0].company_id);

    if (user && typeof user === "object") {
        user.company_id = companyId;
    }

    return companyId;
}

/*
|--------------------------------------------------------------------------
| CSRF
|--------------------------------------------------------------------------
| Keep the existing application-level CSRF middleware enabled.
| If a session token is available here, validate it as well.
|--------------------------------------------------------------------------
*/

function verifyCsrf(user, body) {
    const sessionToken = String(user?.csrf_token || "");
    const requestToken = String(body?.csrf_token || "");

    if (
        sessionToken &&
        requestToken &&
        sessionToken !== requestToken
    ) {
        throw new BulkRechargeError("Invalid CSRF token.", 403);
    }
}

/*
|--------------------------------------------------------------------------
| PAYMENT METHODS
|--------------------------------------------------------------------------
*/

const PAYMENT_METHODS = Object.freeze({
    hand_cash: "Hand Cash",
    bkash: "bKash",
    nagad: "Nagad",
    bank: "Bank Transfer"
});

/*
|--------------------------------------------------------------------------
| NORMALIZE ITEMS
|--------------------------------------------------------------------------
*/

function normalizeItems(body) {
    let items = Array.isArray(body?.items) ? body.items : [];

    if (
        items.length === 0 &&
        Array.isArray(body?.customer_ids)
    ) {
        items = body.customer_ids.map((value) => {
            const id = Number(value);
            let amount = 0;

            if (
                body.amount &&
                typeof body.amount === "object"
            ) {
                amount = body.amount[id] ?? 0;
            }

            return {
                id,
                customer_id: id,
                amount
            };
        });
    }

    if (!Array.isArray(items) || items.length === 0) {
        throw new BulkRechargeError(
            "No customer selected for recharge.",
            400
        );
    }

    if (items.length > 50000) {
        throw new BulkRechargeError(
            "Too many customers selected. Maximum 50000 customers are allowed.",
            400
        );
    }

    const normalized = [];
    const seen = new Set();

    for (const item of items) {
        if (!item || typeof item !== "object") {
            continue;
        }

        const customerId = Number(
            item.id ?? item.customer_id ?? 0
        );

        const amount = money(item.amount);

        if (
            !Number.isSafeInteger(customerId) ||
            customerId <= 0 ||
            amount <= 0
        ) {
            continue;
        }

        if (seen.has(customerId)) {
            continue;
        }

        seen.add(customerId);

        normalized.push({
            id: customerId,
            customer_id: customerId,
            amount
        });
    }

    if (normalized.length === 0) {
        throw new BulkRechargeError(
            "No valid recharge amount was provided.",
            400
        );
    }

    return normalized;
}

/*
|--------------------------------------------------------------------------
| PROCESS BULK RECHARGE
|--------------------------------------------------------------------------
*/

async function processBulkRecharge({ user, body }) {
    body = body || {};

    const userId = Number(user?.user_id || user?.id || 0);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return {
            success: false,
            httpCode: 401,
            message: "Authentication required.",
            total: 0,
            ok: 0,
            failed: 0,
            total_amount: 0,
            results: []
        };
    }

    const companyId = await getCompanyId(user);

    if (companyId <= 0) {
        throw new BulkRechargeError(
            "Company information is missing.",
            400
        );
    }

    verifyCsrf(user, body);

    const billingType = String(
        body.billing_type || "monthly"
    ).toLowerCase();

    if (!["monthly", "yearly"].includes(billingType)) {
        throw new BulkRechargeError(
            "Invalid billing type.",
            400
        );
    }

    const medium = String(
        body.medium || "hand_cash"
    ).toLowerCase();

    if (
        !Object.prototype.hasOwnProperty.call(
            PAYMENT_METHODS,
            medium
        )
    ) {
        throw new BulkRechargeError(
            "Invalid payment medium.",
            400
        );
    }

    const paymentMethod = PAYMENT_METHODS[medium];

    const comment = String(
        body.comment || "Bulk recharge"
    ).slice(0, 1000);

    const monthsPaid = billingType === "yearly" ? 12 : 1;

    const items = normalizeItems(body);

    const today = todayString();
    const paymentDate = today;

    const todayDate = new Date(`${today}T00:00:00`);
    const billingMonth = todayDate.getMonth() + 1;
    const billingYear = todayDate.getFullYear();

    const results = [];

    let successCount = 0;
    let failedCount = 0;
    let totalAmount = 0;

    /* one MikroTik session for the whole run (restores expired customers) */
    const pppSession = ppp.createSession({ companyId });

    /*
    |--------------------------------------------------------------------------
    | PROCESS EACH CUSTOMER IN ITS OWN TRANSACTION
    |--------------------------------------------------------------------------
    */

    for (const item of items) {
        const customerId = Number(
            item.customer_id ?? item.id ?? 0
        );

        const amount = money(item.amount);

        let connection = null;
        let transactionStarted = false;

        try {
            connection = await db.getConnection();

            await connection.beginTransaction();
            transactionStarted = true;

            /*
            |--------------------------------------------------------------------------
            | LOCK CUSTOMER AND READ PRE-RECHARGE STATE
            |--------------------------------------------------------------------------
            */

            const [customerRows] = await connection.execute(
                `
                SELECT
                    id,
                    customer_id,
                    name,
                    mikrotik_id,
                    pppoe_username,
                    monthly_bill,
                    balance,
                    promise_date,
                    billing_cycle,
                    status,
                    payment_status
                FROM customers
                WHERE id = ?
                  AND company_id = ?
                  AND deleted_at IS NULL
                LIMIT 1
                FOR UPDATE
                `,
                [customerId, companyId]
            );

            if (!customerRows.length) {
                throw new Error(
                    "Customer not found or access denied."
                );
            }

            const customer = customerRows[0];

            /*
            |--------------------------------------------------------------------------
            | SNAPSHOTS BEFORE CUSTOMER UPDATE
            |--------------------------------------------------------------------------
            */

            const oldBalance = money(customer.balance);

            const oldBillingCycle =
                customer.billing_cycle || null;

            const oldPromiseDateSnapshot =
                customer.promise_date || null;

            const oldStatus =
                customer.status || null;

            const oldPaymentStatus =
                customer.payment_status || null;

            const oldPromiseDate =
                dateOnly(customer.promise_date);

            /*
            |--------------------------------------------------------------------------
            | CALCULATE NEW BALANCE
            |--------------------------------------------------------------------------
            */

            /*
            |--------------------------------------------------------------------------
            | WALLET RULE (same as single recharge)
            |--------------------------------------------------------------------------
            | amount = cash received. Balance = real money.
            | - month already paid  -> not allowed
            | - balance + amount covers one month -> one month is billed,
            |   billing cycle moves ONE month, the rest stays in the balance
            | - otherwise -> everything stays in the balance (nothing billed)
            */
            const monthlyBill = money(customer.monthly_bill);

            if (
                String(customer.payment_status || "").toLowerCase() === "paid" &&
                String(customer.status || "").toLowerCase() === "active"
            ) {
                throw new Error(
                    "This month is already paid. Recharge again after the promise date ends."
                );
            }

            if (!(monthlyBill > 0)) {
                throw new Error("Customer has no monthly bill.");
            }

            const available = money(oldBalance + amount);
            const covers = available >= monthlyBill;
            const newBalance = covers
                ? money(available - monthlyBill)
                : available;

            let newBillingCycle = oldBillingCycle;
            const newPromiseDate = oldPromiseDate;

            if (covers) {
                const cycleBase = dateOnly(customer.billing_cycle);
                const nextDate = addMonths(
                    isValidDateString(cycleBase) ? cycleBase : today,
                    1
                );
                const cycleTime = timePartOf(customer.billing_cycle);

                newBillingCycle =
                    cycleTime && cycleTime !== "00:00:00"
                        ? `${nextDate} ${cycleTime}`
                        : nextDate;
            }

            const newStatus = covers ? "Active" : oldStatus;
            const newPaymentStatus = covers ? "paid" : oldPaymentStatus;

            /*
            |--------------------------------------------------------------------------
            | UPDATE CUSTOMER
            |--------------------------------------------------------------------------
            */
            const [updateResult] = await connection.execute(
                `
                UPDATE customers
                SET
                    balance = ?,
                    status = ?,
                    payment_status = ?,
                    billing_cycle = ?
                WHERE id = ?
                  AND company_id = ?
                  AND deleted_at IS NULL
                LIMIT 1
                `,
                [
                    newBalance,
                    newStatus,
                    newPaymentStatus,
                    newBillingCycle,
                    customerId,
                    companyId
                ]
            );

            if (Number(updateResult.affectedRows) !== 1) {
                throw new Error("Customer update failed.");
            }

            /*
            |--------------------------------------------------------------------------
            | INSERT PAYMENT WITH REVERSAL SNAPSHOTS
            |--------------------------------------------------------------------------
            */

            const isAdvance = 0;

            const [paymentResult] = await connection.execute(
                `
                INSERT INTO payments
                (
                    company_id,
                    customer_id,
                    amount,
                    payment_method,
                    payment_date,
                    billing_month,
                    billing_year,
                    months_paid,
                    is_advance,
                    comments,
                    created_by,
                    balance_before,
                    balance_after,
                    billing_cycle_before,
                    promise_date_before,
                    status_before,
                    payment_status_before
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    companyId,
                    customerId,
                    amount,
                    paymentMethod,
                    paymentDate,
                    billingMonth,
                    billingYear,
                    monthsPaid,
                    isAdvance,
                    comment,
                    userId,

                    oldBalance,
                    newBalance,
                    oldBillingCycle,
                    oldPromiseDateSnapshot,
                    oldStatus,
                    oldPaymentStatus
                ]
            );

            if (!paymentResult.insertId) {
                throw new Error(
                    "Payment record was not created."
                );
            }

            /*
            |--------------------------------------------------------------------------
            | COMMIT
            |--------------------------------------------------------------------------
            */

            await connection.commit();
            transactionStarted = false;

            /*
             * A customer who was Expired / Inactive and is now paid must be
             * switched back on in MikroTik (after the payment is committed).
             */
            let mikrotikOk = true;

            if (
                covers &&
                String(oldStatus || "").toLowerCase() !== "active" &&
                Number(customer.mikrotik_id) > 0 &&
                customer.pppoe_username
            ) {
                try {
                    const api = await pppSession.api(Number(customer.mikrotik_id));
                    const secret = await ppp.findSecret(api, customer.pppoe_username);

                    if (!secret) {
                        throw new Error(
                            `PPPoE customer not found on MikroTik: ${customer.pppoe_username}`
                        );
                    }

                    await ppp.restoreCustomer(api, {
                        secret,
                        routerId: Number(customer.mikrotik_id),
                        customerId
                    });
                } catch (restoreError) {
                    mikrotikOk = false;
                    console.error(
                        `Bulk recharge MikroTik warning [${customerId}]:`,
                        restoreError.message
                    );
                }
            }

            successCount++;
            totalAmount = money(totalAmount + amount);

            results.push({
                id: customerId,
                customer_id: customer.customer_id,
                name: customer.name,
                payment_id: paymentResult.insertId,
                amount,
                success: true,
                message: covers
                    ? "Recharge completed successfully."
                    : "Amount kept in balance (less than one month's bill).",
                old_balance: oldBalance,
                new_balance: newBalance,
                old_promise_date: oldPromiseDate,
                new_promise_date: newPromiseDate,
                months_paid: monthsPaid,
                mikrotik_ok: mikrotikOk
            });
        } catch (error) {
            if (connection && transactionStarted) {
                try {
                    await connection.rollback();
                } catch (rollbackError) {
                    console.error(
                        "BULK RECHARGE ROLLBACK ERROR:",
                        rollbackError
                    );
                }

                transactionStarted = false;
            }

            failedCount++;

            console.error(
                "BULK RECHARGE CUSTOMER ERROR:",
                {
                    customerId,
                    message: error.message
                }
            );

            results.push({
                id: customerId,
                customer_id: customerId,
                amount,
                success: false,
                message: error.message || "Recharge failed."
            });
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | FINAL RESULT
    |--------------------------------------------------------------------------
    */

    try {
        await pppSession.closeAll();
    } catch (_) {}

    /* why customers failed (shown to the user, e.g. "already paid (12)") */
    const reasons = {};

    results
        .filter((row) => row && row.success === false)
        .forEach((row) => {
            const key = String(row.message || "Recharge failed.");
            reasons[key] = (reasons[key] || 0) + 1;
        });

    const reasonText = Object.entries(reasons)
        .slice(0, 3)
        .map(([text, count]) => `${text} (${count})`)
        .join(" | ");

    let message;
    if (successCount === items.length) {
        message = "Bulk recharge completed successfully.";
    } else if (successCount > 0) {
        message = "Bulk recharge partially completed." +
            (reasonText ? " " + reasonText : "");
    } else {
        message = "Bulk recharge failed." +
            (reasonText ? " " + reasonText : "");
    }

    return {
        success: successCount > 0,
        httpCode: successCount > 0 ? 200 : 400,
        message,
        total: items.length,
        ok: successCount,
        failed: failedCount,
        total_amount: totalAmount,
        billing_type: billingType,
        medium,
        months_paid: monthsPaid,
        results
    };
}

/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports = {
    processBulkRecharge,
    BulkRechargeError
};
