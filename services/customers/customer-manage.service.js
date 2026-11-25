
"use strict";

/*
|--------------------------------------------------------------------------
| CUSTOMER MANAGE SERVICE
|--------------------------------------------------------------------------
| Edit / Update / Delete / Profile / Profile Save
|--------------------------------------------------------------------------
*/

const db = require("../../config/database");
const ppp = require("../ppp.service");
const fs = require("fs/promises");
const path = require("path");

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

function dateOnly(value) {
    if (!value) return "";

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) {
        const text = String(value);
        return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
    }

    const pad = n => String(n).padStart(2, "0");

    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function normalizeDateOnly(value, label) {
    const text = String(value || "").trim();

    if (!text) return null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        throw new ManageError(`Invalid ${label}.`);
    }

    return text;
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
   EDIT CUSTOMER FRAGMENT — PHP TEMPLATE
------------------------------------------------------------------------ */

async function editFragment({ user, id }) {
    const c = await getCustomer(user, id);

    if (!c) {
        throw new ManageError(
            "Customer not found or access denied.",
            404
        );
    }

    const e = escapeHtml;

    // Safely load the existing HTML template.
    const templatePath = path.join(__dirname, "..", "..", "views", "customers", "customer-edit.html");

    let html;

    try {
        html = await fs.readFile(templatePath, "utf8");
    } catch (error) {
        console.error("CUSTOMER EDIT TEMPLATE:", error.message);

        throw new ManageError(
            "Edit template could not be loaded: views/edit.html",
            500
        );
    }

    const companyId = Number(c.company_id || 0);
    const routerId = Number(c.mikrotik_id || 0);

    // Find the assigned MikroTik router.
    let router = null;

    if (routerId > 0) {
        router = await getRouter(user, routerId);
    }

    // Comment: the database copy first. When it is empty (customer imported /
    // synced, or the comment was written on the router) read it from the
    // MikroTik PPPoE secret, so saving the form never wipes it.
    let commentValue = String(c.comments || "").trim();
    let commentHint = "";

    if (!commentValue && !(routerId > 0)) {
        commentHint = "এই কাস্টমারের MikroTik সেট করা নেই";
    } else if (!commentValue && routerId > 0 && String(c.pppoe_username || "").trim()) {
        const session = ppp.createSession({ companyId, isSuper: true });

        try {
            const api = await Promise.race([
                session.api(routerId),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("timeout")), 8000))
            ]);

            const secret = await ppp.findSecret(
                api,
                String(c.pppoe_username).trim()
            );

            commentValue = String(secret?.comment || "").trim();

            if (!secret) {
                commentHint = "MikroTik-এ এই PPPoE সিক্রেট পাওয়া যায়নি";
            } else if (!commentValue) {
                commentHint = "MikroTik-এ এই PPPoE-র কমেন্ট ফাঁকা";
            }

            if (commentValue) {
                await db.query(
                    `UPDATE customers SET comments = ?
                     WHERE id = ? AND (comments IS NULL OR comments = '')`,
                    [commentValue, Number(c.id)]
                ).catch(() => {});
            }
        } catch (error) {
            console.error("EDIT MIKROTIK COMMENT:", error.message);
            commentHint = "রাউটার থেকে কমেন্ট পড়া যায়নি: " +
                String(error.message || "").slice(0, 80);
        } finally {
            try { await session.closeAll(); } catch (_) {}
        }
    }

    // Load packages assigned to this router and company.
    let packages = [];

    if (routerId > 0 && companyId > 0) {
        const [rows] = await db.query(
            `SELECT id, package_name, price
             FROM mikrotik_packages
             WHERE router_id = ?
               AND company_id = ?
             ORDER BY package_name ASC`,
            [routerId, companyId]
        );

        packages = rows;
    }

    const packageOptions = [
        `<option value="">Select Package</option>`,
        ...packages.map(p => `
            <option value="${Number(p.id)}"
                ${Number(p.id) === Number(c.package_id)
                    ? "selected"
                    : ""}>
                ${e(p.package_name)} — ${e(money(p.price))}
            </option>
        `)
    ].join("");

    // Load Area options only if the required table/columns exist.
    let areaOptions = `<option value="">Select Area</option>`;
    let subAreaOptions =
        `<option value="">Select Sub-Area</option>`;

    try {
        const [areaColumns] = await db.query(
            "SHOW COLUMNS FROM areas"
        );

        const areaFields = new Set(
            areaColumns.map(col => col.Field)
        );

        if (
            areaFields.has("id") &&
            areaFields.has("name") &&
            areaFields.has("company_id")
        ) {
            const [areas] = await db.query(
                `SELECT id, name
                 FROM areas
                 WHERE company_id = ?
                 ${areaFields.has("mikrotik_id")
                    ? "AND (mikrotik_id = ? OR mikrotik_id IS NULL OR mikrotik_id = 0)"
                    : ""}
                 ORDER BY name ASC`,
                areaFields.has("mikrotik_id")
                    ? [companyId, routerId]
                    : [companyId]
            );

            areaOptions = [
                `<option value="">Select Area</option>`,
                ...areas.map(a => `
                    <option value="${Number(a.id)}"
                        ${Number(a.id) === Number(c.area_id)
                            ? "selected"
                            : ""}>
                        ${e(a.name)}
                    </option>
                `)
            ].join("");
        }
    } catch (error) {
        console.error("EDIT AREA OPTIONS:", error.message);
    }

    // Load Sub-Areas through their parent Area.
    try {
        const [subColumns] = await db.query(
            "SHOW COLUMNS FROM sub_areas"
        );

        const subFields = new Set(
            subColumns.map(col => col.Field)
        );

        if (
            subFields.has("id") &&
            subFields.has("area_id") &&
            subFields.has("name")
        ) {
            const selectedAreaId = Number(c.area_id || 0);

            if (selectedAreaId > 0) {
                const areaScope = scope(user, "a");

                const [subAreas] = await db.query(
                    `SELECT sa.id, sa.name
                     FROM sub_areas sa
                     INNER JOIN areas a ON a.id = sa.area_id
                     WHERE sa.area_id = ?
                       ${areaScope.sql}
                     ORDER BY sa.name ASC`,
                    [selectedAreaId, ...areaScope.params]
                );

                subAreaOptions = [
                    `<option value="">Select Sub-Area</option>`,
                    ...subAreas.map(sa => `
                        <option value="${Number(sa.id)}"
                            ${Number(sa.id) === Number(c.sub_area_id)
                                ? "selected"
                                : ""}>
                            ${e(sa.name)}
                        </option>
                    `)
                ].join("");
            }
        }
    } catch (error) {
        console.error("EDIT SUB-AREA OPTIONS:", error.message);
    }

    // Customer and payment statuses.
    const status = String(c.status || "Inactive");
    const paymentStatus = String(c.payment_status || "Unpaid");

    const statusClass =
        status.toLowerCase() === "active"
            ? "bg-success"
            : status.toLowerCase() === "pending"
                ? "bg-warning text-dark"
                : "bg-danger";

    const paymentClass =
        paymentStatus.toLowerCase() === "paid"
            ? "bg-success"
            : paymentStatus.toLowerCase() === "pending"
                ? "bg-warning text-dark"
                : "bg-danger";

    const statusOptions = STATUSES.map(s => `
        <option value="${e(s)}"
            ${s.toLowerCase() === status.toLowerCase()
                ? "selected"
                : ""}>
            ${e(s)}
        </option>
    `).join("");

    // A stored PPPoE password is never exposed in the HTML.
    const csrfToken = String(
        user.csrf_token || user.csrfToken || ""
    );

    const values = {
        CUSTOMER_NAME: e(c.name || ""),
        STATUS_CLASS: statusClass,
        STATUS: e(status),
        PAYMENT_CLASS: paymentClass,
        PAYMENT_STATUS: e(paymentStatus),

        ID: Number(c.id),
        CSRF_TOKEN: e(csrfToken),
        CUSTOMER_ID: e(c.customer_id || ""),
        MIKROTIK_NAME: e(router?.name || "N/A"),
        MIKROTIK_ID: routerId,

        PACKAGE_OPTIONS: packageOptions,
        MONTHLY_FEE: e(
            money(c.monthly_bill ?? c.display_bill ?? 0)
        ),
        BALANCE: e(money(c.balance ?? 0)),

        PPPOE_NAME: e(c.pppoe_username || ""),
        PPPOE_PASSWORD: "",
        AREA_OPTIONS: areaOptions,
        SUB_AREA_OPTIONS: subAreaOptions,

        PHONE: e(c.phone || ""),
        NID: e(c.nid_no || c.nid || ""),
        BIRTH_DATE: e(c.birth_date || ""),
        ADDRESS: e(c.address || ""),
        EMAIL: e(c.email || ""),

        BILLING_CYCLE: e(c.billing_cycle || c.billing_date || ""),
        PROMISE_DATE: e(c.promise_date || ""),
        CONNECTION_DATE: e(c.connection_date || ""),
        CONNECTION_FEE: e(money(c.connection_fee || 0)),
        BILLING_TYPE: e(c.billing_type || "Prepaid"),

        DIVISION: e(c.division || ""),
        DISTRICT: e(c.district || ""),
        UPAZILA: e(c.upazila || c.thana || ""),
        COMMENT: e(commentValue),
        COMMENT_HINT: e(commentHint),
        STATUS_OPTIONS: statusOptions,

        AUTO_CONNECTION:
            Number(c.auto_connection ?? 1) ? "On" : "Off",

        // ---- Raw values used by the editable form ----
        PACKAGE_ID: Number(c.package_id || 0),
        AREA_ID: Number(c.area_id || 0),
        SUB_AREA_ID: Number(c.sub_area_id || 0),

        // Division / District / Upazila are stored as text names;
        // the browser script matches them by name against the API lists.
        DIVISION_ID: e(c.division || ""),
        DISTRICT_ID: e(c.district || ""),
        UPAZILA_ID: e(c.upazila || c.thana || ""),

        MONTHLY_FEE_RAW: e(Number(c.monthly_bill ?? c.display_bill ?? 0)),
        PASSWORD: e(c.pppoe_password || ""),
        BALANCE_RAW: e(Number(c.balance ?? 0).toFixed(2)),
        BILLING_CYCLE_RAW: e(dateTimeLocal(c.billing_cycle || c.billing_date)),
        PROMISE_DATE_RAW: e(dateTimeLocal(c.promise_date)),
        CONNECTION_DATE_RAW: e(dateTimeLocal(c.connection_date)),
        CONNECTION_FEE_RAW: e(Number(c.connection_fee || 0)),
        BIRTH_DATE_RAW: e(dateOnly(c.birth_date)),

        PREPAID_SELECTED:
            String(c.billing_type || "Prepaid").toLowerCase() === "postpaid"
                ? "" : "selected",
        POSTPAID_SELECTED:
            String(c.billing_type || "").toLowerCase() === "postpaid"
                ? "selected" : "",

        ACTIVE_CHECKED:
            status.toLowerCase() === "active" ? "checked" : "",
        INACTIVE_CHECKED:
            status.toLowerCase() === "inactive" ? "checked" : "",
        EXPIRED_CHECKED:
            status.toLowerCase() === "expired" ? "checked" : "",

        AUTO_CONTINUE_CHECKED:
            Number(c.auto_connection ?? 1) ? "checked" : "",
        AUTO_NEXT_MONTH_CHECKED:
            Number(c.auto_next_month ?? c.auto_connection_next_month ?? 0)
                ? "checked" : ""
    };

    // Replace known template placeholders.
    for (const [key, value] of Object.entries(values)) {
        html = html.split(`{{${key}}}`).join(String(value));
    }

    // Never send unresolved placeholders to the browser.
    html = html.replace(
        /\{\{[A-Z0-9_]+\}\}/g,
        ""
    );

    return html;
}

/* -----------------------------------------------------------------------
   UPDATE CUSTOMER / MIKROTIK
------------------------------------------------------------------------ */

async function updateCustomer({ user, body }) {
    const id = parseInt(body.id, 10) || 0;

    if (id <= 0) {
        throw new ManageError("Invalid customer ID.");
    }

    // A key counts as "sent" only when it is present in the request.
    // This keeps saveCustomerProfile() (which sends fewer keys) working.
    const has = key => body[key] !== undefined;

    const newName = String(body.pppoe_name || "").trim();
    const newPassword = String(body.password || "").trim();
    const newPackageId = parseInt(body.package_id, 10) || 0;
    let newComment = String(body.comment || "").trim();

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

    const customer = await getCustomer(user, id);

    if (!customer) {
        throw new ManageError("Customer not found or access denied.", 404);
    }

    // Column names that really exist in the customers table.
    const columnSet = new Set(Object.keys(customer));

    const oldName = String(customer.pppoe_username || "").trim();
    const oldRouterId = Number(customer.mikrotik_id || 0);
    const newRouterId = has("mikrotik_id")
        ? (parseInt(body.mikrotik_id, 10) || 0)
        : oldRouterId;
    const routerChanged = newRouterId !== oldRouterId;
    const s = scope(user);

    if (newRouterId <= 0) {
        throw new ManageError("Please select a MikroTik server.");
    }

    // ---- PPPoE username must be unique ----
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

    // ---- Customer ID must be unique (when changed) ----
    let newCustomerId = null;

    if (has("customer_id")) {
        newCustomerId = String(body.customer_id || "").trim();

        if (!newCustomerId) {
            throw new ManageError("Customer ID is required.");
        }

        if (newCustomerId !== String(customer.customer_id || "")) {
            const [cidDupe] = await db.query(
                `SELECT id
                 FROM customers
                 WHERE customer_id = ?
                   AND id != ?${s.sql}
                 LIMIT 1`,
                [newCustomerId, id, ...s.params]
            );

            if (cidDupe.length) {
                throw new ManageError("This Customer ID already exists.");
            }
        }
    }

    // ---- Package must belong to this company and the (new) router ----
    const [pk] = await db.query(
        `SELECT *
         FROM mikrotik_packages
         WHERE id = ?
           AND company_id = ?
           AND router_id = ?
         LIMIT 1`,
        [newPackageId, Number(customer.company_id), newRouterId]
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

    const router = await getRouter(user, newRouterId);

    if (!router) {
        throw new ManageError("MikroTik server not found or access denied.");
    }

    if (!String(router.ip || "").trim() ||
        !String(router.username || "").trim()) {
        throw new ManageError("MikroTik server configuration is incomplete.");
    }

    // ---- Optional editable fields (validated before touching MikroTik) ----
    const pairs = [
        ["package_id", newPackageId],
        ["pppoe_username", newName],
        ["pppoe_password", newPassword],
        ["comments", newComment],
        ["status", newStatus]
    ];

    const put = (column, value) => {
        if (columnSet.has(column)) pairs.push([column, value]);
    };

    if (routerChanged) put("mikrotik_id", newRouterId);
    if (newCustomerId !== null) put("customer_id", newCustomerId);

    if (has("name")) {
        const name = String(body.name || "").trim();

        if (!name) throw new ManageError("Customer name is required.");

        put("name", name);
    }

    if (has("monthly_bill")) {
        const fee = Number(body.monthly_bill);

        if (!Number.isFinite(fee) || fee < 0) {
            throw new ManageError("Monthly Fee must be a valid amount.");
        }

        put("monthly_bill", fee);
    }

    if (has("balance")) {
        const balance = Number(body.balance === "" ? 0 : body.balance);

        if (!Number.isFinite(balance)) {
            throw new ManageError("Balance must be a valid number.");
        }

        put("balance", balance);
    }

    if (has("billing_cycle")) {
        const value = normalizeDate(body.billing_cycle, "billing cycle");

        if (!value) throw new ManageError("Billing Cycle is required.");

        put(columnSet.has("billing_cycle") ? "billing_cycle" : "billing_date", value);
    }

    if (has("promise_date")) {
        put("promise_date", normalizeDate(body.promise_date, "promise date"));
    }

    if (has("connection_date")) {
        put("connection_date", normalizeDate(body.connection_date, "connection date"));
    }

    if (has("birth_date")) {
        put("birth_date", normalizeDateOnly(body.birth_date, "birth date"));
    }

    if (has("connection_fee")) {
        put("connection_fee", optionalMoney(body.connection_fee, "Connection Fee"));
    }

    if (has("connection_fee_due")) {
        put(
            "connection_fee_due",
            optionalMoney(body.connection_fee_due, "Connection Fee Due")
        );
    }

    if (has("billing_type")) {
        put("billing_type", normalizeBillingType(body.billing_type));
    }

    for (const field of ["phone", "nid_no", "address", "email"]) {
        if (has(field)) put(field, String(body[field] || "").trim());
    }
// Reference details
for (const field of ["reference_name", "reference_mobile"]) {
    if (has(field)) {
        put(field, String(body[field] || "").trim());
    }
}

    // Division / District / Upazila are stored as text names.
    for (const field of ["division", "district", "upazila"]) {
        if (has(field)) put(field, String(body[field] || "").trim());
    }

    // Area / Sub-Area (ids) — must belong to this company / area.
    if (has("area_id")) {
        const areaId = parseInt(body.area_id, 10) || 0;

        if (areaId > 0) {
            const [areaRows] = await db.query(
                "SELECT id FROM areas WHERE id = ? AND company_id = ? LIMIT 1",
                [areaId, Number(customer.company_id)]
            );

            if (!areaRows.length) {
                throw new ManageError("Selected area was not found.");
            }

            put("area_id", areaId);

            if (has("sub_area_id")) {
                const subId = parseInt(body.sub_area_id, 10) || 0;

                if (subId > 0) {
                    const [subRows] = await db.query(
                        "SELECT id FROM sub_areas WHERE id = ? AND area_id = ? LIMIT 1",
                        [subId, areaId]
                    );

                    if (!subRows.length) {
                        throw new ManageError(
                            "Selected sub-area does not belong to the selected area."
                        );
                    }

                    put("sub_area_id", subId);
                }
            }
        }
    }

    // Automatic connection checkboxes (unchecked boxes are not submitted,
    // so the hidden `auto_fields` marker tells us the group was on the form).
    if (has("auto_fields")) {
        put("auto_connection", body.auto_continue ? 1 : 0);

        if (columnSet.has("auto_next_month")) {
            put("auto_next_month", body.auto_next_month ? 1 : 0);
        } else if (columnSet.has("auto_connection_next_month")) {
            put("auto_connection_next_month", body.auto_next_month ? 1 : 0);
        }
    }

    // ---- MikroTik ----
    const session = ppp.createSession({
        companyId: customer.company_id,
        isSuper: true
    });

    let moveNote = "";

    try {
        if (!routerChanged) {
            let api;

            try {
                api = await session.api(newRouterId);
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

            // Nothing typed and nothing saved in the database: keep the comment
            // that already exists on the MikroTik secret instead of erasing it.
            if (!newComment &&
                !String(customer.comments || "").trim() &&
                String(secret.comment || "").trim()) {
                newComment = String(secret.comment).trim();

                const commentPair = pairs.find(p => p[0] === "comments");
                if (commentPair) commentPair[1] = newComment;
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
        } else {
            // Moving to another MikroTik: create on the new one first,
            // then remove from the old one.
            let newApi;

            try {
                newApi = await session.api(newRouterId);
            } catch (_) {
                throw new ManageError("Connection to the new MikroTik server failed.");
            }

            if (await ppp.findSecret(newApi, newName)) {
                throw new ManageError(
                    "This PPPoE username already exists on the new MikroTik server."
                );
            }

            try {
                await newApi.write("/ppp/secret/add", [
                    `=name=${newName}`,
                    `=password=${newPassword}`,
                    "=service=pppoe",
                    `=profile=${profile}`,
                    `=comment=${newComment}`,
                    `=disabled=${newStatus === "Active" ? "no" : "yes"}`
                ]);
            } catch (error) {
                throw new ManageError(
                    `MikroTik create failed on the new server: ${error.message}`
                );
            }

            if (oldRouterId > 0 && oldName) {
                try {
                    const oldApi = await session.api(oldRouterId);
                    const oldSecret = await ppp.findSecret(oldApi, oldName);

                    if (oldSecret) {
                        await oldApi.write("/ppp/secret/remove", [
                            `=.id=${oldSecret[".id"]}`
                        ]);

                        await ppp.kick(oldApi, oldName);
                    }
                } catch (error) {
                    console.error(
                        `Move MikroTik warning [${id}]:`,
                        error.message
                    );

                    moveNote =
                        " (The old MikroTik secret could not be removed - please remove it manually.)";
                }
            }
        }
    } finally {
        await session.closeAll();
    }

    // ---- Database ----
    try {
        const setClause = pairs
            .map(([column]) => `\`${column}\` = ?`)
            .join(", ");

        await db.query(
            `UPDATE customers
             SET ${setClause}
             WHERE id = ?${s.sql}
             LIMIT 1`,
            [...pairs.map(([, value]) => value), id, ...s.params]
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
        `Customer updated: ${newCustomerId || customer.customer_id || id} | ` +
        `PPPoE: ${oldName} -> ${newName} | Status: ${newStatus}` +
        (routerChanged ? ` | MikroTik: ${oldRouterId} -> ${newRouterId}` : "")
    );

    return "Customer updated successfully. MikroTik PPPoE also updated." + moveNote;
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

async function deleteCustomer({ user, id, deleteMikrotik }) {
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

    // The delete popup sends delete_mikrotik=1/0. When the flag is absent
    // (older callers) the previous behaviour is kept: remove the secret.
    const removeFromMikrotik =
        deleteMikrotik === undefined ||
        ["1", "true", "on", "yes"].includes(
            String(deleteMikrotik).toLowerCase()
        );

    if (removeFromMikrotik && mikrotikId > 0 && pppoe) {
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

    const lbl = text =>
        e(text).replace(/ \*$/, ' <span class="cp-req">*</span>');

    const row = (label, control) => `
        <div class="cp-row">
            <label class="cp-lbl">${lbl(label)}</label>
            <div class="cp-ctl">${control}</div>
        </div>
    `;

    const field = (label, name, value, type = "text", extra = "") => row(
        label,
        `<input class="form-control form-control-sm"
                type="${e(type)}"
                name="${e(name)}"
                value="${e(value ?? "")}"
                ${extra}>`
    );

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

    // Reuse the existing edit form (Mikrotik / Package / Area / Sub-Area /
    // Division / District / Upazila selects, validation and save logic).
    const editHtml = await editFragment({ user, id });

    const stripDate = date(val(c.billing_date, c.billing_cycle));
    const areaLine = [val(c.area_name, c.area), val(c.sub_area_name, c.sub_area)]
        .filter(Boolean).join(" , ");

    return `
<div class="customer-profile-view customer-profile-modal cp-shell">
<style>
.cp-shell { background:#f4f4f4; border-radius:8px; overflow:hidden; color:#444; }
.cp-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 20px; background:#f1f1f1; }
.cp-head-left { display:flex; align-items:center; gap:14px; min-width:0; }
.cp-avatar { width:62px; height:62px; min-width:62px; border-radius:50%; background:#e3e3e3; color:#b8b8b8; display:flex; align-items:flex-end; justify-content:center; overflow:hidden; font-size:44px; }
.cp-name { margin:0; font-size:26px; font-weight:400; color:#333; line-height:1.2; }
.cp-head-right { display:flex; align-items:center; gap:18px; flex-shrink:0; }
.cp-del { border:0; background:none; color:#333; font-size:14px; padding:0; }
.cp-del:hover { color:#c0272d; }
.cp-body { padding:0 14px 14px; max-height:none; overflow:visible; }
.cp-strip { display:grid; grid-template-columns:1fr 1fr 1fr; background:#fff; border-radius:6px; box-shadow:0 1px 4px rgba(0,0,0,.12); margin-bottom:14px; }
.cp-strip-col { padding:12px 18px; font-size:13px; line-height:1.9; border-right:1px solid #ddd; }
.cp-strip-col:last-child { border-right:0; }
.cp-strip-col i { width:20px; margin-right:6px; text-align:center; }
.cp-y { color:#f2b705; } .cp-b { color:#1e88e5; } .cp-g { color:#777; }
.cp-grid { display:grid; grid-template-columns:minmax(0,5fr) minmax(0,7fr); gap:14px; align-items:start; }
.cp-card { background:#fff; border-radius:4px; box-shadow:0 1px 3px rgba(0,0,0,.12); margin-bottom:14px; overflow:hidden; }
.cp-card-title { padding:12px 14px; background:#f3f3f3; border-bottom:1px solid #e5e5e5; font-weight:600; font-size:15px; color:#333; }
.cp-menu { padding:10px 0 34px; }
.cp-setting { display:flex; align-items:center; gap:18px; width:100%; padding:9px 18px 9px 26px; border:0; border-left:3px solid transparent; background:transparent; color:#555; font-size:13.5px; font-weight:600; text-align:left; text-decoration:none; }
.cp-setting i { width:18px; text-align:center; font-size:15px; color:#555; }
.cp-setting:hover { background:#f6f6f6; color:#555; }
.cp-setting.active { color:#0d6efd; border-left-color:#0d6efd; }
.cp-detail-scroll { max-height:calc(100vh - 460px); min-height:220px; overflow-y:auto; padding:8px 14px; }
.cp-detail-scroll table { width:100%; }
.cp-detail-scroll td { padding:5px 0; font-size:12.5px; vertical-align:middle; }
.cp-detail-scroll td:first-child { width:48%; color:#555; }
.cp-detail-scroll td:last-child { font-weight:600; color:#444; }
.cp-pane[hidden] { display:none; }
#customerActionModal .cp-update .cm-wrap { background:transparent; color:inherit; }
#customerActionModal .cp-update .cm-edit-head { display:none; }
#customerActionModal .cp-update .cm-body { padding:14px 18px 4px; max-height:none !important; overflow:visible !important; }
#customerActionModal .cp-update .row { margin:0; --bs-gutter-x:0; --bs-gutter-y:0; }
#customerActionModal .cp-update .row > [class*="col-"] { flex:0 0 100%; max-width:100%; width:100%; padding:0; margin:0 0 10px; display:flex; align-items:center; gap:14px; }
#customerActionModal .cp-update .cm-lbl { flex:0 0 38%; text-align:right; margin:0; font-size:12.5px; color:#666; display:block; }
#customerActionModal .cp-update .cm-in,
#customerActionModal .cp-update .cm-sel { flex:1 1 auto; width:auto; min-width:0; min-height:32px; padding:5px 10px; font-size:12.5px; border-radius:3px; }
#customerActionModal .cp-update .cm-radio-row,
#customerActionModal .cp-update .cm-check-row { flex:1; display:flex; flex-wrap:wrap; gap:6px 16px; font-size:12.5px; }
#customerActionModal .cp-update .cm-foot { display:flex; justify-content:flex-end; padding:4px 18px 16px; background:transparent; border:0; }
#customerActionModal .cp-update .cm-cancel { display:none; }
#customerActionModal .cp-update .cm-save { background:#fff; color:#198754; border:1px solid #198754; padding:5px 20px; font-size:13px; border-radius:3px; min-height:0; }
#customerActionModal .cp-update .cm-save:hover { background:#198754; color:#fff; }
.cp-recharge { padding:14px 18px 18px; }
@media (max-width:991.98px) {
  .cp-grid { grid-template-columns:1fr; }
  .cp-strip { grid-template-columns:1fr; }
  .cp-strip-col { border-right:0; border-bottom:1px solid #eee; }
  .cp-detail-scroll { max-height:none; }
  #customerActionModal .cp-update .cm-body { max-height:none; overflow:visible; }
  #customerActionModal .cp-update .row > [class*="col-"] { flex-direction:column; align-items:stretch; gap:4px; }
  #customerActionModal .cp-update .cm-lbl { text-align:left; flex:none; }
  .cp-name { font-size:20px; }
}
</style>

    <div class="cp-head">
        <div class="cp-head-left">
            <div class="cp-avatar"><i class="fa fa-user"></i></div>
            <h5 class="cp-name">${e(c.name || "N/A")}</h5>
        </div>
        <div class="cp-head-right">
            <button type="button" class="cp-del delete-customer-btn"
                    data-id="${Number(c.id)}"
                    data-name="${e(c.name || "")}">
                <i class="fa fa-trash-can me-1"></i> Delete Profile
            </button>
            <button type="button" class="btn-close"
                    data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
    </div>

    <div class="cp-body">

        <div class="cp-strip">
            <div class="cp-strip-col">
                <div><i class="fa-regular fa-id-card cp-y"></i>${e(c.customer_id || "N/A")}</div>
                <div><i class="fa-regular fa-user cp-b"></i>${e(c.pppoe_username || "N/A")}</div>
            </div>
            <div class="cp-strip-col">
                <div><i class="fa-solid fa-anchor cp-g"></i>${e(areaLine || "N/A")}</div>
                <div><i class="fa-solid fa-location-dot cp-g"></i>${e(val(c.sub_area_name, c.sub_area, c.address) || "N/A")}</div>
            </div>
            <div class="cp-strip-col">
                <div><i class="fa-regular fa-money-bill-1 cp-g"></i>${e(stripDate)}</div>
            </div>
        </div>

        <div class="cp-grid">

            <div>
                <div class="cp-card">
                    <div class="cp-card-title">Profile Setting</div>
                    <div class="cp-menu">
                        <a href="#cp-update-profile" class="cp-setting active" data-profile-action="update">
                            <i class="fa-regular fa-pen-to-square"></i> Update Profile
                        </a>
                        <button type="button" class="cp-setting"
                                data-profile-action="recharge"
                                data-id="${Number(c.id)}">
                            <i class="fa-regular fa-money-bill-1"></i> Recharge
                        </button>
                        <button type="button" class="cp-setting"
                                data-profile-action="report"
                                data-id="${Number(c.id)}">
                            <i class="fa-regular fa-folder"></i> Report
                        </button>
                        <button type="button" class="cp-setting"
                                data-profile-action="reset-password"
                                data-id="${Number(c.id)}">
                            <i class="fa-solid fa-key"></i> Reset Password
                        </button>
                    </div>
                </div>

                <div class="cp-card">
                    <div class="cp-card-title">Profile Detail</div>
                    <div class="cp-detail-scroll">
                        <table>
                            <tbody>${detailHtml}</tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div>
                <div class="cp-card" id="cp-update-profile">
                    <div class="cp-card-title" id="cpPanelTitle">Update Profile</div>

                    <div class="cp-pane cp-update" id="cpUpdatePane">
                        ${editHtml}
                    </div>

                    <div class="cp-pane cp-recharge" id="cpRechargePane" hidden></div>
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
