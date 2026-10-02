"use strict";

const db = require("../../config/database");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function clean(value) {
    return String(value ?? "").trim();
}


function isSuperAdmin(req) {
    return (
        String(req.session?.role || "")
            .trim()
            .toLowerCase()
            .replace(/[\s_-]+/g, "") ===
        "superadmin"
    );
}


function currentUserId(req) {
    return Number(req.session?.user_id || 0);
}


/*
|--------------------------------------------------------------------------
| CSRF
|--------------------------------------------------------------------------
| Create a session CSRF token if it does not exist.
|--------------------------------------------------------------------------
*/

function getCsrfToken(req) {

    if (!req.session) {
        return "";
    }

    if (
        !req.session.csrf_token ||
        typeof req.session.csrf_token !== "string" ||
        req.session.csrf_token.length < 32
    ) {
        req.session.csrf_token =
            crypto.randomBytes(32).toString("hex");
    }

    return req.session.csrf_token;
}


function checkCsrf(req) {

    const token =
        clean(req.body?.csrf_token);

    const sessionToken =
        getCsrfToken(req);

    if (!token || !sessionToken) {
        return false;
    }

    return crypto.timingSafeEqual(
        Buffer.from(token),
        Buffer.from(sessionToken)
    );
}


/*
|--------------------------------------------------------------------------
| PROFILE UPDATE
|--------------------------------------------------------------------------
*/

exports.update = async (req, res) => {

    try {

        /*
        |--------------------------------------------------------------------------
        | AUTH
        |--------------------------------------------------------------------------
        */

        if (!req.session?.user_id) {

            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | CSRF
        |--------------------------------------------------------------------------
        */

        if (!checkCsrf(req)) {

            return res.status(403).json({
                success: false,
                message: "Invalid CSRF token."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | USER ID
        |--------------------------------------------------------------------------
        */

        const currentId =
            currentUserId(req);

        let targetId =
            Number(
                req.body?.user_id ||
                currentId
            );


        if (
            !Number.isInteger(targetId) ||
            targetId <= 0
        ) {

            return res.status(400).json({
                success: false,
                message: "Invalid user ID."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | LOAD TARGET USER
        |--------------------------------------------------------------------------
        */

        const [targetRows] =
            await db.query(
                `
                SELECT
                    id,
                    company_id,
                    role
                FROM users
                WHERE id = ?
                LIMIT 1
                `,
                [targetId]
            );


        const target =
            targetRows[0];


        if (!target) {

            return res.status(404).json({
                success: false,
                message: "User not found."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | AUTHORIZATION
        |--------------------------------------------------------------------------
        */

        if (
            targetId !== currentId &&
            !isSuperAdmin(req)
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "You cannot edit this profile."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | COMPANY ISOLATION
        |--------------------------------------------------------------------------
        */

        if (!isSuperAdmin(req)) {

            const currentCompany =
                Number(
                    req.session?.company_id || 0
                );


            if (
                currentCompany <= 0 ||
                Number(target.company_id || 0) !==
                    currentCompany
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Company access denied."
                });

            }

        }


        /*
        |--------------------------------------------------------------------------
        | INPUT
        |--------------------------------------------------------------------------
        */

        const name =
            clean(req.body?.name);

        const company =
            clean(req.body?.company);

        const email =
            clean(req.body?.email);

        const mobile =
            clean(req.body?.mobile);

        const address =
            clean(req.body?.address);


        /*
        |--------------------------------------------------------------------------
        | VALIDATION
        |--------------------------------------------------------------------------
        */

        if (!name) {

            return res.status(422).json({
                success: false,
                message: "Name is required."
            });

        }


        if (
            email &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {

            return res.status(422).json({
                success: false,
                message: "Invalid email address."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | UPDATE USER
        |--------------------------------------------------------------------------
        */

        await db.query(
            `
            UPDATE users
            SET
                name = ?,
                fullname = ?,
                company_name = ?,
                email = ?,
                mobile = ?,
                phone = ?,
                address = ?
            WHERE id = ?
            `,
            [
                name,
                name,
                company,
                email || null,
                mobile || null,
                mobile || null,
                address || null,
                targetId
            ]
        );


        /*
        |--------------------------------------------------------------------------
        | RESPONSE
        |--------------------------------------------------------------------------
        */

        return res.json({
            success: true,
            message:
                "Profile updated successfully.",
            csrf_token:
                getCsrfToken(req)
        });

    } catch (error) {

        console.error(
            "[Admin Profile] update:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to update profile."
        });

    }

};


/*
|--------------------------------------------------------------------------
| PASSWORD UPDATE
|--------------------------------------------------------------------------
*/

exports.password = async (req, res) => {

    try {

        /*
        |--------------------------------------------------------------------------
        | AUTH
        |--------------------------------------------------------------------------
        */

        if (!req.session?.user_id) {

            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | CSRF
        |--------------------------------------------------------------------------
        */

        if (!checkCsrf(req)) {

            return res.status(403).json({
                success: false,
                message: "Invalid CSRF token."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | USER
        |--------------------------------------------------------------------------
        */

        const userId =
            currentUserId(req);


        if (
            !Number.isInteger(userId) ||
            userId <= 0
        ) {

            return res.status(401).json({
                success: false,
                message: "Invalid session user."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | PASSWORD INPUT
        |--------------------------------------------------------------------------
        */

        const oldPassword =
            String(
                req.body?.old_password || ""
            );

        const newPassword =
            String(
                req.body?.new_password || ""
            );

        const confirmPassword =
            String(
                req.body?.confirm_password || ""
            );


        /*
        |--------------------------------------------------------------------------
        | VALIDATION
        |--------------------------------------------------------------------------
        */

        if (
            !oldPassword ||
            !newPassword ||
            !confirmPassword
        ) {

            return res.status(422).json({
                success: false,
                message:
                    "All password fields are required."
            });

        }


        if (newPassword.length < 8) {

            return res.status(422).json({
                success: false,
                message:
                    "New password must contain at least 8 characters."
            });

        }


        if (newPassword !== confirmPassword) {

            return res.status(422).json({
                success: false,
                message:
                    "New passwords do not match."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | LOAD CURRENT PASSWORD
        |--------------------------------------------------------------------------
        */

        const [rows] =
            await db.query(
                `
                SELECT
                    password
                FROM users
                WHERE id = ?
                LIMIT 1
                `,
                [userId]
            );


        if (!rows.length) {

            return res.status(404).json({
                success: false,
                message: "User not found."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | CHECK OLD PASSWORD
        |--------------------------------------------------------------------------
        */

        const valid =
            await bcrypt.compare(
                oldPassword,
                rows[0].password || ""
            );


        if (!valid) {

            return res.status(422).json({
                success: false,
                message:
                    "Old password is incorrect."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | HASH NEW PASSWORD
        |--------------------------------------------------------------------------
        */

        const hash =
            await bcrypt.hash(
                newPassword,
                12
            );


        /*
        |--------------------------------------------------------------------------
        | UPDATE PASSWORD
        |--------------------------------------------------------------------------
        */

        await db.query(
            `
            UPDATE users
            SET password = ?
            WHERE id = ?
            `,
            [
                hash,
                userId
            ]
        );


        /*
        |--------------------------------------------------------------------------
        | RESPONSE
        |--------------------------------------------------------------------------
        */

        return res.json({
            success: true,
            message:
                "Password updated successfully.",
            csrf_token:
                getCsrfToken(req)
        });

    } catch (error) {

        console.error(
            "[Admin Profile] password:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to update password."
        });

    }

};