"use strict";

const db = require("../config/database");

let RouterOSAPI;

try {
    ({ RouterOSAPI } = require("node-routeros"));
} catch (error) {
    RouterOSAPI = null;
}

function normalizeRouterOSBoolean(value) {
    return (
        value === true ||
        value === "true" ||
        value === 1 ||
        value === "1"
    );
}

function getScope(companyId, role) {
    const isSuperAdmin = role === "super_admin";

    if (isSuperAdmin) {
        return {
            sql: "1=1",
            params: []
        };
    }

    return {
        sql: "company_id = ?",
        params: [companyId]
    };
}

async function query(sql, params = []) {
    const [rows] = await db.query(sql, params);
    return rows;
}

async function getRouters(companyId, role) {
    const scope = getScope(companyId, role);

    return query(
        `
        SELECT id, name
        FROM mikrotik_servers
        WHERE ${scope.sql}
        ORDER BY id ASC
        `,
        scope.params
    );
}

async function getSelectedRouter(companyId, role, routerId) {
    const scope = getScope(companyId, role);

    let rows;

    if (routerId > 0) {
        rows = await query(
            `
            SELECT *
            FROM mikrotik_servers
            WHERE id = ?
              AND ${scope.sql}
            LIMIT 1
            `,
            [routerId, ...scope.params]
        );
    }

    if (!rows || rows.length === 0) {
        rows = await query(
            `
            SELECT *
            FROM mikrotik_servers
            WHERE ${scope.sql}
            ORDER BY id ASC
            LIMIT 1
            `,
            scope.params
        );
    }

    return rows.length ? rows[0] : null;
}

function createRouterApi(router) {
    if (!RouterOSAPI) {
        throw new Error(
            "node-routeros package is not installed."
        );
    }

    return new RouterOSAPI({
        host: String(router.ip || "").trim(),
        user: String(router.username || ""),
        password: String(router.password || ""),
        port: Number(router.port || 8728),
        timeout: Number(router.timeout || 5),
        tls:
            router.use_ssl === true ||
            router.use_ssl === 1 ||
            router.use_ssl === "1"
    });
}

async function connectRouter(router) {
    const api = createRouterApi(router);

    await api.connect();

    return api;
}

async function closeRouter(api) {
    if (!api) {
        return;
    }

    try {
        if (typeof api.close === "function") {
            await api.close();
        }
    } catch (error) {
        console.error(
            "RouterOS close error:",
            error.message
        );
    }
}

function parseInterface(interfaceData, routerName) {
    const type = String(interfaceData.type || "");
    const name = String(interfaceData.name || "");

    if (!name) {
        return null;
    }

    // PHP source-এর একই filter:
    // PPPoE / dynamic interfaces বাদ
    if (
        name.includes("<") ||
        name.toLowerCase().includes("pppoe")
    ) {
        return null;
    }

    const status = normalizeRouterOSBoolean(
        interfaceData.running
    )
        ? "up"
        : "down";

    const data = {
        name,
        status,
        mikrotik: routerName
    };

    if (type === "vlan") {
        data.vlan_id =
            interfaceData["vlan-id"] ??
            interfaceData["vlan_id"] ??
            "";

        return {
            category: "vlan",
            data
        };
    }

    if (
        type === "ether" ||
        type === "bridge"
    ) {
        return {
            category: "ethernet",
            data
        };
    }

    return null;
}

async function getInterfaceMonitor({
    companyId,
    role,
    routerId
}) {
    const routers = await getRouters(
        companyId,
        role
    );

    const router = await getSelectedRouter(
        companyId,
        role,
        routerId
    );

    const result = {
        success: true,
        routers,
        router: router
            ? {
                  id: Number(router.id),
                  name: router.name
              }
            : null,
        ethernet_interfaces: [],
        vlan_interfaces: [],
        connectionError: "",
        lastUpdate: new Date().toISOString()
    };

    if (!router) {
        result.success = false;
        result.connectionError = "No Router Found!";
        return result;
    }

    let api;

    try {
        api = await connectRouter(router);

        const interfaces =
            await api.write("/interface/print");

        if (Array.isArray(interfaces)) {
            for (const item of interfaces) {
                const parsed = parseInterface(
                    item,
                    router.name
                );

                if (!parsed) {
                    continue;
                }

                if (
                    parsed.category ===
                    "ethernet"
                ) {
                    result.ethernet_interfaces.push(
                        parsed.data
                    );
                }

                if (
                    parsed.category ===
                    "vlan"
                ) {
                    result.vlan_interfaces.push(
                        parsed.data
                    );
                }
            }
        }

        result.ethernet_interfaces.sort(
            (a, b) =>
                a.name.localeCompare(b.name)
        );

        result.vlan_interfaces.sort(
            (a, b) =>
                a.name.localeCompare(b.name)
        );

    } catch (error) {
        console.error(
            "MikroTik Interface Error:",
            error
        );

        result.success = false;
        result.connectionError =
            "MikroTik Connection Failed!";

        if (
            error.message &&
            error.message.includes(
                "node-routeros"
            )
        ) {
            result.connectionError =
                "node-routeros package is not installed!";
        }

    } finally {
        await closeRouter(api);
    }

    return result;
}

function toNumber(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return 0;
    }

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : 0;
}

async function getInterfaceCounter(
    api,
    interfaceName
) {
    const result = await api.write(
        "/interface/print",
        [
            `?name=${interfaceName}`
        ]
    );

    if (
        !Array.isArray(result) ||
        !result.length
    ) {
        return null;
    }

    const row = result[0];

    return {
        name:
            row.name ||
            interfaceName,

        rx:
            toNumber(
                row["rx-byte"] ??
                row["rx_bytes"]
            ),

        tx:
            toNumber(
                row["tx-byte"] ??
                row["tx_bytes"]
            ),

        running:
            normalizeRouterOSBoolean(
                row.running
            )
    };
}

async function getBandwidth({
    companyId,
    role,
    routerId,
    interfaceName
}) {
    const router =
        await getSelectedRouter(
            companyId,
            role,
            routerId
        );

    if (!router) {
        return {
            success: false,
            message: "No Router Found!"
        };
    }

    let api;

    try {
        api = await connectRouter(router);

        const first =
            await getInterfaceCounter(
                api,
                interfaceName
            );

        if (!first) {
            return {
                success: false,
                message:
                    "Interface not found on MikroTik."
            };
        }

        await new Promise(resolve =>
            setTimeout(resolve, 1000)
        );

        const second =
            await getInterfaceCounter(
                api,
                interfaceName
            );

        if (!second) {
            return {
                success: false,
                message:
                    "Unable to read interface counters."
            };
        }

        const rxDiff = Math.max(
            0,
            second.rx - first.rx
        );

        const txDiff = Math.max(
            0,
            second.tx - first.tx
        );

        const seconds = 1;

        const downloadMbps =
            (rxDiff * 8) /
            seconds /
            1000000;

        const uploadMbps =
            (txDiff * 8) /
            seconds /
            1000000;

        return {
            success: true,

            router: {
                id: Number(router.id),
                name: router.name
            },

            interface: {
                name: second.name,
                status: second.running
                    ? "up"
                    : "down"
            },

            downloadMbps:
                Number(
                    downloadMbps.toFixed(2)
                ),

            uploadMbps:
                Number(
                    uploadMbps.toFixed(2)
                ),

            rxBytes: second.rx,
            txBytes: second.tx,

            timestamp:
                new Date().toISOString()
        };

    } finally {
        await closeRouter(api);
    }
}

module.exports = {
    getInterfaceMonitor,
    getBandwidth
};