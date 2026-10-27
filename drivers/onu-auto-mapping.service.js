'use strict';

/*
|--------------------------------------------------------------------------
| ONU -> CUSTOMER AUTO MAPPING
|--------------------------------------------------------------------------
| Evidence used (all comparisons are done on normalized MACs, inside one
| company only):
|
|   1. ONU's own MAC  (onu.onu_mac / onu.mac_address) == customers.onu_mac
|   2. MACs learned behind the ONU on the OLT (when the OLT driver could
|      collect them)               == customers.router_mac  or customers.onu_mac
|   3. ONU MAC (or learned MAC) == MikroTik /ppp/active caller-id -> PPPoE
|      name == customers.pppoe_username (also supplies the customer's IP)
|
| An ONU is linked ONLY when all evidence points to exactly ONE customer and
| that customer is not already linked to another ONU. Everything else stays
| unlinked and is reported with a reason.
|
| Existing links are never touched:
|   - onu_user_mapping row with a customer      -> already linked
|   - onu_user_mapping row with NULL customer   -> an empty placeholder (the
|                                                  table cannot tell it from a
|                                                  manual Unlink). It is filled
|                                                  by UPDATE unless
|                                                  ONU_AUTO_MAP_RESPECT_UNLINK=on
|                                                  (or relinkUnlinked:false)
|   - legacy onu.customer_id (no mapping row)   -> already linked
|
| Only columns already used by olt.controller.js are written:
|   onu_user_mapping (company_id, olt_id, onu_id, customer_id)
|--------------------------------------------------------------------------
*/

const MAC_PATTERN =
    /\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b|\b(?:[0-9a-f]{4}\.){2}[0-9a-f]{4}\b|\b[0-9a-f]{12}\b/gi;

const MAX_DETAILS = 500;

/*
|--------------------------------------------------------------------------
| MAC HELPERS
|--------------------------------------------------------------------------
*/

function normalizeMac(value) {
    const hex = String(value ?? '')
        .replace(/[^0-9a-f]/gi, '')
        .toUpperCase();

    if (hex.length !== 12) return null;
    if (/^0+$/.test(hex) || /^F+$/.test(hex)) return null;

    // Multicast/broadcast addresses can never identify one device.
    if (parseInt(hex.slice(0, 2), 16) & 1) return null;

    return hex.match(/.{2}/g).join(':');
}

// A DB cell may hold one MAC or several ("aa:..., bb:...").
function extractMacs(value) {
    const found = new Set();

    for (const token of String(value ?? '').match(MAC_PATTERN) || []) {
        const mac = normalizeMac(token);
        if (mac) found.add(mac);
    }

    return [...found];
}

/*
|--------------------------------------------------------------------------
| PURE DECISION LOGIC (no database)
|--------------------------------------------------------------------------
*/

function indexCustomers(customers) {
    const byOnuMac = new Map();
    const byRouterMac = new Map();
    const byPppoe = new Map();

    const put = (map, mac, id) => {
        if (!map.has(mac)) map.set(mac, new Set());
        map.get(mac).add(Number(id));
    };

    for (const customer of customers) {
        for (const mac of extractMacs(customer.onu_mac)) {
            put(byOnuMac, mac, customer.id);
        }

        for (const mac of extractMacs(customer.router_mac)) {
            put(byRouterMac, mac, customer.id);
        }

        const pppoe = String(customer.pppoe_username ?? '').trim();

        if (pppoe) {
            if (!byPppoe.has(pppoe)) byPppoe.set(pppoe, new Set());
            byPppoe.get(pppoe).add(Number(customer.id));
        }
    }

    return { byOnuMac, byRouterMac, byPppoe };
}

function collectEvidence(onu, learnedMacs, index, sessionsByMac) {
    const customers = new Map(); // customerId -> Set(reason)
    let ip = null;

    const add = (set, reason) => {
        for (const id of set || []) {
            if (!customers.has(id)) customers.set(id, new Set());
            customers.get(id).add(reason);
        }
    };

    if (onu.mac) {
        add(index.byOnuMac.get(onu.mac), 'onu_mac=customer.onu_mac');
    }

    // The router-mode ONU dials PPPoE itself, so MikroTik's caller-id is
    // the ONU's own MAC (or a MAC learned behind it).
    for (const mac of [onu.mac, ...learnedMacs]) {
        if (!mac) continue;

        for (const session of sessionsByMac.get(mac) || []) {
            add(
                index.byPppoe.get(session.username),
                'mac=ppp_active.caller_id->pppoe_username'
            );

            if (!ip && session.address) ip = session.address;
        }
    }

    for (const mac of learnedMacs) {
        add(index.byRouterMac.get(mac), 'learned_mac=customer.router_mac');
        add(index.byOnuMac.get(mac), 'learned_mac=customer.onu_mac');
    }

    return { customers, ip };
}

// sessions: [{ mac, username, address }] from MikroTik /ppp/active
function indexSessions(sessions) {
    const byMac = new Map();

    for (const item of sessions || []) {
        const mac = normalizeMac(item.mac);
        const username = String(item.username ?? '').trim();

        if (!mac || !username) continue;

        if (!byMac.has(mac)) byMac.set(mac, []);

        byMac.get(mac).push({
            username,
            address: String(item.address ?? '').trim() || null
        });
    }

    return byMac;
}

/**
 * Decide what to do for every ONU. Pure function: no I/O.
 *
 * @param {object} input
 * @param {Array}  input.onus            [{ id, mac, legacyCustomerId }]
 * @param {Map}    input.learned         onuId -> Set(MAC)
 * @param {Map}    input.mappings        onuId -> customerId|null (rows in onu_user_mapping)
 * @param {Map}    input.linkedElsewhere customerId -> onuId (links of ALL company ONUs)
 * @param {object} input.index           result of indexCustomers()
 */
function decide({
    onus, learned, mappings, linkedElsewhere, index,
    sessionsByMac = new Map(), relinkUnlinked = true
}) {
    const decisions = [];
    const claims = new Map(); // customerId -> [onuId]

    for (const onu of onus) {
        const base = { onuId: onu.id, onuMac: onu.mac || null };

        if (
            mappings.has(onu.id) &&
            (mappings.get(onu.id) != null || !relinkUnlinked)
        ) {
            decisions.push({
                ...base,
                status: mappings.get(onu.id) == null
                    ? 'manually_unlinked'
                    : 'already_linked',
                customerId: mappings.get(onu.id)
            });
            continue;
        }

        if (onu.legacyCustomerId) {
            decisions.push({
                ...base,
                status: 'already_linked',
                customerId: onu.legacyCustomerId
            });
            continue;
        }

        const learnedMacs = [...(learned.get(onu.id) || [])];

        if (!onu.mac && !learnedMacs.length) {
            decisions.push({ ...base, status: 'no_mac', reason: 'ONU has no MAC' });
            continue;
        }

        const { customers: evidence, ip } = collectEvidence(
            onu, learnedMacs, index, sessionsByMac
        );

        if (evidence.size === 0) {
            decisions.push({
                ...base,
                status: 'unmatched',
                reason: 'no customer has this MAC'
            });
            continue;
        }

        if (evidence.size > 1) {
            decisions.push({
                ...base,
                status: 'ambiguous',
                reason: 'MACs match several customers',
                candidates: [...evidence.keys()]
            });
            continue;
        }

        const [customerId] = evidence.keys();

        decisions.push({
            ...base,
            status: 'candidate',
            customerId,
            ip,
            reason: [...evidence.get(customerId)].join(', ')
        });

        if (!claims.has(customerId)) claims.set(customerId, []);
        claims.get(customerId).push(onu.id);
    }

    // Second pass: a customer may be linked to one ONU only.
    for (const decision of decisions) {
        if (decision.status !== 'candidate') continue;

        const rivals = claims.get(decision.customerId) || [];
        const other = linkedElsewhere.get(decision.customerId);

        if (rivals.length > 1) {
            decision.status = 'ambiguous';
            decision.reason =
                'same customer matches several ONUs: ' + rivals.join(', ');
        } else if (other !== undefined && other !== decision.onuId) {
            decision.status = 'conflict';
            decision.reason =
                `customer already linked to ONU ${other}`;
        } else {
            decision.status = 'will_link';
        }
    }

    return decisions;
}

/*
|--------------------------------------------------------------------------
| DATABASE LOADERS
|--------------------------------------------------------------------------
*/

async function loadContext(conn, company, olt, entries, sessions) {
    const [oltRows] = await conn.execute(
        'SELECT id FROM olts WHERE id = ? AND company_id = ? LIMIT 1',
        [olt, company]
    );

    if (!oltRows.length) {
        throw new Error('OLT not found for this company.');
    }

    const [onuRows] = await conn.execute(
        `SELECT
            o.id,
            o.customer_id AS legacy_customer_id,
            COALESCE(
                NULLIF(TRIM(o.onu_mac), ''),
                NULLIF(TRIM(o.mac_address), '')
            ) AS mac
         FROM onu AS o
         WHERE o.olt_id = ?`,
        [olt]
    );

    const onus = onuRows.map(row => ({
        id: Number(row.id),
        mac: normalizeMac(row.mac),
        legacyCustomerId: Number(row.legacy_customer_id) > 0
            ? Number(row.legacy_customer_id)
            : null
    }));

    const [mappingRows] = await conn.execute(
        `SELECT onu_id, customer_id
           FROM onu_user_mapping
          WHERE company_id = ?`,
        [company]
    );

    const mappings = new Map();
    const linkedElsewhere = new Map();

    for (const row of mappingRows) {
        const onuId = Number(row.onu_id);
        const customerId = row.customer_id == null
            ? null
            : Number(row.customer_id);

        mappings.set(onuId, customerId);

        if (customerId) linkedElsewhere.set(customerId, onuId);
    }

    const [legacyRows] = await conn.execute(
        `SELECT o.id, o.customer_id
           FROM onu AS o
           JOIN olts AS ol ON ol.id = o.olt_id
          WHERE ol.company_id = ?
            AND o.customer_id IS NOT NULL
            AND o.customer_id <> 0`,
        [company]
    );

    for (const row of legacyRows) {
        const customerId = Number(row.customer_id);

        if (!linkedElsewhere.has(customerId)) {
            linkedElsewhere.set(customerId, Number(row.id));
        }
    }

    const [customers] = await conn.execute(
        `SELECT id, onu_mac, router_mac, pppoe_username
           FROM customers
          WHERE company_id = ?
            AND deleted_at IS NULL
            AND (
                COALESCE(onu_mac, '') <> ''
                OR COALESCE(router_mac, '') <> ''
                OR COALESCE(pppoe_username, '') <> ''
            )`,
        [company]
    );

    // Learned MACs arrive keyed by ONU MAC; resolve to DB ids inside this OLT.
    const idsByMac = new Map();

    for (const onu of onus) {
        if (!onu.mac) continue;
        if (!idsByMac.has(onu.mac)) idsByMac.set(onu.mac, []);
        idsByMac.get(onu.mac).push(onu.id);
    }

    const learned = new Map();
    const problems = [];

    for (const entry of entries) {
        let onuId = Number(entry.onu_id);

        if (!Number.isInteger(onuId) || onuId <= 0) {
            const mac = normalizeMac(entry.onu_mac);
            const ids = mac ? idsByMac.get(mac) || [] : [];

            if (ids.length !== 1) {
                problems.push({
                    onuMac: entry.onu_mac || null,
                    reason: ids.length > 1
                        ? 'onu_mac_not_unique_in_olt'
                        : 'onu_not_found_in_olt'
                });
                continue;
            }

            onuId = ids[0];
        } else if (!onus.some(onu => onu.id === onuId)) {
            problems.push({ onuId, reason: 'onu_not_in_olt' });
            continue;
        }

        if (!learned.has(onuId)) learned.set(onuId, new Set());

        for (const raw of entry.learned_macs || []) {
            const mac = normalizeMac(raw);
            if (mac) learned.get(onuId).add(mac);
        }
    }

    return {
        onus,
        mappings,
        linkedElsewhere,
        learned,
        problems,
        index: indexCustomers(customers),
        sessionsByMac: indexSessions(sessions),
        customerCount: customers.length
    };
}

/*
|--------------------------------------------------------------------------
| WRITE ONE LINK (inside a transaction, with re-checks)
|--------------------------------------------------------------------------
*/

async function writeLink(conn, company, olt, decision, relinkUnlinked = true) {
    const onuId = decision.onuId;
    const customerId = decision.customerId;

    const [onu] = await conn.execute(
        `SELECT customer_id FROM onu WHERE id = ? AND olt_id = ? FOR UPDATE`,
        [onuId, olt]
    );

    if (!onu.length) return 'onu_missing';

    if (Number(onu[0].customer_id) > 0) return 'already_linked';

    const [existing] = await conn.execute(
        `SELECT customer_id
           FROM onu_user_mapping
          WHERE onu_id = ? AND company_id = ? AND olt_id = ?
          LIMIT 1 FOR UPDATE`,
        [onuId, company, olt]
    );

    const fillEmptyRow =
        existing.length &&
        existing[0].customer_id == null &&
        relinkUnlinked;

    if (existing.length && !fillEmptyRow) {
        return existing[0].customer_id == null
            ? 'manually_unlinked'
            : 'already_linked';
    }

    const [customer] = await conn.execute(
        `SELECT id FROM customers
          WHERE id = ? AND company_id = ? AND deleted_at IS NULL
          LIMIT 1`,
        [customerId, company]
    );

    if (!customer.length) return 'customer_missing';

    const [taken] = await conn.execute(
        `SELECT onu_id FROM onu_user_mapping
          WHERE company_id = ? AND customer_id = ?
          LIMIT 1`,
        [company, customerId]
    );

    if (taken.length) return 'customer_taken';

    const [takenLegacy] = await conn.execute(
        `SELECT o.id
           FROM onu AS o
           JOIN olts AS ol ON ol.id = o.olt_id
          WHERE ol.company_id = ? AND o.customer_id = ?
          LIMIT 1`,
        [company, customerId]
    );

    if (takenLegacy.length) return 'customer_taken';

    try {
        if (fillEmptyRow) {
            const [updated] = await conn.execute(
                `UPDATE onu_user_mapping
                    SET customer_id = ?
                  WHERE onu_id = ? AND company_id = ? AND olt_id = ?
                    AND customer_id IS NULL`,
                [customerId, onuId, company, olt]
            );

            if (updated && updated.affectedRows === 0) {
                return 'already_linked';
            }
        } else {
            await conn.execute(
                `INSERT INTO onu_user_mapping
                    (company_id, olt_id, onu_id, customer_id)
                 VALUES (?, ?, ?, ?)`,
                [company, olt, onuId, customerId]
            );
        }
    } catch (error) {
        if (error && error.code === 'ER_DUP_ENTRY') {
            return 'already_linked';
        }

        throw error;
    }

    // Show the customer's current IP in the ONU list (never overwrite one).
    if (decision.ip) {
        await conn.execute(
            `UPDATE onu SET ip_address = ?
              WHERE id = ? AND olt_id = ?
                AND (ip_address IS NULL OR ip_address = '')`,
            [String(decision.ip).slice(0, 64), onuId, olt]
        );
    }

    return 'linked';
}

/*
|--------------------------------------------------------------------------
| PUBLIC API
|--------------------------------------------------------------------------
*/

/**
 * @param {object} pool  mysql2/promise pool
 * @param {object} opts
 * @param {number} opts.companyId
 * @param {number} opts.oltId
 * @param {Array}  [opts.entries]  [{ onu_mac | onu_id, learned_macs: [] }]
 * @param {Array}  [opts.sessions] [{ mac, username, address }] MikroTik /ppp/active
 * @param {boolean}[opts.dryRun]
 * @param {boolean}[opts.relinkUnlinked] fill NULL placeholder rows (default on)
 */
function defaultRelinkUnlinked() {
    return String(process.env.ONU_AUTO_MAP_RESPECT_UNLINK || 'off')
        .toLowerCase() !== 'on';
}

async function autoMapOnus(pool, {
    companyId, oltId, entries = [], sessions = [], dryRun = false,
    relinkUnlinked = defaultRelinkUnlinked()
}) {
    const company = Number(companyId);
    const olt = Number(oltId);

    if (!Number.isInteger(company) || company <= 0) {
        throw new Error('Valid companyId is required.');
    }

    if (!Number.isInteger(olt) || olt <= 0) {
        throw new Error('Valid oltId is required.');
    }

    if (!Array.isArray(entries)) {
        throw new TypeError('entries must be an array.');
    }

    const conn = await pool.getConnection();

    const report = {
        dryRun: !!dryRun,
        totalOnu: 0,
        linked: 0,
        wouldLink: 0,
        alreadyLinked: 0,
        manuallyUnlinked: 0,
        unmatched: 0,
        ambiguous: 0,
        conflicts: 0,
        noMac: 0,
        skippedAtWrite: 0,
        learnedOnu: 0,
        problems: [],
        details: []
    };

    try {
        const ctx = await loadContext(conn, company, olt, entries, sessions);

        report.totalOnu = ctx.onus.length;
        report.learnedOnu = ctx.learned.size;
        report.problems = ctx.problems.slice(0, 50);

        const decisions = decide({ ...ctx, relinkUnlinked });

        if (!dryRun) await conn.beginTransaction();

        try {
            for (const decision of decisions) {
                switch (decision.status) {
                    case 'already_linked': report.alreadyLinked++; break;
                    case 'manually_unlinked': report.manuallyUnlinked++; break;
                    case 'unmatched': report.unmatched++; break;
                    case 'ambiguous': report.ambiguous++; break;
                    case 'conflict': report.conflicts++; break;
                    case 'no_mac': report.noMac++; break;

                    case 'will_link':
                        if (dryRun) {
                            report.wouldLink++;
                            break;
                        }

                        {
                            const outcome = await writeLink(
                                conn, company, olt, decision, relinkUnlinked
                            );

                            if (outcome === 'linked') {
                                report.linked++;
                                decision.status = 'linked';
                            } else {
                                report.skippedAtWrite++;
                                decision.status = 'skipped';
                                decision.reason = outcome;
                            }
                        }
                        break;
                }

                if (
                    decision.status !== 'already_linked' &&
                    report.details.length < MAX_DETAILS
                ) {
                    report.details.push(decision);
                }
            }

            if (!dryRun) await conn.commit();
        } catch (error) {
            if (!dryRun) await conn.rollback().catch(() => {});
            throw error;
        }

        return report;
    } finally {
        conn.release();
    }
}

module.exports = {
    normalizeMac,
    extractMacs,
    indexCustomers,
    indexSessions,
    decide,
    autoMapOnus
};
