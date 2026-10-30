
"use strict";

const express = require("express");
const router = express.Router();

const db = require("../../config/database");
const { requireAuth } = require("../../middleware/auth");

/*
|--------------------------------------------------------------------------
| GET SIDEBAR DATA
|--------------------------------------------------------------------------
| Returns registered company name and session user information.
|--------------------------------------------------------------------------
*/

router.get("/data", requireAuth, async (req, res) => {
    try {
        const userId = req.session.user_id || null;
        const companyId = Number(req.session.company_id || 0);
        const role = req.session.role || "staff";
        const fullname = req.session.fullname || "";
        const customerId = req.session.customer_id || null;

        let companyName = "";

        // Super admin-এর জন্য company name query প্রয়োজন নেই
        if (companyId > 0 && role !== "super_admin") {
            // প্রথমে settings টেবিল থেকে নাম খুঁজুন
            const [settingsRows] = await db.query(
                `SELECT company_name
                 FROM settings
                 WHERE company_id = ?
                   AND company_name IS NOT NULL
                   AND TRIM(company_name) <> ''
                 ORDER BY id ASC
                 LIMIT 1`,
                [companyId]
            );

            if (settingsRows.length > 0) {
                companyName = String(
                    settingsRows[0].company_name || ""
                ).trim();
            }

            // settings-এ নাম না থাকলে users টেবিল থেকে নিন
            if (!companyName) {
                const [userRows] = await db.query(
                    `SELECT company_name
                     FROM users
                     WHERE company_id = ?
                       AND company_name IS NOT NULL
                       AND TRIM(company_name) <> ''
                     ORDER BY
                         CASE WHEN role = 'admin' THEN 0 ELSE 1 END,
                         id ASC
                     LIMIT 1`,
                    [companyId]
                );

                if (userRows.length > 0) {
                    companyName = String(
                        userRows[0].company_name || ""
                    ).trim();
                }
            }
        }

        return res.json({
            success: true,
            user: {
                user_id: userId,
                customer_id: customerId,
                company_id: companyId || null,
                fullname: fullname,
                company_name: companyName,
                role: role
            }
        });

    } catch (error) {
        console.error("Sidebar API Error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load sidebar."
        });
    }
});

module.exports = router;
