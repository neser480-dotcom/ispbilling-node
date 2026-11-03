"use strict";

const express = require("express");

const controller =
    require("../../controllers/customers/customers-bulk.controller");

const {
    requireAuth
} = require("../../middleware/auth");

const {
    requirePermission
} = require("../../middleware/permission");

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

/*
|--------------------------------------------------------------------------
| PERMISSION MAP
|--------------------------------------------------------------------------
| Unknown action names are rejected.
|--------------------------------------------------------------------------
*/

const BULK_PERMISSIONS = {
    balance: "update_customer_balance",
    billing_cycle: "billing_cycle_update",
    payment_status: "bulk_payment_status_edit",
    status: "bulk_status_edit",
    message: "sms_board",
    package: "customer_package_update",
    package_update: "customer_package_update",
    connection_on: "customer_activate",
    connection_off: "customer_deactivate",
    delete: "customer_delete",
    promise_date: "customer_edit",
    area: "customer_edit",
    reseller: "customer_edit",
    mikrotik: "customer_edit"
};

function bulkPermission(req, res, next) {

    const name = String(req.params.name || "")
        .trim()
        .toLowerCase()
        .replace(/-/g, "_");

    const key = BULK_PERMISSIONS[name];

    if (!key) {
        return res.status(404).json({
            success: false,
            status: false,
            message: "অজানা বাল্ক অ্যাকশন।"
        });
    }

    return requirePermission(key)(req, res, next);
}

router.get(
    "/bulk/:name",
    bulkPermission,
    controller.form
);

router.post(
    "/bulk/:name",
    bulkPermission,
    controller.apply
);

module.exports = router;