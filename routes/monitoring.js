"use strict";

const express = require("express");

const router = express.Router();

const controller =
    require("../controllers/monitoringController");


/*
|--------------------------------------------------------------------------
| NETWORK FAULT MONITORING PAGE
|--------------------------------------------------------------------------
| GET /monitoring
|--------------------------------------------------------------------------
*/

router.get(
    "/",
    controller.index
);


/*
|--------------------------------------------------------------------------
| NETWORK FAULT API
|--------------------------------------------------------------------------
| GET /api/monitoring/faults
|--------------------------------------------------------------------------
*/

router.get(
    "/faults",
    controller.faults
);


/*
|--------------------------------------------------------------------------
| FAULT DETAILS
|--------------------------------------------------------------------------
| GET /monitoring/fault-details
|--------------------------------------------------------------------------
*/

router.get(
    "/fault-details",
    controller.faultDetails
);


module.exports = router;