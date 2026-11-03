
"use strict";

const express =
    require("express");

const router =
    express.Router();

const controller =
    require("../../controllers/customers/customers-bulk-recharge.controller");

const {
    requireAuth
} =
    require("../../middleware/auth");

const {
    requirePermission
} =
    require("../../middleware/permission");


/*
|--------------------------------------------------------------------------
| AUTH
|--------------------------------------------------------------------------
*/

router.use(
    requireAuth
);


/*
|--------------------------------------------------------------------------
| BULK RECHARGE FORM
|--------------------------------------------------------------------------
|
| GET
| /api/customers/bulk-recharge
|
|--------------------------------------------------------------------------
*/

router.get(
    "/bulk-recharge",
    requirePermission("bulk_customer_recharge"),
    controller.form
);


/*
|--------------------------------------------------------------------------
| BULK RECHARGE PROCESS
|--------------------------------------------------------------------------
|
| POST
| /api/customers/bulk-recharge
|
|--------------------------------------------------------------------------
*/

router.post(
    "/bulk-recharge",
    requirePermission("bulk_customer_recharge"),
    controller.process
);


module.exports =
    router;
