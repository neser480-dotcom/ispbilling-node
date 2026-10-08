
"use strict";

/*
|--------------------------------------------------------------------------
| CUSTOMER BULK RECHARGE SERVICE
|--------------------------------------------------------------------------
| PHP Source:
| customers/bulk_recharge/bulk_recharge_process.php
|
| Important:
| Frontend may send:
|   items: [
|       {
|           customer_id: 22302,
|           amount: 500
|       }
|   ]
|
| Old PHP format:
|   items: [
|       {
|           id: 22302,
|           amount: 500
|       }
|   ]
|
| This service accepts BOTH formats.
|--------------------------------------------------------------------------
*/

const db = require("../config/database");


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
| DATE
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

    return !Number.isNaN(date.getTime());
}


function addMonths(dateString, months) {

    const date = new Date(`${dateString}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
        return dateString;
    }

    const originalDay = date.getDate();

    date.setDate(1);

    date.setMonth(date.getMonth() + Number(months));

    /*
    |--------------------------------------------------------------------------
    | Keep PHP DateTime-like behavior reasonably close.
    |--------------------------------------------------------------------------
    */

    const lastDay = new Date(
        date.getFullYear(),
        date.getMonth() + 1,
        0
    ).getDate();

    date.setDate(
        Math.min(originalDay, lastDay)
    );

    const year = date.getFullYear();

    const month = String(
        date.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        date.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


/*
|--------------------------------------------------------------------------
| COMPANY
|--------------------------------------------------------------------------
*/

async function getCompanyId(user) {

    let companyId = Number(
        user?.company_id || 0
    );

    if (companyId > 0) {
        return companyId;
    }

    const userId = Number(
        user?.user_id || 0
    );

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

    companyId = Number(
        rows[0].company_id
    );

    /*
    |--------------------------------------------------------------------------
    | Keep session company_id synchronized when possible.
    |--------------------------------------------------------------------------
    */

    if (user) {
        user.company_id = companyId;
    }

    return companyId;
}


/*
|--------------------------------------------------------------------------
| CSRF
|--------------------------------------------------------------------------
*/

function verifyCsrf(user, body) {

    const sessionToken =
        user?.csrf_token ||
        "";

    const requestToken =
        body?.csrf_token ||
        "";

    /*
    |--------------------------------------------------------------------------
    | If the Node application is already using middleware-level CSRF,
    | this check can still safely validate matching tokens when provided.
    |--------------------------------------------------------------------------
    */

    if (
        sessionToken &&
        requestToken &&
        sessionToken !== requestToken
    ) {
        throw new BulkRechargeError(
            "Invalid CSRF token.",
            403
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Do not reject an otherwise valid request here when the existing
    | application does not expose csrf_token in the session.
    |--------------------------------------------------------------------------
    */
}


/*
|--------------------------------------------------------------------------
| PAYMENT METHOD
|--------------------------------------------------------------------------
*/

const PAYMENT_METHODS = {

    hand_cash: "Hand Cash",

    bkash: "bKash",

    nagad: "Nagad",

    bank: "Bank Transfer"
};


/*
|--------------------------------------------------------------------------
| NORMALIZE ITEMS
|--------------------------------------------------------------------------
|
| IMPORTANT FIX:
|
| Accept both:
|
| item.id
|
| AND
|
| item.customer_id
|
|--------------------------------------------------------------------------
*/

function normalizeItems(body) {

    let items =
        Array.isArray(body?.items)
            ? body.items
            : [];


    /*
    |--------------------------------------------------------------------------
    | PHP normal POST fallback
    |--------------------------------------------------------------------------
    */

    if (
        items.length === 0 &&
        Array.isArray(body?.customer_ids)
    ) {

        items = body.customer_ids.map(
            (customerId) => {

                const id =
                    Number(customerId);

                let amount = 0;

                /*
                |--------------------------------------------------------------------------
                | Supports:
                |
                | amount: {
                |     "22302": 500
                | }
                |
                | OR
                |
                | amount: [ ... ]
                |--------------------------------------------------------------------------
                */

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
            }
        );
    }


    if (!Array.isArray(items)) {

        throw new BulkRechargeError(
            "No customer selected for recharge.",
            400
        );
    }


    /*
    |--------------------------------------------------------------------------
    | PHP max limit
    |--------------------------------------------------------------------------
    */

    if (items.length > 50000) {

        throw new BulkRechargeError(
            "Too many customers selected. Maximum 50000 customers are allowed.",
            400
        );
    }


    const normalized = [];

    const seen = new Set();


    for (const item of items) {

        if (
            !item ||
            typeof item !== "object"
        ) {
            continue;
        }


        /*
        |--------------------------------------------------------------------------
        | IMPORTANT:
        |
        | Frontend:
        |     customer_id
        |
        | PHP:
        |     id
        |
        | Accept both.
        |--------------------------------------------------------------------------
        */

        const customerId = Number(
            item.id ??
            item.customer_id ??
            0
        );


        const amount = money(
            item.amount
        );


        if (
            customerId <= 0 ||
            amount <= 0
        ) {
            continue;
        }


        /*
        |--------------------------------------------------------------------------
        | Deduplicate customer IDs
        |--------------------------------------------------------------------------
        */

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

async function processBulkRecharge({
    user,
    body
}) {

    body = body || {};

    /*
    |--------------------------------------------------------------------------
    | LOGIN
    |--------------------------------------------------------------------------
    */

    const userId = Number(
        user?.user_id || 0
    );

    if (userId <= 0) {

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


    /*
    |--------------------------------------------------------------------------
    | COMPANY
    |--------------------------------------------------------------------------
    */

    const companyId =
        await getCompanyId(user);


    if (companyId <= 0) {

        throw new BulkRechargeError(
            "Company information is missing.",
            400
        );
    }


    /*
    |--------------------------------------------------------------------------
    | CSRF
    |--------------------------------------------------------------------------
    */

    verifyCsrf(
        user,
        body
    );


    /*
    |--------------------------------------------------------------------------
    | BILLING TYPE
    |--------------------------------------------------------------------------
    */

    const billingType =
        String(
            body.billing_type ||
            "monthly"
        ).toLowerCase();


    if (
        billingType !== "monthly" &&
        billingType !== "yearly"
    ) {

        throw new BulkRechargeError(
            "Invalid billing type.",
            400
        );
    }


    /*
    |--------------------------------------------------------------------------
    | PAYMENT MEDIUM
    |--------------------------------------------------------------------------
    */

    const medium =
        String(
            body.medium ||
            "hand_cash"
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


    const paymentMethod =
        PAYMENT_METHODS[medium];


    /*
    |--------------------------------------------------------------------------
    | COMMENT
    |--------------------------------------------------------------------------
    */

    const comment =
        String(
            body.comment ||
            "Bulk recharge"
        );


    /*
    |--------------------------------------------------------------------------
    | MONTHS PAID
    |--------------------------------------------------------------------------
    */

    const monthsPaid =
        billingType === "yearly"
            ? 12
            : 1;


    /*
    |--------------------------------------------------------------------------
    | ITEMS
    |--------------------------------------------------------------------------
    */

    const items =
        normalizeItems(body);


    /*
    |--------------------------------------------------------------------------
    | TODAY
    |--------------------------------------------------------------------------
    */

    const today =
        todayString();


    const paymentDate =
        today;


    const todayDate =
        new Date(`${today}T00:00:00`);


    const billingMonth =
        todayDate.getMonth() + 1;


    const billingYear =
        todayDate.getFullYear();


    /*
    |--------------------------------------------------------------------------
    | RESULTS
    |--------------------------------------------------------------------------
    */

    const results = [];

    let successCount = 0;

    let failedCount = 0;

    let totalAmount = 0;


    /*
    |--------------------------------------------------------------------------
    | PROCESS EACH CUSTOMER
    |--------------------------------------------------------------------------
    */

    for (const item of items) {

        const customerId =
            Number(
                item.customer_id ??
                item.id ??
                0
            );


        const amount =
            money(
                item.amount
            );


        let connection = null;


        try {

            /*
            |--------------------------------------------------------------------------
            | NEW TRANSACTION
            |--------------------------------------------------------------------------
            */

            connection =
                await db.getConnection();


            await connection.beginTransaction();


            /*
            |--------------------------------------------------------------------------
            | CUSTOMER
            |--------------------------------------------------------------------------
            |
            | EXACT PHP LOGIC
            |--------------------------------------------------------------------------
            */

            const [customerRows] =
                await connection.execute(
                    `
                    SELECT
                        id,
                        customer_id,
                        name,
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
                    [
                        customerId,
                        companyId
                    ]
                );


            if (
                !customerRows.length
            ) {

                throw new Error(
                    "Customer not found or access denied."
                );
            }


            const customer =
                customerRows[0];


            /*
            |--------------------------------------------------------------------------
            | OLD BALANCE
            |--------------------------------------------------------------------------
            */

            const oldBalance =
                money(
                    customer.balance
                );


            /*
            |--------------------------------------------------------------------------
            | NEW BALANCE
            |--------------------------------------------------------------------------
            |
            | PHP:
            |
            | $newBalance = $oldBalance + $amount;
            |--------------------------------------------------------------------------
            */

            const newBalance =
                money(
                    oldBalance +
                    amount
                );


            /*
            |--------------------------------------------------------------------------
            | OLD PROMISE DATE
            |--------------------------------------------------------------------------
            */

            const oldPromiseDate =
                customer.promise_date
                    ? String(
                        customer.promise_date
                    ).slice(0, 10)
                    : "";


            /*
            |--------------------------------------------------------------------------
            | BASE DATE
            |--------------------------------------------------------------------------
            |
            | PHP:
            |
            | $baseDate = today;
            |
            | if old promise >= today:
            |     baseDate = old promise
            |--------------------------------------------------------------------------
            */

            let baseDate =
                today;


            if (
                oldPromiseDate &&
                isValidDateString(
                    oldPromiseDate
                )
            ) {

                const oldDate =
                    new Date(
                        `${oldPromiseDate}T00:00:00`
                    );


                if (
                    oldDate.getTime() >=
                    todayDate.getTime()
                ) {

                    baseDate =
                        oldPromiseDate;
                }
            }


            /*
            |--------------------------------------------------------------------------
            | NEW PROMISE DATE
            |--------------------------------------------------------------------------
            */

            const newPromiseDate =
                addMonths(
                    baseDate,
                    monthsPaid
                );


            /*
            |--------------------------------------------------------------------------
            | BILLING CYCLE
            |--------------------------------------------------------------------------
            */

            const newBillingCycle =
                newPromiseDate;


            /*
            |--------------------------------------------------------------------------
            | UPDATE CUSTOMER
            |--------------------------------------------------------------------------
            */

            const [
                updateResult
            ] = await connection.execute(
                `
                UPDATE customers
                SET
                    balance = ?,
                    status = 'Active',
                    payment_status = 'paid',
                    promise_date = ?,
                    billing_cycle = ?
                WHERE id = ?
                  AND company_id = ?
                  AND deleted_at IS NULL
                LIMIT 1
                `,
                [
                    newBalance,
                    newPromiseDate,
                    newBillingCycle,
                    customerId,
                    companyId
                ]
            );


            if (
                Number(
                    updateResult.affectedRows
                ) !== 1
            ) {

                throw new Error(
                    "Customer update failed."
                );
            }


            /*
            |--------------------------------------------------------------------------
            | PAYMENT
            |--------------------------------------------------------------------------
            |
            | EXACT PHP PAYMENT INSERT
            |--------------------------------------------------------------------------
            */

            const isAdvance = 0;


            await connection.execute(
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
                    created_by
                )
                VALUES
                (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?
                )
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
                    userId
                ]
            );


            /*
            |--------------------------------------------------------------------------
            | COMMIT
            |--------------------------------------------------------------------------
            */

            await connection.commit();


            /*
            |--------------------------------------------------------------------------
            | SUCCESS
            |--------------------------------------------------------------------------
            */

            successCount++;

            totalAmount =
                money(
                    totalAmount +
                    amount
                );


            results.push({

                id: customerId,

                customer_id:
                    customer.customer_id,

                name:
                    customer.name,

                amount,

                success: true,

                message:
                    "Recharge completed successfully.",

                old_balance:
                    oldBalance,

                new_balance:
                    newBalance,

                old_promise_date:
                    oldPromiseDate,

                new_promise_date:
                    newPromiseDate,

                months_paid:
                    monthsPaid
            });


        } catch (error) {

            /*
            |--------------------------------------------------------------------------
            | ROLLBACK
            |--------------------------------------------------------------------------
            */

            if (connection) {

                try {

                    await connection.rollback();

                } catch (rollbackError) {

                    console.error(
                        "BULK RECHARGE ROLLBACK ERROR:",
                        rollbackError
                    );
                }
            }


            /*
            |--------------------------------------------------------------------------
            | FAILED
            |--------------------------------------------------------------------------
            */

            failedCount++;


            results.push({

                id: customerId,

                customer_id:
                    customerId,

                amount,

                success: false,

                message:
                    error.message ||
                    "Recharge failed."
            });


        } finally {

            /*
            |--------------------------------------------------------------------------
            | RELEASE CONNECTION
            |--------------------------------------------------------------------------
            */

            if (connection) {

                connection.release();
            }
        }
    }


    /*
    |--------------------------------------------------------------------------
    | FINAL MESSAGE
    |--------------------------------------------------------------------------
    */

    let message;


    if (
        successCount ===
        items.length
    ) {

        message =
            "Bulk recharge completed successfully.";

    } else if (
        successCount > 0
    ) {

        message =
            "Bulk recharge partially completed.";

    } else {

        message =
            "Bulk recharge failed.";
    }


    /*
    |--------------------------------------------------------------------------
    | RETURN
    |--------------------------------------------------------------------------
    */

    return {

        success:
            successCount > 0,

        httpCode:
            successCount > 0
                ? 200
                : 400,

        message,

        total:
            items.length,

        ok:
            successCount,

        failed:
            failedCount,

        total_amount:
            totalAmount,

        billing_type:
            billingType,

        medium,

        months_paid:
            monthsPaid,

        results
    };
}


/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports = {

    processBulkRecharge

};
