
"use strict";

const express = require("express");
const path = require("path");

const router = express.Router();

const controller =
    require("../../controllers/admin/permissions.controller");

const {
    requireAuth
} = require("../../middleware/auth");

const db =
    require("../../config/database");


router.use(requireAuth);


/*
 * Super Admin verification
 */
const requireSuperAdmin = async (
    req,
    res,
    next
) => {

    try {

        const userId =
            Number(req.session.user_id);

        if (
            !Number.isInteger(userId) ||
            userId <= 0
        ) {

            return res.status(401).json({
                success: false,
                status: false,
                message: "Invalid session."
            });
        }


        const [rows] =
            await db.query(
                `
                    SELECT
                        id,
                        role,
                        status
                    FROM users
                    WHERE id = ?
                    LIMIT 1
                `,
                [userId]
            );


        if (!rows.length) {

            return res.status(403).json({
                success: false,
                status: false,
                message: "User account not found."
            });
        }


        const role =
            String(
                rows[0].role || ""
            )
            .trim()
            .toLowerCase();


        if (
            role !== "super_admin"
        ) {

            return res.status(403).json({
                success: false,
                status: false,
                message:
                    "Super Admin access required."
            });
        }


        next();

    } catch (error) {

        console.error(
            "[Permissions] Super Admin check:",
            error
        );

        return res.status(500).json({
            success: false,
            status: false,
            message:
                "Unable to verify Super Admin access."
        });
    }
};


/*
 * Permissions page
 */
router.get(
    "/",
    requireSuperAdmin,
    (req, res) => {

        return res.sendFile(
            path.join(
                __dirname,
                "../../views/admin/permissions.html"
            )
        );
    }
);


/*
 * Existing API routes
 */
router.post(
    "/update",
    requireSuperAdmin,
    controller.update
);


router.get(
    "/:userId",
    requireSuperAdmin,
    controller.data
);


module.exports = router;
