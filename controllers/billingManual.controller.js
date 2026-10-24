"use strict";

const path = require("path");
const db = require("../config/database");

function normalizeRole(role) {
    return String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
}

function isSuperAdmin(req) {
    return normalizeRole(req.session?.role) === "superadmin";
}

function superAdminOnly(req, res, next) {
    if (!req.session || !req.session.user_id) {
        return res.redirect("/");
    }

    if (!isSuperAdmin(req)) {
        return res.status(403).send(`
            <!doctype html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Access Denied</title>
            </head>
            <body style="
                font-family:Arial,sans-serif;
                background:#f8fafc;
                padding:40px;
                text-align:center;
            ">
                <div style="
                    max-width:500px;
                    margin:80px auto;
                    background:#fff;
                    padding:30px;
                    border-radius:14px;
                    box-shadow:0 8px 30px rgba(0,0,0,.08);
                ">
                    <h2 style="color:#dc3545;">
                        Access Denied
                    </h2>

                    <p>
                        Super Admin access is required.
                    </p>

                    <a
                        href="/dashboard"
                        style="
                            display:inline-block;
                            margin-top:15px;
                            padding:10px 18px;
                            background:#2563eb;
                            color:#fff;
                            text-decoration:none;
                            border-radius:8px;
                        "
                    >
                        Back to Dashboard
                    </a>
                </div>
            </body>
            </html>
        `);
    }

    next();
}


/*
|--------------------------------------------------------------------------
| MANUAL BILLING PAGE
|--------------------------------------------------------------------------
*/

function index(req, res) {

    return res.sendFile(
        path.join(
            __dirname,
            "..",
            "views",
            "billing-manual.html"
        )
    );
}


/*
|--------------------------------------------------------------------------
| MANUAL BILLING DATA
|--------------------------------------------------------------------------
|
| Legacy PHP equivalent:
|
| SELECT s.*,
| COALESCE(
|     u.name,
|     u.username,
|     CONCAT('User #',s.user_id)
| ) user_name
| FROM software_billing_notifications s
| LEFT JOIN users u ON u.id=s.user_id
| ORDER BY unpaid first, id DESC
|--------------------------------------------------------------------------
*/

async function list(req, res) {

    try {

        const [rows] = await db.execute(`
            SELECT
                s.*,

                COALESCE(
                    u.name,
                    u.username,
                    CONCAT('User #', s.user_id)
                ) AS user_name

            FROM software_billing_notifications s

            LEFT JOIN users u
                ON u.id = s.user_id

            ORDER BY
                CASE
                    WHEN s.status = 'unpaid'
                    THEN 0
                    ELSE 1
                END,
                s.id DESC
        `);

        return res.json({
            success: true,
            rows: rows
        });

    } catch (error) {

        console.error(
            "MANUAL BILLING LIST ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to load software billing records."
        });
    }
}


/*
|--------------------------------------------------------------------------
| MARK PAID PAGE
|--------------------------------------------------------------------------
*/

function markPaid(req, res) {

    return res.sendFile(
        path.join(
            __dirname,
            "..",
            "views",
            "billing-manual-confirm.html"
        )
    );
}


module.exports = {
    superAdminOnly,
    index,
    list,
    markPaid
};