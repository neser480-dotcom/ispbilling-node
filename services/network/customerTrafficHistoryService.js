"use strict";

/*
|--------------------------------------------------------------------------
| CUSTOMER TRAFFIC HISTORY SERVICE
|--------------------------------------------------------------------------
| Every minute the collector reads MikroTik PPP active users and PPPoE
| interface counters, and stores the daily Upload / Download / Session
| numbers of every customer in MySQL.  The Customer Traffic page reads
| the monthly report from these tables.
|
| Tables are created automatically (CREATE TABLE IF NOT EXISTS).
| Set TRAFFIC_COLLECTOR=off in .env to disable the collector.
|--------------------------------------------------------------------------
*/

const db = require("../../config/database");
const { RouterOSAPI } = require("routeros-client");

const POLL_MS = 60 * 1000;
const FIRST_DELAY_MS = 15 * 1000;
const LOCK_NAME = "netfee_customer_traffic_collector";
const GB = 1024 * 1024 * 1024;
const TOP_LIMIT = 20;
const CHUNK = 300;

/* ------------------------------------------------------------------ helpers */

function clean(value) {
    if (value === null || value === undefined) {
        return "";
    }
    return String(value).trim();
}

function normalize(value) {
    return clean(value).toLowerCase();
}

function pad(n) {
    return String(n).padStart(2, "0");
}

function localDay(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

function uptimeToSeconds(value) {
    const text = clean(value);
    if (!text) {
        return 0;
    }
    const get = (re) => {
        const m = text.match(re);
        return m ? Number(m[1]) : 0;
    };
    return (
        get(/(\d+)w/i) * 604800 +
        get(/(\d+)d/i) * 86400 +
        get(/(\d+)h/i) * 3600 +
        get(/(\d+)m(?!s)/i) * 60 +
        get(/(\d+)s/i)
    );
}

const ROUTER_MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

function parseRouterDateTime(value) {
    const t = clean(value);
    if (!t) {
        return null;
    }
    let m = t.match(/^([a-z]{3})\/(\d{1,2})\/(\d{4})[\sT]+(\d{1,2}):(\d{2}):(\d{2})/i);
    if (m) {
        const mo = ROUTER_MONTHS[m[1].toLowerCase()];
        if (mo === undefined) {
            return null;
        }
        return new Date(+m[3], mo, +m[2], +m[4], +m[5], +m[6]);
    }
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})[\sT]+(\d{1,2}):(\d{2}):(\d{2})/);
    if (m) {
        return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    }
    return null;
}

function toDate(value) {
    if (!value) {
        return null;
    }
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    const d = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTime(date) {
    if (!date) {
        return "—";
    }
    let h = date.getHours();
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return (
        date.getFullYear() + "/" + pad(date.getMonth() + 1) + "/" + pad(date.getDate()) +
        " " + pad(h) + ":" + pad(date.getMinutes()) + " " + ampm
    );
}

/* ------------------------------------------------------------------- tables */

let tablesPromise = null;

function ensureTables() {
    if (!tablesPromise) {
        tablesPromise = (async () => {
            await db.query(
                "CREATE TABLE IF NOT EXISTS customer_traffic_daily (" +
                " id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT," +
                " company_id BIGINT UNSIGNED NOT NULL DEFAULT 0," +
                " router_id BIGINT UNSIGNED NOT NULL DEFAULT 0," +
                " username VARCHAR(190) NOT NULL," +
                " `day` DATE NOT NULL," +
                " rx_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0," +
                " tx_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0," +
                " sessions INT UNSIGNED NOT NULL DEFAULT 0," +
                " updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
                " PRIMARY KEY (id)," +
                " UNIQUE KEY uq_ctd (router_id, username, `day`)," +
                " KEY idx_ctd_company_day (company_id, `day`)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            );
            await db.query(
                "CREATE TABLE IF NOT EXISTS customer_traffic_state (" +
                " router_id BIGINT UNSIGNED NOT NULL," +
                " username VARCHAR(190) NOT NULL," +
                " company_id BIGINT UNSIGNED NOT NULL DEFAULT 0," +
                " last_rx BIGINT UNSIGNED NOT NULL DEFAULT 0," +
                " last_tx BIGINT UNSIGNED NOT NULL DEFAULT 0," +
                " last_uptime INT UNSIGNED NOT NULL DEFAULT 0," +
                " is_active TINYINT(1) NOT NULL DEFAULT 0," +
                " last_logged_out DATETIME NULL," +
                " updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
                " PRIMARY KEY (router_id, username)," +
                " KEY idx_cts_company (company_id)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            );
        })().catch((error) => {
            tablesPromise = null;
            throw error;
        });
    }
    return tablesPromise;
}

/* ---------------------------------------------------------------- collector */

async function connectRouter(router) {
    const host = clean(router.ip);
    const user = clean(router.username);

    if (!host || !user) {
        throw new Error("MikroTik IP or username is empty.");
    }

    const API = new RouterOSAPI({
        host,
        user,
        password: String(router.password || ""),
        port: Number(router.port) || 8728,
        timeout: Number(router.timeout) || 5
    });

    await API.connect();

    return API;
}

function buildInterfaceMap(rows) {
    const map = new Map();

    for (const row of Array.isArray(rows) ? rows : []) {
        const name = clean(row.name || row["interface-name"])
            .replace(/^</, "")
            .replace(/>$/, "");

        if (!name) {
            continue;
        }

        map.set(name.toLowerCase(), {
            rx: Number(row["rx-byte"] ?? row.rxByte ?? 0) || 0,
            tx: Number(row["tx-byte"] ?? row.txByte ?? 0) || 0
        });
    }

    return map;
}

/*
 * One user, one poll.
 *   st    : saved state (or undefined if never seen)
 *   iface : { rx, tx } counters of the PPPoE interface (or undefined)
 *   upt   : current uptime in seconds
 * Interface RX = data the router received from the customer = Upload.
 * Interface TX = data the router sent to the customer = Download.
 */
function computeStep(st, iface, upt) {
    const curRx = iface ? iface.rx : null;
    const curTx = iface ? iface.tx : null;

    let rx = 0;
    let tx = 0;
    let sessions = 0;
    let isNew = false;

    if (!st) {
        isNew = true;

        if (upt <= 90) {
            if (iface) {
                rx = curRx;
                tx = curTx;
            }
            sessions = 1;
        }
    } else if (
        !st.is_active ||
        upt < Number(st.last_uptime || 0) ||
        (iface && (curRx < Number(st.last_rx || 0) || curTx < Number(st.last_tx || 0)))
    ) {
        sessions = 1;

        if (iface) {
            rx = curRx;
            tx = curTx;
        }
    } else if (iface) {
        rx = curRx - Number(st.last_rx || 0);
        tx = curTx - Number(st.last_tx || 0);
    }

    return {
        rx: Math.max(0, rx),
        tx: Math.max(0, tx),
        sessions,
        isNew,
        lastRx: iface ? curRx : (st ? Number(st.last_rx || 0) : 0),
        lastTx: iface ? curTx : (st ? Number(st.last_tx || 0) : 0)
    };
}

async function upsertChunks(sqlHead, sqlTail, rows) {
    for (let i = 0; i < rows.length; i += CHUNK) {
        await db.query(sqlHead + " VALUES ? " + sqlTail, [rows.slice(i, i + CHUNK)]);
    }
}

async function pollRouter(router, now) {
    const routerId = Number(router.id) || 0;
    const companyId = Number(router.company_id) || 0;
    const day = localDay(now);

    let API = null;
    let activeRows = [];
    let ifaceRows = [];
    let secrets = null;
    let states = new Map();

    try {
        API = await connectRouter(router);

        activeRows = await API.write("/ppp/active/print");
        ifaceRows = await API.write("/interface/print", ["=stats=", "?type=pppoe-in"]);

        const [saved] = await db.query(
            "SELECT username, last_rx, last_tx, last_uptime, is_active " +
            "FROM customer_traffic_state WHERE router_id = ?",
            [routerId]
        );

        for (const row of saved) {
            states.set(normalize(row.username), row);
        }

        const hasNew = (Array.isArray(activeRows) ? activeRows : []).some((a) => {
            const key = normalize(a.name);
            return key && !states.has(key);
        });

        if (hasNew) {
            try {
                const rows = await API.write("/ppp/secret/print");
                secrets = new Map();
                for (const row of Array.isArray(rows) ? rows : []) {
                    const when = parseRouterDateTime(row["last-logged-out"]);
                    if (when) {
                        secrets.set(normalize(row.name), when);
                    }
                }
            } catch (error) {
                secrets = null;
            }
        }
    } finally {
        if (API) {
            try { await API.close(); } catch (error) { /* ignore */ }
        }
    }

    const ifaces = buildInterfaceMap(ifaceRows);
    const activeKeys = new Set();
    const dailyRows = [];
    const stateRows = [];

    for (const active of Array.isArray(activeRows) ? activeRows : []) {
        const name = clean(active.name);
        const key = normalize(name);

        if (!key || activeKeys.has(key)) {
            continue;
        }

        activeKeys.add(key);

        const upt = uptimeToSeconds(active.uptime);
        const iface = ifaces.get("pppoe-" + key);
        const step = computeStep(states.get(key), iface, upt);

        if (step.rx || step.tx || step.sessions) {
            dailyRows.push([companyId, routerId, name, day, step.rx, step.tx, step.sessions]);
        }

        stateRows.push([
            routerId,
            name,
            companyId,
            step.lastRx,
            step.lastTx,
            upt,
            1,
            step.isNew && secrets ? (secrets.get(key) || null) : null
        ]);
    }

    const gone = [];

    for (const [key, st] of states) {
        if (Number(st.is_active) === 1 && !activeKeys.has(key)) {
            gone.push(st.username);
        }
    }

    await upsertChunks(
        "INSERT INTO customer_traffic_daily (company_id, router_id, username, `day`, rx_bytes, tx_bytes, sessions)",
        "ON DUPLICATE KEY UPDATE rx_bytes = rx_bytes + VALUES(rx_bytes), " +
        "tx_bytes = tx_bytes + VALUES(tx_bytes), sessions = sessions + VALUES(sessions)",
        dailyRows
    );

    await upsertChunks(
        "INSERT INTO customer_traffic_state (router_id, username, company_id, last_rx, last_tx, last_uptime, is_active, last_logged_out)",
        "ON DUPLICATE KEY UPDATE company_id = VALUES(company_id), last_rx = VALUES(last_rx), " +
        "last_tx = VALUES(last_tx), last_uptime = VALUES(last_uptime), is_active = 1",
        stateRows
    );

    for (let i = 0; i < gone.length; i += CHUNK) {
        await db.query(
            "UPDATE customer_traffic_state SET is_active = 0, last_logged_out = ? " +
            "WHERE router_id = ? AND username IN (?)",
            [now, routerId, gone.slice(i, i + CHUNK)]
        );
    }

    return {
        active: activeKeys.size,
        daily: dailyRows.length,
        gone: gone.length
    };
}

let lockConn = null;
let running = false;
const lastErrorLog = new Map();

async function acquireLock() {
    try {
        if (!lockConn) {
            lockConn = await db.getConnection();
        }

        const [rows] = await lockConn.query("SELECT GET_LOCK(?, 0) AS l", [LOCK_NAME]);

        if (Number(rows[0] && rows[0].l) === 1) {
            return true;
        }

        lockConn.release();
        lockConn = null;
        return false;
    } catch (error) {
        if (lockConn) {
            try { lockConn.destroy(); } catch (e) { /* ignore */ }
            lockConn = null;
        }
        return false;
    }
}

function logRouterError(router, error) {
    const key = String(router.id);
    const last = lastErrorLog.get(key) || 0;

    if (Date.now() - last < 30 * 60 * 1000) {
        return;
    }

    lastErrorLog.set(key, Date.now());

    console.error(
        "[trafficCollector] router #" + router.id + " (" + (router.name || router.ip) + "):",
        error && error.message ? error.message : error
    );
}

async function tick() {
    if (running) {
        return;
    }

    running = true;

    try {
        await ensureTables();

        if (!(await acquireLock())) {
            return;
        }

        const [routers] = await db.query(
            "SELECT id, company_id, name, ip, port, username, password, timeout FROM mikrotik_servers"
        );

        const now = new Date();

        await Promise.all(
            routers.map((router) =>
                pollRouter(router, now).catch((error) => logRouterError(router, error))
            )
        );
    } catch (error) {
        console.error("[trafficCollector] tick failed:", error && error.message ? error.message : error);
    } finally {
        running = false;
    }
}

function startCollector() {
    if (
        globalThis.__netfeeTrafficCollector ||
        String(process.env.TRAFFIC_COLLECTOR || "").toLowerCase() === "off" ||
        process.env.NODE_ENV === "test"
    ) {
        return;
    }

    globalThis.__netfeeTrafficCollector = true;

    const first = setTimeout(() => {
        tick();
        const timer = setInterval(tick, POLL_MS);
        if (timer.unref) { timer.unref(); }
    }, FIRST_DELAY_MS);

    if (first.unref) { first.unref(); }
}

/* ------------------------------------------------------------------- report */

function monthRange(value) {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1;

    const m = String(value || "").match(/^(\d{4})-(\d{2})$/);

    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
        year = Number(m[1]);
        month = Number(m[2]);
    }

    const days = new Date(year, month, 0).getDate();
    const key = year + "-" + pad(month);

    return { key, first: key + "-01", last: key + "-" + pad(days), days };
}

async function getMonthlyTraffic({ companyId, role, month }) {
    await ensureTables();

    const isSuper = role === "super_admin";
    const range = monthRange(month);
    const scope = isSuper ? "1 = 1" : "company_id = ?";
    const scopeParams = isSuper ? [] : [companyId];

    const [dayRows] = await db.query(
        "SELECT DATE_FORMAT(`day`, '%Y-%m-%d') AS d, SUM(rx_bytes) AS rx, SUM(tx_bytes) AS tx " +
        "FROM customer_traffic_daily WHERE " + scope + " AND `day` BETWEEN ? AND ? GROUP BY `day`",
        [...scopeParams, range.first, range.last]
    );

    const perDay = new Map();

    for (const row of dayRows) {
        perDay.set(String(row.d), {
            upload: Number(row.rx) || 0,
            download: Number(row.tx) || 0
        });
    }

    const chart = [];
    let totalUp = 0;
    let totalDown = 0;

    for (let day = 1; day <= range.days; day++) {
        const hit = perDay.get(range.key + "-" + pad(day)) || { upload: 0, download: 0 };

        totalUp += hit.upload;
        totalDown += hit.download;

        chart.push({
            day,
            upload_gb: Number((hit.upload / GB).toFixed(2)),
            download_gb: Number((hit.download / GB).toFixed(2))
        });
    }

    const [top] = await db.query(
        "SELECT username, SUM(rx_bytes) AS rx, SUM(tx_bytes) AS tx, SUM(sessions) AS sessions " +
        "FROM customer_traffic_daily WHERE " + scope + " AND `day` BETWEEN ? AND ? " +
        "GROUP BY username ORDER BY tx DESC LIMIT " + TOP_LIMIT,
        [...scopeParams, range.first, range.last]
    );

    const customers = [];

    if (top.length) {
        const names = top.map((row) => normalize(row.username));
        const rawNames = top.map((row) => row.username);

        const [found] = await db.query(
            "SELECT c.customer_id, c.name, c.pppoe_username, c.package_name " +
            "FROM customers c WHERE LOWER(TRIM(c.pppoe_username)) IN (?)" +
            (isSuper ? "" : " AND c.company_id = ?"),
            isSuper ? [names] : [names, companyId]
        );

        const byName = new Map();

        for (const row of found) {
            byName.set(normalize(row.pppoe_username), row);
        }

        const [logouts] = await db.query(
            "SELECT username, MAX(last_logged_out) AS lo FROM customer_traffic_state " +
            "WHERE username IN (?)" + (isSuper ? "" : " AND company_id = ?") + " GROUP BY username",
            isSuper ? [rawNames] : [rawNames, companyId]
        );

        const logoutMap = new Map();

        for (const row of logouts) {
            logoutMap.set(normalize(row.username), toDate(row.lo));
        }

        for (const row of top) {
            const key = normalize(row.username);
            const customer = byName.get(key) || null;
            const lo = logoutMap.get(key) || null;

            customers.push({
                customer_id: customer ? clean(customer.customer_id) : "",
                name: customer ? clean(customer.name) || row.username : row.username,
                username: row.username,
                package: customer ? clean(customer.package_name) || "PPPoE" : "PPPoE",
                upload_bytes: Number(row.rx) || 0,
                download_bytes: Number(row.tx) || 0,
                sessions: Number(row.sessions) || 0,
                last_logged_out: lo ? formatDateTime(lo) : "—",
                last_logged_out_ts: lo ? lo.getTime() : 0
            });
        }
    }

    return {
        success: true,
        month: range.key,
        days: range.days,
        chart,
        totals: {
            upload_gb: Number((totalUp / GB).toFixed(2)),
            download_gb: Number((totalDown / GB).toFixed(2))
        },
        customers
    };
}

startCollector();

module.exports = {
    getMonthlyTraffic,
    startCollector,
    _test: { computeStep, pollRouter, uptimeToSeconds, parseRouterDateTime, monthRange, tick }
};
