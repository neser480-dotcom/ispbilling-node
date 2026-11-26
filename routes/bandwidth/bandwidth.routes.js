"use strict";

const express = require("express");
const router = express.Router();
const db = require("../../config/database");

function requireAuth(req, res, next) {
    if (!req.session || !req.session.user_id) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized. Please log in."
        });
    }
    return next();
}

function getCompanyId(req) {
    return Number(req.session.company_id || req.session.user_id);
}

function parseJsonSafe(val, fallback) {
    if (!val) return fallback;
    if (typeof val === "object") return val;
    try {
        return JSON.parse(val);
    } catch (_) {
        return fallback;
    }
}

router.use(requireAuth);

/*
|--------------------------------------------------------------------------
| BANDWIDTH ITEMS (/api/bandwidth/items)
|--------------------------------------------------------------------------
*/
router.get("/items", async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const search = String(req.query.search || "").trim();

        let sql = `
            SELECT id, company_id, name, category, unit_rate, unit, status, created_at
            FROM bandwidth_items
            WHERE company_id = ?
        `;
        const params = [companyId];

        if (search) {
            sql += ` AND (name LIKE ? OR category LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        sql += ` ORDER BY id DESC`;

        const [rows] = await db.query(sql, params);
        return res.json({ success: true, data: rows });
    } catch (err) {
        console.error("GET /api/bandwidth/items error:", err);
        return res.status(500).json({ success: false, message: "Failed to load bandwidth items." });
    }
});

router.post("/items", async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const name = String(req.body.name || "").trim();
        const category = String(req.body.category || "General").trim();
        const unitRate = Number(req.body.unit_rate ?? req.body.rate ?? 0);
        const unit = String(req.body.unit || "Mbps").trim();
        const status = req.body.status === "inactive" ? "inactive" : "active";

        if (!name) {
            return res.status(400).json({ success: false, message: "Bandwidth name is required." });
        }

        const [duplicates] = await db.query(
            `SELECT id FROM bandwidth_items WHERE company_id = ?
             AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`,
            [companyId, name]
        );
        if (duplicates.length) return res.status(409).json({ success: false, message: "এই ISP অ্যাকাউন্টে এই Bandwidth নাম আগে থেকেই আছে।" });

        const [result] = await db.query(
            `INSERT INTO bandwidth_items (company_id, name, category, unit_rate, unit, status)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [companyId, name, category, unitRate, unit, status]
        );

        return res.status(201).json({
            success: true,
            message: "Bandwidth item created.",
            id: result.insertId
        });
    } catch (err) {
        if (err && err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ success: false, message: "Bandwidth name already exists." });
        }
        console.error("POST /api/bandwidth/items error:", err);
        return res.status(500).json({ success: false, message: "Failed to create bandwidth item." });
    }
});

router.put("/items/:id", async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const id = Number(req.params.id);
        const name = String(req.body.name || "").trim();
        const category = String(req.body.category || "General").trim();
        const unitRate = Number(req.body.unit_rate ?? req.body.rate ?? 0);
        const unit = String(req.body.unit || "Mbps").trim();
        const status = req.body.status === "inactive" ? "inactive" : "active";

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, message: "Invalid ID." });
        }

        if (!name) {
            return res.status(400).json({ success: false, message: "Bandwidth name is required." });
        }

        const [duplicates] = await db.query(
            `SELECT id FROM bandwidth_items WHERE company_id = ? AND id <> ?
             AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`,
            [companyId, id, name]
        );
        if (duplicates.length) return res.status(409).json({ success: false, message: "এই ISP অ্যাকাউন্টে এই Bandwidth নাম আগে থেকেই আছে।" });

        const [result] = await db.query(
            `UPDATE bandwidth_items
             SET name = ?, category = ?, unit_rate = ?, unit = ?, status = ?
             WHERE id = ? AND company_id = ?`,
            [name, category, unitRate, unit, status, id, companyId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Item not found." });
        }

        return res.json({ success: true, message: "Bandwidth item updated." });
    } catch (err) {
        if (err && err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ success: false, message: "Bandwidth name already exists." });
        }
        console.error("PUT /api/bandwidth/items/:id error:", err);
        return res.status(500).json({ success: false, message: "Failed to update bandwidth item." });
    }
});

router.delete("/items/:id", async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, message: "Invalid ID." });
        }

        const [result] = await db.query(
            `DELETE FROM bandwidth_items WHERE id = ? AND company_id = ?`,
            [id, companyId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Item not found." });
        }

        return res.json({ success: true, message: "Bandwidth item deleted." });
    } catch (err) {
        if (err && err.errno === 1451) {
            return res.status(400).json({
                success: false,
                message: "Cannot delete bandwidth item assigned to resellers."
            });
        }
        console.error("DELETE /api/bandwidth/items/:id error:", err);
        return res.status(500).json({ success: false, message: "Failed to delete bandwidth item." });
    }
});

/*
|--------------------------------------------------------------------------
| BANDWIDTH RESELLERS (/api/bandwidth/resellers)
|--------------------------------------------------------------------------
*/
router.get("/resellers", async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const search = String(req.query.search || "").trim();

        let sql = `
            SELECT
                r.id, r.company_id, r.bandwidth_id, r.reseller_name, r.phone,
                r.nid_no, r.address, r.email,
                r.allocated_mbps, r.rate_per_mbps, r.monthly_bill, r.due_amount,
                r.status, r.nttn_info, r.scr_or_link_id, r.activation_date,
                r.vlans_json, r.ips_json, r.created_at,
                b.name AS bandwidth_name, b.unit
            FROM bandwidth_resellers r
            LEFT JOIN bandwidth_items b ON b.id = r.bandwidth_id
            WHERE r.company_id = ?
        `;
        const params = [companyId];

        if (search) {
            sql += ` AND (r.reseller_name LIKE ? OR r.phone LIKE ? OR r.address LIKE ? OR r.email LIKE ? OR b.name LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        sql += ` ORDER BY r.id DESC`;

        const [rows] = await db.query(sql, params);
        const formatted = rows.map((r) => ({
            ...r,
            vlans: parseJsonSafe(r.vlans_json, []),
            ip_addresses: parseJsonSafe(r.ips_json, [])
        }));

        return res.json({ success: true, data: formatted });
    } catch (err) {
        console.error("GET /api/bandwidth/resellers error:", err);
        return res.status(500).json({ success: false, message: "Failed to load resellers." });
    }
});

router.post("/resellers", async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const rawBandwidthId = req.body.bandwidth_id;
        const bandwidthId =
            rawBandwidthId !== undefined && rawBandwidthId !== null && rawBandwidthId !== ""
                ? Number(rawBandwidthId)
                : null;

        const resellerName = String(req.body.reseller_name || req.body.name || "").trim();
        const phone = String(req.body.phone || req.body.mobile || "").trim() || null;
        const nidNo = String(req.body.nid_no || "").trim() || null;
        const address = String(req.body.address || "").trim() || null;
        const email = String(req.body.email || "").trim() || null;

        const allocatedMbps = Number(req.body.allocated_mbps || 0);
        const ratePerMbps = Number(req.body.rate_per_mbps || 0);
        const monthlyBill = Number((allocatedMbps * ratePerMbps).toFixed(2));
        const dueAmount = Number(req.body.due_amount ?? 0);

        const rawStatus = String(req.body.status || "active").toLowerCase();
        const status = rawStatus === "inactive" || rawStatus === "suspended" ? "suspended" : "active";

        const nttnInfo = String(req.body.nttn_info || "").trim() || null;
        const scrOrLinkId = String(req.body.scr_or_link_id || "").trim() || null;
        const activationDateRaw = String(req.body.activation_date || "").trim();
        const activationDate = activationDateRaw ? activationDateRaw.replace("T", " ") : null;

        const vlans = Array.isArray(req.body.vlans) ? req.body.vlans : [];
        const ipAddresses = Array.isArray(req.body.ip_addresses) ? req.body.ip_addresses : [];

        if (!resellerName) {
            return res.status(400).json({
                success: false,
                message: "Reseller name is required."
            });
        }

        if (bandwidthId !== null) {
            if (!Number.isInteger(bandwidthId) || bandwidthId <= 0) {
                return res.status(400).json({ success: false, message: "Invalid bandwidth item ID." });
            }
            const [bwRows] = await db.query(
                `SELECT id FROM bandwidth_items WHERE id = ? AND company_id = ?`,
                [bandwidthId, companyId]
            );
            if (!bwRows.length) {
                return res.status(404).json({ success: false, message: "Selected bandwidth item not found." });
            }
        }

        const [duplicates] = await db.query(
            `SELECT id, reseller_name, phone FROM bandwidth_resellers
             WHERE company_id = ?
               AND (LOWER(TRIM(reseller_name)) = LOWER(TRIM(?))
                    OR (? IS NOT NULL AND TRIM(phone) = TRIM(?)))
             LIMIT 10`,
            [companyId, resellerName, phone, phone]
        );
        if (duplicates.some(row => String(row.reseller_name || "").trim().toLowerCase() === resellerName.toLowerCase())) {
            return res.status(409).json({ success: false, message: "এই ISP অ্যাকাউন্টে এই Bandwidth reseller নাম আগে থেকেই আছে।" });
        }
        if (phone && duplicates.some(row => String(row.phone || "").trim() === phone)) {
            return res.status(409).json({ success: false, message: "এই ISP অ্যাকাউন্টে এই ফোন নম্বরের Bandwidth reseller আগে থেকেই আছে।" });
        }

        const [result] = await db.query(
            `INSERT INTO bandwidth_resellers
             (
                company_id, bandwidth_id, reseller_name, phone, nid_no, address, email,
                allocated_mbps, rate_per_mbps, monthly_bill, due_amount, status,
                nttn_info, scr_or_link_id, activation_date, vlans_json, ips_json
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                companyId,
                bandwidthId,
                resellerName,
                phone,
                nidNo,
                address,
                email,
                allocatedMbps,
                ratePerMbps,
                monthlyBill,
                dueAmount,
                status,
                nttnInfo,
                scrOrLinkId,
                activationDate,
                JSON.stringify(vlans),
                JSON.stringify(ipAddresses)
            ]
        );

        return res.status(201).json({
            success: true,
            message: "Bandwidth reseller added.",
            id: result.insertId
        });
    } catch (err) {
        console.error("POST /api/bandwidth/resellers error:", err);
        return res.status(500).json({ success: false, message: "Failed to add reseller." });
    }
});

router.delete("/resellers/:id", async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, message: "Invalid ID." });
        }

        const [result] = await db.query(
            `DELETE FROM bandwidth_resellers WHERE id = ? AND company_id = ?`,
            [id, companyId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Reseller not found." });
        }

        return res.json({ success: true, message: "Reseller removed." });
    } catch (err) {
        if (err && err.errno === 1451) {
            return res.status(400).json({
                success: false,
                message: "Cannot delete reseller with existing collection records."
            });
        }
        console.error("DELETE /api/bandwidth/resellers/:id error:", err);
        return res.status(500).json({ success: false, message: "Failed to delete reseller." });
    }
});

/*
|--------------------------------------------------------------------------
| BANDWIDTH COLLECTIONS (/api/bandwidth/collections)
|--------------------------------------------------------------------------
*/
router.get("/collections", async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const resellerId = Number(req.query.reseller_id || 0);
        const search = String(req.query.search || "").trim();

        let sql = `
            SELECT
                c.id, c.company_id, c.reseller_id, c.amount, c.payment_method,
                c.reference_no, c.note, c.collected_at,
                r.reseller_name, b.name AS bandwidth_name
            FROM bandwidth_collections c
            INNER JOIN bandwidth_resellers r ON r.id = c.reseller_id
            LEFT JOIN bandwidth_items b ON b.id = r.bandwidth_id
            WHERE c.company_id = ?
        `;
        const params = [companyId];

        if (Number.isInteger(resellerId) && resellerId > 0) {
            sql += ` AND c.reseller_id = ?`;
            params.push(resellerId);
        }

        if (search) {
            sql += ` AND (r.reseller_name LIKE ? OR c.reference_no LIKE ? OR c.payment_method LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        sql += ` ORDER BY c.collected_at DESC, c.id DESC`;

        const [rows] = await db.query(sql, params);
        return res.json({ success: true, data: rows });
    } catch (err) {
        console.error("GET /api/bandwidth/collections error:", err);
        return res.status(500).json({ success: false, message: "Failed to load collections." });
    }
});

router.post("/collections", async (req, res) => {
    const conn = await db.getConnection();
    try {
        const companyId = getCompanyId(req);
        const userId = Number(req.session.user_id);
        const resellerId = Number(req.body.reseller_id);
        const amount = Number(req.body.amount || 0);
        const paymentMethod = String(req.body.payment_method || "Cash").trim();
        const referenceNo = String(req.body.reference_no || "").trim() || null;
        const note = String(req.body.note || "").trim() || null;

        if (!Number.isInteger(resellerId) || resellerId <= 0 || !(amount > 0)) {
            conn.release();
            return res.status(400).json({
                success: false,
                message: "Valid reseller and positive collection amount are required."
            });
        }

        await conn.beginTransaction();

        const [resellerRows] = await conn.query(
            `SELECT id, due_amount FROM bandwidth_resellers WHERE id = ? AND company_id = ? FOR UPDATE`,
            [resellerId, companyId]
        );

        if (!resellerRows.length) {
            await conn.rollback();
            conn.release();
            return res.status(404).json({ success: false, message: "Reseller not found." });
        }

        const [insertRes] = await conn.query(
            `INSERT INTO bandwidth_collections
             (company_id, reseller_id, amount, payment_method, reference_no, collected_by, note)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [companyId, resellerId, amount, paymentMethod, referenceNo, userId, note]
        );

        await conn.query(
            `UPDATE bandwidth_resellers
             SET due_amount = GREATEST(0, due_amount - ?)
             WHERE id = ? AND company_id = ?`,
            [amount, resellerId, companyId]
        );

        await conn.commit();
        conn.release();

        return res.status(201).json({
            success: true,
            message: "Collection recorded.",
            id: insertRes.insertId
        });
    } catch (err) {
        try { await conn.rollback(); } catch (_) {}
        conn.release();
        console.error("POST /api/bandwidth/collections error:", err);
        return res.status(500).json({ success: false, message: "Failed to record collection." });
    }
});

module.exports = router;