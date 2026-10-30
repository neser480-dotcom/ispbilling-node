"use strict";

const express = require("express");
const router = express.Router();

const controller = require("../../controllers/customers/activeCustomerController");

router.get("/", controller.page);

router.get("/api/routers", controller.routers);

router.get("/api/data", controller.data);

router.post("/api/ping", controller.ping);

router.post("/api/remove", controller.remove);

module.exports = router;