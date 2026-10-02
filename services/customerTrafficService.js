"use strict";

const { RouterOSAPI } = require("node-routeros");
const db = require("../config/database");

/*
|--------------------------------------------------------------------------
| Customer Traffic Service
|--------------------------------------------------------------------------
| Live data:
| - MikroTik PPP Active
| - PPPoE interface RX/TX counters
| - Live Mbps
| - RX/TX GB
| - Customer DB matching
|--------------------------------------------------------------------------
*/

function normalizeUsername(username) {
    return String(username || "")
        .trim()
        .toLowerCase();
}

function bytesToGB(bytes) {
    const value = Number(bytes) || 0;
    return value / (1024 * 1024 * 1024);
}

function bytesToMbps(bytes, seconds) {
    const value = Number(bytes) || 0;
    const sec = Number(seconds) || 0;

    if (sec <= 0) {
        return 0;
    }

    return (value * 8) / sec / 1000000;
}

function toNumber(value) {
    if (value === null || value === undefined || value === "") {
        return 0;
    }

    const n = Number(value);

    return Number.isFinite(n) ? n : 0;
}

function firstValue(row, keys) {
    for (const key of keys) {
        if (
            row &&
            row[key] !== undefined &&
            row[key] !== null &&
            row[key] !== ""
        ) {
            return row[key];
        }
    }

    return "";
}

function routerRowToObject(row) {
    return {
        id: Number(row.id),
        name: String(row.name || ""),
        ip: String(row.ip || ""),
        username: String(row.username || ""),
        password: String(row.password || ""),
        port: Number(row.port || 8728),
        timeout: Number(row.timeout || 5),
        use_ssl:
            row.use_ssl === 1 ||
            row.use_ssl === true ||
            String(row.use_ssl) === "1"
    };
}

/*
|--------------------------------------------------------------------------
| DATABASE
|--------------------------------------------------------------------------
*/

async function getRouters(companyId, isSuperAdmin) {
    const scope = isSuperAdmin
        ? ""
        : "WHERE company_id = ?";

    const params = isSuperAdmin
        ? []
        : [companyId];

    const [rows] = await db.query(
        `
        SELECT
            id,
            company_id,
            name,
            ip,
            username,
            password,
            port,
            timeout,
            use_ssl
        FROM mikrotik_servers
        ${scope}
        ORDER BY name ASC
        `,
        params
    );

    return rows.map(routerRowToObject);
}

async function getRouter(routerId, companyId, isSuperAdmin) {
    let sql = `
        SELECT
            id,
            company_id,
            name,
            ip,
            username,
            password,
            port,
            timeout,
            use_ssl
        FROM mikrotik_servers
        WHERE id = ?
    `;

    const params = [routerId];

    if (!isSuperAdmin) {
        sql += ` AND company_id = ?`;
        params.push(companyId);
    }

    sql += ` LIMIT 1`;

    const [rows] = await db.query(sql, params);

    if (!rows.length) {
        return null;
    }

    return routerRowToObject(rows[0]);
}

async function getCustomers(companyId, isSuperAdmin) {
    const where = isSuperAdmin
        ? "1 = 1"
        : "c.company_id = ?";

    const params = isSuperAdmin
        ? []
        : [companyId];

    const [rows] = await db.query(
        `
        SELECT
            c.id,
            c.customer_id,
            c.name,
            c.pppoe_username,
            c.username,
            c.company_id,
            c.package_id,
            COALESCE(
                NULLIF(c.package_name, ''),
                p.package_name,
                ''
            ) AS package_name
        FROM customers c
        LEFT JOIN packages p
            ON p.id = c.package_id
        WHERE ${where}
        `,
        params
    );

    const customers = new Map();

    for (const row of rows) {
        const username =
            row.pppoe_username ||
            row.username ||
            "";

        const key = normalizeUsername(username);

        if (!key) {
            continue;
        }

        customers.set(key, {
            id: row.id,
            customer_id: row.customer_id || "",
            name: row.name || "",
            username,
            company_id: row.company_id,
            package_id: row.package_id,
            package_name: row.package_name || ""
        });
    }

    return customers;
}

/*
|--------------------------------------------------------------------------
| ROUTEROS
|--------------------------------------------------------------------------
*/

async function connectRouter(router) {
    const api = new RouterOSAPI({
        host: router.ip,
        user: router.username,
        password: router.password,
        port: router.port || 8728,
        timeout: (router.timeout || 5) * 1000,
        tls: !!router.use_ssl
    });

    await api.connect();

    return api;
}

async function getActiveUsers(api) {
    const rows = await api.write("/ppp/active/print");

    if (!Array.isArray(rows)) {
        return [];
    }

    return rows;
}

async function getPppoeInterfaces(api) {
    const rows = await api.write(
        "/interface/print",
        [
            "?type=pppoe-in"
        ]
    );

    if (!Array.isArray(rows)) {
        return [];
    }

    return rows;
}

/*
|--------------------------------------------------------------------------
| INTERFACE MAP
|--------------------------------------------------------------------------
*/

function buildInterfaceMap(rows) {
    const map = new Map();

    for (const row of rows) {
        const name = String(
            firstValue(row, [
                "name",
                ".id"
            ])
        ).trim();

        if (!name) {
            continue;
        }

        const rx = toNumber(
            firstValue(row, [
                "rx-byte",
                "rx_bytes",
                "rx-byte-total"
            ])
        );

        const tx = toNumber(
            firstValue(row, [
                "tx-byte",
                "tx_bytes",
                "tx-byte-total"
            ])
        );

        map.set(name.toLowerCase(), {
            name,
            rx,
            tx
        });
    }

    return map;
}

/*
|--------------------------------------------------------------------------
| ACTIVE USER MAP
|--------------------------------------------------------------------------
*/

function buildActiveMap(rows) {
    const map = new Map();

    for (const row of rows) {
        const username = String(
            firstValue(row, [
                "name",
                "user"
            ])
        ).trim();

        if (!username) {
            continue;
        }

        map.set(normalizeUsername(username), row);
    }

    return map;
}

/*
|--------------------------------------------------------------------------
| SINGLE SAMPLE
|--------------------------------------------------------------------------
*/

async function collectSample(api) {
    const [activeRows, interfaceRows] =
        await Promise.all([
            getActiveUsers(api),
            getPppoeInterfaces(api)
        ]);

    return {
        activeRows,
        activeMap: buildActiveMap(activeRows),
        interfaces: buildInterfaceMap(interfaceRows)
    };
}

/*
|--------------------------------------------------------------------------
| MAIN LIVE TRAFFIC
|--------------------------------------------------------------------------
*/

async function getCustomerTraffic({
    routerId,
    companyId,
    role
}) {
    const isSuperAdmin =
        role === "super_admin";

    const routers =
        await getRouters(
            companyId,
            isSuperAdmin
        );

    if (!routers.length) {
        return {
            success: false,
            message: "No Router Found!",
            routers: [],
            router: null,
            customers: [],
            totals: {
                activeUsers: 0,
                downloadMbps: 0,
                uploadMbps: 0,
                downloadGB: 0,
                uploadGB: 0
            },
            chart: [],
            lastUpdate: new Date().toISOString()
        };
    }

    let selectedRouter = null;

    if (routerId) {
        selectedRouter =
            routers.find(
                router =>
                    Number(router.id) ===
                    Number(routerId)
            ) || null;
    }

    if (!selectedRouter) {
        selectedRouter = routers[0];
    }

    const customers =
        await getCustomers(
            companyId,
            isSuperAdmin
        );

    let api = null;

    try {
        api = await connectRouter(
            selectedRouter
        );

        /*
        |--------------------------------------------------------------------------
        | SAMPLE 1
        |--------------------------------------------------------------------------
        */

        const sample1 =
            await collectSample(api);

        /*
        |--------------------------------------------------------------------------
        | PHP source uses 300ms between samples
        |--------------------------------------------------------------------------
        */

        await new Promise(resolve =>
            setTimeout(resolve, 300)
        );

        /*
        |--------------------------------------------------------------------------
        | SAMPLE 2
        |--------------------------------------------------------------------------
        */

        const sample2 =
            await collectSample(api);

        const elapsedSeconds = 0.3;

        const activeRows =
            sample2.activeRows;

        const result = [];

        let totalDownloadMbps = 0;
        let totalUploadMbps = 0;
        let totalDownloadGB = 0;
        let totalUploadGB = 0;

        /*
        |--------------------------------------------------------------------------
        | ACTIVE PPPoE USERS
        |--------------------------------------------------------------------------
        */

        for (const active of activeRows) {
            const username =
                String(
                    firstValue(active, [
                        "name",
                        "user"
                    ])
                ).trim();

            if (!username) {
                continue;
            }

            const normalized =
                normalizeUsername(
                    username
                );

            const customer =
                customers.get(
                    normalized
                ) || null;

            const comment =
                String(
                    firstValue(active, [
                        "comment"
                    ])
                ).trim();

            const service =
                String(
                    firstValue(active, [
                        "service"
                    ])
                ).trim();

            /*
            |--------------------------------------------------------------------------
            | CUSTOMER NAME
            |--------------------------------------------------------------------------
            */

            const displayName =
                customer &&
                customer.name
                    ? customer.name
                    : (
                        comment ||
                        username
                    );

            /*
            |--------------------------------------------------------------------------
            | PACKAGE
            |--------------------------------------------------------------------------
            */

            const packageName =
                customer &&
                customer.package_name
                    ? customer.package_name
                    : (
                        service ||
                        "PPPoE"
                    );

            /*
            |--------------------------------------------------------------------------
            | PPPoE INTERFACE
            |--------------------------------------------------------------------------
            */

            const interfaceName =
                `pppoe-${username}`;

            const key =
                interfaceName.toLowerCase();

            const current =
                sample2.interfaces.get(
                    key
                ) ||
                sample1.interfaces.get(
                    key
                ) ||
                null;

            if (!current) {
                result.push({
                    id:
                        customer?.id || null,

                    customer_id:
                        customer?.customer_id || "",

                    name:
                        displayName,

                    username,

                    package:
                        packageName,

                    upload:
                        0,

                    download:
                        0,

                    upload_mbps:
                        0,

                    download_mbps:
                        0,

                    upload_gb:
                        0,

                    download_gb:
                        0,

                    address:
                        String(
                            firstValue(active, [
                                "address"
                            ])
                        ),

                    uptime:
                        String(
                            firstValue(active, [
                                "uptime"
                            ])
                        ),

                    comment,

                    interface:
                        interfaceName,

                    matched:
                        !!customer
                });

                continue;
            }

            const previous =
                sample1.interfaces.get(
                    key
                ) || current;

            const rxDifference =
                Math.max(
                    0,
                    current.rx -
                    previous.rx
                );

            const txDifference =
                Math.max(
                    0,
                    current.tx -
                    previous.tx
                );

            /*
            |--------------------------------------------------------------------------
            | MikroTik:
            | RX = Download
            | TX = Upload
            |--------------------------------------------------------------------------
            */

            const downloadMbps =
                bytesToMbps(
                    rxDifference,
                    elapsedSeconds
                );

            const uploadMbps =
                bytesToMbps(
                    txDifference,
                    elapsedSeconds
                );

            const downloadGB =
                bytesToGB(
                    current.rx
                );

            const uploadGB =
                bytesToGB(
                    current.tx
                );

            totalDownloadMbps +=
                downloadMbps;

            totalUploadMbps +=
                uploadMbps;

            totalDownloadGB +=
                downloadGB;

            totalUploadGB +=
                uploadGB;

            result.push({
                id:
                    customer?.id || null,

                customer_id:
                    customer?.customer_id || "",

                name:
                    displayName,

                username,

                package:
                    packageName,

                upload:
                    current.tx,

                download:
                    current.rx,

                upload_mbps:
                    uploadMbps,

                download_mbps:
                    downloadMbps,

                upload_gb:
                    uploadGB,

                download_gb:
                    downloadGB,

                address:
                    String(
                        firstValue(active, [
                            "address"
                        ])
                    ),

                uptime:
                    String(
                        firstValue(active, [
                            "uptime"
                        ])
                    ),

                comment,

                interface:
                    interfaceName,

                matched:
                    !!customer
            });
        }

        /*
        |--------------------------------------------------------------------------
        | TOP 20 CHART
        |--------------------------------------------------------------------------
        */

        const chart =
            [...result]
                .sort(
                    (a, b) =>
                        b.download_mbps -
                        a.download_mbps
                )
                .slice(0, 20)
                .map(row => ({
                    label:
                        `${row.name} (${row.username})`,

                    download:
                        Number(
                            row.download_mbps.toFixed(2)
                        ),

                    upload:
                        Number(
                            row.upload_mbps.toFixed(2)
                        )
                }));

        return {
            success: true,

            routers,

            router: {
                id:
                    selectedRouter.id,

                name:
                    selectedRouter.name
            },

            customers: result,

            totals: {
                activeUsers:
                    result.length,

                downloadMbps:
                    Number(
                        totalDownloadMbps.toFixed(2)
                    ),

                uploadMbps:
                    Number(
                        totalUploadMbps.toFixed(2)
                    ),

                downloadGB:
                    Number(
                        totalDownloadGB.toFixed(2)
                    ),

                uploadGB:
                    Number(
                        totalUploadGB.toFixed(2)
                    )
            },

            chart,

            lastUpdate:
                new Date().toISOString()
        };

    } catch (error) {
        return {
            success: false,

            message:
                "MikroTik Connection Failed!",

            error:
                process.env.NODE_ENV === "production"
                    ? undefined
                    : error.message,

            routers,

            router: {
                id:
                    selectedRouter.id,

                name:
                    selectedRouter.name
            },

            customers: [],

            totals: {
                activeUsers: 0,
                downloadMbps: 0,
                uploadMbps: 0,
                downloadGB: 0,
                uploadGB: 0
            },

            chart: [],

            lastUpdate:
                new Date().toISOString()
        };
    } finally {
        if (api) {
            try {
                await api.close();
            } catch (e) {
                // Ignore close error
            }
        }
    }
}

module.exports = {
    getCustomerTraffic
};