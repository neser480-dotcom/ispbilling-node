"use strict";

const db = require("../config/database");


/*
|--------------------------------------------------------------------------
| SOFTWARE MONTHLY BILLING GENERATOR
|--------------------------------------------------------------------------
|
| Rules:
|
| 1. Registration billing paid হলে পরের মাস থেকে monthly billing শুরু হবে।
| 2. Latest paid registration/monthly billing থেকে package নেওয়া হবে।
| 3. software_packages.monthly_fee ব্যবহার হবে।
| 4. একই user + company + month-এ duplicate bill হবে না।
| 5. Monthly fee flat amount; customer count দিয়ে multiply হবে না।
| 6. Monthly billing তৈরি হলে matching monthly invoice-ও তৈরি হবে।
|
|--------------------------------------------------------------------------
*/


function formatDateTime(date) {

    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            date.getDate()
        ).padStart(2, "0");

    const hours =
        String(
            date.getHours()
        ).padStart(2, "0");

    const minutes =
        String(
            date.getMinutes()
        ).padStart(2, "0");

    const seconds =
        String(
            date.getSeconds()
        ).padStart(2, "0");

    return (
        year +
        "-" +
        month +
        "-" +
        day +
        " " +
        hours +
        ":" +
        minutes +
        ":" +
        seconds
    );
}


function getMonthStart(year, month) {

    return new Date(
        year,
        month,
        1,
        0,
        0,
        0
    );

}


function getMonthEnd(year, month) {

    return new Date(
        year,
        month + 1,
        0,
        23,
        59,
        59
    );

}


async function generateMonthlyBilling() {

    const connection =
        await db.getConnection();


    try {

        await connection.beginTransaction();


        const now =
            new Date();


        /*
        |--------------------------------------------------------------------------
        | Current billing month
        |--------------------------------------------------------------------------
        */

        const currentYear =
            now.getFullYear();

        const currentMonth =
            now.getMonth();


        const monthStart =
            getMonthStart(
                currentYear,
                currentMonth
            );


        const monthEnd =
            getMonthEnd(
                currentYear,
                currentMonth
            );


        const billingMonth =
            currentYear +
            "-" +
            String(
                currentMonth + 1
            ).padStart(2, "0");


        console.log(
            "========================================"
        );

        console.log(
            "ISP SOFTWARE MONTHLY BILLING"
        );

        console.log(
            "Run:",
            formatDateTime(now)
        );

        console.log(
            "Billing Month:",
            billingMonth
        );

        console.log(
            "========================================"
        );


        /*
        |--------------------------------------------------------------------------
        | Find users whose registration/monthly billing is paid
        |--------------------------------------------------------------------------
        */

        const [
            users
        ] = await connection.execute(
            `
            SELECT
                s.id,
                s.company_id,
                s.user_id,
                s.billing_type,
                s.package_id,
                s.package_code,
                s.paid_at
            FROM software_billing_notifications s

            INNER JOIN (
                SELECT
                    company_id,
                    user_id,
                    MAX(id) AS latest_id
                FROM software_billing_notifications
                WHERE status = 'paid'
                GROUP BY
                    company_id,
                    user_id
            ) latest
                ON latest.latest_id = s.id

            WHERE s.status = 'paid'
              AND s.paid_at IS NOT NULL
            `
        );


        console.log(
            "Eligible paid accounts:",
            users.length
        );


        let created =
            0;

        let skipped =
            0;

        let errors =
            0;


        for (
            const account of users
        ) {

            try {

                const companyId =
                    Number(
                        account.company_id
                    );

                const userId =
                    Number(
                        account.user_id
                    );

                const packageId =
                    Number(
                        account.package_id || 0
                    );


                if (
                    companyId <= 0 ||
                    userId <= 0 ||
                    packageId <= 0
                ) {

                    console.log(
                        "SKIP:",
                        "Invalid account/package",
                        account.id
                    );

                    skipped++;

                    continue;
                }


                /*
                |--------------------------------------------------------------------------
                | Validate latest payment date
                |--------------------------------------------------------------------------
                */

                const paidAt =
                    new Date(
                        account.paid_at
                    );


                if (
                    Number.isNaN(
                        paidAt.getTime()
                    )
                ) {

                    console.log(
                        "SKIP:",
                        "Invalid paid_at",
                        "User:",
                        userId
                    );

                    skipped++;

                    continue;
                }


                /*
                |--------------------------------------------------------------------------
                | Do not generate monthly bill in the same month
                | as registration/monthly payment.
                |--------------------------------------------------------------------------
                */

                const paidYear =
                    paidAt.getFullYear();

                const paidMonth =
                    paidAt.getMonth();


                if (
                    paidYear === currentYear &&
                    paidMonth === currentMonth
                ) {

                    console.log(
                        "SKIP:",
                        "Registration/monthly payment is in current month",
                        "User:",
                        userId
                    );

                    skipped++;

                    continue;
                }


                /*
                |--------------------------------------------------------------------------
                | Load active package
                |--------------------------------------------------------------------------
                */

                const [
                    packageRows
                ] = await connection.execute(
                    `
                    SELECT
                        id,
                        package_code,
                        package_name,
                        monthly_fee,
                        status
                    FROM software_packages
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [
                        packageId
                    ]
                );


                if (
                    !packageRows.length
                ) {

                    console.log(
                        "SKIP:",
                        "Package not found",
                        packageId,
                        "User:",
                        userId
                    );

                    skipped++;

                    continue;
                }


                const pkg =
                    packageRows[0];


                if (
                    String(
                        pkg.status
                    ).toLowerCase() !==
                    "active"
                ) {

                    console.log(
                        "SKIP:",
                        "Package inactive",
                        pkg.package_code,
                        "User:",
                        userId
                    );

                    skipped++;

                    continue;
                }


                const monthlyFee =
                    Number(
                        pkg.monthly_fee
                    );


                if (
                    !Number.isFinite(
                        monthlyFee
                    ) ||
                    monthlyFee <= 0
                ) {

                    console.log(
                        "SKIP:",
                        "Invalid monthly fee",
                        pkg.package_code,
                        "User:",
                        userId
                    );

                    skipped++;

                    continue;
                }


                /*
                |--------------------------------------------------------------------------
                | Duplicate protection - Billing
                |--------------------------------------------------------------------------
                */

                const [
                    existingBillingRows
                ] = await connection.execute(
                    `
                    SELECT
                        id,
                        status,
                        amount
                    FROM software_billing_notifications
                    WHERE company_id = ?
                      AND user_id = ?
                      AND billing_type = 'monthly'
                      AND created_at >= ?
                      AND created_at <= ?
                    ORDER BY id DESC
                    LIMIT 1
                    `,
                    [
                        companyId,
                        userId,
                        formatDateTime(
                            monthStart
                        ),
                        formatDateTime(
                            monthEnd
                        )
                    ]
                );


                if (
                    existingBillingRows.length
                ) {

                    console.log(
                        "SKIP:",
                        "Monthly bill already exists",
                        "User:",
                        userId,
                        "Billing ID:",
                        existingBillingRows[0].id
                    );

                    skipped++;

                    continue;
                }


                /*
                |--------------------------------------------------------------------------
                | Duplicate protection - Invoice
                |--------------------------------------------------------------------------
                |
                | Normally billing duplicate protection above is enough.
                | This second check protects the invoice table independently.
                |
                |--------------------------------------------------------------------------
                */

                const [
                    existingInvoiceRows
                ] = await connection.execute(
                    `
                    SELECT
                        id,
                        status,
                        amount
                    FROM invoices
                    WHERE company_id = ?
                      AND user_id = ?
                      AND type = 'monthly'
                      AND message_type = 'monthly_fee'
                      AND invoice_date >= ?
                      AND invoice_date <= ?
                    ORDER BY id DESC
                    LIMIT 1
                    `,
                    [
                        companyId,
                        userId,
                        formatDateTime(
                            monthStart
                        ),
                        formatDateTime(
                            monthEnd
                        )
                    ]
                );


                if (
                    existingInvoiceRows.length
                ) {

                    console.log(
                        "SKIP:",
                        "Monthly invoice already exists",
                        "User:",
                        userId,
                        "Invoice ID:",
                        existingInvoiceRows[0].id
                    );

                    skipped++;

                    continue;
                }


                /*
                |--------------------------------------------------------------------------
                | Due date
                |--------------------------------------------------------------------------
                */

                const dueDate =
                    formatDateTime(
                        monthStart
                    );


                /*
                |--------------------------------------------------------------------------
                | Create monthly billing
                |--------------------------------------------------------------------------
                */

                const [
                    billingResult
                ] = await connection.execute(
                    `
                    INSERT INTO software_billing_notifications
                    (
                        company_id,
                        user_id,
                        billing_type,
                        package_id,
                        package_code,
                        user_count,
                        rate_per_user,
                        amount,
                        status,
                        due_date,
                        paid_at,
                        created_at,
                        updated_at
                    )
                    VALUES
                    (
                        ?,
                        ?,
                        'monthly',
                        ?,
                        ?,
                        NULL,
                        NULL,
                        ?,
                        'unpaid',
                        ?,
                        NULL,
                        NOW(),
                        NOW()
                    )
                    `,
                    [
                        companyId,
                        userId,
                        pkg.id,
                        pkg.package_code,
                        monthlyFee,
                        dueDate
                    ]
                );


                const billingId =
                    Number(
                        billingResult.insertId
                    );


                if (
                    billingId <= 0
                ) {

                    throw new Error(
                        "Monthly billing record was not created."
                    );
                }


                /*
                |--------------------------------------------------------------------------
                | Create monthly invoice
                |--------------------------------------------------------------------------
                |
                | One invoice for one monthly billing.
                |
                */

                const [
                    invoiceResult
                ] = await connection.execute(
                    `
                    INSERT INTO invoices
                    (
                        company_id,
                        user_id,
                        type,
                        message_type,
                        amount,
                        status,
                        invoice_date,
                        due_date,
                        paid_date
                    )
                    VALUES
                    (
                        ?,
                        ?,
                        'monthly',
                        'monthly_fee',
                        ?,
                        'unpaid',
                        NOW(),
                        ?,
                        NULL
                    )
                    `,
                    [
                        companyId,
                        userId,
                        monthlyFee,
                        dueDate
                    ]
                );


                const invoiceId =
                    Number(
                        invoiceResult.insertId
                    );


                if (
                    invoiceId <= 0
                ) {

                    throw new Error(
                        "Monthly invoice was not created."
                    );
                }


                console.log(
                    "CREATED:",
                    "Billing ID:",
                    billingId,
                    "| Invoice ID:",
                    invoiceId,
                    "| User:",
                    userId,
                    "| Company:",
                    companyId,
                    "| Package:",
                    pkg.package_code,
                    "| Amount:",
                    monthlyFee.toFixed(2)
                );


                created++;


            } catch (accountError) {

                errors++;

                console.error(
                    "ACCOUNT BILLING ERROR:",
                    account.user_id,
                    accountError.message
                );

            }

        }


        await connection.commit();


        console.log(
            "========================================"
        );

        console.log(
            "Monthly billing completed."
        );

        console.log(
            "Created:",
            created
        );

        console.log(
            "Skipped:",
            skipped
        );

        console.log(
            "Errors:",
            errors
        );

        console.log(
            "========================================"
        );


    } catch (error) {

        try {

            await connection.rollback();

        } catch (rollbackError) {

            console.error(
                "ROLLBACK ERROR:",
                rollbackError
            );

        }


        console.error(
            "MONTHLY BILLING ERROR:",
            error
        );


        process.exitCode =
            1;

    } finally {

        connection.release();

    }

}


generateMonthlyBilling()
    .then(() => {

        return db.end();

    })
    .catch((error) => {

        console.error(
            "MONTHLY BILLING FATAL ERROR:",
            error
        );

        process.exitCode =
            1;

    });