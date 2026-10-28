
"use strict";

const express = require("express");
const router = express.Router();

const controller = require("../controllers/olt-monitor.controller");

// ECOM OLT Monitoring Dashboard
router.get("/dashboard", controller.dashboard);

// Live ECOM OLT DDM telemetry
router.get("/live", controller.live);

module.exports = router;
