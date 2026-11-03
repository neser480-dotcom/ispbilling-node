"use strict";

const express = require("express");
const router = express.Router();

const controller = require("../../controllers/customers/customers.controller");
const { requireAuth } = require("../../middleware/auth");
const { requirePermission } = require("../../middleware/permission");

router.use(requireAuth);
router.use(requirePermission("customer_list"));

router.get("/", controller.list);
router.get("/summary", controller.summary);
router.get("/:id", controller.view);

module.exports = router;
