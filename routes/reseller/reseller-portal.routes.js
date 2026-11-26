"use strict";

const express = require("express");
const router = express.Router();
const db = require("../../config/database");
function parseJsonSafe(val, fallback) {
    if (!val) return fallback;
    if (typeof val === "object") return val;
    try {
        return JSON.parse(val);
    } catch (_) {
        return fallback;
    }
}

router.get("/resellers", async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const search = String(req.query.search || "").trim();

        let sql = `
            SELECT
                id, company_id, name, mobile, nid_no, address, email, website,
                status, balance, commission_type, areas_json, packages_json, permissions_json,
                created_at
            FROM resellers
            WHERE company_id = ?
        `;
        const params = [companyId];

        if (search) {
            sql += ` AND (name LIKE ? OR mobile LIKE ? OR email LIKE ? OR address LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        sql += ` ORDER BY id DESC`;

        const [rows] = await db.query(sql, params);
        const formatted = rows.map((r) => ({
            ...r,
            areas: parseJsonSafe(r.areas_json, []),
            packages: parseJsonSafe(r.packages_json, []),
            permissions: parseJsonSafe(r.permissions_json, [])
        }));

        const totalBalance = formatted.reduce((sum, r) => sum + Number(r.balance || 0), 0);

        return res.json({
            success: true,
            data: formatted,
            summary: {
                total_resellers: formatted.length,
                total_customers: 0,
                total_balance: Number(totalBalance.toFixed(2))
            }
        });
    } catch (err) {
        console.error("GET /api/reseller-portal/resellers error:", err);
        return res.status(500).json({ success: false, message: "Failed to load resellers." });
    }
});

router.post("/resellers", async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const name = String(req.body.name || "").trim();
        const mobile = String(req.body.mobile || "").trim();
        const nidNo = String(req.body.nid_no || "").trim();
        const address = String(req.body.address || "").trim();
        const email = String(req.body.email || "").trim();
        const website = String(req.body.website || "").trim() || null;
        const status = String(req.body.status || "active").toLowerCase() === "inactive" ? "inactive" : "active";
        const commissionType = String(req.body.commission_type || "global").toLowerCase() === "package" ? "package" : "global";

        const areas = Array.isArray(req.body.areas) ? req.body.areas : [];
        const packages = Array.isArray(req.body.packages) ? req.body.packages : [];
        const permissions = Array.isArray(req.body.permissions) ? req.body.permissions : [];

        if (!name || !mobile || !nidNo || !address || !email) {
            return res.status(400).json({
                success: false,
                message: "Name, Mobile, NID No, Address, and E-mail are required."
            });
        }

        const [result] = await db.query(
            `INSERT INTO resellers
             (
                company_id, name, mobile, nid_no, address, email, website,
                status, commission_type, areas_json, packages_json, permissions_json
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                companyId, name, mobile, nidNo, address, email, website,
                status, commissionType,
                JSON.stringify(areas), JSON.stringify(packages), JSON.stringify(permissions)
            ]
        );

        return res.status(201).json({
            success: true,
            message: "Reseller created successfully.",
            id: result.insertId
        });
    } catch (err) {
        console.error("POST /api/reseller-portal/resellers error:", err);
        return res.status(500).json({ success: false, message: "Failed to create reseller." });
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
            `DELETE FROM resellers WHERE id = ? AND company_id = ?`,
            [id, companyId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Reseller not found." });
        }

        return res.json({ success: true, message: "Reseller deleted." });
    } catch (err) {
        console.error("DELETE /api/reseller-portal/resellers/:id error:", err);
        return res.status(500).json({ success: false, message: "Failed to delete reseller." });
    }
});
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

router.use(requireAuth);

/*
|--------------------------------------------------------------------------
| RECHARGE HISTORY (/api/reseller-portal/recharges)
|--------------------------------------------------------------------------
*/
router.get("/recharges", async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const search = String(req.query.search || "").trim();
        const status = String(req.query.status || "").trim().toLowerCase();

        let sql = `
            SELECT id, company_id, reseller_id, reseller_name, amount, medium, status, comment, created_at
            FROM reseller_recharges
            WHERE company_id = ?
        `;
        const params = [companyId];

        if (["paid", "unpaid", "pending", "rejected"].includes(status)) {
            sql += ` AND status = ?`;
            params.push(status);
        }

        if (search) {
            sql += ` AND (reseller_name LIKE ? OR medium LIKE ? OR status LIKE ? OR comment LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        sql += ` ORDER BY id DESC`;

        const [rows] = await db.query(sql, params);

        const [summaryRows] = await db.query(
            `SELECT
                COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS paid_total,
                COALESCE(SUM(CASE WHEN status IN ('unpaid', 'pending') THEN amount ELSE 0 END), 0) AS unpaid_total
             FROM reseller_recharges
             WHERE company_id = ?`,
            [companyId]
        );

        return res.json({
            success: true,
            data: rows,
            summary: {
                paid_total: Number(summaryRows[0]?.paid_total || 0),
                unpaid_total: Number(summaryRows[0]?.unpaid_total || 0)
            }
        });
    } catch (err) {
        console.error("GET /api/reseller-portal/recharges error:", err);
        return res.status(500).json({ success: false, message: "Failed to load recharge history." });
    }
});

router.patch("/recharges/:id/status", async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const userId = Number(req.session.user_id);
        const id = Number(req.params.id);
        const nextStatus = String(req.body.status || "").trim().toLowerCase();

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, message: "Invalid ID." });
        }

        if (!["paid", "unpaid", "pending", "rejected"].includes(nextStatus)) {
            return res.status(400).json({ success: false, message: "Invalid status." });
        }

        const [result] = await db.query(
            `UPDATE reseller_recharges
             SET status = ?, processed_by = ?
             WHERE id = ? AND company_id = ?`,
            [nextStatus, userId, id, companyId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Recharge record not found." });
        }

        return res.json({ success: true, message: "Recharge status updated." });
    } catch (err) {
        console.error("PATCH /api/reseller-portal/recharges/:id/status error:", err);
        return res.status(500).json({ success: false, message: "Failed to update status." });
    }
});
router.get("/options", async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        let areas = [];
        let routers = [];
        let packages = [];

        try {
            const [areaRows] = await db.query(
                `SELECT id, name, parent_id FROM areas WHERE company_id = ? ORDER BY id ASC`,
                [companyId]
            );
            areas = areaRows;
        } catch (_) {
            try {
                const [areaRows] = await db.query(`SELECT id, name FROM areas ORDER BY id ASC`);
                areas = areaRows;
            } catch (__) {}
        }

        try {
            const [routerRows] = await db.query(
                `SELECT id, name, identity FROM mikrotik_routers WHERE company_id = ? ORDER BY id ASC`,
                [companyId]
            );
            routers = routerRows;
        } catch (_) {}

        try {
            const [pkgRows] = await db.query(
                `SELECT id, name, price, router_id FROM packages WHERE company_id = ? ORDER BY id ASC`,
                [companyId]
            );
            packages = pkgRows;
        } catch (_) {}

        return res.json({
            success: true,
            data: { areas, routers, packages }
        });
    } catch (err) {
        console.error("GET /api/reseller-portal/options error:", err);
        return res.status(500).json({ success: false, message: "Failed to load options." });
    }
});
/*
|--------------------------------------------------------------------------
| RESELLER SMS REQUESTS (/api/reseller-portal/sms-requests)
|--------------------------------------------------------------------------
*/
router.get("/sms-requests", async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const search = String(req.query.search || "").trim();

        let sql = `
            SELECT id, company_id, reseller_id, reseller_name, sms_amount, money_amount, status, created_at
            FROM reseller_sms_requests
            WHERE company_id = ?
        `;
        const params = [companyId];

        if (search) {
            sql += ` AND (reseller_name LIKE ? OR status LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        sql += ` ORDER BY id DESC`;

        const [rows] = await db.query(sql, params);
        return res.json({ success: true, data: rows });
    } catch (err) {
        console.error("GET /api/reseller-portal/sms-requests error:", err);
        return res.status(500).json({ success: false, message: "Failed to load SMS requests." });
    }
});

router.patch("/sms-requests/:id/status", async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const userId = Number(req.session.user_id);
        const id = Number(req.params.id);
        const nextStatus = String(req.body.status || "").trim().toLowerCase();

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, message: "Invalid ID." });
        }

        if (!["pending", "approved", "rejected"].includes(nextStatus)) {
            return res.status(400).json({ success: false, message: "Invalid status." });
        }

        const [result] = await db.query(
            `UPDATE reseller_sms_requests
             SET status = ?, processed_by = ?
             WHERE id = ? AND company_id = ?`,
            [nextStatus, userId, id, companyId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "SMS request not found." });
        }

        return res.json({ success: true, message: "SMS request status updated." });
    } catch (err) {
        console.error("PATCH /api/reseller-portal/sms-requests/:id/status error:", err);
        return res.status(500).json({ success: false, message: "Failed to update SMS request." });
    }
});

/*
|--------------------------------------------------------------------------
| PAYMENT WITHDRAWALS (/api/reseller-portal/withdrawals)
|--------------------------------------------------------------------------
*/
router.get("/withdrawals", async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const search = String(req.query.search || "").trim();

        let sql = `
            SELECT id, company_id, reseller_id, reseller_name, amount, method, account_info, status, created_at
            FROM reseller_withdrawals
            WHERE company_id = ?
        `;
        const params = [companyId];

        if (search) {
            sql += ` AND (reseller_name LIKE ? OR method LIKE ? OR status LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        sql += ` ORDER BY id DESC`;

        const [rows] = await db.query(sql, params);
        return res.json({ success: true, data: rows });
    } catch (err) {
        console.error("GET /api/reseller-portal/withdrawals error:", err);
        return res.status(500).json({ success: false, message: "Failed to load withdrawals." });
    }
});

router.patch("/withdrawals/:id/status", async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const userId = Number(req.session.user_id);
        const id = Number(req.params.id);
        const nextStatus = String(req.body.status || "").trim().toLowerCase();

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ success: false, message: "Invalid ID." });
        }

        if (!["pending", "approved", "paid", "rejected"].includes(nextStatus)) {
            return res.status(400).json({ success: false, message: "Invalid status." });
        }

        const [result] = await db.query(
            `UPDATE reseller_withdrawals
             SET status = ?, processed_by = ?
             WHERE id = ? AND company_id = ?`,
            [nextStatus, userId, id, companyId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Withdrawal request not found." });
        }

        return res.json({ success: true, message: "Withdrawal status updated." });
    } catch (err) {
        console.error("PATCH /api/reseller-portal/withdrawals/:id/status error:", err);
        return res.status(500).json({ success: false, message: "Failed to update withdrawal." });
    }
});

module.exports = router;