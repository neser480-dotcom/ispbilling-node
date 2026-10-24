"use strict";

/*
|--------------------------------------------------------------------------
| PPP BLOCK / RESTORE SERVICE
|--------------------------------------------------------------------------
| Port of customers/bulk/_ppp_helper.php
|
| EXPIRE            -> PPPoE secret is moved to the BLOCK profile.
| RECHARGE / ACTIVE -> PPPoE secret goes back to the customer's OWN profile.
|
| Own profile lookup (first match wins):
|   1) customers.package_id -> mikrotik_packages.profile_id
|   2) profile saved in ppp_profile_backup before the block
|   3) customers.package_name matched with mikrotik_packages.package_name
|--------------------------------------------------------------------------
*/

const db = require("../config/database");
const { RouterOSAPI } = require("node-routeros");

const DEFAULT_BLOCK_PROFILE = "Block";


/*
|--------------------------------------------------------------------------
| ROUTER SESSION CACHE
|--------------------------------------------------------------------------
| One session = one MikroTik connection per router, reused for a whole
| bulk run. Always call session.closeAll() in a finally block.
|--------------------------------------------------------------------------
*/

function createSession({ companyId = 0, isSuper = false } = {}) {

    const apis = new Map();

    async function api(routerId) {

        routerId = Number(routerId);

        if (apis.has(routerId)) {
            return apis.get(routerId);
        }

        let sql =
            `SELECT ip, port, username, password, use_ssl, timeout
             FROM mikrotik_servers WHERE id = ?`;

        const params = [routerId];

        if (!isSuper) {
            sql += " AND company_id = ?";
            params.push(Number(companyId));
        }

        const [rows] = await db.query(sql + " LIMIT 1", params);

        const router = rows[0];

        if (!router) {
            throw new Error("MikroTik server not found.");
        }

        const client = new RouterOSAPI({
            host: String(router.ip || "").trim(),
            user: String(router.username || "").trim(),
            password: String(router.password || ""),
            port: Number(router.port) > 0 ? Number(router.port) : 8728,
            timeout: Number(router.timeout || 5) * 1000,
            tls: Number(router.use_ssl || 0) === 1 ? {} : undefined
        });

        try {
            await client.connect();
        } catch (e) {
            throw new Error("Could not connect to MikroTik.");
        }

        apis.set(routerId, client);

        return client;
    }

    async function closeAll() {
        for (const client of apis.values()) {
            try { await client.close(); } catch (_) {}
        }
        apis.clear();
    }

    return { api, closeAll };
}


/*
|--------------------------------------------------------------------------
| BLOCK PROFILE NAME
|--------------------------------------------------------------------------
*/

const blockProfileCache = new Map();

async function blockProfile(routerId) {

    routerId = Number(routerId);

    if (blockProfileCache.has(routerId)) {
        return blockProfileCache.get(routerId);
    }

    let name = DEFAULT_BLOCK_PROFILE;

    try {
        const [cols] = await db.query("SHOW COLUMNS FROM mikrotik_servers");

        const have = new Set(cols.map(c => c.Field));

        for (const col of [
            "block_profile",
            "expired_profile",
            "expire_profile",
            "blocked_profile"
        ]) {
            if (!have.has(col)) continue;

            const [rows] = await db.query(
                `SELECT \`${col}\` AS p FROM mikrotik_servers WHERE id = ? LIMIT 1`,
                [routerId]
            );

            const val = String(rows[0]?.p || "").trim();

            if (val) { name = val; break; }
        }
    } catch (_) {}

    blockProfileCache.set(routerId, name);

    return name;
}


/*
|--------------------------------------------------------------------------
| PROFILE BACKUP TABLE
|--------------------------------------------------------------------------
*/

async function backupSave(customerId, profile) {

    if (!profile) return;

    try {
        await db.query(
            `CREATE TABLE IF NOT EXISTS ppp_profile_backup (
                customer_id INT NOT NULL PRIMARY KEY,
                profile VARCHAR(150) NOT NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
        );

        await db.query(
            "REPLACE INTO ppp_profile_backup (customer_id, profile) VALUES (?, ?)",
            [Number(customerId), String(profile)]
        );
    } catch (_) {
        // helper only - never stop the block because of it
    }
}

async function backupGet(customerId) {

    try {
        const [rows] = await db.query(
            "SELECT profile FROM ppp_profile_backup WHERE customer_id = ? LIMIT 1",
            [Number(customerId)]
        );
        return String(rows[0]?.profile || "").trim();
    } catch (_) {
        return "";
    }
}

async function backupClear(customerId) {

    try {
        await db.query(
            "DELETE FROM ppp_profile_backup WHERE customer_id = ?",
            [Number(customerId)]
        );
    } catch (_) {}
}


/*
|--------------------------------------------------------------------------
| CUSTOMER'S OWN PROFILE
|--------------------------------------------------------------------------
*/

async function packageProfile(customerId, routerId = 0) {

    const cid = Number(customerId);

    let [rows] = await db.query(
        `SELECT p.profile_id AS profile
         FROM customers c
         JOIN mikrotik_packages p ON p.id = c.package_id
         WHERE c.id = ? LIMIT 1`,
        [cid]
    );

    let v = String(rows[0]?.profile || "").trim();
    if (v) return v;

    v = await backupGet(cid);
    if (v) return v;

    [rows] = await db.query(
        "SELECT company_id, package_name FROM customers WHERE id = ? LIMIT 1",
        [cid]
    );

    const c = rows[0];
    const pn = String(c?.package_name || "").trim();

    if (pn) {
        let sql =
            `SELECT profile_id FROM mikrotik_packages
             WHERE package_name = ?
               AND (company_id = ? OR company_id = 0)`;

        const params = [pn, Number(c.company_id || 0)];

        if (Number(routerId) > 0) {
            sql += " AND router_id = ?";
            params.push(Number(routerId));
        }

        sql += " AND profile_id <> '' LIMIT 1";

        [rows] = await db.query(sql, params);

        v = String(rows[0]?.profile_id || "").trim();
        if (v) return v;
    }

    return "";
}


/*
|--------------------------------------------------------------------------
| ROUTER RESOLUTION
|--------------------------------------------------------------------------
| customers.mikrotik_id -> package router -> company's only router ->
| the router that really has the PPPoE secret.
|--------------------------------------------------------------------------
*/

async function resolveRouter(session, { customerId, mikrotikId, pppoe, persist = true }) {

    if (Number(mikrotikId) > 0) return Number(mikrotikId);

    const cid = Number(customerId);

    let [rows] = await db.query(
        `SELECT p.router_id AS rid
         FROM customers c
         JOIN mikrotik_packages p ON p.id = c.package_id
         WHERE c.id = ? LIMIT 1`,
        [cid]
    );

    let rid = Number(rows[0]?.rid || 0);

    if (rid <= 0) {

        [rows] = await db.query(
            "SELECT company_id FROM customers WHERE id = ? LIMIT 1",
            [cid]
        );

        const companyId = Number(rows[0]?.company_id || 0);

        const [routers] = await db.query(
            "SELECT id FROM mikrotik_servers WHERE company_id = ? ORDER BY id ASC",
            [companyId]
        );

        if (routers.length === 1) {
            rid = Number(routers[0].id);

        } else if (routers.length > 1 && pppoe) {

            for (const r of routers) {
                try {
                    const api = await session.api(r.id);
                    if (await findSecret(api, pppoe)) {
                        rid = Number(r.id);
                        break;
                    }
                } catch (_) {
                    // router offline - try the next one
                }
            }
        }
    }

    if (rid > 0 && persist) {
        await db.query(
            `UPDATE customers SET mikrotik_id = ?
             WHERE id = ? AND (mikrotik_id IS NULL OR mikrotik_id = 0)`,
            [rid, cid]
        );
    }

    return rid;
}


/*
|--------------------------------------------------------------------------
| ROUTEROS HELPERS
|--------------------------------------------------------------------------
*/

async function findSecret(api, pppoe) {

    const list = await api.write("/ppp/secret/print", [`?name=${pppoe}`]);

    return Array.isArray(list) && list[0] && list[0][".id"]
        ? list[0]
        : null;
}

async function profileName(api, profile) {

    profile = String(profile || "").trim();

    if (!profile) return null;

    if (profile[0] === "*") {

        const all = await api.write("/ppp/profile/print");

        const hit = (all || []).find(r => r[".id"] === profile && r.name);

        return hit ? String(hit.name) : null;
    }

    const r = await api.write("/ppp/profile/print", [`?name=${profile}`]);

    return r && r[0] && r[0].name ? String(r[0].name) : null;
}

async function kick(api, pppoe) {

    const active = await api.write("/ppp/active/print", [`?name=${pppoe}`]);

    for (const row of active || []) {
        if (row[".id"]) {
            await api.write("/ppp/active/remove", [`=.id=${row[".id"]}`]);
        }
    }
}


/*
|--------------------------------------------------------------------------
| EXPIRE: move customer to the block profile
|--------------------------------------------------------------------------
*/

async function blockCustomer(api, { pppoe, blockProfileName, customerId }) {

    const secret = await findSecret(api, pppoe);

    if (!secret) {
        throw new Error(`PPPoE not found on MikroTik: ${pppoe}`);
    }

    const current = String(secret.profile || "");

    if (current.toLowerCase() === String(blockProfileName).toLowerCase()) {
        return; // already blocked
    }

    await backupSave(customerId, current);

    try {
        await api.write("/ppp/secret/set", [
            `=.id=${secret[".id"]}`,
            `=profile=${blockProfileName}`,
            "=disabled=no"
        ]);
    } catch (e) {
        throw new Error(
            `Block profile "${blockProfileName}" failed: ${e.message}`
        );
    }

    await kick(api, pppoe);
}


/*
|--------------------------------------------------------------------------
| RECHARGE / ACTIVE: enable + give back the customer's own profile
|--------------------------------------------------------------------------
*/

async function restoreCustomer(api, { secret, routerId, customerId }) {

    const name = String(secret.name || "");
    const block = await blockProfile(routerId);
    const current = String(secret.profile || "");

    const params = [`=.id=${secret[".id"]}`, "=disabled=no"];

    let restored = false;

    if (current && current.toLowerCase() === block.toLowerCase()) {

        const pkg = await packageProfile(customerId, routerId);

        if (!pkg || pkg.toLowerCase() === block.toLowerCase()) {
            throw new Error(
                "Customer is on the block profile but his own package profile could not be found."
            );
        }

        const resolved = await profileName(api, pkg);

        if (resolved === null) {
            throw new Error(`Profile "${pkg}" was not found on MikroTik.`);
        }

        if (resolved.toLowerCase() === block.toLowerCase()) {
            throw new Error("Customer's own profile resolves to the block profile.");
        }

        params.push(`=profile=${resolved}`);
        restored = true;
    }

    try {
        await api.write("/ppp/secret/set", params);
    } catch (e) {
        throw new Error(`MikroTik rejected enable request: ${e.message}`);
    }

    if (restored) {
        await backupClear(customerId);
        if (name) await kick(api, name);
    }
}

async function unblockCustomer(api, { pppoe, routerId, customerId }) {

    const secret = await findSecret(api, pppoe);

    if (!secret) {
        throw new Error(`PPPoE not found on MikroTik: ${pppoe}`);
    }

    await restoreCustomer(api, { secret, routerId, customerId });
}


module.exports = {
    DEFAULT_BLOCK_PROFILE,
    createSession,
    blockProfile,
    backupSave,
    backupGet,
    backupClear,
    packageProfile,
    resolveRouter,
    findSecret,
    profileName,
    kick,
    blockCustomer,
    restoreCustomer,
    unblockCustomer
};
