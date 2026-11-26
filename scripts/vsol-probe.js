#!/usr/bin/env node
/*
 | V-SOL OLT probe (read-only).
 | Usage:
 |   node scripts/vsol-probe.js <ip> <username> <password> [port=23] [ponList=0/1,0/2]
 | Runs only "show"/navigation commands, prints raw output and saves it to
 | vsol-probe-output.txt (password is masked). Send that file back.
 */
const fs = require("fs");
const path = require("path");
const { VsolDriver, parseOnuStatus, parseOpmDiag, parseBasicInfo } = require("../drivers/hardware/vsol");

const [ip, username, password, port = "23", ponArg] = process.argv.slice(2);

if (!ip || !username || !password) {
    console.error("Usage: node scripts/vsol-probe.js <ip> <username> <password> [port] [pons e.g. 0/1,0/2]");
    process.exit(1);
}

const out = [];
const mask = t => String(t).split(password).join("******");
const log = t => { const s = mask(t); out.push(s); console.log(s); };

(async () => {
    const d = new VsolDriver({ ip, port, username, password, timeout: 15000 });
    const run = async (cmd, ms = 40000) => {
        log(`\n===== ${cmd} =====`);
        try { const o = await d.command(cmd, ms); log(JSON.stringify(o.slice(0, 4000))); log(o); return o; }
        catch (e) { log(`!! ERROR: ${e.message}`); return ""; }
    };

    try {
        await d.connect();
        log(`connected. prompt=${JSON.stringify(d.prompt)} banner=${JSON.stringify((d.banner || "").slice(0, 300))}`);

        // 1) global (privileged mode)
        const g = await run("show onu status all");
        log(`-> parsed rows (global): ${parseOnuStatus(g).length}`);
        await run("show onu ?");

        // 2) PON ports
        const cfg = await run("show running-config", 30000);
        let pons = ponArg ? ponArg.split(",") :
            [...new Set([...cfg.matchAll(/^\s*interface\s+epon\s+(\d+\/\d+)\s*$/gim)].map(m => m[1]))];
        if (!pons.length) pons = ["0/1"];
        log(`\nPON ports: ${pons.join(", ")}`);

        // 3) per PON (interface mode)
        for (const p of pons) {
            await run("configure terminal", 8000);
            await run(`interface epon ${p}`, 8000);
            const s = await run("show onu status all");
            log(`-> parsed status rows on ${p}: ${parseOnuStatus(s).length}`);
            const o = await run("show onu opm-diag");
            log(`-> parsed opm rows on ${p}: ${parseOpmDiag(o).length}`);
            const b = await run("show onu baisc-info");
            log(`-> parsed basic rows on ${p}: ${parseBasicInfo(b).length}`);
            await run("end", 8000);
        }
    } catch (e) {
        log(`!! FATAL: ${e.message}`);
    } finally {
        d.disconnect();
        const file = path.join(process.cwd(), "vsol-probe-output.txt");
        fs.writeFileSync(file, out.join("\n"));
        console.log(`\nSaved: ${file}`);
        process.exit(0);
    }
})();
