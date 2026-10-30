"use strict";

const express = require("express");
const controller = require("../../controllers/customers/customers-csv.controller");
const { requireAuth } = require("../../middleware/auth");

const router = express.Router();

router.use(requireAuth);

router.get("/csv/template", controller.template);
router.get("/csv/export", controller.exportAll);
router.post("/csv/import", controller.importFile);

module.exports = router;
