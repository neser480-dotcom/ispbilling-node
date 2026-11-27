"use strict";

const fs = require("fs");
const path = require("path");
const snmp = require("net-snmp");

const host = process.argv[2] || "103.109.56.193";
const roots = [
    ["SYSTEM", "1.3.6.1.2.1.1"],
    ["IF-MIB", "1.3.6.1.2.1.2"],
    ["IF-X-MIB", "1.3.6.1.2.1.31"],
    ["ENTITY-MIB", "1.3.6.1.2.1.47"],
    ["ENTITY-SENSOR-MIB", "1.3.6.1.2.1.99"],
    ["PRIVATE-ENTERPRISE-MIB", "1.3.6.1.4.1"]
];
const output = [
    "# VSOL OLT SFP RX discovery via SNMP",
    "# Target: " + host,
    "# Read-only walk; SNMP community is not saved.",
    ""
];

function add(line) {
    output.push(String(line));
    console.log(line);
}

function askHidden(prompt) {
    return new Promise((resolve, reject) => {
        const input = process.stdin;
        if (!input.isTTY || typeof input.setRawMode !== "function") {
            reject(new Error("Run from an interactive terminal to enter the SNMP community privately."));
            return;
        }
        let value = "";
        let done = false;
        process.stdout.write(prompt);
        input.setRawMode(true);
        input.resume();
        input.setEncoding("utf8");
        function cleanup() {
            input.removeListener("data", onData);
            input.setRawMode(false);
            input.pause();
            process.stdout.write("\n");
        }
        function onData(key) {
            if (key === "\u0003") {
                cleanup();
                reject(new Error("Cancelled."));
            } else if (key === "\r" || key === "\n") {
                if (done) return;
                done = true;
                cleanup();
                resolve(value);
            } else if (key === "\u007f" || key === "\b") {
                value = value.slice(0, -1);
            } else if (key >= " " && key <= "~") {
                value += key;
            }
        }
        input.on("data", onData);
    });
}

function valueText(vb) {
    if (Buffer.isBuffer(vb.value)) {
        return "0x" + vb.value.toString("hex") + " (" +
            vb.value.toString("utf8").replace(/[^\x20-\x7e]/g, ".") + ")";
    }
    if (vb.value instanceof Date) return vb.value.toISOString();
    return String(vb.value);
}

function walk(session, root, label) {
    return new Promise(resolve => {
        let count = 0;
        let finished = false;
        const relevant = /rx|receive|optical|power|pon|epon|sfp|transceiver|sensor|wavelength|laser|onu|olt|dbm/i;
        add("\n===== " + label + ": " + root + " =====");
        function finish(error) {
            if (finished) return;
            finished = true;
            if (error) add("WALK ERROR: " + (error.message || error));
            add("Rows walked: " + count);
            resolve();
        }
        try {
            session.subtree(root, 20, varbinds => {
                for (const vb of varbinds) {
                    if (snmp.isVarbindError(vb)) {
                        add("SNMP ERROR " + vb.oid + ": " + snmp.varbindError(vb));
                        continue;
                    }
                    count++;
                    const line = vb.oid + " = " + valueText(vb) + " [type " + vb.type + "]";
                    if (relevant.test(line) || label === "PRIVATE-ENTERPRISE-MIB") add(line);
                    if (count >= 6000) {
                        add("Stopped at 6000-row safety limit.");
                        finish();
                        return false;
                    }
                }
                return true;
            }, finish);
        } catch (error) {
            finish(error);
        }
    });
}

(async () => {
    let session;
    try {
        const community = await askHidden("SNMP read community (hidden): ");
        if (!community) throw new Error("SNMP community cannot be empty.");
        session = snmp.createSession(host, community, {
            version: snmp.Version2c,
            timeout: 5000,
            retries: 1,
            transport: "udp4",
            port: 161
        });
        add("SNMP v2c read-only discovery started.");
        for (const item of roots) await walk(session, item[1], item[0]);
        add("\nDiscovery complete. Numeric private OIDs may need the matching VSOL MIB file.");
    } catch (error) {
        add("FATAL: " + (error.message || error));
        process.exitCode = 1;
    } finally {
        if (session) session.close();
        const dir = path.join(__dirname, "probe-out");
        fs.mkdirSync(dir, { recursive: true });
        const safeHost = host.replace(/[^a-zA-Z0-9.-]/g, "_");
        const file = path.join(dir, "vsol-sfp-rx-snmp-" + safeHost + "-" + Date.now() + ".txt");
        fs.writeFileSync(file, output.join("\n") + "\n", "utf8");
        console.log("\nSaved output: " + file);
    }
})();
