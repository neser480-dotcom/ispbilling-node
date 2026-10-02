
"use strict";

const express = require("express");

const router = express.Router();

const controller =
    require("../controllers/customers-add.controller");

const {
    requireAuth
} = require("../middleware/auth");

const {
    requirePermission
} = require("../middleware/permission");


router.use(requireAuth);


/*
 * ADD CUSTOMER FORM DATA
 */

router.get(
    "/form",
    controller.formData
);


/*
 * PACKAGES
 */

router.get(
    "/packages",
    controller.packages
);


/*
 * CREATE CUSTOMER
 *
 * Requires:
 * add_customer_with_mobile
 */

router.post(
    "/",
    requirePermission(
        "add_customer_with_mobile"
    ),
    controller.create
);


module.exports = router;
