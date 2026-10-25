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

// OLT Users / ONU list
router.get("/:id/onus", controller.listOnus);

module.exports = router;