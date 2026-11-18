"use strict";

/*
|--------------------------------------------------------------------------
| DEMO MODE  (testing only - no real money, no real gateway)
|--------------------------------------------------------------------------
| Turn on with   PAYMENT_DEMO_MODE=1   in .env  (default: OFF).
|
| A gateway runs in DEMO only while it has NO complete credentials or is
| not enabled. As soon as Super Admin saves all credentials and enables it,
| that gateway is REAL and demo is not used for it any more.
|
| A demo payment still goes through the normal settle() flow, so a
| "successful" demo marks the bill PAID in the ledger. Never leave demo
| mode on in production.
|--------------------------------------------------------------------------
*/

const REQUIRED = {
    nagad: ["merchantId", "publicKey", "privateKey"],
    bkash: ["app_key", "app_secret", "username", "password"],
    sslcommerz: ["store_id", "store_password"],
    shurjopay: ["username", "password", "prefix"]
};

function enabled() {
    return ["1", "true", "yes", "on"].includes(
        String(process.env.PAYMENT_DEMO_MODE || "").trim().toLowerCase()
    );
}

/* real = enabled AND every required credential present */
function isReal(gateway, row) {
    if (!row || !row.enabled) {
        return false;
    }

    const creds = row.credentials || {};

    return (REQUIRED[gateway] || []).every(
        (key) => typeof creds[key] === "string" && creds[key].trim() !== ""
    );
}

/* "real" | "demo" | null (not usable) */
function modeFor(gateway, row) {
    if (isReal(gateway, row)) {
        return "real";
    }

    return enabled() ? "demo" : null;
}

module.exports = { enabled, isReal, modeFor };
