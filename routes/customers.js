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
| BULK ACTION POPUPS
|--------------------------------------------------------------------------
|
| All bulk actions use the same frontend:
|
| #customerActionModal
| #customerActionModalBody
|
*/

/*
|--------------------------------------------------------------------------
| BULK MESSAGE
|--------------------------------------------------------------------------
*/

router.get(
    "/bulk/message",
    controller.bulkMessageForm
);

router.post(
    "/bulk/message",
    controller.bulkMessage
);

/*
|--------------------------------------------------------------------------
| BULK PROMISE DATE
|--------------------------------------------------------------------------
*/

router.get(
    "/bulk/promise_date",
    controller.bulkPromiseDateForm
);

router.post(
    "/bulk/promise_date",
    controller.bulkPromiseDate
);

/*
|--------------------------------------------------------------------------
| BULK BILLING CYCLE
|--------------------------------------------------------------------------
*/

router.get(
    "/bulk/billing_cycle",
    controller.bulkBillingCycleForm
);

router.post(
    "/bulk/billing_cycle",
    controller.bulkBillingCycle
);

/*
|--------------------------------------------------------------------------
| BULK PAYMENT STATUS
|--------------------------------------------------------------------------
*/

router.get(
    "/bulk/payment_status",
    controller.bulkPaymentStatusForm
);

router.post(
    "/bulk/payment_status",
    controller.bulkPaymentStatus
);

/*
|--------------------------------------------------------------------------
| BULK AREA
|--------------------------------------------------------------------------
*/

router.get(
    "/bulk/area",
    controller.bulkAreaForm
);

router.post(
    "/bulk/area",
    controller.bulkArea
);

/*
|--------------------------------------------------------------------------
| BULK STATUS
|--------------------------------------------------------------------------
*/

router.get(
    "/bulk/status",
    controller.bulkStatusForm
);

router.post(
    "/bulk/status",
    controller.bulkStatus
);

/*
|--------------------------------------------------------------------------
| BULK BALANCE
|--------------------------------------------------------------------------
*/

router.get(
    "/bulk/balance",
    controller.bulkBalanceForm
);

router.post(
    "/bulk/balance",
    controller.bulkBalance
);

/*
|--------------------------------------------------------------------------
| BULK RECHARGE
|--------------------------------------------------------------------------
*/

router.get(
    "/bulk/recharge",
    controller.bulkRechargeForm
);

router.post(
    "/bulk/recharge",
    controller.bulkRecharge
);

/*
|--------------------------------------------------------------------------
| BULK RESELLER
|--------------------------------------------------------------------------
*/

router.get(
    "/bulk/reseller",
    controller.bulkResellerForm
);

router.post(
    "/bulk/reseller",
    controller.bulkReseller
);

/*
|--------------------------------------------------------------------------
| BULK PACKAGE
|--------------------------------------------------------------------------
*/

router.get(
    "/bulk/package",
    controller.bulkPackageForm
);

router.post(
    "/bulk/package",
    controller.bulkPackage
);

/*
|--------------------------------------------------------------------------
| BULK CONNECTION ON
|--------------------------------------------------------------------------
*/

router.get(
    "/bulk/connection_on",
    controller.bulkConnectionOnForm
);

router.post(
    "/bulk/connection_on",
    controller.bulkConnectionOn
);

/*
|--------------------------------------------------------------------------
| BULK CONNECTION OFF
|--------------------------------------------------------------------------
*/

router.get(
    "/bulk/connection_off",
    controller.bulkConnectionOffForm
);

router.post(
    "/bulk/connection_off",
    controller.bulkConnectionOff
);

/*
|--------------------------------------------------------------------------
| BULK MIKROTIK
|--------------------------------------------------------------------------
*/

router.get(
    "/bulk/mikrotik",
    controller.bulkMikrotikForm
);

router.post(
    "/bulk/mikrotik",
    controller.bulkMikrotik
);

/*
|--------------------------------------------------------------------------
| BULK DELETE
|--------------------------------------------------------------------------
*/

router.get(
    "/bulk/delete",
    controller.bulkDeleteForm
);

router.post(
    "/bulk/delete",
    controller.bulkDelete
);

/*
|--------------------------------------------------------------------------
| CUSTOMER BY ID
|--------------------------------------------------------------------------
|
| Keep this route LAST.
| Otherwise /bulk/... could be interpreted as an :id.
|
|--------------------------------------------------------------------------
*/

router.get(
    "/:id",
    controller.view
);

module.exports = router;