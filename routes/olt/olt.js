"use strict";

const express = require("express");
const router = express.Router();
const { requirePermission } = require("../../middleware/permission");
/*
|--------------------------------------------------------------------------
| OLT MODULE ROUTES
|--------------------------------------------------------------------------
| Mount from app.js:
| app.use("/api/olt", requireSoftwareBilling, oltRoutes);
|
| This file delegates database and hardware operations to the controller.
|--------------------------------------------------------------------------
*/

const controller = require("../../controllers/olt/olt.controller");

// OLT list + search
router.get("/", controller.list);

// ONUs whose OLT was deleted (kept until deleted by hand). Must stay above the /:id routes.
router.get("/deleted/onus", controller.listDeletedOltOnus);
router.delete("/deleted/onus/:onuId", controller.deleteDeletedOltOnu);

// OLT details
router.get("/:id/details", controller.details);

// Add OLT
router.post("/", requirePermission("olt_add"), controller.create);

// Edit OLT
router.put("/:id", controller.update);

// Delete OLT and associated ONU records
router.delete("/:id", controller.remove);

// Test actual OLT connection
router.post("/:id/check", controller.check);

// OLT List page: customer + ONU mapping sync (add ?dry_run=1 to preview)
router.post("/:id/sync/customers", controller.syncCustomers);

// OLT Users page: ONU hardware / optical sync
router.post("/:id/sync/onu", controller.syncOnuHardware);

// Old endpoint, kept for compatibility (same as /sync/onu)
router.post("/:id/sync", controller.sync);

// Automatic ONU -> customer mapping (add ?dry_run=1 or body.dry_run to preview)
router.post("/:id/auto-map", controller.autoMap);

// OLT Users / ONU list
router.get("/:id/onus", controller.listOnus);

// Sync ONE ONU (OLT Users row button): only that ONU is read and updated
router.post("/:id/onus/:onuId/sync", controller.syncOneOnu);

// ONU customer mapping
router.get("/:id/customers/search", controller.searchCustomers);
router.post("/:id/onus/:onuId/customer", controller.linkOnuCustomer);
router.delete("/:id/onus/:onuId/customer", controller.unlinkOnuCustomer);

module.exports = router;