"use strict";

const express = require("express");
const router = express.Router();
const db = require("../../config/database");
const { requireAuth } = require("../../middleware/auth");

const SUPER_ADMIN_COMPANY_ID = 8;

async function requireSuperAdmin(req, res, next) {
    try {
        const userId = Number(req.session.user_id);
        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(401).json({ success: false, message: "Login required." });
        }

        const [users] = await db.query(
            "SELECT id, role, status, company_id FROM users WHERE id = ? LIMIT 1",
            [userId]
        );

        if (!users.length) {
            return res.status(403).json({ success: false, message: "User account not found." });
        }

        const user = users[0];
        const role = String(user.role || "").trim().toLowerCase();
        const status = String(user.status || "").trim().toLowerCase();

        if (role !== "super_admin" || status !== "active" ||
            Number(user.company_id) !== SUPER_ADMIN_COMPANY_ID) {
            return res.status(403).json({ success: false, message: "Super Admin access required." });
        }

        return next();
    } catch (error) {
        return next(error);
    }
}

router.use(requireAuth, requireSuperAdmin);

router.get("/", async (req, res, next) => {
    try {
        const [rows] = await db.query(
            `SELECT id, name, mobile, start_time, end_time, created_at
             FROM support_numbers
             WHERE company_id = ?
             ORDER BY id ASC`,
            [SUPER_ADMIN_COMPANY_ID]
        );
        return res.json({ success: true, data: rows });
    } catch (error) {
        return next(error);
    }
});

router.post("/", async (req, res, next) => {
    try {
        const name = String(req.body.name || "").trim();
        const mobile = String(req.body.mobile || "").trim();
        const startTime = String(req.body.start_time || "").trim();
        const endTime = String(req.body.end_time || "").trim();

        if (!name || !mobile || !startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: "Name, Mobile, Start Time এবং End Time আবশ্যক।"
            });
        }

        const [result] = await db.query(
            `INSERT INTO support_numbers
             (company_id, name, mobile, start_time, end_time)
             VALUES (?, ?, ?, ?, ?)`,
            [SUPER_ADMIN_COMPANY_ID, name, mobile, startTime, endTime]
        );

        return res.status(201).json({
            success: true,
            message: "Support number added.",
            id: result.insertId
        });
    } catch (error) {
        return next(error);
    }
});

router.put("/:id", async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const name = String(req.body.name || "").trim();
        const mobile = String(req.body.mobile || "").trim();
        const startTime = String(req.body.start_time || "").trim();
        const endTime = String(req.body.end_time || "").trim();

        if (!Number.isInteger(id) || id <= 0 || !name || !mobile || !startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: "Valid ID, Name, Mobile, Start Time এবং End Time আবশ্যক।"
            });
        }

        const [result] = await db.query(
            `UPDATE support_numbers
             SET name = ?, mobile = ?, start_time = ?, end_time = ?
             WHERE id = ? AND company_id = ?`,
            [name, mobile, startTime, endTime, id, SUPER_ADMIN_COMPANY_ID]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: "Support number not found." });
        }

        return res.json({ success: true, message: "Support number updated." });
    } catch (error) {
        return next(error);
    }
});

router.delete("/:id", async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, message: "Invalid support number ID." });
        }

        const [result] = await db.query(
            "DELETE FROM support_numbers WHERE id = ? AND company_id = ?",
            [id, SUPER_ADMIN_COMPANY_ID]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: "Support number not found." });
        }

        return res.json({ success: true, message: "Support number deleted." });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
