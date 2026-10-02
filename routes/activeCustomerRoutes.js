"use strict";

const express = require("express");
const router = express.Router();

const controller = require("../controllers/activeCustomerController");

router.get("/", controller.page);

router.get("/api/routers", controller.routers);

router.get("/api/data", controller.data);

module.exports = router;