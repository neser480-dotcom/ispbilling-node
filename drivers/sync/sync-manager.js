"use strict";

const {
    collectPppSessions,
    loadMikrotikService
} = require("../services/ppp-sessions");
const { normalizeMac } = require("./core/sync-normalizer");

/*
|--------------------------------------------------------------------------
| SYNC MANAGER
|--------------------------------------------------------------------------
| 1) syncCustomers   -> PPPoE customer sessions only
| 2) syncOnuHardware -> ONU hardware / optical data only
|
| ONU customer mapping remains a separate action.
| Nothing here deletes ONU rows.
|--------------------------------------------------------------------------
*/

const VENDORS = {
    ecom: () => require("./vendors/ecom/sync"),
    cdata: () => require("./vendors/cdata/sync"),
    bdcom: () => require("./vendors/bdcom/sync")
};

const running = new Set();

function syncError(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function vendorKey(olt) {
    const key = String(olt?.vendor ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    if (key.startsWith("ecom")) return "ecom";
    if (key.startsWith("cdata")) return "cdata";
    if (key.startsWith("bdcom")) return "bdcom";

    return key;
}

function loadVendor(olt) {
    const loader = VENDORS[vendorKey(olt)];

    if (!loader) {
        throw syncError(
            `Sync is not supported for vendor: ${olt?.vendor || "unknown"}.`
        );
    }

    return loader();
}

async function exclusive(oltId, task) {
    const key = String(oltId);

    if (running.has(key)) {
        throw syncError(
            "Another sync is already running for this OLT. Please wait.",
            409
        );
    }

    running.add(key);

    try {
        return await task();
    } finally {
        running.delete(key);
    }
}

function normalizeUsername(value) {
    return String(value || "").trim().toLowerCase();
}

async function syncCustomers(pool, olt, { dryRun = false } = {}) {
    return exclusive(olt.id, async () => {
        let ppp = {
            sessions: [],
            routers: 0,
            errors: []
        };

        try {
            ppp = await collectPppSessions(
                pool,
                olt.company_id,
                loadMikrotikService(),
                olt.mikrotik_id
            );
        } catch (error) {
            ppp.errors = [error.message];
        }

        const sessions = Array.isArray(ppp.sessions)
            ? ppp.sessions
            : [];

        const errors = Array.isArray(ppp.errors)
            ? ppp.errors
            : [];

        const complete =
            errors.length === 0 &&
            Number(ppp.routers) === 1;

        // MACs that really live on THIS OLT. Without it a customer of another
        // OLT (same MikroTik router) would be claimed by this one.
        let scope = {
            verified: false,
            onuMacs: new Set(),
            macs: new Set(),
            errors: []
        };

        try {
            scope = await loadVendor(olt).readOltMacScope(olt);
        } catch (error) {
            scope.errors = [error.message];
        }

        const result = {
            totalSessions: sessions.length,
            matched: 0,
            savedOnline: 0,
            wentOnline: 0,
            wentOffline: 0,
            ambiguous: 0,
            unmatched: 0,
            conflicts: 0,
            outsideOlt: 0,
            released: 0,
            scopeVerified: scope.verified,
            scopeErrors: scope.errors.slice(0, 5),
            dryRun,
            complete,
            errors: errors.slice(0, 10)
        };

        const conn = await pool.getConnection();

        try {
            await conn.beginTransaction();

            const [customerRows] = await conn.execute(
                `SELECT id, customer_id, pppoe_username
                 FROM customers
                 WHERE company_id = ?
                   AND deleted_at IS NULL
                   AND pppoe_username IS NOT NULL
                   AND TRIM(pppoe_username) <> ''`,
                [Number(olt.company_id)]
            );

            const customersByUsername = new Map();

            for (const customer of customerRows) {
                const username = normalizeUsername(
                    customer.pppoe_username
                );

                if (!username) continue;

                if (!customersByUsername.has(username)) {
                    customersByUsername.set(username, []);
                }

                customersByUsername.get(username).push(customer);
            }

            const [ownedRows] = await conn.execute(
                `SELECT customer_id
                 FROM olt_customer_sessions
                 WHERE company_id = ?
                   AND olt_id = ?`,
                [Number(olt.company_id), Number(olt.id)]
            );

            const ownedHere = new Set(
                ownedRows.map(row => Number(row.customer_id))
            );

            // Keep every raw active username, including ambiguous or
            // unmatched sessions, to prevent false Offline transitions.
            const activeUsernames = new Set(
                sessions
                    .map(session => normalizeUsername(session.username))
                    .filter(Boolean)
            );

            const processedCustomers = new Set();

            for (const session of sessions) {
                const username = normalizeUsername(session.username);

                if (!username) {
                    result.unmatched++;
                    continue;
                }

                const matches = customersByUsername.get(username) || [];

                if (matches.length === 0) {
                    result.unmatched++;
                    continue;
                }

                if (matches.length !== 1) {
                    result.ambiguous++;
                    continue;
                }

                const customer = matches[0];
                const customerId = Number(customer.id);

                // Only customers whose MAC lives on this OLT. If the OLT
                // could not be read completely, never claim new customers;
                // just keep refreshing the ones this OLT already owns.
                const callerMac = normalizeMac(session.mac);

                // A MAC that WAS found on this OLT is proof, even when another
                // PON failed to read. "verified" only matters for releasing.
                const inScope = !!callerMac && scope.macs.has(callerMac);

                if (!inScope && !(!scope.verified && ownedHere.has(customerId))) {
                    result.outsideOlt++;
                    continue;
                }

                if (processedCustomers.has(customerId)) {
                    continue;
                }

                processedCustomers.add(customerId);
                result.matched++;

                // Do not take ownership from another active OLT.
                const [otherOwners] = await conn.execute(
                    `SELECT s.olt_id
                     FROM olt_customer_sessions AS s
                     INNER JOIN olts AS o
                        ON o.id = s.olt_id
                       AND o.deleted_at IS NULL
                     WHERE s.company_id = ?
                       AND s.customer_id = ?
                       AND s.olt_id <> ?
                     LIMIT 1
                     FOR UPDATE`,
                    [
                        Number(olt.company_id),
                        customerId,
                        Number(olt.id)
                    ]
                );

                if (otherOwners.length) {
                    result.conflicts++;
                    continue;
                }

                const [existingRows] = await conn.execute(
                    `SELECT id, olt_id, online_status
                     FROM olt_customer_sessions
                     WHERE company_id = ?
                       AND customer_id = ?
                     LIMIT 1
                     FOR UPDATE`,
                    [
                        Number(olt.company_id),
                        customerId
                    ]
                );

                const existing = existingRows[0] || null;
                const routerId = Number(session.routerId) || null;
                const callerId = String(session.mac || "").trim() || null;
                const ipAddress = String(session.address || "").trim() || null;

                if (!dryRun) {
                    if (existing) {
                        await conn.execute(
                            `UPDATE olt_customer_sessions
                             SET olt_id = ?,
                                 router_id = ?,
                                 pppoe_username = ?,
                                 caller_id = ?,
                                 ip_address = ?,
                                 online_status = 1,
                                 last_seen = NOW()
                             WHERE id = ?
                               AND company_id = ?`,
                            [
                                Number(olt.id),
                                routerId,
                                String(session.username).trim(),
                                callerId,
                                ipAddress,
                                existing.id,
                                Number(olt.company_id)
                            ]
                        );
                    } else {
                        await conn.execute(
                            `INSERT INTO olt_customer_sessions
                             (
                                 company_id,
                                 olt_id,
                                 customer_id,
                                 router_id,
                                 pppoe_username,
                                 caller_id,
                                 ip_address,
                                 online_status,
                                 last_seen
                             )
                             VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
                            [
                                Number(olt.company_id),
                                Number(olt.id),
                                customerId,
                                routerId,
                                String(session.username).trim(),
                                callerId,
                                ipAddress
                            ]
                        );
                    }

                    if (!existing || Number(existing.online_status) !== 1) {
                        await conn.execute(
                            `INSERT INTO olt_customer_session_history
                             (
                                 company_id,
                                 olt_id,
                                 customer_id,
                                 router_id,
                                 pppoe_username,
                                 caller_id,
                                 ip_address,
                                 previous_status,
                                 new_status
                             )
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                            [
                                Number(olt.company_id),
                                Number(olt.id),
                                customerId,
                                routerId,
                                String(session.username).trim(),
                                callerId,
                                ipAddress,
                                existing
                                    ? Number(existing.online_status)
                                    : null
                            ]
                        );
                    }
                }

                result.savedOnline++;

                if (!existing || Number(existing.online_status) !== 1) {
                    result.wentOnline++;
                }
            }

            // Only mark missing sessions Offline after a complete,
            // successful collection from the assigned router.
            if (complete) {
                const [onlineRows] = await conn.execute(
                    `SELECT
                         s.id,
                         s.customer_id,
                         s.router_id,
                         s.pppoe_username,
                         s.caller_id,
                         s.ip_address
                     FROM olt_customer_sessions AS s
                     WHERE s.company_id = ?
                       AND s.olt_id = ?
                       AND s.online_status = 1
                     FOR UPDATE`,
                    [
                        Number(olt.company_id),
                        Number(olt.id)
                    ]
                );

                for (const row of onlineRows) {
                    const username = normalizeUsername(
                        row.pppoe_username
                    );

                    if (username && activeUsernames.has(username)) {
                        continue;
                    }

                    if (!dryRun) {
                        await conn.execute(
                            `UPDATE olt_customer_sessions
                             SET online_status = 0
                             WHERE id = ?
                               AND company_id = ?
                               AND online_status = 1`,
                            [
                                row.id,
                                Number(olt.company_id)
                            ]
                        );

                        await conn.execute(
                            `INSERT INTO olt_customer_session_history
                             (
                                 company_id,
                                 olt_id,
                                 customer_id,
                                 router_id,
                                 pppoe_username,
                                 caller_id,
                                 ip_address,
                                 previous_status,
                                 new_status
                             )
                             VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
                            [
                                Number(olt.company_id),
                                Number(olt.id),
                                Number(row.customer_id),
                                row.router_id,
                                row.pppoe_username,
                                row.caller_id,
                                row.ip_address
                            ]
                        );
                    }

                    result.wentOffline++;
                }
            }

            // Release customers that are still online here but whose MAC is not
            // on this OLT (claimed by an earlier sync, or moved to another OLT).
            // Offline rows are never released: their MAC cannot be checked.
            if (complete && scope.verified) {
                const [ownedNow] = await conn.execute(
                    `SELECT id, customer_id, router_id, pppoe_username,
                            caller_id, ip_address
                     FROM olt_customer_sessions
                     WHERE company_id = ?
                       AND olt_id = ?
                       AND online_status = 1
                     FOR UPDATE`,
                    [Number(olt.company_id), Number(olt.id)]
                );

                for (const row of ownedNow) {
                    const username = normalizeUsername(row.pppoe_username);

                    // Not active any more: handled as Offline above.
                    if (!username || !activeUsernames.has(username)) continue;

                    const mac = normalizeMac(row.caller_id);

                    if (mac && scope.macs.has(mac)) continue;

                    if (!dryRun) {
                        await conn.execute(
                            `INSERT INTO olt_customer_session_history
                             (
                                 company_id,
                                 olt_id,
                                 customer_id,
                                 router_id,
                                 pppoe_username,
                                 caller_id,
                                 ip_address,
                                 previous_status,
                                 new_status
                             )
                             VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
                            [
                                Number(olt.company_id),
                                Number(olt.id),
                                Number(row.customer_id),
                                row.router_id,
                                row.pppoe_username,
                                row.caller_id,
                                row.ip_address
                            ]
                        );

                        await conn.execute(
                            `DELETE FROM olt_customer_sessions
                             WHERE id = ?
                               AND company_id = ?
                               AND olt_id = ?`,
                            [row.id, Number(olt.company_id), Number(olt.id)]
                        );
                    }

                    result.released++;
                }
            }

            await conn.commit();

            return result;
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    });
}

async function syncOnuHardware(pool, olt) {
    const vendor = loadVendor(olt);

    return exclusive(
        olt.id,
        () => vendor.syncOnuHardware(pool, olt)
    );
}

module.exports = {
    syncCustomers,
    syncOnuHardware
};
