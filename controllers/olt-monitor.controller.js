
"use strict";

const mysql = require("mysql2/promise");
const {
    readLiveDdm
} = require("../services/olt-monitor.service");

let pool;

function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.DB_HOST || "localhost",
            user: process.env.DB_USER || "root",
            password: process.env.DB_PASSWORD || "",
            database: process.env.DB_NAME || "ispbilling",
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0,
            charset: "utf8mb4"
        });
    }

    return pool;
}

function isSuperAdmin(req) {
    return String(
        req.session?.role || req.user?.role || ""
    ).toLowerCase() === "super_admin";
}

function getCompanyId(req) {
    const value = Number(
        req.session?.company_id ?? req.user?.company_id
    );

    return Number.isInteger(value) && value > 0
        ? value
        : null;
}

function isOnline(value) {
    return [
        "online",
        "up",
        "connected",
        "active",
        "1"
    ].includes(String(value ?? "").trim().toLowerCase());
}

function countValue(value) {
    const match = String(value ?? "").match(/\d+/);
    return match ? Number(match[0]) : 0;
}

function safeNumber(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function normalizePon(value) {
    return String(value ?? "")
        .trim()
        .replace(/^epon\s*/i, "")
        .replace(/^0\//, "");
}

function ponMatches(a, b) {
    const left = normalizePon(a);
    const right = normalizePon(b);

    if (!left || !right) return false;

    return left === right ||
        left.endsWith(right) ||
        right.endsWith(left);
}

async function getScopedOlts(req, selectedId) {
    const superAdmin = isSuperAdmin(req);
    const companyId = getCompanyId(req);

    if (!superAdmin && !companyId) {
        const error = new Error(
            "Company scope is unavailable."
        );
        error.status = 403;
        throw error;
    }

    const conditions = ["deleted_at IS NULL"];
    const params = [];

    if (!superAdmin) {
        conditions.push("company_id = ?");
        params.push(companyId);
    }

    if (selectedId) {
        conditions.push("id = ?");
        params.push(selectedId);
    }

    const [rows] = await getPool().execute(
        `SELECT
            id, company_id, name, vendor, model, ip, port,
            username, password, status, pon_ports, cpu, memory,
            temperature, uptime, onu_total, onu_online,
            onu_offline, last_check
         FROM olts
         WHERE ${conditions.join(" AND ")}
         ORDER BY id ASC`,
        params
    );

    return rows;
}

async function getOnuCounts(oltIds) {
    const counts = new Map();

    for (const id of oltIds) {
        counts.set(Number(id), {
            total: 0,
            online: 0,
            offline: 0
        });
    }

    if (!oltIds.length) return counts;

    const placeholders = oltIds.map(() => "?").join(",");

    const [rows] = await getPool().execute(
        `SELECT
            olt_id,
            COUNT(*) AS total,
            SUM(
                CASE
                    WHEN LOWER(COALESCE(status, '')) IN (
                        'online', 'up', 'connected', 'active', '1'
                    )
                    THEN 1 ELSE 0
                END
            ) AS online_count
         FROM onu
         WHERE olt_id IN (${placeholders})
         GROUP BY olt_id`,
        oltIds
    );

    for (const row of rows) {
        const total = Number(row.total) || 0;
        const online = Number(row.online_count) || 0;

        counts.set(Number(row.olt_id), {
            total,
            online,
            offline: Math.max(0, total - online)
        });
    }

    return counts;
}

async function getRecentOnus(oltIds, limit = 10) {
    if (!oltIds.length) return [];

    const placeholders = oltIds.map(() => "?").join(",");
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));

    const [rows] = await getPool().execute(
        `SELECT
            o.*,
            ol.name AS olt_name,
            c.customer_id AS customer_code,
            c.name AS customer_name,
            c.phone AS customer_phone,
            c.pppoe_username
         FROM onu o
         LEFT JOIN olts ol ON ol.id = o.olt_id
         LEFT JOIN customers c ON c.id = o.customer_id
         WHERE o.olt_id IN (${placeholders})
         ORDER BY o.id DESC
         LIMIT ${safeLimit}`,
        oltIds
    );

    return rows.map(row => ({
        id: row.id,
        olt_id: row.olt_id,
        olt_name: row.olt_name || "—",
        pon: row.pon ?? "—",
        name: row.customer_name || row.name || row.onu_name || "Unknown ONU",
        customer_name: row.customer_name || "—",
        customer_code: row.customer_code || "—",
        phone: row.customer_phone || "—",
        pppoe_username: row.pppoe_username || "—",
        mac: row.onu_mac || row.mac || "—",
        serial: row.serial_number || row.serial || "—",
        status: row.status || "unknown",
        rxPower: safeNumber(row.rx_power ?? row.rx_power_dbm ?? row.rx),
        ip_address: row.ip_address || "—"
    }));
}

function buildSummary(olts, counts, livePorts) {
    const totalOlt = olts.length;

    const onlineOlt = olts.filter(
        olt => isOnline(olt.status)
    ).length;

    const totalOnu = olts.reduce(
        (sum, olt) => sum + (counts.get(Number(olt.id))?.total || 0),
        0
    );

    const onlineOnu = olts.reduce(
        (sum, olt) => sum + (counts.get(Number(olt.id))?.online || 0),
        0
    );

    const totalPon = olts.reduce(
        (sum, olt) => sum + countValue(olt.pon_ports),
        0
    );

    const activePon = livePorts.filter(
        port => port.status === "ok" || port.status === "partial"
    ).length;

    const rxValues = livePorts
        .map(port => safeNumber(port.avgRx ?? port.rxPower ?? port.rx))
        .filter(value => value !== null);

    const avgRxPower = rxValues.length
        ? Number((
            rxValues.reduce((sum, value) => sum + value, 0) /
            rxValues.length
        ).toFixed(2))
        : null;

    return {
        totalOlt,
        onlineOlt,
        offlineOlt: Math.max(0, totalOlt - onlineOlt),
        totalPon,
        activePon,
        inactivePon: Math.max(0, totalPon - activePon),
        totalOnu,
        onlineOnu,
        offlineOnu: Math.max(0, totalOnu - onlineOnu),
        avgRxPower
    };
}

async function getLiveForOlt(olt) {
    const identity = [
        olt.vendor,
        olt.model,
        olt.name
    ].join(" ").toLowerCase();

    const isCData =
        Number(olt.id) === 43 ||
        /cdata|c-data|e1204es/i.test(identity);

    const isEcom =
        Number(olt.id) === 45 ||
        /ecom|e08ep/i.test(identity);

    if (!isCData && !isEcom) {
        return {
            ports: [],
            system: null,
            warnings: [`Live DDM is not supported for OLT ${olt.id}.`]
        };
    }

    try {
        const result = await readLiveDdm(olt);

        return {
            ports: Array.isArray(result?.ports) ? result.ports : [],
            system: result?.system || null,
            warnings: Array.isArray(result?.warnings) ? result.warnings : []
        };
    } catch (error) {
        return {
            ports: [],
            system: null,
            warnings: [
                String(error?.message || "Unable to read live DDM").slice(0, 200)
            ]
        };
    }
}

function getConfiguredPonIds(olt, livePorts = []) {
    const actualPorts = [...new Set(
        livePorts
            .map(port => String(port.id || "").trim())
            .filter(Boolean)
    )];

    if (actualPorts.length) return actualPorts;

    const rawCount = String(olt.pon_ports ?? "").trim();

    if (rawCount.startsWith("[")) {
        try {
            const parsed = JSON.parse(rawCount);

            if (Array.isArray(parsed)) {
                const ids = parsed.map(item => {
                    if (typeof item === "string") return item;
                    return String(item?.id || item?.name || "");
                }).filter(Boolean);

                if (ids.length) return ids;
            }
        } catch (_) {
            // Continue to numeric fallback.
        }
    }

    const count = countValue(rawCount);
    if (!count) return [];

    const identity = `${olt.vendor || ""} ${olt.model || ""} ${olt.name || ""}`;

    if (
        (Number(olt.id) === 45 || /ecom|e08ep/i.test(identity)) &&
        count <= 8
    ) {
        const ids = [];

        for (let i = 1; i <= Math.min(count, 4); i++) {
            ids.push(`0/1/${i}`);
        }

        for (let i = 1; i <= Math.max(0, count - 4); i++) {
            ids.push(`0/2/${i}`);
        }

        return ids;
    }

    if (Number(olt.id) === 43 || /e1204es/i.test(identity)) {
        return ["0/0/1", "0/0/2", "0/0/3", "0/0/4"].slice(
            0,
            Math.min(count, 4)
        );
    }

    return [];
}

function average(values) {
    const valid = values
        .map(safeNumber)
        .filter(value => value !== null);

    return valid.length
        ? Number((
            valid.reduce((sum, value) => sum + value, 0) /
            valid.length
        ).toFixed(2))
        : null;
}

async function getSelectedOltData(olt, counts, onuRows) {
    const live = await getLiveForOlt(olt);
    const ddmPorts = live.ports;
    const ponIds = getConfiguredPonIds(olt, ddmPorts);
    const telemetry = live.system || {};

    const ports = ponIds.map(id => {
        const ddm = ddmPorts.find(
            port => String(port.id) === String(id)
        ) || {};

        const matchingOnus = onuRows.filter(
            onu => ponMatches(onu.pon, id)
        );

        return {
            id,
            name: ddm.name || id,
            status: ddm.status || "unavailable",
            totalOnu: matchingOnus.length,
            onlineOnu: matchingOnus.filter(
                onu => isOnline(onu.status)
            ).length,
            rxPower: safeNumber(ddm.rx),
            avgRx: safeNumber(ddm.rx),
            avgTx: safeNumber(ddm.tx),
            temp: safeNumber(ddm.temp),
            voltage: safeNumber(ddm.voltage),
            bias: safeNumber(ddm.bias),
            missing_fields: ddm.missing_fields || []
        };
    });

    const systemStatus = {
        ...telemetry,

        temp:
            safeNumber(telemetry.temperatureC) ??
            average(ddmPorts.map(port => port.temp)) ??
            safeNumber(olt.temperature),

        voltage:
            safeNumber(telemetry.voltageChannel0) ??
            safeNumber(telemetry.voltage) ??
            average(ddmPorts.map(port => port.voltage)),

        cpu:
            safeNumber(telemetry.cpuUtilizationPercent) ??
            safeNumber(olt.cpu),

        ram:
            safeNumber(telemetry.memoryUtilizationPercent) ??
            safeNumber(olt.memory),

        fan: telemetry.fan || null,

        uptime: telemetry.uptime || olt.uptime || null
    };

    const warnings = [...live.warnings];

    if (!ponIds.length) {
        warnings.push("PON port configuration is unavailable for this OLT.");
    }

    return {
        olt: {
            id: Number(olt.id),
            name: olt.name,
            vendor: olt.vendor,
            model: olt.model,
            ip: olt.ip
        },
        ports,
        warnings,
        systemStatus,
        totalOnu: counts.total,
        onlineOnu: counts.online,
        offlineOnu: counts.offline
    };
}

exports.live = async function (req, res, next) {
    try {
        const rawId = String(req.query.olt_id || "");

        if (!/^\d+$/.test(rawId) || Number(rawId) < 1) {
            return res.status(400).json({
                success: false,
                message: "Valid olt_id is required."
            });
        }

        const oltId = Number(rawId);
        const rows = await getScopedOlts(req, oltId);

        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message: "OLT not found in your company."
            });
        }

        const olt = rows[0];
        const result = await getLiveForOlt(olt);
        const countsMap = await getOnuCounts([oltId]);

        const onuCounts = countsMap.get(oltId) || {
            total: 0,
            online: 0,
            offline: 0
        };

        res.set(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, private"
        );

        return res.json({
            success: true,
            olt: {
                id: Number(olt.id),
                name: olt.name,
                vendor: olt.vendor,
                model: olt.model,
                ip: olt.ip
            },
            source: "live_olt_ddm",
            ports: result.ports,
            system: result.system,
            totalOnu: onuCounts.total,
            activeOnu: onuCounts.online,
            offlineOnu: onuCounts.offline,
            warnings: result.warnings
        });
    } catch (error) {
        return next(error);
    }
};

exports.dashboard = async function (req, res, next) {
    try {
        const rawId = String(req.query.olt_id || "");
        let selectedId = null;

        if (rawId) {
            if (!/^\d+$/.test(rawId) || Number(rawId) < 1) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid olt_id."
                });
            }

            selectedId = Number(rawId);
        }

        const olts = await getScopedOlts(req, selectedId);
        const oltIds = olts.map(olt => Number(olt.id));
        const counts = await getOnuCounts(oltIds);
        const recentOnus = await getRecentOnus(oltIds, 10);

        const selectedOlt = selectedId
            ? olts.find(olt => Number(olt.id) === selectedId) || null
            : olts[0] || null;

        let selectedData = null;

        if (selectedOlt) {
            const selectedCounts = counts.get(Number(selectedOlt.id)) || {
                total: 0,
                online: 0,
                offline: 0
            };

            const [onuRows] = await getPool().execute(
                `SELECT id, olt_id, pon, status
                 FROM onu
                 WHERE olt_id = ?
                 ORDER BY id DESC`,
                [selectedOlt.id]
            );

            selectedData = await getSelectedOltData(
                selectedOlt,
                selectedCounts,
                onuRows
            );
        }

        const livePorts = selectedData?.ports || [];
        const summary = buildSummary(olts, counts, livePorts);

        const alarms = olts
            .filter(olt => !isOnline(olt.status))
            .map(olt => ({
                severity: "warning",
                message: `OLT ${olt.name} status is ${olt.status || "unknown"}`,
                olt_id: Number(olt.id)
            }));

        const data = {
            summary,

            olts: olts.map(olt => {
                const count = counts.get(Number(olt.id)) || {
                    total: 0,
                    online: 0,
                    offline: 0
                };

                return {
                    id: Number(olt.id),
                    name: olt.name,
                    ip: olt.ip,
                    vendor: olt.vendor,
                    model: olt.model,
                    status: olt.status || "unknown",
                    totalPon: countValue(olt.pon_ports),
                    totalOnu: count.total,
                    onlineOnu: count.online,
                    offlineOnu: count.offline,
                    last_check: olt.last_check
                };
            }),

            alarms,

            selectedOlt: selectedData ? {
                id: Number(selectedOlt.id),
                name: selectedOlt.name,
                ip: selectedOlt.ip,
                status: selectedOlt.status || "unknown",
                totalPon: countValue(selectedOlt.pon_ports),
                totalOnu: selectedData.totalOnu,
                onlineOnu: selectedData.onlineOnu,
                offlineOnu: selectedData.offlineOnu,
                uptime: selectedData.systemStatus.uptime || "—",
                ports: selectedData.ports
            } : null,

            systemStatus: selectedData?.systemStatus || {
                temp: null,
                voltage: null,
                cpu: null,
                ram: null,
                fan: null,
                uptime: null
            },

            recentOnus
        };

        res.set(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, private"
        );

        return res.json({
            success: true,
            data,
            captured_at: new Date().toISOString(),
            warnings: selectedData?.warnings || []
        });
    } catch (error) {
        return next(error);
    }
};
