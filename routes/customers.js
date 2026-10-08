
"use strict";

const express = require("express");

const router = express.Router();

const controller = require("../controllers/customers.controller");
const manageController = require("../controllers/customer-manage.controller");

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
| CUSTOMER MANAGE
|--------------------------------------------------------------------------
| IMPORTANT:
| These routes must come before /:id
|--------------------------------------------------------------------------
*/

/*
| Profile popup
| GET /api/customers/profile?id=21729
*/
router.get(
    "/profile",
    manageController.profile
);

/*
| Edit popup
| GET /api/customers/edit?id=21729
*/
router.get(
    "/edit",
    manageController.editForm
);

/*
| Update customer
| POST /api/customers/update
*/
router.post(
    "/update",
    manageController.update
);

/*
| Delete customer
| POST /api/customers/delete
*/
router.post(
    "/delete",
    manageController.remove
);

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
