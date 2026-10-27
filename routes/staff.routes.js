"use strict";

const express = require("express");
const controller = require("../controllers/staff.controller");

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

router.get("/data", controller.getStaff);

router.post("/", controller.addStaff);

router.put("/:id", controller.updateStaff);

router.delete("/:id", controller.deleteStaff);

router.post("/sms", controller.sendSms);

module.exports = router;