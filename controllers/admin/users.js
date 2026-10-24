"use strict";

const express = require("express");

const router = express.Router();

const controller =
    require("../../controllers/admin/users.controller");

const { requireAuth } =
    require("../../middleware/auth");

router.use(requireAuth);

router.get("/", controller.index);

router.get("/data", controller.data);

router.get("/:id", controller.getOne);

module.exports = router;