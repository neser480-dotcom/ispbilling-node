
"use strict";

const mysql = require("mysql2/promise");
const {
    readLiveDdm
} = require("../../services/olt/olt-monitor.service");

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
            *
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

    // "BDCOM", "bd com", "BD-COM EPON" ...
    const isBdcom = /bd[\s_-]*com/i.test(identity);
    const isVsol = /v[-\s]?sol|vsol/i.test(identity);

    if (!isCData && !isEcom && !isBdcom && !isVsol) {
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
            events: Array.isArray(result?.events) ? result.events : [],
            modules: Array.isArray(result?.modules) ? result.modules : [],
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
    const live = await getCachedLive(olt);
    const ddmPorts = live.ports;
    const ponIds = getConfiguredPonIds(olt, ddmPorts);
    const telemetry = live.system || {};

    const onuOptical = buildOnuOpticalAverages(onuRows, ponIds);

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
        modules: Array.isArray(live.modules) ? live.modules : [],
        onuOptical,
        totalOnu: counts.total,
        onlineOnu: counts.online,
        offlineOnu: counts.offline
    };
}

/*
|--------------------------------------------------------------------------
| SAVED OLT SNAPSHOTS
|--------------------------------------------------------------------------
| The last successful OLT read is kept in memory and in the table
| olt_monitor_snapshots, so the page opens at once. A background job reads
| every OLT every 20 minutes; the Refresh button reads it on demand.
|--------------------------------------------------------------------------
*/

const SNAPSHOT_INTERVAL_MS = 20 * 60 * 1000;
const SNAPSHOT_MIN_GAP_MS = 30 * 1000;
const SNAPSHOT_STARTUP_DELAY_MS = 20 * 1000;

const snapshots = new Map();   // olt id -> { result, capturedAt }
const inflight = new Map();    // olt id -> Promise (one Telnet session per OLT)
const attempts = new Map();    // olt id -> { at, error }

let snapshotTableReady = null;

function ensureSnapshotTable() {
    if (!snapshotTableReady) {
        snapshotTableReady = getPool().query(
            "CREATE TABLE IF NOT EXISTS olt_monitor_snapshots (" +
            " olt_id INT NOT NULL PRIMARY KEY," +
            " payload LONGTEXT NOT NULL," +
            " captured_at DATETIME NOT NULL" +
            ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        ).then(() => true).catch(() => false);
    }

    return snapshotTableReady;
}

async function loadSnapshot(oltId) {
    if (snapshots.has(oltId)) return snapshots.get(oltId);

    if (!(await ensureSnapshotTable())) return null;

    try {
        const [rows] = await getPool().execute(
            "SELECT payload FROM olt_monitor_snapshots WHERE olt_id = ?",
            [oltId]
        );

        if (!rows.length) return null;

        const saved = JSON.parse(rows[0].payload);

        if (!saved || !saved.result || !saved.capturedAt) return null;

        const snap = {
            result: saved.result,
            capturedAt: Number(saved.capturedAt)
        };

        snapshots.set(oltId, snap);

        return snap;
    } catch (_) {
        return null;
    }
}

async function saveSnapshot(oltId, snap) {
    if (!(await ensureSnapshotTable())) return;

    try {
        await getPool().execute(
            "INSERT INTO olt_monitor_snapshots (olt_id, payload, captured_at) " +
            "VALUES (?, ?, NOW()) " +
            "ON DUPLICATE KEY UPDATE payload = VALUES(payload), " +
            "captured_at = VALUES(captured_at)",
            [
                oltId,
                JSON.stringify({
                    capturedAt: snap.capturedAt,
                    result: snap.result
                })
            ]
        );
    } catch (_) {
        // The memory copy is still used.
    }
}

// Reads the OLT. Only one read per OLT runs at a time; callers share it.
function refreshSnapshot(olt) {
    const id = Number(olt.id);

    if (inflight.has(id)) return inflight.get(id);

    const job = (async () => {
        const started = Date.now();

        attempts.set(id, { at: started, error: null });

        try {
            const result = await getLiveForOlt(olt);

            // Some vendors (including VSOL) provide valid PON/ONU
            // optical data without system telemetry.
            const hasPortData =
                Array.isArray(result.ports) && result.ports.length > 0;

            if (!result.system && !hasPortData) {
                attempts.set(id, {
                    at: started,
                    error: (result.warnings && result.warnings[0]) ||
                        "OLT could not be read"
                });

                return { ok: false, result };
            }

            const snap = { result, capturedAt: Date.now() };

            snapshots.set(id, snap);
            await saveSnapshot(id, snap);

            return { ok: true, snap };
        } catch (error) {
            attempts.set(id, {
                at: started,
                error: String((error && error.message) || "OLT read failed")
                    .slice(0, 200)
            });

            return { ok: false, result: null };
        } finally {
            inflight.delete(id);
        }
    })();

    inflight.set(id, job);

    return job;
}

// Saved data for a request; reads the OLT only when nothing is saved yet or
// when "force" is set (Refresh button, at most once per 30 s).
async function getSnapshot(olt, force) {
    const id = Number(olt.id);

    let snap = await loadSnapshot(id);
    let throttled = false;
    let fallback = null;

    if (!snap) {
        const outcome = await refreshSnapshot(olt);

        if (outcome.ok) {
            snap = outcome.snap;
        } else {
            fallback = outcome.result;
        }
    } else if (force) {
        if (inflight.has(id)) {
            await inflight.get(id);
            snap = snapshots.get(id) || snap;
        } else {
            const last = attempts.get(id);

            if (last && Date.now() - last.at < SNAPSHOT_MIN_GAP_MS) {
                throttled = true;
            } else {
                const outcome = await refreshSnapshot(olt);

                if (outcome.ok) snap = outcome.snap;
            }
        }
    } else if (
        Date.now() - snap.capturedAt > SNAPSHOT_INTERVAL_MS * 1.5 &&
        !inflight.has(id)
    ) {
        // Saved data is much older than expected: refresh in the background.
        refreshSnapshot(olt).catch(() => {});
    }

    const last = attempts.get(id);

    return {
        snap,
        fallback,
        throttled,
        refreshing: inflight.has(id),
        lastError: last && last.error ? last.error : null
    };
}

async function getCachedLive(olt) {
    const state = await getSnapshot(olt, false);

    if (state.snap) return state.snap.result;

    return state.fallback || {
        ports: [],
        system: null,
        events: [],
        warnings: ["OLT could not be read."]
    };
}

function supportsLiveRead(olt) {
    const identity = [olt.vendor, olt.model, olt.name]
        .join(" ")
        .toLowerCase();

    return (
        Number(olt.id) === 43 ||
        Number(olt.id) === 45 ||
        /v[-\s]?sol|cdata|c-data|e1204es|ecom|e08ep|bd[\s_-]*com/i.test(identity)
    );
}

async function refreshAllOlts() {
    try {
        const [rows] = await getPool().execute(
            "SELECT * FROM olts WHERE deleted_at IS NULL ORDER BY id ASC"
        );

        for (const olt of rows) {
            if (supportsLiveRead(olt)) {
                await refreshSnapshot(olt);
            }
        }
    } catch (_) {
        // Try again at the next interval.
    }
}

function startSnapshotJob() {
    if (global.__oltSnapshotJobStarted) return;

    global.__oltSnapshotJobStarted = true;

    const first = setTimeout(refreshAllOlts, SNAPSHOT_STARTUP_DELAY_MS);
    const timer = setInterval(refreshAllOlts, SNAPSHOT_INTERVAL_MS);

    if (first.unref) first.unref();
    if (timer.unref) timer.unref();
}

startSnapshotJob();

function nowStamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, "0");

    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
        " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

async function getOnuRows(oltId) {
    try {
        const [rows] = await getPool().execute(
            "SELECT pon, status, rx_power, tx_power, bias_current, temperature, voltage " +
            "FROM onu WHERE olt_id = ?",
            [oltId]
        );
        return rows;
    } catch (_) {
        return [];
    }
}

function buildOnuOpticalAverages(onuRows, ponIds = []) {
    const ids = ponIds.length ? ponIds : [...new Set(onuRows.map(onu => String(onu.pon || "").trim()).filter(Boolean))];
    return ids.map(id => {
        const matching = onuRows.filter(onu => ponMatches(onu.pon, id) && isOnline(onu.status));
        return {
            id,
            name: "PON " + String(id).split("/").pop(),
            onlineOnu: matching.length,
            rx: average(matching.map(onu => onu.rx_power)),
            tx: average(matching.map(onu => onu.tx_power)),
            bias: average(matching.map(onu => onu.bias_current)),
            temp: average(matching.map(onu => onu.temperature)),
            voltage: average(matching.map(onu => onu.voltage))
        };
    });
}

// Adds the real ONU totals of each PON port to the live DDM rows.
function enrichLivePorts(ports, onuRows, preferLiveCounts = false) {
    return ports.map(port => {
        // VSOL reports the ONU inventory and optical readings in the same
        // live Telnet read. Keep those counts paired with the averages.
        if (
            preferLiveCounts &&
            safeNumber(port.totalOnu) !== null &&
            safeNumber(port.onlineOnu) !== null
        ) {
            return { ...port };
        }

        const matching = onuRows.filter(
            onu => ponMatches(onu.pon, port.id)
        );

        return {
            ...port,
            totalOnu: matching.length,
            onlineOnu: matching.filter(onu => isOnline(onu.status)).length
        };
    });
}

function getLivePonOnuCounts(ports) {
    const countable = ports.filter(port =>
        safeNumber(port.totalOnu) !== null &&
        safeNumber(port.onlineOnu) !== null
    );

    if (!countable.length) return null;

    const total = countable.reduce(
        (sum, port) => sum + Number(port.totalOnu),
        0
    );
    const online = countable.reduce(
        (sum, port) => sum + Number(port.onlineOnu),
        0
    );

    return {
        total,
        online,
        offline: Math.max(0, total - online)
    };
}

function buildLiveAlarms(olt, deviceEvents, counts) {
    const time = nowStamp();
    const own = [];

    if (!isOnline(olt.status)) {
        own.push({
            time,
            event: "OLT status is " + (olt.status || "unknown"),
            source: olt.name || "OLT",
            level: "Warning"
        });
    }

    if (counts.offline > 0) {
        own.push({
            time,
            event: counts.offline + " of " + counts.total + " ONUs are offline",
            source: "ONU",
            level: "Info"
        });
    }

    return [
        ...deviceEvents.filter(item => item.derived),
        ...own,
        ...deviceEvents.filter(item => !item.derived)
    ].slice(0, 30);
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
        const force = String(req.query.refresh || "") === "1";
        const state = await getSnapshot(olt, force);

        const result = state.snap
            ? state.snap.result
            : state.fallback || {
                ports: [],
                system: null,
                events: [],
                warnings: ["OLT could not be read."]
            };

        const warnings = Array.isArray(result.warnings)
            ? [...result.warnings]
            : [];

        if (state.snap && state.lastError) {
            warnings.unshift(
                "Last OLT read failed (" + state.lastError +
                "); showing saved data."
            );
        }

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

        const onuRows = await getOnuRows(oltId);
        const isVsol = /v[-\s]?sol|vsol/i.test(
            `${olt.vendor || ""} ${olt.model || ""} ${olt.name || ""}`
        );
        const livePorts = enrichLivePorts(result.ports, onuRows, isVsol);
        const livePonCounts = isVsol
            ? getLivePonOnuCounts(livePorts)
            : null;
        const effectiveCounts = livePonCounts || onuCounts;

        return res.json({
            success: true,
            olt: {
                id: Number(olt.id),
                name: olt.name,
                vendor: olt.vendor,
                model: olt.model,
                ip: olt.ip,
                location: olt.location || null
            },
            source: "live_olt_ddm",
            ports: livePorts,
            sfpPorts: Array.isArray(result.sfpPorts) ? result.sfpPorts : [],
            system: result.system,
            modules: Array.isArray(result.modules) ? result.modules : [],
            onuOptical: buildOnuOpticalAverages(onuRows, (result.ports || []).map(port => port.id)),
            alarms: buildLiveAlarms(
                olt,
                Array.isArray(result.events) ? result.events : [],
                effectiveCounts
            ),
            totalOnu: effectiveCounts.total,
            activeOnu: effectiveCounts.online,
            offlineOnu: effectiveCounts.offline,
            captured_at: state.snap
                ? new Date(state.snap.capturedAt).toISOString()
                : null,
            refreshing: state.refreshing,
            throttled: state.throttled,
            warnings
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
                `SELECT id, olt_id, pon, status, rx_power, tx_power, bias_current, temperature, voltage
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
