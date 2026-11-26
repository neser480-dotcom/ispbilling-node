'use strict';

/*
|--------------------------------------------------------------------------
| ECOM learned-MAC collection (standalone copy)
|--------------------------------------------------------------------------
| VERIFIED on the real OLT ("Modokande OLT", probe output of 2026-10-26):
|
|   show mac-address port epon 0/0/<PON> with-ont-location
|
|   MAC                 VLAN   Port          ONT-Id  MAC-Type
|   CC:2D:21:1D:F6:47   201    pon0/0/1      3       dynamic
|
| One command per PON (4 for a 4-port OLT) returns every learned MAC together
| with its ONT-Id (an ONT can have several MACs: bridge-mode routers).
| Other C-Data models/firmware may differ; a rejected command is only
| reported, never fatal. Override with ECOM_LEARNED_MAC_CONFIG (JSON) or
| disable with ECOM_LEARNED_MAC_CONFIG=off.
|
| {
|   "commands": [
|     { "command": "<verified command, may use {iface} and {pon}>",
|       "perPon": true,          // run once per PON inside "interface epon {iface}"
|       "perPort": true,         // OR run once per PON in config mode with
|                                // {iface}/{pon} (no interface mode needed)
|       "perOnt": true,          // OR run once per ONT ({iface} {pon} {ont}); the
|                                // line then needs only the (?<mac>) group
|       "lineRegex": "<JS regex with named groups: mac, ont (and pon if the
|                      line carries it)>" }
|   ]
| }
|
| A line without both a valid MAC and an ONT id is ignored, so unknown
| output can never create a wrong attribution.
|--------------------------------------------------------------------------
*/

const { normalizeMac } = require('../services/onu-auto-mapping.service');

const ERROR_OUTPUT =
    /unknown command|invalid input|command failed|unrecognized command|incomplete command/i;

const DEFAULT_CONFIG = {
    commands: [{
        command: 'show mac-address port pon {iface}/{pon} with-ont-location',
        perPort: true,
        lineRegex:
            '^(?<mac>[0-9a-f]{2}(?::[0-9a-f]{2}){5})\\s+\\d+\\s+epon\\d+/\\d+/(?<pon>\\d+)\\s+(?<ont>\\d+)\\s+dynamic$'
    }]
};

function loadConfig(raw = process.env.ECOM_LEARNED_MAC_CONFIG) {
    if (String(raw ?? '').trim().toLowerCase() === 'off') return null;
    if (raw === undefined || raw === null || String(raw).trim() === '') {
        raw = DEFAULT_CONFIG;
    }

    let parsed;

    try {
        parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (error) {
        throw new Error('ECOM_LEARNED_MAC_CONFIG is not valid JSON.');
    }

    if (!parsed || !Array.isArray(parsed.commands) || !parsed.commands.length) {
        throw new Error('ECOM_LEARNED_MAC_CONFIG.commands is empty.');
    }

    return {
        commands: parsed.commands.map((item, i) => {
            const command = String(item.command || '').trim();

            // Read-only safety: only "show ..." commands may be configured.
            if (!/^show\s+[\w\s\-\/{}.]+$/i.test(command)) {
                throw new Error(`learned-MAC command #${i + 1} must be a read-only "show" command.`);
            }

            let lineRegex;

            try {
                lineRegex = new RegExp(String(item.lineRegex || ''), 'i');
            } catch (error) {
                throw new Error(`learned-MAC lineRegex #${i + 1} is invalid.`);
            }

            const perOnt = !!item.perOnt;

            if (!item.lineRegex || !/\(\?<mac>/.test(item.lineRegex) ||
                (!perOnt && !/\(\?<ont>/.test(item.lineRegex))) {
                throw new Error(`lineRegex #${i + 1} needs a (?<mac>...) group` +
                    (perOnt ? '.' : ' and an (?<ont>...) group.'));
            }

            return {
                command,
                perPon: !!item.perPon,
                perPort: !!item.perPort,
                perOnt,
                lineRegex
            };
        })
    };
}

/**
 * Parse one command output. Returns [{ pon, ont_id, mac }].
 */
function parseLearnedMacs(output, lineRegex, defaultPon = null, defaultOnt = null) {
    const rows = [];

    for (const raw of String(output || '').replace(/\r/g, '').split('\n')) {
        const match = raw.trim().match(lineRegex);

        if (!match || !match.groups) continue;

        const mac = normalizeMac(match.groups.mac);
        const ont = match.groups.ont !== undefined
            ? Number(match.groups.ont)
            : (defaultOnt ?? NaN);
        const pon = match.groups.pon !== undefined
            ? Number(match.groups.pon)
            : defaultPon;

        if (!mac || !Number.isInteger(ont) || ont <= 0 || !Number.isInteger(pon)) continue;

        rows.push({ pon, ont_id: ont, mac });
    }

    return rows;
}

/**
 * Collect learned MACs and attribute them to ONUs (by pon + ont_id).
 *
 * @param driver   connected Ecom driver (command / enterConfig available)
 * @param onuRows  rows from getONUList() (pon, ont_id, fs/f_s, mac/onu_mac)
 * @returns {{ supported, entries, errors, lines }}
 */
async function collectLearnedMacs(driver, onuRows, config = loadConfig()) {
    const out = { supported: false, entries: [], errors: [], lines: 0 };

    if (!config) {
        out.reason = 'learned-MAC collection disabled (ECOM_LEARNED_MAC_CONFIG=off)';
        return out;
    }

    out.supported = true;

    const onuByKey = new Map();
    const ifaces = new Map(); // iface -> Set(pon)

    for (const row of onuRows) {
        const mac = normalizeMac(row.onu_mac || row.mac);
        const iface = row.fs || row.f_s || '0/0';
        const pon = Number(row.pon);
        const ont = Number(row.ont_id);

        if (!mac || !Number.isInteger(pon) || !Number.isInteger(ont)) continue;

        onuByKey.set(`${iface}:${pon}:${ont}`, mac);

        if (!ifaces.has(iface)) ifaces.set(iface, new Set());
        ifaces.get(iface).add(pon);
    }

    const learned = new Map(); // onuMac -> Set(mac)

    const take = (rows, iface) => {
        for (const row of rows) {
            const onuMac = onuByKey.get(`${iface}:${row.pon}:${row.ont_id}`);

            if (!onuMac) continue;

            if (!learned.has(onuMac)) learned.set(onuMac, new Set());
            learned.get(onuMac).add(row.mac);
            out.lines++;
        }
    };

    for (const item of config.commands) {
        try {
            if (item.perOnt) {
                for (const key of onuByKey.keys()) {
                    const [iface, pon, ont] = key.split(':');

                    const command = item.command
                        .replace(/\{iface\}/g, iface)
                        .replace(/\{pon\}/g, pon)
                        .replace(/\{ont\}/g, ont);

                    const text = await driver.command(command, 20000);

                    if (ERROR_OUTPUT.test(text)) {
                        out.errors.push(`${command}: rejected`);
                        continue;
                    }

                    take(
                        parseLearnedMacs(
                            text, item.lineRegex, Number(pon), Number(ont)
                        ).map(r => ({ ...r, pon: Number(pon), ont_id: Number(ont) })),
                        iface
                    );
                }

                continue;
            }

            if (item.perPort) {
                for (const [iface, pons] of ifaces) {
                    for (const pon of pons) {
                        const command = item.command
                            .replace(/\{iface\}/g, iface)
                            .replace(/\{pon\}/g, String(pon));

                        const text = await driver.command(command, 60000);

                        if (ERROR_OUTPUT.test(text)) {
                            out.errors.push(`${command}: rejected`);
                            continue;
                        }

                        take(parseLearnedMacs(text, item.lineRegex, pon), iface);
                    }
                }

                continue;
            }

            if (!item.perPon) {
                const text = await driver.command(item.command, 30000);

                if (ERROR_OUTPUT.test(text)) throw new Error('command rejected: ' + text.slice(0, 120));

                for (const iface of ifaces.keys()) {
                    take(parseLearnedMacs(text, item.lineRegex, null), iface);
                }

                continue;
            }

            for (const [iface, pons] of ifaces) {
                const entered = await driver.command(`interface epon ${iface}`, 8000);

                if (ERROR_OUTPUT.test(entered)) {
                    out.errors.push(`interface epon ${iface}: ${entered.slice(0, 120)}`);
                    continue;
                }

                try {
                    for (const pon of pons) {
                        const command = item.command
                            .replace(/\{iface\}/g, iface)
                            .replace(/\{pon\}/g, String(pon));

                        const text = await driver.command(command, 30000);

                        if (ERROR_OUTPUT.test(text)) {
                            out.errors.push(`${iface} PON ${pon}: command rejected`);
                            continue;
                        }

                        take(parseLearnedMacs(text, item.lineRegex, pon), iface);
                    }
                } finally {
                    await driver.command('exit', 8000);
                    await driver.enterConfig();
                }
            }
        } catch (error) {
            out.errors.push(`${item.command}: ${error.message}`);
        }
    }

    out.entries = [...learned].map(([onu_mac, set]) => ({
        onu_mac,
        learned_macs: [...set]
    }));

    return out;
}

const ECOM_DEFAULT_CONFIG = DEFAULT_CONFIG;

function loadEcomConfig(raw = process.env.ECOM_LEARNED_MAC_CONFIG) {
    return loadConfig(raw);
}

async function collectEcomLearnedMacs(driver, onuRows, config = loadEcomConfig()) {
    return collectLearnedMacs(driver, onuRows, config);
}

module.exports = { ECOM_DEFAULT_CONFIG, loadEcomConfig, collectEcomLearnedMacs };
