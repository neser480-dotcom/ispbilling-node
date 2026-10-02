
"use strict";

const db = require("../config/database");


function normalizeRole(role) {

    return String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");

}


function isSuperAdmin(req) {

    return (
        normalizeRole(
            req.session?.role
        ) === "superadmin"
    );

}


async function hasPermission(
    req,
    permissionKey
) {

    if (
        !req.session ||
        !req.session.user_id
    ) {
        return false;
    }


    if (isSuperAdmin(req)) {
        return true;
    }


    const userId =
        Number(req.session.user_id);


    if (
        !Number.isInteger(userId) ||
        userId <= 0
    ) {
        return false;
    }


    const key =
        String(
            permissionKey || ""
        ).trim();


    if (!key) {
        return false;
    }


    try {

        const [rows] =
            await db.query(
                `
                    SELECT
                        allowed
                    FROM user_permissions
                    WHERE user_id = ?
                      AND permission_key = ?
                    LIMIT 1
                `,
                [
                    userId,
                    key
                ]
            );


        if (!rows.length) {
            return false;
        }


        return (
            Number(
                rows[0].allowed
            ) === 1
        );


    } catch (error) {

        console.error(
            "[Permission] Check failed:",
            error
        );

        return false;
    }

}


function requirePermission(
    permissionKey
) {

    return async (
        req,
        res,
        next
    ) => {

        if (
            !req.session ||
            !req.session.user_id
        ) {

            return res.status(401).json({

                success: false,

                status: false,

                message:
                    "Authentication required."

            });

        }


        const allowed =
            await hasPermission(
                req,
                permissionKey
            );


        if (!allowed) {

            return res.status(403).json({

                success: false,

                status: false,

                message:
                    "You do not have permission to perform this action.",

                permission:
                    permissionKey

            });

        }


        next();

    };

}


module.exports = {

    hasPermission,

    requirePermission,

    isSuperAdmin

};
