"use strict";

const express = require("express");
const router = express.Router();
const db = require("../../config/database");
const { syncPppoeProfile } = require("../../services/mikrotik/pppoeProfileSync");

function requireAuth(req, res, next) {
    if (!req.session || !req.session.user_id) {
        return res.status(401).json({
            success: false,
            message: "আবার লগইন করুন।"
        });
    }
    next();
}

function getCompanyId(req) {
    return Number(req.session.company_id || req.session.user_id || 0);
}

router.use(requireAuth);

/*
|--------------------------------------------------------------------------
| TICKET CATEGORIES
|--------------------------------------------------------------------------
*/
router.get("/categories", async (req, res, next) => {
    try {
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
| SUPPORT TICKETS (গ্রাহকের টিকেট — অ্যাপ/এডমিন থেকে customer_tickets এ জমা হয়)
|--------------------------------------------------------------------------
| UI স্ট্যাটাস: Pending/Process/Completed  <->  DB: open/in_progress/resolved
*/
const UI_TO_DB = { Pending: "open", Process: "in_progress", Completed: "resolved" };
const DB_TO_UI = { open: "Pending", in_progress: "Process", resolved: "Completed", rejected: "Rejected" };

router.get("/tickets", async (req, res, next) => {
    try {
        const companyId = getCompanyId(req);
        const { category_id, staff_name, ticket_type, status, search } = req.query;

        let sql = `
            SELECT t.id, t.customer_pk AS customer_id, c.name AS customer_name,
                   c.customer_id AS customer_code, c.phone AS mobile,
                   t.subject, t.message, st.name AS staff_name,
                   COALESCE(t.category, '') AS category_name,
                   COALESCE(t.ticket_type, '') AS ticket_type,
                   t.status, t.admin_note, t.created_at
            FROM customer_tickets t
            JOIN customers c ON c.id = t.customer_pk AND c.company_id = t.company_id
            LEFT JOIN staff st ON st.id = t.assigned_staff_id
            WHERE t.company_id = ? AND t.type = 'ticket'
        `;
        const params = [companyId];

        if (category_id) {
            const [cat] = await db.query(
                "SELECT name FROM support_ticket_categories WHERE id = ? AND company_id = ?",
                [Number(category_id), companyId]);
            sql += " AND t.category = ?";
            params.push(cat.length ? cat[0].name : "\u0000");
        }
        if (staff_name) { sql += " AND st.name = ?"; params.push(String(staff_name).trim()); }
        if (ticket_type) { sql += " AND t.ticket_type = ?"; params.push(String(ticket_type).trim()); }
        if (status && UI_TO_DB[status]) { sql += " AND t.status = ?"; params.push(UI_TO_DB[status]); }
        if (search) {
            sql += ` AND (c.name LIKE ? OR c.customer_id LIKE ? OR c.phone LIKE ? OR t.subject LIKE ? OR t.message LIKE ?)`;
            const like = `%${String(search).trim()}%`;
            params.push(like, like, like, like, like);
        }
        sql += " ORDER BY t.id DESC LIMIT 500";

        const [rows] = await db.query(sql, params);
        return res.json({
            success: true,
            data: rows.map((r) => ({
                ...r,
                ticket_code: "TCK-" + String(r.id).padStart(5, "0"),
                message: [r.subject, r.message].filter(Boolean).join(" — "),
                status: DB_TO_UI[r.status] || r.status
            }))
        });
    } catch (err) {
        next(err);
    }
});

router.post("/tickets", async (req, res, next) => {
    try {
        const companyId = getCompanyId(req);
        const { customer_id, customer_name, message, staff_id, staff_name, category_id, ticket_type } = req.body;
        const text = String(message || "").trim();
        const key = String(customer_id || customer_name || "").trim();
        if (!key || !text) {
            return res.status(400).json({ success: false, message: "Customer এবং Message আবশ্যক।" });
        }

        const [cu] = await db.query(
            `SELECT id FROM customers WHERE company_id = ?
               AND (id = ? OR customer_id = ? OR name = ? OR phone = ?) LIMIT 1`,
            [companyId, Number(key) || 0, key, key, key]);
        if (!cu.length) {
            return res.status(404).json({ success: false, message: "এই নামে/আইডিতে কোনো কাস্টমার পাওয়া যায়নি।" });
        }

        let category = null;
        if (category_id) {
            const [cat] = await db.query(
                "SELECT name FROM support_ticket_categories WHERE id = ? AND company_id = ?",
                [Number(category_id), companyId]);
            category = cat.length ? cat[0].name : null;
        }
        let staffId = null;
        if (staff_id || String(staff_name || "").trim()) {
            const [s] = await db.query(
                "SELECT id FROM staff WHERE company_id = ? AND (id = ? OR name = ?) LIMIT 1",
                [companyId, Number(staff_id) || 0, String(staff_name || "").trim()]);
            staffId = s.length ? s[0].id : null;
        }

        const [r] = await db.query(
            `INSERT INTO customer_tickets
             (company_id, customer_pk, type, subject, message, status, assigned_staff_id, ticket_type, category, created_by)
             VALUES (?, ?, 'ticket', ?, ?, 'open', ?, ?, ?, ?)`,
            [companyId, cu[0].id, (category || "Support").slice(0, 150), text.slice(0, 4000),
             staffId, ticket_type ? String(ticket_type).slice(0, 60) : null, category,
             Number(req.session.user_id) || null]);

        return res.status(201).json({
            success: true,
            message: "নতুন সাপোর্ট টিকিট তৈরি হয়েছে।",
            id: r.insertId,
            ticket_code: "TCK-" + String(r.insertId).padStart(5, "0")
        });
    } catch (err) {
        next(err);
    }
});

router.patch("/tickets/:id/status", async (req, res, next) => {
    try {
        const companyId = getCompanyId(req);
        const id = Number(req.params.id);
        const status = UI_TO_DB[String(req.body.status || "").trim()];
        if (!status) {
            return res.status(400).json({ success: false, message: "ভুল স্ট্যাটাস।" });
        }
        await db.query(
            "UPDATE customer_tickets SET status = ? WHERE id = ? AND company_id = ? AND type = 'ticket'",
            [status, id, companyId]
        );
        return res.json({ success: true, message: "টিকিট স্ট্যাটাস আপডেট হয়েছে।" });
    } catch (err) {
        next(err);
    }
});

router.delete("/tickets/:id", async (req, res, next) => {
    try {
        const companyId = getCompanyId(req);
        await db.query(
            "DELETE FROM customer_tickets WHERE id = ? AND company_id = ? AND type = 'ticket'",
            [Number(req.params.id), companyId]
        );
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
| PACKAGE CHANGE REQUESTS (গ্রাহক অ্যাপ থেকে customer_tickets এ type='package_change')
|--------------------------------------------------------------------------
| Accept দিলে: customers.package_id/package_name/monthly_bill বদলায় + MikroTik PPPoE profile সিঙ্ক
*/
const PKG_DB_TO_UI = { open: "pending", in_progress: "pending", resolved: "accepted", rejected: "rejected" };

router.get("/package-changes", async (req, res, next) => {
    try {
        const companyId = getCompanyId(req);
        const search = String(req.query.search || "").trim();

        let sql = `
            SELECT t.id, c.customer_id AS customer_id, c.name AS customer_name, c.phone AS mobile,
                   t.message, t.status, t.created_at,
                   COALESCE(NULLIF(p.alias_name, ''), p.package_name) AS requested_package
            FROM customer_tickets t
            JOIN customers c ON c.id = t.customer_pk AND c.company_id = t.company_id
            LEFT JOIN mikrotik_packages p ON p.id = t.requested_package_id
            WHERE t.company_id = ? AND t.type = 'package_change'
        `;
        const params = [companyId];
        if (search) {
            sql += ` AND (c.customer_id LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR p.package_name LIKE ? OR p.alias_name LIKE ?)`;
            const like = `%${search}%`;
            params.push(like, like, like, like, like);
        }
        sql += " ORDER BY t.id DESC LIMIT 500";

        const [rows] = await db.query(sql, params);

        // আগের package_change_requests টেবিলের পুরনো ইতিহাস (শুধু দেখার জন্য)
        let legacy = [];
        try {
            let lsql = `SELECT id, customer_id, customer_name, mobile, previous_package, requested_package, status, created_at
                        FROM package_change_requests WHERE company_id = ?`;
            const lp = [companyId];
            if (search) {
                lsql += " AND (CAST(customer_id AS CHAR) LIKE ? OR customer_name LIKE ? OR mobile LIKE ?)";
                const like = `%${search}%`;
                lp.push(like, like, like);
            }
            const [lr] = await db.query(lsql + " ORDER BY id DESC LIMIT 500", lp);
            legacy = lr.map((r) => ({ ...r, id: "L" + r.id, status: r.status === "pending" ? "rejected" : r.status }));
        } catch (_) { /* টেবিল না থাকলে এড়িয়ে যাও */ }

        const current = rows.map((r) => ({
                id: r.id,
                customer_id: r.customer_id,
                customer_name: r.customer_name,
                mobile: r.mobile,
                previous_package: String(r.message || "").replace(/^বর্তমান:\s*/, ""),
                requested_package: r.requested_package || "",
                status: PKG_DB_TO_UI[r.status] || "pending",
                created_at: r.created_at
            }));
        const all = [...current, ...legacy].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return res.json({ success: true, data: all });
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
            `SELECT * FROM customer_tickets
             WHERE id = ? AND company_id = ? AND type = 'package_change' FOR UPDATE`,
            [id, companyId]
        );
        if (!requests.length) {
            await conn.rollback(); conn.release();
            return res.status(404).json({ success: false, message: "রিকোয়েস্ট পাওয়া যায়নি।" });
        }
        const reqRow = requests[0];
        if (!["open", "in_progress"].includes(reqRow.status)) {
            await conn.rollback(); conn.release();
            return res.status(409).json({
                success: false,
                message: "এই রিকোয়েস্টটি ইতিমধ্যে নিষ্পত্তি করা হয়েছে।"
            });
        }

        let mikrotikSync = { synced: false, reason: "NOT_APPLICABLE" };

        if (action === "accepted") {
            const [pk] = await conn.query(
                `SELECT id, package_name, price, router_id FROM mikrotik_packages
                 WHERE id = ? AND company_id = ? LIMIT 1`,
                [reqRow.requested_package_id, companyId]);
            if (!pk.length) {
                await conn.rollback(); conn.release();
                return res.status(400).json({ success: false, message: "অনুরোধকৃত প্যাকেজ আর পাওয়া যায় না।" });
            }
            const pkg = pk[0];

            await conn.query(
                `UPDATE customers SET package_id = ?, package_name = ?, monthly_bill = ?
                 WHERE id = ? AND company_id = ?`,
                [pkg.id, pkg.package_name, pkg.price, reqRow.customer_pk, companyId]);

            const [custRows] = await conn.query(
                `SELECT c.pppoe_username, r.ip AS host, r.port, r.username, r.password
                 FROM customers c
                 LEFT JOIN mikrotik_servers r ON r.id = c.mikrotik_id
                 WHERE c.id = ? AND c.company_id = ?`,
                [reqRow.customer_pk, companyId]);

            if (custRows.length && custRows[0].host && custRows[0].pppoe_username) {
                mikrotikSync = await syncPppoeProfile(
                    { host: custRows[0].host, port: custRows[0].port,
                      username: custRows[0].username, password: custRows[0].password },
                    custRows[0].pppoe_username,
                    pkg.package_name);
            }
        }

        await conn.query(
            "UPDATE customer_tickets SET status = ? WHERE id = ? AND company_id = ?",
            [action === "accepted" ? "resolved" : "rejected", id, companyId]);

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
        try { await conn.rollback(); conn.release(); } catch (_) {}
        next(err);
    }
});

module.exports = router;