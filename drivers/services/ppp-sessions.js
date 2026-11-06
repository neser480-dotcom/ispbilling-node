'use strict';

/*
|--------------------------------------------------------------------------
| MikroTik PPPoE sessions (read-only)
|--------------------------------------------------------------------------
| Prefer the MikroTik router assigned to the OLT.
| Customer mikrotik_id is used only as a fallback when no OLT router exists.
|--------------------------------------------------------------------------
*/

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
                `router ${routerId}: ${error.message}`
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
    loadMikrotikService
};