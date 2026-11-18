"use strict";

/*
|--------------------------------------------------------------------------
| SSLCOMMERZ PROVIDER
|--------------------------------------------------------------------------
| initiate : POST  /gwprocess/v4/api.php                -> GatewayPageURL
| verify   : GET   /validator/api/merchantTransIDvalidationAPI.php (by OUR
|            tran_id) then GET /validator/api/validationserverAPI.php
|            (val_id) - both server-to-server. The browser callback is
|            never trusted.
|
| Credentials: store_id, store_password
| Endpoint fields follow the SSLCOMMERZ v4 docs (order-validation and
| order-query pages). Confirm with your sandbox store before going live.
|--------------------------------------------------------------------------
*/

const { GatewayError, requestJson, sameAmount } = require("./gatewayHttp");

function api(environment) {
    const live = String(environment).toLowerCase() === "live";
    const host = live
        ? "https://securepay.sslcommerz.com"
        : "https://sandbox.sslcommerz.com";

    return {
        initiate: `${host}/gwprocess/v4/api.php`,
        validate: `${host}/validator/api/validationserverAPI.php`,
        query: `${host}/validator/api/merchantTransIDvalidationAPI.php`
    };
}

function readCredentials(credentials) {
    const storeId = String(credentials?.store_id || "").trim();
    const storePassword = String(credentials?.store_password || "").trim();

    if (!storeId || !storePassword) {
        throw new GatewayError("SSLCommerz credentials are not configured.");
    }

    return { storeId, storePassword };
}

async function initiate({ credentials, environment, settings, transaction, customer, urls }) {
    const cred = readCredentials(credentials);
    const endpoints = api(environment);

    const callback = urls?.callback;

    if (!callback) {
        throw new GatewayError("Callback URL is missing.");
    }

    const { data } = await requestJson("POST", endpoints.initiate, {
        form: {
            store_id: cred.storeId,
            store_passwd: cred.storePassword,
            total_amount: Number(transaction.amount).toFixed(2),
            currency: "BDT",
            tran_id: transaction.transactionId,
            success_url: callback,
            fail_url: callback,
            cancel_url: callback,
            cus_name: customer?.name || "Customer",
            cus_email: customer?.email || "customer@example.com",
            cus_add1: customer?.address || "Bangladesh",
            cus_city: customer?.city || "Dhaka",
            cus_country: "Bangladesh",
            cus_phone: customer?.phone || "01700000000",
            product_name: String(transaction.purpose || "Internet bill"),
            product_category: "ISP Billing",
            product_profile: "non-physical-goods",
            shipping_method: "NO",
            num_of_item: "1",
            /* Rocket / DBBL: restrict the SSLCommerz page to that method */
            ...(settings && settings.multi_card_name
                ? { multi_card_name: String(settings.multi_card_name) }
                : {})
        }
    });

    if (!data.GatewayPageURL) {
        throw new GatewayError(
            data.failedreason || "SSLCommerz payment session creation failed.",
            { status: data.status }
        );
    }

    return {
        paymentUrl: data.GatewayPageURL,
        sessionKey: data.sessionkey || null,
        raw: { sessionkey: data.sessionkey || null }
    };
}

const SUCCESS = new Set(["VALID", "VALIDATED"]);

async function verify({ credentials, environment, transaction }) {
    const cred = readCredentials(credentials);
    const endpoints = api(environment);

    const queryUrl = new URL(endpoints.query);
    queryUrl.searchParams.set("tran_id", transaction.transaction_id);
    queryUrl.searchParams.set("store_id", cred.storeId);
    queryUrl.searchParams.set("store_passwd", cred.storePassword);
    queryUrl.searchParams.set("format", "json");

    const { data } = await requestJson("GET", queryUrl.toString());

    const elements = Array.isArray(data.element) ? data.element : [];

    const paid = elements.find(
        (el) =>
            SUCCESS.has(String(el.status || "").toUpperCase()) &&
            String(el.tran_id || "") === transaction.transaction_id
    );

    if (!paid) {
        /*
         * A failed/cancelled attempt can be retried by the customer on the
         * same session, so it is never turned into a final "failed" here.
         */
        return {
            verified: false,
            state: "pending",
            raw: {
                found: elements.length,
                statuses: elements.map((el) => el.status)
            }
        };
    }

    /*
     * Second, independent check with the validation API (val_id).
     */
    const validateUrl = new URL(endpoints.validate);
    validateUrl.searchParams.set("val_id", paid.val_id);
    validateUrl.searchParams.set("store_id", cred.storeId);
    validateUrl.searchParams.set("store_passwd", cred.storePassword);
    validateUrl.searchParams.set("v", "1");
    validateUrl.searchParams.set("format", "json");

    const { data: v } = await requestJson("GET", validateUrl.toString());

    const reasons = [];

    if (!SUCCESS.has(String(v.status || "").toUpperCase())) reasons.push("status not valid");
    if (String(v.tran_id || "") !== transaction.transaction_id) reasons.push("transaction id mismatch");
    if (!sameAmount(v.amount, transaction.amount)) reasons.push("amount mismatch");
    if (String(v.currency_type || "").toUpperCase() !== "BDT") reasons.push("currency mismatch");
    if (String(v.risk_level) === "1") reasons.push("high risk transaction");

    const raw = {
        status: v.status || null,
        tran_id: v.tran_id || null,
        val_id: v.val_id || paid.val_id,
        amount: v.amount ?? null,
        currency_type: v.currency_type || null,
        bank_tran_id: v.bank_tran_id || null,
        risk_level: v.risk_level ?? null,
        reasons
    };

    if (reasons.length === 0) {
        return {
            verified: true,
            state: "success",
            gatewayTransactionId: v.bank_tran_id || v.val_id || paid.val_id,
            raw
        };
    }

    return { verified: false, state: "mismatch", raw };
}

module.exports = { GatewayError, initiate, verify };
