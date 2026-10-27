
"use strict";

const mysql = require("mysql2/promise");
const net = require("net");
const crypto = require("crypto");
const {
    syncOnus,
    driverFor,
    disconnectDriver
} = require("../drivers/olt-sync.service");
const { autoMapOnus } = require("../drivers/onu-auto-mapping.service");
const {
    collectPppSessions,
    loadMikrotikService
} = require("../drivers/ppp-sessions");

/*
|--------------------------------------------------------------------------
| OLT CONTROLLER
|--------------------------------------------------------------------------
| Tenant-scoped OLT access
| Super admin can access all OLTs
| OLT CRUD, TCP check, ONU sync and customer mapping
|--------------------------------------------------------------------------
*/

let pool;

function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.DB_HOST || "localhost",
            port: Number(process.env.DB_PORT || 3306),
            user: process.env.DB_USER || "root",
            password: process.env.DB_PASSWORD || "",
            database: process.env.DB_NAME || "ispbilling",
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
    }

    return pool;
}

class OltError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

function userId(req) {
    return Number(req.session?.user_id || req.session?.id || 0);
}

function companyId(req) {
    return Number(
        req.session?.company_id ??
        req.session?.companyId ??
        0
    );
}

function isSuperAdmin(req) {
    const role = String(
        req.session?.role ||
        req.session?.user_role ||
        ""
    )
        .toLowerCase()
        .replace(/[_\s-]/g, "");

    return role === "superadmin";
}

function scopeSql(req, alias = "ol") {
    if (isSuperAdmin(req)) {
        return { sql: "", params: [] };
    }

    const company = companyId(req);

    if (!company) {
        return { sql: " AND 1=0", params: [] };
    }

    return {
        sql: ` AND ${alias}.company_id = ?`,
        params: [company]
    };
}

function validId(value) {
    const id = Number(value);

    if (!Number.isSafeInteger(id) || id < 1) {
        throw new OltError("Invalid ID.");
    }

    return id;
}

function clean(value, max = 255) {
    return String(value ?? "").trim().slice(0, max);
}

function normalizeVendor(value) {
    const raw = clean(value, 50);
    const key = raw.toLowerCase().replace(/[^a-z0-9]/g, "");

    const aliases = {
        ecom: "ecom",
        ecomolt: "ecom",
        ecomepon: "ecom",
        ecomeponolt: "ecom",
        cdata: "cdata",
        cdataepon: "cdata",
        cdataolt: "cdata",
        cdataeponolt: "cdata",
        vsol: "vsol",
        vsololt: "vsol",
        bdcom: "bdcom",
        bdcomolt: "bdcom",
        huawei: "huawei",
        huaweiolt: "huawei",
        zte: "zte",
        zteolt: "zte",
        other: "other",
        generic: "other",
        unknown: "other"
    };

    if (!aliases[key]) {
        throw new OltError(
            `Unsupported OLT vendor: ${raw || "(empty)"}.`
        );
    }

    return aliases[key];
}

function validateInput(body, editing = false) {
    body = body || {};

    const vendor = normalizeVendor(body.vendor);
    const name = clean(body.name, 150);
    const ip = clean(body.ip || body.host, 255);
    const username = clean(body.username, 150);
    const password = String(body.password ?? "");
    const port = Number(body.port || 23);
    const ponPorts = Number(body.pon_ports || 4);

    const snmpVersion = clean(
        body.snmp_version || "v2c",
        10
    ).toLowerCase();

    const community = clean(body.community || "public", 100);
    const remarks = clean(body.remarks, 1000);

    if (!name) {
        throw new OltError("OLT name is required.");
    }

    if (!ip) {
        throw new OltError("OLT host/IP is required.");
    }

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new OltError("Port must be between 1 and 65535.");
    }

    if (
        !Number.isInteger(ponPorts) ||
        ponPorts < 1 ||
        ponPorts > 256
    ) {
        throw new OltError(
            "PON port count must be between 1 and 256."
        );
    }

    if (!["v1", "v2c", "v3"].includes(snmpVersion)) {
        throw new OltError("Invalid SNMP version.");
    }

    if (!editing && !username) {
        throw new OltError("OLT username is required.");
    }

    if (!editing && !password) {
        throw new OltError("OLT password is required.");
    }

    return {
        vendor,
        name,
        ip,
        port,
        username,
        password,
        pon_ports: ponPorts,
        snmp_version: snmpVersion,
        community,
        remarks
    };
}

function jsonError(res, error) {
    const status = Number(error.status) || 500;

    if (status >= 500) {
        console.error("[OLT]", error);
    }

    return res.status(status).json({
        success: false,
        message: status >= 500
            ? "OLT operation failed. Check the server log."
            : error.message
    });
}

function verifyMappingCsrf(req) {
    const sessionToken = String(
        req.session?.csrf_token || ""
    );

    const requestToken = String(
        req.body?.csrf_token ||
        req.headers["x-csrf-token"] ||
        ""
    );

    if (!sessionToken || !requestToken) {
        throw new OltError("Invalid CSRF token.", 403);
    }

    const a = Buffer.from(sessionToken);
    const b = Buffer.from(requestToken);

    if (
        a.length !== b.length ||
        !crypto.timingSafeEqual(a, b)
    ) {
        throw new OltError("Invalid CSRF token.", 403);
    }
}

async function findOlt(req, id) {
    const scope = scopeSql(req, "ol");

    const [rows] = await getPool().execute(
        `SELECT ol.*
           FROM olts AS ol
          WHERE ol.id = ? ${scope.sql}
          LIMIT 1`,
        [id, ...scope.params]
    );

    if (!rows.length) {
        throw new OltError(
            "OLT not found or access denied.",
            404
        );
    }

    return rows[0];
}

/*
|--------------------------------------------------------------------------
| GET /api/olt
|--------------------------------------------------------------------------
*/

exports.list = async (req, res) => {
    try {
        if (!userId(req)) {
            throw new OltError("Login required.", 401);
        }

        const search = clean(req.query.search, 150);
        const scope = scopeSql(req, "ol");

        let where = `WHERE ol.deleted_at IS NULL ${scope.sql}`;
        const params = [...scope.params];

        if (search) {
            where += ` AND (
                ol.name LIKE ?
                OR ol.vendor LIKE ?
                OR ol.ip LIKE ?
                OR ol.username LIKE ?
            )`;

            const like = `%${search}%`;
            params.push(like, like, like, like);
        }

        const [rows] = await getPool().execute(
            `SELECT
                ol.id,
                ol.vendor,
                ol.name,
                ol.ip,
                ol.port,
                ol.username,
                ol.pon_ports,
                ol.status,
                ol.created_at,
                ol.last_check,
                (
                    SELECT COUNT(*)
                    FROM onu AS o
                    WHERE o.olt_id = ol.id
                ) AS onu_total,
                (
                    SELECT COUNT(*)
                    FROM onu AS o
                    WHERE o.olt_id = ol.id
                      AND LOWER(COALESCE(o.status, ''))
                          IN (
                              'online', 'up', 'connected',
                              'active', '1'
                          )
                ) AS onu_online
             FROM olts AS ol
             ${where}
             ORDER BY ol.id DESC
             LIMIT 500`,
            params
        );

        return res.json({
            success: true,
            total: rows.length,
            data: rows
        });
    } catch (error) {
        return jsonError(res, error);
    }
};

/*
|--------------------------------------------------------------------------
| GET /api/olt/:id/details
|--------------------------------------------------------------------------
*/

exports.details = async (req, res) => {
    try {
        const id = validId(req.params.id);
        const olt = await findOlt(req, id);

        const [counts] = await getPool().execute(
            `SELECT
                COUNT(*) AS total,
                SUM(
                    CASE
                        WHEN LOWER(COALESCE(status, ''))
                            IN (
                                'online', 'up', 'connected',
                                'active', '1'
                            )
                        THEN 1 ELSE 0
                    END
                ) AS online,
                AVG(CAST(rx_power AS DECIMAL(10,2))) AS avg_rx,
                AVG(CAST(tx_power AS DECIMAL(10,2))) AS avg_tx
             FROM onu
             WHERE olt_id = ?`,
            [id]
        );

        return res.json({
            success: true,
            data: {
                ...olt,
                onu_summary: counts[0]
            }
        });
    } catch (error) {
        return jsonError(res, error);
    }
};

/*
|--------------------------------------------------------------------------
| POST /api/olt
|--------------------------------------------------------------------------
*/

exports.create = async (req, res) => {
    let connection;

    try {
        if (!userId(req)) {
            throw new OltError("Login required.", 401);
        }

        const data = validateInput(req.body || {});
        const company = companyId(req);

        if (!isSuperAdmin(req) && !company) {
            throw new OltError(
                "Company scope is missing.",
                403
            );
        }

        connection = await getPool().getConnection();
        await connection.beginTransaction();

        const [existing] = await connection.execute(
            `SELECT id
               FROM olts
              WHERE name = ?
                AND ip = ?
                AND port = ?
                AND company_id = ?
              LIMIT 1`,
            [data.name, data.ip, data.port, company]
        );

        if (existing.length) {
            throw new OltError(
                "An OLT with this name, host and port already exists."
            );
        }

        const [result] = await connection.execute(
            `INSERT INTO olts (
                company_id, created_by, vendor, name, ip, port,
                username, password, snmp_version, community,
                pon_ports, remarks, status, onu_total,
                onu_online, onu_offline, created_at
            )
            VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                'unknown', 0, 0, 0, NOW()
            )`,
            [
                company,
                userId(req),
                data.vendor,
                data.name,
                data.ip,
                data.port,
                data.username,
                data.password,
                data.snmp_version,
                data.community,
                data.pon_ports,
                data.remarks
            ]
        );

        await connection.commit();

        return res.status(201).json({
            success: true,
            message: "OLT saved.",
            id: result.insertId
        });
    } catch (error) {
        if (connection) {
            await connection.rollback().catch(() => {});
        }

        return jsonError(res, error);
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

/*
|--------------------------------------------------------------------------
| PUT /api/olt/:id
|--------------------------------------------------------------------------
*/

exports.update = async (req, res) => {
    try {
        const id = validId(req.params.id);
        const old = await findOlt(req, id);
        const data = validateInput(req.body || {}, true);
        const password =
            String(req.body?.password ?? "") || old.password;

        const scope = scopeSql(req, "ol");

        await getPool().execute(
            `UPDATE olts AS ol
                SET vendor = ?,
                    name = ?,
                    ip = ?,
                    port = ?,
                    username = ?,
                    password = ?,
                    snmp_version = ?,
                    community = ?,
                    pon_ports = ?,
                    remarks = ?,
                    updated_at = NOW()
              WHERE ol.id = ? ${scope.sql}`,
            [
                data.vendor,
                data.name,
                data.ip,
                data.port,
                data.username,
                password,
                data.snmp_version,
                data.community,
                data.pon_ports,
                data.remarks,
                id,
                ...scope.params
            ]
        );

        return res.json({
            success: true,
            message: "OLT updated."
        });
    } catch (error) {
        return jsonError(res, error);
    }
};

/*
|--------------------------------------------------------------------------
| DELETE /api/olt/:id
|--------------------------------------------------------------------------
| Archive OLT; preserve ONU records and customer mappings.
|--------------------------------------------------------------------------
*/

exports.remove = async (req, res) => {
    let connection;

    try {
        const id = validId(req.params.id);
        const olt = await findOlt(req, id);

        if (
            req.body?.confirm !== true &&
            req.body?.confirm !== "true"
        ) {
            throw new OltError(
                "Confirm deletion by sending confirm: true."
            );
        }

        connection = await getPool().getConnection();
        await connection.beginTransaction();

        const scope = scopeSql(req, "ol");

        // Preserve the OLT name for ONU records.
        await connection.execute(
            `UPDATE onu
                SET olt_name = CASE
                    WHEN olt_name IS NULL
                         OR TRIM(olt_name) = ''
                    THEN ?
                    ELSE olt_name
                END
              WHERE olt_id = ?`,
            [olt.name, id]
        );

        // Archive instead of deleting the OLT.
        const [result] = await connection.execute(
            `UPDATE olts AS ol
                SET deleted_at = NOW()
              WHERE ol.id = ?
                AND ol.deleted_at IS NULL
                ${scope.sql}`,
            [id, ...scope.params]
        );

        if (result.affectedRows !== 1) {
            throw new OltError(
                "OLT not found, already archived, or access denied.",
                404
            );
        }

        await connection.commit();

        return res.json({
            success: true,
            message: "OLT archived. ONU records preserved.",
            deleted_onu: 0,
            preserved_onu: true,
            olt: {
                id: olt.id,
                name: olt.name,
                deleted_at: true
            }
        });
    } catch (error) {
        if (connection) {
            await connection.rollback().catch(() => {});
        }

        return jsonError(res, error);
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

/*
|--------------------------------------------------------------------------
| POST /api/olt/:id/check
|--------------------------------------------------------------------------
| TCP reachability only; credentials are not verified.
|--------------------------------------------------------------------------
*/

exports.check = async (req, res) => {
    let driver = null;
    let olt = null;
    let testStarted = false;

    const startedAt = Date.now();

    try {
        const id = validId(req.params.id);
        olt = await findOlt(req, id);

        if (
            !olt.ip ||
            !olt.port ||
            !olt.username ||
            !olt.password
        ) {
            throw new OltError(
                "OLT IP, Port, Username এবং Password যাচাই করুন।"
            );
        }

        const vendor = normalizeVendor(olt.vendor);

        const config = {
            id: olt.id,
            olt_id: olt.id,
            company_id: olt.company_id,
            vendor,
            name: olt.name,
            ip: olt.ip,
            host: olt.ip,
            address: olt.ip,
            port: Number(olt.port),
            username: olt.username,
            user: olt.username,
            password: olt.password,
            model: olt.model,
            timeout: 10000
        };

        if (vendor === "cdata") {
            const { CDataDriver } = require("../drivers/cdata");
            driver = new CDataDriver(config);
        } else if (vendor === "ecom") {
            const { EcomDriver } = require("../drivers/ecom");
            driver = new EcomDriver(config);
        } else {
            throw new OltError(
                `এই Vendor-এর connection test সেট করা নেই: ${vendor}`
            );
        }

        testStarted = true;

        let result;

        if (typeof driver.testConnection === "function") {
            result = await driver.testConnection();
        } else {
            const connected = await driver.connect();

            if (connected === false) {
                throw new Error("OLT connection failed.");
            }

            result = { success: true };
        }

        if (
            result === false ||
            (result && result.success === false)
        ) {
            throw new Error(
                result?.message || "OLT connection test failed."
            );
        }

        const scope = scopeSql(req, "ol");

        await getPool().execute(
            `UPDATE olts AS ol
                SET status = ?, last_check = NOW()
              WHERE ol.id = ? ${scope.sql}`,
            ["online", id, ...scope.params]
        );

        return res.json({
            success: true,
            reachable: true,
            status: "online",
            stage: "complete",
            message: "OLT connection test successful.",
            olt: {
                id: olt.id,
                name: olt.name,
                vendor,
                ip: olt.ip,
                port: olt.port
            },
            connection_time: Date.now() - startedAt,
            device: result || {}
        });
    } catch (error) {
        console.error("[OLT CHECK]", error);

        if (olt && testStarted) {
            try {
                const scope = scopeSql(req, "ol");

                await getPool().execute(
                    `UPDATE olts AS ol
                        SET status = ?, last_check = NOW()
                      WHERE ol.id = ? ${scope.sql}`,
                    ["offline", olt.id, ...scope.params]
                );
            } catch (dbError) {
                console.error(
                    "[OLT CHECK STATUS UPDATE]",
                    dbError
                );
            }
        }

        return jsonError(res, error);
    } finally {
        if (driver && typeof driver.disconnect === "function") {
            try {
                await driver.disconnect();
            } catch (disconnectError) {
                console.error(
                    "[OLT CHECK DISCONNECT]",
                    disconnectError.message
                );
            }
        }
    }
};

/*
|--------------------------------------------------------------------------
| POST /api/olt/:id/sync
|--------------------------------------------------------------------------
*/

exports.sync = async (req, res) => {
    try {
        const id = validId(req.params.id);
        const olt = await findOlt(req, id);
        const result = await syncOnus(getPool(), olt);

        return res.json({
            success: true,
            message: "OLT ONU synchronization completed.",
            data: result
        });
    } catch (error) {
        return jsonError(res, error);
    }
};

/*
|--------------------------------------------------------------------------
| POST /api/olt/:id/auto-map   (body: { dry_run: true } to preview)
|--------------------------------------------------------------------------
| Database-only matching (no OLT connection). Learned-MAC evidence is added
| automatically during /sync.
|--------------------------------------------------------------------------
*/


exports.autoMap = async (req, res) => {
    let driver = null;

    try {
        verifyMappingCsrf(req);

        const id = validId(req.params.id);
        const olt = await findOlt(req, id);

        const dryRun =
            req.body?.dry_run === true ||
            req.body?.dry_run === "true" ||
            req.query?.dry_run === "1";

        let ppp = {
            sessions: [],
            errors: []
        };

        try {
            ppp = await collectPppSessions(
                getPool(),
                olt.company_id,
                loadMikrotikService()
            );
        } catch (error) {
            ppp.errors.push(error.message);
        }

        let onuRows = [];

        let learned = {
            supported: false,
            entries: [],
            errors: [],
            lines: 0,
            reason: "Not collected"
        };

        const oltErrors = [];

        // OLT evidence collection is restricted to Dry Run.
        if (dryRun) {
            try {
                driver = driverFor(olt);

                await driver.connect();

                if (typeof driver.detectModel === "function") {
                    await driver.detectModel();
                }

                onuRows = await driver.getONUList();

                if (!Array.isArray(onuRows)) {
                    throw new Error(
                        "OLT getONUList() did not return an array."
                    );
                }

                if (typeof driver.getLearnedMacs === "function") {
                    learned = await driver.getLearnedMacs(onuRows);
                } else {
                    learned.reason =
                        "This OLT driver does not support learned-MAC collection.";
                }
            } catch (error) {
                oltErrors.push(error.message);
            } finally {
                if (driver) {
                    try {
                        await disconnectDriver(driver);
                    } catch (error) {
                        oltErrors.push(
                            "OLT disconnect: " + error.message
                        );
                    }

                    driver = null;
                }
            }
        }

        const result = await autoMapOnus(getPool(), {
            companyId: olt.company_id,
            oltId: id,
            dryRun,
            entries: learned.entries || [],
            sessions: ppp.sessions
        });

        result.pppSessions = ppp.sessions.length;
        result.pppErrors = (ppp.errors || []).slice(0, 10);

        result.oltOnusCollected = onuRows.length;
        result.learnedMacSupported = !!learned.supported;
        result.learnedMacEntries = (learned.entries || []).length;
        result.learnedMacLines = learned.lines || 0;
        result.learnedMacReason = learned.reason || null;
        result.learnedMacErrors = (learned.errors || []).slice(0, 10);
        result.oltErrors = oltErrors.slice(0, 10);

        return res.json({
            success: true,
            message: dryRun
                ? "Auto mapping preview completed."
                : "Auto mapping completed.",
            data: result
        });
    } catch (error) {
        if (driver) {
            try {
                await disconnectDriver(driver);
            } catch {
                // Preserve the original error.
            }
        }

        return jsonError(res, error);
    }
};


/*
|--------------------------------------------------------------------------
| GET /api/olt/:id/onus
|--------------------------------------------------------------------------
*/

exports.listOnus = async (req, res) => {
    try {
        const id = validId(req.params.id);
        const olt = await findOlt(req, id);
        const search = clean(req.query.search, 150);

        let sql = `
            SELECT
                o.id,
                o.olt_id,

                CASE
                    WHEN c.id IS NOT NULL THEN
                        COALESCE(
                            NULLIF(TRIM(c.name), ''),
                            NULLIF(TRIM(c.customer_id), ''),
                            'Customer name unavailable'
                        )
                    ELSE 'Customer not linked'
                END AS name,

                COALESCE(
                    NULLIF(TRIM(o.ip_address), ''),
                    ''
                ) AS ip_address,

                COALESCE(
                    NULLIF(TRIM(o.onu_mac), ''),
                    NULLIF(TRIM(o.mac_address), ''),
                    ''
                ) AS mac,

                o.onu_sn AS serial,
                o.customer_id AS onu_customer_id,

                um.id AS mapping_id,
                um.customer_id AS mapping_customer_id,

                c.id AS matched_customer_id,
                c.customer_id AS customer_code,
                c.name AS customer_name,
                c.phone AS customer_phone,
                c.onu_mac AS customer_onu_mac,
                c.pppoe_username,

                COALESCE(
                    NULLIF(TRIM(o.olt_name), ''),
                    ol.name,
                    ''
                ) AS olt_name,

                o.pon,
                o.port,
                o.status,
                o.rx_power,
                o.tx_power,
                o.distance,
                o.bias_current,
                o.voltage,
                o.temperature,

                COALESCE(
                    o.last_update,
                    o.updated_at,
                    o.last_seen
                ) AS last_update

            FROM onu AS o

            LEFT JOIN olts AS ol
                ON ol.id = o.olt_id

            LEFT JOIN onu_user_mapping AS um
                ON um.onu_id = o.id
                AND um.olt_id = o.olt_id
                AND um.company_id = ol.company_id

            LEFT JOIN customers AS c
                ON c.company_id = ol.company_id
                AND (
                    (
                        um.id IS NOT NULL
                        AND um.customer_id IS NOT NULL
                        AND c.id = um.customer_id
                    )

                    OR (
                        um.id IS NULL
                        AND c.id = o.customer_id
                    )

                    OR (
                        um.id IS NULL
                        AND (
                            o.customer_id IS NULL
                            OR o.customer_id = 0
                        )
                        AND (
                            (
                                NULLIF(TRIM(o.onu_mac), '') IS NOT NULL
                                AND UPPER(
                                    REPLACE(TRIM(c.onu_mac), '-', ':')
                                ) = UPPER(
                                    REPLACE(TRIM(o.onu_mac), '-', ':')
                                )
                            )
                            OR (
                                NULLIF(TRIM(o.mac_address), '') IS NOT NULL
                                AND UPPER(
                                    REPLACE(TRIM(c.onu_mac), '-', ':')
                                ) = UPPER(
                                    REPLACE(TRIM(o.mac_address), '-', ':')
                                )
                            )
                        )
                    )
                )

            WHERE o.olt_id = ?
              AND ol.id = ?
        `;

        const params = [id, id];

        if (search) {
            sql += `
                AND (
                    CAST(o.id AS CHAR) LIKE ?
                    OR o.onu_name LIKE ?
                    OR o.name LIKE ?
                    OR o.ip_address LIKE ?
                    OR o.mac_address LIKE ?
                    OR o.onu_mac LIKE ?
                    OR o.onu_sn LIKE ?
                    OR o.status LIKE ?
                    OR o.olt_name LIKE ?
                    OR CAST(o.pon AS CHAR) LIKE ?
                    OR c.name LIKE ?
                    OR CAST(c.customer_id AS CHAR) LIKE ?
                    OR c.phone LIKE ?
                    OR c.pppoe_username LIKE ?
                )
            `;

            const like = `%${search}%`;

            params.push(
                like, like, like, like, like,
                like, like, like, like, like,
                like, like, like, like
            );
        }

        sql += `
            ORDER BY o.id DESC
            LIMIT 1000
        `;

        const [rows] = await getPool().execute(sql, params);

        return res.json({
            success: true,
            total: rows.length,
            data: rows.map(row => {
                const linked = row.matched_customer_id != null;

                return {
                    ...row,

                    customer_code: linked
                        ? (row.customer_code ?? null)
                        : null,

                    customer_name: linked
                        ? (row.customer_name || null)
                        : null,

                    customer_phone: linked
                        ? (row.customer_phone || null)
                        : null,

                    pppoe_username: linked
                        ? (row.pppoe_username || null)
                        : null,

                    customer_linked: linked,

                    onu_device_name:
                        row.onu_name ||
                        row.name ||
                        "ONU",

                    mapping_required: !linked
                };
            })
        });
    } catch (error) {
        return jsonError(res, error);
    }
};

/*
|--------------------------------------------------------------------------
| GET /api/olt/:id/customers/search?q=
|--------------------------------------------------------------------------
*/

exports.searchCustomers = async (req, res) => {
    try {
        const oltId = validId(req.params.id);
        const olt = await findOlt(req, oltId);
        const q = clean(req.query.q, 100);

        if (q.length < 2) {
            return res.json({
                success: true,
                total: 0,
                data: []
            });
        }

        const like = `%${q}%`;

        const [rows] = await getPool().execute(
            `SELECT
                c.id,
                c.customer_id AS customer_code,
                c.name,
                c.phone,
                c.pppoe_username,
                c.mikrotik_id
             FROM customers AS c
             WHERE c.company_id = ?
               AND c.deleted_at IS NULL
               AND (
                    c.name LIKE ?
                    OR CAST(c.customer_id AS CHAR) LIKE ?
                    OR c.phone LIKE ?
                    OR c.pppoe_username LIKE ?
                    OR c.mikrotik_id LIKE ?
               )
             ORDER BY c.name ASC
             LIMIT 20`,
            [
                olt.company_id,
                like,
                like,
                like,
                like,
                like
            ]
        );

        return res.json({
            success: true,
            total: rows.length,
            data: rows
        });
    } catch (error) {
        return jsonError(res, error);
    }
};

/*
|--------------------------------------------------------------------------
| POST /api/olt/:id/onus/:onuId/customer
|--------------------------------------------------------------------------
*/

exports.linkOnuCustomer = async (req, res) => {
    let connection;

    try {
        verifyMappingCsrf(req);

        const oltId = validId(req.params.id);
        const onuId = validId(req.params.onuId);
        const customerId = validId(req.body?.customer_id);

        const olt = await findOlt(req, oltId);

        connection = await getPool().getConnection();
        await connection.beginTransaction();

        const [onus] = await connection.execute(
            `SELECT id
               FROM onu
              WHERE id = ?
                AND olt_id = ?
              LIMIT 1`,
            [onuId, oltId]
        );

        if (!onus.length) {
            throw new OltError(
                "ONU not found on this OLT.",
                404
            );
        }

        const [customers] = await connection.execute(
            `SELECT id
               FROM customers
              WHERE id = ?
                AND company_id = ?
                AND deleted_at IS NULL
              LIMIT 1`,
            [customerId, olt.company_id]
        );

        if (!customers.length) {
            throw new OltError(
                "Customer not found or access denied.",
                404
            );
        }

        await connection.execute(
            `INSERT INTO onu_user_mapping
                (company_id, olt_id, onu_id, customer_id)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                company_id = VALUES(company_id),
                olt_id = VALUES(olt_id),
                customer_id = VALUES(customer_id)`,
            [
                olt.company_id,
                oltId,
                onuId,
                customerId
            ]
        );

        await connection.commit();

        return res.json({
            success: true,
            message: "ONU customer mapping saved.",
            data: {
                olt_id: oltId,
                onu_id: onuId,
                customer_id: customerId
            }
        });
    } catch (error) {
        if (connection) {
            await connection.rollback().catch(() => {});
        }

        return jsonError(res, error);
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

/*
|--------------------------------------------------------------------------
| DELETE /api/olt/:id/onus/:onuId/customer
|--------------------------------------------------------------------------
*/

exports.unlinkOnuCustomer = async (req, res) => {
    let connection;

    try {
        verifyMappingCsrf(req);

        const oltId = validId(req.params.id);
        const onuId = validId(req.params.onuId);
        const olt = await findOlt(req, oltId);

        connection = await getPool().getConnection();
        await connection.beginTransaction();

        const [onus] = await connection.execute(
            `SELECT id
               FROM onu
              WHERE id = ?
                AND olt_id = ?
              LIMIT 1`,
            [onuId, oltId]
        );

        if (!onus.length) {
            throw new OltError(
                "ONU not found on this OLT.",
                404
            );
        }

        await connection.execute(
            `INSERT INTO onu_user_mapping
                (company_id, olt_id, onu_id, customer_id)
             VALUES (?, ?, ?, NULL)
             ON DUPLICATE KEY UPDATE
                company_id = VALUES(company_id),
                olt_id = VALUES(olt_id),
                customer_id = NULL`,
            [
                olt.company_id,
                oltId,
                onuId
            ]
        );

        await connection.commit();

        return res.json({
            success: true,
            message: "ONU customer mapping removed.",
            data: {
                olt_id: oltId,
                onu_id: onuId,
                customer_id: null
            }
        });
    } catch (error) {
        if (connection) {
            await connection.rollback().catch(() => {});
        }

        return jsonError(res, error);
    } finally {
        if (connection) {
            connection.release();
        }
    }
};
