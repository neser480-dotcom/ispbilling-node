"use strict";

const express = require("express");
const router = express.Router();

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

const controller = require("../controllers/olt.controller");

// OLT list + search
router.get("/", controller.list);

// OLT details
router.get("/:id/details", controller.details);

// Add OLT
router.post("/", controller.create);

// Edit OLT
router.put("/:id", controller.update);

// Delete OLT and associated ONU records
router.delete("/:id", controller.remove);

// Test actual OLT connection
router.post("/:id/check", controller.check);

// Synchronize OLT and ONU information
router.post("/:id/sync", controller.sync);

// Automatic ONU -> customer mapping (add ?dry_run=1 or body.dry_run to preview)
router.post("/:id/auto-map", controller.autoMap);

// OLT Users / ONU list
router.get("/:id/onus", controller.listOnus);

// ONU customer mapping
router.get("/:id/customers/search", controller.searchCustomers);
router.post("/:id/onus/:onuId/customer", controller.linkOnuCustomer);
router.delete("/:id/onus/:onuId/customer", controller.unlinkOnuCustomer);

module.exports = router;