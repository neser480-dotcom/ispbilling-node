"use strict";

/*
 * VSOL SFP RX discovery probe (READ ONLY).
 * Usage: node scripts/probe-vsol-sfp-rx.js <ip> <username> <password> [port=23]
 * Reads running-config internally only to discover interface names; never logs it.
 * Sends show/help commands and changes CLI context only. No OLT configuration changes.
 */

const fs = require("fs");
const path = require("path");
const { VsolDriver } = require("../drivers/hardware/vsol");

const [ip, username, password, portArg] = process.argv.slice(2);
const port = Number(portArg || 23);

if (!ip || !username || password === undefined ||
    !Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("Usage: node scripts/probe-vsol-sfp-rx.js <ip> <username> <password> [port=23]");
    process.exit(1);
}

const output = [
    "# VSOL SFP RX discovery probe",
    "# Target: " + ip + ":" + port,
    "# Started: " + new Date().toISOString(),
    "# READ ONLY: show/help commands only; no configuration changes.",
    "# Full running-config is not printed or saved.",
    ""
];

function add(value) {
    const safe = String(value ?? "").split(password).join("******");
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
        add("COMMAND ERROR: " + String(error.message || error).slice(0, 500));
        return "";
    }
}

function parseInterfaces(config, type) {
    const re = new RegExp("^\\s*interface\\s+" + type + "\\s+(\\S+)\\s*$", "gim");
    return [...new Set([...String(config || "").matchAll(re)].map(m => m[1]))];
}

(async () => {
    const driver = new VsolDriver({ ip, port, username, password, timeout: 12000 });

    try {
        await driver.connect();
        add("Connected. Prompt: " + (driver.prompt || "(not reported)"));
        add("Login banner: " + String(driver.banner || "").trim().slice(0, 350));

        for (const command of [
            "show ?", "show pon ?", "show interface ?", "show optical ?",
            "show transceiver ?", "show sfp ?", "show epon ?", "show version"
        ]) await run(driver, command);

        let eponPorts = [];
        let gigabitPorts = [];
        try {
            const config = await driver.command("show running-config", 30000);
            eponPorts = parseInterfaces(config, "epon").sort();
            gigabitPorts = parseInterfaces(config, "gigabitethernet").sort();
            add("\nDiscovered EPON interfaces: " + (eponPorts.join(", ") || "(none)"));
            add("Discovered Gigabit interfaces: " + (gigabitPorts.join(", ") || "(none)"));
        } catch (error) {
            add("Interface discovery error: " + String(error.message || error).slice(0, 350));
        }

        await run(driver, "configure terminal");
        for (const command of [
            "show ?", "show pon ?", "show interface ?", "show optical ?",
            "show transceiver ?", "show sfp ?", "show epon ?", "show module ?", "show port ?"
        ]) await run(driver, command);

        const ponCommands = [
            "show pon optical transceiver",
            "show pon optical transceiver ?",
            "show pon optical ?",
            "show pon optical-info",
            "show pon transceiver",
            "show pon transceiver ?",
            "show pon ddm",
            "show pon ddm ?",
            "show pon info",
            "show interface",
            "show interface epon"
        ];

        for (const portName of eponPorts) {
            await run(driver, "interface epon " + portName);
            await run(driver, "show pon ?");
            for (const command of ponCommands) await run(driver, command, 18000);
        }

        const gigCommands = [
            "show ?", "show interface", "show interface optical",
            "show interface transceiver", "show interface sfp",
            "show optical transceiver", "show transceiver", "show sfp"
        ];

        for (const portName of gigabitPorts) {
            await run(driver, "interface gigabitethernet " + portName);
            for (const command of gigCommands) await run(driver, command, 18000);
        }

        add("\nProbe finished. Check outputs for RX/RxPower/Receive Power/Rx optical power.");
    } catch (error) {
        add("FATAL: " + String(error.message || error).slice(0, 500));
        process.exitCode = 1;
    } finally {
        driver.disconnect();
        const directory = path.join(__dirname, "probe-out");
        fs.mkdirSync(directory, { recursive: true });
        const safeIp = ip.replace(/[^a-zA-Z0-9.-]/g, "_");
        const file = path.join(directory, "vsol-sfp-rx-" + safeIp + "-" + Date.now() + ".txt");
        fs.writeFileSync(file, output.join("\n") + "\n", "utf8");
        console.log("\nSaved output: " + file);
    }
})();
