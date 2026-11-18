"use strict";

/*
|--------------------------------------------------------------------------
| BKASH PROVIDER  (Tokenized Checkout, v1.2.0-beta)
|--------------------------------------------------------------------------
| initiate : POST /tokenized/checkout/token/grant
|            POST /tokenized/checkout/create        -> bkashURL, paymentID
| verify   : grant token, query payment, execute payment if the customer
|            has authorized it, query again. Success only when
|            transactionStatus = Completed and invoice, amount and
|            currency match.
|
| Credentials: app_key, app_secret, username, password
| Base: sandbox https://tokenized.sandbox.bka.sh/v1.2.0-beta
|       live    https://tokenized.pay.bka.sh/v1.2.0-beta
| The "payment/status" (query) endpoint is NOT in the public pages I could
| read - confirm it in the bKash developer portal. Override the base per
| gateway with settings.baseUrl.
|--------------------------------------------------------------------------
*/

const { GatewayError, hostAllowed, requestJson, sameAmount } = require("./gatewayHttp");

function baseUrl(environment, settings) {
    const live = String(environment).toLowerCase() === "live";

    const base = String(
        settings?.baseUrl ||
        (live
            ? "https://tokenized.pay.bka.sh/v1.2.0-beta"
            : "https://tokenized.sandbox.bka.sh/v1.2.0-beta")
    ).replace(/\/+$/, "");

    if (!hostAllowed(base, ["bka.sh"])) {
        throw new GatewayError("bKash base URL is not allowed.");
    }

    return base;
}

function readCredentials(credentials) {
    const cred = {
        appKey: String(credentials?.app_key || "").trim(),
        appSecret: String(credentials?.app_secret || "").trim(),
        username: String(credentials?.username || "").trim(),
        password: String(credentials?.password || "").trim()
    };

    if (!cred.appKey || !cred.appSecret || !cred.username || !cred.password) {
        throw new GatewayError("bKash credentials are not configured.");
    }

    return cred;
}

async function grantToken(cred, base) {
    const { data } = await requestJson(
        "POST",
        `${base}/tokenized/checkout/token/grant`,
        {
            headers: { username: cred.username, password: cred.password },
            json: { app_key: cred.appKey, app_secret: cred.appSecret }
        }
    );

    if (!data.id_token) {
        throw new GatewayError(
            data.statusMessage || "Unable to obtain a bKash token."
        );
    }

    return data.id_token;
}

function authHeaders(cred, token) {
    return { authorization: token, "x-app-key": cred.appKey };
}

async function initiate({ credentials, environment, settings, transaction, urls }) {
    const cred = readCredentials(credentials);
    const base = baseUrl(environment, settings);
    const callback = urls?.callback;

    if (!callback) {
        throw new GatewayError("Callback URL is missing.");
    }

    const token = await grantToken(cred, base);

    const { data } = await requestJson(
        "POST",
        `${base}/tokenized/checkout/create`,
        {
            headers: authHeaders(cred, token),
            json: {
                mode: "0011",
                payerReference: transaction.transactionId,
                callbackURL: callback,
                amount: Number(transaction.amount).toFixed(2),
                currency: "BDT",
                intent: "sale",
                merchantInvoiceNumber: transaction.transactionId
            }
        }
    );

    if (!data.bkashURL || !data.paymentID) {
        throw new GatewayError(
            data.statusMessage || "bKash did not return a payment page.",
            { statusCode: data.statusCode }
        );
    }

    return {
        paymentUrl: data.bkashURL,
        sessionKey: String(data.paymentID),
        raw: { paymentID: data.paymentID }
    };
}

async function queryPayment(cred, base, token, paymentID) {
    const { data } = await requestJson(
        "POST",
        `${base}/tokenized/checkout/payment/status`,
        {
            headers: authHeaders(cred, token),
            json: { paymentID }
        }
    );

    return data;
}

async function verify({ credentials, environment, settings, transaction }) {
    const cred = readCredentials(credentials);
    const base = baseUrl(environment, settings);

    const paymentID = String(transaction.gateway_session_id || "").trim();

    if (!paymentID) {
        return { verified: false, state: "pending", raw: { reason: "no paymentID" } };
    }

    const token = await grantToken(cred, base);

    let data = await queryPayment(cred, base, token, paymentID);

    /*
     * Tokenized checkout: after the customer confirms in bKash, the merchant
     * must EXECUTE the payment. Executing an unauthorized payment just
     * returns an error, no money moves.
     */
    if (String(data.transactionStatus || "") !== "Completed") {
        try {
            await requestJson("POST", `${base}/tokenized/checkout/execute`, {
                headers: authHeaders(cred, token),
                json: { paymentID }
            });
        } catch (_) {
            // not authorized yet / already executed: the query below decides
        }

        data = await queryPayment(cred, base, token, paymentID);
    }

    const status = String(data.transactionStatus || "");
    const reasons = [];

    const sameOrder =
        String(data.merchantInvoiceNumber || "") === transaction.transaction_id;

    if (!sameOrder) reasons.push("invoice mismatch");
    if (!sameAmount(data.amount, transaction.amount)) reasons.push("amount mismatch");
    if (String(data.currency || "BDT").toUpperCase() !== "BDT") reasons.push("currency mismatch");

    const raw = {
        transactionStatus: status || null,
        statusCode: data.statusCode || null,
        paymentID: data.paymentID || paymentID,
        trxID: data.trxID || null,
        merchantInvoiceNumber: data.merchantInvoiceNumber || null,
        amount: data.amount ?? null,
        reasons
    };

    if (status === "Completed" && reasons.length === 0) {
        return {
            verified: true,
            state: "success",
            gatewayTransactionId: String(data.trxID || paymentID),
            raw
        };
    }

    if (status === "Completed") {
        return { verified: false, state: "mismatch", raw };
    }

    if (["Failed", "Cancelled", "Expired"].includes(status) && sameOrder) {
        return { verified: false, state: "failed", raw };
    }

    return { verified: false, state: "pending", raw };
}

module.exports = { GatewayError, initiate, verify };
