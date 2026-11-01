"use strict";

/*
|--------------------------------------------------------------------------
| NOTICE BOARD
|--------------------------------------------------------------------------
|
| File: routes/notices/notices.js
|
|   admin  -> /super-admin/notices   (Super Admin page + CRUD API)
|   active -> /api/notices           (live notices for company dashboards)
|
| Notice types
|   (invoice notices now come from the monthly bill, not from here)
|   maintenance  floats at the bottom of the screen (right-to-left ticker)
|
| A notice is shown only between starts_at and ends_at.
| When ends_at passes it disappears by itself.
|
*/

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const db = require("../../config/database");

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function normalizeRole(role) {
    return String(role || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function isSuperAdmin(req) {
    return normalizeRole(req.session?.role) === "superadmin";
}

function hasSession(req) {
    return Boolean(req.session && req.session.user_id);
}

function rowsOf(result) {
    return Array.isArray(result) && Array.isArray(result[0]) ? result[0] : [];
}

/* page guard (redirects) */
function pageGuard(req, res, next) {
    if (!hasSession(req)) return res.redirect("/");

    if (!isSuperAdmin(req)) {
        return res.status(403).send("Super Admin access is required.");
    }

    next();
}

/* api guard (json) */
function apiGuard(req, res, next) {
    if (!hasSession(req)) {
        return res.status(401).json({ success: false, message: "Not logged in." });
    }

    if (!isSuperAdmin(req)) {
        return res.status(403).json({ success: false, message: "Super Admin access is required." });
    }

    next();
}

function csrfGuard(req, res, next) {
    const sessionToken = String(req.session?.csrf_token || "");
    const posted = String(
        req.get("X-CSRF-Token") || req.body?.csrf_token || ""
    );

    const a = Buffer.from(sessionToken, "utf8");
    const b = Buffer.from(posted, "utf8");

    if (!sessionToken || !posted || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(419).json({ success: false, message: "Invalid CSRF token." });
    }

    next();
}

/* "2026-10-31T18:00" | "2026-10-31 18:00:00"  ->  "2026-10-31 18:00:00" */
function parseDateTime(value) {
    const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?$/.exec(String(value || "").trim());

    if (!m) return null;

    const text = `${m[1]} ${m[2]}${m[3] || ":00"}`;

    return Number.isNaN(new Date(text.replace(" ", "T")).getTime()) ? null : text;
}

function validate(body) {
    const type = String(body.notice_type || "").trim();
    const title = String(body.title || "").trim();
    const message = String(body.message || "").trim();
    const startsAt = parseDateTime(body.starts_at);
    const endsAt = parseDateTime(body.ends_at);
    const status = body.status === "inactive" ? "inactive" : "active";

    if (type !== "maintenance") {
        return { error: "Only maintenance notices can be created here." };
    }

    if (!title || title.length > 190) {
        return { error: "Title is required (max 190 characters)." };
    }

    if (!message || message.length > 3000) {
        return { error: "Message is required (max 3000 characters)." };
    }

    if (!startsAt || !endsAt) {
        return { error: "Start and end time are required." };
    }

    if (endsAt <= startsAt) {
        return { error: "End time must be after start time." };
    }

    let companyId = null;
    const rawCompany = String(body.company_id ?? "").trim();

    if (rawCompany !== "") {
        const n = Number(rawCompany);

        if (!Number.isInteger(n) || n <= 0) {
            return { error: "Company ID must be a positive number (or empty for all companies)." };
        }

        companyId = n;
    }

    return {
        values: { type, title, message, startsAt, endsAt, companyId, status }
    };
}

/*
|--------------------------------------------------------------------------
| SUPER ADMIN ROUTER  (mount: /super-admin/notices)
|--------------------------------------------------------------------------
*/

const admin = express.Router();

admin.get(["/", "/add"], pageGuard, (req, res) => {
    res.sendFile(
        path.join(__dirname, "..", "..", "views", "super-admin", "notices.html")
    );
});

admin.get("/api/list", apiGuard, async (req, res) => {
    try {
        const rows = rowsOf(await db.query(`
            SELECT
                id,
                notice_type,
                title,
                message,
                DATE_FORMAT(starts_at, '%Y-%m-%d %H:%i:%s') AS starts_at,
                DATE_FORMAT(ends_at,   '%Y-%m-%d %H:%i:%s') AS ends_at,
                company_id,
                status,
                CASE
                    WHEN status = 'inactive' THEN 'inactive'
                    WHEN NOW() < starts_at   THEN 'scheduled'
                    WHEN NOW() > ends_at     THEN 'expired'
                    ELSE 'live'
                END AS state
            FROM notices
            ORDER BY id DESC
        `));

        return res.json({ success: true, rows });
    } catch (error) {
        console.error("NOTICE LIST ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load notices. Did you create the notices table?"
        });
    }
});

admin.post("/api", apiGuard, csrfGuard, async (req, res) => {
    const { values, error } = validate(req.body || {});

    if (error) return res.status(400).json({ success: false, message: error });

    try {
        const [result] = await db.query(
            `INSERT INTO notices
                (notice_type, title, message, starts_at, ends_at, company_id, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                values.type, values.title, values.message, values.startsAt,
                values.endsAt, values.companyId, values.status, req.session.user_id
            ]
        );

        return res.status(201).json({
            success: true,
            message: "Notice created.",
            id: result.insertId
        });
    } catch (e) {
        console.error("NOTICE CREATE ERROR:", e);

        return res.status(500).json({ success: false, message: "Unable to create notice." });
    }
});

admin.put("/api/:id", apiGuard, csrfGuard, async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ success: false, message: "Invalid notice id." });
    }

    const { values, error } = validate(req.body || {});

    if (error) return res.status(400).json({ success: false, message: error });

    try {
        const [result] = await db.query(
            `UPDATE notices
                SET notice_type = ?, title = ?, message = ?, starts_at = ?,
                    ends_at = ?, company_id = ?, status = ?
              WHERE id = ?`,
            [
                values.type, values.title, values.message, values.startsAt,
                values.endsAt, values.companyId, values.status, id
            ]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: "Notice not found." });
        }

        return res.json({ success: true, message: "Notice updated." });
    } catch (e) {
        console.error("NOTICE UPDATE ERROR:", e);

        return res.status(500).json({ success: false, message: "Unable to update notice." });
    }
});

admin.delete("/api/:id", apiGuard, csrfGuard, async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ success: false, message: "Invalid notice id." });
    }

    try {
        const [result] = await db.query("DELETE FROM notices WHERE id = ?", [id]);

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: "Notice not found." });
        }

        return res.json({ success: true, message: "Notice deleted." });
    } catch (e) {
        console.error("NOTICE DELETE ERROR:", e);

        return res.status(500).json({ success: false, message: "Unable to delete notice." });
    }
});

/*
|--------------------------------------------------------------------------
| ACTIVE NOTICES  (mount: /api/notices)
|--------------------------------------------------------------------------
|
| Any logged-in user. A company user only receives notices for all
| companies or for his own company.
|
*/

const active = express.Router();

active.get("/active", async (req, res) => {
    if (!hasSession(req)) {
        return res.status(401).json({ success: false, message: "Not logged in." });
    }

    try {
        const companyId = Number(req.session.company_id || 0);

        const rows = rowsOf(await db.query(`
            SELECT
                id,
                notice_type,
                title,
                message,
                DATE_FORMAT(ends_at, '%Y-%m-%d %H:%i:%s') AS ends_at,
                TIMESTAMPDIFF(SECOND, NOW(), ends_at) AS remaining_seconds
            FROM notices
            WHERE status = 'active'
              AND NOW() BETWEEN starts_at AND ends_at
              AND (company_id IS NULL OR company_id = ?)
            ORDER BY ends_at ASC, id DESC
        `, [companyId]));

        return res.json({
            success: true,
            invoice: [],
            maintenance: rows.filter(r => r.notice_type === "maintenance")
        });
    } catch (error) {
        /* the dashboard must keep working even if the table is missing */
        console.warn("[Notices] active query skipped:", error.message);

        return res.json({ success: true, invoice: [], maintenance: [] });
    }
});

module.exports = { admin, active };
