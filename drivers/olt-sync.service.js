
'use strict';

const { EcomDriver, cleanMac } = require('./ecom');
const { CDataDriver } = require('./cdata');

function driverFor(olt) {
    const vendor = String(olt.vendor || '')
        .trim()
        .toLowerCase()
        .replace(/[_\s]+/g, '-');

    const config = {
        ip: olt.ip,
        port: Number(olt.port || 23),
        username: olt.username,
        password: olt.password,
        timeout: Number(olt.timeout || 12)
    };

    if (['ecom', 'e-com', 'ecom-epon'].includes(vendor)) {
        return new EcomDriver(config);
    }

    if (['cdata', 'c-data', 'c-data-epon'].includes(vendor)) {
        return new CDataDriver(config);
    }

    throw new Error(`Unsupported OLT vendor: ${olt.vendor}`);
}

function disconnectDriver(driver) {
    if (driver && typeof driver.disconnect === 'function') {
        return driver.disconnect();
    }
}

async function testConnection(olt) {
    const driver = driverFor(olt);

    try {
        if (typeof driver.testConnection === 'function') {
            return await driver.testConnection();
        }

        await driver.connect();

        if (typeof driver.detectModel === 'function') {
            await driver.detectModel();
        }

        return {
            success: true,
            message: 'OLT connection successful',
            model: driver.model || 'Unknown'
        };
    } finally {
        await disconnectDriver(driver);
    }
}

function normalizeRow(row) {
    const macValue =
        row.mac ??
        row.onu_mac ??
        row.mac_address ??
        '';

    const mac = cleanMac(String(macValue));

    const pon = String(
        row.pon ??
        row.pon_port ??
        row.interface ??
        row.port ??
        ''
    ).trim();

    const ontId = String(
        row.ont_id ??
        row.onu_id ??
        row.id ??
        ''
    ).trim();

    const serial = String(
        row.serial ??
        row.sn ??
        row.onu_sn ??
        row.serial_number ??
        ''
    ).trim();

    const name = String(
        row.name ??
        row.onu_name ??
        (ontId ? `ONU ${ontId}` : '')
    ).trim();

    const rawStatus = String(row.status || 'unknown')
        .trim()
        .toLowerCase();

    let status = 'unknown';

    if (/^(online|up|active|working|registered)$/.test(rawStatus)) {
        status = 'online';
    } else if (/^(offline|down|los|unregistered)$/.test(rawStatus)) {
        status = 'offline';
    }

    return {
        ...row,
        mac,
        pon,
        ont_id: ontId,
        serial: serial || mac || `ONT-${ontId}`,
        name: name || `ONU ${ontId}`,
        status
    };
}

// OLT must already be tenant-scoped before calling these functions.
async function syncOnus(pool, olt) {
    const driver = driverFor(olt);
    let rows;

    try {
        await driver.connect();

        if (typeof driver.detectModel === 'function') {
            await driver.detectModel();
        }

        if (typeof driver.getONUList !== 'function') {
            throw new Error('OLT driver does not implement getONUList().');
        }

        rows = await driver.getONUList();
    } finally {
        await disconnectDriver(driver);
    }

    if (!Array.isArray(rows)) {
        throw new Error('Invalid ONU response: driver did not return an array.');
    }

    if (rows.length === 0) {
        throw new Error(
            'No ONU rows returned. Database was not changed; check OLT CLI output and driver parser.'
        );
    }

    const normalized = rows
        .filter(row => row && typeof row === 'object')
        .map(normalizeRow);

    if (normalized.length === 0) {
        throw new Error('No valid ONU records were returned. Database was not changed.');
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let online = 0;

    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        for (const row of normalized) {
            if (!row.pon || (!row.mac && !row.serial)) {
                skipped++;
                continue;
            }

            if (row.status === 'online') {
                online++;
            }

            const serial = String(row.serial).slice(0, 100);
            const name = String(row.name).slice(0, 255);

            const [found] = await conn.execute(
                `SELECT id
                 FROM onu
                 WHERE olt_id = ?
                   AND (
                     (? <> '' AND UPPER(REPLACE(REPLACE(onu_mac, '-', ':'), ' ', '')) = ?)
                     OR
                     (onu_mac = '' AND pon = ? AND onu_sn = ?)
                   )
                 ORDER BY id
                 LIMIT 1`,
                [olt.id, row.mac, row.mac, row.pon, serial]
            );

            const values = [
                row.pon,
                serial,
                row.mac,
                name,
                row.rx_power ?? null,
                row.tx_power ?? null,
                row.distance == null ? null : String(row.distance),
                row.bias_current == null ? null : String(row.bias_current),
                row.voltage ?? null,
                row.temperature ?? null,
                row.status
            ];

            if (found.length > 0) {
                await conn.execute(
                    `UPDATE onu
                     SET pon = ?,
                         onu_sn = ?,
                         onu_mac = ?,
                         onu_name = ?,
                         rx_power = ?,
                         tx_power = ?,
                         distance = ?,
                         bias_current = ?,
                         voltage = ?,
                         temperature = ?,
                         status = ?,
                         last_seen = IF(? = 'online', NOW(), last_seen),
                         updated_at = NOW()
                     WHERE id = ? AND olt_id = ?`,
                    [...values, row.status, found[0].id, olt.id]
                );

                updated++;
            } else {
                await conn.execute(
                    `INSERT INTO onu (
                        olt_id, pon, onu_sn, onu_mac, onu_name,
                        rx_power, tx_power, distance, bias_current,
                        voltage, temperature, status, last_seen, updated_at
                     ) VALUES (
                        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                        IF(? = 'online', NOW(), NULL), NOW()
                     )`,
                    [olt.id, ...values, row.status]
                );

                inserted++;
            }
        }

        const [counts] = await conn.execute(
            `SELECT
                COUNT(*) AS total,
                COALESCE(SUM(status = 'online'), 0) AS online,
                COALESCE(SUM(status = 'offline'), 0) AS offline
             FROM onu
             WHERE olt_id = ?`,
            [olt.id]
        );

        await conn.execute(
            `UPDATE olts
             SET status = 'online',
                 last_check = NOW(),
                 onu_total = ?,
                 onu_online = ?,
                 onu_offline = ?
             WHERE id = ? AND company_id = ?`,
            [
                Number(counts[0].total || 0),
                Number(counts[0].online || 0),
                Number(counts[0].offline || 0),
                olt.id,
                olt.company_id
            ]
        );

        await conn.commit();

        return {
            success: true,
            found: normalized.length,
            inserted,
            updated,
            skipped,
            online,
            counts: counts[0]
        };
    } catch (error) {
        await conn.rollback();

        try {
            await pool.execute(
                `UPDATE olts
                 SET last_check = NOW()
                 WHERE id = ? AND company_id = ?`,
                [olt.id, olt.company_id]
            );
        } catch (_) {
            // Preserve the original sync error.
        }

        throw error;
    } finally {
        conn.release();
    }
}

module.exports = {
    driverFor,
    testConnection,
    syncOnus
};
