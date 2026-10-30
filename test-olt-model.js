"use strict";

const fs = require("fs");
const path = require("path");

const file = path.join(
    __dirname,
    "services", "olt", "olt-monitor.service.js"
);

const source = fs.readFileSync(file, "utf8");

const match = source.match(
    /function\s+parseCDataDdm\s*\(\s*output\s*\)\s*\{/
);

if (!match) {
    console.error("FAIL: parseCDataDdm() পাওয়া যায়নি।");
    process.exit(1);
}

// Function-এর closing brace খুঁজি।
const start = match.index;
const braceStart = source.indexOf("{", start);

let depth = 0;
let end = -1;
let quote = null;
let escaped = false;

for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];

    if (quote) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === quote) quote = null;
        continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
        quote = ch;
        continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") depth--;

    if (depth === 0) {
        end = i + 1;
        break;
    }
}

if (end < 0) {
    console.error("FAIL: parser function extract করা যায়নি।");
    process.exit(1);
}

const parserCode = source.slice(start, end);

const parseCDataDdm = new Function(
    `${parserCode}; return parseCDataDdm;`
)();

const sample = `
-----------------------------------------------------------------------------
  F/S PORT  Temp(C) Vol(V) TXBias(mA)  TXPower(dBm) RXPower(dBm)
-----------------------------------------------------------------------------
  0/0 pon1  34.2    3.29   8           7.70         -19.06
  0/0 pon2  36.6    3.29   10          7.71         -21.24
  0/0 pon3  40.9    3.24   22          6.16         -30.00
  0/0 pon4  35.1    3.22   11          9.38         -28.53
  0/0 xge1  0.0     0.00   0           0.00         0.00
-----------------------------------------------------------------------------
`;

const ports = parseCDataDdm(sample);

console.log("Parser output:");
console.log(JSON.stringify(ports, null, 2));
console.log("\nPON count:", ports.length);
console.log(
    ports.length === 4
        ? "PASS: চারটি PON শনাক্ত হয়েছে।"
        : "FAIL: parser চারটি PON শনাক্ত করতে পারেনি।"
);