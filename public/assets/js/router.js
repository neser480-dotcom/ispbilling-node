"use strict";

const express = require("express");

const router =
    express.Router();

const controller =
    require("../../controllers/mikrotik/router.controller");

const syncController =
    require("../../controllers/mikrotik/router-sync.controller");

const crossController =
    require("../../controllers/mikrotik/router-cross.controller");

const {
    requireAuth
} =
    require("../../middleware/auth");

const {
    requirePermission
} = require("../../middleware/permission");
/*
|--------------------------------------------------------------------------
| AUTH
|--------------------------------------------------------------------------
*/

router.use(requireAuth);


/*
|--------------------------------------------------------------------------
| ROUTER LIST
|--------------------------------------------------------------------------
*/

router.get(
    "/",
    controller.list
);


/*
|--------------------------------------------------------------------------
| ADD ROUTER
|--------------------------------------------------------------------------
*/
router.post(
    "/",
    requirePermission("mikrotik_add"),
    controller.create
);

/*
|--------------------------------------------------------------------------
| UPDATE ROUTER
|--------------------------------------------------------------------------
*/

router.put(
    "/:id",
    controller.update
);


/*
|--------------------------------------------------------------------------
| DELETE ROUTER
|--------------------------------------------------------------------------
*/

router.delete(
    "/:id",
    requirePermission("mikrotik_delete"),
    controller.remove
);


/*
|--------------------------------------------------------------------------
| CHECK CONNECTION
|--------------------------------------------------------------------------
*/

router.get(
    "/:id/check",
    controller.check
);


/*
|--------------------------------------------------------------------------
| ROUTER HISTORY / DETAILS
|--------------------------------------------------------------------------
*/

router.get(
    "/:id/history",
    controller.history
);


/*
|--------------------------------------------------------------------------
| ROUTER PACKAGES
|--------------------------------------------------------------------------
*/

router.get(
    "/:id/packages",
    controller.packages
);


/*
|--------------------------------------------------------------------------
| PACKAGE SYNC
|--------------------------------------------------------------------------
*/

router.post(
    "/:id/packages/sync",
    controller.packageSync
);


/*
|--------------------------------------------------------------------------
| PACKAGE UPDATE
|--------------------------------------------------------------------------
*/

router.put(
    "/packages/:id",
    controller.packageUpdate
);


/*
|--------------------------------------------------------------------------
| PACKAGE DELETE
|--------------------------------------------------------------------------
*/

router.delete(
    "/packages/:id",
    controller.packageDelete
);


/*
|--------------------------------------------------------------------------
| CUSTOMER SYNC
|--------------------------------------------------------------------------
*/

router.post(
    "/:id/customers/sync",
    controller.customerSync
);


/*
|--------------------------------------------------------------------------
| CUSTOMER SYNC (SELECT FROM MIKROTIK LIST)
|--------------------------------------------------------------------------
*/

router.get(
    "/:id/customers/sync-preview",
    syncController.preview
);

router.post(
    "/:id/customers/sync-selected",
    syncController.syncSelected
);


/*
|--------------------------------------------------------------------------
| CROSS CUSTOMER
|--------------------------------------------------------------------------
*/

router.get(
    "/:id/customers/extra-netfee",
    crossController.extraNetfee
);

router.delete(
    "/:id/customers/extra-netfee/:customerId",
    crossController.removeExtraNetfee
);

router.delete(
    "/:id/customers/mikrotik/:username",
    crossController.removeExtraMikrotik
);


/*
|--------------------------------------------------------------------------
| ACTIVE CUSTOMERS
|--------------------------------------------------------------------------
*/

router.get(
    "/:id/customers",
    controller.activeCustomers
);


module.exports = router;