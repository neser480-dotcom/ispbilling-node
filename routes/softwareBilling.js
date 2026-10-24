"use strict";

const express = require("express");

const controller =
    require("../controllers/softwareBilling.controller");

const {
    requireAuth
} = require("../middleware/auth");

const router =
    express.Router();


/*
|--------------------------------------------------------------------------
| ALL BILLING ROUTES REQUIRE LOGIN
|--------------------------------------------------------------------------
*/

router.use(requireAuth);


/*
|--------------------------------------------------------------------------
| CURRENT BILLING
|--------------------------------------------------------------------------
*/

router.get(
    "/current",
    controller.current
);

router.get(
    "/history",
    controller.history
);

router.get(
    "/receipt",
    controller.receipt
);

router.get(
    "/csrf",
    controller.csrf
);


/*
|--------------------------------------------------------------------------
| SUPER ADMIN
|--------------------------------------------------------------------------
*/

router.get(
    "/admin/list",
    controller.adminList
);

router.post(
    "/admin/manual-pay",
    controller.manualPay
);


/*
|--------------------------------------------------------------------------
| BILLING STATUS
|--------------------------------------------------------------------------
*/

router.get(
    "/status",
    controller.current
);


module.exports = router;
