"use strict";

/*
 * VSOL extra monitoring discovery probe (read-only).
 * Usage:
 *   node scripts/probe-vsol-extra.js <ip> <username> <password> [port=23]
 * Reads CLI help, running-config interface names only, and show-interface
 * output. It never prints or saves the full running-config.
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
    "show interface gigabitethernet ?",
    "show interface vlan ?",
    "show ip ?",
    "show access-list ?",
    "show channel-group ?",
    "show spanning-tree ?",
    "show monitor ?",
    "show queue-scheduler ?",
    "show loopback ?",
    "show isolate ?",
    "show zebra ?",
    "show history"
];

const output = [
    "# VSOL extra monitoring discovery probe",
    "# Target: " + ip + ":" + port,
    "# Started: " + new Date().toISOString(),
    "# Full running-config is never printed or saved.",
    ""
];

function add(value) {
    const safe = String(value === undefined || value === null ? "" : value)
        .split(password).join("******");
    output.push(safe);
    console.log(safe);
}

async function run(driver, command, timeout) {
    add("\n========== " + command + " ==========");
    try {
        const result = await driver.command(command, timeout || 10000);
        add(result || "(empty response)");
        return result || "";
    } catch (error) {
        add("COMMAND ERROR: " + error.message);
        return "";
    }
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
        add("Login banner: " + ((driver.banner || "").trim().slice(0, 400) || "(empty)"));

        for (const command of COMMANDS) {
            await run(driver, command);
        }

        add("\n========== running-config interface discovery ==========");
        try {
            const config = await driver.command("show running-config", 30000);
            const interfaces = [...new Set(
                [...config.matchAll(/^\s*interface\s+(gigabitethernet|vlan)\s+([^\s#]+)/gim)]
                    .map(match => ({ type: match[1].toLowerCase(), name: match[2] }))
            )];

            add("Detected interface names only: " +
                (interfaces.map(item => item.type + " " + item.name).join(", ") || "(none)"));

            for (const item of interfaces) {
                await run(driver, "show interface " + item.type + " " + item.name, 12000);
            }
        } catch (error) {
            add("Interface discovery error: " + error.message);
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
