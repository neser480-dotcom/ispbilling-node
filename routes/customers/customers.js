"use strict";

const express = require("express");
const router = express.Router();

const controller = require("../../controllers/customers/customers.controller");
const { requireAuth } = require("../../middleware/auth");

router.use(requireAuth);

router.get("/", controller.list);
router.get("/summary", controller.summary);
router.get("/:id", controller.view);

module.exports = router;
