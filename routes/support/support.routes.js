"use strict";

const express = require("express");
const router = express.Router();
const db = require("../../config/database");
const { syncPppoeProfile } = require("../../services/mikrotik/pppoeProfileSync");
const { hasPermission } = require("../../middleware/permission");

function requireAuth(req, res, next) {
    if (!req.session || !req.session.user_id) {
        return res.status(401).json({
            success: false,
            message: "আবার লগইন করুন।"
        });
    }
    next();
}

function getCompanyId(req) { return Number(req.session.company_id || 0); }

async function getTicketScope(req) {
 const role = String(req.session.role || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
 if (['superadmin','admin','companyadmin','owner','manager'].includes(role)) return { sql: '', params: [] };
 if (['staff','employee','collector'].includes(role)) return { sql: ' AND t.staff_id = ?', params: [Number(req.session.user_id)] };
 if (role === 'reseller') {
  const [rows] = await db.query("SELECT r.id FROM resellers r INNER JOIN users u ON u.mobile = r.mobile AND u.company_id = r.company_id WHERE u.id = ? AND r.company_id = ? AND LOWER(u.role) = 'reseller' LIMIT 1", [Number(req.session.user_id), getCompanyId(req)]);
  if (!rows.length) return { sql: ' AND 1 = 0', params: [] };
  return { sql: ' AND t.customer_id IN (SELECT c.id FROM customers c WHERE c.reseller_id = ? AND c.company_id = ?)', params: [Number(rows[0].id), getCompanyId(req)] };
 }
 return { sql: ' AND 1 = 0', params: [] };
}

async function ticketPermission(req, res, key) {
 if (!getCompanyId(req)) { res.status(403).json({success:false,message:'কোম্পানি অ্যাক্সেস পাওয়া যায়নি।'}); return false; }
 const role = String(req.session.role || '').trim().toLowerCase();
 if (['super_admin','superadmin','admin','companyadmin','owner','manager'].includes(role)) return true;
 const ok = await hasPermission(req, key);
 if (!ok) { res.status(403).json({success:false,message:'এই Support Ticket কাজের অনুমতি নেই।',permission:key}); return false; }
 return true;
}

router.use(requireAuth);

/*
|--------------------------------------------------------------------------
| TICKET CATEGORIES
|--------------------------------------------------------------------------
*/
router.get("/categories", async (req, res, next) => {
    try {
        if (!await ticketPermission(req, res, "support_ticket_view")) return;
        const companyId = getCompanyId(req);
        const search = String(req.query.search || "").trim();

        let sql = `
            SELECT id, name, created_at
            FROM support_ticket_categories
            WHERE company_id = ?
        `;
        const params = [companyId];

        if (search) {
            sql += " AND name LIKE ?";
            params.push(`%${search}%`);
        }

        sql += " ORDER BY id DESC";

        const [rows] = await db.query(sql, params);
        return res.json({ success: true, data: rows });
    } catch (err) {
        next(err);
    }
});

router.post("/categories", async (req, res, next) => {
    try {
        if (!await ticketPermission(req, res, "support_ticket_manage")) return;
        const companyId = getCompanyId(req);
        const name = String(req.body.name || "").trim();

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Category Name আবশ্যক।"
            });
        }

        const [result] = await db.query(
            "INSERT INTO support_ticket_categories (company_id, name) VALUES (?, ?)",
            [companyId, name]
        );

        return res.status(201).json({
            success: true,
            message: "ক্যাটাগরি তৈরি হয়েছে।",
            id: result.insertId
        });
    } catch (err) {
        next(err);
    }
});

router.delete("/categories/:id", async (req, res, next) => {
    try {
        if (!await ticketPermission(req, res, "support_ticket_manage")) return;
        const companyId = getCompanyId(req);
        const id = Number(req.params.id);

        await db.query(
            "DELETE FROM support_ticket_categories WHERE id = ? AND company_id = ?",
            [id, companyId]
        );

        return res.json({ success: true, message: "ক্যাটাগরি মুছে ফেলা হয়েছে।" });
    } catch (err) {
        next(err);
    }
});

/*
|--------------------------------------------------------------------------
| SUPPORT TICKETS
|--------------------------------------------------------------------------
*/
router.get("/tickets", async (req, res, next) => {
    try {
        if (!await ticketPermission(req, res, 'support_ticket_view')) return;
        const companyId = getCompanyId(req);
        const scope = await getTicketScope(req);
        const { category_id, staff_name, ticket_type, status, search } = req.query;

        let sql = `
            SELECT
                t.id,
                t.ticket_code,
                t.customer_id,
                t.customer_name,
                t.message,
                t.staff_id,
                t.staff_name,
                t.category_id,
                COALESCE(c.name, '') AS category_name,
                t.ticket_type,
                t.status,
                t.created_at
            FROM support_tickets t
            LEFT JOIN support_ticket_categories c
                ON t.category_id = c.id AND c.company_id = t.company_id
            WHERE t.company_id = ? ${scope.sql}
        `;
        const params = [companyId, ...scope.params];

        if (category_id) {
            sql += " AND t.category_id = ?";
            params.push(Number(category_id));
        }
        if (staff_name) {
            sql += " AND t.staff_name = ?";
            params.push(String(staff_name).trim());
        }
        if (ticket_type) {
            sql += " AND t.ticket_type = ?";
            params.push(String(ticket_type).trim());
        }
        if (status) {
            sql += " AND t.status = ?";
            params.push(String(status).trim());
        }
        if (search) {
            sql += ` AND (
                t.ticket_code LIKE ? OR
                t.customer_name LIKE ? OR
                t.message LIKE ? OR
                t.staff_name LIKE ?
            )`;
            const like = `%${String(search).trim()}%`;
            params.push(like, like, like, like);
        }

        sql += " ORDER BY t.id DESC";

        const [rows] = await db.query(sql, params);
        return res.json({ success: true, data: rows });
    } catch (err) {
        next(err);
    }
});

router.post("/tickets", async (req, res, next) => {
    try {
        if (!await ticketPermission(req, res, 'support_ticket_manage')) return;
        const companyId = getCompanyId(req);
        const {
            customer_id,
            customer_name,
            message,
            staff_id,
            staff_name,
            category_id,
            ticket_type,
            status
        } = req.body;

        if (!String(customer_name || "").trim() || !String(message || "").trim()) {
            return res.status(400).json({
                success: false,
                message: "Customer Name এবং Message আবশ্যক।"
            });
        }

        const allowedTypes = ["High", "Medium", "Low"];
        const allowedStatuses = ["Pending", "Process", "Completed"];

        const finalType = allowedTypes.includes(String(ticket_type || "").trim())
            ? String(ticket_type).trim()
            : "Medium";

        const finalStatus = allowedStatuses.includes(String(status || "").trim())
            ? String(status).trim()
            : "Pending";

        const ticketCode = "TCK-" + Date.now().toString().slice(-6);

        const [result] = await db.query(
            `INSERT INTO support_tickets
            (company_id, ticket_code, customer_id, customer_name, message, staff_id, staff_name, category_id, ticket_type, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                companyId,
                ticketCode,
                customer_id ? Number(customer_id) : null,
                String(customer_name).trim(),
                String(message).trim(),
                staff_id ? Number(staff_id) : null,
                staff_name ? String(staff_name).trim() : null,
                category_id ? Number(category_id) : null,
                finalType,
                finalStatus
            ]
        );

        return res.status(201).json({
            success: true,
            message: "নতুন সাপোর্ট টিকিট তৈরি হয়েছে।",
            id: result.insertId,
            ticket_code: ticketCode
        });
    } catch (err) {
        next(err);
    }
});

router.patch("/tickets/:id/status", async (req, res, next) => {
    try {
        if (!await ticketPermission(req, res, 'support_ticket_manage')) return;
        const companyId = getCompanyId(req);
        const scope = await getTicketScope(req);
        const id = Number(req.params.id);
        const allowed = ["Pending", "Process", "Completed"];
        const status = String(req.body.status || "").trim();

        if (!allowed.includes(status)) {
            return res.status(400).json({ success: false, message: "ভুল স্ট্যাটাস।" });
        }

        const [result] = await db.query(
            "UPDATE support_tickets t SET t.status = ? WHERE t.id = ? AND t.company_id = ?" + scope.sql,
            [status, id, companyId, ...scope.params]
        );
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "টিকিট পাওয়া যায়নি বা অনুমতি নেই।" });

        return res.json({ success: true, message: "টিকিট স্ট্যাটাস আপডেট হয়েছে।" });
    } catch (err) {
        next(err);
    }
});

router.delete("/tickets/:id", async (req, res, next) => {
    try {
        if (!await ticketPermission(req, res, 'support_ticket_manage')) return;
        const companyId = getCompanyId(req);
        const scope = await getTicketScope(req);
        const id = Number(req.params.id);

        const [result] = await db.query(
            "DELETE t FROM support_tickets t WHERE t.id = ? AND t.company_id = ?" + scope.sql,
            [id, companyId, ...scope.params]
        );
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "টিকিট পাওয়া যায়নি বা অনুমতি নেই।" });

        return res.json({ success: true, message: "টিকিট ডিলিট করা হয়েছে।" });
    } catch (err) {
        next(err);
    }
});

/*
|--------------------------------------------------------------------------
| SUPPORT NUMBERS
|--------------------------------------------------------------------------
*/
router.get("/numbers", async (req, res, next) => {
    try {
        const companyId = getCompanyId(req);
        const search = String(req.query.search || "").trim();

        let sql = `
            SELECT id, name, mobile, start_time, end_time, created_at
            FROM support_numbers
            WHERE company_id = ?
        `;
        const params = [companyId];

        if (search) {
            sql += " AND (name LIKE ? OR mobile LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }

        sql += " ORDER BY id ASC";

        const [rows] = await db.query(sql, params);
        return res.json({ success: true, data: rows });
    } catch (err) {
        next(err);
    }
});

router.post("/numbers", async (req, res, next) => {
    try {
        const companyId = getCompanyId(req);
        const { name, mobile, start_time, end_time } = req.body;

        if (
            !String(name || "").trim() ||
            !String(mobile || "").trim() ||
            !String(start_time || "").trim() ||
            !String(end_time || "").trim()
        ) {
            return res.status(400).json({
                success: false,
                message: "Name, Mobile, Start Time এবং End Time আবশ্যক।"
            });
        }

        const [result] = await db.query(
            `INSERT INTO support_numbers (company_id, name, mobile, start_time, end_time)
             VALUES (?, ?, ?, ?, ?)`,
            [
                companyId,
                String(name).trim(),
                String(mobile).trim(),
                String(start_time).trim(),
                String(end_time).trim()
            ]
        );

        return res.status(201).json({
            success: true,
            message: "সাপোর্ট নম্বর যুক্ত হয়েছে।",
            id: result.insertId
        });
    } catch (err) {
        next(err);
    }
});

router.delete("/numbers/:id", async (req, res, next) => {
    try {
        const companyId = getCompanyId(req);
        const id = Number(req.params.id);

        await db.query(
            "DELETE FROM support_numbers WHERE id = ? AND company_id = ?",
            [id, companyId]
        );

        return res.json({ success: true, message: "সাপোর্ট নম্বর মুছে ফেলা হয়েছে।" });
    } catch (err) {
        next(err);
    }
});

/*
|--------------------------------------------------------------------------
| PACKAGE CHANGE REQUESTS
|--------------------------------------------------------------------------
*/
router.get("/package-changes", async (req, res, next) => {
    try {
        const companyId = getCompanyId(req);
        const search = String(req.query.search || "").trim();

        let sql = `
            SELECT
                id,
                customer_id,
                customer_name,
                mobile,
                previous_package,
                requested_package,
                status,
                created_at
            FROM package_change_requests
            WHERE company_id = ?
        `;
        const params = [companyId];

        if (search) {
            sql += ` AND (
                CAST(customer_id AS CHAR) LIKE ? OR
                customer_name LIKE ? OR
                mobile LIKE ? OR
                previous_package LIKE ? OR
                requested_package LIKE ?
            )`;
            const like = `%${search}%`;
            params.push(like, like, like, like, like);
        }

        sql += " ORDER BY id DESC";

        const [rows] = await db.query(sql, params);
        return res.json({ success: true, data: rows });
    } catch (err) {
        next(err);
    }
});

router.patch("/package-changes/:id/action", async (req, res, next) => {
    const conn = await db.getConnection();
    try {
        const companyId = getCompanyId(req);
        const id = Number(req.params.id);
        const action = String(req.body.action || "").trim().toLowerCase();

        if (!["accepted", "rejected"].includes(action)) {
            conn.release();
            return res.status(400).json({ success: false, message: "ভুল অ্যাকশন।" });
        }

        await conn.beginTransaction();

        const [requests] = await conn.query(
            `SELECT * FROM package_change_requests
             WHERE id = ? AND company_id = ? FOR UPDATE`,
            [id, companyId]
        );

        if (!requests.length) {
            await conn.rollback();
            conn.release();
            return res.status(404).json({ success: false, message: "রিকোয়েস্ট পাওয়া যায়নি।" });
        }

        const reqRow = requests[0];

        if (reqRow.status !== "pending") {
            await conn.rollback();
            conn.release();
            return res.status(409).json({
                success: false,
                message: `এই রিকোয়েস্টটি ইতিমধ্যে ${reqRow.status} করা হয়েছে।`
            });
        }

        await conn.query(
            "UPDATE package_change_requests SET status = ? WHERE id = ? AND company_id = ?",
            [action, id, companyId]
        );

        let mikrotikSync = { synced: false, reason: "NOT_APPLICABLE" };

        if (action === "accepted") {
            await conn.query(
                `UPDATE customers
                 SET package_name = ?
                 WHERE id = ? AND company_id = ?`,
                [reqRow.requested_package, reqRow.customer_id, companyId]
            );

            const [custRows] = await conn.query(
                `SELECT c.pppoe_username, c.router_id, r.host, r.port, r.username, r.password
                 FROM customers c
                 LEFT JOIN mikrotik_routers r ON c.router_id = r.id
                 WHERE c.id = ? AND c.company_id = ?`,
                [reqRow.customer_id, companyId]
            );

            if (custRows.length && custRows[0].host && custRows[0].pppoe_username) {
                mikrotikSync = await syncPppoeProfile(
                    {
                        host: custRows[0].host,
                        port: custRows[0].port,
                        username: custRows[0].username,
                        password: custRows[0].password
                    },
                    custRows[0].pppoe_username,
                    reqRow.requested_package
                );
            }
        }

        await conn.commit();
        conn.release();

        return res.json({
            success: true,
            message:
                action === "accepted"
                    ? mikrotikSync.synced
                        ? "প্যাকেজ অনুমোদিত হয়েছে এবং MikroTik প্রোফাইল আপডেট হয়েছে।"
                        : "প্যাকেজ অনুমোদিত হয়েছে (MikroTik সিঙ্ক পেন্ডিং বা রাউটার অফলাইন/ব্লকড)।"
                    : "রিকোয়েস্ট বাতিল করা হয়েছে।",
            mikrotik: mikrotikSync
        });
    } catch (err) {
        try {
            await conn.rollback();
            conn.release();
        } catch (_) {}
        next(err);
    }
});

module.exports = router;