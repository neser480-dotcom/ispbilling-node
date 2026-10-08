"use strict";

/*
|--------------------------------------------------------------------------
| CUSTOMER CSV SERVICE
|--------------------------------------------------------------------------
| Port of customers/csv/export.php, import.php, template.php
|
| Import is DATABASE ONLY (as in PHP) - it does not touch MikroTik.
|--------------------------------------------------------------------------
*/

const db = require("../config/database");


class CsvError extends Error {
    constructor(message, httpCode = 400) {
        super(message);
        this.httpCode = httpCode;
    }
}

const EXPORT_HEADERS = [
    "customer_id",
    "name_of_client",
    "PPPoE_Name",
    "address_of_client",
    "activation_date",
    "client_mikrotik",
    "bandwidth_allocation MB",
    "password",
    "client_phone",
    "status",
    "payment Status",
    "subArea",
    "area",
    "email",
    "balance",
    "billing_cycle",
    "user_type",
    "selling_bandwidthBDT (Excluding VAT).",
    "comment"
];


/*
|--------------------------------------------------------------------------
| CSV PARSE / SERIALIZE  (RFC 4180)
|--------------------------------------------------------------------------
*/

function parseCsv(text, delimiter = ",") {

    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {

        const ch = text[i];

        if (inQuotes) {

            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else {
                field += ch;
            }

        } else if (ch === '"') {
            inQuotes = true;

        } else if (ch === delimiter) {
            row.push(field); field = "";

        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && text[i + 1] === "\n") i++;
            row.push(field); field = "";
            rows.push(row); row = [];

        } else {
            field += ch;
        }
    }

    if (field !== "" || row.length) {
        row.push(field);
        rows.push(row);
    }

    return rows;
}

function detectDelimiter(firstLine) {

    let best = ",";
    let bestCount = 1;

    for (const candidate of [",", ";", "\t", "|"]) {
        const count = (parseCsv(firstLine, candidate)[0] || []).length;
        if (count > bestCount) { bestCount = count; best = candidate; }
    }

    return best;
}

function csvCell(value) {

    const s = value === null || value === undefined ? "" : String(value);

    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvLine(values) {
    return values.map(csvCell).join(",") + "\r\n";
}


/*
|--------------------------------------------------------------------------
| HELPERS (ports of the PHP functions)
|--------------------------------------------------------------------------
*/

function normalizeHeader(value) {
    return String(value ?? "")
        .replace(/^﻿/, "")
        .replace(/^[ \t\n\r\0\x0B"']+|[ \t\n\r\0\x0B"']+$/g, "")
        .toLowerCase()
        .replace(/[_\-.]/g, " ")
        .replace(/[()]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeText(value) {
    return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ").trim();
}

function cleanNumber(value) {
    const v = String(value ?? "").replace(/,|৳|BDT|bdt| /g, "");
    if (v === "" || !Number.isFinite(Number(v))) return 0;
    return Number(v);
}

function parseDateOnly(raw) {

    raw = String(raw || "").trim();

    if (!raw) return null;

    const d = new Date(raw);

    if (Number.isNaN(d.getTime())) return null;

    const pad = n => String(n).padStart(2, "0");

    /* date-only strings are parsed as UTC by JS, others as local time */
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw);

    return iso
        ? raw
        : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const ALIASES = {
    customer_id: ["customer id", "customerid", "id", "client id", "clientid"],
    name: ["name", "name of client", "client name", "clientname"],
    pppoe_username: ["pppoe name", "pppoe username", "pppoe user", "username", "user"],
    client_mikrotik: ["client mikrotik", "clientmikrotik", "mikrotik", "mikrotik id", "mikrotikid"],
    pppoe_password: ["password", "pppoe password", "pass"],
    address: ["address", "address of client", "client address", "clientaddress"],
    connection_date: ["activation date", "connection date", "activation", "connectiondate"],
    package: ["package", "package name", "bandwidth allocation mb", "bandwidth allocation", "bandwidth"],
    phone: ["phone", "mobile", "client phone", "client mobile", "mobile number", "phone number"],
    status: ["status", "connection status"],
    payment_status: ["payment status", "paymentstatus", "payment"],
    sub_area: ["subarea", "sub area", "sub area id"],
    area: ["area", "area id"],
    email: ["email", "email address"],
    balance: ["balance", "due", "customer balance"],
    monthly_bill: [
        "selling bandwidthbdt excluding vat", "selling bandwidthbdt",
        "selling bandwidth bdt excluding vat", "selling bandwidth bdt",
        "selling bandwidth", "monthly bill", "monthly bill bdt", "price", "bill"
    ],
    billing_cycle: ["billing cycle", "billingcycle", "cycle"],
    user_type: ["user type", "usertype", "type"],
    comments: ["comment", "comments", "remarks", "remark"]
};

function mapStatus(raw) {

    raw = String(raw || "").trim();

    if (!raw) return "Active";

    const v = raw.toLowerCase();

    if (["active", "enable", "enabled", "online", "1"].includes(v)) return "Active";
    if (["inactive", "disable", "disabled", "offline", "0"].includes(v)) return "Inactive";

    return raw;
}

function mapPaymentStatus(raw) {

    const v = String(raw || "").trim().toLowerCase();

    if (["paid", "complete", "completed", "yes", "1"].includes(v)) return "paid";
    if (["partial", "partially paid", "partial paid"].includes(v)) return "partial";

    return "unpaid";
}


/*
|--------------------------------------------------------------------------
| COMPANY
|--------------------------------------------------------------------------
*/

async function companyIdOf(user) {

    let id = Number(user.company_id || 0);

    if (id > 0) return id;

    const [rows] = await db.query(
        "SELECT company_id FROM users WHERE id = ? LIMIT 1",
        [Number(user.user_id || 0)]
    );

    id = Number(rows[0]?.company_id || 0);

    if (id <= 0) throw new CsvError("Company information missing.");

    user.company_id = id;

    return id;
}


/*
|--------------------------------------------------------------------------
| TEMPLATE
|--------------------------------------------------------------------------
*/

function templateCsv() {

    const today = new Date();
    const pad = n => String(n).padStart(2, "0");

    return "﻿" +
        csvLine(EXPORT_HEADERS) +
        csvLine([
            "1001", "Customer Name", "customer@01", "Customer Address",
            `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
            "", "PPPoE 10 Mbps", "password", "01700000000", "active", "unpaid",
            "", "", "", "0", "2026-09-02", "pppoe", "500", ""
        ]);
}


/*
|--------------------------------------------------------------------------
| EXPORT  (rows are written to `write(chunk)` in batches)
|--------------------------------------------------------------------------
| PHP exported every customer of the company; the list page also sends
| search/status, which are honoured here so "export" matches what is shown.
|--------------------------------------------------------------------------
*/

async function exportCsv({ user, search = "", status = "" }, write) {

    const companyId = await companyIdOf(user);

    const where = ["c.company_id = ?", "c.deleted_at IS NULL"];
    const params = [companyId];

    search = String(search || "").trim();
    status = String(status || "").trim();

    if (search) {
        where.push(
            `(c.name LIKE ? OR c.phone LIKE ? OR c.customer_id LIKE ?
              OR c.pppoe_username LIKE ?)`
        );
        const like = `%${search}%`;
        params.push(like, like, like, like);
    }

    if (status && status.toLowerCase() !== "all") {
        where.push("LOWER(c.status) = ?");
        params.push(status.toLowerCase());
    }

    write("﻿" + csvLine(EXPORT_HEADERS));

    const batch = 2000;

    for (let offset = 0; ; offset += batch) {

        const [rows] = await db.query(
            `SELECT c.customer_id, c.name, c.pppoe_username, c.address,
                    c.connection_date, c.mikrotik_id, c.package_name,
                    c.pppoe_password, c.phone, c.status, c.payment_status,
                    sa.name AS sub_area_name, a.name AS area_name, c.email,
                    c.balance, c.billing_cycle, c.connection_type,
                    c.monthly_bill, c.comments
             FROM customers c
             LEFT JOIN areas a ON a.id = c.area_id AND a.company_id = c.company_id
             LEFT JOIN sub_areas sa ON sa.id = c.sub_area_id AND sa.company_id = c.company_id
             WHERE ${where.join(" AND ")}
             ORDER BY c.id ASC
             LIMIT ? OFFSET ?`,
            [...params, batch, offset]
        );

        if (!rows.length) break;

        const fmt = v => v instanceof Date ? v.toISOString().slice(0, 10) : v;

        write(rows.map(r => csvLine([
            r.customer_id ?? "",
            r.name ?? "",
            r.pppoe_username ?? "",
            r.address ?? "",
            fmt(r.connection_date) ?? "",
            r.mikrotik_id ?? "",
            r.package_name ?? "",
            r.pppoe_password ?? "",
            r.phone ?? "",
            String(r.status ?? "Active").toLowerCase(),
            r.payment_status ?? "unpaid",
            r.sub_area_name ?? "",
            r.area_name ?? "",
            r.email ?? "",
            r.balance ?? "0",
            fmt(r.billing_cycle) ?? "",
            r.connection_type ?? "",
            r.monthly_bill ?? "0",
            r.comments ?? ""
        ])).join(""));

        if (rows.length < batch) break;
    }
}


/*
|--------------------------------------------------------------------------
| IMPORT
|--------------------------------------------------------------------------
*/

async function importCsv({ user, file }) {

    if (!file) throw new CsvError("CSV file was not uploaded.");

    if (!/\.csv$/i.test(String(file.filename || ""))) {
        throw new CsvError("Only CSV files are allowed.");
    }

    if (!file.size) throw new CsvError("CSV file is empty.");

    const companyId = await companyIdOf(user);
    const userId = Number(user.user_id || 0);

    const text = file.buffer.toString("utf8").replace(/^﻿/, "");

    const firstLine = text.split(/\r\n|\n|\r/, 1)[0];

    const rows = parseCsv(text, detectDelimiter(firstLine));

    if (!rows.length || !rows[0].length) {
        throw new CsvError("CSV file is empty or header row is missing.");
    }

    const headers = rows[0].map(normalizeHeader);

    const columnMap = {};

    for (const [field, names] of Object.entries(ALIASES)) {
        const idx = headers.findIndex(h => names.includes(h));
        if (idx !== -1) columnMap[field] = idx;
    }

    if (columnMap.customer_id === undefined) {
        throw new CsvError(
            `Required CSV column missing: customer_id. Detected headers: ${headers.join(", ")}`
        );
    }

    const [colRows] = await db.query("SHOW COLUMNS FROM customers");
    const actual = new Set(colRows.map(c => c.Field));

    for (const required of ["company_id", "created_by", "customer_id", "name"]) {
        if (!actual.has(required)) {
            throw new CsvError(`Required customers table column missing: ${required}`);
        }
    }

    const get = (row, field) =>
        columnMap[field] === undefined ? "" : String(row[columnMap[field]] ?? "").trim();

    const report = { total: 0, inserted: 0, skipped: 0, errors: 0, messages: [] };

    const seenPppoe = new Set();

    const lookup = async (table, value) => {
        if (!value) return null;
        const [r] = await db.query(
            `SELECT id FROM \`${table}\`
             WHERE company_id = ?
               AND (CAST(id AS CHAR) = ? OR LOWER(TRIM(name)) = LOWER(TRIM(?)))
             LIMIT 1`,
            [companyId, value, value]
        );
        return r[0] ? Number(r[0].id) : null;
    };

    const conn = await db.getConnection();

    try {

        await conn.beginTransaction();

        for (let i = 1; i < rows.length; i++) {

            const row = rows[i];

            report.total++;

            const line = report.total + 1;

            if (!row.some(c => String(c ?? "").trim() !== "")) {
                report.skipped++;
                continue;
            }

            const customerId = get(row, "customer_id");
            let name = get(row, "name");
            let pppoe = get(row, "pppoe_username");
            const clientMikrotik = get(row, "client_mikrotik");

            /* PPPoE_Name empty -> client_mikrotik fallback (same as PHP) */
            if (pppoe === "" && clientMikrotik !== "") pppoe = clientMikrotik;

            if (customerId === "") {
                report.errors++;
                report.messages.push(`Line ${line}: customer_id is required.`);
                continue;
            }

            if (name === "") name = customerId;

            const normPppoe = normalizeText(pppoe);

            if (normPppoe && seenPppoe.has(normPppoe)) {
                report.skipped++;
                report.messages.push(`Line ${line}: duplicate inside CSV (PPPoE username) - ${customerId}.`);
                continue;
            }

            if (normPppoe) {
                const [dupe] = await conn.query(
                    `SELECT id FROM customers
                     WHERE company_id = ? AND pppoe_username <> ''
                       AND LOWER(TRIM(pppoe_username)) = LOWER(TRIM(?))
                     LIMIT 1`,
                    [companyId, pppoe]
                );

                if (dupe.length) {
                    report.skipped++;
                    report.messages.push(`Line ${line}: duplicate customer found (PPPoE username) - ${customerId}.`);
                    continue;
                }
            }

            const values = {
                company_id: companyId,
                created_by: userId,
                customer_id: customerId,
                name,
                phone: get(row, "phone"),
                address: get(row, "address"),
                package_name: get(row, "package"),
                monthly_bill: cleanNumber(get(row, "monthly_bill")),
                status: mapStatus(get(row, "status")),
                sync_status: 1,
                balance: cleanNumber(get(row, "balance")),
                pppoe_username: pppoe,
                pppoe_password: get(row, "pppoe_password"),
                area_id: await lookup("areas", get(row, "area")),
                sub_area_id: await lookup("sub_areas", get(row, "sub_area")),
                email: get(row, "email"),
                billing_cycle: get(row, "billing_cycle") || "Monthly",
                payment_status: mapPaymentStatus(get(row, "payment_status")),
                connection_date: parseDateOnly(get(row, "connection_date")),
                connection_fee: 0,
                billing_type: get(row, "user_type") ? get(row, "user_type").toUpperCase() : "POSTPAID",
                auto_connection: 0,
                continue_next_month: 0,
                comments: get(row, "comments"),
                connection_type: "PPPOE"
            };

            const cols = Object.keys(values).filter(c => actual.has(c));

            const sql =
                `INSERT INTO customers (${cols.map(c => `\`${c}\``).join(", ")}` +
                `${actual.has("created_at") ? ", created_at" : ""}) ` +
                `VALUES (${cols.map(() => "?").join(", ")}${actual.has("created_at") ? ", NOW()" : ""})`;

            try {
                await conn.query(sql, cols.map(c => values[c]));
            } catch (e) {
                report.errors++;
                report.messages.push(`Line ${line}: failed - ${e.message}`);
                continue;
            }

            if (normPppoe) seenPppoe.add(normPppoe);

            report.inserted++;
            report.messages.push(`Line ${line}: ${customerId} imported successfully.`);
        }

        await conn.commit();

    } catch (error) {

        try { await conn.rollback(); } catch (_) {}

        report.errors++;
        report.messages.push(`Import failed: ${error.message}`);

    } finally {
        conn.release();
    }

    try {
        await db.query(
            `INSERT INTO activity_logs
                (user_id, company_id, action, description, module, created_at)
             VALUES (?, ?, 'customer_csv_import', ?, 'customers', NOW())`,
            [userId, companyId,
             `CSV import: ${report.inserted} imported, ${report.skipped} skipped, ${report.errors} error(s)`]
        );
    } catch (_) {}

    report.summary =
        `CSV import completed. ${report.inserted} customer(s) imported, ` +
        `${report.skipped} skipped, ${report.errors} error(s).`;

    return report;
}


module.exports = {
    CsvError,
    EXPORT_HEADERS,
    parseCsv,
    detectDelimiter,
    csvLine,
    csvCell,
    normalizeHeader,
    cleanNumber,
    mapStatus,
    mapPaymentStatus,
    parseDateOnly,
    templateCsv,
    exportCsv,
    importCsv
};
