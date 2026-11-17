"use strict";

/*
|--------------------------------------------------------------------------
| PAYMENT GATEWAY ROUTES        (mounted at /api/payment-gateway)
|--------------------------------------------------------------------------
| Admin        GET  /  /csrf  /list         POST /save
| Checkout     POST /create                 (logged in, CSRF)
| Public       GET  /pay/:slug              POST /public/quote  /public/create
| Nagad        GET  /nagad/callback/:transactionId
| Result       GET  /result|success|fail|cancel/:transactionId
|
| Security
|   * /create and /save keep the controller's own CSRF check.
|   * Public + callback routes have no session, so they are rate limited
|     and (for POST) must come from the same host.
|   * Callback/result never trust the browser; the controller confirms
|     with the gateway's server-side Verify API.
|--------------------------------------------------------------------------
*/

const express = require("express");

const router = express.Router();

const controller = require("../../controllers/billing/paymentGateway.controller");
const security = require("../../middleware/security");

const publicLimiter = security.authLimiter({
    windowMs: 15 * 60 * 1000,
    max: 40,
    message: {
        success: false,
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests. Please try again later."
    }
});

const callbackLimiter = security.authLimiter({
    windowMs: 15 * 60 * 1000,
    max: 120,
    message: {
        success: false,
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests. Please try again later."
    }
});

/*
 * Public POSTs have no CSRF token: accept only same-host browsers.
 */
function sameHostOnly(req, res, next) {
    const origin = req.get("origin");

    if (origin) {
        let host = "";

        try {
            host = new URL(origin).host;
        } catch (_) {
            host = "";
        }

        if (host !== req.get("host")) {
            return res.status(403).json({
                success: false,
                message: "Invalid request origin."
            });
        }
    }

    return next();
}

/* ---------------- admin ---------------- */
router.get("/", controller.page);
router.get("/csrf", controller.csrf);
router.get("/list", controller.list);
router.post("/save", controller.save);

/* ---------------- checkout (logged in) ---------------- */
router.post("/create", controller.createPayment);

/* ---------------- public customer checkout ---------------- */
router.get("/pay/:slug", publicLimiter, controller.publicPage);
router.post("/public/quote", publicLimiter, sameHostOnly, controller.publicQuote);
router.post("/public/create", publicLimiter, sameHostOnly, controller.publicCreate);

/* ---------------- Nagad ---------------- */
router.get(
    "/nagad/callback/:transactionId",
    callbackLimiter,
    controller.nagadCallback
);

/* ---------------- generic IPN (disabled except where supported) ---------------- */
router.post("/ipn/:gateway", callbackLimiter, controller.ipn);

/* ---------------- result pages (state comes from the database) ---------------- */
router.get("/result/:transactionId", callbackLimiter, controller.result);
router.get("/success/:transactionId", callbackLimiter, controller.success);
router.get("/fail/:transactionId", callbackLimiter, controller.fail);
router.get("/cancel/:transactionId", callbackLimiter, controller.cancel);

module.exports = router;
