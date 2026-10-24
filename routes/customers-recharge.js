"use strict";

const express = require("express");
const controller = require("../controllers/customers-recharge.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

router.get("/recharge", controller.rechargeForm);
router.post("/recharge", controller.recharge);

router.get("/bulk-recharge", controller.bulkRechargeForm);
router.post("/bulk-recharge", controller.bulkRecharge);

module.exports = router;
