"use strict";

const express = require("express");

const router = express.Router();

const db = require("../../config/database");

const controller =
require("../../controllers/admin/users.controller");

const {
requireAuth
} = require("../../middleware/auth");

router.use(requireAuth);

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


    const user =
        rows[0];


    const role =
        String(
            user.role || ""
        )
        .trim()
        .toLowerCase();


    if (
        role !== "super_admin"
    ) {

        return res.status(403).json({

            success: false,

            status: false,

            message: "Super Admin access required."

        });

    }


    next();

} catch (error) {

    console.error(
        "Super Admin check error:",
        error
    );


    return res.status(500).json({

        success: false,

        status: false,

        message: "Unable to verify Super Admin access."

    });

}

};

router.use(requireSuperAdmin);

router.get(
"/",
controller.index
);

router.get(
"/data",
controller.data
);

router.get(
"/:id",
controller.getOne
);

module.exports = router;
