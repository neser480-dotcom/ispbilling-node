"use strict";

/*
|--------------------------------------------------------------------------
| SYNC NORMALIZER
|--------------------------------------------------------------------------
| Vendor parsers return rows in whatever shape their OLT uses. This file
| turns them into ONE shape so the rest of the app never cares about vendor.
|--------------------------------------------------------------------------
*/

// Same "online" words the OLT controller already uses in its SQL.
const ONLINE = new Set(["online", "up", "connected", "active", "1"]);

function normalizeMac(value) {
    const hex = String(value ?? "")
        .replace(/[^0-9a-fA-F]/g, "")
        .toUpperCase();

    if (hex.length !== 12) return null;

    return hex.match(/.{2}/g).join(":");
}

function normalizeStatus(value) {
    const text = String(value ?? "").trim().toLowerCase();

    if (!text) return null;

    return ONLINE.has(text) ? "online" : "offline";
}

// "-14.56dBm" -> -14.56 | "941m" -> 941 | "--", "N/A", "" -> null
function toNumber(value) {
    if (value === null || value === undefined) return null;

    const text = String(value).trim();

    if (!text || /^(--|-|n\/a|na|null|none)$/i.test(text)) return null;

    const match = text.match(/-?\d+(?:\.\d+)?/);

    return match ? Number(match[0]) : null;
}

function pick(raw, keys) {
    for (const key of keys) {
        const value = raw[key];

        if (value !== undefined && value !== null && value !== "") {
            return value;
        }
    }

    return undefined;
}

/*
 * ONU hardware row (OLT Users page sync).
 * Returns null when the row has no valid ONU MAC, so callers can skip it.
 */
function normalizeOnuHardware(raw, ctx = {}, aliases = {}) {
    if (!raw || typeof raw !== "object") return null;

    const keys = (name, ...defaults) => [
        ...(aliases[name] || []),
        ...defaults
    ];

    const onuMac = normalizeMac(
        pick(raw, keys("onuMac", "onuMac", "onu_mac", "mac", "mac_address", "macAddress"))
    );

    if (!onuMac) return null;

    return {
        oltId: ctx.oltId ?? null,
        onuMac,
        pon: pick(raw, keys("pon", "pon", "pon_port", "ponPort")) ?? null,
        port: pick(raw, keys("port", "port", "onu_id", "onuId", "onu")) ?? null,
        status: normalizeStatus(pick(raw, keys("status", "status", "state"))),
        rxPower: toNumber(pick(raw, keys("rxPower", "rxPower", "rx_power", "rx"))),
        txPower: toNumber(pick(raw, keys("txPower", "txPower", "tx_power", "tx"))),
        voltage: toNumber(pick(raw, keys("voltage", "voltage", "volt"))),
        temperature: toNumber(pick(raw, keys("temperature", "temperature", "temp"))),
        distance: toNumber(pick(raw, keys("distance", "distance", "dist"))),
        biasCurrent: toNumber(pick(raw, keys("biasCurrent", "biasCurrent", "bias_current", "bias"))),
        lastUpdate: new Date()
    };
}

// Unique ONU identity: OLT + PON + MAC (same MAC on another PON/OLT is a different row).
function onuKey(row) {
    return [row.oltId, row.pon, row.onuMac].join("|");
}

/*
 * Which MACs belong to ONE OLT.
 *   onuMacs : MACs of the ONUs read from this OLT (always trustworthy)
 *   macs    : onuMacs + customer MACs learned behind those ONUs
 *   verified: true only when the learned-MAC read finished without errors,
 *             so "not in macs" really means "not on this OLT"
 */
function buildMacScope(rows, learned) {
    const onuMacs = new Set();
    const macs = new Set();

    for (const row of Array.isArray(rows) ? rows : []) {
        const mac = normalizeMac(row?.onu_mac ?? row?.mac ?? row?.onuMac);

        if (mac) {
            onuMacs.add(mac);
            macs.add(mac);
        }
    }

    for (const entry of Array.isArray(learned?.entries) ? learned.entries : []) {
        for (const value of [entry?.onu_mac, ...(entry?.learned_macs || [])]) {
            const mac = normalizeMac(value);

            if (mac) macs.add(mac);
        }
    }

    const errors = (Array.isArray(learned?.errors) ? learned.errors : [])
        .map(String)
        .slice(0, 10);

    return {
        verified: learned?.supported === true && errors.length === 0,
        onuMacs,
        macs,
        errors
    };
}

module.exports = {
    buildMacScope,
    normalizeMac,
    normalizeStatus,
    toNumber,
    normalizeOnuHardware,
    onuKey
};
