"use strict";

const crypto =
    require("crypto");

const db =
    require("../../config/database");


const SUPPORTED_GATEWAYS = [
    "bkash",
    "nagad",
    "rocket",
    "bank",
    "sslcommerz",
    "shurjopay"
];


const SUPPORTED_PURPOSES = [
    "customer_bill",
    "software_registration",
    "software_billing"
];


/*
|--------------------------------------------------------------------------
| NORMALIZERS
|--------------------------------------------------------------------------
*/

function normalizeGateway(value) {

    return String(value || "")
        .trim()
        .toLowerCase();

}


function normalizePurpose(value) {

    return String(value || "")
        .trim()
        .toLowerCase();

}


/*
|--------------------------------------------------------------------------
| TRANSACTION ID
|--------------------------------------------------------------------------
*/

function generateTransactionId() {

    return (
        "ISP" +
        Date.now()
            .toString(36)
            .toUpperCase() +
        crypto
            .randomBytes(5)
            .toString("hex")
            .toUpperCase()
    );

}


/*
|--------------------------------------------------------------------------
| JSON HELPER
|--------------------------------------------------------------------------
*/

function parseJson(
    value,
    fallback = {}
) {

    if (!value) {
        return fallback;
    }


    if (
        typeof value === "object"
    ) {

        return value;

    }


    try {

        return JSON.parse(value);

    } catch (error) {

        return fallback;

    }

}


/*
|--------------------------------------------------------------------------
| PAYMENT CREDENTIAL KEY
|--------------------------------------------------------------------------
*/

function getCredentialKey() {

    const key =
        String(
            process.env.PAYMENT_CREDENTIAL_KEY || ""
        );


    if (!key) {

        throw new Error(
            "PAYMENT_CREDENTIAL_KEY is not configured."
        );

    }


    return crypto
        .createHash("sha256")
        .update(key)
        .digest();

}


/*
|--------------------------------------------------------------------------
| ENCRYPT CREDENTIALS
|--------------------------------------------------------------------------
*/

function encryptCredentials(
    credentials
) {

    const key =
        getCredentialKey();


    const iv =
        crypto.randomBytes(16);


    const cipher =
        crypto.createCipheriv(
            "aes-256-gcm",
            key,
            iv
        );


    const plaintext =
        JSON.stringify(
            credentials || {}
        );


    let encrypted =
        cipher.update(
            plaintext,
            "utf8",
            "base64"
        );


    encrypted +=
        cipher.final(
            "base64"
        );


    const authTag =
        cipher.getAuthTag();


    return JSON.stringify({

        iv:
            iv.toString(
                "base64"
            ),

        tag:
            authTag.toString(
                "base64"
            ),

        data:
            encrypted

    });

}


/*
|--------------------------------------------------------------------------
| DECRYPT CREDENTIALS
|--------------------------------------------------------------------------
*/

function decryptCredentials(
    value
) {

    if (!value) {
        return {};
    }


    const key =
        getCredentialKey();


    const payload =
        parseJson(
            value,
            null
        );


    if (
        !payload ||
        !payload.iv ||
        !payload.tag ||
        !payload.data
    ) {

        return {};

    }


    try {

        const decipher =
            crypto.createDecipheriv(
                "aes-256-gcm",
                key,
                Buffer.from(
                    payload.iv,
                    "base64"
                )
            );


        decipher.setAuthTag(
            Buffer.from(
                payload.tag,
                "base64"
            )
        );


        let decrypted =
            decipher.update(
                payload.data,
                "base64",
                "utf8"
            );


        decrypted +=
            decipher.final(
                "utf8"
            );


        return JSON.parse(
            decrypted
        );

    } catch (error) {

        console.error(
            "PAYMENT CREDENTIAL DECRYPT ERROR:",
            error.message
        );

        return {};

    }

}


/*
|--------------------------------------------------------------------------
| MERGE CREDENTIALS
|--------------------------------------------------------------------------
|
| Important:
|
| Secret fields are intentionally NOT returned to browser.
|
| তাই frontend blank value পাঠালে পুরনো credential
| overwrite করা হবে না।
|
|--------------------------------------------------------------------------
*/

function mergeCredentials(
    existing,
    incoming
) {

    const oldCredentials =
        existing &&
        typeof existing === "object"
            ? existing
            : {};


    const newCredentials =
        incoming &&
        typeof incoming === "object"
            ? incoming
            : {};


    const merged = {
        ...oldCredentials
    };


    for (
        const [key, value]
        of Object.entries(
            newCredentials
        )
    ) {

        /*
        |--------------------------------------------------------------------------
        | Blank credential
        |--------------------------------------------------------------------------
        |
        | Blank string মানে:
        | "আগের credential রাখুন"
        |
        |--------------------------------------------------------------------------
        */

        if (
            typeof value === "string" &&
            value.trim() === ""
        ) {

            if (
                Object.prototype.hasOwnProperty.call(
                    oldCredentials,
                    key
                )
            ) {

                merged[key] =
                    oldCredentials[key];

            }

            continue;

        }


        /*
        |--------------------------------------------------------------------------
        | Normal value
        |--------------------------------------------------------------------------
        */

        merged[key] =
            value;

    }


    return merged;

}


/*
|--------------------------------------------------------------------------
| GET GATEWAY
|--------------------------------------------------------------------------
*/

async function getGateway(
    companyId,
    gateway
) {

    gateway =
        normalizeGateway(
            gateway
        );


    if (
        !SUPPORTED_GATEWAYS.includes(
            gateway
        )
    ) {

        return null;

    }


    const [rows] =
        await db.execute(
            `
            SELECT
                *
            FROM payment_gateways
            WHERE
                gateway = ?
                AND (
                    company_id = ?
                    OR company_id IS NULL
                )
            ORDER BY
                company_id IS NULL ASC,
                id DESC
            LIMIT 1
            `,
            [
                gateway,
                Number(companyId) || 0
            ]
        );


    if (
        !rows.length
    ) {

        return null;

    }


    const row =
        rows[0];


    row.credentials =
        decryptCredentials(
            row.credentials
        );


    row.settings =
        parseJson(
            row.settings,
            {}
        );


    return row;

}


/*
|--------------------------------------------------------------------------
| SAVE GATEWAY
|--------------------------------------------------------------------------
*/

async function saveGateway({

    companyId,

    gateway,

    enabled,

    environment,

    credentials,

    settings

}) {

    gateway =
        normalizeGateway(
            gateway
        );


    if (
        !SUPPORTED_GATEWAYS.includes(
            gateway
        )
    ) {

        throw new Error(
            "Unsupported payment gateway."
        );

    }


    const numericCompanyId =
        Number(companyId);


    if (
        !Number.isInteger(
            numericCompanyId
        ) ||
        numericCompanyId <= 0
    ) {

        throw new Error(
            "Invalid company ID."
        );

    }


    /*
    |--------------------------------------------------------------------------
    | GET EXISTING CONFIGURATION
    |--------------------------------------------------------------------------
    */

    const [existingRows] =
        await db.execute(
            `
            SELECT
                credentials
            FROM payment_gateways
            WHERE
                company_id = ?
                AND gateway = ?
            LIMIT 1
            `,
            [
                numericCompanyId,
                gateway
            ]
        );


    let existingCredentials =
        {};


    if (
        existingRows.length
    ) {

        existingCredentials =
            decryptCredentials(
                existingRows[0]
                    .credentials
            );

    }


    /*
    |--------------------------------------------------------------------------
    | MERGE OLD + NEW CREDENTIALS
    |--------------------------------------------------------------------------
    */

    const mergedCredentials =
        mergeCredentials(
            existingCredentials,
            credentials || {}
        );


    /*
    |--------------------------------------------------------------------------
    | ENCRYPT
    |--------------------------------------------------------------------------
    */

    const encryptedCredentials =
        encryptCredentials(
            mergedCredentials
        );


    /*
    |--------------------------------------------------------------------------
    | SETTINGS
    |--------------------------------------------------------------------------
    */

    const settingsJson =
        JSON.stringify(
            settings || {}
        );


    /*
    |--------------------------------------------------------------------------
    | SAVE
    |--------------------------------------------------------------------------
    */

    await db.execute(
        `
        INSERT INTO payment_gateways (
            company_id,
            gateway,
            enabled,
            environment,
            credentials,
            settings
        )
        VALUES (?, ?, ?, ?, ?, ?)

        ON DUPLICATE KEY UPDATE

            enabled =
                VALUES(enabled),

            environment =
                VALUES(environment),

            credentials =
                VALUES(credentials),

            settings =
                VALUES(settings),

            updated_at =
                CURRENT_TIMESTAMP
        `,
        [

            numericCompanyId,

            gateway,

            enabled ? 1 : 0,

            environment ||
                "sandbox",

            encryptedCredentials,

            settingsJson

        ]
    );

}


/*
|--------------------------------------------------------------------------
| CREATE TRANSACTION
|--------------------------------------------------------------------------
*/

async function createTransaction({

    companyId,

    userId = null,

    customerId = null,

    invoiceId = null,

    gateway,

    purpose,

    amount,

    currency = "BDT"

}) {

    gateway =
        normalizeGateway(
            gateway
        );


    purpose =
        normalizePurpose(
            purpose
        );


    if (
        !SUPPORTED_GATEWAYS.includes(
            gateway
        )
    ) {

        throw new Error(
            "Unsupported payment gateway."
        );

    }


    if (
        !SUPPORTED_PURPOSES.includes(
            purpose
        )
    ) {

        throw new Error(
            "Unsupported payment purpose."
        );

    }


    const numericCompanyId =
        Number(companyId);


    if (
        !Number.isInteger(
            numericCompanyId
        ) ||
        numericCompanyId <= 0
    ) {

        throw new Error(
            "Invalid company ID."
        );

    }


    const numericAmount =
        Number(amount);


    if (
        !Number.isFinite(
            numericAmount
        ) ||
        numericAmount <= 0
    ) {

        throw new Error(
            "Invalid payment amount."
        );

    }


    const transactionId =
        generateTransactionId();


    const [result] =
        await db.execute(
            `
            INSERT INTO payment_transactions (
                company_id,
                user_id,
                customer_id,
                invoice_id,
                gateway,
                purpose,
                amount,
                currency,
                transaction_id,
                status
            )
            VALUES (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                'pending'
            )
            `,
            [

                numericCompanyId,

                userId ||
                    null,

                customerId ||
                    null,

                invoiceId ||
                    null,

                gateway,

                purpose,

                numericAmount.toFixed(
                    2
                ),

                currency,

                transactionId

            ]
        );


    return {

        id:
            result.insertId,

        transactionId,

        gateway,

        purpose,

        amount:
            numericAmount,

        currency

    };

}


/*
|--------------------------------------------------------------------------
| GET TRANSACTION BY ID
|--------------------------------------------------------------------------
*/

async function getTransactionById(
    id
) {

    const [rows] =
        await db.execute(
            `
            SELECT *
            FROM payment_transactions
            WHERE id = ?
            LIMIT 1
            `,
            [id]
        );


    return (
        rows[0] ||
        null
    );

}


/*
|--------------------------------------------------------------------------
| GET TRANSACTION BY TRANSACTION ID
|--------------------------------------------------------------------------
*/

async function getTransactionByTransactionId(
    transactionId
) {

    const [rows] =
        await db.execute(
            `
            SELECT *
            FROM payment_transactions
            WHERE transaction_id = ?
            LIMIT 1
            `,
            [transactionId]
        );


    return (
        rows[0] ||
        null
    );

}


/*
|--------------------------------------------------------------------------
| UPDATE TRANSACTION
|--------------------------------------------------------------------------
*/

async function updateTransaction(
    id,
    data
) {

    const fields = [];
    const values = [];


    const allowed = [

        "status",

        "gateway_transaction_id",

        "gateway_session_id",

        "payment_date",

        "verified_at",

        "metadata"

    ];


    for (
        const field
        of allowed
    ) {

        if (
            Object.prototype.hasOwnProperty.call(
                data,
                field
            )
        ) {

            fields.push(
                `${field} = ?`
            );


            values.push(
                data[field]
            );

        }

    }


    if (
        !fields.length
    ) {

        return;

    }


    values.push(
        id
    );


    await db.execute(
        `
        UPDATE payment_transactions
        SET
            ${fields.join(", ")}
        WHERE
            id = ?
        `,
        values
    );

}


/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {

    SUPPORTED_GATEWAYS,

    SUPPORTED_PURPOSES,

    getGateway,

    saveGateway,

    createTransaction,

    getTransactionById,

    getTransactionByTransactionId,

    updateTransaction,

    encryptCredentials,

    decryptCredentials

};