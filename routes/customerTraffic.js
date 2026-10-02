"use strict";

const express = require("express");

const router =
    express.Router();

const controller =
    require(
        "../controllers/customerTrafficController"
    );

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

module.exports = router;