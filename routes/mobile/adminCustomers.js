"use strict";

const express = require("express");
const db = require("../../config/database");
const { requireMobilePermission, scopeCompanyId } = require("../../middleware/mobileAuth");
const { invokeRouter, webSession } = require("../../services/mobile/webBridge");
const addCustomerRouter = require("../customers/customers-add");
const customerManage = require("../../services/customers/customer-manage.service");

const router = express.Router();

const bad = (res, message) =>
    res.status(400).json({ success: false, code: "BAD_REQUEST", message });

const iso = (d) =>
    d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : "";

const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => "\\" + c);

function shape(r) {
    return {
        id: Number(r.id),
        customer_code: r.customer_id || "",
        name: r.name || "",
        phone: r.phone || "",
        address: r.address || "",
        package_name: r.package_name || "",
        monthly_bill: num(r.monthly_bill),
        balance: num(r.balance),
        status: r.status || "",
        payment_status: r.payment_status || "",
        promise_date: iso(r.promise_date),
        connection_date: iso(r.connection_date),
        company_id: Number(r.company_id)
    };
}

const COLS = `id, company_id, customer_id, name, phone, address, package_name, monthly_bill,
              balance, status, payment_status, promise_date, connection_date`;

function sendManageError(res, error) {
    return res.status(Number(error.httpCode) || 500).json({
        success: false,
        message: error.message || "Customer operation failed."
    });
}

async function bridgeAdd(req, res, next, method, url, query = {}, body = {}, csrf = false) {
    try {
        const result = await invokeRouter(addCustomerRouter, req, {
            method, url, query, body, csrf
        });
        return res.status(result.status).json(result.body);
    } catch (error) {
        return next(error);
    }
}

/* Customer list */
router.get("/", requireMobilePermission("customer_list"), async (req, res, next) => {
    try {
        const company = scopeCompanyId(req);
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
        const offset = (page - 1) * limit;
        const where = ["deleted_at IS NULL"];
        const params = [];

        if (company) {
            where.push("company_id = ?");
            params.push(company);
        }

        const search = String(req.query.search || "").trim().slice(0, 60);
        if (search) {
            const like = `%${likeEscape(search)}%`;
            where.push("(name LIKE ? OR phone LIKE ? OR customer_id LIKE ? OR address LIKE ?)");
            params.push(like, like, like, like);
        }

        const status = String(req.query.status || "").trim().slice(0, 30);
        if (status) {
            where.push("status = ?");
            params.push(status);
        }

        const pay = String(req.query.payment_status || "").trim().slice(0, 30);
        if (pay) {
            where.push("payment_status = ?");
            params.push(pay);
        }

        const w = where.join(" AND ");
        const [[tot]] = await db.execute(
            `SELECT COUNT(*) AS total FROM customers WHERE ${w}`, params
        );
        const [rows] = await db.execute(
            `SELECT ${COLS} FROM customers WHERE ${w} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`,
            params
        );

        res.json({ page, limit, total: num(tot && tot.total), items: rows.map(shape) });
    } catch (error) {
        next(error);
    }
});

/* Add form data: existing Web Add controller */
router.get("/form", requireMobilePermission("customer_add"), (req, res, next) =>
    bridgeAdd(req, res, next, "GET", "/form")
);

router.get("/mikrotiks", requireMobilePermission("customer_add"), (req, res, next) =>
    bridgeAdd(req, res, next, "GET", "/mikrotiks")
);

router.get("/areas", requireMobilePermission("customer_add"), (req, res, next) =>
    bridgeAdd(req, res, next, "GET", "/areas", req.query)
);

router.get("/packages", requireMobilePermission("customer_add"), (req, res, next) =>
    bridgeAdd(req, res, next, "GET", "/packages", req.query)
);

router.get("/sub-areas", requireMobilePermission("customer_add"), (req, res, next) =>
    bridgeAdd(req, res, next, "GET", "/sub-areas", req.query)
);

router.get("/divisions", requireMobilePermission("customer_add"), (req, res, next) =>
    bridgeAdd(req, res, next, "GET", "/divisions")
);

router.get("/districts", requireMobilePermission("customer_add"), (req, res, next) =>
    bridgeAdd(req, res, next, "GET", "/districts", req.query)
);

router.get("/upazilas", requireMobilePermission("customer_add"), (req, res, next) =>
    bridgeAdd(req, res, next, "GET", "/upazilas", req.query)
);

/* Add customer: existing Web controller and its validation */
router.post("/", requireMobilePermission("customer_add"), (req, res, next) =>
    bridgeAdd(req, res, next, "POST", "/", {}, req.body || {}, true)
);

/* Edit customer: existing Manage Service */
router.put("/:id", requireMobilePermission("customer_edit"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return bad(res, "Invalid customer ID.");

        const message = await customerManage.updateCustomer({
            user: webSession(req.auth),
            body: { ...(req.body || {}), id }
        });

        return res.json({ success: true, message });
    } catch (error) {
        return sendManageError(res, error);
    }
});

/* Delete customer: existing Manage Service */
router.delete("/:id", requireMobilePermission("customer_delete"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return bad(res, "Invalid customer ID.");

        const message = await customerManage.deleteCustomer({
            user: webSession(req.auth),
            id,
            deleteMikrotik: req.body && req.body.delete_mikrotik
        });

        return res.json({ success: true, message });
    } catch (error) {
        return sendManageError(res, error);
    }
});

/* Customer detail and edit fields */
router.get("/:id", requireMobilePermission("customer_list"), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return bad(res, "Invalid customer ID.");

        const company = scopeCompanyId(req);
        const [rows] = await db.execute(
            `SELECT * FROM customers
             WHERE id = ? AND deleted_at IS NULL
             ${company ? "AND company_id = ?" : ""}
             LIMIT 1`,
            company ? [id, company] : [id]
        );

        if (!rows.length) {
            return res.status(404).json({
                success: false,
                code: "NOT_FOUND",
                message: "Customer not found."
            });
        }

        const c = rows[0];
        const [pay] = await db.execute(
            `SELECT amount, billing_month, billing_year, payment_date, payment_method
             FROM payments
             WHERE customer_id = ? AND company_id = ?
               AND deleted_at IS NULL AND payment_cancelled_at IS NULL
             ORDER BY payment_date DESC, id DESC LIMIT 12`,
            [c.id, c.company_id]
        );

        res.json({
    id: num(c.id),
    customer_id: c.customer_id || "",
    name: c.name || "",
    mikrotik_id: num(c.mikrotik_id),
    package_id: num(c.package_id),

    pppoe_name: c.pppoe_username || "",
    phone: c.phone || "",
    address: c.address || "",
    email: c.email || "",
    nid_no: c.nid_no || "",

    monthly_bill: num(c.monthly_bill),
    balance: num(c.balance),
    billing_cycle: iso(c.billing_cycle || c.billing_date),
    billing_type: c.billing_type || "Prepaid",

    area_id: num(c.area_id),
    sub_area_id: num(c.sub_area_id),

    division: c.division || "",
    district: c.district || "",
    upazila: c.upazila || "",

    connection_fee: num(c.connection_fee),
    connection_fee_due: num(c.connection_fee_due),
    birth_date: iso(c.birth_date),
    connection_date: iso(c.connection_date),
    promise_date: iso(c.promise_date),

    reference_name: c.reference_name || "",
    reference_mobile: c.reference_mobile || "",

    auto_connection: c.auto_connection ?? "Will continue",
    auto_next_month: num(c.auto_next_month ?? c.auto_connection_next_month),

    status: c.status || "Active",
    comment: c.comments || "",

    payments: pay.map((p) => ({
        amount: num(p.amount),
        month: p.billing_year && p.billing_month
            ? `${p.billing_year}-${String(p.billing_month).padStart(2, "0")}`
            : iso(p.payment_date),
        date: iso(p.payment_date),
        method: p.payment_method || ""
    }))
});
    } catch (error) {
        next(error);
    }
});

module.exports = router;
