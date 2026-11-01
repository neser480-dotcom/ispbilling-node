"use strict";

/*
| routes/software-billing/billingExtend.js
| mount: /super-admin/billing-extend   (Super Admin only)
|
| Extends the due date of one unpaid monthly bill (= one registered user).
| The original date is kept in original_due_date.
*/

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const db = require("../../config/database");

const router = express.Router();

const norm = r => String(r || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
const isSuper = req => norm(req.session?.role) === "superadmin";

function guard(req, res, next) {
    if (!req.session?.user_id) {
        return req.path.startsWith("/api")
            ? res.status(401).json({ success: false, message: "Not logged in." })
            : res.redirect("/");
    }
    if (!isSuper(req)) {
        return req.path.startsWith("/api")
            ? res.status(403).json({ success: false, message: "Super Admin access is required." })
            : res.status(403).send("Super Admin access is required.");
    }
    next();
}

function csrf(req, res, next) {
    const a = String(req.session?.csrf_token || "");
    const b = String(req.get("X-CSRF-Token") || "");
    if (!a || a.length !== b.length ||
        !crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))) {
        return res.status(403).json({ success: false, message: "Invalid CSRF token." });
    }
    next();
}

router.use(guard);

router.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "..", "views", "billing", "billing-extend.html"));
});

router.get("/api/list", async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT s.id, s.company_id, s.user_id, s.package_code, s.amount,
                   DATE_FORMAT(s.due_date, '%Y-%m-%d %H:%i') AS due_date,
                   DATE_FORMAT(s.original_due_date, '%Y-%m-%d %H:%i') AS original_due_date,
                   DATE_FORMAT(s.extended_at, '%Y-%m-%d %H:%i') AS extended_at,
                   (s.due_date < ?) AS overdue,
                   COALESCE(u.company_name, u.fullname, u.name, u.username,
                            CONCAT('User #', s.user_id)) AS user_name,
                   u.username
            FROM software_billing_notifications s
            LEFT JOIN users u ON u.id = s.user_id
            WHERE s.status = 'unpaid' AND s.billing_type = 'monthly'
            ORDER BY s.due_date ASC, s.id DESC
        `, [new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ")]);
        res.json({ success: true, rows });
    } catch (e) {
        console.error("BILLING EXTEND LIST ERROR:", e);
        res.status(500).json({ success: false, message: "Unable to load bills." });
    }
});

/* strict "YYYY-MM-DDTHH:mm" (or with space / seconds); real calendar date */
const BD_OFFSET_MS = 6 * 60 * 60 * 1000;

function parseDue(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?$/.exec(String(value || "").trim());
    if (!m) return null;

    const [y, mo, d, h, mi] = m.slice(1).map(Number);
    /* the admin types Bangladesh time (UTC+6) */
    const t = new Date(Date.UTC(y, mo - 1, d, h, mi, 0) - BD_OFFSET_MS);
    const chk = new Date(t.getTime() + BD_OFFSET_MS);

    if (
        chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d ||
        chk.getUTCHours() !== h || chk.getUTCMinutes() !== mi
    ) return null;

    if (y < 2020 || y > 2100) return null;

    return { text: `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:00`, date: t };
}

const MAX_EXTEND_DAYS = 90;

router.post("/api", csrf, async (req, res) => {
    const id = Number(req.body?.billing_id);
    const parsed = parseDue(req.body?.due_date);

    if (!Number.isInteger(id) || id <= 0 || !parsed) {
        return res.status(400).json({ success: false, message: "Invalid bill or date." });
    }

    if (parsed.date.getTime() <= Date.now()) {
        return res.status(400).json({ success: false, message: "The new date must be in the future." });
    }

    if (parsed.date.getTime() > Date.now() + MAX_EXTEND_DAYS * 24 * 3600 * 1000) {
        return res.status(400).json({ success: false, message: `Maximum ${MAX_EXTEND_DAYS} days from today.` });
    }

    let conn = null;

    try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        const [rows] = await conn.execute(
            `SELECT id, company_id, user_id FROM software_billing_notifications
             WHERE id = ? AND status = 'unpaid' AND billing_type = 'monthly'
             LIMIT 1 FOR UPDATE`,
            [id]
        );

        if (!rows.length) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: "Bill not found or already paid." });
        }

        const nowBd = new Date(Date.now() + BD_OFFSET_MS).toISOString().slice(0, 19).replace("T", " ");

        await conn.execute(
            `UPDATE software_billing_notifications
             SET original_due_date = COALESCE(original_due_date, due_date),
                 due_date = ?, extended_by = ?, extended_at = ?, updated_at = ?
             WHERE id = ?`,
            [parsed.text, Number(req.session.user_id), nowBd, nowBd, id]
        );

        /* keep the linked invoice in step */
        await conn.execute(
            `UPDATE invoices SET due_date = ?
             WHERE billing_id = ? AND company_id = ? AND user_id = ? AND status = 'unpaid'`,
            [parsed.text, id, rows[0].company_id, rows[0].user_id]
        );

        await conn.commit();
        res.json({ success: true, message: "Due date extended." });
    } catch (e) {
        if (conn) { try { await conn.rollback(); } catch (_) {} }
        console.error("BILLING EXTEND ERROR:", e);
        res.status(500).json({ success: false, message: "Unable to extend due date." });
    } finally {
        if (conn) conn.release();
    }
});

module.exports = router;
