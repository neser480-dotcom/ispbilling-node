"use strict";
/*
| Runs the SAME code the OLT Monitoring page uses and prints the result.
|   node scripts/test-bdcom-monitor.js <olt_ip> <username> <password> [port]
| Shows each PON port's reading and every warning, so a missing value can be traced.
*/
const { readBdcomLive } = require("../services/olt/bdcom-telemetry");

const [ip, username, argPass, argPort] = process.argv.slice(2);
const password = argPass || process.env.BDCOM_PASS || "";
const port = Number(argPort || process.env.BDCOM_PORT || 23);

if (!ip || !username) {
    console.log("usage: node scripts/test-bdcom-monitor.js <ip> <user> <pass> [port]");
    process.exit(1);
}

(async () => {
    const t0 = Date.now();
    const r = await readBdcomLive(
        { id: 0, vendor: "BDCOM" },
        { ip, port, username, password, timeout: 12000 }
    );

    console.log(`took ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
    const s = r.system || {};
    console.log("system:", JSON.stringify({
        model: s.model, temp: s.temperatureC, cpu: s.cpuUtilizationPercent,
        mem: s.memoryUtilizationPercent, uptime: s.uptime,
        fans: (s.fan && s.fan.fans || []).length, psu: (s.powerSlots || []).length
    }));
    console.log("\nports:");
    r.ports.forEach(p => console.log(" ", JSON.stringify(p)));
    console.log("\nwarnings:");
    r.warnings.forEach(w => console.log(" -", w));
    setTimeout(() => process.exit(0), 1000);
})().catch(e => { console.error("FAILED: " + e.message); process.exit(1); });
