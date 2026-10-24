"use strict";

/*
|--------------------------------------------------------------------------
| PAYMENT GATEWAY ROUTES
|--------------------------------------------------------------------------
| File:
|   routes/paymentGatewayRoutes.js
|
| Controller:
|   controllers/paymentGateway.controller.js
|
| Service:
|   services/payment/payment.service.js
|
| IMPORTANT:
|   routes/paymentGateway.js is NOT used here.
|   That file exports payment service functions, not an Express router.
|--------------------------------------------------------------------------
*/

const express =
    require("express");

const router =
    express.Router();

const paymentGatewayController =
    require("../controllers/paymentGateway.controller");


/*
|--------------------------------------------------------------------------
| ADMIN PAYMENT GATEWAY PAGE
|--------------------------------------------------------------------------
*/

router.get(
    "/",
    paymentGatewayController.page
);


/*
|--------------------------------------------------------------------------
| CSRF TOKEN
|--------------------------------------------------------------------------
*/

router.get(
    "/csrf",
    paymentGatewayController.csrf
);


/*
|--------------------------------------------------------------------------
| GATEWAY LIST
|--------------------------------------------------------------------------
*/

router.get(
    "/list",
    paymentGatewayController.list
);


/*
|--------------------------------------------------------------------------
| SAVE GATEWAY CONFIGURATION
|--------------------------------------------------------------------------
|
| Existing frontend endpoint:
|
| POST /api/payment-gateways/save
|
|--------------------------------------------------------------------------
*/

router.post(
    "/save",
    paymentGatewayController.save
);


/*
|--------------------------------------------------------------------------
| CREATE PAYMENT
|--------------------------------------------------------------------------
*/

router.post(
    "/create",
    paymentGatewayController.createPayment
);


/*
|--------------------------------------------------------------------------
| PAYMENT IPN
|--------------------------------------------------------------------------
|
| Example:
|
| POST /api/payment-gateway/ipn/bkash
|
|--------------------------------------------------------------------------
*/

router.post(
    "/ipn/:gateway",
    paymentGatewayController.ipn
);


/*
|--------------------------------------------------------------------------
| PAYMENT SUCCESS
|--------------------------------------------------------------------------
|
| Example:
|
| GET /api/payment-gateway/success/TXN-ID
|
|--------------------------------------------------------------------------
*/

router.get(
    "/success/:transactionId",
    paymentGatewayController.success
);


/*
|--------------------------------------------------------------------------
| PAYMENT FAIL
|--------------------------------------------------------------------------
*/

router.get(
    "/fail/:transactionId",
    paymentGatewayController.fail
);


/*
|--------------------------------------------------------------------------
| PAYMENT CANCEL
|--------------------------------------------------------------------------
*/

router.get(
    "/cancel/:transactionId",
    paymentGatewayController.cancel
);


module.exports =
    router;