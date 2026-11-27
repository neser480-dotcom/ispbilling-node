"use strict";
/*
| BDCOM probe #2 (read-only, ~15 s): memory sub-commands and OLT-side optical.
|   node scripts/probe-bdcom-extra.js <olt_ip> <username> <password> [port]
| Output: scripts/probe-out/bdcom-extra-<ip>-<time>.txt  (do NOT commit it)
*/
const fs = require("fs");
const path = require("path");
const { BdcomDriver } = require("../drivers/hardware/bdcom");

const [ip, username, argPass, argPort] = process.argv.slice(2);
const password = argPass || process.env.BDCOM_PASS || "";
const port = Number(argPort || process.env.BDCOM_PORT || 23);

if (!ip || !username) {
    console.log("usage: node scripts/probe-bdcom-extra.js <ip> <user> <pass> [port]");
    process.exit(1);
}

const COMMANDS = [
    "show memory heap",
    "show memory osheap",
    "show memory region",
    "show memory static",
    "show memory partition",
    "show memory mblk",
    "show epon basic-info",
    "show epon onu-status-count",
    "show epon optical-transceiver-diagnosis ?",
    "show epon optical-transceiver-diagnosis interface ?",
    "show epon optical-transceiver-diagnosis interface epon0/1",
    "show epon optical-transceiver-diagnosis interface epon0/2",
    "show epon optical-transceiver-diagnosis interface epon0/3",
    "show epon optical-transceiver-diagnosis interface epon0/4",
    "show epon onu-ctc-optical-transceiver-diagnosis ?",
    "show epon interface epon0/1 ?",
    "show epon interface epon0/1 ctc ?"
];

(async () => {
    const d = new BdcomDriver({ ip, port, username, password, timeout: 15000 });
    const out = [`# BDCOM extra probe ${new Date().toISOString()}\n`];

    try {
        await d.connect();
    } catch (e) {
        console.log("connect failed: " + e.message);
        process.exit(1);
    }

    for (const c of COMMANDS) {
        if (!/^show\s/i.test(c)) continue; // read-only guard
        try {
            const o = await d.command(c, 30000);
            out.push(`## ${c}\n${o}\n`);
            console.log("ok  " + c);
        } catch (e) {
            out.push(`## ${c}\nERR ${e.message}\n`);
            console.log("ERR " + c);
        }
    }

    d.disconnect();

    const dir = path.join(__dirname, "probe-out");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `bdcom-extra-${ip.replace(/[^\d.]/g, "")}-${Date.now()}.txt`);
    fs.writeFileSync(file, out.join("\n"), "utf8");
    console.log("\nSaved: " + file);
    setTimeout(() => process.exit(0), 1000);
})();
