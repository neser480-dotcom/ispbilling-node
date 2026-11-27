"use strict";

/*
 * VSOL extra monitoring probe (read-only).
 * Usage:
 *   node scripts/probe-vsol-extra.js <ip> <username> <password> [port=23]
 * Tests show/help commands only; it does not enter configuration mode or
 * change OLT settings. Output is saved under scripts/probe-out/.
 */
const fs = require("fs");
const path = require("path");
const { VsolDriver } = require("../drivers/hardware/vsol");

const [ip, username, password, portArg] = process.argv.slice(2);
const port = Number(portArg || 23);

if (!ip || !username || password === undefined || !Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("Usage: node scripts/probe-vsol-extra.js <ip> <username> <password> [port=23]");
    process.exit(1);
}

const COMMANDS = [
    "show ?",
    "show version",
    "show device",
    "show system",
    "show system ?",
    "show system information",
    "show system status",
    "show hardware",
    "show inventory",
    "show board",
    "show board ?",
    "show slot",
    "show module",
    "show interface ?",
    "show epon ?",
    "show pon",
    "show pon status",
    "show temperature",
    "show environment",
    "show cpu",
    "show memory",
    "show uptime",
    "show fan",
    "show power",
    "show power state",
    "show power ?",
    "show optical",
    "show transceiver",
    "show alarm",
    "show clock"
];

const output = [
    "# VSOL extra monitoring probe",
    "# Target: " + ip + ":" + port,
    "# Started: " + new Date().toISOString(),
    ""
];

function add(value) {
    const safe = String(value === undefined || value === null ? "" : value)
        .split(password).join("******");
    output.push(safe);
    console.log(safe);
}

(async () => {
    const driver = new VsolDriver({
        ip: ip,
        port: port,
        username: username,
        password: password,
        timeout: 12000
    });

    try {
        await driver.connect();
        add("Connected. Prompt: " + (driver.prompt || "(not reported)"));
        add("Login banner: " + ((driver.banner || "").trim().slice(0, 500) || "(empty)"));

        for (const command of COMMANDS) {
            if (!/^show\s/i.test(command)) continue;

            add("\n========== " + command + " ==========");

            try {
                const result = await driver.command(command, 9000);
                add(result || "(empty response)");
            } catch (error) {
                add("COMMAND ERROR: " + error.message);
            }
        }
    } catch (error) {
        add("FATAL: " + error.message);
        process.exitCode = 1;
    } finally {
        driver.disconnect();

        const directory = path.join(__dirname, "probe-out");
        fs.mkdirSync(directory, { recursive: true });

        const safeIp = ip.replace(/[^a-zA-Z0-9.-]/g, "_");
        const file = path.join(directory, "vsol-extra-" + safeIp + "-" + Date.now() + ".txt");

        fs.writeFileSync(file, output.join("\n") + "\n", "utf8");
        console.log("\nSaved output: " + file);
    }
})();
