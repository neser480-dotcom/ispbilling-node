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

// OLT details
router.get("/:id/details", controller.details);

// Add OLT
router.post("/", requirePermission("olt_add"), controller.create);

// Edit OLT
router.put("/:id", controller.update);

// Soft-delete OLT; keep ONU records available for manual cleanup
router.delete("/:id", controller.remove);

// Test actual OLT connection
router.post("/:id/check", controller.check);

// OLT List page: live ONU learned-MAC + PPPoE customer mapping only.
router.post("/:id/sync/customers", controller.syncCustomers);

// OLT Users page: all ONU hardware / optical fields sync only.
router.post("/:id/sync/onu", controller.syncOnuHardware);

// Old endpoint, kept for compatibility (same as /sync/onu)
router.post("/:id/sync", controller.sync);

// Automatic ONU -> customer mapping (add ?dry_run=1 or body.dry_run to preview)
router.post("/:id/auto-map", controller.autoMap);

// OLT Users / ONU list
router.get("/:id/onus", controller.listOnus);
router.delete("/:id/onus/:onuId", controller.deleteOnu);

// Sync one existing ONU without changing its customer mapping.
router.post("/:id/onus/:onuId/sync", controller.syncOneOnu);

// ONU customer mapping
router.get("/:id/customers/search", controller.searchCustomers);
router.post("/:id/onus/:onuId/customer", controller.linkOnuCustomer);
router.delete("/:id/onus/:onuId/customer", controller.unlinkOnuCustomer);

module.exports = router;