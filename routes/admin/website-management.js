"use strict";

const express = require("express");
const router = express.Router();

const db = require("../../config/database");
const controller = require("../../controllers/admin/website-management.controller");
const { requireAuth } = require("../../middleware/auth");

// Public website-এর জন্য কনটেন্ট পড়া যাবে
router.get("/content", controller.getContent);

// নিচের সব Route শুধু Super Admin-এর জন্য
router.use(requireAuth);

const requireSuperAdmin = async (req, res, next) => {
    try {
        const userId = Number(req.session.user_id);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid session."
            });
        }

        const [rows] = await db.query(
            "SELECT id, role, status FROM users WHERE id = ? LIMIT 1",
            [userId]
        );

        if (!rows.length) {
            return res.status(403).json({
                success: false,
                message: "User account not found."
            });
        }

        const role = String(rows[0].role || "").trim().toLowerCase();
        const status = String(rows[0].status || "").trim().toLowerCase();

        if (role !== "super_admin" || status !== "active") {
            return res.status(403).json({
                success: false,
                message: "Super Admin access required."
            });
        }

        return next();
    } catch (error) {
        console.error("[Website Management] Access check:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to verify Super Admin access."
        });
    }
};

router.use(requireSuperAdmin);

router.get("/", controller.page);
router.get("/draft", controller.getDraft);
router.put("/draft", controller.saveDraft);
router.post("/publish", controller.publish);
router.post("/restore-backup", controller.restoreBackup);

module.exports = router;