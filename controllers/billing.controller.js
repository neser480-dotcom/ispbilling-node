"use strict";

const path =
    require("path");

const db =
    require("../config/database");


/*
|--------------------------------------------------------------------------
| ROLE NORMALIZER
|--------------------------------------------------------------------------
*/

function normalizeRole(role) {

    return String(
        role || ""
    )
        .trim()
        .toLowerCase()
        .replace(
            /[\s_-]+/g,
            ""
        );

}


/*
|--------------------------------------------------------------------------
| SUPER ADMIN CHECK
|--------------------------------------------------------------------------
*/

function isSuperAdmin(req) {

    return (
        normalizeRole(
            req.session?.role
        ) === "superadmin"
    );

}


/*
|--------------------------------------------------------------------------
| SESSION CHECK
|--------------------------------------------------------------------------
*/

function requireSession(
    req,
    res
) {

    if (
        !req.session ||
        !req.session.user_id
    ) {

        res.redirect("/");

        return false;

    }

    return true;

}


/*
|--------------------------------------------------------------------------
| COMPANY ID
|--------------------------------------------------------------------------
*/

function getCompanyId(req) {

    const value =
        Number(
            req.session?.company_id || 0
        );

    return (
        Number.isInteger(value) &&
        value > 0
    )
        ? value
        : null;

}


/*
|--------------------------------------------------------------------------
| USER ID
|--------------------------------------------------------------------------
*/

function getUserId(req) {

    const value =
        Number(
            req.session?.user_id || 0
        );

    return (
        Number.isInteger(value) &&
        value > 0
    )
        ? value
        : null;

}


/*
|--------------------------------------------------------------------------
| REGISTRATION INVOICE PAGE
|--------------------------------------------------------------------------
|
| /billing
|
|--------------------------------------------------------------------------
*/

function index(
    req,
    res
) {

    if (
        !requireSession(
            req,
            res
        )
    ) {

        return;

    }


    return res.sendFile(
        path.join(
            __dirname,
            "..",
            "views",
            "registration-invoices.html"
        )
    );

}


/*
|--------------------------------------------------------------------------
| INVOICE DETAILS PAGE
|--------------------------------------------------------------------------
|
| /billing/invoice/:id
|
|--------------------------------------------------------------------------
*/

function details(
    req,
    res
) {

    if (
        !requireSession(
            req,
            res
        )
    ) {

        return;

    }


    return res.sendFile(
        path.join(
            __dirname,
            "..",
            "views",
            "billing-invoice-details.html"
        )
    );

}


/*
|--------------------------------------------------------------------------
| SSL COMMERZ CONFIGURATION PAGE
|--------------------------------------------------------------------------
|
| /billing/pay
|
| Only Super Admin.
|
|--------------------------------------------------------------------------
*/

function pay(
    req,
    res
) {

    if (
        !requireSession(
            req,
            res
        )
    ) {

        return;

    }


    if (
        !isSuperAdmin(req)
    ) {

        return res
            .status(403)
            .send(`
                <!DOCTYPE html>

                <html>

                <head>

                    <meta charset="UTF-8">

                    <meta
                        name="viewport"
                        content="width=device-width, initial-scale=1.0"
                    >

                    <title>
                        Access Denied
                    </title>

                    <style>

                        body {
                            margin: 0;
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            background: #f5f7fb;
                            font-family: Arial, sans-serif;
                        }

                        .box {
                            width: 90%;
                            max-width: 450px;
                            background: #fff;
                            padding: 35px;
                            border-radius: 12px;
                            text-align: center;
                            box-shadow:
                                0 5px 25px
                                rgba(0,0,0,.08);
                        }

                        .icon {
                            font-size: 50px;
                            margin-bottom: 15px;
                        }

                        h2 {
                            margin-bottom: 10px;
                        }

                        p {
                            color: #666;
                        }

                        a {
                            display: inline-block;
                            margin-top: 15px;
                            padding: 10px 18px;
                            background: #0d6efd;
                            color: #fff;
                            text-decoration: none;
                            border-radius: 6px;
                        }

                    </style>

                </head>

                <body>

                    <div class="box">

                        <div class="icon">
                            🔒
                        </div>

                        <h2>
                            Access Denied
                        </h2>

                        <p>
                            Only Super Admin can configure payment gateway.
                        </p>

                        <a href="/dashboard">
                            Back to Dashboard
                        </a>

                    </div>

                </body>

                </html>
            `);

    }


    return res.sendFile(
        path.join(
            __dirname,
            "..",
            "views",
            "payment-gateway.html"
        )
    );

}


/*
|--------------------------------------------------------------------------
| INVOICE DATA
|--------------------------------------------------------------------------
|
| /billing/data
|
| Super Admin:
|     সব invoice
|
| Normal user:
|     নিজের company-এর invoice
|
|--------------------------------------------------------------------------
*/

async function data(
    req,
    res
) {

    if (
        !requireSession(
            req,
            res
        )
    ) {

        return;

    }


    try {

        let sql = `
            SELECT

                i.id,

                i.company_id,

                i.user_id,

                i.type,

                i.message_type,

                i.amount,

                i.status,

                i.invoice_date,

                i.due_date,

                i.paid_date,

                COALESCE(
                    u.name,
                    u.username,
                    CONCAT(
                        'User #',
                        i.user_id
                    )
                ) AS user_name,

                u.username

            FROM invoices i

            LEFT JOIN users u
                ON u.id = i.user_id

        `;


        const params = [];


        /*
        |--------------------------------------------------------------------------
        | COMPANY ISOLATION
        |--------------------------------------------------------------------------
        */

        if (
            !isSuperAdmin(req)
        ) {

            const companyId =
                getCompanyId(req);

            const userId =
                getUserId(req);


            /*
            |--------------------------------------------------------------------------
            | If company is available
            |--------------------------------------------------------------------------
            */

            if (
                companyId !== null
            ) {

                sql += `
                    WHERE
                        i.company_id = ?
                `;

                params.push(
                    companyId
                );

            } else {

                /*
                |--------------------------------------------------------------------------
                | Fallback: own user
                |--------------------------------------------------------------------------
                */

                sql += `
                    WHERE
                        i.user_id = ?
                `;

                params.push(
                    userId
                );

            }

        }


        sql += `
            ORDER BY
                i.id DESC
        `;


        const [
            rows
        ] =
            await db.execute(
                sql,
                params
            );


        return res.json({

            success:
                true,

            rows:
                rows

        });


    } catch (error) {

        console.error(
            "BILLING DATA ERROR:",
            error
        );


        return res
            .status(500)
            .json({

                success:
                    false,

                message:
                    "Unable to load invoice data."

            });

    }

}


/*
|--------------------------------------------------------------------------
| SINGLE INVOICE
|--------------------------------------------------------------------------
|
| /billing/data/:id
|
|--------------------------------------------------------------------------
*/

async function invoiceData(
    req,
    res
) {

    if (
        !requireSession(
            req,
            res
        )
    ) {

        return;

    }


    const invoiceId =
        Number(
            req.params.id
        );


    if (
        !Number.isInteger(
            invoiceId
        ) ||
        invoiceId <= 0
    ) {

        return res
            .status(400)
            .json({

                success:
                    false,

                message:
                    "Invalid invoice ID."

            });

    }


    try {

        let sql = `
            SELECT

                i.id,

                i.company_id,

                i.user_id,

                i.type,

                i.message_type,

                i.amount,

                i.status,

                i.invoice_date,

                i.due_date,

                i.paid_date,

                COALESCE(
                    u.name,
                    u.username,
                    CONCAT(
                        'User #',
                        i.user_id
                    )
                ) AS user_name,

                u.username

            FROM invoices i

            LEFT JOIN users u
                ON u.id = i.user_id

            WHERE
                i.id = ?

        `;


        const params = [
            invoiceId
        ];


        /*
        |--------------------------------------------------------------------------
        | COMPANY ISOLATION
        |--------------------------------------------------------------------------
        */

        if (
            !isSuperAdmin(req)
        ) {

            const companyId =
                getCompanyId(req);

            const userId =
                getUserId(req);


            if (
                companyId !== null
            ) {

                sql += `
                    AND i.company_id = ?
                `;

                params.push(
                    companyId
                );

            } else {

                sql += `
                    AND i.user_id = ?
                `;

                params.push(
                    userId
                );

            }

        }


        sql += `
            LIMIT 1
        `;


        const [
            rows
        ] =
            await db.execute(
                sql,
                params
            );


        if (
            !rows.length
        ) {

            return res
                .status(404)
                .json({

                    success:
                        false,

                    message:
                        "Invoice not found."

                });

        }


        return res.json({

            success:
                true,

            invoice:
                rows[0]

        });


    } catch (error) {

        console.error(
            "SINGLE INVOICE ERROR:",
            error
        );


        return res
            .status(500)
            .json({

                success:
                    false,

                message:
                    "Unable to load invoice."

            });

    }

}


/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {

    index,

    details,

    pay,

    data,

    invoiceData

};