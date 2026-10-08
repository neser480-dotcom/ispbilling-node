"use strict";

const express = require("express");
const controller = require("../controllers/customers-manage.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

router.get("/edit", controller.editForm);
router.post("/update", controller.update);

router.post("/delete", controller.remove);

router.get("/profile", controller.profile);

module.exports = router;
