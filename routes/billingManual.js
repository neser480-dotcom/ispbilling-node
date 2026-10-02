"use strict";

const express = require("express");

const controller =
    require("../controllers/billingManual.controller");

const {
    requireAuth
} = require("../middleware/auth");


const router =
    express.Router();


/*
|--------------------------------------------------------------------------
| ALL MANUAL BILLING ROUTES REQUIRE LOGIN
|--------------------------------------------------------------------------
*/

router.use(
    requireAuth
);


/*
|--------------------------------------------------------------------------
| MANUAL BILLING PAGE
|--------------------------------------------------------------------------
|
| Full URL:
|
| /billing/manual
|
|--------------------------------------------------------------------------
*/

router.get(
    "/",
    controller.superAdminOnly,
    controller.index
);


/*
|--------------------------------------------------------------------------
| MANUAL BILLING DATA
|--------------------------------------------------------------------------
|
| Full URL:
|
| /billing/manual/data
|
|--------------------------------------------------------------------------
*/

router.get(
    "/data",
    controller.superAdminOnly,
    controller.list
);


/*
|--------------------------------------------------------------------------
| CONFIRM PAYMENT PAGE
|--------------------------------------------------------------------------
|
| Full URL:
|
| /billing/manual/mark-paid
|
|--------------------------------------------------------------------------
*/

router.get(
    "/mark-paid",
    controller.superAdminOnly,
    controller.markPaid
);


module.exports = router;