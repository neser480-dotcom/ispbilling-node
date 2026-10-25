
"use strict";

const mysql = require("mysql2/promise");
const net = require("net");
const { syncOnus } = require("../drivers/olt-sync.service");

/*
|--------------------------------------------------------------------------
| OLT CONTROLLER
|--------------------------------------------------------------------------
| - Tenant-scoped OLT access
| - Super admin can access all OLTs
| - TCP connectivity check
| - Vendor-driver-based ONU synchronization
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
        throw new OltError("Invalid OLT ID.");
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
        throw new OltError("PON port count must be between 1 and 256.");
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
        throw new OltError("OLT not found or access denied.", 404);
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
                ol.name LIKE ? OR
                ol.vendor LIKE ? OR
                ol.ip LIKE ? OR
                ol.username LIKE ?
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
                          IN ('online', 'up', 'connected', 'active', '1')
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
                        IN ('online', 'up', 'connected', 'active', '1')
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
            throw new OltError("Company scope is missing.", 403);
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
        const password = String(req.body?.password ?? "") || old.password;

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

        const [deletedOnu] = await connection.execute(
            "DELETE FROM onu WHERE olt_id = ?",
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
            deleted_onu: deletedOnu.affectedRows,
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

        if (!olt.ip || !olt.port || !olt.username || !olt.password) {
            throw new OltError(
                "OLT IP, Port, Username এবং Password যাচাই করুন।",
                400
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
                `এই Vendor-এর connection test সেট করা নেই: ${vendor}`,
                400
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

        if (result === false || (result && result.success === false)) {
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
                vendor: vendor,
                ip: olt.ip,
                port: olt.port
            },
            connection_time: Date.now() - startedAt,
            device: result || {}
        });

    } catch (error) {
        console.error("[OLT CHECK]", error);

        // OLT পাওয়া গেলে এবং প্রকৃত connection test শুরু হলে
        // ব্যর্থতার status update করুন।
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
                console.error("[OLT CHECK STATUS UPDATE]", dbError);
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
| GET /api/olt/:id/onus
|--------------------------------------------------------------------------
*/

exports.listOnus = async (req, res) => {
    try {
        const id = validId(req.params.id);
        await findOlt(req, id);

        const search = clean(req.query.search, 150);

        let sql = `
            SELECT
                id,
                olt_id,
                onu_name AS name,
                onu_mac AS mac,
                onu_sn AS serial,
                pon,
                status,
                rx_power,
                tx_power,
                distance,
                voltage,
temperature,
COALESCE(updated_at, last_seen) AS last_update
            FROM onu
            WHERE olt_id = ?
        `;

        const params = [id];

        if (search) {
            sql += `
                AND (
                    onu_name LIKE ?
                    OR onu_mac LIKE ?
                    OR onu_sn LIKE ?
                    OR CAST(pon AS CHAR) LIKE ?
                )
            `;

            const like = `%${search}%`;
            params.push(like, like, like, like);
        }

        sql += " ORDER BY id DESC LIMIT 1000";

        const [rows] = await getPool().execute(sql, params);

        return res.json({
            success: true,
            total: rows.length,
            data: rows
        });
    } catch (error) {
        return jsonError(res, error);
    }
};
