"use strict";

const express = require("express");

const router =
    express.Router();

const controller =
    require("../../controllers/monitoring/customerTrafficController");

/*
|--------------------------------------------------------------------------
| PAGE
|--------------------------------------------------------------------------
*/

router.get(
    "/",
    controller.index
);

/*
|--------------------------------------------------------------------------
| LIVE JSON API
|--------------------------------------------------------------------------
*/

router.get(
    "/live",
    controller.live
);

router.get(
    "/monthly",
    controller.monthly
);

module.exports = router;