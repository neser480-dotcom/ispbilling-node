
"use strict";

const db =
    require("../config/database");


/*
|--------------------------------------------------------------------------
| ERROR
|--------------------------------------------------------------------------
*/

class BulkRechargeError extends Error {

    constructor(message) {

        super(message);

        this.name =
            "BulkRechargeError";

    }

}


/*
|--------------------------------------------------------------------------
| MONEY
|--------------------------------------------------------------------------
*/

function money(value) {

    const number =
        Number(value || 0);

    if (
        !Number.isFinite(number)
    ) {

        return 0;

    }

    return Math.round(
        number * 100
    ) / 100;

}


/*
|--------------------------------------------------------------------------
| DATE
|--------------------------------------------------------------------------
*/

function getToday() {

    const now =
        new Date();

    const year =
        now.getFullYear();

    const month =
        String(
            now.getMonth() + 1
        ).padStart(
            2,
            "0"
        );

    const day =
        String(
            now.getDate()
        ).padStart(
            2,
            "0"
        );

    return `${year}-${month}-${day}`;

}


/*
|--------------------------------------------------------------------------
| DATE PARSER
|--------------------------------------------------------------------------
*/

function parseDateOnly(value) {

    if (!value) {

        return null;

    }


    const text =
        String(value)
            .slice(0, 10);


    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(text)
    ) {

        return null;

    }


    const date =
        new Date(
            `${text}T00:00:00`
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return null;

    }


    return date;

}


/*
|--------------------------------------------------------------------------
| ADD MONTHS
|--------------------------------------------------------------------------
*/

function addMonths(
    date,
    months
) {

    const result =
        new Date(date);


    const originalDay =
        result.getDate();


    result.setDate(1);

    result.setMonth(
        result.getMonth() + months
    );


    const lastDay =
        new Date(
            result.getFullYear(),
            result.getMonth() + 1,
            0
        ).getDate();


    result.setDate(
        Math.min(
            originalDay,
            lastDay
        )
    );


    return result;

}


/*
|--------------------------------------------------------------------------
| FORMAT DATE
|--------------------------------------------------------------------------
*/

function formatDate(date) {

    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(
            2,
            "0"
        );

    const day =
        String(
            date.getDate()
        ).padStart(
            2,
            "0"
        );


    return `${year}-${month}-${day}`;

}


/*
|--------------------------------------------------------------------------
| COMPANY ID
|--------------------------------------------------------------------------
*/

async function getCompanyId(
    connection,
    user
) {

    const sessionCompanyId =
        Number(
            user?.company_id || 0
        );


    if (
        sessionCompanyId > 0
    ) {

        return sessionCompanyId;

    }


    const userId =
        Number(
            user?.user_id || 0
        );


    if (
        userId <= 0
    ) {

        throw new BulkRechargeError(
            "Invalid user session."
        );

    }


    const [
        rows
    ] =
        await connection.execute(
            `
            SELECT company_id
            FROM users
            WHERE id = ?
            LIMIT 1
            `,
            [
                userId
            ]
        );


    if (
        !rows.length
    ) {

        throw new BulkRechargeError(
            "User account not found."
        );

    }


    const companyId =
        Number(
            rows[0].company_id || 0
        );


    if (
        companyId <= 0
    ) {

        throw new BulkRechargeError(
            "Company not found."
        );

    }


    return companyId;

}


/*
|--------------------------------------------------------------------------
| CSRF
|--------------------------------------------------------------------------
*/

function validateCsrf(
    user,
    requestToken
) {

    const sessionToken =
        String(
            user?.csrf_token || ""
        );


    const token =
        String(
            requestToken || ""
        );


    if (
        !sessionToken ||
        !token ||
        sessionToken !== token
    ) {

        throw new BulkRechargeError(
            "Invalid CSRF token."
        );

    }

}


/*
|--------------------------------------------------------------------------
| PAYMENT METHOD
|--------------------------------------------------------------------------
*/

function paymentMethod(
    medium
) {

    const value =
        String(
            medium || ""
        )
            .trim()
            .toLowerCase();


    const methods = {

        hand_cash:
            "Hand Cash",

        bkash:
            "bKash",

        nagad:
            "Nagad",

        bank:
            "Bank Transfer"

    };


    return (
        methods[value] ||
        null
    );

}


/*
|--------------------------------------------------------------------------
| NORMALIZE ITEMS
|--------------------------------------------------------------------------
*/

function normalizeItems(
    body
) {

    let rawItems =
        body?.items;


    /*
    |--------------------------------------------------------------------------
    | JSON STRING
    |--------------------------------------------------------------------------
    */

    if (
        typeof rawItems ===
        "string"
    ) {

        try {

            rawItems =
                JSON.parse(
                    rawItems
                );

        } catch {

            rawItems =
                [];

        }

    }


    /*
    |--------------------------------------------------------------------------
    | ITEMS FORMAT
    |--------------------------------------------------------------------------
    */

    if (
        Array.isArray(rawItems) &&
        rawItems.length
    ) {

        return rawItems
            .map(
                item => {

                    const customerId =
                        Number(
                            item?.customer_id ??
                            item?.id ??
                            0
                        );

                    const amount =
                        money(
                            item?.amount
                        );


                    return {

                        customer_id:
                            customerId,

                        amount:
                            amount

                    };

                }
            )
            .filter(
                item =>
                    Number.isInteger(
                        item.customer_id
                    ) &&
                    item.customer_id > 0 &&
                    item.amount > 0
            );

    }


    /*
    |--------------------------------------------------------------------------
    | CUSTOMER IDS + COMMON AMOUNT
    |--------------------------------------------------------------------------
    */

    let ids =
        body?.customer_ids ||
        body?.customer_id ||
        [];


    if (
        typeof ids ===
        "string"
    ) {

        try {

            ids =
                JSON.parse(ids);

        } catch {

            ids =
                ids
                    .split(",")
                    .map(
                        value =>
                            value.trim()
                    );

        }

    }


    if (
        !Array.isArray(ids)
    ) {

        ids =
            [ids];

    }


    const amount =
        money(
            body?.amount
        );


    if (
        amount <= 0
    ) {

        return [];

    }


    return ids
        .map(
            id =>
                Number(id)
        )
        .filter(
            id =>
                Number.isInteger(id) &&
                id > 0
        )
        .map(
            id => ({

                customer_id:
                    id,

                amount:
                    amount

            })
        );

}


/*
|--------------------------------------------------------------------------
| PROCESS
|--------------------------------------------------------------------------
*/

async function processBulkRecharge({
    user,
    body
}) {

    /*
    |--------------------------------------------------------------------------
    | BASIC VALIDATION
    |--------------------------------------------------------------------------
    */

    if (
        !user ||
        !user.user_id
    ) {

        throw new BulkRechargeError(
            "Not logged in."
        );

    }


    validateCsrf(
        user,
        body?.csrf_token
    );


    const billingType =
        String(
            body?.billing_type ||
            "monthly"
        )
            .trim()
            .toLowerCase();


    if (
        billingType !== "monthly" &&
        billingType !== "yearly"
    ) {

        throw new BulkRechargeError(
            "Invalid billing type."
        );

    }


    const paymentMethodName =
        paymentMethod(
            body?.medium
        );


    if (!paymentMethodName) {

        throw new BulkRechargeError(
            "Invalid payment medium."
        );

    }


    const items =
        normalizeItems(
            body
        );


    if (
        !items.length
    ) {

        throw new BulkRechargeError(
            "No valid customers selected."
        );

    }


    /*
    |--------------------------------------------------------------------------
    | MAX CUSTOMERS
    |--------------------------------------------------------------------------
    */

    if (
        items.length > 50000
    ) {

        throw new BulkRechargeError(
            "Maximum 50,000 customers can be processed at once."
        );

    }


    /*
    |--------------------------------------------------------------------------
    | DEDUPLICATE
    |--------------------------------------------------------------------------
    */

    const uniqueMap =
        new Map();


    for (
        const item of items
    ) {

        uniqueMap.set(
            item.customer_id,
            item
        );

    }


    const uniqueItems =
        Array.from(
            uniqueMap.values()
        );


    /*
    |--------------------------------------------------------------------------
    | MONTHS
    |--------------------------------------------------------------------------
    */

    const monthsPaid =
        billingType === "yearly"
            ? 12
            : 1;


    const today =
        getToday();


    const connection =
        await db.getConnection();


    const results =
        [];


    let ok =
        0;

    let failed =
        0;

    let totalAmount =
        0;


    try {

        /*
        |--------------------------------------------------------------------------
        | COMPANY
        |--------------------------------------------------------------------------
        */

        const companyId =
            await getCompanyId(
                connection,
                user
            );


        /*
        |--------------------------------------------------------------------------
        | PROCESS EACH CUSTOMER
        |--------------------------------------------------------------------------
        */

        for (
            const item of uniqueItems
        ) {

            const customerId =
                item.customer_id;

            const amount =
                money(
                    item.amount
                );


            if (
                amount <= 0
            ) {

                failed++;

                results.push({

                    customer_id:
                        customerId,

                    success:
                        false,

                    message:
                        "Invalid amount."

                });

                continue;

            }


            try {

                await connection.beginTransaction();


                /*
                |--------------------------------------------------------------------------
                | CUSTOMER LOCK
                |--------------------------------------------------------------------------
                */

                const [
                    customerRows
                ] =
                    await connection.execute(
                        `
                        SELECT
                            id,
                            balance,
                            promise_date,
                            billing_cycle
                        FROM customers
                        WHERE id = ?
                          AND company_id = ?
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

                    throw new BulkRechargeError(
                        "Customer not found."
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


                const newBalance =
                    money(
                        oldBalance +
                        amount
                    );


                /*
                |--------------------------------------------------------------------------
                | BASE DATE
                |--------------------------------------------------------------------------
                */

                let baseDate =
                    parseDateOnly(
                        customer.promise_date
                    );


                const todayDate =
                    parseDateOnly(
                        today
                    );


                if (
                    !baseDate ||
                    baseDate < todayDate
                ) {

                    baseDate =
                        todayDate;

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


                const formattedPromiseDate =
                    formatDate(
                        newPromiseDate
                    );


                /*
                |--------------------------------------------------------------------------
                | CUSTOMER UPDATE
                |--------------------------------------------------------------------------
                */

                await connection.execute(
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
                    `,
                    [
                        newBalance,
                        formattedPromiseDate,
                        formattedPromiseDate,
                        customerId,
                        companyId
                    ]
                );


                /*
                |--------------------------------------------------------------------------
                | PAYMENT RECORD
                |--------------------------------------------------------------------------
                */

                const paymentDate =
                    todayDate;


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

                        paymentMethodName,

                        formatDate(
                            paymentDate
                        ),

                        paymentDate.getMonth() + 1,

                        paymentDate.getFullYear(),

                        monthsPaid,

                        0,

                        String(
                            body?.comment ||
                            "Bulk recharge"
                        )
                            .trim()
                            .slice(
                                0,
                                255
                            ),

                        Number(
                            user.user_id
                        )

                    ]
                );


                /*
                |--------------------------------------------------------------------------
                | COMMIT
                |--------------------------------------------------------------------------
                */

                await connection.commit();


                ok++;

                totalAmount +=
                    amount;


                results.push({

                    customer_id:
                        customerId,

                    success:
                        true,

                    amount:
                        amount,

                    promise_date:
                        formattedPromiseDate,

                    new_balance:
                        newBalance

                });


            } catch (error) {

                try {

                    await connection.rollback();

                } catch {
                    // Ignore rollback error.
                }


                failed++;


                results.push({

                    customer_id:
                        customerId,

                    success:
                        false,

                    message:
                        error.message ||
                        "Recharge failed."

                });

            }

        }


        /*
        |--------------------------------------------------------------------------
        | RESPONSE
        |--------------------------------------------------------------------------
        */

        return {

            success:
                failed === 0,

            total:
                uniqueItems.length,

            ok:
                ok,

            failed:
                failed,

            total_amount:
                money(
                    totalAmount
                ),

            billing_type:
                billingType,

            medium:
                paymentMethodName,

            months_paid:
                monthsPaid,

            results:
                results

        };

    } finally {

        connection.release();

    }

}


module.exports = {

    BulkRechargeError,

    processBulkRecharge

};
