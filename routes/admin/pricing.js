"use strict";

const express = require("express");

const router = express.Router();

const db = require("../../config/database");

const controller =
    require("../../controllers/admin/pricing.controller");

const {
    requireAuth
} = require("../../middleware/auth");

router.use(requireAuth);

/*
|--------------------------------------------------------------------------
| Super Admin verification (role is re-read from the database,
| not trusted from the session)
|--------------------------------------------------------------------------
*/

const requireSuperAdmin = async (req, res, next) => {
    try {
        const userId = Number(req.session.user_id);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(401).json({
                success: false,
                status: false,
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
                status: false,
                message: "User account not found."
            });
        }

        const role = String(rows[0].role || "").trim().toLowerCase();
        const status = String(rows[0].status || "").trim().toLowerCase();

        if (role !== "super_admin" || status !== "active") {
            return res.status(403).json({
                success: false,
                status: false,
                message: "Super Admin access required."
            });
        }

        next();
    } catch (error) {
        console.error("[Pricing] Super Admin check:", error);

        return res.status(500).json({
            success: false,
            status: false,
            message: "Unable to verify Super Admin access."
        });
    }
};

router.use(requireSuperAdmin);

/*
|--------------------------------------------------------------------------
| PAGE
|--------------------------------------------------------------------------
*/

router.get("/", controller.page);

/*
|--------------------------------------------------------------------------
| API
|--------------------------------------------------------------------------
*/

router.get("/api/companies", controller.companies);

router.get("/api/companies/:companyId", controller.detail);

router.post("/api/companies/:companyId/rules", controller.save);

router.post(
    "/api/companies/:companyId/rules/:feeType/toggle",
    controller.toggle
);

router.post(
    "/api/companies/:companyId/rules/:feeType/reset",
    controller.reset
);

module.exports = router;
