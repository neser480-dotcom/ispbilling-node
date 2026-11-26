
'use strict';

const { EcomDriver, cleanMac } = require('../hardware/ecom');
const { CDataDriver } = require('../hardware/cdata');
const { BdcomDriver } = require('../hardware/bdcom');
const { VsolDriver } = require('../hardware/vsol');
const { HiosoDriver } = require('../hardware/hioso');
const { HsgqDriver } = require('../hardware/hsgq');
const { ZteEponDriver } = require('../hardware/zte-epon');

/*
|--------------------------------------------------------------------------
| OLT DRIVER
|--------------------------------------------------------------------------
*/

function driverFor(olt) {
    const vendor = String(olt.vendor || '')
        .trim()
        .toLowerCase()
        .replace(/[_\s]+/g, '-');

    // Normalize vendor labels such as Hioso EPON / ZTE-EPON.
    const key = vendor.replace(/[^a-z0-9]/g, '');

    const config = {
        ip: olt.ip,
        port: Number(olt.port || 23),
        username: olt.username,
        password: olt.password,
        timeout: Number(olt.timeout || 12),
        community: olt.community || olt.snmp_community || olt.snmp_read_community || '',
        snmpPort: Number(olt.snmp_port || olt.port) && Number(olt.snmp_port || olt.port) !== 23
            ? Number(olt.snmp_port || olt.port)
            : 161,
        snmpVersion: olt.snmp_version || '2c'
    };

    if (['ecom', 'e-com', 'ecom-epon'].includes(vendor) || ['ecom', 'ecomepon'].includes(key)) {
        return new EcomDriver(config);
    }

    if (['cdata', 'c-data', 'c-data-epon'].includes(vendor) || ['cdata', 'cdataepon'].includes(key)) {
        return new CDataDriver(config);
    }

    if (['hioso', 'hiosoepon'].includes(key)) {
        return new HiosoDriver(config);
    }

    if (['hsgq', 'hsgqepon', 'hsgqgpon'].includes(key)) {
        return new HsgqDriver(config);
    }

    if (['zte', 'zteepon'].includes(key)) {
        return new ZteEponDriver(config);
    }

    if (['bdcom', 'bd-com', 'bdcom-epon', 'bdcom-olt'].includes(vendor) || ['bdcom', 'bdcomepon', 'bdcomolt'].includes(key)) {
        return new BdcomDriver(config);
    }

    if (['vsol', 'v-sol', 'vsol-epon'].includes(vendor) || ['vsol', 'vsolepon'].includes(key)) {
        return new VsolDriver(config);
    }

    throw new Error(`Unsupported OLT vendor: ${olt.vendor}`);
}

async function disconnectDriver(driver) {
    if (driver && typeof driver.disconnect === 'function') {
        await driver.disconnect();
    }
}

/*
|--------------------------------------------------------------------------
| CONNECTION TEST
|--------------------------------------------------------------------------
*/

async function testConnection(olt) {
    const driver = driverFor(olt);

    try {
        if (typeof driver.testConnection === 'function') {
            return await driver.testConnection();
        }

        await driver.connect();

        let info = {};

        if (typeof driver.detectModel === 'function') {
            info = await driver.detectModel() || {};
        }

        return {
            success: true,
            message: 'OLT connection successful',
            model: info.model || driver.model || 'Unknown'
        };
    } finally {
        await disconnectDriver(driver);
    }
}

/*
|--------------------------------------------------------------------------
| NORMALIZATION HELPERS
|--------------------------------------------------------------------------
*/

function nullableText(value, maxLength = 100) {
    if (value === null || value === undefined) {
        return null;
    }

    const result = String(value).trim();

    if (!result || result === '-' || result === '—') {
        return null;
    }

    return result.slice(0, maxLength);
}

function nullableNumber(value) {
    if (
        value === null ||
        value === undefined ||
        value === ''
    ) {
        return null;
    }

    const text = String(value).trim();

    if (!text || text === '-' || text === '—') {
        return null;
    }

    const number = Number(text);

    return Number.isFinite(number) ? number : null;
}

/*
 * Real slot/port label shown on the OLT Users page.
 * Drivers return pon as a plain number plus f_s ("0/1"), so
 *   Ecom  -> epon0/1/2
 *   CData -> pon0/0/2
 * A value that already looks like a label is kept as it is.
 */
function ponLabel(row, olt) {
    const raw = String(row.pon ?? '').trim();
    const fs = String(row.f_s ?? row.fs ?? '').trim();

    if (!/^\d+$/.test(raw) || !/^\d+\/\d+$/.test(fs)) {
        return raw;
    }

    const vendor = String((olt && olt.vendor) || '').toLowerCase();
    const prefix = vendor.includes('cdata') ? 'pon' : 'epon';

    return `${prefix}${fs}/${raw}`;
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

    const originalSerial = nullableText(
        row.serial ??
        row.sn ??
        row.onu_sn ??
        row.serial_number ??
        '',
        100
    );

    const serial = originalSerial || mac || '';

    const name = nullableText(
        row.name ??
        row.onu_name ??
        (ontId ? `ONU ${ontId}` : ''),
        255
    ) || (ontId ? `ONU ${ontId}` : 'ONU');

    const rawStatus = String(
        row.status ??
        row.run_state ??
        'unknown'
    ).trim().toLowerCase();

    let status = 'unknown';

    if (
        /^(online|up|active|working|registered)$/.test(rawStatus)
    ) {
        status = 'online';
    } else if (
        /^(offline|down|los|inactive|unregistered)$/.test(rawStatus)
    ) {
        status = 'offline';
    }

    return {
        ...row,
        mac,
        pon,
        ont_id: ontId,
        serial,
        name,
        status,
        rx_power: nullableNumber(row.rx_power),
        tx_power: nullableNumber(row.tx_power),
        distance: nullableNumber(row.distance),
        bias_current: nullableNumber(
            row.bias_current ?? row.laser_bias
        ),
        voltage: nullableNumber(row.voltage),
        temperature: nullableNumber(row.temperature)
    };
}

/*
|--------------------------------------------------------------------------
| ONU MATCHING
|--------------------------------------------------------------------------
| 1. Match by MAC first.
| 2. If MAC is unavailable, match by PON + serial.
| 3. Never choose arbitrarily when multiple records match.
|--------------------------------------------------------------------------
*/

async function findExistingOnu(conn, oltId, row) {
    if (row.mac) {
        const [matches] = await conn.execute(
            `SELECT id
             FROM onu
             WHERE olt_id = ?
               AND UPPER(
                   REPLACE(
                       REPLACE(
                           REPLACE(
                               COALESCE(onu_mac, ''),
                               '-', ':'
                           ),
                           ' ', ''
                       ),
                       '.', ':'
                   )
               ) = ?
             ORDER BY id
             LIMIT 2`,
            [oltId, row.mac]
        );

        if (matches.length > 1) {
            throw new Error(
                `Ambiguous ONU MAC match: ${row.mac}; OLT ${oltId}`
            );
        }

        if (matches.length === 1) {
            return matches[0].id;
        }

        // MAC is present but unmatched. Do not guess a different
        // ONU using serial or ONT ID.
        return null;
    }

    if (!row.serial || !row.pon) {
        return null;
    }

    const [matches] = await conn.execute(
        `SELECT id
         FROM onu
         WHERE olt_id = ?
           AND CAST(pon AS CHAR) = ?
           AND COALESCE(onu_mac, '') = ''
           AND onu_sn = ?
         ORDER BY id
         LIMIT 2`,
        [oltId, row.pon, row.serial]
    );

    if (matches.length > 1) {
        throw new Error(
            `Ambiguous ONU serial match: ${row.serial}; ` +
            `PON ${row.pon}, OLT ${oltId}`
        );
    }

    return matches.length === 1 ? matches[0].id : null;
}

/*
|--------------------------------------------------------------------------
| SYNC
|--------------------------------------------------------------------------
| The OLT must be tenant-scoped before this service is called.
| Existing customer_id values are intentionally never modified.
|--------------------------------------------------------------------------
*/

async function syncOnus(pool, olt) {
    if (!olt || !olt.id || !olt.company_id) {
        throw new Error(
            'Invalid OLT context: OLT ID and company ID are required.'
        );
    }

    const driver = driverFor(olt);
    let rows;
    let learned = { supported: false, entries: [], errors: [] };
    let opticalErrors = [];

    try {
        await driver.connect();

        if (typeof driver.detectModel === 'function') {
            await driver.detectModel();
        }

        if (typeof driver.getONUList !== 'function') {
            throw new Error(
                'OLT driver does not implement getONUList().'
            );
        }

        rows = await driver.getONUList();
        opticalErrors = Array.isArray(driver.opticalErrors)
            ? driver.opticalErrors.slice(0, 10)
            : [];

        /*
         * Learned MACs are optional. A failure here must never affect the
         * ONU list that was just read.
         */
        if (
            Array.isArray(rows) &&
            rows.length &&
            typeof driver.getLearnedMacs === 'function'
        ) {
            try {
                learned = await driver.getLearnedMacs(rows);
            } catch (error) {
                learned = {
                    supported: false,
                    entries: [],
                    errors: [error.message]
                };
            }
        }
    } finally {
        await disconnectDriver(driver);
    }

    if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error(
            'No ONU rows returned. Database was not changed; ' +
            'check the OLT connection and parser.'
        );
    }

    const normalized = rows
        .filter(row => row && typeof row === 'object')
        .map(row => {
            const item = normalizeRow(row);
            item.pon = ponLabel(item, olt);
            return item;
        });

    if (!normalized.length) {
        throw new Error(
            'No valid ONU records were returned. Database was not changed.'
        );
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let online = 0;
    let unknownStatus = 0;

    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        for (const row of normalized) {
            if (
                !row.pon ||
                (!row.mac && !row.serial)
            ) {
                skipped++;
                continue;
            }

            if (row.status === 'online') {
                online++;
            }

            if (row.status === 'unknown') {
                unknownStatus++;
            }

            const serial = row.serial || row.mac || '';
            const name = row.name;

            const existingId = await findExistingOnu(
                conn,
                olt.id,
                row
            );

            if (existingId) {
                /*
                 * Preserve previous numeric readings when the new
                 * response has no valid value.
                 *
                 * COALESCE preserves legitimate zero values.
                 * An unknown status does not erase a known status.
                 *
                 * Customer linkage and other unrelated fields are
                 * intentionally left untouched.
                 */

                await conn.execute(
                    `UPDATE onu
                     SET
                         pon = ?,
                         onu_sn = CASE
                             WHEN ? <> '' THEN ?
                             ELSE onu_sn
                         END,
                         onu_mac = CASE
                             WHEN ? <> '' THEN ?
                             ELSE onu_mac
                         END,
                         onu_name = CASE
                             WHEN ? <> '' THEN ?
                             ELSE onu_name
                         END,
                         rx_power = COALESCE(?, rx_power),
                         tx_power = COALESCE(?, tx_power),
                         distance = COALESCE(?, distance),
                         bias_current = COALESCE(?, bias_current),
                         voltage = COALESCE(?, voltage),
                         temperature = COALESCE(?, temperature),
                         status = CASE
                             WHEN ? IN ('online', 'offline')
                                 THEN ?
                             ELSE status
                         END,
                         last_seen = CASE
                             WHEN ? = 'online' THEN NOW()
                             ELSE last_seen
                         END,
                         updated_at = NOW()
                     WHERE id = ?
                       AND olt_id = ?`,
                    [
                        row.pon,
                        serial, serial,
                        row.mac, row.mac,
                        name, name,
                        row.rx_power,
                        row.tx_power,
                        row.distance,
                        row.bias_current,
                        row.voltage,
                        row.temperature,
                        row.status, row.status,
                        row.status,
                        existingId,
                        olt.id
                    ]
                );

                updated++;
            } else {
                /*
                 * Insert a new ONU.
                 * customer_id is omitted intentionally.
                 */

                await conn.execute(
                    `INSERT INTO onu (
                        olt_id,
                        pon,
                        onu_sn,
                        onu_mac,
                        onu_name,
                        rx_power,
                        tx_power,
                        distance,
                        bias_current,
                        voltage,
                        temperature,
                        status,
                        last_seen,
                        updated_at
                    ) VALUES (
                        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                        CASE WHEN ? = 'online' THEN NOW() ELSE NULL END,
                        NOW()
                    )`,
                    [
                        olt.id,
                        row.pon,
                        serial,
                        row.mac || null,
                        name,
                        row.rx_power,
                        row.tx_power,
                        row.distance,
                        row.bias_current,
                        row.voltage,
                        row.temperature,
                        row.status,
                        row.status
                    ]
                );

                inserted++;
            }
        }

        const [counts] = await conn.execute(
            `SELECT
                COUNT(*) AS total,
                COALESCE(
                    SUM(status = 'online'), 0
                ) AS online,
                COALESCE(
                    SUM(status = 'offline'), 0
                ) AS offline
             FROM onu
             WHERE olt_id = ?`,
            [olt.id]
        );

        await conn.execute(
            `UPDATE olts
             SET
                 status = 'online',
                 last_check = NOW(),
                 onu_total = ?,
                 onu_online = ?,
                 onu_offline = ?
             WHERE id = ?
               AND company_id = ?`,
            [
                Number(counts[0].total || 0),
                Number(counts[0].online || 0),
                Number(counts[0].offline || 0),
                olt.id,
                olt.company_id
            ]
        );

        await conn.commit();

        // Hardware sync is strictly ONU-only; customer mapping is a separate operation.
        return {
            success: true,
            mapping: null,
            opticalErrors,
            found: normalized.length,
            inserted,
            updated,
            skipped,
            online,
            unknownStatus,
            counts: counts[0]
        };
    } catch (error) {
        try {
            await conn.rollback();
        } catch (_) {
            // Preserve the original error.
        }

        throw error;
    } finally {
        conn.release();
    }
}

/*
|--------------------------------------------------------------------------
| SINGLE ONU HARDWARE SYNC
|--------------------------------------------------------------------------
| Reads the selected OLT but updates only the requested existing ONU row.
| Customer mappings, PPPoE sessions, and every other ONU remain untouched.
|--------------------------------------------------------------------------
*/
async function syncOneOnu(pool, olt, onuId) {
    if (!olt || !olt.id || !olt.company_id) {
        throw new Error('Invalid OLT context.');
    }

    const id = Number(onuId);
    if (!Number.isSafeInteger(id) || id < 1) {
        throw new Error('Invalid ONU ID.');
    }

    const [targetRows] = await pool.execute(
        "SELECT id, pon, onu_sn, onu_mac, mac_address " +
        "FROM onu WHERE id = ? AND olt_id = ? LIMIT 1",
        [id, Number(olt.id)]
    );

    if (!targetRows.length) {
        const error = new Error('ONU not found on this OLT.');
        error.status = 404;
        throw error;
    }

    const target = targetRows[0];
    const targetMac = cleanMac(String(target.onu_mac || target.mac_address || ''));
    const targetSerial = nullableText(target.onu_sn, 100);
    const targetPon = String(target.pon ?? '').trim();

    if (!targetMac && (!targetSerial || !targetPon)) {
        throw new Error(
            'ONU has no unique hardware identity (MAC or PON + serial).'
        );
    }

    const driver = driverFor(olt);
    let hardwareRows;

    try {
        await driver.connect();

        if (typeof driver.detectModel === 'function') {
            await driver.detectModel();
        }

        if (typeof driver.getONUList !== 'function') {
            throw new Error('OLT driver does not implement getONUList().');
        }

        hardwareRows = await driver.getONUList();
    } finally {
        await disconnectDriver(driver);
    }

    if (!Array.isArray(hardwareRows) || !hardwareRows.length) {
        throw new Error('OLT returned no ONU hardware records.');
    }

    const normalized = hardwareRows
        .filter(row => row && typeof row === 'object')
        .map(row => {
            const item = normalizeRow(row);
            item.pon = ponLabel(item, olt);
            return item;
        });

    const matches = normalized.filter(row => {
        if (targetMac) return row.mac === targetMac;
        return row.pon === targetPon && row.serial === targetSerial;
    });

    if (matches.length === 0) {
        throw new Error(
            'The selected ONU was not found in the OLT hardware response. No database changes were made.'
        );
    }

    if (matches.length > 1) {
        throw new Error(
            'The selected ONU hardware identity is ambiguous. No database changes were made.'
        );
    }

    const row = matches[0];
    const serial = row.serial || row.mac || '';
    const name = row.name || '';

    const [updateResult] = await pool.execute(
        "UPDATE onu SET " +
        "pon = ?, " +
        "onu_sn = CASE WHEN ? <> '' THEN ? ELSE onu_sn END, " +
        "onu_mac = CASE WHEN ? <> '' THEN ? ELSE onu_mac END, " +
        "onu_name = CASE WHEN ? <> '' THEN ? ELSE onu_name END, " +
        "rx_power = COALESCE(?, rx_power), " +
        "tx_power = COALESCE(?, tx_power), " +
        "distance = COALESCE(?, distance), " +
        "bias_current = COALESCE(?, bias_current), " +
        "voltage = COALESCE(?, voltage), " +
        "temperature = COALESCE(?, temperature), " +
        "status = CASE WHEN ? IN ('online', 'offline') THEN ? ELSE status END, " +
        "last_seen = CASE WHEN ? = 'online' THEN NOW() ELSE last_seen END, " +
        "updated_at = NOW() " +
        "WHERE id = ? AND olt_id = ?",
        [
            row.pon,
            serial, serial,
            row.mac, row.mac,
            name, name,
            row.rx_power,
            row.tx_power,
            row.distance,
            row.bias_current,
            row.voltage,
            row.temperature,
            row.status, row.status,
            row.status,
            id,
            Number(olt.id)
        ]
    );

    if (!updateResult.affectedRows) {
        throw new Error('ONU hardware record was not updated.');
    }

    return {
        success: true,
        onuId: id,
        updated: true,
        hardware: {
            pon: row.pon,
            onu_sn: serial || target.onu_sn || null,
            onu_mac: row.mac || target.onu_mac || target.mac_address || null,
            status: row.status,
            rx_power: row.rx_power,
            tx_power: row.tx_power,
            distance: row.distance,
            bias_current: row.bias_current,
            voltage: row.voltage,
            temperature: row.temperature
        }
    };
}

module.exports = {
    driverFor,
    testConnection,
    syncOnus,
    syncOneOnu,
    disconnectDriver
};