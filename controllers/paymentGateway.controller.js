"use strict";


const crypto =
    require("crypto");


const path =
    require("path");


const paymentService =
    require("../services/payment/payment.service");


const {
    getProvider
} =
    require("../services/payment/payment.factory");


/*
|--------------------------------------------------------------------------
| ROLE
|--------------------------------------------------------------------------
*/

function normalizeRole(
    role
) {

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


function isSuperAdmin(
    req
) {

    return (
        normalizeRole(
            req.session?.role
        ) === "superadmin"
    );

}


/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

function requireLogin(
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
| COMPANY
|--------------------------------------------------------------------------
*/

function getCompanyId(
    req
) {

    const value =
        Number(
            req.session?.company_id || 0
        );


    if (
        Number.isInteger(value) &&
        value > 0
    ) {

        return value;

    }


    return null;

}


/*
|--------------------------------------------------------------------------
| CSRF
|--------------------------------------------------------------------------
*/

function getCsrfToken(
    req
) {

    if (
        !req.session
    ) {

        return null;

    }


    if (
        typeof req.session.csrf_token !==
        "string" ||
        !req.session.csrf_token
    ) {

        req.session.csrf_token =
            crypto
                .randomBytes(32)
                .toString("hex");

    }


    return req.session.csrf_token;

}


function verifyCsrf(
    req
) {

    const sessionToken =
        req.session?.csrf_token;


    /*
    |--------------------------------------------------------------------------
    | Body অথবা Header
    |--------------------------------------------------------------------------
    */

    const postedToken =
        req.body?.csrf_token ||
        req.headers[
            "x-csrf-token"
        ] ||
        req.headers[
            "x-xsrf-token"
        ];


    if (
        typeof sessionToken !==
            "string" ||

        typeof postedToken !==
            "string" ||

        !sessionToken ||

        !postedToken
    ) {

        return false;

    }


    const sessionBuffer =
        Buffer.from(
            sessionToken,
            "utf8"
        );


    const postedBuffer =
        Buffer.from(
            postedToken,
            "utf8"
        );


    if (
        sessionBuffer.length !==
        postedBuffer.length
    ) {

        return false;

    }


    return crypto.timingSafeEqual(
        sessionBuffer,
        postedBuffer
    );

}


/*
|--------------------------------------------------------------------------
| CSRF ENDPOINT
|--------------------------------------------------------------------------
*/

function csrf(
    req,
    res
) {

    if (
        !requireLogin(
            req,
            res
        )
    ) {

        return;

    }


    return res.json({

        success: true,

        csrf_token:
            getCsrfToken(req)

    });

}


/*
|--------------------------------------------------------------------------
| ADMIN PAGE
|--------------------------------------------------------------------------
*/

function page(
    req,
    res
) {

    if (
        !requireLogin(
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
            .send(
                "Only Super Admin can configure payment gateways."
            );

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
| SAVE GATEWAY
|--------------------------------------------------------------------------
*/

async function save(
    req,
    res
) {

    if (
        !requireLogin(
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
            .json({

                success: false,

                message:
                    "Only Super Admin can configure payment gateways."

            });

    }


    /*
    |--------------------------------------------------------------------------
    | CSRF
    |--------------------------------------------------------------------------
    */

    if (
        !verifyCsrf(req)
    ) {

        return res
            .status(419)
            .json({

                success: false,

                message:
                    "Invalid CSRF token."

            });

    }


    const companyId =
        getCompanyId(req);


    if (
        !companyId
    ) {

        return res
            .status(400)
            .json({

                success: false,

                message:
                    "Company ID is required."

            });

    }


    try {

        const {

            gateway,

            enabled,

            environment,

            credentials,

            settings

        } =
            req.body || {};


        await paymentService.saveGateway({

            companyId,

            gateway,

            enabled,

            environment,

            credentials,

            settings

        });


        return res.json({

            success: true,

            message:
                "Payment gateway configuration saved."

        });


    } catch (error) {

        console.error(
            "PAYMENT GATEWAY SAVE ERROR:",
            error
        );


        return res
            .status(500)
            .json({

                success: false,

                message:
                    error.message ||
                    "Unable to save gateway configuration."

            });

    }

}


/*
|--------------------------------------------------------------------------
| GATEWAY LIST
|--------------------------------------------------------------------------
*/

async function list(
    req,
    res
) {

    if (
        !requireLogin(
            req,
            res
        )
    ) {

        return;

    }


    const companyId =
        getCompanyId(req);


    if (
        !companyId
    ) {

        return res
            .status(400)
            .json({

                success: false,

                message:
                    "Company ID is required."

            });

    }


    try {

        const gateways = [];


        for (
            const gateway
            of paymentService
                .SUPPORTED_GATEWAYS
        ) {

            const row =
                await paymentService
                    .getGateway(
                        companyId,
                        gateway
                    );


            gateways.push({

                gateway,

                enabled:
                    Boolean(
                        row?.enabled
                    ),

                environment:
                    row?.environment ||
                    "sandbox",

                settings:
                    row?.settings ||
                    {}

            });

        }


        /*
        |--------------------------------------------------------------------------
        | Credentials intentionally omitted.
        |--------------------------------------------------------------------------
        */

        return res.json({

            success: true,

            gateways

        });


    } catch (error) {

        console.error(
            "PAYMENT GATEWAY LIST ERROR:",
            error
        );


        return res
            .status(500)
            .json({

                success: false,

                message:
                    "Unable to load payment gateways."

            });

    }

}


/*
|--------------------------------------------------------------------------
| CREATE PAYMENT
|--------------------------------------------------------------------------
*/

async function createPayment(
    req,
    res
) {

    if (
        !requireLogin(
            req,
            res
        )
    ) {

        return;

    }


    /*
    |--------------------------------------------------------------------------
    | CSRF
    |--------------------------------------------------------------------------
    */

    if (
        !verifyCsrf(req)
    ) {

        return res
            .status(419)
            .json({

                success: false,

                message:
                    "Invalid CSRF token."

            });

    }


    const companyId =
        getCompanyId(req);


    if (
        !companyId
    ) {

        return res
            .status(400)
            .json({

                success: false,

                message:
                    "Company ID is required."

            });

    }


    try {

        const {

            gateway,

            purpose,

            amount,

            customer_id,

            invoice_id

        } =
            req.body || {};


        const normalizedGateway =
            String(
                gateway || ""
            )
                .trim()
                .toLowerCase();


        const normalizedPurpose =
            String(
                purpose || ""
            )
                .trim()
                .toLowerCase();


        /*
        |--------------------------------------------------------------------------
        | Gateway validation
        |--------------------------------------------------------------------------
        */

        if (
            !paymentService
                .SUPPORTED_GATEWAYS
                .includes(
                    normalizedGateway
                )
        ) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        "Unsupported payment gateway."

                });

        }


        /*
        |--------------------------------------------------------------------------
        | Purpose validation
        |--------------------------------------------------------------------------
        */

        if (
            !paymentService
                .SUPPORTED_PURPOSES
                .includes(
                    normalizedPurpose
                )
        ) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        "Unsupported payment purpose."

                });

        }


        /*
        |--------------------------------------------------------------------------
        | Gateway configuration
        |--------------------------------------------------------------------------
        */

        const gatewayRow =
            await paymentService
                .getGateway(
                    companyId,
                    normalizedGateway
                );


        if (
            !gatewayRow
        ) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        "Payment gateway is not configured."

                });

        }


        if (
            !gatewayRow.enabled
        ) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        "Payment gateway is disabled."

                });

        }


        /*
        |--------------------------------------------------------------------------
        | Transaction
        |--------------------------------------------------------------------------
        */

        const transaction =
            await paymentService
                .createTransaction({

                    companyId,

                    userId:
                        req.session.user_id,

                    customerId:
                        customer_id ||
                        null,

                    invoiceId:
                        invoice_id ||
                        null,

                    gateway:
                        normalizedGateway,

                    purpose:
                        normalizedPurpose,

                    amount,

                    currency:
                        "BDT"

                });


        /*
        |--------------------------------------------------------------------------
        | Provider
        |--------------------------------------------------------------------------
        */

        const provider =
            getProvider(
                normalizedGateway
            );


        if (
            !provider ||
            typeof provider.initiate !==
                "function"
        ) {

            throw new Error(
                "Payment gateway provider is not available."
            );

        }


        /*
        |--------------------------------------------------------------------------
        | CALLBACK URL
        |--------------------------------------------------------------------------
        */

        const baseUrl =
            `${req.protocol}://${req.get("host")}`;


        const urls = {

            success:
                `${baseUrl}/api/payment-gateway/success/${transaction.transactionId}`,

            fail:
                `${baseUrl}/api/payment-gateway/fail/${transaction.transactionId}`,

            cancel:
                `${baseUrl}/api/payment-gateway/cancel/${transaction.transactionId}`,

            ipn:
                `${baseUrl}/api/payment-gateway/ipn/${normalizedGateway}`

        };


        /*
        |--------------------------------------------------------------------------
        | INITIATE PAYMENT
        |--------------------------------------------------------------------------
        */

        const result =
            await provider.initiate({

                credentials:
                    gatewayRow.credentials,

                environment:
                    gatewayRow.environment,

                transaction,

                customer: {

                    name:
                        req.session?.name ||
                        req.session?.username ||
                        "Customer"

                },

                urls

            });


        /*
        |--------------------------------------------------------------------------
        | Save provider session information
        |--------------------------------------------------------------------------
        */

        await paymentService
            .updateTransaction(
                transaction.id,
                {

                    gateway_session_id:
                        result?.sessionKey ||
                        result?.token ||
                        result?.sessionId ||
                        null,

                    metadata:
                        JSON.stringify(
                            result?.raw ||
                            result ||
                            {}
                        )

                }
            );


        /*
        |--------------------------------------------------------------------------
        | Payment URL
        |--------------------------------------------------------------------------
        */

        const redirectUrl =
            result?.gatewayPageUrl ||
            result?.paymentUrl ||
            result?.redirectUrl ||
            null;


        if (
            !redirectUrl
        ) {

            throw new Error(
                "Gateway did not return a payment URL."
            );

        }


        return res.json({

            success: true,

            transaction_id:
                transaction.transactionId,

            redirect_url:
                redirectUrl

        });


    } catch (error) {

        console.error(
            "CREATE PAYMENT ERROR:",
            error
        );


        return res
            .status(500)
            .json({

                success: false,

                message:
                    error.message ||
                    "Unable to create payment."

            });

    }

}


/*
|--------------------------------------------------------------------------
| EXTRACT CALLBACK DATA
|--------------------------------------------------------------------------
*/

function getCallbackPayload(
    req
) {

    const body =
        req.body &&
        typeof req.body === "object"
            ? req.body
            : {};


    const query =
        req.query &&
        typeof req.query === "object"
            ? req.query
            : {};


    return {

        ...query,

        ...body

    };

}


/*
|--------------------------------------------------------------------------
| FIND TRANSACTION ID
|--------------------------------------------------------------------------
*/

function findTransactionId(
    payload
) {

    const candidates = [

        payload.transaction_id,

        payload.tran_id,

        payload.tranId,

        payload.transactionId,

        payload.merchantTransactionId,

        payload.order_id,

        payload.orderId,

        payload.sp_order_id,

        payload.invoice_id

    ];


    for (
        const value
        of candidates
    ) {

        if (
            value !==
                undefined &&
            value !==
                null &&
            String(value).trim()
        ) {

            return String(
                value
            ).trim();

        }

    }


    return null;

}


/*
|--------------------------------------------------------------------------
| FIND PROVIDER REFERENCE
|--------------------------------------------------------------------------
*/

function findGatewayTransactionId(
    payload
) {

    const candidates = [

        payload.gateway_transaction_id,

        payload.gatewayTransactionId,

        payload.bank_tran_id,

        payload.bank_tran_id,

        payload.tran_id,

        payload.transaction_id,

        payload.transactionId,

        payload.order_id,

        payload.orderId,

        payload.paymentID,

        payload.paymentId,

        payload.paymentID

    ];


    for (
        const value
        of candidates
    ) {

        if (
            value !==
                undefined &&
            value !==
                null &&
            String(value).trim()
        ) {

            return String(
                value
            ).trim();

        }

    }


    return null;

}


/*
|--------------------------------------------------------------------------
| PROVIDER VERIFICATION
|--------------------------------------------------------------------------
|
| Important:
|
| Browser success callback ≠ verified payment.
|
| এখানে provider-এর server-side verify/validate method
| ব্যবহার করার চেষ্টা করা হবে।
|
|--------------------------------------------------------------------------
*/

async function verifyProviderPayment({

    provider,

    gateway,

    credentials,

    environment,

    transaction,

    payload

}) {

    if (
        !provider
    ) {

        throw new Error(
            `Provider "${gateway}" is not available.`
        );

    }


    let verifyFunction =
        null;


    let verifyMethod =
        null;


    if (
        typeof provider.verify ===
        "function"
    ) {

        verifyFunction =
            provider.verify;

        verifyMethod =
            "verify";

    } else if (
        typeof provider.validate ===
        "function"
    ) {

        verifyFunction =
            provider.validate;

        verifyMethod =
            "validate";

    }


    if (
        !verifyFunction
    ) {

        throw new Error(
            `Server-side verification is not implemented for ${gateway}.`
        );

    }


    const result =
        await verifyFunction({

            credentials,

            environment,

            transaction,

            payload,

            gateway

        });


    /*
    |--------------------------------------------------------------------------
    | IMPORTANT
    |--------------------------------------------------------------------------
    |
    | Provider adapter-কে explicit verified:true return করতে হবে।
    |
    | শুধু "success" text দেখে আমরা payment paid করব না।
    |
    |--------------------------------------------------------------------------
    */

    if (
        result?.verified === true
    ) {

        return {

            verified: true,

            raw:
                result?.raw ||
                result

        };

    }


    return {

        verified: false,

        raw:
            result?.raw ||
            result ||
            {}

    };

}


/*
|--------------------------------------------------------------------------
| IPN
|--------------------------------------------------------------------------
*/

async function ipn(
    req,
    res
) {

    const gateway =
        String(
            req.params?.gateway ||
            ""
        )
            .trim()
            .toLowerCase();


    /*
    |--------------------------------------------------------------------------
    | Gateway validation
    |--------------------------------------------------------------------------
    */

    if (
        !paymentService
            .SUPPORTED_GATEWAYS
            .includes(
                gateway
            )
    ) {

        return res
            .status(400)
            .json({

                success: false,

                message:
                    "Unsupported payment gateway."

            });

    }


    try {

        const payload =
            getCallbackPayload(
                req
            );


        /*
        |--------------------------------------------------------------------------
        | Find transaction
        |--------------------------------------------------------------------------
        */

        const transactionId =
            findTransactionId(
                payload
            );


        if (
            !transactionId
        ) {

            console.error(
                "PAYMENT IPN: transaction ID missing.",
                {
                    gateway,
                    payload
                }
            );


            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        "Transaction ID is missing."

                });

        }


        /*
        |--------------------------------------------------------------------------
        | Load transaction
        |--------------------------------------------------------------------------
        */

        const transaction =
            await paymentService
                .getTransactionByTransactionId(
                    transactionId
                );


        if (
            !transaction
        ) {

            return res
                .status(404)
                .json({

                    success: false,

                    message:
                        "Payment transaction not found."

                });

        }


        /*
        |--------------------------------------------------------------------------
        | Gateway mismatch protection
        |--------------------------------------------------------------------------
        */

        if (
            String(
                transaction.gateway ||
                ""
            )
                .trim()
                .toLowerCase() !==
            gateway
        ) {

            return res
                .status(400)
                .json({

                    success: false,

                    message:
                        "Gateway mismatch."

                });

        }


        /*
        |--------------------------------------------------------------------------
        | Already verified
        |--------------------------------------------------------------------------
        |
        | Duplicate IPN এ provider আবার call করার দরকার নেই।
        |
        |--------------------------------------------------------------------------
        */

        if (
            String(
                transaction.status ||
                ""
            )
                .toLowerCase() ===
            "verified"
        ) {

            return res.json({

                success: true,

                verified: true,

                message:
                    "Payment was already verified."

            });

        }


        /*
        |--------------------------------------------------------------------------
        | Load gateway configuration
        |--------------------------------------------------------------------------
        */

        const gatewayRow =
            await paymentService
                .getGateway(
                    transaction.company_id,
                    gateway
                );


        if (
            !gatewayRow
        ) {

            throw new Error(
                "Payment gateway configuration not found."
            );

        }


        /*
        |--------------------------------------------------------------------------
        | Provider
        |--------------------------------------------------------------------------
        */

        const provider =
            getProvider(
                gateway
            );


        /*
        |--------------------------------------------------------------------------
        | SERVER-SIDE VERIFICATION
        |--------------------------------------------------------------------------
        */

        const verification =
            await verifyProviderPayment({

                provider,

                gateway,

                credentials:
                    gatewayRow.credentials,

                environment:
                    gatewayRow.environment,

                transaction,

                payload

            });


        /*
        |--------------------------------------------------------------------------
        | NOT VERIFIED
        |--------------------------------------------------------------------------
        */

        if (
            !verification.verified
        ) {

            await paymentService
                .updateTransaction(
                    transaction.id,
                    {

                        status:
                            "failed",

                        gateway_transaction_id:
                            findGatewayTransactionId(
                                payload
                            ),

                        metadata:
                            JSON.stringify({

                                callback:
                                    payload,

                                verification:
                                    verification.raw ||
                                    {}

                            })

                    }
                );


            return res.json({

                success: true,

                verified: false,

                message:
                    "Payment could not be verified."

            });

        }


        /*
        |--------------------------------------------------------------------------
        | VERIFIED
        |--------------------------------------------------------------------------
        */

        const gatewayTransactionId =
            findGatewayTransactionId(
                payload
            );


        await paymentService
            .updateTransaction(
                transaction.id,
                {

                    status:
                        "verified",

                    gateway_transaction_id:
                        gatewayTransactionId,

                    payment_date:
                        new Date(),

                    verified_at:
                        new Date(),

                    metadata:
                        JSON.stringify({

                            callback:
                                payload,

                            verification:
                                verification.raw ||
                                {}

                        })

                }
            );


        /*
        |--------------------------------------------------------------------------
        | IMPORTANT
        |--------------------------------------------------------------------------
        |
        | এখানে এখনো invoice/customer payment paid করা হচ্ছে না।
        |
        | কারণ customer recharge এবং software invoice-এর
        | actual DB business logic আলাদা করে verify করে
        | transaction-এর সঙ্গে atomically apply করতে হবে।
        |
        |--------------------------------------------------------------------------
        */

        return res.json({

            success: true,

            verified: true,

            transaction_id:
                transaction.transaction_id,

            message:
                "Payment verified successfully."

        });


    } catch (error) {

        console.error(
            `PAYMENT IPN ERROR [${gateway}]:`,
            error
        );


        /*
        |--------------------------------------------------------------------------
        | Gateway সাধারণত 200 response পেলে callback গ্রহণ করে।
        | কিন্তু internal error হলে 500 রাখছি যাতে retry সম্ভব হয়।
        |--------------------------------------------------------------------------
        */

        return res
            .status(500)
            .json({

                success: false,

                message:
                    "Payment verification failed."

            });

    }

}


/*
|--------------------------------------------------------------------------
| GENERIC RESULT PAGES
|--------------------------------------------------------------------------
*/

function success(
    req,
    res
) {

    return res.send(
        `
        <!DOCTYPE html>

        <html>

        <head>

            <meta charset="UTF-8">

            <meta
                name="viewport"
                content="width=device-width, initial-scale=1.0"
            >

            <title>
                Payment Submitted
            </title>

        </head>


        <body
            style="
                font-family:Arial;
                text-align:center;
                padding:60px 20px;
            "
        >

            <h2>
                Payment Submitted
            </h2>

            <p>
                Your payment request has been received.
            </p>

            <p>
                The payment will be verified by the server
                before the bill is marked as paid.
            </p>

            <a href="/dashboard">
                Back to Dashboard
            </a>

        </body>

        </html>
        `
    );

}


/*
|--------------------------------------------------------------------------
| FAIL
|--------------------------------------------------------------------------
*/

function fail(
    req,
    res
) {

    return res
        .status(400)
        .send(
            `
            <!DOCTYPE html>

            <html>

            <head>

                <meta charset="UTF-8">

                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1.0"
                >

                <title>
                    Payment Failed
                </title>

            </head>


            <body
                style="
                    font-family:Arial;
                    text-align:center;
                    padding:60px 20px;
                "
            >

                <h2>
                    Payment Failed
                </h2>

                <p>
                    The payment was not completed.
                </p>

                <a href="/dashboard">
                    Back to Dashboard
                </a>

            </body>

            </html>
            `
        );

}


/*
|--------------------------------------------------------------------------
| CANCEL
|--------------------------------------------------------------------------
*/

function cancel(
    req,
    res
) {

    return res
        .status(400)
        .send(
            `
            <!DOCTYPE html>

            <html>

            <head>

                <meta charset="UTF-8">

                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1.0"
                >

                <title>
                    Payment Cancelled
                </title>

            </head>


            <body
                style="
                    font-family:Arial;
                    text-align:center;
                    padding:60px 20px;
                "
            >

                <h2>
                    Payment Cancelled
                </h2>

                <p>
                    The payment process was cancelled.
                </p>

                <a href="/dashboard">
                    Back to Dashboard
                </a>

            </body>

            </html>
            `
        );

}


/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {

    page,

    save,

    list,

    csrf,

    createPayment,

    ipn,

    success,

    fail,

    cancel

};