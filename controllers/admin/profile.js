"use strict";

const express = require("express");

const router = express.Router();

const controller =
    require("../../controllers/admin/profile.controller");

const { requireAuth } =
    require("../../middleware/auth");

router.use(requireAuth);

router.get("/", controller.page);

router.get("/data", controller.data);

router.post("/update", controller.update);

module.exports = router;