
"use strict";

const express = require("express");
const controller = require("../../controllers/staff/salary.controller");

const router = express.Router();

function requireLogin(req, res, next) {
    if (!req.session || !req.session.user_id) {
        return res.status(401).json({
            success: false,
            message: "Authentication required."
        });
    }

    next();
}

router.use(requireLogin);

router.get("/data", controller.getData);
router.post("/:id/pay", controller.pay);
router.post("/delete", controller.remove);

module.exports = router;
