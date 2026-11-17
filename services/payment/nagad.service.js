"use strict";

/*
|--------------------------------------------------------------------------
| NAGAD PAYMENT GATEWAY PROVIDER
|--------------------------------------------------------------------------
| Flow (Nagad Checkout API):
|   1. initiate  -> POST  /check-out/initialize/{merchantId}/{orderId}
|                   POST  /check-out/complete/{paymentReferenceId}
|                   -> returns Nagad payment page URL
|   2. customer pays on Nagad, Nagad redirects the browser to our callback
|   3. verify    -> GET   /verify/payment/{paymentRefId}
|                   (server-to-server; the ONLY thing that can make a
|                    payment "verified")
|
| IMPORTANT
|   The request/response field names below follow the publicly documented
|   Nagad checkout flow. They MUST be confirmed against the merchant kit /
|   documentation Nagad gave you for your sandbox account (see
|   docs/NAGAD_SANDBOX_GUIDE.md). Nothing here is mocked: every call goes
|   to the real Nagad endpoint configured for the environment.
|
| Credentials (encrypted at rest by payment.service.js):
|   merchantId   Nagad merchant ID
|   publicKey    Nagad PG public key        (PEM or raw base64)
|   privateKey   Merchant private key       (PEM or raw base64)
|   merchantNumber (optional) merchant wallet number
|
| Settings (optional, per gateway row):
|   baseUrl      override API base (host must be *.mynagad.com)
|--------------------------------------------------------------------------
*/

const crypto = require("crypto");

const LIVE_BASE = "https://api.mynagad.com/api/dfs";

/*
 * Sandbox base URL: confirm with your Nagad sandbox kit.
 * Override with env NAGAD_SANDBOX_BASE_URL or settings.baseUrl.
 */
const SANDBOX_BASE =
    "http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0/api/dfs";

const API_VERSION = "v-0.2.0";
const CURRENCY_CODE = "050"; // BDT
const REQUEST_TIMEOUT_MS = 25000;

class NagadError extends Error {
    constructor(message, details) {
        super(message);
        this.name = "NagadError";
        this.details = details || null;
    }
}

/*
|--------------------------------------------------------------------------
| KEY HANDLING
|--------------------------------------------------------------------------
*/

function wrapPem(raw, label) {
    const text = String(raw || "").trim();

    if (!text) {
        throw new NagadError(`Nagad ${label} key is not configured.`);
    }

    if (text.includes("-----BEGIN")) {
        return text.replace(/\\n/g, "\n");
    }

    const body = text.replace(/\s+/g, "").match(/.{1,64}/g).join("\n");

    return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

function loadPublicKey(raw) {
    try {
        return crypto.createPublicKey(wrapPem(raw, "PUBLIC KEY"));
    } catch (error) {
        throw new NagadError("Nagad public key is invalid.");
    }
}

function loadPrivateKey(raw) {
    const text = String(raw || "").trim();

    if (!text) {
        throw new NagadError("Nagad private key is not configured.");
    }

    const candidates = text.includes("-----BEGIN")
        ? [text.replace(/\\n/g, "\n")]
        : [
            wrapPem(text, "PRIVATE KEY"),
            wrapPem(text, "RSA PRIVATE KEY")
        ];

    for (const candidate of candidates) {
        try {
            return crypto.createPrivateKey(candidate);
        } catch (_) {
            // try next format
        }
    }

    throw new NagadError("Nagad private key is invalid.");
}

/*
 * RSA PKCS#1 v1.5 encrypt with the Nagad public key (base64 output).
 */
function encryptSensitive(plainText, publicKey) {
    return crypto
        .publicEncrypt(
            {
                key: publicKey,
                padding: crypto.constants.RSA_PKCS1_PADDING
            },
            Buffer.from(plainText, "utf8")
        )
        .toString("base64");
}

/*
 * RSA PKCS#1 v1.5 decrypt with the merchant private key.
 *
 * Recent Node.js versions refuse RSA_PKCS1_PADDING for privateDecrypt, so
 * the raw RSA operation is done with RSA_NO_PADDING and the PKCS#1 v1.5
 * block (00 02 PS 00 M) is removed here. Input is only ever Nagad's
 * response to our own request.
 */
function decryptSensitive(cipherBase64, privateKey) {
    const raw = crypto.privateDecrypt(
        {
            key: privateKey,
            padding: crypto.constants.RSA_NO_PADDING
        },
        Buffer.from(String(cipherBase64 || ""), "base64")
    );

    if (raw.length < 11 || raw[0] !== 0x00 || raw[1] !== 0x02) {
        throw new NagadError("Unable to decrypt Nagad response.");
    }

    const separator = raw.indexOf(0x00, 2);

    if (separator < 10) {
        throw new NagadError("Unable to decrypt Nagad response.");
    }

    return raw.slice(separator + 1).toString("utf8");
}

function signData(plainText, privateKey) {
    return crypto
        .createSign("RSA-SHA256")
        .update(plainText, "utf8")
        .sign(privateKey, "base64");
}

function verifySignature(data, signature, publicKey) {
    if (!signature) {
        return false;
    }

    for (const algorithm of ["RSA-SHA256", "RSA-SHA1"]) {
        try {
            const ok = crypto
                .createVerify(algorithm)
                .update(data, "utf8")
                .verify(publicKey, signature, "base64");

            if (ok) {
                return true;
            }
        } catch (_) {
            // try next algorithm
        }
    }

    return false;
}

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function dhakaDateTime(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    })
        .formatToParts(date)
        .reduce((acc, p) => {
            acc[p.type] = p.value;
            return acc;
        }, {});

    const hour = parts.hour === "24" ? "00" : parts.hour;

    return (
        parts.year + parts.month + parts.day +
        hour + parts.minute + parts.second
    );
}

function isNagadHost(url) {
    try {
        const host = new URL(url).hostname.toLowerCase();

        return host === "mynagad.com" || host.endsWith(".mynagad.com");
    } catch (_) {
        return false;
    }
}

function resolveBaseUrl(environment, settings) {
    const live =
        String(environment || "").toLowerCase() === "live";

    const configured = String(
        settings?.baseUrl ||
        (live
            ? process.env.NAGAD_LIVE_BASE_URL
            : process.env.NAGAD_SANDBOX_BASE_URL) ||
        ""
    ).trim();

    const base = configured || (live ? LIVE_BASE : SANDBOX_BASE);

    if (!isNagadHost(base)) {
        throw new NagadError(
            "Nagad base URL must be a mynagad.com address."
        );
    }

    if (live && !/^https:\/\//i.test(base)) {
        throw new NagadError("Live Nagad base URL must use https.");
    }

    return base.replace(/\/+$/, "");
}

function readCredentials(credentials) {
    const merchantId = String(credentials?.merchantId || "").trim();

    if (!merchantId) {
        throw new NagadError("Nagad merchant ID is not configured.");
    }

    return {
        merchantId,
        merchantNumber: String(credentials?.merchantNumber || "").trim(),
        publicKey: loadPublicKey(credentials?.publicKey),
        privateKey: loadPrivateKey(credentials?.privateKey)
    };
}

function formatAmount(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount <= 0) {
        throw new NagadError("Invalid payment amount.");
    }

    return amount.toFixed(2);
}

function headers(merchantId, clientIp) {
    return {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-KM-Api-Version": API_VERSION,
        "X-KM-IP-V4": String(clientIp || "127.0.0.1"),
        "X-KM-MC-Id": merchantId,
        "X-KM-Client-Type": "PC_WEB"
    };
}

async function request(method, url, { headers: h, body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS
    );

    try {
        const response = await fetch(url, {
            method,
            headers: h,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
            redirect: "error"
        });

        const text = await response.text();

        let json = null;

        try {
            json = JSON.parse(text);
        } catch (_) {
            json = null;
        }

        if (!response.ok || !json) {
            throw new NagadError(
                `Nagad request failed (HTTP ${response.status}).`,
                { status: response.status, body: text.slice(0, 500) }
            );
        }

        return json;
    } catch (error) {
        if (error instanceof NagadError) {
            throw error;
        }

        throw new NagadError(
            error.name === "AbortError"
                ? "Nagad request timed out."
                : "Unable to reach Nagad.",
            { reason: error.message }
        );
    } finally {
        clearTimeout(timer);
    }
}

/*
|--------------------------------------------------------------------------
| INITIATE
|--------------------------------------------------------------------------
*/

async function initiate({
    credentials,
    environment,
    settings,
    transaction,
    urls,
    clientIp
}) {
    const cred = readCredentials(credentials);
    const base = resolveBaseUrl(environment, settings);
    const orderId = String(transaction.transactionId);
    const callback = urls?.callback;

    if (!callback) {
        throw new NagadError("Nagad callback URL is missing.");
    }

    /*
     * STEP 1 - initialize
     */
    const challenge = crypto.randomBytes(20).toString("hex");
    const dateTime = dhakaDateTime();

    const initPlain = JSON.stringify({
        merchantId: cred.merchantId,
        datetime: dateTime,
        orderId,
        challenge
    });

    const initBody = {
        dateTime,
        sensitiveData: encryptSensitive(initPlain, cred.publicKey),
        signature: signData(initPlain, cred.privateKey)
    };

    if (cred.merchantNumber) {
        initBody.accountNumber = cred.merchantNumber;
    }

    const initResponse = await request(
        "POST",
        `${base}/check-out/initialize/${encodeURIComponent(cred.merchantId)}/${encodeURIComponent(orderId)}`,
        {
            headers: headers(cred.merchantId, clientIp),
            body: initBody
        }
    );

    if (!initResponse.sensitiveData) {
        throw new NagadError(
            initResponse.message ||
            initResponse.reason ||
            "Nagad did not accept the payment request.",
            { response: initResponse }
        );
    }

    let initData;

    const initPlainResponse = decryptSensitive(
        initResponse.sensitiveData,
        cred.privateKey
    );

    try {
        initData = JSON.parse(initPlainResponse);
    } catch (_) {
        throw new NagadError("Invalid Nagad initialize response.");
    }

    const paymentReferenceId = String(
        initData.paymentReferenceId || ""
    ).trim();

    const serverChallenge = String(initData.challenge || "").trim();

    if (!paymentReferenceId || !serverChallenge) {
        throw new NagadError(
            "Nagad initialize response is incomplete.",
            { keys: Object.keys(initData) }
        );
    }

    const signatureOk =
        verifySignature(initPlainResponse, initResponse.signature, cred.publicKey) ||
        verifySignature(initResponse.sensitiveData, initResponse.signature, cred.publicKey);

    /*
     * STEP 2 - complete (amount is the SERVER-side amount)
     */
    const completePlain = JSON.stringify({
        merchantId: cred.merchantId,
        orderId,
        currencyCode: CURRENCY_CODE,
        amount: formatAmount(transaction.amount),
        challenge: serverChallenge
    });

    const completeBody = {
        sensitiveData: encryptSensitive(completePlain, cred.publicKey),
        signature: signData(completePlain, cred.privateKey),
        merchantCallbackURL: callback,
        additionalMerchantInfo: {
            purpose: String(transaction.purpose || "")
        }
    };

    const completeResponse = await request(
        "POST",
        `${base}/check-out/complete/${encodeURIComponent(paymentReferenceId)}`,
        {
            headers: headers(cred.merchantId, clientIp),
            body: completeBody
        }
    );

    const paymentUrl = String(completeResponse.callBackUrl || "").trim();

    if (!paymentUrl || !isNagadHost(paymentUrl)) {
        throw new NagadError(
            completeResponse.message ||
            completeResponse.reason ||
            "Nagad did not return a payment page.",
            { response: completeResponse }
        );
    }

    return {
        paymentUrl,
        sessionKey: paymentReferenceId,
        raw: {
            paymentReferenceId,
            initialize_signature_ok: signatureOk,
            complete_status: completeResponse.status || null
        }
    };
}

/*
|--------------------------------------------------------------------------
| VERIFY  (server-to-server, the only source of truth)
|--------------------------------------------------------------------------
| Returns:
|   verified : true ONLY if Nagad says Success AND merchant, order id,
|              payment reference, amount and currency all match.
|   state    : "success" | "failed" | "pending"
|              "failed" is returned only when Nagad itself reports a
|              terminal failure for THIS order. Any other doubt = "pending".
|--------------------------------------------------------------------------
*/

const FAILED_STATUSES = new Set([
    "failed",
    "aborted",
    "cancelled",
    "canceled",
    "expired",
    "fraud",
    "unknownfailed"
]);

async function verify({
    credentials,
    environment,
    settings,
    transaction,
    clientIp
}) {
    const cred = readCredentials(credentials);
    const base = resolveBaseUrl(environment, settings);

    const paymentRefId = String(
        transaction.gateway_session_id || ""
    ).trim();

    if (!paymentRefId) {
        return {
            verified: false,
            state: "pending",
            reasons: ["No Nagad payment reference stored."],
            raw: {}
        };
    }

    const data = await request(
        "GET",
        `${base}/verify/payment/${encodeURIComponent(paymentRefId)}`,
        { headers: headers(cred.merchantId, clientIp) }
    );

    const status = String(data.status || "").trim().toLowerCase();
    const reasons = [];

    const sameOrder =
        String(data.orderId || "") === String(transaction.transaction_id);

    const sameMerchant =
        String(data.merchantId || "") === cred.merchantId;

    const sameRef =
        !data.paymentRefId ||
        String(data.paymentRefId) === paymentRefId;

    const amountOk =
        data.amount !== undefined &&
        Number.isFinite(Number(data.amount)) &&
        Math.abs(
            Number(data.amount) - Number(transaction.amount)
        ) < 0.005;

    const currency = String(
        data.currencyCode || data.currency || ""
    ).trim();

    const currencyOk =
        String(transaction.currency || "BDT") === "BDT" &&
        (!currency || ["050", "BDT"].includes(currency.toUpperCase()));

    if (!sameOrder) reasons.push("order id mismatch");
    if (!sameMerchant) reasons.push("merchant id mismatch");
    if (!sameRef) reasons.push("payment reference mismatch");
    if (!amountOk) reasons.push("amount mismatch");
    if (!currencyOk) reasons.push("currency mismatch");

    const raw = {
        status: data.status || null,
        statusCode: data.statusCode || null,
        orderId: data.orderId || null,
        paymentRefId: data.paymentRefId || paymentRefId,
        amount: data.amount ?? null,
        issuerPaymentRefNo: data.issuerPaymentRefNo || null,
        issuerPaymentDateTime: data.issuerPaymentDateTime || null,
        reasons
    };

    if (status === "success" && reasons.length === 0) {
        return {
            verified: true,
            state: "success",
            gatewayTransactionId:
                data.issuerPaymentRefNo || paymentRefId,
            raw
        };
    }

    /*
     * Terminal failure is only trusted when Nagad's answer is clearly
     * about THIS order. A mismatching response never fails a payment.
     */
    if (
        FAILED_STATUSES.has(status) &&
        sameOrder &&
        sameMerchant
    ) {
        return { verified: false, state: "failed", raw };
    }

    if (status === "success") {
        // Nagad says success but our checks disagree: needs a human.
        return { verified: false, state: "mismatch", raw };
    }

    return { verified: false, state: "pending", raw };
}

module.exports = {
    NagadError,
    initiate,
    verify,

    _test: {
        encryptSensitive,
        decryptSensitive,
        signData,
        verifySignature,
        loadPublicKey,
        loadPrivateKey,
        resolveBaseUrl,
        dhakaDateTime,
        isNagadHost
    }
};
