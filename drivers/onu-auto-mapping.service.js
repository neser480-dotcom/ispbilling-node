
'use strict';

/*
|--------------------------------------------------------------------------
| ONU -> CUSTOMER AUTO MAPPING
|--------------------------------------------------------------------------
| Primary link:
|   onu_user_mapping - one customer per ONU
|
| Multi-customer PPP links:
|   onu_ppp_info - one row per company/customer
|
| Safety:
|   - Exact PPPoE username matching only.
|   - Multiple customers per ONU are allowed in onu_ppp_info.
|   - Ambiguous primary links are never guessed.
|   - Customers are never silently moved between ONUs.
|   - Existing primary links and manual unlink behavior are preserved.
|   - Dry-run performs no database writes.
|   - Recoverable per-ONU errors are reported and processing continues.
|--------------------------------------------------------------------------
*/

const MAC_PATTERN =
    /\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b|\b(?:[0-9a-f]{4}\.){2}[0-9a-f]{4}\b|\b[0-9a-f]{12}\b/gi;

const MAX_DETAILS = 500;
const MAX_ERRORS = 200;

function normalizeMac(value) {
    const hex = String(value ?? '')
        .replace(/[^0-9a-f]/gi, '')
        .toUpperCase();

    if (hex.length !== 12) return null;
    if (/^0+$/.test(hex) || /^F+$/.test(hex)) return null;

    // Reject multicast MAC addresses.
    if (parseInt(hex.slice(0, 2), 16) & 1) return null;

    return hex.match(/.{2}/g).join(':');
}

function extractMacs(value) {
    const found = new Set();

    for (const token of String(value ?? '').match(MAC_PATTERN) || []) {
        const mac = normalizeMac(token);
        if (mac) found.add(mac);
    }

    return [...found];
}

function indexCustomers(customers) {
    const byOnuMac = new Map();
    const byRouterMac = new Map();
    const byPppoe = new Map();
    const byId = new Map();

    const put = (map, key, id) => {
        if (!map.has(key)) map.set(key, new Set());
        map.get(key).add(Number(id));
    };

    for (const customer of customers || []) {
        const id = Number(customer.id);

        if (!Number.isInteger(id) || id <= 0) continue;

        const username = String(customer.pppoe_username || '').trim();

        byId.set(id, {
            id,
            pppoe_username: username,
            mikrotik_id: customer.mikrotik_id == null
                ? null
                : String(customer.mikrotik_id)
        });

        for (const mac of extractMacs(customer.onu_mac)) {
            put(byOnuMac, mac, id);
        }

        for (const mac of extractMacs(customer.router_mac)) {
            put(byRouterMac, mac, id);
        }

        if (username) put(byPppoe, username, id);
    }

    return { byOnuMac, byRouterMac, byPppoe, byId };
}

function indexSessions(sessions) {
    const byMac = new Map();

    for (const item of sessions || []) {
        const mac = normalizeMac(item.mac);
        const username = String(item.username ?? '').trim();

        if (!mac || !username) continue;

        if (!byMac.has(mac)) byMac.set(mac, []);

        byMac.get(mac).push({
            mac,
            username,
            routerId: item.routerId == null
                ? null
                : String(item.routerId),
            address: String(item.address ?? '').trim() || null
        });
    }

    return byMac;
}

/*
|--------------------------------------------------------------------------
| PRIMARY LINK EVIDENCE
|--------------------------------------------------------------------------
*/

function collectEvidence(onu, learnedMacs, index, sessionsByMac) {
    const customers = new Map();
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

    for (const mac of [onu.mac, ...learnedMacs]) {
        if (!mac) continue;

        for (const session of sessionsByMac.get(mac) || []) {
            add(
                index.byPppoe.get(session.username),
                'caller_id->pppoe_username'
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

/*
|--------------------------------------------------------------------------
| PRIMARY LINK DECISIONS
|--------------------------------------------------------------------------
| Multiple matches are ambiguous only for the single primary link.
| Multi-customer PPP mapping is handled separately below.
|--------------------------------------------------------------------------
*/

function decide({
    onus,
    learned,
    mappings,
    linkedElsewhere,
    index,
    sessionsByMac = new Map(),
    relinkUnlinked = true
}) {
    const decisions = [];
    const claims = new Map();

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
            decisions.push({
                ...base,
                status: 'no_mac',
                reason: 'ONU has no MAC'
            });
            continue;
        }

        const { customers: evidence, ip } = collectEvidence(
            onu,
            learnedMacs,
            index,
            sessionsByMac
        );

        if (evidence.size === 0) {
            decisions.push({
                ...base,
                status: 'unmatched',
                reason: 'no customer has matching MAC/PPPoE evidence'
            });
            continue;
        }

        if (evidence.size > 1) {
            decisions.push({
                ...base,
                status: 'ambiguous',
                reason: 'multiple customers match; primary link not selected',
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
            decision.reason = `customer already linked to ONU ${other}`;
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
        `SELECT id
           FROM olts
          WHERE id = ? AND company_id = ?
          LIMIT 1`,
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
        `SELECT m.onu_id, m.customer_id
           FROM onu_user_mapping AS m
           JOIN onu AS o ON o.id = m.onu_id
                         AND o.olt_id = m.olt_id
           JOIN olts AS ol ON ol.id = m.olt_id
                          AND ol.company_id = m.company_id
                          AND ol.deleted_at IS NULL
          WHERE m.company_id = ?`,
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
                          AND ol.deleted_at IS NULL
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
        `SELECT id, onu_mac, router_mac, pppoe_username, mikrotik_id
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

    const idsByMac = new Map();

    for (const onu of onus) {
        if (!onu.mac) continue;

        if (!idsByMac.has(onu.mac)) idsByMac.set(onu.mac, []);
        idsByMac.get(onu.mac).push(onu.id);
    }

    const learned = new Map();
    const problems = [];

    for (const entry of entries || []) {
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
| SAVEPOINT HELPERS
|--------------------------------------------------------------------------
| Savepoints isolate recoverable row-level failures inside a live
| transaction. A lost DB connection/transaction still aborts the run.
|--------------------------------------------------------------------------
*/

async function createSavepoint(conn, dryRun) {
    if (dryRun) return false;
    await conn.query('SAVEPOINT onu_mapping_item');
    return true;
}

async function rollbackSavepoint(conn, enabled) {
    if (!enabled) return;

    await conn.query('ROLLBACK TO SAVEPOINT onu_mapping_item');
}

/*
|--------------------------------------------------------------------------
| WRITE PRIMARY LINK
|--------------------------------------------------------------------------
*/

async function writeLink(conn, company, olt, decision, relinkUnlinked = true) {
    const { onuId, customerId } = decision;

    const [onu] = await conn.execute(
        `SELECT customer_id
           FROM onu
          WHERE id = ? AND olt_id = ?
          FOR UPDATE`,
        [onuId, olt]
    );

    if (!onu.length) return 'onu_missing';
    if (Number(onu[0].customer_id) > 0) return 'already_linked';

    const [existing] = await conn.execute(
        `SELECT customer_id
           FROM onu_user_mapping
          WHERE onu_id = ? AND company_id = ? AND olt_id = ?
          LIMIT 1
          FOR UPDATE`,
        [onuId, company, olt]
    );

    const fillEmptyRow = existing.length &&
        existing[0].customer_id == null &&
        relinkUnlinked;

    if (existing.length && !fillEmptyRow) {
        return existing[0].customer_id == null
            ? 'manually_unlinked'
            : 'already_linked';
    }

    const [customer] = await conn.execute(
        `SELECT id
           FROM customers
          WHERE id = ? AND company_id = ? AND deleted_at IS NULL
          LIMIT 1`,
        [customerId, company]
    );

    if (!customer.length) return 'customer_missing';

    const [taken] = await conn.execute(
        `SELECT m.onu_id
           FROM onu_user_mapping AS m
           JOIN onu AS o ON o.id = m.onu_id
                         AND o.olt_id = m.olt_id
           JOIN olts AS ol ON ol.id = m.olt_id
                          AND ol.company_id = m.company_id
                          AND ol.deleted_at IS NULL
          WHERE m.company_id = ? AND m.customer_id = ?
          LIMIT 1`,
        [company, customerId]
    );

    if (taken.length) return 'customer_taken';

    const [takenLegacy] = await conn.execute(
        `SELECT o.id
           FROM onu AS o
           JOIN olts AS ol ON ol.id = o.olt_id
                          AND ol.deleted_at IS NULL
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

            if (!updated.affectedRows) return 'already_linked';
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

    if (decision.ip) {
        await conn.execute(
            `UPDATE onu
                SET ip_address = ?
              WHERE id = ? AND olt_id = ?
                AND (ip_address IS NULL OR ip_address = '')`,
            [String(decision.ip).slice(0, 64), onuId, olt]
        );
    }

    return 'linked';
}

/*
|--------------------------------------------------------------------------
| MULTI-CUSTOMER PPP MAPPING
|--------------------------------------------------------------------------
| A single ONU may serve many PPPoE customers behind a switch.
| Each exact, uniquely identified username is saved separately.
|--------------------------------------------------------------------------
*/

async function writeOnuPppInfo(
    conn,
    company,
    olt,
    onuId,
    onuMac,
    learnedMacs,
    index,
    sessionsByMac,
    dryRun = false,
    linkedElsewhere = new Map()
) {
    const macs = new Set(
        [onuMac, ...(learnedMacs || [])]
            .map(normalizeMac)
            .filter(Boolean)
    );

    const matches = new Map();

    for (const mac of macs) {
        for (const session of sessionsByMac.get(mac) || []) {
            const username = String(session.username || '').trim();
            const ids = index.byPppoe.get(username);

            // Never guess if one PPPoE username belongs to multiple rows.
            if (!ids || ids.size !== 1) continue;

            const customerId = [...ids][0];

            if (!matches.has(customerId)) {
                matches.set(customerId, {
                    customerId,
                    username,
                    callerId: session.mac,
                    ip: session.address || null
                });
            }
        }
    }

    const result = {
        matched: matches.size,
        customerIds: [...matches.keys()],
        saved: 0,
        conflicts: 0,
        dryRun: !!dryRun
    };

    for (const item of matches.values()) {
        // A customer already linked to another ONU is never moved here.
        const primaryOnu = linkedElsewhere.get(item.customerId);

        if (primaryOnu !== undefined && Number(primaryOnu) !== Number(onuId)) {
            result.conflicts++;
            continue;
        }

        const [existing] = await conn.execute(
            `SELECT p.id, p.olt_id, p.onu_id, p.customer_id,
                    p.pppoe_username, p.caller_id, p.ip_address,
                    p.updated_at,
                    old_olt.id AS active_olt_id
               FROM onu_ppp_info AS p
               LEFT JOIN olts AS old_olt
                 ON old_olt.id = p.olt_id
                AND old_olt.company_id = p.company_id
                AND old_olt.deleted_at IS NULL
              WHERE p.company_id = ? AND p.customer_id = ?
              LIMIT 1
              FOR UPDATE`,
            [company, item.customerId]
        );

        if (
            existing.length &&
            Number(existing[0].onu_id) !== Number(onuId)
        ) {
            // Never move a customer away from another active OLT.
            if (existing[0].active_olt_id != null) {
                result.conflicts++;
                continue;
            }

            if (dryRun) {
                result.saved++;
                continue;
            }

            const old = existing[0];

            // Preserve the previous current mapping before replacing it.
            await conn.execute(
                `INSERT INTO onu_ppp_info_history
                    (source_id, company_id, olt_id, onu_id, customer_id,
                     pppoe_username, caller_id, ip_address,
                     original_updated_at, replaced_by_olt_id,
                     replaced_by_onu_id, reason)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    old.id,
                    company,
                    old.olt_id,
                    old.onu_id,
                    old.customer_id,
                    old.pppoe_username,
                    old.caller_id,
                    old.ip_address,
                    old.updated_at,
                    olt,
                    onuId,
                    'olt_remap'
                ]
            );

            // Keep the same current row; only move its active mapping.
            const [updated] = await conn.execute(
                `UPDATE onu_ppp_info
                    SET olt_id = ?, onu_id = ?, pppoe_username = ?,
                        caller_id = ?, ip_address = ?
                  WHERE id = ? AND company_id = ? AND customer_id = ?`,
                [
                    olt,
                    onuId,
                    item.username,
                    item.callerId,
                    item.ip,
                    old.id,
                    company,
                    item.customerId
                ]
            );

            if (!updated.affectedRows) {
                throw new Error(
                    `Could not update PPP mapping for customer ${item.customerId}`
                );
            }

            result.saved++;
            continue;
        }

        if (dryRun) {
            result.saved++;
            continue;
        }

        if (existing.length) {
            await conn.execute(
                `UPDATE onu_ppp_info
                    SET olt_id = ?, onu_id = ?, pppoe_username = ?,
                        caller_id = ?, ip_address = ?
                  WHERE id = ? AND company_id = ? AND customer_id = ?`,
                [
                    olt,
                    onuId,
                    item.username,
                    item.callerId,
                    item.ip,
                    existing[0].id,
                    company,
                    item.customerId
                ]
            );
        } else {
            await conn.execute(
                `INSERT INTO onu_ppp_info
                    (company_id, olt_id, onu_id, customer_id,
                     pppoe_username, caller_id, ip_address)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    company,
                    olt,
                    onuId,
                    item.customerId,
                    item.username,
                    item.callerId,
                    item.ip
                ]
            );
        }

        result.saved++;
    }

    return result;
}

/*
|--------------------------------------------------------------------------
| PUBLIC API
|--------------------------------------------------------------------------
*/

function defaultRelinkUnlinked() {
    return String(process.env.ONU_AUTO_MAP_RESPECT_UNLINK || 'off')
        .toLowerCase() !== 'on';
}

async function autoMapOnus(pool, {
    companyId,
    oltId,
    entries = [],
    sessions = [],
    dryRun = false,
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

    if (!Array.isArray(sessions)) {
        throw new TypeError('sessions must be an array.');
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
        multiOnu: 0,
        multiCustomers: 0,
        pppMatched: 0,
        pppSaved: 0,
        pppConflicts: 0,
        pppWriteErrors: 0,
        linkErrors: 0,
        problems: [],
        errors: [],
        details: []
    };

    const addError = (phase, onuId, error) => {
        if (report.errors.length >= MAX_ERRORS) return;

        report.errors.push({
            phase,
            onuId: onuId == null ? null : Number(onuId),
            message: String(error && error.message || error || 'Unknown error')
                .slice(0, 500),
            code: error && error.code || null
        });
    };

    let transactionStarted = false;

    try {
        const ctx = await loadContext(
            conn, company, olt, entries, sessions
        );

        report.totalOnu = ctx.onus.length;
        report.learnedOnu = ctx.learned.size;
        report.problems = ctx.problems.slice(0, 50);

        const decisions = decide({ ...ctx, relinkUnlinked });

        if (!dryRun) {
            await conn.beginTransaction();
            transactionStarted = true;
        }

        /*
         * First pass: save multi-customer PPP information.
         * One recoverable ONU error should not stop the next ONU.
         */
        const decisionByOnu = new Map(
            decisions.map(item => [item.onuId, item])
        );

        for (const onu of ctx.onus) {
            const decision = decisionByOnu.get(onu.id);

            if (
                decision &&
                decision.status === 'manually_unlinked' &&
                !relinkUnlinked
            ) {
                continue;
            }

            let savepoint = false;

            try {
                savepoint = await createSavepoint(conn, !!dryRun);

                const pppResult = await writeOnuPppInfo(
                    conn,
                    company,
                    olt,
                    onu.id,
                    onu.mac,
                    [...(ctx.learned.get(onu.id) || [])],
                    ctx.index,
                    ctx.sessionsByMac,
                    !!dryRun,
                    ctx.linkedElsewhere
                );

                report.pppMatched += pppResult.matched;
                report.pppSaved += pppResult.saved;
                report.pppConflicts += pppResult.conflicts;

                if (decision && pppResult.matched) {
                    decision.ppp = pppResult;

                    // Several customers behind one ONU (switch): every
                    // candidate is proven by its own PPPoE session.
                    if (
                        decision.status === 'ambiguous' &&
                        Array.isArray(decision.candidates) &&
                        decision.candidates.every(id =>
                            pppResult.customerIds.includes(Number(id))
                        )
                    ) {
                        decision.status = 'multi';
                        decision.reason =
                            `switch ONU: ${pppResult.customerIds.length} customers`;
                        decision.customers = pppResult.customerIds;
                    }
                }

                if (savepoint) {
                    await conn.query('RELEASE SAVEPOINT onu_mapping_item');
                }
            } catch (error) {
                report.pppWriteErrors++;
                addError('ppp_mapping', onu.id, error);

                if (savepoint) {
                    try {
                        await rollbackSavepoint(conn, true);
                        await conn.query(
                            'RELEASE SAVEPOINT onu_mapping_item'
                        );
                    } catch (rollbackError) {
                        // Connection/transaction may be unusable.
                        throw new Error(
                            `ONU ${onu.id} PPP mapping failed and its ` +
                            `savepoint could not be recovered: ` +
                            String(rollbackError.message || rollbackError)
                        );
                    }
                }
            }
        }

        /*
         * Second pass: single primary link.
         * Ambiguous decisions are counted and skipped, not fatal.
         */
        for (const decision of decisions) {
            switch (decision.status) {
                case 'already_linked':
                    report.alreadyLinked++;
                    break;

                case 'manually_unlinked':
                    report.manuallyUnlinked++;
                    break;

                case 'unmatched':
                    report.unmatched++;
                    break;

                case 'ambiguous':
                    report.ambiguous++;
                    break;

                case 'multi':
                    report.multiOnu++;
                    report.multiCustomers += decision.customers.length;
                    break;

                case 'conflict':
                    report.conflicts++;
                    break;

                case 'no_mac':
                    report.noMac++;
                    break;

                case 'will_link':
                    if (dryRun) {
                        report.wouldLink++;
                        break;
                    }

                    {
                        let savepoint = false;

                        try {
                            savepoint = await createSavepoint(conn, false);

                            const outcome = await writeLink(
                                conn,
                                company,
                                olt,
                                decision,
                                relinkUnlinked
                            );

                            if (outcome === 'linked') {
                                report.linked++;
                                decision.status = 'linked';
                            } else {
                                report.skippedAtWrite++;
                                decision.status = 'skipped';
                                decision.reason = outcome;
                            }

                            await conn.query(
                                'RELEASE SAVEPOINT onu_mapping_item'
                            );
                        } catch (error) {
                            report.linkErrors++;
                            addError('primary_link', decision.onuId, error);

                            if (savepoint) {
                                try {
                                    await rollbackSavepoint(conn, true);
                                    await conn.query(
                                        'RELEASE SAVEPOINT onu_mapping_item'
                                    );
                                } catch (rollbackError) {
                                    throw new Error(
                                        `ONU ${decision.onuId} primary link ` +
                                        `failed and its savepoint could not ` +
                                        `be recovered: ` +
                                        String(
                                            rollbackError.message || rollbackError
                                        )
                                    );
                                }
                            }

                            report.skippedAtWrite++;
                            decision.status = 'skipped';
                            decision.reason = 'write_error';
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

        if (!dryRun) {
            await conn.commit();
            transactionStarted = false;
        }

        return report;
    } catch (error) {
        if (transactionStarted) {
            await conn.rollback().catch(() => {});
            transactionStarted = false;
        }

        throw error;
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


