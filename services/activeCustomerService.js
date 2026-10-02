"use strict";

const db = require("../config/database");
const { RouterOSAPI } = require("routeros-client");

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function clean(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function normalizeUsername(value) {
    return clean(value).toLowerCase();
}

function formatTrafficBytes(bytes) {
    const value = Number(bytes) || 0;

    if (value <= 0) {
        return "0 MB";
    }

    if (value >= 1024 * 1024 * 1024) {
        return (
            (value / (1024 * 1024 * 1024)).toFixed(2) +
            " GB"
        );
    }

    return (
        (value / (1024 * 1024)).toFixed(2) +
        " MB"
    );
}

function bytesToGB(bytes) {
    return (
        (Number(bytes) || 0) /
        (1024 * 1024 * 1024)
    );
}

function bytesToMbps(bytes, seconds) {
    const b = Number(bytes) || 0;
    const s = Number(seconds) || 0;

    if (s <= 0) {
        return 0;
    }

    return (b * 8) / s / 1000000;
}

function uptimeToSeconds(value) {
    const text = clean(value);

    if (!text) {
        return 0;
    }

    let total = 0;

    const weeks =
        text.match(/(\d+)w/i);

    const days =
        text.match(/(\d+)d/i);

    const hours =
        text.match(/(\d+)h/i);

    const minutes =
        text.match(/(\d+)m/i);

    const seconds =
        text.match(/(\d+)s/i);

    if (weeks) {
        total += Number(weeks[1]) * 7 * 24 * 3600;
    }

    if (days) {
        total += Number(days[1]) * 24 * 3600;
    }

    if (hours) {
        total += Number(hours[1]) * 3600;
    }

    if (minutes) {
        total += Number(minutes[1]) * 60;
    }

    if (seconds) {
        total += Number(seconds[1]);
    }

    return total;
}

function formatDuration(seconds) {
    let value = Number(seconds) || 0;

    if (value <= 0) {
        return "—";
    }

    const days =
        Math.floor(value / 86400);

    value %= 86400;

    const hours =
        Math.floor(value / 3600);

    value %= 3600;

    const minutes =
        Math.floor(value / 60);

    const secs =
        value % 60;

    const parts = [];

    if (days) {
        parts.push(`${days}d`);
    }

    if (hours) {
        parts.push(`${hours}h`);
    }

    if (minutes) {
        parts.push(`${minutes}m`);
    }

    if (secs || parts.length === 0) {
        parts.push(`${secs}s`);
    }

    return parts.join(" ");
}

function parseRouterDateTime(value) {
    const text = clean(value);

    if (!text) {
        return null;
    }

    const timestamp =
        Date.parse(text.replace(" ", "T"));

    if (!Number.isNaN(timestamp)) {
        return new Date(timestamp);
    }

    return null;
}

function formatDateTime(date) {
    if (!date) {
        return "—";
    }

    return date.toLocaleString("en-GB", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function extractPppoeUsername(value) {
    const text = clean(value);

    if (!text) {
        return "";
    }

    return text
        .replace(/^pppoe-/i, "")
        .trim();
}

function getRouterField(router, field, fallback = "") {
    if (
        router &&
        router[field] !== undefined &&
        router[field] !== null
    ) {
        return router[field];
    }

    return fallback;
}

/*
|--------------------------------------------------------------------------
| COMPANY SCOPE
|--------------------------------------------------------------------------
*/

function customerScope(user) {
    if (user.role === "super_admin") {
        return {
            sql: "1=1",
            params: []
        };
    }

    return {
        sql: "c.company_id = ?",
        params: [user.companyId]
    };
}

function routerScope(user) {
    if (user.role === "super_admin") {
        return {
            sql: "1=1",
            params: []
        };
    }

    return {
        sql: "company_id = ?",
        params: [user.companyId]
    };
}

/*
|--------------------------------------------------------------------------
| ROUTERS
|--------------------------------------------------------------------------
*/

async function getRouters(user) {
    const scope =
        routerScope(user);

    const [rows] =
        await db.execute(
            `
            SELECT
                id,
                name,
                ip,
                port,
                username,
                use_ssl,
                timeout
            FROM mikrotik_servers
            WHERE ${scope.sql}
            ORDER BY id ASC
            `,
            scope.params
        );

    return rows;
}

/*
|--------------------------------------------------------------------------
| SELECT ROUTER
|--------------------------------------------------------------------------
*/

async function getRouter(user, routerId) {
    const scope =
        routerScope(user);

    if (routerId > 0) {
        const [rows] =
            await db.execute(
                `
                SELECT *
                FROM mikrotik_servers
                WHERE id = ?
                AND ${scope.sql}
                LIMIT 1
                `,
                [routerId, ...scope.params]
            );

        return rows[0] || null;
    }

    const [rows] =
        await db.execute(
            `
            SELECT *
            FROM mikrotik_servers
            WHERE ${scope.sql}
            ORDER BY id ASC
            LIMIT 1
            `,
            scope.params
        );

    return rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| CUSTOMERS
|--------------------------------------------------------------------------
|
| Offline detection:
| DB PPPoE users - MikroTik active PPPoE users
|
*/

async function getCustomers(user) {
    const scope =
        customerScope(user);

    const [rows] =
        await db.execute(
            `
            SELECT
                c.customer_id,
                c.name,
                c.address,
                c.phone,
                c.pppoe_username,
                c.package_name,
                c.monthly_bill,
                c.area_id,
                c.sub_area_id,
                c.company_id
            FROM customers c
            WHERE ${scope.sql}
            AND c.pppoe_username IS NOT NULL
            AND TRIM(c.pppoe_username) <> ''
            ORDER BY c.name ASC
            `,
            scope.params
        );

    return rows;
}

/*
|--------------------------------------------------------------------------
| MIKROTIK CONNECT
|--------------------------------------------------------------------------
*/

async function connectRouter(router) {
    const host =
        clean(getRouterField(router, "ip"));

    const user =
        clean(getRouterField(router, "username"));

    const password =
        getRouterField(router, "password", "");

    const port =
        Number(
            getRouterField(router, "port", 8728)
        ) || 8728;

    const timeout =
        Number(
            getRouterField(router, "timeout", 5)
        ) || 5;

    if (!host) {
        throw new Error(
            "MikroTik router IP is empty."
        );
    }

    if (!user) {
        throw new Error(
            "MikroTik username is empty."
        );
    }

    const API =
        new RouterOSAPI({
            host,
            user,
            password: String(password || ""),
            port,
            timeout
        });

    await API.connect();

    return API;
}

/*
|--------------------------------------------------------------------------
| ACTIVE USERS
|--------------------------------------------------------------------------
*/

async function getActiveUsers(API) {
    const result =
        await API.write(
            "/ppp/active/print"
        );

    return Array.isArray(result)
        ? result
        : [];
}

/*
|--------------------------------------------------------------------------
| PPP SECRET / PACKAGE
|--------------------------------------------------------------------------
*/

async function getSecrets(API) {
    const result =
        await API.write(
            "/ppp/secret/print"
        );

    return Array.isArray(result)
        ? result
        : [];
}

/*
|--------------------------------------------------------------------------
| INTERFACE TRAFFIC
|--------------------------------------------------------------------------
*/

async function getInterfaceTraffic(API) {
    const result =
        await API.write(
            "/interface/print",
            ["?type=pppoe-in"]
        );

    return Array.isArray(result)
        ? result
        : [];
}

/*
|--------------------------------------------------------------------------
| TRAFFIC MAP
|--------------------------------------------------------------------------
*/

function buildInterfaceMap(rows) {
    const map = new Map();

    for (const row of rows) {
        const name =
            clean(
                row.name ||
                row["interface-name"]
            );

        if (!name) {
            continue;
        }

        const rx =
            Number(
                row["rx-byte"] ??
                row.rx_bytes ??
                0
            ) || 0;

        const tx =
            Number(
                row["tx-byte"] ??
                row.tx_bytes ??
                0
            ) || 0;

        map.set(
            name.toLowerCase(),
            {
                rx,
                tx
            }
        );
    }

    return map;
}

/*
|--------------------------------------------------------------------------
| PACKAGE MAP
|--------------------------------------------------------------------------
*/

function buildSecretPackageMap(rows) {
    const map = new Map();

    for (const row of rows) {
        const name =
            clean(row.name);

        if (!name) {
            continue;
        }

        const profile =
            clean(
                row.profile
            ) || "PPPoE";

        map.set(
            normalizeUsername(name),
            profile
        );
    }

    return map;
}

/*
|--------------------------------------------------------------------------
| FILTER MATCH
|--------------------------------------------------------------------------
*/

function matchFilter(
    customer,
    packageFilter,
    areaFilter,
    subAreaFilter
) {
    if (
        packageFilter &&
        clean(customer.package_name).toLowerCase() !==
            packageFilter.toLowerCase()
    ) {
        return false;
    }

    if (
        areaFilter &&
        String(customer.area_id || "") !==
            String(areaFilter)
    ) {
        return false;
    }

    if (
        subAreaFilter &&
        String(customer.sub_area_id || "") !==
            String(subAreaFilter)
    ) {
        return false;
    }

    return true;
}

/*
|--------------------------------------------------------------------------
| BUILD ACTIVE ROW
|--------------------------------------------------------------------------
*/

function buildActiveRow({
    active,
    customer,
    packageMap,
    interfaceMap,
    trafficMap2,
    trafficMap1,
    sampleSeconds
}) {
    const username =
        clean(active.name);

    const normalized =
        normalizeUsername(username);

    const address =
        clean(active.address);

    const callerId =
        clean(
            active["caller-id"] ||
            active.caller_id
        );

    const uptime =
        clean(active.uptime);

    const interfaceName =
        `pppoe-${username}`;

    const interfaceKey =
        interfaceName.toLowerCase();

    const first =
        trafficMap1.get(interfaceKey) || {
            rx: 0,
            tx: 0
        };

    const second =
        trafficMap2.get(interfaceKey) || {
            rx: 0,
            tx: 0
        };

    let rxBytes =
        second.rx || first.rx || 0;

    let txBytes =
        second.tx || first.tx || 0;

    /*
    |--------------------------------------------------------------------------
    | If PPP interface traffic was not found,
    | use active record counters where available.
    |--------------------------------------------------------------------------
    */

    if (!rxBytes) {
        rxBytes =
            Number(
                active["rx-byte"] ??
                active["rx_bytes"] ??
                0
            ) || 0;
    }

    if (!txBytes) {
        txBytes =
            Number(
                active["tx-byte"] ??
                active["tx_bytes"] ??
                0
            ) || 0;
    }

    const downloadMbps =
        bytesToMbps(
            Math.max(0, second.rx - first.rx),
            sampleSeconds
        );

    const uploadMbps =
        bytesToMbps(
            Math.max(0, second.tx - first.tx),
            sampleSeconds
        );

    const packageName =
        packageMap.get(normalized) ||
        clean(active.service) ||
        clean(customer?.package_name) ||
        "PPPoE";

    const uptimeSeconds =
        uptimeToSeconds(uptime);

    let loginDate = null;

    if (uptimeSeconds > 0) {
        loginDate =
            new Date(
                Date.now() -
                uptimeSeconds * 1000
            );
    }

    return {
        id: 0,

        username,

        customer_name:
            customer?.name ||
            username,

        address,

        caller_id: callerId,

        package: packageName,

        bytes_in: rxBytes,

        bytes_out: txBytes,

        download_mb:
            Number(
                rxBytes /
                1024 /
                1024
            ).toFixed(2),

        upload_mb:
            Number(
                txBytes /
                1024 /
                1024
            ).toFixed(2),

        download_gb:
            Number(
                bytesToGB(rxBytes)
            ).toFixed(2),

        upload_gb:
            Number(
                bytesToGB(txBytes)
            ).toFixed(2),

        download_mbps:
            Number(
                downloadMbps
            ).toFixed(2),

        upload_mbps:
            Number(
                uploadMbps
            ).toFixed(2),

        download_display:
            formatTrafficBytes(rxBytes),

        upload_display:
            formatTrafficBytes(txBytes),

        uptime,

        login_time:
            formatDateTime(loginDate),

        logout_time: "—",

        status: "active",

        interface:
            interfaceName,

        ".id":
            clean(active[".id"])
    };
}

/*
|--------------------------------------------------------------------------
| BUILD OFFLINE ROW
|--------------------------------------------------------------------------
*/

function buildOfflineRow(
    customer,
    packageMap
) {
    const username =
        clean(customer.pppoe_username);

    const normalized =
        normalizeUsername(username);

    const packageName =
        packageMap.get(normalized) ||
        clean(customer.package_name) ||
        "PPPoE";

    return {
        id: 0,

        username,

        customer_name:
            clean(customer.name) ||
            username,

        address:
            clean(customer.address),

        caller_id: "—",

        package:
            packageName,

        bytes_in: 0,

        bytes_out: 0,

        download_mb: "0.00",

        upload_mb: "0.00",

        download_gb: "0.00",

        upload_gb: "0.00",

        download_mbps: "0.00",

        upload_mbps: "0.00",

        download_display: "0 MB",

        upload_display: "0 MB",

        uptime: "—",

        login_time: "—",

        logout_time: "—",

        status: "offline",

        interface:
            `pppoe-${username}`,

        ".id": "",

        customer_id:
            customer.customer_id
    };
}

/*
|--------------------------------------------------------------------------
| MAIN DATA
|--------------------------------------------------------------------------
*/

async function getData({
    user,
    routerId,
    packageFilter,
    areaFilter,
    subAreaFilter,
    connectionStatus
}) {
    const router =
        await getRouter(
            user,
            routerId
        );

    if (!router) {
        return {
            router: null,
            data: [],
            total: 0,
            active: 0,
            offline: 0,
            message:
                "No MikroTik router found."
        };
    }

    const customers =
        await getCustomers(user);

    let API = null;

    try {
        API =
            await connectRouter(router);

        const activeUsers =
            await getActiveUsers(API);

        const secrets =
            await getSecrets(API);

        const interfaces1 =
            await getInterfaceTraffic(API);

        const sampleSeconds =
            0.3;

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    300
                )
        );

        const interfaces2 =
            await getInterfaceTraffic(API);

        const packageMap =
            buildSecretPackageMap(
                secrets
            );

        const trafficMap1 =
            buildInterfaceMap(
                interfaces1
            );

        const trafficMap2 =
            buildInterfaceMap(
                interfaces2
            );

        const customerMap =
            new Map();

        for (const customer of customers) {
            const key =
                normalizeUsername(
                    customer.pppoe_username
                );

            if (key) {
                customerMap.set(
                    key,
                    customer
                );
            }
        }

        const activeMap =
            new Map();

        const rows = [];

        /*
        |--------------------------------------------------------------------------
        | ACTIVE
        |--------------------------------------------------------------------------
        */

        for (const active of activeUsers) {
            const username =
                clean(active.name);

            if (!username) {
                continue;
            }

            const key =
                normalizeUsername(
                    username
                );

            const customer =
                customerMap.get(key) || null;

            /*
            |--------------------------------------------------------------------------
            | If package/area filters are selected,
            | apply them against DB customer when available.
            |--------------------------------------------------------------------------
            */

            if (
                customer &&
                !matchFilter(
                    customer,
                    packageFilter,
                    areaFilter,
                    subAreaFilter
                )
            ) {
                continue;
            }

            /*
            |--------------------------------------------------------------------------
            | If package filter is used but customer
            | does not exist in DB, compare MikroTik profile.
            |--------------------------------------------------------------------------
            */

            if (
                packageFilter &&
                !customer
            ) {
                const mikrotikPackage =
                    packageMap.get(key) ||
                    clean(active.service);

                if (
                    mikrotikPackage.toLowerCase() !==
                    packageFilter.toLowerCase()
                ) {
                    continue;
                }
            }

            const row =
                buildActiveRow({
                    active,
                    customer,
                    packageMap,
                    interfaceMap: trafficMap2,
                    trafficMap2,
                    trafficMap1,
                    sampleSeconds
                });

            activeMap.set(
                key,
                true
            );

            rows.push(row);
        }

        /*
        |--------------------------------------------------------------------------
        | OFFLINE
        |--------------------------------------------------------------------------
        */

        if (
            connectionStatus === "all" ||
            connectionStatus === "offline"
        ) {
            for (const customer of customers) {
                const username =
                    clean(
                        customer.pppoe_username
                    );

                const key =
                    normalizeUsername(
                        username
                    );

                if (!key) {
                    continue;
                }

                /*
                |--------------------------------------------------------------------------
                | Currently active = don't add as offline.
                |--------------------------------------------------------------------------
                */

                if (activeMap.has(key)) {
                    continue;
                }

                if (
                    !matchFilter(
                        customer,
                        packageFilter,
                        areaFilter,
                        subAreaFilter
                    )
                ) {
                    continue;
                }

                rows.push(
                    buildOfflineRow(
                        customer,
                        packageMap
                    )
                );
            }
        }

        /*
        |--------------------------------------------------------------------------
        | ACTIVE ONLY
        |--------------------------------------------------------------------------
        */

        let filteredRows =
            rows;

        if (
            connectionStatus === "active"
        ) {
            filteredRows =
                rows.filter(
                    row =>
                        row.status ===
                        "active"
                );
        }

        if (
            connectionStatus === "offline"
        ) {
            filteredRows =
                rows.filter(
                    row =>
                        row.status ===
                        "offline"
                );
        }

        filteredRows =
            filteredRows.map(
                (row, index) => ({
                    ...row,
                    id: index + 1
                })
            );

        const activeCount =
            filteredRows.filter(
                row =>
                    row.status ===
                    "active"
            ).length;

        const offlineCount =
            filteredRows.filter(
                row =>
                    row.status ===
                    "offline"
            ).length;

        return {
            router: {
                id: router.id,
                name: router.name
            },

            data: filteredRows,

            total:
                filteredRows.length,

            active:
                activeCount,

            offline:
                offlineCount
        };
    } finally {
        if (API) {
            try {
                await API.close();
            } catch (error) {
                console.error(
                    "MikroTik close error:",
                    error.message
                );
            }
        }
    }
}

module.exports = {
    getRouters,
    getData
};