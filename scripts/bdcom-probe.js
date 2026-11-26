#!/usr/bin/env node
/*
 | BDCOM EPON OLT probe (read-only: only "show" commands and "?" help).
 | Usage: node scripts/bdcom-probe.js <ip> <username> <password> [port=23]
 | Saves bdcom-probe-output.txt (password masked). Send that file back.
 */
const fs = require("fs");
const path = require("path");
const { VsolDriver } = require("../drivers/hardware/vsol");

const [ip, username, password, port = "23"] = process.argv.slice(2);
if (!ip || !username || !password) {
    console.error("Usage: node scripts/bdcom-probe.js <ip> <username> <password> [port]");
    process.exit(1);
}

const COMMANDS = [
    "show version",
    "show epon ?",
    "show epon onu ?",
    "show epon interface ?",
    "show epon interface epon 0/1 ?",
    "show epon interface epon 0/1 onu ?",
    "show epon interface epon 0/1:4 onu ?",
    "show epon onu-information ?",
    "show epon active-onu ?",
    "show epon inactive-onu ?",
    "show epon optical-transceiver-diagnosis ?",
    "show epon onu-information",
    "show epon onu-information interface epon 0/1",
    "show epon active-onu",
    "show epon inactive-onu",
    "show epon interface epon 0/1 onu",
    "show epon interface epon 0/1:4 onu basic-info",
    "show epon interface epon 0/1:4 onu ctc optical-transceiver-diagnosis",
    "show epon optical-transceiver-diagnosis interface epon 0/1:4",
    "show epon interface epon 0/1 onu ctc optical-transceiver-diagnosis",
    "show mac address-table interface epon 0/1:4",
    "?"
];
const LIMIT = 6000;
const out = [];
const mask = t => String(t).split(password).join("******");
const log = t => { const s = mask(t); out.push(s); console.log(s); };

(async () => {
    const d = new VsolDriver({ ip, port, username, password, timeout: 15000 });
    try {
        await d.connect();
        log(`connected. prompt=${JSON.stringify(d.prompt)}`);
        for (const cmd of COMMANDS) {
            log(`\n===== ${cmd} =====`);
            try {
                const o = String(await d.command(cmd, 40000)).replace(/[\b]+/g, "");
                log(o.length > LIMIT ? o.slice(0, LIMIT) + `\n...[truncated, ${o.length} chars total]` : o);
            } catch (e) { log(`!! ERROR: ${e.message}`); }
        }
    } catch (e) {
        log(`!! FATAL: ${e.message}`);
    } finally {
        d.disconnect();
        const file = path.join(process.cwd(), "bdcom-probe-output.txt");
        fs.writeFileSync(file, out.join("\n"));
        console.log(`\nSaved: ${file}`);
        process.exit(0);
    }
})();
