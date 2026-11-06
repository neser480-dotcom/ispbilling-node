"use strict";

const {
    normalizeOnuHardware,
    onuKey,
    buildMacScope
} = require("../../core/sync-normalizer");

/*
| cdata parser
| Turns structured rows from the cdata driver into normalized ONU hardware rows.
| If cdata uses different field names, add them here (first match wins), e.g.
|   { rxPower: ["optical_rx"], distance: ["length"] }
*/
const ALIASES = {};

function parseOnuRows(rows, ctx = {}) {
    const seen = new Set();
    const parsed = [];
    let skipped = 0;

    for (const raw of Array.isArray(rows) ? rows : []) {
        const row = normalizeOnuHardware(raw, ctx, ALIASES);

        if (!row || seen.has(onuKey(row))) {
            skipped += 1;
            continue;
        }

        seen.add(onuKey(row));
        parsed.push(row);
    }

    return { rows: parsed, skipped };
}

module.exports = { parseOnuRows, buildMacScope };
