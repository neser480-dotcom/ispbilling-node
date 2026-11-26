"use strict";

const { RouterOSAPI } = require("node-routeros");

/**
 * MikroTik PPPoE secret-এর profile আপডেট করে
 * @param {Object} routerCfg - { host, port, username, password }
 * @param {string} pppoeUser - PPPoE username
 * @param {string} newProfile - নতুন MikroTik profile / package নাম
 */
async function syncPppoeProfile(routerCfg, pppoeUser, newProfile) {
    if (!routerCfg || !routerCfg.host || !pppoeUser || !newProfile) {
        return { synced: false, reason: "MISSING_ROUTER_OR_USER" };
    }

    const client = new RouterOSAPI({
        host: routerCfg.host,
        port: Number(routerCfg.port || 8728),
        user: routerCfg.username,
        password: routerCfg.password,
        timeout: 8
    });

    try {
        await client.connect();

        const secrets = await client.write("/ppp/secret/print", [
            `?name=${pppoeUser}`
        ]);

        if (!Array.isArray(secrets) || secrets.length === 0) {
            await client.close();
            return { synced: false, reason: "SECRET_NOT_FOUND" };
        }

        const secretId = secrets[0][".id"];
        await client.write("/ppp/secret/set", [
            `=.id=${secretId}`,
            `=profile=${newProfile}`
        ]);

        // একটিভ সেশন থাকলে রিসেট করলে নতুন প্রোফাইল দ্রুত কার্যকর হয়
        const activeSessions = await client.write("/ppp/active/print", [
            `?name=${pppoeUser}`
        ]);

        if (Array.isArray(activeSessions) && activeSessions.length > 0) {
            for (const sess of activeSessions) {
                if (sess[".id"]) {
                    await client.write("/ppp/active/remove", [
                        `=.id=${sess[".id"]}`
                    ]);
                }
            }
        }

        await client.close();
        return { synced: true };
    } catch (err) {
        try {
            await client.close();
        } catch (_) {}
        return { synced: false, reason: err.message || "MIKROTIK_ERROR" };
    }
}

module.exports = { syncPppoeProfile };