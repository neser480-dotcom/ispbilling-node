"use strict";

const express = require("express");

const router =
    express.Router();

const controller =
    require("../controllers/customers.controller");

const {
    requireAuth
} = require("../middleware/auth");

/*
|--------------------------------------------------------------------------
| AUTH
|--------------------------------------------------------------------------
*/

router.use(requireAuth);

/*
|--------------------------------------------------------------------------
| CUSTOMER LIST
|--------------------------------------------------------------------------
*/

router.get(
    "/",
    controller.list
);

/*
|--------------------------------------------------------------------------
| SUMMARY
|--------------------------------------------------------------------------
*/

router.get(
    "/summary",
    controller.summary
);

/*
|--------------------------------------------------------------------------
| CUSTOMER BY ID
|--------------------------------------------------------------------------
*/

router.get(
    "/:id",
    controller.view
);

module.exports = router;