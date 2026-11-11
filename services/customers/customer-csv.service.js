
"use strict";

/*
|--------------------------------------------------------------------------
| CUSTOMER CSV SERVICE
|--------------------------------------------------------------------------
| Port of:
| customers/csv/export.php
| customers/csv/import.php
| customers/csv/template.php
|
| Import is DATABASE ONLY.
| It does NOT touch MikroTik.
|--------------------------------------------------------------------------
*/

const db = require("../../config/database");

class CsvError extends Error {
    constructor(message, httpCode = 400) {
        super(message);
        this.name = "CsvError";
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
| CSV PARSER
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
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === delimiter) {
            row.push(field);
            field = "";
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && text[i + 1] === "\n") {
                i++;
            }

            row.push(field);
            field = "";

            if (row.length > 1 || row[0] !== "") {
                rows.push(row);
            }

            row = [];
        } else {
            field += ch;
        }
    }

    if (field !== "" || row.length) {
        row.push(field);

        if (row.length > 1 || row[0] !== "") {
            rows.push(row);
        }
    }

    return rows;
}

function detectDelimiter(firstLine) {
    let best = ",";
    let bestCount = 1;

    for (const candidate of [",", ";", "\t", "|"]) {
        const count = (
            parseCsv(firstLine, candidate)[0] || []
        ).length;

        if (count > bestCount) {
            bestCount = count;
            best = candidate;
        }
    }

    return best;
}

function csvCell(value) {
    const s =
        value === null || value === undefined
            ? ""
            : String(value);

    return /[",\r\n]/.test(s)
        ? `"${s.replace(/"/g, '""')}"`
        : s;
}

function csvLine(values) {
    return values.map(csvCell).join(",") + "\r\n";
}

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function removeBom(value) {
    return String(value ?? "")
        .replace(/^\uFEFF/, "")
        .replace(/^\uFFFD/, "");
}

function normalizeHeader(value) {
    return removeBom(value)
        .replace(/^[\s"'`]+|[\s"'`]+$/g, "")
        .toLowerCase()
        .replace(/[_\\.\-]+/g, " ")
        .replace(/[()]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeText(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function cleanNumber(value) {
    const v = String(value ?? "")
        .replace(/,/g, "")
        .replace(/(?:\u09F3|\u00C3\u00A0\u00C2\u00A7\u00C2\u00B3|\u00E0\u00A7\u00B3)/g, "")
        .replace(/BDT/gi, "")
        .replace(/\s/g, "");

    if (v === "" || !Number.isFinite(Number(v))) {
        return 0;
    }

    return Number(v);
}

function parseDateOnly(raw) {
    raw = String(raw || "").trim();

    if (!raw) {
        return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return raw;
    }

    const d = new Date(raw);

    if (Number.isNaN(d.getTime())) {
        return null;
    }

    const pad = n => String(n).padStart(2, "0");

    return (
        `${d.getFullYear()}-` +
        `${pad(d.getMonth() + 1)}-` +
        `${pad(d.getDate())}`
    );
}

/*
|--------------------------------------------------------------------------
| CSV FIELD ALIASES
|--------------------------------------------------------------------------
*/

const ALIASES = {
    customer_id: [
        "customer id",
        "customerid",
        "id",
        "client id",
        "clientid"
    ],

    name: [
        "name",
        "name of client",
        "client name",
        "clientname"
    ],

    pppoe_username: [
        "pppoe name",
        "pppoe username",
        "pppoe user",
        "username",
        "user"
    ],

    client_mikrotik: [
        "client mikrotik",
        "clientmikrotik",
        "mikrotik",
        "mikrotik id",
        "mikrotikid"
    ],

    pppoe_password: [
        "password",
        "pppoe password",
        "pass"
    ],

    address: [
        "address",
        "address of client",
        "client address",
        "clientaddress"
    ],

    connection_date: [
        "activation date",
        "connection date",
        "activation",
        "connectiondate"
    ],

    package: [
        "package",
        "package name",
        "bandwidth allocation mb",
        "bandwidth allocation",
        "bandwidth"
    ],

    phone: [
        "phone",
        "mobile",
        "client phone",
        "client mobile",
        "mobile number",
        "phone number"
    ],

    status: [
        "status",
        "connection status"
    ],

    payment_status: [
        "payment status",
        "paymentstatus",
        "payment"
    ],

    sub_area: [
        "subarea",
        "sub area",
        "sub area id"
    ],

    area: [
        "area",
        "area id"
    ],

    email: [
        "email",
        "email address"
    ],

    balance: [
        "balance",
        "due",
        "customer balance"
    ],

    monthly_bill: [
        "selling bandwidthbdt excluding vat",
        "selling bandwidthbdt",
        "selling bandwidth bdt excluding vat",
        "selling bandwidth bdt",
        "selling bandwidth",
        "monthly bill",
        "monthly bill bdt",
        "price",
        "bill"
    ],

    billing_cycle: [
        "billing cycle",
        "billingcycle",
        "cycle"
    ],

    user_type: [
        "user type",
        "usertype",
        "type"
    ],

    comments: [
        "comment",
        "comments",
        "remarks",
        "remark"
    ]
};

/*
|--------------------------------------------------------------------------
| STATUS
|--------------------------------------------------------------------------
*/

function mapStatus(raw) {
    const value = String(raw || "").trim();

    if (!value) {
        return "Active";
    }

    const v = value.toLowerCase();

    if (
        [
            "active",
            "enable",
            "enabled",
            "online",
            "1"
        ].includes(v)
    ) {
        return "Active";
    }

    if (
        [
            "inactive",
            "disable",
            "disabled",
            "offline",
            "0"
        ].includes(v)
    ) {
        return "Inactive";
    }

    if (v === "expired") {
        return "Expired";
    }

    return value;
}

function mapPaymentStatus(raw) {
    const v = String(raw || "")
        .trim()
        .toLowerCase();

    if (
        [
            "paid",
            "complete",
            "completed",
            "yes",
            "1"
        ].includes(v)
    ) {
        return "paid";
    }

    if (
        [
            "partial",
            "partially paid",
            "partial paid"
        ].includes(v)
    ) {
        return "partial";
    }

    return "unpaid";
}

/*
|--------------------------------------------------------------------------
| COMPANY
|--------------------------------------------------------------------------
*/

async function companyIdOf(user) {
    let id = Number(user.company_id || 0);

    if (id > 0) {
        return id;
    }

    const [rows] = await db.query(
        `
            SELECT company_id
            FROM users
            WHERE id = ?
            LIMIT 1
        `,
        [Number(user.user_id || 0)]
    );

    id = Number(rows[0]?.company_id || 0);

    if (id <= 0) {
        throw new CsvError("Company information missing.");
    }

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

    const todayString =
        `${today.getFullYear()}-` +
        `${pad(today.getMonth() + 1)}-` +
        `${pad(today.getDate())}`;

    return (
        "\uFEFF" +
        csvLine(EXPORT_HEADERS) +
        csvLine([
            "1001",
            "Customer Name",
            "customer@01",
            "Customer Address",
            todayString,
            "",
            "PPPoE 10 Mbps",
            "password",
            "01700000000",
            "active",
            "unpaid",
            "",
            "",
            "",
            "0",
            "",
            "pppoe",
            "500",
            ""
        ])
    );
}

/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

async function exportCsv(
    {
        user,
        search = "",
        status = ""
    },
    write
) {
    const companyId = await companyIdOf(user);

    const where = [
        "c.company_id = ?",
        "c.deleted_at IS NULL"
    ];

    const params = [companyId];

    search = String(search || "").trim();
    status = String(status || "").trim();

    if (search) {
        where.push(`
            (
                c.name LIKE ?
                OR c.phone LIKE ?
                OR c.customer_id LIKE ?
                OR c.pppoe_username LIKE ?
            )
        `);

        const like = `%${search}%`;

        params.push(like, like, like, like);
    }

    if (status && status.toLowerCase() !== "all") {
        where.push("LOWER(c.status) = ?");
        params.push(status.toLowerCase());
    }

    write("\uFEFF" + csvLine(EXPORT_HEADERS));

    const batch = 2000;

    for (let offset = 0; ; offset += batch) {
        const [rows] = await db.query(
            `
                SELECT
                    c.customer_id,
                    c.name,
                    c.pppoe_username,
                    c.address,
                    c.connection_date,
                    c.mikrotik_id,
                    c.package_name,
                    c.pppoe_password,
                    c.phone,
                    c.status,
                    c.payment_status,
                    sa.name AS sub_area_name,
                    a.name AS area_name,
                    c.email,
                    c.balance,
                    c.billing_cycle,
                    c.connection_type,
                    c.monthly_bill,
                    c.comments

                FROM customers c

                LEFT JOIN areas a
                    ON a.id = c.area_id
                    AND a.company_id = c.company_id

                LEFT JOIN sub_areas sa
                    ON sa.id = c.sub_area_id
                    AND sa.company_id = c.company_id

                WHERE ${where.join(" AND ")}

                ORDER BY c.id ASC

                LIMIT ?
                OFFSET ?
            `,
            [...params, batch, offset]
        );

        if (!rows.length) {
            break;
        }

        const fmt = value =>
            value instanceof Date
                ? value.toISOString().slice(0, 10)
                : value;

        write(
            rows
                .map(r =>
                    csvLine([
                        r.customer_id ?? "",
                        r.name ?? "",
                        r.pppoe_username ?? "",
                        r.address ?? "",
                        fmt(r.connection_date) ?? "",
                        r.mikrotik_id ?? "",
                        r.package_name ?? "",
                        r.pppoe_password ?? "",
                        r.phone ?? "",
                        (r.status == null ? "" : String(r.status).toLowerCase()),
                        r.payment_status ?? "",
                        r.sub_area_name ?? "",
                        r.area_name ?? "",
                        r.email ?? "",
                        r.balance ?? "",
                        fmt(r.billing_cycle) ?? "",
                        r.connection_type ?? "",
                        r.monthly_bill ?? "",
                        r.comments ?? ""
                    ])
                )
                .join("")
        );

        if (rows.length < batch) {
            break;
        }
    }
}

/*
|--------------------------------------------------------------------------
| IMPORT
|--------------------------------------------------------------------------
*/

async function importCsv({ user, file }) {
    if (!file) {
        throw new CsvError("CSV file was not uploaded.");
    }

    const filename = String(
        file.filename || file.name || ""
    ).trim();

    if (!/\.csv$/i.test(filename)) {
        throw new CsvError("Only CSV files are allowed.");
    }

    if (!file.size && !file.buffer?.length) {
        throw new CsvError("CSV file is empty.");
    }

    if (!file.buffer || !Buffer.isBuffer(file.buffer)) {
        throw new CsvError("Uploaded CSV data could not be read.");
    }

    const companyId = await companyIdOf(user);
    const userId = Number(user.user_id || 0);

    /*
    |--------------------------------------------------------------------------
    | UTF-8 BOM SAFE
    |--------------------------------------------------------------------------
    */

    let text = file.buffer.toString("utf8");

    text = text.replace(/^\uFEFF/, "");
    text = text.replace(/^\uFFFD/, "");

    if (!text.trim()) {
        throw new CsvError("CSV file is empty.");
    }

    const firstLine =
        text.split(/\r\n|\n|\r/, 1)[0] || "";

    const delimiter = detectDelimiter(firstLine);
    const rows = parseCsv(text, delimiter);

    if (!rows.length || !rows[0]?.length) {
        throw new CsvError(
            "CSV file is empty or header row is missing."
        );
    }

    /*
    |--------------------------------------------------------------------------
    | HEADER
    |--------------------------------------------------------------------------
    */

    const headers = rows[0].map(normalizeHeader);
    const columnMap = {};

    for (const [field, names] of Object.entries(ALIASES)) {
        const index = headers.findIndex(
            header => names.includes(header)
        );

        if (index !== -1) {
            columnMap[field] = index;
        }
    }

    if (columnMap.customer_id === undefined) {
        throw new CsvError(
            "Required CSV column missing: customer_id. " +
            `Detected headers: ${headers.join(", ")}`
        );
    }

    /*
    |--------------------------------------------------------------------------
    | TABLE CHECK
    |--------------------------------------------------------------------------
    */

    const [colRows] = await db.query(
        "SHOW COLUMNS FROM customers"
    );

    const actual = new Set(
        colRows.map(column => column.Field)
    );

    for (const required of [
        "company_id",
        "created_by",
        "customer_id",
        "name"
    ]) {
        if (!actual.has(required)) {
            throw new CsvError(
                `Required customers table column missing: ${required}`
            );
        }
    }

    const get = (row, field) => {
        if (columnMap[field] === undefined) {
            return "";
        }

        return String(
            row[columnMap[field]] ?? ""
        ).trim();
    };

    const report = {
        total: 0,
        inserted: 0,
        skipped: 0,
        errors: 0,
        messages: []
    };

    const seenCustomerIds = new Set();
    const seenPppoe = new Set();

    /*
    |--------------------------------------------------------------------------
    | AREA / SUB AREA LOOKUP
    |--------------------------------------------------------------------------
    */

    const columnCache = {};

    const hasColumn = async (table, column) => {
        const key = `${table}.${column}`;

        if (!(key in columnCache)) {
            try {
                const [found] = await db.query(
                    `SHOW COLUMNS FROM \`${table}\` LIKE ?`,
                    [column]
                );

                columnCache[key] = found.length > 0;
            } catch (_) {
                columnCache[key] = false;
            }
        }

        return columnCache[key];
    };

    const lookupCache = new Map();

    /*
     * Same name (case / extra spaces ignored) -> same existing record.
     * A sub-area is searched only inside the customer's own area.
     */

    const lookup = async (
        table,
        value,
        parentAreaId = 0
    ) => {
        const clean = String(value ?? "")
            .replace(/\s+/g, " ")
            .trim();

        if (!clean) {
            return null;
        }

        if (!["areas", "sub_areas"].includes(table)) {
            return null;
        }

        const useParent =
            table === "sub_areas" &&
            parentAreaId > 0 &&
            await hasColumn("sub_areas", "area_id");

        const key =
            `${table}|${useParent ? parentAreaId : 0}|${clean.toLowerCase()}`;

        if (lookupCache.has(key)) {
            return lookupCache.get(key);
        }

        const params = [companyId];

        if (useParent) {
            params.push(parentAreaId);
        }

        params.push(clean, clean);

        const [result] = await db.query(
            `
                SELECT id
                FROM \`${table}\`
                WHERE company_id = ?
                ${useParent ? "AND area_id = ?" : ""}
                AND (
                    CAST(id AS CHAR) = ?
                    OR LOWER(TRIM(name)) = LOWER(TRIM(?))
                )
                ORDER BY id ASC
                LIMIT 1
            `,
            params
        );

        const found = result[0]
            ? Number(result[0].id)
            : null;

        lookupCache.set(key, found);

        return found;
    };

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        /*
        |--------------------------------------------------------------------------
        | COMPANY MIKROTIK SERVERS
        |--------------------------------------------------------------------------
        | customers.mikrotik_id stores mikrotik_servers.id.
        | Never use another company's server.
        |--------------------------------------------------------------------------
        */

        const [mikrotikServers] = await conn.query(
            `
                SELECT id, name, ip
                FROM mikrotik_servers
                WHERE company_id = ?
                  AND deleted_at IS NULL
                ORDER BY id ASC
            `,
            [companyId]
        );

        const mikrotikServerIds = new Set(
            mikrotikServers.map(server => Number(server.id))
        );

        /*
        |--------------------------------------------------------------------------
        | IMPORT ROWS
        |--------------------------------------------------------------------------
        */

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];

            report.total++;

            const line = i + 1;

            /*
            |--------------------------------------------------------------------------
            | EMPTY ROW
            |--------------------------------------------------------------------------
            */

            if (
                !row.some(
                    cell => String(cell ?? "").trim() !== ""
                )
            ) {
                report.skipped++;
                continue;
            }

            /*
            |--------------------------------------------------------------------------
            | BASIC VALUES
            |--------------------------------------------------------------------------
            */

            const customerId = get(row, "customer_id");

            let name = get(row, "name");
            const pppoe = get(row, "pppoe_username");

            const clientMikrotik = get(
                row,
                "client_mikrotik"
            );

            if (!customerId) {
                report.errors++;

                report.messages.push(
                    `Line ${line}: customer_id is required.`
                );

                continue;
            }

            if (!name) {
                name = customerId;
            }

            /*
            |--------------------------------------------------------------------------
            | DUPLICATE CUSTOMER ID
            |--------------------------------------------------------------------------
            */

            const normalizedCustomerId =
                normalizeText(customerId);

            if (seenCustomerIds.has(normalizedCustomerId)) {
                report.skipped++;

                report.messages.push(
                    `Line ${line}: duplicate customer_id inside CSV - ${customerId}.`
                );

                continue;
            }

            const [existingCustomer] = await conn.query(
                `
                    SELECT id
                    FROM customers
                    WHERE company_id = ?
                      AND customer_id = ?
                    LIMIT 1
                `,
                [companyId, customerId]
            );

            if (existingCustomer.length) {
                report.skipped++;

                report.messages.push(
                    `Line ${line}: customer_id already exists - ${customerId}.`
                );

                continue;
            }

            /*
            |--------------------------------------------------------------------------
            | DUPLICATE PPPOE
            |--------------------------------------------------------------------------
            */

            const normPppoe = normalizeText(pppoe);

            if (
                normPppoe &&
                seenPppoe.has(normPppoe)
            ) {
                report.skipped++;

                report.messages.push(
                    `Line ${line}: duplicate PPPoE username inside CSV - ${customerId}.`
                );

                continue;
            }

            if (normPppoe) {
                const [dupe] = await conn.query(
                    `
                        SELECT id
                        FROM customers
                        WHERE company_id = ?
                          AND pppoe_username <> ''
                          AND LOWER(TRIM(pppoe_username)) =
                              LOWER(TRIM(?))
                        LIMIT 1
                    `,
                    [companyId, pppoe]
                );

                if (dupe.length) {
                    report.skipped++;

                    report.messages.push(
                        `Line ${line}: duplicate PPPoE username found - ${customerId}.`
                    );

                    continue;
                }
            }

            /*
            |--------------------------------------------------------------------------
            | RESOLVE AREA / SUB AREA
            |--------------------------------------------------------------------------
            */

            const areaText = get(row, "area");
            const subAreaText = get(row, "sub_area");

            const areaId = await lookup(
                "areas",
                areaText
            );

            const subAreaId = await lookup(
                "sub_areas",
                subAreaText,
                areaId || 0
            );

            if (areaText && !areaId) {
                report.messages.push(
                    `Line ${line}: area "${areaText}" not found - customer will be skipped.`
                );
            }

            if (subAreaText && !subAreaId) {
                report.messages.push(
                    `Line ${line}: sub-area "${subAreaText}" not found - customer will be skipped.`
                );
            }

            /*
            |--------------------------------------------------------------------------
            | RESOLVE MIKROTIK SERVER
            |--------------------------------------------------------------------------
            | Priority:
            | 1. Valid CSV client_mikrotik ID.
            | 2. Area mikrotik_id.
            | 3. Company's only active MikroTik server.
            |--------------------------------------------------------------------------
            */

            let mikrotikId = null;

            // 1. Resolve CSV MikroTik by ID or server name.
            if (clientMikrotik) {
                const csvMikrotikText = String(clientMikrotik).trim();
                const csvMikrotikId = Number(csvMikrotikText);

                if (
                    Number.isInteger(csvMikrotikId) &&
                    csvMikrotikId > 0 &&
                    mikrotikServerIds.has(csvMikrotikId)
                ) {
                    mikrotikId = csvMikrotikId;
                } else {
                    const matchingServers = mikrotikServers.filter(
                        server =>
                            normalizeText(server.name) ===
                            normalizeText(csvMikrotikText)
                    );

                    if (matchingServers.length === 1) {
                        mikrotikId = Number(matchingServers[0].id);
                    } else {
                        report.messages.push(
                            matchingServers.length > 1
                                ? `Line ${line}: MikroTik name "${csvMikrotikText}" is ambiguous for this company.`
                                : `Line ${line}: MikroTik "${csvMikrotikText}" not found for this company.`
                        );
                    }
                }
            }

            // 2. Area MikroTik mapping
            if (!mikrotikId && areaId) {
                const [areaRows] = await conn.query(
                    `
                        SELECT mikrotik_id
                        FROM areas
                        WHERE id = ?
                          AND company_id = ?
                        LIMIT 1
                    `,
                    [areaId, companyId]
                );

                const areaMikrotikId = Number(
                    areaRows[0]?.mikrotik_id || 0
                );

                if (
                    areaMikrotikId > 0 &&
                    mikrotikServerIds.has(areaMikrotikId)
                ) {
                    mikrotikId = areaMikrotikId;
                }
            }

            // 3. Automatic selection only when exactly one server exists.
            if (
                !mikrotikId &&
                mikrotikServers.length === 1
            ) {
                mikrotikId = Number(
                    mikrotikServers[0].id
                );
            }


            /*
            |--------------------------------------------------------------------------
            | REQUIRED CUSTOMER MAPPING VALIDATION
            |--------------------------------------------------------------------------
            */

            if (!mikrotikId) {
                report.errors++;
                report.messages.push(
                    `Line ${line}: MikroTik server is required. Customer skipped.`
                );
                continue;
            }

            const [validAreaRows] = await conn.query(
                `
                    SELECT id
                    FROM areas
                    WHERE id = ?
                      AND company_id = ?
                      AND (mikrotik_id = ? OR mikrotik_id IS NULL)
                    LIMIT 1
                `,
                [areaId, companyId, mikrotikId]
            );

            if ((areaText && !areaId) || (areaId && !validAreaRows.length)) {
                report.errors++;
                report.messages.push(
                    `Line ${line}: valid Area is required. Customer skipped.`
                );
                continue;
            }

            const [validSubAreaRows] = await conn.query(
                `
                    SELECT id
                    FROM sub_areas
                    WHERE id = ?
                      AND area_id = ?
                      AND company_id = ?
                    LIMIT 1
                `,
                [subAreaId, areaId, companyId]
            );

            if ((subAreaText && !subAreaId) || (subAreaId && !validSubAreaRows.length)) {
                report.errors++;
                report.messages.push(
                    `Line ${line}: valid Sub-area is required. Customer skipped.`
                );
                continue;
            }

            const packageText = get(row, "package");

            if (!packageText) {
                report.errors++;
                report.messages.push(
                    `Line ${line}: Package is required. Customer skipped.`
                );
                continue;
            }

            const [packageRows] = await conn.query(
                `
                    SELECT id, package_name, price
                    FROM mikrotik_packages
                    WHERE company_id = ?
                      AND router_id = ?
                      AND LOWER(TRIM(package_name)) = LOWER(TRIM(?))
                    LIMIT 1
                `,
                [companyId, mikrotikId, packageText]
            );

            if (!packageRows.length) {
                report.errors++;
                report.messages.push(
                    `Line ${line}: Package "${packageText}" not found for this MikroTik. Customer skipped.`
                );
                continue;
            }

            const selectedPackage = packageRows[0];
            const packageId = Number(selectedPackage.id);
            const monthlyBill = Number(selectedPackage.price || 0);

            const requiredMappingColumns = [
                "mikrotik_id",
                "package_id",
                "area_id",
                "sub_area_id"
            ];

            const missingMappingColumns = requiredMappingColumns.filter(
                column => !actual.has(column)
            );

            if (missingMappingColumns.length) {
                report.errors++;
                report.messages.push(
                    `Line ${line}: Required database columns missing: ${missingMappingColumns.join(", ")}.`
                );
                continue;
            }
            /*
            | BUILD CUSTOMER
            |--------------------------------------------------------------------------
            */

            const values = {
                company_id:
                    companyId,

                created_by:
                    userId,

                customer_id:
                    customerId,

                name,

                mikrotik_id:
                    mikrotikId,

                
                package_id:
                    packageId,

                phone:
                    get(row, "phone"),

                address:
                    get(row, "address"),

                package_name:
                    selectedPackage.package_name,

                monthly_bill:
                    monthlyBill,

                status:
                    mapStatus(
                        get(row, "status")
                    ),

                sync_status:
                    1,

                balance:
                    cleanNumber(
                        get(row, "balance")
                    ),

                pppoe_username:
                    pppoe,

                pppoe_password:
                    get(row, "pppoe_password"),

                area_id:
                    areaId,

                sub_area_id:
                    subAreaId,

                email:
                    get(row, "email"),

                billing_cycle:
                    get(row, "billing_cycle") || "Monthly",

                payment_status:
                    mapPaymentStatus(
                        get(row, "payment_status")
                    ),

                connection_date:
                    parseDateOnly(
                        get(row, "connection_date")
                    ),

                connection_fee:
                    0,

                billing_type:
                    String(get(row, "user_type") || "Prepaid").trim().toLowerCase() === "postpaid"
                        ? "Postpaid"
                        : "Prepaid",

                auto_connection:
                    0,

                continue_next_month:
                    0,

                comments:
                    get(row, "comments"),

                connection_type:
                    "PPPOE"
            };

            /*
            |--------------------------------------------------------------------------
            | ONLY INSERT EXISTING DB COLUMNS
            |--------------------------------------------------------------------------
            */

            const cols = Object.keys(values).filter(
                column => actual.has(column)
            );

            if (!cols.length) {
                report.errors++;

                report.messages.push(
                    `Line ${line}: no valid customer columns available.`
                );

                continue;
            }

            const placeholders = cols
                .map(() => "?")
                .join(", ");

            const sql = `
                INSERT INTO customers
                (
                    ${cols
                        .map(column => `\`${column}\``)
                        .join(", ")}
                    ${
                        actual.has("created_at")
                            ? ", created_at"
                            : ""
                    }
                )
                VALUES
                (
                    ${placeholders}
                    ${
                        actual.has("created_at")
                            ? ", NOW()"
                            : ""
                    }
                )
            `;

            try {
                await conn.query(
                    sql,
                    cols.map(column => values[column])
                );
            } catch (error) {
                report.errors++;

                report.messages.push(
                    `Line ${line}: failed - ${error.message}`
                );

                continue;
            }

            seenCustomerIds.add(normalizedCustomerId);

            if (normPppoe) {
                seenPppoe.add(normPppoe);
            }

            report.inserted++;

            report.messages.push(
                `Line ${line}: ${customerId} imported successfully.`
            );
        }

        await conn.commit();

    } catch (error) {
        try {
            await conn.rollback();
        } catch (_) {}

        report.errors++;

        report.messages.push(
            `Import failed: ${error.message}`
        );

    } finally {
        conn.release();
    }

    /*
    |--------------------------------------------------------------------------
    | ACTIVITY LOG
    |--------------------------------------------------------------------------
    */

    try {
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
                    'customer_csv_import',
                    ?,
                    'customers',
                    NOW()
                )
            `,
            [
                userId,
                companyId,
                `CSV import: ${report.inserted} imported, ` +
                `${report.skipped} skipped, ` +
                `${report.errors} error(s)`
            ]
        );

    } catch (_) {
        // Activity log failure must not break CSV import.
    }

    report.summary =
        `CSV import completed. ` +
        `${report.inserted} customer(s) imported, ` +
        `${report.skipped} skipped, ` +
        `${report.errors} error(s).`;

    return report;
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

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







