
"use strict";

const mysql = require("mysql2/promise");
const net = require("net");
const crypto = require("crypto");
const syncManager = require("../../drivers/sync/sync-manager");
const { autoMapOnus } = require("../../drivers/services/onu-auto-mapping.service");
const {
    collectPppSessions,
    loadMikrotikService
} = require("../../drivers/services/ppp-sessions");
const {
    driverFor,
    disconnectDriver
} = require("../../drivers/services/olt-sync.service");

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

/* Vendors read over SNMP: a community instead of a telnet login. */
const SNMP_VENDORS = new Set(["hioso", "hsgq", "zte"]);

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
        hioso: "hioso",
        hiosoepon: "hioso",
        hiosoolt: "hioso",
        hsgq: "hsgq",
        hsgqepon: "hsgq",
        hsgqgpon: "hsgq",
        hsgqolt: "hsgq",
        vsol: "vsol",
        vsololt: "vsol",
        bdcom: "bdcom",
        bdcomolt: "bdcom",
        huawei: "huawei",
        huaweiolt: "huawei",
        zte: "zte",
        zteolt: "zte",
        zteepon: "zte",
        zteeponolt: "zte",
        fiberhome: "fiberhome",
        raisecom: "raisecom",
        nokia: "nokia",
        tplink: "tplink",
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
    const snmpVendor = SNMP_VENDORS.has(vendor);
    const port = Number(body.port || (snmpVendor ? 161 : 23));
    const ponPorts = Number(body.pon_ports || 4);
const mikrotikId = body.mikrotik_id
    ? Number(body.mikrotik_id)
    : null;

if (
    mikrotikId !== null &&
    (!Number.isInteger(mikrotikId) || mikrotikId < 1)
) {
    throw new OltError("Invalid MikroTik router.");
}

    const snmpVersion = clean(
        body.snmp_version || "v2c",
        10
    ).toLowerCase();

    const communityInput = clean(body.community, 100);
    /* Edit: blank = keep the stored community (see update). */
    const community = communityInput || (editing ? "" : "public");
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

    if (snmpVendor && snmpVersion === "v3") {
        throw new OltError(
            "SNMP v3 is not supported for this vendor yet. Use v1 or v2c."
        );
    }

    if (snmpVendor && !editing && !communityInput) {
        throw new OltError("SNMP community is required.");
    }

    if (!editing && !snmpVendor && !username) {
        throw new OltError("OLT username is required.");
    }

    if (!editing && !snmpVendor && !password) {
        throw new OltError("OLT password is required.");
    }

    return {
        vendor,
mikrotik_id: mikrotikId,
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

        let where = `WHERE 1=1 ${scope.sql}`;
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
                ol.snmp_version,
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
if (data.mikrotik_id !== null) {
    const [routers] = await getPool().execute(
        `SELECT id
         FROM mikrotik_servers
         WHERE id = ?
           AND company_id = ?
           AND deleted_at IS NULL
         LIMIT 1`,
        [data.mikrotik_id, company]
    );

    if (!routers.length) {
        throw new OltError(
            "Selected MikroTik router not found in this company.",
            400
        );
    }
}
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
                company_id, mikrotik_id, created_by, vendor, name, ip, port,
                username, password, snmp_version, community,
                pon_ports, remarks, status, onu_total,
                onu_online, onu_offline, created_at
            )
            VALUES (
 ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
'unknown', 0, 0, 0, NOW()
            )`,
            [
                company,
data.mikrotik_id,
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
        const community =
            data.community || old.community || "public";

        const scope = scopeSql(req, "ol");

        await getPool().execute(
            `UPDATE olts AS ol
                SET mikrotik_id = ?,
                    vendor = ?,
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
		data.mikrotik_id,
                data.vendor,
                data.name,
                data.ip,
                data.port,
                data.username,
                password,
                data.snmp_version,
                community,
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

        // Only the OLT row is deleted. ONU rows and customer mappings
        // (onu_user_mapping, onu_ppp_info, onu_customer_links) are kept;
        // an ONU is removed only by a manual ONU delete.
        const [[kept]] = await connection.execute(
            "SELECT COUNT(*) AS total FROM onu WHERE olt_id = ?",
            [id]
        );

        await connection.execute(
            `DELETE ol
               FROM olts AS ol
              WHERE ol.id = ? ${scope.sql}`,
            [id, ...scope.params]
        );

        await connection.commit();

        return res.json({
            success: true,
            message: "OLT deleted.",
            kept_onu: Number(kept.total),
            olt: {
                id: olt.id,
                name: olt.name
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

        const vendor = normalizeVendor(olt.vendor);
        const snmpVendor = SNMP_VENDORS.has(vendor);

        if (snmpVendor) {
            if (!olt.ip || !olt.community) {
                throw new OltError(
                    "OLT IP এবং SNMP community যাচাই করুন।"
                );
            }
        } else if (
            !olt.ip ||
            !olt.port ||
            !olt.username ||
            !olt.password
        ) {
            throw new OltError(
                "OLT IP, Port, Username এবং Password যাচাই করুন।"
            );
        }

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
            const { CDataDriver } = require("../../drivers/hardware/cdata");
            driver = new CDataDriver(config);
        } else if (vendor === "ecom") {
            const { EcomDriver } = require("../../drivers/hardware/ecom");
            driver = new EcomDriver(config);
        } else if (vendor === "bdcom") {
            const { BdcomDriver } = require("../../drivers/hardware/bdcom");
            driver = new BdcomDriver(config);
        } else if (vendor === "vsol") {
            const { VsolDriver } = require("../../drivers/hardware/vsol");
            driver = new VsolDriver(config);
        } else if (snmpVendor) {
            /* Hioso / HSGQ / ZTE EPON: SNMP drivers, built from the OLT row. */
            const { driverFor } = require("../../drivers/services/olt-sync.service");
            driver = driverFor(olt);
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

exports.syncCustomers = async (req, res) => {
    try {
        verifyMappingCsrf(req);

        const id = validId(req.params.id);
        const olt = await findOlt(req, id);

        const dryRun =
            req.body?.dry_run === true ||
            req.body?.dry_run === "true" ||
            req.query?.dry_run === "1";

        const result = await syncManager.syncCustomers(
            getPool(),
            olt,
            { dryRun }
        );

        return res.json({
            success: true,
            message: dryRun
                ? "Customer & mapping sync preview completed."
                : "Customer & mapping sync completed.",
            data: result
        });
    } catch (error) {
        return jsonError(res, error);
    }
};

exports.syncOnuHardware = async (req, res) => {
    try {
        verifyMappingCsrf(req);

        const id = validId(req.params.id);
        const olt = await findOlt(req, id);
        const result = await syncManager.syncOnuHardware(getPool(), olt);

        return res.json({
            success: true,
            message: "ONU hardware synchronization completed.",
            data: result
        });
    } catch (error) {
        return jsonError(res, error);
    }
};


/*
|--------------------------------------------------------------------------
| POST /api/olt/:id/onus/:onuId/sync
|--------------------------------------------------------------------------
| Synchronize hardware fields for exactly one existing ONU.
*/
exports.syncOneOnu = async (req, res) => {
    try {
        verifyMappingCsrf(req);

        const oltId = validId(req.params.id);
        const onuId = validId(req.params.onuId);
        const olt = await findOlt(req, oltId);
        const result = await syncManager.syncOneOnuHardware(
            getPool(),
            olt,
            onuId
        );

        return res.json({
            success: true,
            message: "ONU #" + onuId + " hardware synchronization completed.",
            data: result
        });
    } catch (error) {
        return jsonError(res, error);
    }
};

// Old endpoint (POST /:id/sync) keeps working as ONU hardware sync.
exports.sync = exports.syncOnuHardware;

/*
|--------------------------------------------------------------------------
| POST /api/olt/:id/auto-map   (body: { dry_run: true } to preview)
|--------------------------------------------------------------------------
| Database-only matching (no OLT connection). Learned-MAC evidence is added
| automatically during /sync.
|--------------------------------------------------------------------------
*/

exports.autoMap = async (req, res) => {
    try {
        verifyMappingCsrf(req);

        const id = validId(req.params.id);
        const olt = await findOlt(req, id);

        const dryRun =
            req.body?.dry_run === true ||
            req.body?.dry_run === "true" ||
            req.query?.dry_run === "1";

        let ppp = { sessions: [], errors: [] };

        try {
ppp = await collectPppSessions(
    getPool(),
    olt.company_id,
    loadMikrotikService(),
    olt.mikrotik_id
);
        } catch (pppError) {
            ppp.errors.push(pppError.message);
        }

        // Read vendor learned-MAC evidence so PPPoE caller-id MACs can
        // be attributed to the correct ONU (including switch/bridge ONUs).
        // Vendors without a verified collector still use exact ONU-MAC matches.
        let learned = {
            supported: false,
            entries: [],
            errors: []
        };
        let mappingDriver = null;

        try {
            mappingDriver = driverFor(olt);

            if (typeof mappingDriver.getLearnedMacs === "function") {
                await mappingDriver.connect();

                if (typeof mappingDriver.detectModel === "function") {
                    await mappingDriver.detectModel();
                }

                const onuRows = await mappingDriver.getONUList();

                if (Array.isArray(onuRows) && onuRows.length) {
                    learned = await mappingDriver.getLearnedMacs(onuRows);
                } else {
                    learned.errors.push("OLT returned no ONU rows for learned-MAC mapping.");
                }
            }
        } catch (mappingError) {
            learned.errors = [
                ...(learned.errors || []),
                mappingError.message || String(mappingError)
            ];
        } finally {
            await disconnectDriver(mappingDriver).catch(() => {});
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
        result.learnedMacsSupported = learned.supported === true;
        result.learnedMacErrors = (learned.errors || []).slice(0, 10);

        return res.json({
            success: true,
            message: dryRun
                ? "Auto mapping preview completed."
                : "Auto mapping completed.",
            data: result
        });
    } catch (error) {
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
                            NULLIF(TRIM(c.comment), ''),
                            NULLIF(TRIM(c.pppoe_username), ''),
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

        /*
         * Several customers behind one ONU (switch). Optional table: when the
         * migration has not been run the list simply has no extra customers.
         */
        const extrasByOnu = new Map();

        try {
            const [extraRows] = await getPool().execute(
                `SELECT l.onu_id,
                        c.id AS customer_db_id,
                        c.customer_id AS customer_code,
                        c.name,
                        c.phone,
                        c.pppoe_username
                   FROM onu_customer_links AS l
                   JOIN olts AS ol
                     ON ol.id = l.olt_id
                    AND ol.company_id = l.company_id
                   JOIN customers AS c
                     ON c.id = l.customer_id
                    AND c.company_id = l.company_id
                    AND c.deleted_at IS NULL
                  WHERE l.olt_id = ?
                    AND ol.id = ?
                  ORDER BY c.name`,
                [id, id]
            );

            for (const extra of extraRows) {
                const key = Number(extra.onu_id);

                if (!extrasByOnu.has(key)) extrasByOnu.set(key, []);

                extrasByOnu.get(key).push({
                    id: extra.customer_db_id,
                    customer_code: extra.customer_code ?? null,
                    name: extra.name || null,
                    phone: extra.phone || null,
                    pppoe_username: extra.pppoe_username || null
                });
            }
        } catch (extraError) {
            if (!extraError || extraError.code !== 'ER_NO_SUCH_TABLE') {
                throw extraError;
            }
        }

        /*
         * Live MikroTik info (caller-id MAC, IP) saved by Sync / Auto map.
         * Optional table: without the migration the list works as before.
         */
        const pppByCustomer = new Map();

        try {
            const [pppRows] = await getPool().execute(
                `SELECT p.onu_id,
                        p.customer_id,
                        p.caller_id,
                        p.ip_address,
                        p.pppoe_username,
                        c.customer_id AS customer_code,
                        c.name,
                        c.phone
                   FROM onu_ppp_info AS p
                   JOIN olts AS ol
                     ON ol.id = p.olt_id
                    AND ol.company_id = p.company_id
                   JOIN customers AS c
                     ON c.id = p.customer_id
                    AND c.company_id = p.company_id
                    AND c.deleted_at IS NULL
                  WHERE p.olt_id = ?
                    AND ol.id = ?
                  ORDER BY c.name`,
                [id, id]
            );

            for (const item of pppRows) {
                const customerId = Number(item.customer_id);

                pppByCustomer.set(customerId, {
                    caller_id: item.caller_id || null,
                    ip: item.ip_address || null,
                    pppoe_username: item.pppoe_username || null
                });

                // Every customer saved for this ONU (switch) is listed.
                const key = Number(item.onu_id);

                if (!extrasByOnu.has(key)) extrasByOnu.set(key, []);

                if (!extrasByOnu.get(key).some(x => Number(x.id) === customerId)) {
                    extrasByOnu.get(key).push({
                        id: customerId,
                        customer_code: item.customer_code ?? null,
                        name: item.name || null,
                        phone: item.phone || null,
                        pppoe_username: item.pppoe_username || null
                    });
                }
            }
        } catch (pppError) {
            if (!pppError || pppError.code !== 'ER_NO_SUCH_TABLE') {
                throw pppError;
            }
        }
        /*
         * Customer PPPoE sessions are independent of ONU hardware.
         * These rows must remain visible even before ONU synchronization.
         */
        const customerSessions = [];

        try {
            let sessionSql = `
                SELECT
                    s.id AS session_id,
                    s.customer_id,
                    s.olt_id,
                    s.router_id,
                    s.pppoe_username,
                    s.caller_id,
                    s.ip_address,
                    s.online_status,
                    s.last_seen,
                    s.synced_at,
                    c.customer_id AS customer_code,
                    c.name AS customer_name,
                    c.phone AS customer_phone
                FROM olt_customer_sessions AS s
                JOIN customers AS c
                  ON c.id = s.customer_id
                 AND c.company_id = s.company_id
                 AND c.deleted_at IS NULL
                WHERE s.company_id = ?
                  AND s.olt_id = ?
            `;

            const sessionParams = [olt.company_id, id];

            if (search) {
                sessionSql += `
                    AND (
                        c.name LIKE ?
                        OR CAST(c.customer_id AS CHAR) LIKE ?
                        OR c.phone LIKE ?
                        OR s.pppoe_username LIKE ?
                        OR s.caller_id LIKE ?
                        OR s.ip_address LIKE ?
                    )
                `;

                const like = `%${search}%`;
                sessionParams.push(
                    like, like, like, like, like, like
                );
            }

            sessionSql += `
                ORDER BY
                    s.online_status DESC,
                    c.name ASC
                LIMIT 2000
            `;

            const [sessionRows] = await getPool().execute(
                sessionSql,
                sessionParams
            );

            customerSessions.push(
                ...sessionRows.map(row => ({
                    ...row,
                    customer_online_status:
                        Number(row.online_status) === 1
                            ? "online"
                            : "offline",
                    customer_only: true
                }))
            );
        } catch (sessionError) {
            if (
                !sessionError ||
                sessionError.code !== "ER_NO_SUCH_TABLE"
            ) {
                throw sessionError;
            }
        }

        // Show every ONU discovered by hardware sync, whether mapped or not.
        // Unmapped ONUs remain visible so they can be linked from the ONU page.
        const visibleRows = rows;
        return res.json({
            success: true,
            total: visibleRows.length,
            customer_session_total: customerSessions.length,
            customer_sessions: customerSessions,
            data: visibleRows.map(row => {
                const linked = row.matched_customer_id != null;
                const primaryPpp = linked
                    ? pppByCustomer.get(Number(row.matched_customer_id))
                    : null;
                const extraCustomers = (extrasByOnu.get(Number(row.id)) || [])
                    .filter(extra =>
                        !linked ||
                        Number(extra.id) !== Number(row.matched_customer_id)
                    )
                    .map(extra => {
                        const ppp = pppByCustomer.get(Number(extra.id));

                        return {
                            ...extra,
                            caller_id: ppp ? ppp.caller_id : null,
                            ip: ppp ? ppp.ip : null
                        };
                    });

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

                    ppp_caller_id: primaryPpp ? primaryPpp.caller_id : null,
                    ppp_ip: primaryPpp ? primaryPpp.ip : null,

                    extra_customers: extraCustomers,
                    customer_count:
                        (linked ? 1 : 0) + extraCustomers.length,

                    onu_device_name:
                        row.onu_name ||
                        row.name ||
                        "ONU",

                    mapping_required: !linked && !extraCustomers.length
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
