"use strict";

const express = require("express");

const router = express.Router();

const controller =
    require("../../controllers/customers/customer-manage.controller");

const {
    requireAuth
} = require("../../middleware/auth");


router.use(requireAuth);


/*
|--------------------------------------------------------------------------
| PROFILE
|--------------------------------------------------------------------------
*/

router.get(
    "/profile",
    controller.profile
);


/*
|--------------------------------------------------------------------------
| EDIT
|--------------------------------------------------------------------------
*/

router.get(
    "/edit",
    controller.editForm
);


/*
|--------------------------------------------------------------------------
| UPDATE
|--------------------------------------------------------------------------
*/

router.post(
    "/update",
    controller.update
);


/*
|--------------------------------------------------------------------------
| DELETE
|--------------------------------------------------------------------------
*/

router.post(
    "/delete",
    controller.remove
);


module.exports = router;