'use strict';

/*
|--------------------------------------------------------------------------
| MikroTik PPPoE sessions (read-only)
|--------------------------------------------------------------------------
| Prefer the MikroTik router assigned to the OLT.
| Customer mikrotik_id is used only as a fallback when no OLT router exists.
|--------------------------------------------------------------------------
*/

function describeError(error) {
    if (typeof error === 'string' && error.trim()) return error.trim();

    const candidates = [
        error && error.message,
        error && error.description,
        error && error.code,
        error && error.errno,
        error && error.name,
        error && error.toString && error.toString()
    ];

    for (const value of candidates) {
        const text = String(value || '').trim();
        if (text && text !== '[object Object]') return text;
    }

    try {
        const serialized = JSON.stringify(error);
        if (serialized && serialized !== '{}') return serialized;
    } catch (_) {
        // Ignore circular/non-serializable error objects.
    }

    return 'Unknown MikroTik API error (the driver returned no error details).';
}

async function collectPppSessions(
    pool,
    companyId,
    mikrotik,
    preferredRouterId = null
) {
    const result = { sessions: [], routers: 0, errors: [] };

    if (
        !mikrotik ||
        typeof mikrotik.router !== 'function' ||
        typeof mikrotik.active !== 'function'
    ) {
        result.errors.push('mikrotik service unavailable');
        return result;
    }

    let routerIds = [];

    if (
        preferredRouterId !== null &&
        preferredRouterId !== undefined &&
        String(preferredRouterId).trim() !== ''
    ) {
        const routerId = Number(preferredRouterId);

        if (!Number.isInteger(routerId) || routerId <= 0) {
            result.errors.push('Invalid OLT MikroTik router ID');
            return result;
        }

        const [rows] = await pool.execute(
            `SELECT id
               FROM mikrotik_servers
              WHERE id = ?
                AND company_id = ?
                AND deleted_at IS NULL
              LIMIT 1`,
            [routerId, Number(companyId)]
        );

        if (!rows.length) {
            result.errors.push(
                `OLT MikroTik router ${routerId} not found for company`
            );
            return result;
        }

        routerIds = [routerId];

        // Customers can sit behind other MikroTiks than the OLT's own router.
        // Matching is MAC based, so reading extra routers cannot mis-link.
        const [others] = await pool.execute(
            `SELECT DISTINCT c.mikrotik_id
               FROM customers AS c
               JOIN mikrotik_servers AS m ON m.id = c.mikrotik_id
                                         AND m.company_id = c.company_id
                                         AND m.deleted_at IS NULL
              WHERE c.company_id = ?
                AND c.deleted_at IS NULL
                AND c.mikrotik_id IS NOT NULL`,
            [Number(companyId)]
        );

        for (const row of others) {
            const id = Number(row.mikrotik_id);

            if (Number.isInteger(id) && id > 0 && !routerIds.includes(id)) {
                routerIds.push(id);
            }
        }
    } else {
        const [rows] = await pool.execute(
            `SELECT DISTINCT mikrotik_id
               FROM customers
              WHERE company_id = ?
                AND deleted_at IS NULL
                AND mikrotik_id IS NOT NULL
                AND mikrotik_id <> ''`,
            [Number(companyId)]
        );

        routerIds = rows
            .map(row => Number(row.mikrotik_id))
            .filter(id => Number.isInteger(id) && id > 0);
    }

    for (const routerId of routerIds) {
        try {
            const router = await mikrotik.router(routerId);
            const active = await mikrotik.active(router);

            result.routers++;

            for (const item of active || []) {
                result.sessions.push({
                    mac: item['caller-id'] || item.callerId || '',
                    username: item.name || item.username || '',
                    address: item.address || '',
                    routerId: String(routerId)
                });
            }
        } catch (error) {
            result.errors.push(
                `router ${routerId}: ${describeError(error)}`
            );
        }
    }

    return result;
}

function loadMikrotikService() {
    for (const path of [
        '../../services/mikrotik.service',
        '../../services/mikrotik/mikrotik.service',
        '../../mikrotik.service'
    ]) {
        try {
            return require(path);
        } catch (error) {
            if (
                error.code !== 'MODULE_NOT_FOUND' ||
                !String(error.message).includes(path.replace('../', ''))
            ) {
                throw error;
            }
        }
    }

    return null;
}

module.exports = {
    collectPppSessions,
    loadMikrotikService,
    describeError
};