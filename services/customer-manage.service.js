
"use strict";

/*
|--------------------------------------------------------------------------
| CUSTOMER MANAGE SERVICE
|--------------------------------------------------------------------------
| Edit / Update / Delete / Profile / Profile Save
|--------------------------------------------------------------------------
*/

const db = require("../config/database");
const ppp = require("./ppp.service");

const STATUSES = ["Active", "Inactive", "Expired"];

class ManageError extends Error {
    constructor(message, httpCode = 400) {
        super(message);
        this.name = "ManageError";
        this.httpCode = httpCode;
    }
}

/* -----------------------------------------------------------------------
   HELPERS
------------------------------------------------------------------------ */

function isSuperAdmin(user = {}) {
    return String(user.role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "") === "superadmin";
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
    const prefix = alias ? `${alias}.` : "";

    if (isSuperAdmin(user)) {
        return { sql: "", params: [] };
    }

    const companyId = Number(user.company_id || 0);

    if (companyId <= 0) {
        throw new ManageError(
            "Company access is not configured for this account.",
            403
        );
    }

    return {
        sql: ` AND ${prefix}company_id = ?`,
        params: [companyId]
    };
}

function money(value) {
    return "৳" + Number(value || 0).toLocaleString("en-BD", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatDate(value) {
    if (!value) return "N/A";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    });
}

function dateTimeLocal(value) {
    if (!value) return "";

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) {
        const text = String(value);
        return text.length >= 16
            ? text.slice(0, 16).replace(" ", "T")
            : "";
    }

    const pad = n => String(n).padStart(2, "0");

    return (
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
        `T${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
}

function normalizeDate(value, label) {
    const text = String(value || "").trim();

    if (!text) return null;

    const normalized = text.replace("T", " ");

    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(normalized)) {
        throw new ManageError(`Invalid ${label}.`);
    }

    return normalized.length === 16
        ? `${normalized}:00`
        : normalized;
}

function optionalMoney(value, label) {
    if (value === undefined || value === null || value === "") {
        return 0;
    }

    const n = Number(value);

    if (!Number.isFinite(n) || n < 0) {
        throw new ManageError(`${label} must be a valid non-negative amount.`);
    }

    return n;
}

function normalizeBillingType(value) {
    const result = String(value || "Prepaid").trim();

    if (!["Prepaid", "Postpaid"].includes(result)) {
        throw new ManageError("Invalid billing type.");
    }

    return result;
}

async function logActivity(user, customerId, action, description) {
    try {
        await db.query(
            `INSERT INTO activity_logs
                (user_id, company_id, customer_id, action,
                 description, module, created_at)
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
        // Activity logging must not block the main action.
    }
}

async function getCustomer(user, id, columns = "*") {
    const s = scope(user);

    const [rows] = await db.query(
        `SELECT ${columns}
         FROM customers
         WHERE id = ?${s.sql}
         LIMIT 1`,
        [Number(id), ...s.params]
    );

    return rows[0] || null;
}

async function getRouter(user, routerId) {
    const s = scope(user);

    const [rows] = await db.query(
        `SELECT id, name, ip, username, password,
                port, use_ssl, timeout
         FROM mikrotik_servers
         WHERE id = ?${s.sql}
         LIMIT 1`,
        [Number(routerId), ...s.params]
    );

    return rows[0] || null;
}

/* -----------------------------------------------------------------------
   EDIT CUSTOMER FRAGMENT
------------------------------------------------------------------------ */

async function editFragment({ user, id }) {
    const c = await getCustomer(user, id);

    if (!c) {
        throw new ManageError("Customer not found or access denied.", 404);
    }

    const [packages] = await db.query(
        `SELECT id, package_name, price
         FROM mikrotik_packages
         WHERE router_id = ?
           AND company_id = ?
         ORDER BY package_name ASC`,
        [Number(c.mikrotik_id || 0), Number(c.company_id || 0)]
    );

    const pkgOptions = packages.map(p => `
        <option value="${Number(p.id)}"
            ${Number(p.id) === Number(c.package_id) ? "selected" : ""}>
            ${escapeHtml(p.package_name)} (${escapeHtml(money(p.price))})
        </option>
    `).join("");

    const statusOptions = STATUSES.map(s => `
        <option value="${s}"
            ${String(c.status || "").toLowerCase() === s.toLowerCase()
                ? "selected" : ""}>
            ${s}
        </option>
    `).join("");

    return `
<form action="/api/customers/update" method="POST">
    <input type="hidden" name="id" value="${Number(c.id)}">

    <div class="row g-2">
        <div class="col-md-6">
            <label class="form-label small">Customer ID</label>
            <input class="form-control form-control-sm"
                   value="${escapeHtml(c.customer_id)}" readonly>
        </div>

        <div class="col-md-6">
            <label class="form-label small">Name</label>
            <input class="form-control form-control-sm"
                   value="${escapeHtml(c.name)}" readonly>
        </div>

        <div class="col-md-6">
            <label class="form-label small">Mobile</label>
            <input class="form-control form-control-sm"
                   value="${escapeHtml(c.phone)}" readonly>
        </div>

        <div class="col-md-6">
            <label class="form-label small">Package *</label>
            <select name="package_id" class="form-select form-select-sm" required>
                <option value="">Select Package</option>
                ${pkgOptions}
            </select>
        </div>

        <div class="col-md-6">
            <label class="form-label small">PPPoE Name *</label>
            <input name="pppoe_name" class="form-control form-control-sm"
                   value="${escapeHtml(c.pppoe_username)}" required>
        </div>

        <div class="col-md-6">
            <label class="form-label small">New PPPoE Password *</label>
            <input name="password" type="password"
                   class="form-control form-control-sm"
                   autocomplete="new-password" required>
        </div>

        <div class="col-md-6">
            <label class="form-label small">Status</label>
            <select name="status" class="form-select form-select-sm">
                ${statusOptions}
            </select>
        </div>

        <div class="col-12">
            <label class="form-label small">Comment</label>
            <input name="comment" class="form-control form-control-sm"
                   value="${escapeHtml(c.comments)}" maxlength="255">
        </div>
    </div>

    <div class="form-text mt-2">
        Saving updates the PPPoE secret on MikroTik.
    </div>

    <div class="text-end mt-3">
        <button type="submit" class="btn btn-primary btn-sm">
            Update Customer
        </button>
    </div>
</form>`;
}

/* -----------------------------------------------------------------------
   UPDATE CUSTOMER / MIKROTIK
------------------------------------------------------------------------ */

async function updateCustomer({ user, body }) {
    const id = parseInt(body.id, 10) || 0;

    if (id <= 0) {
        throw new ManageError("Invalid customer ID.");
    }

    const newName = String(body.pppoe_name || "").trim();
    const newPassword = String(body.password || "").trim();
    const newPackageId = parseInt(body.package_id, 10) || 0;
    const newComment = String(body.comment || "").trim();

    let newStatus = String(body.status || "Active").trim();

    if (!newName) {
        throw new ManageError("PPPoE username is required.");
    }

    if (!newPassword) {
        throw new ManageError("PPPoE password is required.");
    }

    if (newPackageId <= 0) {
        throw new ManageError("Please select a package.");
    }

    if (!STATUSES.includes(newStatus)) {
        newStatus = "Active";
    }

    const customer = await getCustomer(
        user,
        id,
        `id, company_id, customer_id, mikrotik_id,
         package_id, pppoe_username, pppoe_password, comments, status`
    );

    if (!customer) {
        throw new ManageError("Customer not found or access denied.", 404);
    }

    const oldName = String(customer.pppoe_username || "").trim();
    const mikrotikId = Number(customer.mikrotik_id || 0);
    const s = scope(user);

    const [dupe] = await db.query(
        `SELECT id
         FROM customers
         WHERE pppoe_username = ?
           AND id != ?${s.sql}
         LIMIT 1`,
        [newName, id, ...s.params]
    );

    if (dupe.length) {
        throw new ManageError("This PPPoE username already exists.");
    }

    /*
     * Package must belong to this customer company and router.
     */
    const [pk] = await db.query(
        `SELECT *
         FROM mikrotik_packages
         WHERE id = ?
           AND company_id = ?
           AND router_id = ?
         LIMIT 1`,
        [
            newPackageId,
            Number(customer.company_id),
            mikrotikId
        ]
    );

    const pkg = pk[0];

    const profile = String(
        pkg?.mikrotik_profile ||
        pkg?.package_name ||
        pkg?.name ||
        pkg?.profile_id ||
        ""
    ).trim();

    if (!pkg || !profile) {
        throw new ManageError(
            "Selected package was not found for this MikroTik router."
        );
    }

    if (mikrotikId <= 0) {
        throw new ManageError("Customer has no MikroTik server assigned.");
    }

    const router = await getRouter(user, mikrotikId);

    if (!router) {
        throw new ManageError("MikroTik server not found or access denied.");
    }

    if (!String(router.ip || "").trim() ||
        !String(router.username || "").trim()) {
        throw new ManageError("MikroTik server configuration is incomplete.");
    }

    const session = ppp.createSession({
        companyId: customer.company_id,
        isSuper: true
    });

    try {
        let api;

        try {
            api = await session.api(mikrotikId);
        } catch (_) {
            throw new ManageError("MikroTik connection failed.");
        }

        let secret = null;

        if (oldName) {
            secret = await ppp.findSecret(api, oldName);
        }

        if (!secret && newName !== oldName) {
            secret = await ppp.findSecret(api, newName);
        }

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
        } catch (error) {
            throw new ManageError(
                `MikroTik update failed: ${error.message}`
            );
        }
    } finally {
        await session.closeAll();
    }

    try {
        await db.query(
            `UPDATE customers
             SET package_id = ?,
                 pppoe_username = ?,
                 pppoe_password = ?,
                 comments = ?,
                 status = ?
             WHERE id = ?${s.sql}
             LIMIT 1`,
            [
                newPackageId,
                newName,
                newPassword,
                newComment,
                newStatus,
                id,
                ...s.params
            ]
        );
    } catch (error) {
        throw new ManageError(
            `MikroTik updated successfully, but database update failed: ${error.message}`,
            500
        );
    }

    await logActivity(
        user,
        id,
        "customer_update",
        `Customer updated: ${customer.customer_id || id} | ` +
        `PPPoE: ${oldName} -> ${newName} | Status: ${newStatus}`
    );

    return "Customer updated successfully. MikroTik PPPoE also updated.";
}

/* -----------------------------------------------------------------------
   SAVE CUSTOMER PROFILE
------------------------------------------------------------------------ */

async function saveCustomerProfile({ user, body }) {
    const id = parseInt(body.id, 10) || 0;

    if (id <= 0) {
        throw new ManageError("Invalid customer ID.");
    }

    const customer = await getCustomer(
        user,
        id,
        `id, company_id, customer_id, mikrotik_id, package_id,
         pppoe_username, pppoe_password, comments, status`
    );

    if (!customer) {
        throw new ManageError("Customer not found or access denied.", 404);
    }

    const name = String(body.name || "").trim();
    const pppoeName = String(body.pppoe_name || "").trim();
    const packageId = parseInt(body.package_id, 10) || 0;

    if (!name) {
        throw new ManageError("Customer name is required.");
    }

    if (!pppoeName) {
        throw new ManageError("PPPoE username is required.");
    }

    if (packageId <= 0) {
        throw new ManageError("Please select a package.");
    }

    const monthlyBill = Number(body.monthly_bill);

    if (!Number.isFinite(monthlyBill) || monthlyBill < 0) {
        throw new ManageError("Monthly Fee must be a valid amount.");
    }

    const password = String(body.password || "").trim() ||
        String(customer.pppoe_password || "").trim();

    if (!password) {
        throw new ManageError(
            "No saved PPPoE password found. Enter a new PPPoE password."
        );
    }

    /*
     * updateCustomer performs:
     * - tenant-scoped customer lookup
     * - duplicate PPPoE check
     * - company/router-scoped package check
     * - MikroTik secret update
     * - PPPoE-related database update
     */
    await updateCustomer({
        user,
        body: {
            id,
            pppoe_name: pppoeName,
            password,
            package_id: packageId,
            comment: String(body.comment || "").trim(),
            status: String(body.status || "Active").trim()
        }
    });

    /*
     * Dynamically inspect the customer schema so optional columns
     * do not cause SQL errors when they do not exist.
     */
    const [columns] = await db.query("SHOW COLUMNS FROM customers");

    const columnTypes = new Map(
        columns.map(column => [
            column.Field,
            String(column.Type || "").toLowerCase()
        ])
    );

    const candidates = {
        name,
        phone: String(body.phone || "").trim(),
        monthly_bill: monthlyBill,
        nid_no: String(body.nid_no || "").trim(),
        address: String(body.address || "").trim(),
        division: String(body.division || "").trim(),
        district: String(body.district || "").trim(),
        upazila: String(body.upazila || "").trim(),
        email: String(body.email || "").trim(),
        connection_date: normalizeDate(body.connection_date, "connection date"),
        connection_fee: optionalMoney(body.connection_fee, "Connection Fee"),
        connection_fee_due: optionalMoney(
            body.connection_fee_due,
            "Connection Fee Due"
        ),
        billing_type: normalizeBillingType(body.billing_type)
    };

    const updates = [];

    for (const [column, value] of Object.entries(candidates)) {
        if (columnTypes.has(column)) {
            updates.push([column, value]);
        }
    }

    /*
     * Only update area/sub_area as text when the actual DB columns
     * are textual. Numeric foreign-key columns are deliberately skipped.
     */
    for (const column of ["area", "sub_area"]) {
        const type = columnTypes.get(column) || "";

        if (/char|text|enum|set/.test(type)) {
            updates.push([
                column,
                String(body[column] || "").trim()
            ]);
        }
    }

    if (updates.length) {
        const s = scope(user);

        const setClause = updates
            .map(([column]) => `\`${column}\` = ?`)
            .join(", ");

        const values = updates.map(([, value]) => value);

        await db.query(
            `UPDATE customers
             SET ${setClause}
             WHERE id = ?${s.sql}
             LIMIT 1`,
            [...values, id, ...s.params]
        );
    }

    await logActivity(
        user,
        id,
        "customer_profile_update",
        `Profile updated: ${customer.customer_id || id}`
    );

    return "Customer profile saved successfully. MikroTik PPPoE updated.";
}

/* -----------------------------------------------------------------------
   BILLING HISTORY / DELETE
------------------------------------------------------------------------ */

async function tableHasColumn(table, column) {
    try {
        const [tables] = await db.query("SHOW TABLES LIKE ?", [table]);

        if (!tables.length) return false;

        const [columns] = await db.query(
            `SHOW COLUMNS FROM \`${table}\` LIKE ?`,
            [column]
        );

        return columns.length > 0;
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
        if (!(await tableHasColumn(table, "customer_id"))) {
            continue;
        }

        const [rows] = await db.query(
            `SELECT customer_id
             FROM \`${table}\`
             WHERE customer_id = ?
             LIMIT 1`,
            [Number(customerId)]
        );

        if (rows.length) return true;
    }

    return false;
}

async function deleteCustomer({ user, id }) {
    id = parseInt(id, 10) || 0;

    if (id <= 0) {
        throw new ManageError("Invalid customer ID.");
    }

    const customer = await getCustomer(
        user,
        id,
        `id, customer_id, name, pppoe_username, mikrotik_id, company_id`
    );

    if (!customer) {
        throw new ManageError("Customer not found or access denied.", 404);
    }

    if (await hasBillingHistory(customer.id)) {
        throw new ManageError(
            "Customer cannot be deleted because billing/payment history exists."
        );
    }

    const s = scope(user);
    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const [result] = await conn.query(
            `DELETE FROM customers
             WHERE id = ?${s.sql}
             LIMIT 1`,
            [Number(customer.id), ...s.params]
        );

        if (result.affectedRows !== 1) {
            throw new ManageError(
                "Customer could not be deleted or access was denied."
            );
        }

        await conn.commit();
    } catch (error) {
        try {
            await conn.rollback();
        } catch (_) {}

        throw error instanceof ManageError
            ? error
            : new ManageError("Customer could not be deleted.", 500);
    } finally {
        conn.release();
    }

    await logActivity(
        user,
        customer.id,
        "customer_delete",
        `Customer deleted: ${customer.name || ""} | ` +
        `Customer ID: ${customer.customer_id || ""} | ` +
        `PPPoE: ${customer.pppoe_username || ""}`
    );

    let mikrotikNote = "";

    const mikrotikId = Number(customer.mikrotik_id || 0);
    const pppoe = String(customer.pppoe_username || "").trim();

    if (mikrotikId > 0 && pppoe) {
        const session = ppp.createSession({
            companyId: customer.company_id,
            isSuper: true
        });

        try {
            const api = await session.api(mikrotikId);
            const secret = await ppp.findSecret(api, pppoe);

            if (secret) {
                await api.write("/ppp/secret/remove", [
                    `=.id=${secret[".id"]}`
                ]);

                await ppp.kick(api, pppoe);
            }
        } catch (error) {
            console.error(
                `Delete MikroTik warning [${id}]:`,
                error.message
            );

            mikrotikNote =
                " (MikroTik secret could not be removed - please remove it manually.)";
        } finally {
            await session.closeAll();
        }
    }

    return `Customer deleted successfully.${mikrotikNote}`;
}

/* -----------------------------------------------------------------------
   PROFILE FRAGMENT
------------------------------------------------------------------------ */

async function profileFragment({ user, id }) {
    id = Number(id);

    if (!Number.isInteger(id) || id <= 0) {
        throw new ManageError("Invalid customer ID.");
    }

    const customerService = require("./customer.service");

    const c = await customerService.getCustomerById({ user, id });

    if (!c) {
        throw new ManageError("Customer not found or access denied.", 404);
    }

    const e = escapeHtml;

    const val = (...values) => {
        for (const value of values) {
            if (value !== undefined && value !== null && value !== "") {
                return value;
            }
        }

        return "";
    };

    const date = value => value ? formatDate(value) : "N/A";

    const status = String(c.status || "Inactive");
    const paymentStatus = String(c.payment_status || "Unpaid");

    const statusLower = status.toLowerCase();
    const paymentLower = paymentStatus.toLowerCase();

    const statusClass = [
        "active", "paid", "connected", "on"
    ].includes(statusLower)
        ? "bg-success"
        : ["pending", "processing"].includes(statusLower)
            ? "bg-warning text-dark"
            : ["expired", "inactive", "blocked", "off", "unpaid"].includes(statusLower)
                ? "bg-danger"
                : "bg-secondary";

    const paymentClass = [
        "paid", "complete", "completed"
    ].includes(paymentLower)
        ? "bg-success"
        : ["pending", "partial"].includes(paymentLower)
            ? "bg-warning text-dark"
            : ["unpaid", "due", "expired"].includes(paymentLower)
                ? "bg-danger"
                : "bg-secondary";

    const detailRows = [
        ["Mikrotik", val(c.mikrotik_name, c.router_name) || "N/A"],
        ["Status", `<span class="badge ${statusClass}">${e(status)}</span>`, true],
        ["Payment Status", `<span class="badge ${paymentClass}">${e(paymentStatus)}</span>`, true],
        ["Monthly Fee", money(val(c.display_bill, c.monthly_bill, 0))],
        ["Balance", money(c.balance)],
        ["Package", val(c.display_package, c.package_name) || "N/A"],
        ["Auto Connection", Number(c.auto_connection ?? c.customer_auto_connection ?? 0) ? "On" : "Off"],
        ["Billing Date", date(val(c.billing_date, c.billing_cycle))],
        ["Promise Date", date(c.promise_date)],
        ["Area", val(c.area_name, c.area) || "N/A"],
        ["Sub-Area", val(c.sub_area_name, c.sub_area) || "N/A"],
        ["Division", val(c.division) || "N/A"],
        ["District", val(c.district) || "N/A"],
        ["NID No", val(c.nid_no) || "N/A"],
        ["Address", val(c.address) || "N/A"],
        ["Mobile", val(c.phone) || "N/A"],
        ["PPPoE Name", val(c.pppoe_username) || "N/A"],
        ["Created", date(val(c.created_at, c.created_date))]
    ];

    const detailHtml = detailRows.map(([label, value, html]) => `
        <tr>
            <td class="text-muted">${e(label)}</td>
            <td class="fw-semibold">${html ? value : e(value)}</td>
        </tr>
    `).join("");

    const [packages] = await db.query(
        `SELECT id, package_name, price
         FROM mikrotik_packages
         WHERE router_id = ?
           AND company_id = ?
         ORDER BY package_name`,
        [Number(c.mikrotik_id || 0), Number(c.company_id || 0)]
    );

    const packageOptions = packages.map(p => `
        <option value="${Number(p.id)}"
            ${Number(p.id) === Number(c.package_id) ? "selected" : ""}>
            ${e(p.package_name)} — ${e(money(p.price))}
        </option>
    `).join("");

    const field = (label, name, value, type = "text", extra = "") => `
        <div class="cp-field">
            <label class="form-label">${e(label)}</label>
            <input class="form-control form-control-sm"
                   type="${e(type)}"
                   name="${e(name)}"
                   value="${e(value ?? "")}"
                   ${extra}>
        </div>
    `;

    let paymentsHtml = `
        <div class="text-muted small py-3">No payment records found.</div>
    `;

    try {
        const [payments] = await db.query(
            `SELECT amount, payment_method, payment_date, months_paid
             FROM payments
             WHERE customer_id = ?
             ORDER BY id DESC
             LIMIT 10`,
            [id]
        );

        if (payments.length) {
            paymentsHtml = `
                <div class="table-responsive">
                    <table class="table table-sm align-middle mb-0">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Amount</th>
                                <th>Method</th>
                                <th>Months</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${payments.map(p => `
                                <tr>
                                    <td>${e(date(p.payment_date))}</td>
                                    <td>${e(money(p.amount))}</td>
                                    <td>${e(p.payment_method || "N/A")}</td>
                                    <td>${e(p.months_paid ?? 0)}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            `;
        }
    } catch (error) {
        console.error("PROFILE PAYMENT HISTORY:", error.message);
    }

    const phone = String(c.phone || "").replace(/\D/g, "");
    const whatsappPhone = phone.startsWith("0")
        ? "88" + phone.slice(1)
        : phone;

    return `
<div class="customer-profile-view">
<style>
.customer-profile-modal .modal-dialog {
    max-width:850px;
    width:calc(100% - 20px);
}
.customer-profile-modal .customer-profile-body {
    max-height:calc(100vh - 150px);
    overflow-y:auto;
    overflow-x:hidden;
    scrollbar-width:thin;
    scrollbar-color:#adb5bd transparent;
}
.customer-profile-modal .profile-detail-scroll {
    max-height:calc(100vh - 310px);
    overflow-y:auto;
    overflow-x:hidden;
    scrollbar-width:thin;
}
.customer-profile-modal .update-profile-scroll {
    max-height:calc(100vh - 210px);
    overflow-y:auto;
    overflow-x:hidden;
    scrollbar-width:thin;
}
.customer-profile-modal .profile-avatar {
    width:45px;
    height:45px;
    min-width:45px;
    font-size:20px;
}
.customer-profile-modal .profile-detail-scroll td {
    vertical-align:middle;
    padding-top:6px;
    padding-bottom:6px;
    font-size:13px;
}
.customer-profile-view .cp-field {
    margin-bottom:10px;
}
.customer-profile-view .cp-field .form-label {
    font-size:12px;
    font-weight:600;
    margin-bottom:4px;
}
.customer-profile-view .cp-setting {
    display:flex;
    align-items:center;
    gap:9px;
    padding:10px 12px;
    width:100%;
    text-align:left;
    border:0;
    border-radius:6px;
    background:transparent;
    color:var(--bs-body-color);
    text-decoration:none;
    font-size:13px;
}
.customer-profile-view .cp-setting:hover {
    background:var(--bs-tertiary-bg);
}
.customer-profile-view .cp-card {
    border:0;
    border-radius:8px;
    background:var(--bs-body-bg);
    box-shadow:0 .125rem .25rem rgba(0,0,0,.075);
    margin-bottom:12px;
    overflow:hidden;
}
.customer-profile-view .cp-card-title {
    padding:9px 12px;
    background:var(--bs-body-bg);
    border-bottom:1px solid var(--bs-border-color);
    font-weight:700;
    font-size:14px;
}
.customer-profile-view .cp-card-body {
    padding:12px;
}
@media(max-width:991.98px) {
    .customer-profile-modal .modal-dialog {
        max-width:100%;
        width:calc(100% - 10px);
        margin:5px auto;
    }
    .customer-profile-modal .customer-profile-body {
        max-height:calc(100vh - 120px);
    }
    .customer-profile-modal .profile-detail-scroll,
    .customer-profile-modal .update-profile-scroll {
        max-height:none;
        overflow:visible;
    }
}
@media(max-width:575.98px) {
    .customer-profile-modal .modal-header {
        padding:10px!important;
    }
    .customer-profile-modal .profile-avatar {
        width:40px;
        height:40px;
        min-width:40px;
        font-size:17px;
    }
    .customer-profile-modal .modal-header h5 {
        font-size:15px;
    }
    .customer-profile-modal .modal-header .small {
        font-size:11px!important;
    }
    .customer-profile-modal .modal-body {
        padding:8px!important;
    }
}
</style>

<div class="modal-dialog modal-dialog-centered">
<div class="modal-content shadow customer-profile-modal">

    <div class="modal-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
        <div class="d-flex align-items-center gap-3">
            <div class="rounded-circle bg-secondary text-white d-flex align-items-center justify-content-center profile-avatar">
                <i class="fa fa-user"></i>
            </div>
            <div>
                <h5 class="mb-0 fw-bold text-dark">${e(c.name || "N/A")}</h5>
                <div class="d-flex flex-wrap gap-2 gap-lg-3 text-muted small mt-1">
                    <span><i class="fa fa-id-card me-1 text-primary"></i>${e(c.customer_id || "N/A")}</span>
                    <span><i class="fa fa-user-lock me-1 text-primary"></i>${e(c.pppoe_username || "N/A")}</span>
                    <span><i class="fa fa-map-marker-alt me-1"></i>${e(c.address || "N/A")}</span>
                    <span><i class="fa fa-phone me-1 text-success"></i>${e(c.phone || "N/A")}</span>
                    <span><i class="fa fa-clock me-1"></i>${e(date(val(c.created_at, c.created_date)))}</span>
                </div>
            </div>
        </div>
        <div class="d-flex align-items-center gap-2">
            <button type="button"
                    class="btn btn-outline-danger btn-sm delete-customer-btn"
                    data-id="${Number(c.id)}">
                <i class="fa fa-trash-alt me-1"></i> Delete Profile
            </button>
            <button type="button" class="btn-close"
                    data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
    </div>

    <div class="modal-body bg-light p-3 customer-profile-body">
        <div class="row g-3">

            <div class="col-12 col-lg-4">
                <div class="cp-card">
                    <div class="cp-card-title">Profile Setting</div>
                    <div class="cp-card-body p-2">
                        <a href="#cp-update-profile"
                           class="cp-setting active"
                           style="background:var(--bs-primary);color:#fff">
                            <i class="fa fa-edit"></i> Update Profile
                        </a>
                        <button type="button" class="cp-setting"
                                data-profile-action="recharge"
                                data-id="${Number(c.id)}">
                            <i class="fa fa-wallet"></i> Recharge
                        </button>
                        <button type="button" class="cp-setting"
                                data-profile-action="report"
                                data-id="${Number(c.id)}">
                            <i class="fa fa-file-alt"></i> Report
                        </button>
                        <a class="cp-setting"
                           href="${whatsappPhone ? `https://wa.me/${e(whatsappPhone)}` : "#"}"
                           target="_blank" rel="noopener">
                            <i class="fab fa-whatsapp"></i> Message
                        </a>
                        <button type="button" class="cp-setting"
                                data-profile-action="reset-password"
                                data-id="${Number(c.id)}">
                            <i class="fa fa-key"></i> Reset Password
                        </button>
                    </div>
                </div>

                <div class="cp-card">
                    <div class="cp-card-title">Profile Detail</div>
                    <div class="cp-card-body p-2 profile-detail-scroll">
                        <table class="table table-sm table-borderless mb-0">
                            <tbody>${detailHtml}</tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="col-12 col-lg-8">
                <div class="cp-card" id="cp-update-profile">
                    <div class="cp-card-title">Update Profile</div>
                    <div class="cp-card-body update-profile-scroll">

                        <form id="customerProfileUpdateForm"
                              data-customer-id="${Number(c.id)}"
                              autocomplete="off">
                            <input type="hidden" name="id" value="${Number(c.id)}">

                            <div class="row">
                                ${field("Customer ID *", "customer_id", c.customer_id, "text", "readonly")}

                                <div class="cp-field col-12">
                                    <label class="form-label">Package *</label>
                                    <select name="package_id" class="form-select form-select-sm" required>
                                        <option value="">Select Package</option>
                                        ${packageOptions}
                                    </select>
                                </div>

                                ${field("Monthly Fee *", "monthly_bill",
                                    val(c.display_bill, c.monthly_bill, 0),
                                    "number", 'min="0" step="0.01" required')}

                                ${field("Name *", "name", c.name, "text", "required")}
                                ${field("PPPoE Name *", "pppoe_name", c.pppoe_username, "text", "required")}
                                ${field("Mobile", "phone", c.phone)}
                                ${field("New PPPoE Password", "password", "", "password",
                                    'placeholder="Leave blank to keep current password" autocomplete="new-password"')}
                                ${field("NID No", "nid_no", c.nid_no)}

                                <div class="cp-field col-12 col-md-6">
                                    <label class="form-label">Status *</label>
                                    <select name="status" class="form-select form-select-sm" required>
                                        ${STATUSES.map(s => `
                                            <option value="${s}"
                                                ${s.toLowerCase() === status.toLowerCase() ? "selected" : ""}>
                                                ${s}
                                            </option>
                                        `).join("")}
                                    </select>
                                </div>

                                ${field("Area", "area", val(c.area_name, c.area))}
                                ${field("Sub-Area", "sub_area", val(c.sub_area_name, c.sub_area))}
                                ${field("Billing Cycle", "billing_cycle",
                                    c.billing_cycle ? date(c.billing_cycle) : "",
                                    "text", "readonly")}
                                ${field("Promise Date", "promise_date",
                                    c.promise_date ? date(c.promise_date) : "",
                                    "text", "readonly")}
                                ${field("Division", "division", c.division)}
                                ${field("District", "district", c.district)}
                                ${field("Upazila / Thana", "upazila", val(c.upazila, c.thana))}
                                ${field("Address", "address", c.address)}
                                ${field("E-mail", "email", c.email, "email")}
                                ${field("Connection Date", "connection_date",
                                    dateTimeLocal(c.connection_date), "datetime-local")}
                                ${field("Connection Fee", "connection_fee",
                                    c.connection_fee, "number", 'min="0" step="0.01"')}
                                ${field("Connection Fee Due", "connection_fee_due",
                                    c.connection_fee_due, "number", 'min="0" step="0.01"')}

                                <div class="cp-field col-12 col-md-6">
                                    <label class="form-label">Billing Type</label>
                                    <select name="billing_type" class="form-select form-select-sm">
                                        <option value="Prepaid"
                                            ${String(c.billing_type || "Prepaid").toLowerCase() === "prepaid" ? "selected" : ""}>
                                            Prepaid
                                        </option>
                                        <option value="Postpaid"
                                            ${String(c.billing_type || "").toLowerCase() === "postpaid" ? "selected" : ""}>
                                            Postpaid
                                        </option>
                                    </select>
                                </div>

                                <div class="cp-field col-12">
                                    <label class="form-label">Comment</label>
                                    <textarea name="comment" class="form-control form-control-sm"
                                              rows="2">${e(c.comments || "")}</textarea>
                                </div>
                            </div>

                            <div class="d-flex justify-content-end gap-2 mt-3">
                                <button type="reset" class="btn btn-outline-secondary btn-sm">
                                    Reset
                                </button>
                                <button type="submit" class="btn btn-primary btn-sm">
                                    <i class="fa fa-save me-1"></i> Save Profile
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                    </div>

        </div>
    </div>
</div>
</div>`;
}

/* -----------------------------------------------------------------------
   EXPORTS
------------------------------------------------------------------------ */

module.exports = {
    ManageError,
    editFragment,
    updateCustomer,
    saveCustomerProfile,
    deleteCustomer,
    hasBillingHistory,
    escapeHtml,
    getCustomer,
    scope,
    profileFragment
};
