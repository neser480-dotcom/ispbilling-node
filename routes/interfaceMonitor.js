"use strict";

const express = require("express");
const router = express.Router();

const controller = require("../controllers/interfaceMonitorController");

router.get("/", controller.index);
router.get("/data", controller.data);
router.get("/bandwidth", controller.bandwidth);

module.exports = router;