"use strict";

const express = require("express");
const controller = require("../../controllers/customers/customers-recharge.controller");
const { requireAuth } = require("../../middleware/auth");
const { requirePermission } = require("../../middleware/permission");

const router = express.Router();

router.use(requireAuth);

router.get("/recharge", requirePermission("bill_posting"), controller.rechargeForm);
router.post("/recharge", requirePermission("bill_posting"), controller.recharge);

router.get("/bulk-recharge", requirePermission("bulk_customer_recharge"), controller.bulkRechargeForm);
router.post("/bulk-recharge", requirePermission("bulk_customer_recharge"), controller.bulkRecharge);

module.exports = router;
