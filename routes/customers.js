"use strict";

const express = require("express");
const router = express.Router();

const controller = require("../controllers/customers.controller");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

/*
|--------------------------------------------------------------------------
| CUSTOMER LIST
|--------------------------------------------------------------------------
*/

router.get("/", controller.list);

/*
|--------------------------------------------------------------------------
| CUSTOMER SUMMARY
|--------------------------------------------------------------------------
*/

router.get("/summary", controller.summary);

/*
|--------------------------------------------------------------------------
| CUSTOMER SINGLE
|--------------------------------------------------------------------------
*/

router.get("/:id", controller.view);

module.exports = router;