"use strict";

const express = require("express");

const router = express.Router();

const controller =
    require("../../controllers/customers/customer-manage.controller");

const {
    requireAuth
} = require("../../middleware/auth");

const {
    requirePermission
} = require("../../middleware/permission");


router.use(requireAuth);


/*
|--------------------------------------------------------------------------
| PROFILE
|--------------------------------------------------------------------------
*/

router.get(
    "/profile",
    requirePermission("customer_list"),
    controller.profile
);


/*
|--------------------------------------------------------------------------
| EDIT
|--------------------------------------------------------------------------
*/

router.get(
    "/edit",
    requirePermission("customer_edit"),
    controller.editForm
);


/*
|--------------------------------------------------------------------------
| UPDATE
|--------------------------------------------------------------------------
*/

router.post(
    "/update",
    requirePermission("customer_edit"),
    controller.update
);


/*
|--------------------------------------------------------------------------
| DELETE
|--------------------------------------------------------------------------
*/

router.post(
    "/delete",
    requirePermission("customer_delete"),
    controller.remove
);


module.exports = router;