"use strict";

const express = require("express");

const router = express.Router();

const controller =
    require("../../controllers/admin/permissions.controller");

const { requireAuth } =
    require("../../middleware/auth");

router.use(requireAuth);

router.get(
    "/:userId",
    controller.data
);

router.post(
    "/update",
    controller.update
);

module.exports = router;