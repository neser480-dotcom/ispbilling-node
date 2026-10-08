"use strict";

/*
|--------------------------------------------------------------------------
| CUSTOMER BULK ACTIONS
|--------------------------------------------------------------------------
| Port of customers/bulk/*.php
|
|   _common.php        -> helpers at the top of this file
|   balance.php, billing_cycle.php, promise_date.php, payment_status.php,
|   message.php, status.php, connection_on.php, connection_off.php,
|   reseller.php, mikrotik.php, delete.php
|
| Every action has:
|   fragment(ctx)  -> HTML popup body (GET  /api/customers/bulk/<name>?ids=)
|   apply(ctx)     -> { success, message } (POST /api/customers/bulk/<name>)
|--------------------------------------------------------------------------
*/

const db = require("../config/database");
const ppp = require("./ppp.service");


class BulkError extends Error {
    constructor(message, httpCode = 400) {
        super(message);
        this.httpCode = httpCode;
    }
}


/*
|--------------------------------------------------------------------------
| COMMON HELPERS (port of _common.php)
|--------------------------------------------------------------------------
*/

function isSuperAdmin(user) {
    return String(user.role || "")
        .trim().toLowerCase().replace(/[\s_-]+/g, "") === "superadmin";
}

function esc(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function companyIdOf(user) {

    let id = Number(user.company_id || 0);

    if (id > 0 || isSuperAdmin(user)) return id;

    const [rows] = await db.query(
        "SELECT company_id FROM users WHERE id = ? LIMIT 1",
        [Number(user.user_id || 0)]
    );

    id = Number(rows[0]?.company_id || 0);

    if (id > 0) user.company_id = id;

    return id;
}

/* ids from ?ids=1,2  /  body ids=1,2  /  body customer_ids[]=1&customer_ids[]=2 */
function getIds(req) {

    const out = [];

    const push = v => {
        if (Array.isArray(v)) return v.forEach(push);
        String(v ?? "").split(",").forEach(x => out.push(x));
    };

    push(req.query?.ids);
    push(req.body?.ids);
    push(req.body?.customer_ids);
    push(req.body?.["customer_ids[]"]);

    return [...new Set(
        out.map(x => parseInt(String(x).trim(), 10))
           .filter(n => Number.isInteger(n) && n > 0)
    )];
}

async function getAllowedIds(user, ids) {

    if (!ids.length) return [];

    let sql = "SELECT id FROM customers WHERE id IN (?)";
    const params = [ids];

    if (!isSuperAdmin(user)) {
        sql += " AND company_id = ?";
        params.push(await companyIdOf(user));
    }

    const [rows] = await db.query(sql, params);

    return rows.map(r => Number(r.id));
}

const columnCache = new Map();

async function findColumn(table, candidates) {

    const key = `${table}:${candidates.join(",")}`;

    if (columnCache.has(key)) return columnCache.get(key);

    let found = null;

    try {
        const [cols] = await db.query(`SHOW COLUMNS FROM \`${table}\``);
        const have = new Set(cols.map(c => c.Field));
        found = candidates.find(c => have.has(c)) || null;
    } catch (_) {}

    columnCache.set(key, found);

    return found;
}

async function updateCustomers(ids, column, value) {

    if (!ids.length) return false;

    if (!/^[a-z_]+$/i.test(column)) throw new Error("Invalid column.");

    await db.query(
        `UPDATE customers SET \`${column}\` = ? WHERE id IN (?)`,
        [value, ids]
    );

    return true;
}

async function logActivity(user, action, description) {

    try {
        await db.query(
            `INSERT INTO activity_logs
                (user_id, company_id, action, description, module, created_at)
             VALUES (?, ?, ?, ?, 'customers', NOW())`,
            [
                Number(user.user_id || 0),
                Number(user.company_id || 0),
                action,
                String(description).slice(0, 500)
            ]
        );
    } catch (_) {}
}

/* wrap a popup body in the standard <form> used by every bulk action */
function popup({ action, ids, body, submitLabel = "Submit", submitClass = "btn-success" }) {

    const warning = ids.length
        ? ""
        : '<div class="alert alert-warning py-2 small">No customers selected.</div>';

    return `
<form method="POST" action="/api/customers/bulk/${esc(action)}">
    <input type="hidden" name="ids" value="${ids.join(",")}">
    ${warning}
    ${body}
    <div class="d-flex justify-content-end gap-2">
        <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
        <button type="submit" class="btn ${submitClass} btn-sm"${ids.length ? "" : " disabled"}>${esc(submitLabel)}</button>
    </div>
</form>`;
}

function field(label, input, required = false) {
    return `
    <div class="mb-3">
        <label class="form-label small mb-1" style="color:#555;">${esc(label)}${
            required ? ' <span class="text-danger">*</span>' : ""
        }</label>
        ${input}
    </div>`;
}

function pad(n) { return String(n).padStart(2, "0"); }

function nowLocalInput() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* "2026-10-04T10:30" / "2026-10-04 10:30:00" / "2026-10-04 10:30 AM" -> "YYYY-MM-DD HH:MM:SS" */
function toSqlDateTime(raw) {

    raw = String(raw || "").trim().replace(/[/.]/g, "-").replace(/\s+/g, " ");

    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i.exec(raw);

    if (!m) return null;

    let [, y, mo, d, h = "0", mi = "0", s = "0", ap] = m;

    h = Number(h);

    if (ap) {
        ap = ap.toUpperCase();
        if (h < 1 || h > 12) return null;
        if (ap === "PM" && h < 12) h += 12;
        if (ap === "AM" && h === 12) h = 0;
    }

    mo = Number(mo); d = Number(d); mi = Number(mi); s = Number(s);

    const date = new Date(Number(y), mo - 1, d, h, mi, s);

    if (
        date.getFullYear() !== Number(y) || date.getMonth() !== mo - 1 ||
        date.getDate() !== d || h > 23 || mi > 59 || s > 59
    ) return null;

    return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s)}`;
}


/*
|--------------------------------------------------------------------------
| ACTIONS
|--------------------------------------------------------------------------
*/

const actions = {};

function requireIds(ids) {
    if (!ids.length) throw new BulkError("No customers selected.");
}


/* ---------- balance ---------- */
actions.balance = {
    fragment: ({ ids }) => popup({
        action: "balance", ids,
        body: field("Balance",
            '<input type="number" step="any" name="balance" class="form-control form-control-sm" required>')
    }),
    async apply({ ids, body, user }) {
        const raw = String(body.balance ?? "").trim();
        if (raw === "" || !Number.isFinite(Number(raw))) {
            throw new BulkError("Please enter a valid numeric balance amount.");
        }
        requireIds(ids);
        await updateCustomers(ids, "balance", Number(raw));
        await logActivity(user, "bulk_balance", `Bulk balance set to ${raw} for ${ids.length} customer(s)`);
        return "Customer balance updated successfully!";
    }
};


/* ---------- billing_cycle ---------- */
actions.billing_cycle = {
    fragment: ({ ids }) => popup({
        action: "billing_cycle", ids,
        body: field("Billing Cycle",
            `<input type="datetime-local" name="billing_cycle" class="form-control form-control-sm" value="${nowLocalInput()}" required>`, true)
    }),
    async apply({ ids, body, user }) {
        if (!String(body.billing_cycle || "").trim()) {
            throw new BulkError("Please select a valid billing cycle date.");
        }
        const value = toSqlDateTime(body.billing_cycle);
        if (!value) throw new BulkError("Invalid date format.");
        requireIds(ids);
        await updateCustomers(ids, "billing_cycle", value);
        await logActivity(user, "bulk_billing_cycle", `Bulk billing cycle ${value} for ${ids.length} customer(s)`);
        return "Billing cycle updated successfully!";
    }
};


/* ---------- promise_date ---------- */
actions.promise_date = {
    fragment: ({ ids }) => popup({
        action: "promise_date", ids,
        body: field("Promise Date",
            `<input type="datetime-local" name="promise_date" class="form-control form-control-sm" value="${nowLocalInput()}" required>`)
    }),
    async apply({ ids, body, user }) {
        if (!String(body.promise_date || "").trim()) {
            throw new BulkError("Please select a valid promise date.");
        }
        const value = toSqlDateTime(body.promise_date);
        if (!value) throw new BulkError("Invalid date format.");
        requireIds(ids);
        await updateCustomers(ids, "promise_date", value);
        await logActivity(user, "bulk_promise_date", `Bulk promise date ${value} for ${ids.length} customer(s)`);
        return "Promise date updated successfully!";
    }
};


/* ---------- payment_status ---------- */
actions.payment_status = {
    fragment: ({ ids }) => popup({
        action: "payment_status", ids,
        body: `
    <div class="mb-3">
        <div class="form-check form-check-inline">
            <input class="form-check-input" type="radio" name="payment_status" id="payStatusPaid" value="paid" required>
            <label class="form-check-label small" for="payStatusPaid">Paid</label>
        </div>
        <div class="form-check form-check-inline">
            <input class="form-check-input" type="radio" name="payment_status" id="payStatusUnpaid" value="unpaid">
            <label class="form-check-label small" for="payStatusUnpaid">Unpaid</label>
        </div>
    </div>`
    }),
    async apply({ ids, body, user }) {
        const value = String(body.payment_status || "").trim().toLowerCase();

        /* PHP accepted 'due' too, but customers.payment_status is ENUM('paid','unpaid') */
        if (!["paid", "unpaid", "due"].includes(value)) {
            throw new BulkError("Please select a valid payment status.");
        }
        requireIds(ids);
        await updateCustomers(ids, "payment_status", value === "due" ? "unpaid" : value);
        await logActivity(user, "bulk_payment_status", `Bulk payment status ${value} for ${ids.length} customer(s)`);
        return "Payment status updated successfully!";
    }
};


/* ---------- message ---------- */
/* PHP only validated and replied "processed" - no SMS gateway call existed. */
actions.message = {
    fragment: ({ ids }) => popup({
        action: "message", ids,
        body: field("Message",
            '<textarea name="message" class="form-control form-control-sm" rows="4" required></textarea>', true)
    }),
    async apply({ ids, body }) {
        if (!String(body.message || "").trim()) {
            throw new BulkError("Message content cannot be empty.");
        }
        requireIds(ids);
        return "Bulk message processed successfully!";
    }
};


/* ---------- connection_on (automatic connection settings) ---------- */
const AUTO_COLS = [
    "auto_connection", "automatic_connection", "connection_enabled",
    "auto_connect", "connection_on"
];
const NEXT_COLS = ["continue_next_month", "next_auto_connection", "next_month_auto_connection", "next_auto_connect"];
const COLOR_COLS = ["id_color", "is_red", "text_color", "customer_color", "red_id"];
const MODE_COLS = ["connection_mode", "mode", "status_type"];

const checkRow = (id, name, label) => `
    <div class="mb-3">
        <label for="${id}" style="display:inline-flex;align-items:center;gap:10px;background:#f1f1f1;border-radius:4px;padding:8px 12px;font-size:13px;color:#555;">
            ${label}
            <input type="checkbox" class="form-check-input m-0" id="${id}" name="${name}" value="1">
        </label>
    </div>`;

actions.connection_on = {
    fragment: ({ ids }) => popup({
        action: "connection_on", ids,
        body:
            checkRow("autoConnCheck", "auto_connection_status", "Automatic Connection On/Off") +
            checkRow("nextMonthConnCheck", "next_month_auto_status", "Next Month Automatic Connection On/Off")
    }),
    async apply({ ids, body, user }) {
        requireIds(ids);

        const auto = body.auto_connection_status ? 1 : 0;
        const next = body.next_month_auto_status ? 1 : 0;

        const sets = [];
        const params = [];

        const add = (col, val) => { if (col) { sets.push(`\`${col}\` = ?`); params.push(val); } };

        add(await findColumn("customers", AUTO_COLS), auto);
        add(await findColumn("customers", NEXT_COLS), next);
        add(await findColumn("customers", COLOR_COLS), auto === 0 ? 1 : 0);
        add(await findColumn("customers", MODE_COLS), auto === 1 ? "auto" : "manual");

        if (!sets.length) {
            throw new BulkError("No valid connection setting column found in customers table.");
        }

        await db.query(`UPDATE customers SET ${sets.join(", ")} WHERE id IN (?)`, [...params, ids]);

        await logActivity(user, "bulk_connection_on", `Bulk connection mode ${auto ? "auto" : "manual"} for ${ids.length} customer(s)`);

        return auto === 1
            ? `${ids.length} customer(s) set to Automatic Connection mode.`
            : `${ids.length} customer(s) set to Manual/Promise mode. ID marked red.`;
    }
};


/* ---------- connection_off ---------- */
actions.connection_off = {
    fragment: ({ ids }) => popup({
        action: "connection_off", ids,
        body: `<p class="small mb-3" style="color:#555;">Automatic Connection will be turned <strong>OFF</strong> for <strong>${ids.length}</strong> customer(s).</p>`
    }),
    async apply({ ids, user }) {
        const column = await findColumn("customers", AUTO_COLS);
        if (!column) throw new BulkError("Automatic connection field was not found in customers table.");
        requireIds(ids);
        await updateCustomers(ids, column, 0);
        await logActivity(user, "bulk_connection_off", `Automatic connection OFF for ${ids.length} customer(s)`);
        return `${ids.length} customer(s) automatic connection disabled.`;
    }
};


/* ---------- mikrotik (move customers to another router record) ---------- */
async function routersFor(user) {

    if (isSuperAdmin(user)) {
        const [rows] = await db.query("SELECT id, name, ip FROM mikrotik_servers ORDER BY name ASC");
        return rows;
    }

    const companyId = await companyIdOf(user);

    if (companyId <= 0) throw new BulkError("Company information not found.");

    const [rows] = await db.query(
        "SELECT id, name, ip FROM mikrotik_servers WHERE company_id = ? ORDER BY name ASC",
        [companyId]
    );

    return rows;
}

actions.mikrotik = {
    async fragment({ ids, user }) {
        const routers = await routersFor(user);
        return popup({
            action: "mikrotik", ids,
            body: field("Mikrotik",
                `<select name="mikrotik_id" class="form-select form-select-sm" required>
                    <option value="">Select Mikrotik</option>
                    ${routers.map(r => `<option value="${Number(r.id)}">${esc(r.name)} - ${esc(r.ip)}</option>`).join("")}
                </select>`, true)
        });
    },
    async apply({ ids, body, user }) {
        const id = parseInt(body.mikrotik_id, 10) || 0;
        if (id <= 0) throw new BulkError("Please select MikroTik router.");
        const routers = await routersFor(user);
        if (!routers.some(r => Number(r.id) === id)) throw new BulkError("Invalid MikroTik router.");
        requireIds(ids);
        await updateCustomers(ids, "mikrotik_id", id);
        await logActivity(user, "bulk_mikrotik", `Bulk MikroTik ${id} for ${ids.length} customer(s)`);
        return `${ids.length} customer(s) MikroTik updated.`;
    }
};


/* ---------- reseller ---------- */
async function resellersFor(user) {

    const params = [];
    let sql = "SELECT id, name, username FROM users WHERE role = 'reseller'";

    if (!isSuperAdmin(user)) {
        sql += " AND company_id = ?";
        params.push(await companyIdOf(user));
    }

    const [rows] = await db.query(sql + " ORDER BY name ASC", params);

    return rows;
}

async function subAreasFor(user) {

    const hasCompany = await findColumn("sub_areas", ["company_id"]);

    const params = [];
    let sql = "SELECT id, name FROM sub_areas";

    if (!isSuperAdmin(user) && hasCompany) {
        sql += " WHERE company_id = ?";
        params.push(await companyIdOf(user));
    }

    const [rows] = await db.query(sql + " ORDER BY name ASC", params);

    return { rows, hasCompany: Boolean(hasCompany) };
}

actions.reseller = {
    async fragment({ ids, user }) {
        const resellers = await resellersFor(user);
        const { rows: subs } = await subAreasFor(user);
        return popup({
            action: "reseller", ids,
            body:
                field("Reseller",
                    `<select name="reseller_id" class="form-select form-select-sm" required>
                        <option value="">Select Reseller</option>
                        ${resellers.map(r => `<option value="${Number(r.id)}">${esc(r.name || r.username)}</option>`).join("")}
                    </select>`, true) +
                field("Sub Area",
                    `<select name="sub_area_id" class="form-select form-select-sm">
                        <option value="">Sub Area</option>
                        ${subs.map(s => `<option value="${Number(s.id)}">${esc(s.name)}</option>`).join("")}
                    </select>`)
        });
    },
    async apply({ ids, body, user }) {
        const resellerId = parseInt(body.reseller_id, 10) || 0;
        if (resellerId <= 0) throw new BulkError("Please select reseller.");

        const resellers = await resellersFor(user);
        if (!resellers.some(r => Number(r.id) === resellerId)) throw new BulkError("Invalid reseller.");

        const column = await findColumn("customers", ["reseller_id", "reseller_user_id", "reseller"]);
        if (!column) throw new BulkError("Reseller field was not found in customers table.");

        requireIds(ids);

        await updateCustomers(ids, column, resellerId);

        const subId = parseInt(body.sub_area_id, 10) || 0;

        if (subId > 0 && await findColumn("customers", ["sub_area_id"])) {
            const { rows } = await subAreasFor(user);
            if (rows.some(s => Number(s.id) === subId)) {
                await updateCustomers(ids, "sub_area_id", subId);
            }
        }

        await logActivity(user, "bulk_reseller", `Bulk reseller ${resellerId} for ${ids.length} customer(s)`);

        return `${ids.length} customer(s) transferred to reseller.`;
    }
};


/* ---------- status (touches MikroTik for Expired / Active) ---------- */
const STATUS_OPTIONS = {
    Active: "Active",
    Expired: "Expired (move to Block profile)",
    Inactive: "Inactive",
    Suspended: "Suspended",
    Disabled: "Disabled",
    Pending: "Pending"
};

async function allowedStatuses() {

    try {
        const [cols] = await db.query("SHOW COLUMNS FROM customers LIKE 'status'");
        const type = String(cols[0]?.Type || "");

        if (/^enum\(/i.test(type)) {
            const values = [...type.matchAll(/'((?:[^']|'')*)'/g)].map(m => m[1].toLowerCase());
            return Object.fromEntries(
                Object.entries(STATUS_OPTIONS).filter(([k]) => values.includes(k.toLowerCase()))
            );
        }
    } catch (_) {}

    return STATUS_OPTIONS;
}

actions.status = {
    async fragment({ ids }) {
        const options = await allowedStatuses();
        return popup({
            action: "status", ids,
            body: field("Status",
                `<select name="status" class="form-select form-select-sm" required>
                    ${Object.entries(options).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}
                </select>
                <small class="text-muted d-block mt-1">
                    Expired = PPPoE goes to the Block profile.
                    Active = PPPoE returns to the customer's own package profile.
                </small>`, true)
        });
    },
    async apply({ ids, body, user }) {

        const options = await allowedStatuses();
        const posted = String(body.status || "").trim().toLowerCase();
        const status = Object.keys(options).find(k => k.toLowerCase() === posted);

        if (!status) throw new BulkError("Invalid customer status.");
        requireIds(ids);

        const touchRouter = status === "Expired" || status === "Active";

        const [customers] = await db.query(
            "SELECT id, name, mikrotik_id, pppoe_username AS pppoe FROM customers WHERE id IN (?)",
            [ids]
        );

        const companyId = await companyIdOf(user);
        const session = ppp.createSession({ companyId, isSuper: isSuperAdmin(user) });

        let ok = 0;
        const errors = [];

        try {

            for (const c of customers) {

                const cid = Number(c.id);
                const label = String(c.name || "").trim() || `#${cid}`;
                const pppoe = String(c.pppoe || "").trim();

                try {

                    let routerId = 0;

                    if (touchRouter) {
                        routerId = await ppp.resolveRouter(session, {
                            customerId: cid, mikrotikId: Number(c.mikrotik_id || 0), pppoe
                        });

                        if (routerId <= 0 || !pppoe) {
                            throw new Error(
                                "MikroTik not updated: " +
                                (routerId <= 0 ? "no MikroTik router linked" : "no PPPoE username")
                            );
                        }

                        const api = await session.api(routerId);

                        if (status === "Expired") {
                            await ppp.blockCustomer(api, {
                                pppoe,
                                blockProfileName: await ppp.blockProfile(routerId),
                                customerId: cid
                            });
                        } else {
                            await ppp.unblockCustomer(api, { pppoe, routerId, customerId: cid });
                        }
                    }

                    await updateCustomers([cid], "status", status);
                    ok++;

                } catch (e) {
                    errors.push(`${label}: ${e.message}`);
                }
            }

        } finally {
            await session.closeAll();
        }

        if (ok === 0) {
            throw new BulkError(`Status not changed. ${errors.slice(0, 3).join(" | ")}`);
        }

        await logActivity(user, "bulk_status", `Bulk status ${status} for ${ok} customer(s)`);

        let msg = `${ok} customer(s) set to ${status}.`;
        if (errors.length) msg += ` Failed (${errors.length}): ${errors.slice(0, 3).join(" | ")}`;

        return msg;
    }
};


/* ---------- delete ---------- */
actions.delete = {
    fragment: ({ ids }) => popup({
        action: "delete", ids, submitLabel: "Delete",
        body: `
    <div class="mb-3">
        <div class="form-check">
            <input class="form-check-input" type="checkbox" name="delete_mikrotik" id="bulkDeleteMikrotik" value="1">
            <label class="form-check-label small" for="bulkDeleteMikrotik" style="color:#555;">
                Do you want to delete Mikrotik ?
            </label>
        </div>
    </div>`
    }),
    async apply({ ids, body, user }) {

        requireIds(ids);

        const deleteMikrotik = Boolean(body.delete_mikrotik);

        const [customers] = await db.query(
            "SELECT id, name, mikrotik_id, pppoe_username AS pppoe FROM customers WHERE id IN (?)",
            [ids]
        );

        const companyId = await companyIdOf(user);
        const session = ppp.createSession({ companyId, isSuper: isSuperAdmin(user) });

        let ok = 0;
        const errors = [];

        try {

            for (const c of customers) {

                const cid = Number(c.id);
                const label = String(c.name || "").trim() || `#${cid}`;
                const pppoe = String(c.pppoe || "").trim();

                try {

                    if (deleteMikrotik) {

                        const routerId = await ppp.resolveRouter(session, {
                            customerId: cid, mikrotikId: Number(c.mikrotik_id || 0),
                            pppoe, persist: false
                        });

                        if (routerId <= 0 || !pppoe) {
                            throw new Error(
                                "MikroTik not updated: " +
                                (routerId <= 0 ? "no MikroTik router linked" : "no PPPoE username") +
                                " (customer NOT deleted)"
                            );
                        }

                        const api = await session.api(routerId);
                        const secret = await ppp.findSecret(api, pppoe);

                        if (secret) {
                            try {
                                await api.write("/ppp/secret/remove", [`=.id=${secret[".id"]}`]);
                            } catch (e) {
                                throw new Error(`MikroTik could not remove PPPoE: ${e.message}`);
                            }
                            await ppp.kick(api, pppoe);
                        }

                        await ppp.backupClear(cid);
                    }

                    const params = [cid];
                    let sql = "DELETE FROM customers WHERE id = ?";

                    if (!isSuperAdmin(user)) {
                        sql += " AND company_id = ?";
                        params.push(companyId);
                    }

                    await db.query(sql, params);
                    ok++;

                } catch (e) {
                    errors.push(`${label}: ${e.message}`);
                }
            }

        } finally {
            await session.closeAll();
        }

        if (ok === 0) {
            throw new BulkError(`No customer deleted. ${errors.slice(0, 3).join(" | ")}`);
        }

        await logActivity(user, "bulk_delete", `Bulk delete: ${ok} customer(s)${deleteMikrotik ? " (+MikroTik)" : ""}`);

        let msg = `${ok} customer(s) deleted` +
            (deleteMikrotik ? " (MikroTik PPPoE removed too)." : " from database.");

        if (errors.length) msg += ` Failed (${errors.length}): ${errors.slice(0, 3).join(" | ")}`;

        return msg;
    }
};



/* ---------- area (area + optional sub area) ---------- */
async function scopedRows(table, user, columns) {

    const hasCompany = await findColumn(table, ["company_id"]);

    const params = [];
    let sql = `SELECT ${columns} FROM \`${table}\``;

    if (!isSuperAdmin(user) && hasCompany) {
        sql += " WHERE company_id = ?";
        params.push(await companyIdOf(user));
    }

    const [rows] = await db.query(sql + " ORDER BY name ASC", params);

    return rows;
}

actions.area = {
    async fragment({ ids, user }) {

        const areas = await scopedRows("areas", user, "id, name");
        const hasAreaCol = await findColumn("sub_areas", ["area_id"]);
        const subs = await scopedRows("sub_areas", user, hasAreaCol ? "id, name, area_id" : "id, name");

        /* no JavaScript runs inside popups, so sub areas are grouped by area */
        const groups = areas.map(a => {
            const own = subs.filter(x => !hasAreaCol || Number(x.area_id) === Number(a.id));
            if (!own.length) return "";
            return `<optgroup label="${esc(a.name)}">${
                own.map(x => `<option value="${Number(x.id)}">${esc(x.name)}</option>`).join("")
            }</optgroup>`;
        }).join("");

        return popup({
            action: "area", ids,
            body:
                field("Area",
                    `<select name="new_area_id" class="form-select form-select-sm" required>
                        <option value="">Select Area</option>
                        ${areas.map(a => `<option value="${Number(a.id)}">${esc(a.name)}</option>`).join("")}
                    </select>`, true) +
                field("Sub Area (must belong to the selected area)",
                    `<select name="new_sub_area_id" class="form-select form-select-sm">
                        <option value="">No sub area</option>
                        ${groups}
                    </select>`)
        });
    },
    async apply({ ids, body, user }) {

        if (!isSuperAdmin(user) && (await companyIdOf(user)) <= 0) {
            throw new BulkError("Company access is not configured for this account.");
        }

        requireIds(ids);

        const areaId = parseInt(body.new_area_id ?? body.area_id, 10) || 0;
        const subId = parseInt(body.new_sub_area_id ?? body.sub_area_id, 10) || 0;

        if (areaId <= 0) throw new BulkError("Please select an area.");

        const areas = await scopedRows("areas", user, "id");
        if (!areas.some(a => Number(a.id) === areaId)) {
            throw new BulkError("Selected area was not found.");
        }

        if (subId > 0) {
            const hasAreaCol = await findColumn("sub_areas", ["area_id"]);
            const subs = await scopedRows("sub_areas", user, hasAreaCol ? "id, area_id" : "id");
            const hit = subs.find(x => Number(x.id) === subId &&
                (!hasAreaCol || Number(x.area_id) === areaId));
            if (!hit) throw new BulkError("Selected sub-area was not found.");
        }

        const hasSubCol = await findColumn("customers", ["sub_area_id"]);

        let sql, params;

        if (hasSubCol) {
            sql = "UPDATE customers SET area_id = ?, sub_area_id = ? WHERE id IN (?)";
            params = [areaId, subId > 0 ? subId : null, ids];
        } else {
            sql = "UPDATE customers SET area_id = ? WHERE id IN (?)";
            params = [areaId, ids];
        }

        await db.query(sql, params);

        await logActivity(user, "bulk_area", `Bulk area ${areaId}/${subId || "-"} for ${ids.length} customer(s)`);

        return `${ids.length} customer(s) area updated successfully!`;
    }
};


/* ---------- package / package_update (change package + MikroTik profile) ---------- */
async function packagesFor(user) {

    const params = [];
    let sql = `SELECT p.id, p.router_id, p.profile_id, p.package_name, p.price, p.alias_name,
                      s.name AS router_name
               FROM mikrotik_packages p
               LEFT JOIN mikrotik_servers s ON s.id = p.router_id`;

    if (!isSuperAdmin(user)) {
        sql += " WHERE (p.company_id = ? OR p.company_id = 0)";
        params.push(await companyIdOf(user));
    }

    const [rows] = await db.query(sql + " ORDER BY s.name ASC, p.package_name ASC", params);

    return rows;
}

const packageAction = {
    async fragment({ ids, user }) {

        const routers = await routersFor(user);
        const packages = await packagesFor(user);

        /* package list is grouped by router; the router is taken from the chosen package */
        const groups = routers.map(r => {
            const own = packages.filter(p => Number(p.router_id) === Number(r.id));
            if (!own.length) return "";
            return `<optgroup label="${esc(r.name)} - ${esc(r.ip)}">${
                own.map(p => `<option value="${Number(p.id)}">${esc(p.package_name)} (৳${esc(p.price)})</option>`).join("")
            }</optgroup>`;
        }).join("");

        return popup({
            action: "package", ids,
            body: field("Package",
                `<select name="package_id" class="form-select form-select-sm" required>
                    <option value="">Select Package</option>
                    ${groups}
                </select>
                <small class="text-muted d-block mt-1">
                    The customers' PPPoE profile is changed on the package's MikroTik,
                    and their monthly bill is set to the package price.
                </small>`, true)
        });
    },
    async apply({ ids, body, user }) {

        requireIds(ids);

        let packageId = parseInt(body.package_id, 10) || 0;
        let routerId = parseInt(body.router_id, 10) || 0;

        const packages = await packagesFor(user);

        /* fallback used by the PHP version: package given by name + router */
        if (packageId <= 0 && body.new_package && routerId > 0) {
            const byName = packages.find(p =>
                p.package_name === String(body.new_package).trim() &&
                Number(p.router_id) === routerId);
            if (byName) packageId = Number(byName.id);
        }

        if (packageId <= 0) throw new BulkError("Please select a valid package.");

        const pkg = packages.find(p => Number(p.id) === packageId);

        if (!pkg) throw new BulkError("Invalid package for selected MikroTik.");

        if (routerId > 0 && routerId !== Number(pkg.router_id)) {
            throw new BulkError("Invalid package for selected MikroTik.");
        }

        routerId = Number(pkg.router_id);

        const routers = await routersFor(user);
        if (!routers.some(r => Number(r.id) === routerId)) throw new BulkError("Invalid MikroTik router.");

        const profile = String(pkg.profile_id || "").trim();
        const packageName = String(pkg.package_name || "").trim();
        const alias = String(pkg.alias_name || "").trim();
        const price = Number(pkg.price || 0);

        const [customers] = await db.query(
            "SELECT id, pppoe_username FROM customers WHERE id IN (?)",
            [ids]
        );

        const companyId = await companyIdOf(user);
        const session = ppp.createSession({ companyId, isSuper: isSuperAdmin(user) });

        let ok = 0;
        const errors = [];

        let api;

        try {
            api = await session.api(routerId);
        } catch (e) {
            await session.closeAll();
            throw new BulkError(`MikroTik connection failed: ${e.message}`);
        }

        const billCol = await findColumn("customers", ["monthly_bill", "monthly_fee", "bill"]);
        const profileCol = await findColumn("customers", ["profile_id", "mikrotik_profile"]);
        const aliasCol = await findColumn("customers", ["alias_name", "package_alias"]);
        const nameCol = await findColumn("customers", ["package_name"]);

        try {

            for (const c of customers) {

                const pppoe = String(c.pppoe_username || "").trim();

                if (!pppoe) {
                    errors.push(`Customer ID ${c.id}: PPPoE username not found.`);
                    continue;
                }

                try {

                    const secret = await ppp.findSecret(api, pppoe);

                    if (!secret) {
                        errors.push(`${pppoe}: PPPoE secret not found on MikroTik.`);
                        continue;
                    }

                    try {
                        await api.write("/ppp/secret/set", [
                            `=.id=${secret[".id"]}`,
                            `=profile=${profile}`
                        ]);
                    } catch (e) {
                        errors.push(`${pppoe}: MikroTik profile change failed - ${e.message}`);
                        continue;
                    }

                    const sets = ["mikrotik_id = ?", "package_id = ?"];
                    const params = [routerId, packageId];

                    const add = (col, val) => { if (col) { sets.push(`\`${col}\` = ?`); params.push(val); } };

                    add(nameCol, packageName);
                    add(billCol, price);
                    add(profileCol, profile);
                    add(aliasCol, alias);

                    await db.query(
                        `UPDATE customers SET ${sets.join(", ")} WHERE id = ?`,
                        [...params, Number(c.id)]
                    );

                    /* the customer is back on a real package profile - drop any saved block backup */
                    await ppp.backupClear(Number(c.id));

                    ok++;

                } catch (e) {
                    errors.push(`${pppoe}: ${e.message}`);
                }
            }

        } finally {
            await session.closeAll();
        }

        if (ok === 0) {
            throw new BulkError(`No customer package changed. ${errors.slice(0, 3).join(" | ")}`);
        }

        await logActivity(user, "bulk_package", `Bulk package ${packageName} for ${ok} customer(s)`);

        return errors.length
            ? `${ok} customer(s) updated successfully. ${errors.length} failed. ${errors.slice(0, 3).join(" | ")}`
            : `${ok} customer(s) package changed successfully.`;
    }
};

actions.package = packageAction;
actions.package_update = {
    ...packageAction,
    fragment: async ctx => (await packageAction.fragment(ctx))
        .replace('/api/customers/bulk/package"', '/api/customers/bulk/package_update"')
};


module.exports = {
    BulkError,
    actions,
    getIds,
    getAllowedIds,
    esc,
    popup,
    field,
    updateCustomers,
    findColumn,
    logActivity,
    isSuperAdmin,
    companyIdOf,
    _test: { toSqlDateTime }
};
