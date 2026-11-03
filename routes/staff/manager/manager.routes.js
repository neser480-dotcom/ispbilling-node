"use strict";

const express = require("express");
const controller = require("../../../controllers/staff/manager/manager.controller");

const router = express.Router();

router.use((req, res, next) => {
    if (!req.session || !req.session.user_id) {
        return res.status(401).json({ success: false, message: "Authentication required." });
    }
    next();
});

router.get("/data", controller.getList);
router.get("/areas", controller.getAreas);
router.post("/", controller.create);
router.get("/:id/profile", controller.getProfile);
router.get("/:id/edit-data", controller.getEditData);
router.get("/:id/activity", controller.getActivity);
router.put("/:id/password", controller.resetPassword);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
