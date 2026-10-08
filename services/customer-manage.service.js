"use strict";

/*
|--------------------------------------------------------------------------
| CUSTOMER MANAGE SERVICE  (edit / update / delete)
|--------------------------------------------------------------------------
| Port of:
|   customers/edit.php
|   customers/update_customer.php
|   customers/delete.php
|--------------------------------------------------------------------------
*/

const db = require("../config/database");
const ppp = require("./ppp.service");

const STATUSES = ["Active", "Inactive", "Expired"];

class ManageError extends Error {
    constructor(message, httpCode = 400) {
        super(message);
        this.httpCode = httpCode;
    }
}

function isSuperAdmin(user) {
    return String(user.role || "")
        .trim().toLowerCase().replace(/[\s_-]+/g, "") === "superadmin";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function scope(user, alias = "") {

    const p = alias ? `${alias}.` : "";

    if (isSuperAdmin(user)) return { sql: "", params: [] };

    const companyId = Number(user.company_id || 0);

    if (companyId <= 0) {
        throw new ManageError("Company access is not configured for this account.", 403);
    }

    return { sql: ` AND ${p}company_id = ?`, params: [companyId] };
}

async function logActivity(user, customerId, action, description) {

    try {
        await db.query(
            `INSERT INTO activity_logs
                (user_id, company_id, customer_id, action, description, module, created_at)
             VALUES (?, ?, ?, ?, ?, 'customers', NOW())`,
            [
                Number(user.user_id || 0),
                Number(user.company_id || 0),
                Number(customerId),
                action,
                String(description).slice(0, 500)
            ]
        );
    } catch (_) {
        /* logging never blocks the action */
    }
}

async function getCustomer(user, id, columns = "*") {

    const s = scope(user);

    const [rows] = await db.query(
        `SELECT ${columns} FROM customers WHERE id = ?${s.sql} LIMIT 1`,
        [Number(id), ...s.params]
    );

    return rows[0] || null;
}

async function getRouter(user, routerId) {

    const s = scope(user);

    const [rows] = await db.query(
        `SELECT id, name, ip, username, password, port, use_ssl, timeout
         FROM mikrotik_servers WHERE id = ?${s.sql} LIMIT 1`,
        [Number(routerId), ...s.params]
    );

    return rows[0] || null;
}


/*
|--------------------------------------------------------------------------
| EDIT FORM FRAGMENT
|--------------------------------------------------------------------------
*/

async function editFragment({ user, id }) {

    const c = await getCustomer(user, id);

    if (!c) throw new ManageError("Customer not found or access denied.", 404);

    const [packages] = await db.query(
        `SELECT id, package_name, price FROM mikrotik_packages
         WHERE router_id = ? AND company_id = ?
         ORDER BY package_name ASC`,
        [Number(c.mikrotik_id || 0), Number(c.company_id || 0)]
    );

    const pkgOptions = packages.map(p =>
        `<option value="${Number(p.id)}"${Number(p.id) === Number(c.package_id) ? " selected" : ""}>` +
        `${escapeHtml(p.package_name)} (৳${escapeHtml(p.price)})</option>`
    ).join("");

    const statusOptions = STATUSES.map(s =>
        `<option value="${s}"${String(c.status || "").toLowerCase() === s.toLowerCase() ? " selected" : ""}>${s}</option>`
    ).join("");

    return `
<form action="/api/customers/update" method="POST">
    <input type="hidden" name="id" value="${Number(c.id)}">
    <div class="row g-2">
        <div class="col-md-6">
            <label class="form-label small text-muted mb-1">Customer ID</label>
            <input type="text" class="form-control form-control-sm" value="${escapeHtml(c.customer_id)}" readonly>
        </div>
        <div class="col-md-6">
            <label class="form-label small text-muted mb-1">Name</label>
            <input type="text" class="form-control form-control-sm" value="${escapeHtml(c.name)}" readonly>
        </div>
        <div class="col-md-6">
            <label class="form-label small text-muted mb-1">Mobile</label>
            <input type="text" class="form-control form-control-sm" value="${escapeHtml(c.phone)}" readonly>
        </div>
        <div class="col-md-6">
            <label class="form-label small text-muted mb-1">Package <span class="text-danger">*</span></label>
            <select name="package_id" class="form-select form-select-sm" required>${pkgOptions}</select>
        </div>
        <div class="col-md-6">
            <label class="form-label small text-muted mb-1">PPPoE Name <span class="text-danger">*</span></label>
            <input type="text" name="pppoe_name" class="form-control form-control-sm"
                   value="${escapeHtml(c.pppoe_username)}" required>
        </div>
        <div class="col-md-6">
            <label class="form-label small text-muted mb-1">Password <span class="text-danger">*</span></label>
            <input type="text" name="password" class="form-control form-control-sm"
                   value="${escapeHtml(c.pppoe_password)}" required>
        </div>
        <div class="col-md-6">
            <label class="form-label small text-muted mb-1">Status</label>
            <select name="status" class="form-select form-select-sm">${statusOptions}</select>
        </div>
        <div class="col-12">
            <label class="form-label small text-muted mb-1">Comment</label>
            <input type="text" name="comment" class="form-control form-control-sm"
                   value="${escapeHtml(c.comments)}" maxlength="255">
        </div>
    </div>
    <div class="form-text mt-2">
        Saving also updates the PPPoE secret on MikroTik
        (Active = enabled, Inactive / Expired = disabled).
    </div>
    <div class="text-end mt-3">
        <button type="submit" class="btn btn-primary btn-sm">Update Customer</button>
    </div>
</form>`;
}


/*
|--------------------------------------------------------------------------
| UPDATE
|--------------------------------------------------------------------------
| MikroTik first (as in PHP) - DB only when MikroTik accepted the change.
|--------------------------------------------------------------------------
*/

async function updateCustomer({ user, body }) {

    const id = parseInt(body.id, 10) || 0;

    if (id <= 0) throw new ManageError("Invalid customer ID.");

    const newName = String(body.pppoe_name || "").trim();
    const newPassword = String(body.password || "").trim();
    const newPackageId = parseInt(body.package_id, 10) || 0;
    const newComment = String(body.comment || "").trim();

    let newStatus = String(body.status || "Active").trim();

    if (!newName) throw new ManageError("PPPoE username is required.");
    if (!newPassword) throw new ManageError("PPPoE password is required.");
    if (newPackageId <= 0) throw new ManageError("Please select a package.");
    if (!STATUSES.includes(newStatus)) newStatus = "Active";

    const customer = await getCustomer(
        user, id,
        "id, company_id, customer_id, mikrotik_id, package_id, pppoe_username, pppoe_password, comments, status"
    );

    if (!customer) throw new ManageError("Customer not found or access denied.", 404);

    const oldName = String(customer.pppoe_username || "").trim();
    const mikrotikId = Number(customer.mikrotik_id || 0);

    /* duplicate PPPoE name */
    const s = scope(user);

    const [dupe] = await db.query(
        `SELECT id FROM customers WHERE pppoe_username = ? AND id != ?${s.sql} LIMIT 1`,
        [newName, id, ...s.params]
    );

    if (dupe.length) throw new ManageError("This PPPoE username already exists.");

    /* package -> MikroTik profile */
    const [pk] = await db.query(
        "SELECT * FROM mikrotik_packages WHERE id = ? LIMIT 1",
        [newPackageId]
    );

    const pkg = pk[0];

    const profile = String(
        pkg?.package_name || pkg?.name || pkg?.profile_id || ""
    ).trim();

    if (!profile) throw new ManageError("Selected MikroTik package was not found.");

    if (mikrotikId <= 0) throw new ManageError("Customer has no MikroTik server assigned.");

    const router = await getRouter(user, mikrotikId);

    if (!router) throw new ManageError("MikroTik server not found or access denied.");

    if (!String(router.ip || "").trim() || !String(router.username || "").trim()) {
        throw new ManageError("MikroTik server configuration is incomplete.");
    }

    /* MikroTik */
    const session = ppp.createSession({ companyId: customer.company_id, isSuper: true });

    try {

        let api;

        try {
            api = await session.api(mikrotikId);
        } catch (e) {
            throw new ManageError("MikroTik connection failed.");
        }

        let secret = null;

        if (oldName) secret = await ppp.findSecret(api, oldName);

        if (!secret && newName !== oldName) secret = await ppp.findSecret(api, newName);

        if (!secret) {
            throw new ManageError(
                `MikroTik PPPoE secret not found. Old PPPoE username: ${oldName}`
            );
        }

        try {
            await api.write("/ppp/secret/set", [
                `=.id=${secret[".id"]}`,
                `=name=${newName}`,
                `=password=${newPassword}`,
                `=profile=${profile}`,
                `=comment=${newComment}`,
                `=disabled=${newStatus === "Active" ? "no" : "yes"}`
            ]);
        } catch (e) {
            throw new ManageError(`MikroTik update failed: ${e.message}`);
        }

    } finally {
        await session.closeAll();
    }

    /* DB */
    try {
        await db.query(
            `UPDATE customers
             SET package_id = ?, pppoe_username = ?, pppoe_password = ?,
                 comments = ?, status = ?
             WHERE id = ?${s.sql} LIMIT 1`,
            [newPackageId, newName, newPassword, newComment, newStatus, id, ...s.params]
        );
    } catch (e) {
        throw new ManageError(
            `MikroTik updated successfully, but database update failed: ${e.message}`,
            500
        );
    }

    await logActivity(
        user, id, "customer_update",
        `Customer updated: ${customer.customer_id || id} | PPPoE: ${oldName} -> ${newName} | Status: ${newStatus}`
    );

    return "Customer updated successfully. MikroTik PPPoE also updated.";
}


/*
|--------------------------------------------------------------------------
| DELETE
|--------------------------------------------------------------------------
| 1. refuse when payment / billing history exists
| 2. delete DB row (transaction)
| 3. remove PPPoE secret from MikroTik (failure only reported)
|--------------------------------------------------------------------------
*/

async function tableHasColumn(table, column) {

    try {
        const [t] = await db.query("SHOW TABLES LIKE ?", [table]);

        if (!t.length) return false;

        const [c] = await db.query(
            `SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]
        );

        return c.length > 0;

    } catch (_) {
        return false;
    }
}

async function hasBillingHistory(customerId) {

    for (const table of [
        "payments",
        "billing_history",
        "customer_billing",
        "customer_billing_history"
    ]) {
        if (!(await tableHasColumn(table, "customer_id"))) continue;

        const [rows] = await db.query(
            `SELECT customer_id FROM \`${table}\` WHERE customer_id = ? LIMIT 1`,
            [Number(customerId)]
        );

        if (rows.length) return true;
    }

    return false;
}

async function deleteCustomer({ user, id }) {

    id = parseInt(id, 10) || 0;

    if (id <= 0) throw new ManageError("Invalid customer ID.");

    const customer = await getCustomer(
        user, id,
        "id, customer_id, name, pppoe_username, mikrotik_id, company_id"
    );

    if (!customer) throw new ManageError("Customer not found or access denied.", 404);

    if (await hasBillingHistory(customer.id)) {
        throw new ManageError(
            "Customer cannot be deleted because billing/payment history exists."
        );
    }

    const s = scope(user);

    const conn = await db.getConnection();

    try {

        await conn.beginTransaction();

        const [r] = await conn.query(
            `DELETE FROM customers WHERE id = ?${s.sql} LIMIT 1`,
            [Number(customer.id), ...s.params]
        );

        if (r.affectedRows !== 1) {
            throw new ManageError("Customer could not be deleted or access was denied.");
        }

        await conn.commit();

    } catch (e) {

        try { await conn.rollback(); } catch (_) {}

        throw e instanceof ManageError
            ? e
            : new ManageError("Customer could not be deleted.", 500);

    } finally {
        conn.release();
    }

    await logActivity(
        user, customer.id, "customer_delete",
        `Customer deleted: ${customer.name || ""} | Customer ID: ${customer.customer_id || ""} | PPPoE: ${customer.pppoe_username || ""}`
    );

    /* MikroTik */
    let mikrotikNote = "";

    const mikrotikId = Number(customer.mikrotik_id || 0);
    const pppoe = String(customer.pppoe_username || "").trim();

    if (mikrotikId > 0 && pppoe) {

        const session = ppp.createSession({ companyId: customer.company_id, isSuper: true });

        try {

            const api = await session.api(mikrotikId);

            const secret = await ppp.findSecret(api, pppoe);

            if (secret) {
                await api.write("/ppp/secret/remove", [`=.id=${secret[".id"]}`]);
                await ppp.kick(api, pppoe);
            }

        } catch (e) {
            console.error(`Delete MikroTik warning [${id}]:`, e.message);
            mikrotikNote = " (MikroTik secret could not be removed - please remove it manually.)";
        } finally {
            await session.closeAll();
        }
    }

    return `Customer deleted successfully.${mikrotikNote}`;
}


module.exports = {
    ManageError,
    editFragment,
    updateCustomer,
    deleteCustomer,
    hasBillingHistory,
    escapeHtml,
    getCustomer,
    scope
};


/*
|--------------------------------------------------------------------------
| PROFILE FRAGMENT (compact port of view.php)
|--------------------------------------------------------------------------
*/

async function profileFragment({ user, id }) {

    const customerService = require("./customer.service");

    const c = await customerService.getCustomerById({ user, id: Number(id) });

    if (!c) throw new ManageError("Customer not found.", 404);

    const row = (label, value) => `
        <div class="row py-1 border-bottom small">
            <div class="col-5 text-muted">${escapeHtml(label)}</div>
            <div class="col-7 fw-semibold">${escapeHtml(value === null || value === undefined || value === "" ? "-" : value)}</div>
        </div>`;

    let payments = "";

    try {
        const [rows] = await db.query(
            `SELECT amount, payment_method, payment_date, months_paid
             FROM payments
             WHERE customer_id = ? AND deleted_at IS NULL
             ORDER BY id DESC LIMIT 5`,
            [Number(c.id)]
        );

        if (rows.length) {
            payments = `
            <h6 class="mt-3 mb-1">Recent Payments</h6>
            <table class="table table-sm small mb-0">
                <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Months</th></tr></thead>
                <tbody>${rows.map(p => `
                    <tr>
                        <td>${escapeHtml(p.payment_date instanceof Date ? p.payment_date.toISOString().slice(0, 10) : p.payment_date)}</td>
                        <td>৳${escapeHtml(Number(p.amount).toFixed(2))}</td>
                        <td>${escapeHtml(p.payment_method)}</td>
                        <td>${escapeHtml(p.months_paid)}</td>
                    </tr>`).join("")}
                </tbody>
            </table>`;
        }
    } catch (_) {}

    return `
<div>
    <h6 class="mb-1">${escapeHtml(c.name)} <span class="text-muted">(${escapeHtml(c.customer_id)})</span></h6>
    ${row("Mobile", c.phone)}
    ${row("Address", c.address)}
    ${row("Area", c.area_name)}
    ${row("Sub Area", c.sub_area_name)}
    ${row("PPPoE Username", c.pppoe_username)}
    ${row("Package", c.display_package)}
    ${row("Monthly Bill", c.display_bill)}
    ${row("Balance", c.balance)}
    ${row("Payment Status", c.payment_status)}
    ${row("Status", c.status)}
    ${row("Billing Cycle", c.billing_cycle)}
    ${row("Promise Date", c.promise_date)}
    ${row("Days Left", c.day_left)}
    ${payments}
</div>`;
}

module.exports.profileFragment = profileFragment;
