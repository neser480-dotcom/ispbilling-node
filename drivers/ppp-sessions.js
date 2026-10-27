'use strict';

/*
|--------------------------------------------------------------------------
| MikroTik PPPoE sessions (read-only)
|--------------------------------------------------------------------------
| /ppp/active rows carry the client MAC in "caller-id", the PPPoE name in
| "name" and the assigned IP in "address". The router ids come from the
| company's own customers, so no other tenant's router is ever contacted.
| Failures are non-fatal: auto-mapping then simply works without sessions.
|--------------------------------------------------------------------------
*/

async function collectPppSessions(pool, companyId, mikrotik) {
    const result = { sessions: [], routers: 0, errors: [] };

    if (!mikrotik || typeof mikrotik.router !== 'function' ||
        typeof mikrotik.active !== 'function') {
        result.errors.push('mikrotik service unavailable');
        return result;
    }

    const [rows] = await pool.execute(
        `SELECT DISTINCT mikrotik_id
           FROM customers
          WHERE company_id = ?
            AND deleted_at IS NULL
            AND mikrotik_id IS NOT NULL
            AND mikrotik_id <> ''`,
        [Number(companyId)]
    );

    for (const row of rows) {
        try {
            const router = await mikrotik.router(row.mikrotik_id);
            const active = await mikrotik.active(router);

            result.routers++;

            for (const item of active) {
                result.sessions.push({
                    mac: item['caller-id'],
                    username: item.name,
                    address: item.address
                });
            }
        } catch (error) {
            result.errors.push(`router ${row.mikrotik_id}: ${error.message}`);
        }
    }

    return result;
}

// The MikroTik service path differs per project layout; stay optional.
function loadMikrotikService() {
    for (const path of [
        '../services/mikrotik.service',
        '../services/mikrotik/mikrotik.service',
        '../mikrotik.service'
    ]) {
        try {
            return require(path);
        } catch (error) {
            if (error.code !== 'MODULE_NOT_FOUND' ||
                !String(error.message).includes(path.replace('../', ''))) {
                throw error;
            }
        }
    }

    return null;
}

module.exports = { collectPppSessions, loadMikrotikService };
