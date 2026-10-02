"use strict";

const express = require("express");

const router =
    express.Router();

const profileController =
    require("../../controllers/admin/profile.controller");

const profileUpdateController =
    require("../../controllers/admin/profile-update.controller");

const {
    requireAuth
} = require("../../middleware/auth");


router.use(requireAuth);


/*
|--------------------------------------------------------------------------
| PROFILE PAGE
|--------------------------------------------------------------------------
*/

router.get(
    "/",
    profileController.page
);


/*
|--------------------------------------------------------------------------
| PROFILE DATA
|--------------------------------------------------------------------------
*/

router.get(
    "/data",
    profileController.data
);


/*
|--------------------------------------------------------------------------
| PROFILE UPDATE
|--------------------------------------------------------------------------
*/

router.post(
    "/update",
    profileUpdateController.update
);


/*
|--------------------------------------------------------------------------
| PASSWORD
|--------------------------------------------------------------------------
*/

router.post(
    "/password",
    profileUpdateController.password
);


module.exports = router;