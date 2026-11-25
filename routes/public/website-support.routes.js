"use strict";

const express = require("express");
const router = express.Router();
const db = require("../../config/database");

const SUPPORT_COMPANY_ID = 8;

router.get("/numbers", async (req, res, next) => {
    try {
        const [rows] = await db.query(
            `SELECT name, mobile, start_time, end_time
             FROM support_numbers
             WHERE company_id = ?
             ORDER BY id ASC`,
            [SUPPORT_COMPANY_ID]
        );

        res.set("Cache-Control", "public, max-age=60");
        return res.json({ success: true, data: rows });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
