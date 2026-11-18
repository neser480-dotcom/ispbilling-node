"use strict";

/*
|--------------------------------------------------------------------------
| SHURJOPAY PROVIDER  (v2 REST API)
|--------------------------------------------------------------------------
| initiate : POST /get_token, POST /secret-pay      -> checkout_url
| verify   : POST /verification {order_id: sp_order_id} (server-to-server)
|            success only when sp_code = 1000 and customer_order_id,
|            amount and currency match.
|
| Credentials: username, password, prefix
| Base: sandbox https://sandbox.shurjopayment.com/api
|       live    https://engine.shurjopayment.com/api
| (the official REST page leaves the base URLs blank - confirm with
|  shurjoPay; override per gateway with settings.baseUrl)
|--------------------------------------------------------------------------
*/

const { GatewayError, hostAllowed, requestJson, sameAmount } = require("./gatewayHttp");

function baseUrl(environment, settings) {
    const live = String(environment).toLowerCase() === "live";

    const base = String(
        settings?.baseUrl ||
        (live
            ? "https://engine.shurjopayment.com/api"
            : "https://sandbox.shurjopayment.com/api")
    ).replace(/\/+$/, "");

    if (!hostAllowed(base, ["shurjopayment.com", "shurjopay.com.bd"])) {
        throw new GatewayError("ShurjoPay base URL is not allowed.");
    }

    return base;
}

function readCredentials(credentials) {
    const username = String(credentials?.username || "").trim();
    const password = String(credentials?.password || "").trim();
    const prefix = String(credentials?.prefix || "").trim();

    if (!username || !password || !prefix) {
        throw new GatewayError("ShurjoPay credentials are not configured.");
    }

    return { username, password, prefix };
}

async function getToken(cred, base) {
    const { data } = await requestJson("POST", `${base}/get_token`, {
        json: { username: cred.username, password: cred.password }
    });

    if (!data.token) {
        throw new GatewayError(
            data.message || "Unable to obtain a ShurjoPay token."
        );
    }

    return data;
}

async function initiate({ credentials, environment, settings, transaction, customer, urls, clientIp }) {
    const cred = readCredentials(credentials);
    const base = baseUrl(environment, settings);
    const callback = urls?.callback;

    if (!callback) {
        throw new GatewayError("Callback URL is missing.");
    }

    const auth = await getToken(cred, base);
    const tokenType = auth.token_type || "Bearer";

    const { data } = await requestJson("POST", `${base}/secret-pay`, {
        headers: {
            Authorization: `${tokenType} ${auth.token}`,
            token: auth.token,
            token_type: tokenType
        },
        json: {
            prefix: cred.prefix,
            token: auth.token,
            store_id: auth.store_id,
            return_url: callback,
            cancel_url: callback,
            amount: Number(transaction.amount).toFixed(2),
            order_id: transaction.transactionId,
            currency: "BDT",
            customer_name: customer?.name || "Customer",
            customer_address: customer?.address || "Bangladesh",
            customer_phone: customer?.phone || "01700000000",
            customer_city: customer?.city || "Dhaka",
            customer_post_code: customer?.postcode || "1200",
            client_ip: clientIp || "127.0.0.1"
        }
    });

    if (!data.checkout_url || !data.sp_order_id) {
        throw new GatewayError(
            data.sp_message || data.message || "ShurjoPay did not return a checkout page.",
            { sp_code: data.sp_code }
        );
    }

    return {
        paymentUrl: data.checkout_url,
        sessionKey: String(data.sp_order_id),
        raw: { sp_order_id: data.sp_order_id }
    };
}

async function verify({ credentials, environment, settings, transaction }) {
    const cred = readCredentials(credentials);
    const base = baseUrl(environment, settings);

    const spOrderId = String(transaction.gateway_session_id || "").trim();

    if (!spOrderId) {
        return { verified: false, state: "pending", raw: { reason: "no sp_order_id" } };
    }

    const auth = await getToken(cred, base);

    const { data } = await requestJson("POST", `${base}/verification`, {
        headers: { Authorization: `${auth.token_type || "Bearer"} ${auth.token}` },
        json: { order_id: spOrderId }
    });

    /* the docs show an object, older versions return an array */
    const record = Array.isArray(data) ? data[0] : data;

    if (!record || typeof record !== "object") {
        return { verified: false, state: "pending", raw: { reason: "empty response" } };
    }

    const code = Number(record.sp_code);
    const sameOrder = String(record.customer_order_id || "") === transaction.transaction_id;
    const reasons = [];

    if (!sameOrder) reasons.push("order id mismatch");
    if (!sameAmount(record.amount, transaction.amount)) reasons.push("amount mismatch");
    if (String(record.currency || "BDT").toUpperCase() !== "BDT") reasons.push("currency mismatch");

    const raw = {
        sp_code: record.sp_code ?? null,
        bank_status: record.bank_status || null,
        order_id: record.order_id || null,
        customer_order_id: record.customer_order_id || null,
        amount: record.amount ?? null,
        reasons
    };

    if (code === 1000 && reasons.length === 0) {
        return {
            verified: true,
            state: "success",
            gatewayTransactionId: String(record.bank_trx_id || record.invoice_no || spOrderId),
            raw
        };
    }

    if (code === 1000) {
        return { verified: false, state: "mismatch", raw };
    }

    /* 1001 declined / 1002 cancelled - final only if it is about OUR order */
    if ((code === 1001 || code === 1002) && sameOrder) {
        return { verified: false, state: "failed", raw };
    }

    return { verified: false, state: "pending", raw };
}

module.exports = { GatewayError, initiate, verify };
