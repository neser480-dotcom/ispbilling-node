"use strict";

const express = require("express");

const router =
    express.Router();

const controller =
    require("../controllers/customers-add.controller");

const {
    requireAuth
} = require("../middleware/auth");


router.use(requireAuth);


/*
|--------------------------------------------------------------------------
| ADD CUSTOMER
|--------------------------------------------------------------------------
*/

router.get(
    "/form",
    controller.formData
);


/*
|--------------------------------------------------------------------------
| PACKAGES
|--------------------------------------------------------------------------
*/

router.get(
    "/packages",
    controller.packages
);


/*
|--------------------------------------------------------------------------
| CREATE
|--------------------------------------------------------------------------
*/

router.post(
    "/",
    controller.create
);


module.exports = router;