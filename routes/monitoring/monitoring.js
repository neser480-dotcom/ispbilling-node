"use strict";

const express = require("express");
const router = express.Router();

const controller = require("../../controllers/monitoring/monitoringController");

router.get("/", controller.index);
router.get("/faults", controller.faults);
router.get("/fault-details", controller.faultDetails);
router.get("/fault-details/api", controller.faultDetailsApi);

module.exports = router;
