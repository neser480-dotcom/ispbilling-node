"use strict";

const express = require("express");

const controller = require("../../controllers/softwareBilling.controller");
const { requireAuth } = require("../../middleware/auth");

const router = express.Router();

router.use(requireAuth);

router.get("/current", controller.current);
router.get("/history", controller.history);
router.get("/receipt", controller.receipt);
router.get("/csrf", controller.csrf);
router.get("/admin/list", controller.adminList);

router.post("/admin/manual-pay", controller.manualPay);
router.get("/admin/manual-payments/pending", controller.pendingManualPayments);
router.post("/admin/manual-payments/:id/approve", controller.approveManualPayment);
router.post("/admin/manual-payments/:id/reject", controller.rejectManualPayment);

router.get("/status", controller.current);

module.exports = router;