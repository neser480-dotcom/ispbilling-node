"use strict";

const db = require("../config/database");
const ppp = require("./ppp.service");

/*
|--------------------------------------------------------------------------
| ERROR
|--------------------------------------------------------------------------
*/

class BulkError extends Error {

    constructor(message, httpCode = 400) {
        super(message);
        this.name = "BulkError";
        this.httpCode = httpCode;
    }
}

/*
|--------------------------------------------------------------------------
| COMMON
|--------------------------------------------------------------------------
*/

function isSuperAdmin(user) {

    return String(user?.role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "") === "superadmin";
}

function esc(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/*
|--------------------------------------------------------------------------
| COMPANY
|--------------------------------------------------------------------------
*/

async function companyIdOf(user) {

    let id = Number(
        user?.company_id ??
        user?.companyId ??
        0
    );

    if (id > 0 || isSuperAdmin(user)) {
        return id;
    }

    const userId = Number(
        user?.user_id ??
        user?.userId ??
        user?.id ??
        0
    );

    if (userId <= 0) {
        return 0;
    }

    const [rows] = await db.query(
        `
        SELECT company_id
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
        [userId]
    );

    id = Number(
        rows[0]?.company_id || 0
    );

    if (id > 0) {
        user.company_id = id;
    }

    return id;
}

/*
|--------------------------------------------------------------------------
| TENANT SQL
|--------------------------------------------------------------------------
*/

async function customerScope(
    user,
    alias = "c"
) {

    if (isSuperAdmin(user)) {
        return {
            sql: "",
            params: []
        };
    }

    const companyId =
        await companyIdOf(user);

    if (companyId <= 0) {
        return {
            sql: " AND 1 = 0 ",
            params: []
        };
    }

    return {
        sql: ` AND ${alias}.company_id = ? `,
        params: [companyId]
    };
}

/*
|--------------------------------------------------------------------------
| CSRF
|--------------------------------------------------------------------------
*/

function checkCsrf(session, body) {

    const expected =
        String(session?.csrf_token || "");

    const supplied =
        String(
            body?.csrf_token ||
            body?._csrf ||
            ""
        );

    if (!expected || !supplied) {
        throw new BulkError(
            "Invalid CSRF token.",
            403
        );
    }

    if (expected !== supplied) {
        throw new BulkError(
            "Invalid CSRF token.",
            403
        );
    }

    return true;
}

/*
|--------------------------------------------------------------------------
| IDS
|--------------------------------------------------------------------------
*/

function getIds(req) {

    const values = [];

    function push(value) {

        if (Array.isArray(value)) {

            for (const item of value) {
                push(item);
            }

            return;
        }

        if (
            value === undefined ||
            value === null
        ) {
            return;
        }

        String(value)
            .split(",")
            .forEach(item => {
                values.push(item);
            });
    }

    push(req.query?.ids);
    push(req.body?.ids);
    push(req.body?.customer_ids);
    push(req.body?.["customer_ids[]"]);

    return [
        ...new Set(
            values
                .map(value =>
                    parseInt(
                        String(value).trim(),
                        10
                    )
                )
                .filter(
                    id =>
                        Number.isInteger(id) &&
                        id > 0
                )
        )
    ];
}

/*
|--------------------------------------------------------------------------
| ALLOWED IDS
|--------------------------------------------------------------------------
*/

async function getAllowedIds(
    user,
    ids
) {

    if (!Array.isArray(ids) || !ids.length) {
        return [];
    }

    if (isSuperAdmin(user)) {

        const [rows] = await db.query(
            `
            SELECT id
            FROM customers
            WHERE id IN (?)
            `,
            [ids]
        );

        return rows.map(
            row => Number(row.id)
        );
    }

    const companyId =
        await companyIdOf(user);

    if (companyId <= 0) {
        return [];
    }

    const [rows] = await db.query(
        `
        SELECT id
        FROM customers
        WHERE id IN (?)
          AND company_id = ?
        `,
        [
            ids,
            companyId
        ]
    );

    return rows.map(
        row => Number(row.id)
    );
}

/*
|--------------------------------------------------------------------------
| REQUIRED IDS
|--------------------------------------------------------------------------
*/

function requireIds(ids) {

    if (
        !Array.isArray(ids) ||
        !ids.length
    ) {
        throw new BulkError(
            "No customers selected."
        );
    }
}

/*
|--------------------------------------------------------------------------
| DYNAMIC COLUMNS
|--------------------------------------------------------------------------
*/

const columnCache = new Map();

async function findColumn(
    table,
    candidates
) {

    const key =
        `${table}:${candidates.join(",")}`;

    if (columnCache.has(key)) {
        return columnCache.get(key);
    }

    let found = null;

    try {

        const [columns] =
            await db.query(
                `SHOW COLUMNS FROM \`${table}\``
            );

        const available =
            new Set(
                columns.map(
                    column => column.Field
                )
            );

        found =
            candidates.find(
                column =>
                    available.has(column)
            ) || null;

    } catch (error) {

        console.error(
            `COLUMN CHECK ERROR [${table}]`,
            error
        );

        found = null;
    }

    columnCache.set(
        key,
        found
    );

    return found;
}

/*
|--------------------------------------------------------------------------
| UPDATE CUSTOMERS
|--------------------------------------------------------------------------
| IMPORTANT:
| This function always keeps tenant scope.
|--------------------------------------------------------------------------
*/

async function updateCustomers(
    user,
    ids,
    column,
    value
) {

    requireIds(ids);

    if (
        !column ||
        !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(
            column
        )
    ) {
        throw new BulkError(
            "Invalid customer field."
        );
    }

    const scope =
        await customerScope(
            user,
            "c"
        );

    const params = [
        value,
        ids,
        ...scope.params
    ];

    await db.query(
        `
        UPDATE customers c
        SET c.\`${column}\` = ?
        WHERE c.id IN (?)
        ${scope.sql}
        `,
        params
    );

    return true;
}

/*
|--------------------------------------------------------------------------
| ACTIVITY LOG
|--------------------------------------------------------------------------
*/

async function logActivity(
    user,
    action,
    description
) {

    try {

        const companyId =
            await companyIdOf(user);

        await db.query(
            `
            INSERT INTO activity_logs
            (
                user_id,
                company_id,
                action,
                description,
                module,
                created_at
            )
            VALUES
            (
                ?,
                ?,
                ?,
                ?,
                'customers',
                NOW()
            )
            `,
            [
                Number(
                    user?.user_id ||
                    user?.userId ||
                    user?.id ||
                    0
                ),
                companyId,
                String(action),
                String(
                    description || ""
                ).slice(0, 500)
            ]
        );

    } catch (error) {

        /*
        | Activity log must never break
        | a successful customer operation.
        */

        console.warn(
            "BULK ACTIVITY LOG WARNING:",
            error.message
        );
    }
}

/*
|--------------------------------------------------------------------------
| POPUP
|--------------------------------------------------------------------------
*/

function popup({
    action,
    ids,
    body,
    submitLabel = "Submit",
    submitClass = "btn-success"
}) {

    const safeIds =
        Array.isArray(ids)
            ? ids
            : [];

    const warning =
        safeIds.length
            ? ""
            : `
                <div class="alert alert-warning py-2 small">
                    No customers selected.
                </div>
            `;

    return `
        <form
            method="POST"
            action="/api/customers/bulk/${esc(action)}"
            class="customer-bulk-form"
        >

            <input
                type="hidden"
                name="ids"
                value="${esc(
                    safeIds.join(",")
                )}"
            >

            ${warning}

            ${body || ""}

            <div class="d-flex justify-content-end gap-2 mt-3">

                <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    data-bs-dismiss="modal"
                >
                    Cancel
                </button>

                <button
                    type="submit"
                    class="btn ${esc(submitClass)} btn-sm"
                    ${safeIds.length ? "" : "disabled"}
                >
                    ${esc(submitLabel)}
                </button>

            </div>

        </form>
    `;
}

function field(
    label,
    input,
    required = false
) {

    return `
        <div class="mb-3">

            <label
                class="form-label small mb-1"
                style="color:#555;"
            >
                ${esc(label)}
                ${
                    required
                        ? ' <span class="text-danger">*</span>'
                        : ""
                }
            </label>

            ${input}

        </div>
    `;
}

/*
|--------------------------------------------------------------------------
| DATE
|--------------------------------------------------------------------------
*/

function pad(value) {

    return String(value)
        .padStart(2, "0");
}

function nowLocalInput() {

    const date =
        new Date();

    return [
        date.getFullYear(),
        "-",
        pad(date.getMonth() + 1),
        "-",
        pad(date.getDate()),
        "T",
        pad(date.getHours()),
        ":",
        pad(date.getMinutes())
    ].join("");
}

function toSqlDateTime(raw) {

    raw = String(raw || "")
        .trim()
        .replace(/[/.]/g, "-")
        .replace(/\s+/g, " ");

    let match =
        /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i
            .exec(raw);

    if (!match) {
        return null;
    }

    let year = Number(match[1]);
    let month = Number(match[2]);
    let day = Number(match[3]);

    let hour =
        match[4] !== undefined
            ? Number(match[4])
            : 0;

    let minute =
        match[5] !== undefined
            ? Number(match[5])
            : 0;

    let second =
        match[6] !== undefined
            ? Number(match[6])
            : 0;

    const ampm =
        match[7]
            ? match[7].toUpperCase()
            : "";

    if (ampm) {

        if (
            hour < 1 ||
            hour > 12
        ) {
            return null;
        }

        if (
            ampm === "PM" &&
            hour < 12
        ) {
            hour += 12;
        }

        if (
            ampm === "AM" &&
            hour === 12
        ) {
            hour = 0;
        }
    }

    if (
        month < 1 ||
        month > 12 ||
        day < 1 ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59 ||
        second < 0 ||
        second > 59
    ) {
        return null;
    }

    const date =
        new Date(
            year,
            month - 1,
            day,
            hour,
            minute,
            second
        );

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return (
        `${year}-${pad(month)}-${pad(day)} ` +
        `${pad(hour)}:${pad(minute)}:${pad(second)}`
    );
}

/*
|--------------------------------------------------------------------------
| ROUTERS
|--------------------------------------------------------------------------
*/

async function routersFor(user) {

    if (isSuperAdmin(user)) {

        const [rows] =
            await db.query(
                `
                SELECT id, name, ip
                FROM mikrotik_servers
                ORDER BY name ASC
                `
            );

        return rows;
    }

    const companyId =
        await companyIdOf(user);

    if (companyId <= 0) {
        throw new BulkError(
            "Company information not found."
        );
    }

    const [rows] =
        await db.query(
            `
            SELECT id, name, ip
            FROM mikrotik_servers
            WHERE company_id = ?
            ORDER BY name ASC
            `,
            [companyId]
        );

    return rows;
}

/*
|--------------------------------------------------------------------------
| RESELLERS
|--------------------------------------------------------------------------
*/

async function resellersFor(user) {

    const params = [];

    let sql = `
        SELECT id, name, username
        FROM users
        WHERE role = 'reseller'
    `;

    if (!isSuperAdmin(user)) {

        const companyId =
            await companyIdOf(user);

        if (companyId <= 0) {
            return [];
        }

        sql += `
            AND company_id = ?
        `;

        params.push(companyId);
    }

    const [rows] =
        await db.query(
            sql + `
                ORDER BY name ASC
            `,
            params
        );

    return rows;
}

/*
|--------------------------------------------------------------------------
| AREAS / SUB AREAS
|--------------------------------------------------------------------------
*/

async function scopedRows(
    table,
    user,
    columns
) {

    const hasCompany =
        await findColumn(
            table,
            ["company_id"]
        );

    const params = [];

    let sql =
        `SELECT ${columns} FROM \`${table}\``;

    if (
        !isSuperAdmin(user) &&
        hasCompany
    ) {

        const companyId =
            await companyIdOf(user);

        if (companyId <= 0) {
            return [];
        }

        sql += `
            WHERE company_id = ?
        `;

        params.push(companyId);
    }

    const [rows] =
        await db.query(
            sql + `
                ORDER BY name ASC
            `,
            params
        );

    return rows;
}

async function subAreasFor(user) {

    const hasCompany =
        await findColumn(
            "sub_areas",
            ["company_id"]
        );

    const params = [];

    let sql =
        "SELECT id, name";

    const hasArea =
        await findColumn(
            "sub_areas",
            ["area_id"]
        );

    if (hasArea) {
        sql += ", area_id";
    }

    sql += `
        FROM sub_areas
    `;

    if (
        !isSuperAdmin(user) &&
        hasCompany
    ) {

        const companyId =
            await companyIdOf(user);

        if (companyId <= 0) {
            return [];
        }

        sql += `
            WHERE company_id = ?
        `;

        params.push(companyId);
    }

    const [rows] =
        await db.query(
            sql + `
                ORDER BY name ASC
            `,
            params
        );

    return rows;
}

/*
|--------------------------------------------------------------------------
| PACKAGES
|--------------------------------------------------------------------------
*/

async function packagesFor(user) {

    const params = [];

    let sql = `
        SELECT
            p.id,
            p.company_id,
            p.router_id,
            p.profile_id,
            p.package_name,
            p.price,
            p.alias_name,
            s.name AS router_name,
            s.ip AS router_ip
        FROM mikrotik_packages p
        LEFT JOIN mikrotik_servers s
            ON s.id = p.router_id
    `;

    if (!isSuperAdmin(user)) {

        const companyId =
            await companyIdOf(user);

        if (companyId <= 0) {
            return [];
        }

        sql += `
            WHERE
                (
                    p.company_id = ?
                    OR p.company_id = 0
                )
        `;

        params.push(companyId);
    }

    const [rows] =
        await db.query(
            sql + `
                ORDER BY
                    s.name ASC,
                    p.package_name ASC
            `,
            params
        );

    return rows;
}

/*
|--------------------------------------------------------------------------
| BILLING HISTORY CHECK
|--------------------------------------------------------------------------
|
| PHP delete.php blocks deletion when payment/billing history exists.
|--------------------------------------------------------------------------
*/

async function hasHistoryTable(
    table
) {

    try {

        const [rows] =
            await db.query(
                `
                SHOW TABLES LIKE ?
                `,
                [table]
            );

        return rows.length > 0;

    } catch (_) {

        return false;
    }
}

async function customerHasBillingHistory(
    customerId
) {

    const tables = [
        "payments",
        "billing_history",
        "customer_billing",
        "customer_billing_history"
    ];

    for (const table of tables) {

        if (
            !(await hasHistoryTable(table))
        ) {
            continue;
        }

        const column =
            await findColumn(
                table,
                [
                    "customer_id",
                    "client_id",
                    "customer"
                ]
            );

        if (!column) {
            continue;
        }

        const [rows] =
            await db.query(
                `
                SELECT 1
                FROM \`${table}\`
                WHERE \`${column}\` = ?
                LIMIT 1
                `,
                [customerId]
            );

        if (rows.length) {
            return true;
        }
    }

    return false;
}

/*
|--------------------------------------------------------------------------
| CUSTOMER QUERY
|--------------------------------------------------------------------------
*/

async function selectedCustomers(
    user,
    ids
) {

    requireIds(ids);

    const scope =
        await customerScope(
            user,
            "c"
        );

    const [rows] =
        await db.query(
            `
            SELECT
                c.id,
                c.name,
                c.company_id,
                c.mikrotik_id,
                c.pppoe_username,
                c.pppoe_password,
                c.package_id,
                c.package_name,
                c.monthly_bill,
                c.status,
                c.payment_status
            FROM customers c
            WHERE c.id IN (?)
            ${scope.sql}
            `,
            [
                ids,
                ...scope.params
            ]
        );

    return rows;
}

/*
|--------------------------------------------------------------------------
| ACTIONS
|--------------------------------------------------------------------------
*/

const actions = {};

/*
|--------------------------------------------------------------------------
| BALANCE
|--------------------------------------------------------------------------
*/

actions.balance = {

    fragment({ ids }) {

        return popup({
            action: "balance",
            ids,
            body: field(
                "Balance",
                `
                <input
                    type="number"
                    step="any"
                    name="balance"
                    class="form-control form-control-sm"
                    required
                >
                `,
                true
            )
        });
    },

    async apply({
        ids,
        body,
        user
    }) {

        requireIds(ids);

        const raw =
            String(
                body.balance ?? ""
            ).trim();

        const value =
            Number(raw);

        if (
            raw === "" ||
            !Number.isFinite(value)
        ) {
            throw new BulkError(
                "Please enter a valid numeric balance amount."
            );
        }

        await updateCustomers(
            user,
            ids,
            "balance",
            value
        );

        await logActivity(
            user,
            "bulk_balance",
            `Bulk balance set to ${raw} for ${ids.length} customer(s)`
        );

        return {
            success: true,
            message:
                "Customer balance updated successfully!"
        };
    }
};

/*
|--------------------------------------------------------------------------
| BILLING CYCLE
|--------------------------------------------------------------------------
*/

actions.billing_cycle = {

    fragment({ ids }) {

        return popup({
            action: "billing_cycle",
            ids,
            body: field(
                "Billing Cycle",
                `
                <input
                    type="datetime-local"
                    name="billing_cycle"
                    class="form-control form-control-sm"
                    value="${nowLocalInput()}"
                    required
                >
                `,
                true
            )
        });
    },

    async apply({
        ids,
        body,
        user
    }) {

        requireIds(ids);

        const raw =
            String(
                body.billing_cycle || ""
            ).trim();

        if (!raw) {
            throw new BulkError(
                "Please select a valid billing cycle date."
            );
        }

        const value =
            toSqlDateTime(raw);

        if (!value) {
            throw new BulkError(
                "Invalid billing cycle date."
            );
        }

        await updateCustomers(
            user,
            ids,
            "billing_cycle",
            value
        );

        await logActivity(
            user,
            "bulk_billing_cycle",
            `Bulk billing cycle ${value} for ${ids.length} customer(s)`
        );

        return {
            success: true,
            message:
                "Billing cycle updated successfully!"
        };
    }
};

/*
|--------------------------------------------------------------------------
| PROMISE DATE
|--------------------------------------------------------------------------
*/

actions.promise_date = {

    fragment({ ids }) {

        return popup({
            action: "promise_date",
            ids,
            body: field(
                "Promise Date",
                `
                <input
                    type="datetime-local"
                    name="promise_date"
                    class="form-control form-control-sm"
                    value="${nowLocalInput()}"
                    required
                >
                `,
                true
            )
        });
    },

    async apply({
        ids,
        body,
        user
    }) {

        requireIds(ids);

        const raw =
            String(
                body.promise_date || ""
            ).trim();

        if (!raw) {
            throw new BulkError(
                "Please select a valid promise date."
            );
        }

        const value =
            toSqlDateTime(raw);

        if (!value) {
            throw new BulkError(
                "Invalid promise date."
            );
        }

        await updateCustomers(
            user,
            ids,
            "promise_date",
            value
        );

        await logActivity(
            user,
            "bulk_promise_date",
            `Bulk promise date ${value} for ${ids.length} customer(s)`
        );

        return {
            success: true,
            message:
                "Promise date updated successfully!"
        };
    }
};

/*
|--------------------------------------------------------------------------
| PAYMENT STATUS
|--------------------------------------------------------------------------
*/

actions.payment_status = {

    fragment({ ids }) {

        return popup({
            action: "payment_status",
            ids,
            body: `
                <div class="mb-3">

                    <div class="form-check form-check-inline">

                        <input
                            class="form-check-input"
                            type="radio"
                            name="payment_status"
                            id="payStatusPaid"
                            value="paid"
                            required
                        >

                        <label
                            class="form-check-label small"
                            for="payStatusPaid"
                        >
                            Paid
                        </label>

                    </div>

                    <div class="form-check form-check-inline">

                        <input
                            class="form-check-input"
                            type="radio"
                            name="payment_status"
                            id="payStatusUnpaid"
                            value="unpaid"
                        >

                        <label
                            class="form-check-label small"
                            for="payStatusUnpaid"
                        >
                            Unpaid
                        </label>

                    </div>

                </div>
            `
        });
    },

    async apply({
        ids,
        body,
        user
    }) {

        requireIds(ids);

        const posted =
            String(
                body.payment_status || ""
            )
            .trim()
            .toLowerCase();

        if (
            ![
                "paid",
                "unpaid",
                "due"
            ].includes(posted)
        ) {
            throw new BulkError(
                "Please select a valid payment status."
            );
        }

        const value =
            posted === "due"
                ? "unpaid"
                : posted;

        await updateCustomers(
            user,
            ids,
            "payment_status",
            value
        );

        await logActivity(
            user,
            "bulk_payment_status",
            `Bulk payment status ${posted} for ${ids.length} customer(s)`
        );

        return {
            success: true,
            message:
                "Payment status updated successfully!"
        };
    }
};

/*
|--------------------------------------------------------------------------
| MESSAGE
|--------------------------------------------------------------------------
*/

actions.message = {

    fragment({ ids }) {

        return popup({
            action: "message",
            ids,
            body: field(
                "Message",
                `
                <textarea
                    name="message"
                    class="form-control form-control-sm"
                    rows="4"
                    required
                ></textarea>
                `,
                true
            )
        });
    },

    async apply({
        ids,
        body,
        user
    }) {

        requireIds(ids);

        const message =
            String(
                body.message || ""
            ).trim();

        if (!message) {
            throw new BulkError(
                "Message content cannot be empty."
            );
        }

        /*
        | PHP source currently has no actual
        | SMS/WhatsApp gateway implementation.
        */

        await logActivity(
            user,
            "bulk_message",
            `Bulk message processed for ${ids.length} customer(s)`
        );

        return {
            success: true,
            message:
                "Bulk message processed successfully!"
        };
    }
};

/*
|--------------------------------------------------------------------------
| CONNECTION COLUMNS
|--------------------------------------------------------------------------
*/

const AUTO_COLS = [
    "auto_connection",
    "automatic_connection",
    "connection_enabled",
    "auto_connect",
    "connection_on"
];

const NEXT_COLS = [
    "continue_next_month",
    "next_auto_connection",
    "next_month_auto_connection",
    "next_auto_connect"
];

const COLOR_COLS = [
    "id_color",
    "is_red",
    "text_color",
    "customer_color",
    "red_id"
];

const MODE_COLS = [
    "connection_mode",
    "mode",
    "status_type"
];

function checkRow(
    id,
    name,
    label
) {

    return `
        <div class="mb-3">

            <label
                for="${esc(id)}"
                style="
                    display:inline-flex;
                    align-items:center;
                    gap:10px;
                    background:#f1f1f1;
                    border-radius:4px;
                    padding:8px 12px;
                    font-size:13px;
                    color:#555;
                "
            >

                ${esc(label)}

                <input
                    type="checkbox"
                    class="form-check-input m-0"
                    id="${esc(id)}"
                    name="${esc(name)}"
                    value="1"
                >

            </label>

        </div>
    `;
}

/*
|--------------------------------------------------------------------------
| CONNECTION ON
|--------------------------------------------------------------------------
*/

actions.connection_on = {

    fragment({ ids }) {

        return popup({
            action: "connection_on",
            ids,
            body:
                checkRow(
                    "autoConnCheck",
                    "auto_connection_status",
                    "Automatic Connection On/Off"
                ) +
                checkRow(
                    "nextMonthConnCheck",
                    "next_month_auto_status",
                    "Next Month Automatic Connection On/Off"
                )
        });
    },

    async apply({
        ids,
        body,
        user
    }) {

        requireIds(ids);

        const auto =
            body.auto_connection_status
                ? 1
                : 0;

        const next =
            body.next_month_auto_status
                ? 1
                : 0;

        const sets = [];
        const params = [];

        function add(
            column,
            value
        ) {

            if (column) {

                sets.push(
                    `\`${column}\` = ?`
                );

                params.push(value);
            }
        }

        add(
            await findColumn(
                "customers",
                AUTO_COLS
            ),
            auto
        );

        add(
            await findColumn(
                "customers",
                NEXT_COLS
            ),
            next
        );

        add(
            await findColumn(
                "customers",
                COLOR_COLS
            ),
            auto === 0 ? 1 : 0
        );

        add(
            await findColumn(
                "customers",
                MODE_COLS
            ),
            auto === 1
                ? "auto"
                : "manual"
        );

        if (!sets.length) {
            throw new BulkError(
                "No valid connection setting column found in customers table."
            );
        }

        const scope =
            await customerScope(
                user,
                "c"
            );

        await db.query(
            `
            UPDATE customers c
            SET ${sets.join(", ")}
            WHERE c.id IN (?)
            ${scope.sql}
            `,
            [
                ...params,
                ids,
                ...scope.params
            ]
        );

        await logActivity(
            user,
            "bulk_connection_on",
            `Bulk connection mode ${auto ? "auto" : "manual"} for ${ids.length} customer(s)`
        );

        return {
            success: true,
            message:
                auto === 1
                    ? `${ids.length} customer(s) set to Automatic Connection mode.`
                    : `${ids.length} customer(s) set to Manual/Promise mode. ID marked red.`
        };
    }
};

/*
|--------------------------------------------------------------------------
| CONNECTION OFF
|--------------------------------------------------------------------------
*/

actions.connection_off = {

    fragment({ ids }) {

        return popup({
            action: "connection_off",
            ids,
            body: `
                <p
                    class="small mb-3"
                    style="color:#555;"
                >
                    Automatic Connection will be turned
                    <strong>OFF</strong> for
                    <strong>${ids.length}</strong>
                    customer(s).
                </p>
            `
        });
    },

    async apply({
        ids,
        user
    }) {

        requireIds(ids);

        const column =
            await findColumn(
                "customers",
                AUTO_COLS
            );

        if (!column) {
            throw new BulkError(
                "Automatic connection field was not found in customers table."
            );
        }

        await updateCustomers(
            user,
            ids,
            column,
            0
        );

        /*
        | Preserve PHP behavior:
        | manual mode / red ID.
        */

        const colorColumn =
            await findColumn(
                "customers",
                COLOR_COLS
            );

        if (colorColumn) {

            await updateCustomers(
                user,
                ids,
                colorColumn,
                1
            );
        }

        const modeColumn =
            await findColumn(
                "customers",
                MODE_COLS
            );

        if (modeColumn) {

            await updateCustomers(
                user,
                ids,
                modeColumn,
                "manual"
            );
        }

        await logActivity(
            user,
            "bulk_connection_off",
            `Automatic connection OFF for ${ids.length} customer(s)`
        );

        return {
            success: true,
            message:
                `${ids.length} customer(s) automatic connection disabled.`
        };
    }
};

/*
|--------------------------------------------------------------------------
| MIKROTIK ASSIGNMENT
|--------------------------------------------------------------------------
*/

actions.mikrotik = {

    async fragment({
        ids,
        user
    }) {

        const routers =
            await routersFor(user);

        const options =
            routers.map(router => `
                <option value="${Number(router.id)}">
                    ${esc(router.name)}
                    -
                    ${esc(router.ip)}
                </option>
            `).join("");

        return popup({
            action: "mikrotik",
            ids,
            body: field(
                "Mikrotik",
                `
                <select
                    name="mikrotik_id"
                    class="form-select form-select-sm"
                    required
                >
                    <option value="">
                        Select Mikrotik
                    </option>

                    ${options}

                </select>
                `,
                true
            )
        });
    },

    async apply({
        ids,
        body,
        user
    }) {

        requireIds(ids);

        const routerId =
            parseInt(
                body.mikrotik_id,
                10
            ) || 0;

        if (routerId <= 0) {
            throw new BulkError(
                "Please select MikroTik router."
            );
        }

        const routers =
            await routersFor(user);

        if (
            !routers.some(
                router =>
                    Number(router.id) === routerId
            )
        ) {
            throw new BulkError(
                "Invalid MikroTik router."
            );
        }

        await updateCustomers(
            user,
            ids,
            "mikrotik_id",
            routerId
        );

        await logActivity(
            user,
            "bulk_mikrotik",
            `Bulk MikroTik ${routerId} for ${ids.length} customer(s)`
        );

        return {
            success: true,
            message:
                `${ids.length} customer(s) MikroTik updated.`
        };
    }
};

/*
|--------------------------------------------------------------------------
| RESELLER
|--------------------------------------------------------------------------
*/

actions.reseller = {

    async fragment({
        ids,
        user
    }) {

        const resellers =
            await resellersFor(user);

        const subs =
            await subAreasFor(user);

        return popup({
            action: "reseller",
            ids,
            body:

                field(
                    "Reseller",
                    `
                    <select
                        name="reseller_id"
                        class="form-select form-select-sm"
                        required
                    >
                        <option value="">
                            Select Reseller
                        </option>

                        ${
                            resellers.map(
                                reseller => `
                                <option
                                    value="${Number(reseller.id)}"
                                >
                                    ${esc(
                                        reseller.name ||
                                        reseller.username
                                    )}
                                </option>
                                `
                            ).join("")
                        }

                    </select>
                    `,
                    true
                ) +

                field(
                    "Sub Area",
                    `
                    <select
                        name="sub_area_id"
                        class="form-select form-select-sm"
                    >
                        <option value="">
                            Sub Area
                        </option>

                        ${
                            subs.map(
                                sub => `
                                <option
                                    value="${Number(sub.id)}"
                                >
                                    ${esc(sub.name)}
                                </option>
                                `
                            ).join("")
                        }

                    </select>
                    `
                )
        });
    },

    async apply({
        ids,
        body,
        user
    }) {

        requireIds(ids);

        const resellerId =
            parseInt(
                body.reseller_id,
                10
            ) || 0;

        if (resellerId <= 0) {
            throw new BulkError(
                "Please select reseller."
            );
        }

        const resellers =
            await resellersFor(user);

        if (
            !resellers.some(
                reseller =>
                    Number(reseller.id) === resellerId
            )
        ) {
            throw new BulkError(
                "Invalid reseller."
            );
        }

        const resellerColumn =
            await findColumn(
                "customers",
                [
                    "reseller_id",
                    "reseller_user_id",
                    "reseller"
                ]
            );

        if (!resellerColumn) {
            throw new BulkError(
                "Reseller field was not found in customers table."
            );
        }

        await updateCustomers(
            user,
            ids,
            resellerColumn,
            resellerId
        );

        const subId =
            parseInt(
                body.sub_area_id,
                10
            ) || 0;

        if (subId > 0) {

            const subColumn =
                await findColumn(
                    "customers",
                    ["sub_area_id"]
                );

            if (subColumn) {

                const subs =
                    await subAreasFor(user);

                const found =
                    subs.some(
                        sub =>
                            Number(sub.id) === subId
                    );

                if (!found) {
                    throw new BulkError(
                        "Invalid sub-area."
                    );
                }

                await updateCustomers(
                    user,
                    ids,
                    subColumn,
                    subId
                );
            }
        }

        await logActivity(
            user,
            "bulk_reseller",
            `Bulk reseller ${resellerId} for ${ids.length} customer(s)`
        );

        return {
            success: true,
            message:
                `${ids.length} customer(s) transferred to reseller.`
        };
    }
};

/*
|--------------------------------------------------------------------------
| STATUS
|--------------------------------------------------------------------------
*/

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

        const [columns] =
            await db.query(
                `
                SHOW COLUMNS
                FROM customers
                LIKE 'status'
                `
            );

        const type =
            String(
                columns[0]?.Type || ""
            );

        if (
            /^enum\s*\(/i.test(type)
        ) {

            const values =
                [
                    ...type.matchAll(
                        /'((?:[^']|'')*)'/g
                    )
                ]
                .map(
                    match =>
                        match[1]
                            .replace(/''/g, "'")
                            .toLowerCase()
                );

            return Object.fromEntries(
                Object.entries(
                    STATUS_OPTIONS
                ).filter(
                    ([key]) =>
                        values.includes(
                            key.toLowerCase()
                        )
                )
            );
        }

    } catch (error) {

        console.warn(
            "STATUS ENUM CHECK WARNING:",
            error.message
        );
    }

    return STATUS_OPTIONS;
}

actions.status = {

    async fragment({ ids }) {

        const options =
            await allowedStatuses();

        return popup({
            action: "status",
            ids,
            body: field(
                "Status",
                `
                <select
                    name="status"
                    class="form-select form-select-sm"
                    required
                >

                    ${
                        Object.entries(
                            options
                        ).map(
                            ([value, label]) => `
                            <option
                                value="${esc(value)}"
                            >
                                ${esc(label)}
                            </option>
                            `
                        ).join("")
                    }

                </select>

                <small
                    class="text-muted d-block mt-1"
                >
                    Expired = PPPoE goes to the
                    Block profile.
                    Active = PPPoE returns to the
                    customer's own package profile.
                </small>
                `,
                true
            )
        });
    },

    async apply({
        ids,
        body,
        user
    }) {

        requireIds(ids);

        const options =
            await allowedStatuses();

        const posted =
            String(
                body.status || ""
            )
            .trim()
            .toLowerCase();

        const status =
            Object.keys(options)
                .find(
                    key =>
                        key.toLowerCase() ===
                        posted
                );

        if (!status) {
            throw new BulkError(
                "Invalid customer status."
            );
        }

        const customers =
            await selectedCustomers(
                user,
                ids
            );

        if (!customers.length) {
            throw new BulkError(
                "No allowed customers found."
            );
        }

        const touchRouter =
            status === "Expired" ||
            status === "Active";

        const companyId =
            await companyIdOf(user);

        const session =
            ppp.createSession({
                companyId,
                isSuper:
                    isSuperAdmin(user)
            });

        let ok = 0;
        const errors = [];

        try {

            for (const customer of customers) {

                const customerId =
                    Number(customer.id);

                const label =
                    String(
                        customer.name || ""
                    ).trim() ||
                    `#${customerId}`;

                const pppoe =
                    String(
                        customer.pppoe_username ||
                        ""
                    ).trim();

                try {

                    if (touchRouter) {

                        const routerId =
                            await ppp.resolveRouter(
                                session,
                                {
                                    customerId,
                                    mikrotikId:
                                        Number(
                                            customer.mikrotik_id ||
                                            0
                                        ),
                                    pppoe
                                }
                            );

                        if (
                            routerId <= 0 ||
                            !pppoe
                        ) {

                            throw new Error(
                                "MikroTik not updated: " +
                                (
                                    routerId <= 0
                                        ? "no MikroTik router linked"
                                        : "no PPPoE username"
                                )
                            );
                        }

                        const api =
                            await session.api(
                                routerId
                            );

                        if (
                            status === "Expired"
                        ) {

                            const blockProfile =
                                await ppp.blockProfile(
                                    routerId
                                );

                            await ppp.blockCustomer(
                                api,
                                {
                                    pppoe,
                                    blockProfileName:
                                        blockProfile,
                                    customerId
                                }
                            );

                        } else {

                            await ppp.unblockCustomer(
                                api,
                                {
                                    pppoe,
                                    routerId,
                                    customerId
                                }
                            );
                        }
                    }

                    await updateCustomers(
                        user,
                        [customerId],
                        "status",
                        status
                    );

                    ok++;

                } catch (error) {

                    errors.push(
                        `${label}: ${error.message}`
                    );
                }
            }

        } finally {

            await session.closeAll();
        }

        if (ok === 0) {

            throw new BulkError(
                `Status not changed. ${
                    errors
                        .slice(0, 3)
                        .join(" | ")
                }`
            );
        }

        await logActivity(
            user,
            "bulk_status",
            `Bulk status ${status} for ${ok} customer(s)`
        );

        let message =
            `${ok} customer(s) set to ${status}.`;

        if (errors.length) {

            message +=
                ` Failed (${errors.length}): ` +
                errors
                    .slice(0, 3)
                    .join(" | ");
        }

        return {
            success: true,
            message,
            updated: ok,
            failed: errors.length,
            errors: errors.slice(0, 20)
        };
    }
};

/*
|--------------------------------------------------------------------------
| DELETE
|--------------------------------------------------------------------------
*/

actions.delete = {

    fragment({ ids }) {

        return popup({
            action: "delete",
            ids,
            submitLabel: "Delete",
            submitClass: "btn-danger",
            body: `
                <div class="mb-3">

                    <div class="form-check">

                        <input
                            class="form-check-input"
                            type="checkbox"
                            name="delete_mikrotik"
                            id="bulkDeleteMikrotik"
                            value="1"
                        >

                        <label
                            class="form-check-label small"
                            for="bulkDeleteMikrotik"
                            style="color:#555;"
                        >
                            Do you want to delete Mikrotik ?
                        </label>

                    </div>

                    <div
                        class="alert alert-warning py-2 small mt-2 mb-0"
                    >
                        Customers with payment or billing
                        history cannot be deleted.
                    </div>

                </div>
            `
        });
    },

    async apply({
        ids,
        body,
        user
    }) {

        requireIds(ids);

        const deleteMikrotik =
            Boolean(
                body.delete_mikrotik
            );

        const customers =
            await selectedCustomers(
                user,
                ids
            );

        if (!customers.length) {
            throw new BulkError(
                "No allowed customers found."
            );
        }

        const companyId =
            await companyIdOf(user);

        const session =
            ppp.createSession({
                companyId,
                isSuper:
                    isSuperAdmin(user)
            });

        let ok = 0;
        const errors = [];

        try {

            for (const customer of customers) {

                const customerId =
                    Number(customer.id);

                const label =
                    String(
                        customer.name || ""
                    ).trim() ||
                    `#${customerId}`;

                const pppoe =
                    String(
                        customer.pppoe_username ||
                        ""
                    ).trim();

                try {

                    /*
                    |--------------------------------------------------
                    | Billing/payment history protection
                    |--------------------------------------------------
                    */

                    if (
                        await customerHasBillingHistory(
                            customerId
                        )
                    ) {

                        throw new Error(
                            "Payment/billing history exists. Customer NOT deleted."
                        );
                    }

                    /*
                    |--------------------------------------------------
                    | Optional MikroTik deletion
                    |--------------------------------------------------
                    */

                    if (deleteMikrotik) {

                        const routerId =
                            await ppp.resolveRouter(
                                session,
                                {
                                    customerId,
                                    mikrotikId:
                                        Number(
                                            customer.mikrotik_id ||
                                            0
                                        ),
                                    pppoe,
                                    persist: false
                                }
                            );

                        if (
                            routerId <= 0 ||
                            !pppoe
                        ) {

                            throw new Error(
                                "MikroTik not updated: " +
                                (
                                    routerId <= 0
                                        ? "no MikroTik router linked"
                                        : "no PPPoE username"
                                ) +
                                " (customer NOT deleted)"
                            );
                        }

                        const api =
                            await session.api(
                                routerId
                            );

                        const secret =
                            await ppp.findSecret(
                                api,
                                pppoe
                            );

                        if (secret) {

                            try {

                                await api.write(
                                    "/ppp/secret/remove",
                                    [
                                        `=.id=${secret[".id"]}`
                                    ]
                                );

                            } catch (error) {

                                throw new Error(
                                    "MikroTik could not remove PPPoE: " +
                                    error.message
                                );
                            }

                            await ppp.kick(
                                api,
                                pppoe
                            );
                        }

                        await ppp.backupClear(
                            customerId
                        );
                    }

                    /*
                    |--------------------------------------------------
                    | Final tenant-protected DELETE
                    |--------------------------------------------------
                    */

                    const params = [
                        customerId
                    ];

                    let sql = `
                        DELETE FROM customers
                        WHERE id = ?
                    `;

                    if (!isSuperAdmin(user)) {

                        if (companyId <= 0) {
                            throw new Error(
                                "Company information not found."
                            );
                        }

                        sql += `
                            AND company_id = ?
                        `;

                        params.push(
                            companyId
                        );
                    }

                    const [result] =
                        await db.query(
                            sql,
                            params
                        );

                    if (
                        Number(
                            result.affectedRows || 0
                        ) !== 1
                    ) {

                        throw new Error(
                            "Customer could not be deleted."
                        );
                    }

                    ok++;

                } catch (error) {

                    errors.push(
                        `${label}: ${error.message}`
                    );
                }
            }

        } finally {

            await session.closeAll();
        }

        if (ok === 0) {

            throw new BulkError(
                `No customer deleted. ${
                    errors
                        .slice(0, 3)
                        .join(" | ")
                }`
            );
        }

        await logActivity(
            user,
            "bulk_delete",
            `Bulk delete: ${ok} customer(s)${
                deleteMikrotik
                    ? " (+MikroTik)"
                    : ""
            }`
        );

        let message =
            `${ok} customer(s) deleted` +
            (
                deleteMikrotik
                    ? " (MikroTik PPPoE removed too)."
                    : " from database."
            );

        if (errors.length) {

            message +=
                ` Failed (${errors.length}): ` +
                errors
                    .slice(0, 3)
                    .join(" | ");
        }

        return {
            success: true,
            message,
            deleted: ok,
            failed: errors.length,
            errors: errors.slice(0, 20)
        };
    }
};

/*
|--------------------------------------------------------------------------
| AREA
|--------------------------------------------------------------------------
*/

actions.area = {

    async fragment({
        ids,
        user
    }) {

        const areas =
            await scopedRows(
                "areas",
                user,
                "id, name"
            );

        const hasAreaColumn =
            await findColumn(
                "sub_areas",
                ["area_id"]
            );

        const subs =
            await scopedRows(
                "sub_areas",
                user,
                hasAreaColumn
                    ? "id, name, area_id"
                    : "id, name"
            );

        const groups =
            areas.map(area => {

                const own =
                    subs.filter(
                        sub =>
                            !hasAreaColumn ||
                            Number(sub.area_id) ===
                            Number(area.id)
                    );

                if (!own.length) {
                    return "";
                }

                return `
                    <optgroup
                        label="${esc(area.name)}"
                    >
                        ${
                            own.map(
                                sub => `
                                <option
                                    value="${Number(sub.id)}"
                                >
                                    ${esc(sub.name)}
                                </option>
                                `
                            ).join("")
                        }
                    </optgroup>
                `;
            }).join("");

        return popup({
            action: "area",
            ids,
            body:

                field(
                    "Area",
                    `
                    <select
                        name="new_area_id"
                        class="form-select form-select-sm"
                        required
                    >
                        <option value="">
                            Select Area
                        </option>

                        ${
                            areas.map(
                                area => `
                                <option
                                    value="${Number(area.id)}"
                                >
                                    ${esc(area.name)}
                                </option>
                                `
                            ).join("")
                        }

                    </select>
                    `,
                    true
                ) +

                field(
                    "Sub Area (must belong to the selected area)",
                    `
                    <select
                        name="new_sub_area_id"
                        class="form-select form-select-sm"
                    >

                        <option value="">
                            No sub area
                        </option>

                        ${groups}

                    </select>
                    `
                )
        });
    },

    async apply({
        ids,
        body,
        user
    }) {

        requireIds(ids);

        const areaId =
            parseInt(
                body.new_area_id ??
                body.area_id,
                10
            ) || 0;

        const subId =
            parseInt(
                body.new_sub_area_id ??
                body.sub_area_id,
                10
            ) || 0;

        if (areaId <= 0) {
            throw new BulkError(
                "Please select an area."
            );
        }

        const areas =
            await scopedRows(
                "areas",
                user,
                "id"
            );

        if (
            !areas.some(
                area =>
                    Number(area.id) ===
                    areaId
            )
        ) {
            throw new BulkError(
                "Selected area was not found."
            );
        }

        if (subId > 0) {

            const hasAreaColumn =
                await findColumn(
                    "sub_areas",
                    ["area_id"]
                );

            const subs =
                await scopedRows(
                    "sub_areas",
                    user,
                    hasAreaColumn
                        ? "id, area_id"
                        : "id"
                );

            const found =
                subs.find(
                    sub =>
                        Number(sub.id) ===
                            subId &&
                        (
                            !hasAreaColumn ||
                            Number(sub.area_id) ===
                                areaId
                        )
                );

            if (!found) {
                throw new BulkError(
                    "Selected sub-area was not found."
                );
            }
        }

        const subColumn =
            await findColumn(
                "customers",
                ["sub_area_id"]
            );

        if (subColumn) {

            const scope =
                await customerScope(
                    user,
                    "c"
                );

            await db.query(
                `
                UPDATE customers c
                SET
                    c.area_id = ?,
                    c.sub_area_id = ?
                WHERE c.id IN (?)
                ${scope.sql}
                `,
                [
                    areaId,
                    subId > 0
                        ? subId
                        : null,
                    ids,
                    ...scope.params
                ]
            );

        } else {

            await updateCustomers(
                user,
                ids,
                "area_id",
                areaId
            );
        }

        await logActivity(
            user,
            "bulk_area",
            `Bulk area ${areaId}/${subId || "-"} for ${ids.length} customer(s)`
        );

        return {
            success: true,
            message:
                `${ids.length} customer(s) area updated successfully!`
        };
    }
};

/*
|--------------------------------------------------------------------------
| PACKAGE
|--------------------------------------------------------------------------
*/

const packageAction = {

    async fragment({
        ids,
        user
    }) {

        const routers =
            await routersFor(user);

        const packages =
            await packagesFor(user);

        const groups =
            routers.map(router => {

                const own =
                    packages.filter(
                        pkg =>
                            Number(
                                pkg.router_id
                            ) ===
                            Number(router.id)
                    );

                if (!own.length) {
                    return "";
                }

                return `
                    <optgroup
                        label="${esc(router.name)} - ${esc(router.ip)}"
                    >
                        ${
                            own.map(
                                pkg => `
                                <option
                                    value="${Number(pkg.id)}"
                                >
                                    ${esc(pkg.package_name)}
                                    (৳${esc(pkg.price)})
                                </option>
                                `
                            ).join("")
                        }
                    </optgroup>
                `;
            }).join("");

        return popup({
            action: "package",
            ids,
            body: field(
                "Package",
                `
                <select
                    name="package_id"
                    class="form-select form-select-sm"
                    required
                >

                    <option value="">
                        Select Package
                    </option>

                    ${groups}

                </select>

                <small
                    class="text-muted d-block mt-1"
                >
                    The customers' PPPoE profile is changed
                    on the package's MikroTik, and their
                    monthly bill is set to the package price.
                </small>
                `,
                true
            )
        });
    },

    async apply({
        ids,
        body,
        user
    }) {

        requireIds(ids);

        let packageId =
            parseInt(
                body.package_id,
                10
            ) || 0;

        let routerId =
            parseInt(
                body.router_id,
                10
            ) || 0;

        const packages =
            await packagesFor(user);

        if (
            packageId <= 0 &&
            body.new_package &&
            routerId > 0
        ) {

            const packageName =
                String(
                    body.new_package
                ).trim();

            const found =
                packages.find(
                    pkg =>
                        pkg.package_name ===
                            packageName &&
                        Number(pkg.router_id) ===
                            routerId
                );

            if (found) {
                packageId =
                    Number(found.id);
            }
        }

        if (packageId <= 0) {
            throw new BulkError(
                "Please select a valid package."
            );
        }

        const pkg =
            packages.find(
                item =>
                    Number(item.id) ===
                    packageId
            );

        if (!pkg) {
            throw new BulkError(
                "Invalid package for selected MikroTik."
            );
        }

        if (
            routerId > 0 &&
            routerId !== Number(pkg.router_id)
        ) {
            throw new BulkError(
                "Invalid package for selected MikroTik."
            );
        }

        routerId =
            Number(pkg.router_id);

        if (routerId <= 0) {
            throw new BulkError(
                "Selected package has no MikroTik router."
            );
        }

        const routers =
            await routersFor(user);

        if (
            !routers.some(
                router =>
                    Number(router.id) ===
                    routerId
            )
        ) {
            throw new BulkError(
                "Invalid MikroTik router."
            );
        }

        /*
        | IMPORTANT:
        | MikroTik profile is profile_id,
        | NOT package_name.
        */

        const profile =
            String(
                pkg.profile_id || ""
            ).trim();

        if (!profile) {
            throw new BulkError(
                "Selected package has no MikroTik profile_id."
            );
        }

        const packageName =
            String(
                pkg.package_name || ""
            ).trim();

        const alias =
            String(
                pkg.alias_name || ""
            ).trim();

        const price =
            Number(
                pkg.price || 0
            );

        const customers =
            await selectedCustomers(
                user,
                ids
            );

        const companyId =
            await companyIdOf(user);

        const session =
            ppp.createSession({
                companyId,
                isSuper:
                    isSuperAdmin(user)
            });

        let ok = 0;
        const errors = [];

        let api;

        try {

            api =
                await session.api(
                    routerId
                );

        } catch (error) {

            await session.closeAll();

            throw new BulkError(
                `MikroTik connection failed: ${error.message}`
            );
        }

        const billColumn =
            await findColumn(
                "customers",
                [
                    "monthly_bill",
                    "monthly_fee",
                    "bill"
                ]
            );

        const profileColumn =
            await findColumn(
                "customers",
                [
                    "profile_id",
                    "mikrotik_profile"
                ]
            );

        const aliasColumn =
            await findColumn(
                "customers",
                [
                    "alias_name",
                    "package_alias"
                ]
            );

        const nameColumn =
            await findColumn(
                "customers",
                ["package_name"]
            );

        try {

            for (const customer of customers) {

                const customerId =
                    Number(customer.id);

                const pppoe =
                    String(
                        customer.pppoe_username ||
                        ""
                    ).trim();

                if (!pppoe) {

                    errors.push(
                        `Customer ID ${customerId}: PPPoE username not found.`
                    );

                    continue;
                }

                try {

                    const secret =
                        await ppp.findSecret(
                            api,
                            pppoe
                        );

                    if (!secret) {

                        errors.push(
                            `${pppoe}: PPPoE secret not found on MikroTik.`
                        );

                        continue;
                    }

                    /*
                    |--------------------------------------------------
                    | Change MikroTik profile FIRST
                    |--------------------------------------------------
                    */

                    try {

                        await api.write(
                            "/ppp/secret/set",
                            [
                                `=.id=${secret[".id"]}`,
                                `=profile=${profile}`
                            ]
                        );

                    } catch (error) {

                        errors.push(
                            `${pppoe}: MikroTik profile change failed - ${error.message}`
                        );

                        continue;
                    }

                    /*
                    |--------------------------------------------------
                    | DB update only after MikroTik success
                    |--------------------------------------------------
                    */

                    const sets = [
                        "mikrotik_id = ?",
                        "package_id = ?"
                    ];

                    const params = [
                        routerId,
                        packageId
                    ];

                    function add(
                        column,
                        value
                    ) {

                        if (column) {

                            sets.push(
                                `\`${column}\` = ?`
                            );

                            params.push(value);
                        }
                    }

                    add(
                        nameColumn,
                        packageName
                    );

                    add(
                        billColumn,
                        price
                    );

                    add(
                        profileColumn,
                        profile
                    );

                    add(
                        aliasColumn,
                        alias
                    );

                    const scope =
                        await customerScope(
                            user,
                            "c"
                        );

                    await db.query(
                        `
                        UPDATE customers c
                        SET ${sets.join(", ")}
                        WHERE c.id = ?
                        ${scope.sql}
                        `,
                        [
                            ...params,
                            customerId,
                            ...scope.params
                        ]
                    );

                    /*
                    | Customer now has a real package profile.
                    */

                    await ppp.backupClear(
                        customerId
                    );

                    ok++;

                } catch (error) {

                    errors.push(
                        `${pppoe}: ${error.message}`
                    );
                }
            }

        } finally {

            await session.closeAll();
        }

        if (ok === 0) {

            throw new BulkError(
                `No customer package changed. ${
                    errors
                        .slice(0, 3)
                        .join(" | ")
                }`
            );
        }

        await logActivity(
            user,
            "bulk_package",
            `Bulk package ${packageName} for ${ok} customer(s)`
        );

        const message =
            errors.length
                ? `${ok} customer(s) updated successfully. ${errors.length} failed. ${errors.slice(0, 3).join(" | ")}`
                : `${ok} customer(s) package changed successfully.`;

        return {
            success: true,
            message,
            updated: ok,
            failed: errors.length,
            package_id: packageId,
            router_id: routerId,
            profile_id: profile,
            errors: errors.slice(0, 20)
        };
    }
};

actions.package =
    packageAction;

/*
|--------------------------------------------------------------------------
| OLD PHP COMPATIBILITY
|--------------------------------------------------------------------------
*/

actions.package_update = {

    async fragment(ctx) {

        const html =
            await packageAction.fragment(
                ctx
            );

        return html.replace(
            'action="/api/customers/bulk/package"',
            'action="/api/customers/bulk/package_update"'
        );
    },

    async apply(ctx) {

        return packageAction.apply(
            ctx
        );
    }
};

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {

    BulkError,

    actions,

    getIds,

    getAllowedIds,

    checkCsrf,

    esc,

    popup,

    field,

    updateCustomers,

    findColumn,

    logActivity,

    isSuperAdmin,

    companyIdOf,

    customerScope,

    customerHasBillingHistory,

    _test: {
        toSqlDateTime
    }
};