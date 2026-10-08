"use strict";

const express = require("express");

const controller =
    require("../controllers/customers-bulk.controller");

const {
    requireAuth
} = require("../middleware/auth");

const router =
    express.Router();

router.use(requireAuth);

/*
|--------------------------------------------------------------------------
| CUSTOMER BULK ACTIONS
|--------------------------------------------------------------------------
|
| GET:
|   /api/customers/bulk/:name?ids=1,2,3
|
| POST:
|   /api/customers/bulk/:name
|
| Supported:
|
| balance
| billing_cycle
| promise_date
| payment_status
| message
| area
| status
| reseller
| package
| package_update
| connection_on
| connection_off
| mikrotik
| delete
|
| Bulk Recharge is handled separately by:
| customers-recharge route
|--------------------------------------------------------------------------
*/

router.get(
    "/bulk/:name",
    controller.form
);

router.post(
    "/bulk/:name",
    controller.apply
);

module.exports = router;