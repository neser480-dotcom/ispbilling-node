"use strict";

const express = require("express");
const controller = require("../../controllers/customers/customers-csv.controller");
const { requireAuth } = require("../../middleware/auth");
const { requirePermission } = require("../../middleware/permission");

const router = express.Router();

router.use(requireAuth);

router.get("/csv/template", requirePermission("customer_add"), controller.template);
router.get("/csv/export", requirePermission("customer_list"), controller.exportAll);
router.post("/csv/import", requirePermission("customer_add"), controller.importFile);

module.exports = router;
