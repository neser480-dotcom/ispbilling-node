
"use strict";

const db = require("../config/database");


function normalizeRole(role) {

    return String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");

}


const ADMIN_ROLES = [
    "superadmin",
    "admin",
    "companyadmin",
    "owner"
];


function isSuperAdmin(req) {

    return (
        normalizeRole(
            req.session?.role
        ) === "superadmin"
    );

}


function isAdmin(req) {

    return ADMIN_ROLES.includes(
        normalizeRole(
            req.session?.role
        )
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


    if (isAdmin(req)) {
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


    const companyId =
        Number(
            req.session.company_id ||
            req.session.companyId ||
            0
        );


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
                      AND company_id = ?
                      AND permission_key = ?
                    LIMIT 1
                `,
                [
                    userId,
                    companyId,
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


const LABEL_OVERRIDES = {
    olt: "OLT",
    sms: "SMS",
    ipn: "IPN",
    mikrotik: "MikroTik",
    pppoe: "PPPoE"
};


function permissionLabel(key) {

    return String(key || "")
        .split("_")
        .filter(Boolean)
        .map((w) =>
            LABEL_OVERRIDES[w.toLowerCase()] ||
            w.charAt(0).toUpperCase() + w.slice(1)
        )
        .join(" ");

}


function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

}


function wantsHtmlPage(req) {

    const accept =
        String(req.headers.accept || "");

    const mode =
        String(
            req.headers["sec-fetch-mode"] ||
            "navigate"
        );

    return (
        req.method === "GET" &&
        accept.includes("text/html") &&
        req.headers["x-requested-with"] !== "XMLHttpRequest" &&
        mode === "navigate"
    );

}


function deniedPage(label) {

    return `<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>অনুমতি নেই</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f6fb;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2937}
.box{background:#fff;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.08);padding:36px 32px;max-width:420px;width:calc(100% - 32px);text-align:center}
.icon{font-size:48px;line-height:1}
h1{font-size:20px;margin:14px 0 8px}
p{margin:6px 0;color:#4b5563;font-size:15px}
.key{display:inline-block;margin-top:10px;padding:4px 12px;border-radius:999px;background:#fee2e2;color:#b91c1c;font-size:13px;font-weight:600}
button{margin-top:22px;border:0;border-radius:8px;background:#2563eb;color:#fff;padding:10px 22px;font-size:15px;cursor:pointer}
button:hover{background:#1d4ed8}
</style>
</head>
<body>
<div class="box">
<div class="icon">&#128274;</div>
<h1>আপনার এই কাজের অনুমতি নেই</h1>
<p>এই পেইজ বা কাজ ব্যবহার করতে হলে অ্যাডমিনের কাছ থেকে অনুমতি নিতে হবে।</p>
<span class="key">প্রয়োজন: ${escapeHtml(label)}</span><br>
<button onclick="if(history.length>1){history.back()}else{location.href='/'}">পেছনে ফিরে যান</button>
</div>
</body>
</html>`;

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
                    "আপনি লগইন করা নেই। অনুগ্রহ করে আবার লগইন করুন।"

            });

        }


        const allowed =
            await hasPermission(
                req,
                permissionKey
            );


        if (!allowed) {

            const label =
                permissionLabel(
                    permissionKey
                );

            if (wantsHtmlPage(req)) {

                return res
                    .status(403)
                    .type("html")
                    .send(deniedPage(label));

            }

            return res.status(403).json({

                success: false,

                status: false,

                message:
                    `আপনার এই কাজের অনুমতি নেই। (প্রয়োজন: ${label})`,

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

    isSuperAdmin,

    isAdmin

};
