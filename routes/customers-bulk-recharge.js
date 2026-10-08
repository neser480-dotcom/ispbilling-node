
"use strict";

const express =
    require("express");

const router =
    express.Router();

const controller =
    require("../controllers/customers-bulk-recharge.controller");

const {
    requireAuth
} =
    require("../middleware/auth");


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
    controller.process
);


module.exports =
    router;
