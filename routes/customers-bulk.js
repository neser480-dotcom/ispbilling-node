"use strict";

const express = require("express");
const controller = require("../controllers/customers-bulk.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

/*
| GET  /api/customers/bulk/:name?ids=1,2,3   popup HTML
| POST /api/customers/bulk/:name             perform action (JSON)
|
| names: balance, billing_cycle, promise_date, payment_status, message,
|        connection_on, connection_off, mikrotik, reseller, status, delete
*/
router.get("/bulk/:name", controller.form);
router.post("/bulk/:name", controller.apply);

module.exports = router;
