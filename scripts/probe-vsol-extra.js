"use strict";

/*
 * VSOL extra monitoring discovery probe (read-only).
 * Usage:
 *   node scripts/probe-vsol-extra.js <ip> <username> <password> [port=23]
 *
 * Discovers supported monitoring commands at privileged, config and EPON
 * interface prompts. It prints/saves only interface names from running-config,
 * never the full configuration. It does not change OLT configuration.
 */
const fs = require("fs");
const path = require("path");
const { VsolDriver } = require("../drivers/hardware/vsol");

const [ip, username, password, portArg] = process.argv.slice(2);
const port = Number(portArg || 23);

if (!ip || !username || password === undefined ||
    !Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("Usage: node scripts/probe-vsol-extra.js <ip> <username> <password> [port=23]");
    process.exit(1);
}

const output = [
    "# VSOL extra monitoring discovery probe",
    "# Target: " + ip + ":" + port,
    "# Started: " + new Date().toISOString(),
    "# Read-only CLI discovery; full running-config is never printed or saved.",
    ""
];

function add(value) {
    const safe = String(value === undefined || value === null ? "" : value)
        .split(password).join("******");
    output.push(safe);
    console.log(safe);
}

async function run(driver, command, timeout = 12000) {
    add("\n========== [" + (driver.prompt || "prompt?") + "] " + command + " ==========");
    try {
        const result = await driver.command(command, timeout);
        add(result || "(empty response)");
        return result || "";
    } catch (error) {
        add("COMMAND ERROR: " + String(error.message || error).slice(0, 300));
        return "";
    }
}

function parseEponInterfaces(config) {
    return [...new Set(
        [...String(config || "").matchAll(/^\s*interface\s+epon\s+(\d+\/\d+)\s*$/gim)]
            .map(match => match[1])
    )].sort((a, b) => {
        const aa = a.split("/").map(Number);
        const bb = b.split("/").map(Number);
        return aa[0] - bb[0] || aa[1] - bb[1];
    });
}

(async () => {
    const driver = new VsolDriver({
        ip,
        port,
        username,
        password,
        timeout: 12000
    });

    try {
        await driver.connect();
        add("Connected. Prompt: " + (driver.prompt || "(not reported)"));
        add("Login banner: " + ((driver.banner || "").trim().slice(0, 400) || "(empty)"));

        // Discover interface syntax and current uplink details at privileged mode.
        await run(driver, "show interface epon ?");
        await run(driver, "show interface gigabitethernet ?");
        await run(driver, "show interface brief");
        await run(driver, "show version");
        await run(driver, "show fan");
        await run(driver, "show power");

        add("\n========== running-config interface discovery ==========");
        let eponInterfaces = [];
        let gigabitInterfaces = [];
        try {
            const config = await driver.command("show running-config", 30000);
            eponInterfaces = parseEponInterfaces(config);
            gigabitInterfaces = [...new Set(
                [...String(config || "").matchAll(/^\s*interface\s+gigabitethernet\s+([^\s#]+)/gim)]
                    .map(match => match[1])
            )];
            add("Detected EPON interface names only: " + (eponInterfaces.join(", ") || "(none)"));
            add("Detected Gigabit interface names only: " + (gigabitInterfaces.join(", ") || "(none)"));
        } catch (error) {
            add("Interface discovery error: " + String(error.message || error).slice(0, 250));
        }

        // Entering CLI configuration/interface contexts does not alter settings.
        await run(driver, "configure terminal");
        await run(driver, "show ?");
        await run(driver, "show version");
        await run(driver, "show fan");
        await run(driver, "show power");
        await run(driver, "show temperature");
        await run(driver, "show cpu");
        await run(driver, "show memory");
        await run(driver, "show uptime");
        await run(driver, "show board");

        if (eponInterfaces.length) {
            const first = eponInterfaces[0];
            await run(driver, "interface epon " + first);
            await run(driver, "show ?");
            await run(driver, "show interface epon " + first);
            await run(driver, "show pon ?");
            await run(driver, "show pon optical transceiver");
            await run(driver, "show onu ?");
            await run(driver, "show onu opm-diag");
            await run(driver, "show onu baisc-info");
            await run(driver, "show mac ?");
            await run(driver, "show mac address-table");
            await run(driver, "show mac address-table interface epon " + first);

            // Test PON-specific module/ONU commands in every configured EPON context.
            for (const fsName of eponInterfaces.slice(1)) {
                await run(driver, "interface epon " + fsName);
                await run(driver, "show pon optical transceiver");
                await run(driver, "show interface epon " + fsName);
            }
        } else {
            add("No EPON interface names found; skipped EPON-context commands.");
        }
    } catch (error) {
        add("FATAL: " + String(error.message || error).slice(0, 300));
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
