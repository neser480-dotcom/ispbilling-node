
"use strict";

const {
    EcomDriver,
    cleanMac
} = require("./ecom");

class CDataDriver extends EcomDriver {
    constructor(config = {}) {
        super(config);

        this.vendor = "CDATA";
        this.model = config.model || "CDATA EPON";
        this.interfaceName = "0/0";
        this.interfacePaths = [this.interfaceName];
        this.ponPorts = 4;
    }

    /*
    |--------------------------------------------------------------------------
    | MODEL DETECTION
    |--------------------------------------------------------------------------
    */

    async detectModel() {
        let output;

        try {
            output = await this.command("show device", 15000);
        } catch (err) {
            throw new Error(
                "CDATA model detection failed: " + err.message
            );
        }

        const lines = String(output || "")
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);

        const modelLine = lines.find(line =>
            /model\s*[:=]|device\s*type\s*[:=]|product\s*[:=]|E08EP|E1204ES|FD1204/i
                .test(line)
        );

        if (modelLine) {
            this.model = modelLine.slice(0, 120);
        }

        // Preserve the interface mapping from the original PHP driver.
        this.interfaceName = "0/0";
        this.interfacePaths = ["0/0"];

        return {
            vendor: this.vendor,
            model: this.model || "CDATA EPON",
            status: "online",
            interfaces: this.interfacePaths
        };
    }

    /*
    |--------------------------------------------------------------------------
    | CONFIGURATION MODE
    |--------------------------------------------------------------------------
    */

    async enterConfig() {
        let output = await this.command("config", 8000);

        if (/unknown command|invalid input/i.test(output)) {
            output = await this.command(
                "configure terminal",
                8000
            );
        }

        return output;
    }

    /*
    |--------------------------------------------------------------------------
    | COMMAND FALLBACK
    |--------------------------------------------------------------------------
    */

    async runFirstSupported(commands, timeout = 25000) {
        let lastOutput = "";
        let lastError = null;

        for (const command of commands) {
            try {
                const output = await this.command(command, timeout);

                lastOutput = output;

                if (
                    !/unknown command|invalid input|command failed|unrecognized command/i
                        .test(output)
                ) {
                    return output;
                }
            } catch (err) {
                lastError = err;
            }
        }

        if (lastError && !lastOutput) {
            throw lastError;
        }

        return lastOutput;
    }

    /*
    |--------------------------------------------------------------------------
    | ONU DISCOVERY
    |--------------------------------------------------------------------------
    */

    async getONUs() {
        await this.connect();
        await this.detectModel();
        await this.enterConfig();

        const merged = new Map();
        const failures = [];

        for (const iface of this.interfacePaths) {
            const enterOutput = await this.command(
                `interface epon ${iface}`,
                8000
            );

            if (
                /unknown command|invalid input|command failed/i
                    .test(enterOutput)
            ) {
                failures.push(
                    `interface epon ${iface}: ${enterOutput}`
                );

                continue;
            }

            for (let pon = 1; pon <= this.ponPorts; pon++) {
                let basicOutput = "";
                let opticalOutput = "";

                try {
                    basicOutput = await this.runFirstSupported([
                        `show ont basic-info ${pon} all`,
                        `show ont basic-info ${iface} ${pon} all`
                    ]);
console.log(
    '[CDATA BASIC-INFO RAW]',
    'Interface:', iface,
    'PON:', pon,
    '\n',
    String(basicOutput).slice(0, 8000)
);
                    opticalOutput = await this.runFirstSupported([
                        `show ont optical-info ${pon} all`,
                        `show ont optical-info ${iface} ${pon} all`
                    ]);
                    console.log(
    '[CDATA OPTICAL-INFO RAW]',
    'Interface:', iface,
    'PON:', pon,
    '\n',
    String(opticalOutput).slice(0, 4000)
);
                } catch (err) {
                    failures.push(
                        `${iface} PON ${pon}: ${err.message}`
                    );

                    continue;
                }

                const basicRows = this.parseRows(
                    basicOutput,
                    pon,
                    "basic"
                );

                const opticalRows = this.parseRows(
                    opticalOutput,
                    pon,
                    "optical"
                );

                const infoRows = [];

                const byKey = new Map();

                for (const row of [
                    ...basicRows,
                    ...opticalRows,
                    ...infoRows
                ]) {
                    const ontId = Number(row.ont_id);

                    if (!Number.isFinite(ontId) || ontId <= 0) {
                        continue;
                    }

                    const key = `${iface}:${pon}:${ontId}`;

                    const previous = byKey.get(key) || {
                        fs: iface,
                        f_s: iface,
                        pon,
                        ont_id: ontId,
                        mac: "",
                        onu_mac: "",
                        serial: "",
                        onu_sn: "",
                        distance: null,
                        status: "unknown",
                        run_state: "unknown",
                        rx_power: null,
                        tx_power: null,
                        voltage: null,
                        bias_current: null,
                        laser_bias: null,
                        temperature: null,
                        onu_name: ""
                    };

                    const next = {
                        ...previous,
                        ...row,
                        fs: iface,
                        f_s: iface,
                        pon,
                        ont_id: ontId
                    };

                    // Normalize MAC values from the shared ECOM parser.
                    const mac = cleanMac(
                        row.onu_mac ||
                        row.mac ||
                        previous.onu_mac ||
                        previous.mac
                    );

                    if (mac) {
                        next.mac = mac;
                        next.onu_mac = mac;
                        next.serial = mac;
                    }

                    // Keep valid existing fields when another output
                    // contains blanks or missing values.
                    for (const field of [
                        "onu_sn",
                        "onu_name",
                        "distance",
                        "rx_power",
                        "tx_power",
                        "voltage",
                        "bias_current",
                        "laser_bias",
                        "temperature"
                    ]) {
                        const value = row[field];

                        if (
                            value === "" ||
                            value === null ||
                            value === undefined
                        ) {
                            next[field] = previous[field] ??
                                (typeof value === "string" ? "" : null);
                        }
                    }

                    const rowStatus = String(
                        row.status || row.run_state || ""
                    ).toLowerCase();

                    if (/online|working|active|up/.test(rowStatus)) {
                        next.status = "Online";
                        next.run_state = "online";
                    } else if (/offline|down|inactive|los/.test(rowStatus)) {
                        next.status = "Offline";
                        next.run_state = "offline";
                    } else {
                        next.status = previous.status || "unknown";
                        next.run_state =
                            previous.run_state || "unknown";
                    }

                    byKey.set(key, next);
                }

                for (const [key, row] of byKey) {
                    merged.set(key, {
                        ...row,
                        vendor: this.vendor,
                        olt_model: this.model || "CDATA EPON",
                        onu_mac: cleanMac(row.onu_mac || row.mac) || "",
                        mac: cleanMac(row.mac || row.onu_mac) || "",
                        serial: cleanMac(row.mac || row.onu_mac) || ""
                    });
                }
            }

            await this.command("exit", 8000);
            await this.enterConfig();
        }

        if (!merged.size && failures.length) {
            throw new Error(
                "CDATA ONU scan failed; refusing to report an empty list. " +
                failures.join(" | ")
            );
        }

        return [...merged.values()];
    }

    /*
    |--------------------------------------------------------------------------
    | ROW PARSING
    |--------------------------------------------------------------------------
    */

    parseRows(output, pon, kind) {
        const text = String(output || "");
        const lines = text
            .replace(/\r/g, "")
            .split("\n");

        const rows = [];

        for (const rawLine of lines) {
            const line = rawLine.trim();

            if (
                !line ||
                /--\s*More|Press\s+['"]?Q['"]?\s+to\s+quit/i.test(line) ||
                /^[-=+| ]+$/.test(line) ||
                /F\/S|ONT\s*ID|MAC\s*ADDRESS|VOLTAGE|TEMPERATURE/i.test(line) ||
                /unknown command|invalid input|command failed/i.test(line)
            ) {
                continue;
            }

            /*
             * Expected table shape from the supplied PHP parser:
             * F/S  PON  ONT-ID  MAC  TYPE  DISTANCE ...
             */
            const match = line.match(
                /^(\d+\/\d+)\s+(\d+)\s+(\d+)\s+([0-9A-Fa-f:.-]{12,17})(?:\s+(.*))?$/
            );

            if (!match) continue;

            const fs = match[1];
            const rowPon = Number(match[2]);
            const ontId = Number(match[3]);
            const mac = cleanMac(match[4]);
            const rest = (match[5] || "").trim();

            if (
                !Number.isFinite(ontId) ||
                ontId <= 0 ||
                rowPon !== Number(pon)
            ) {
                continue;
            }

            const row = {
                fs,
                f_s: fs,
                pon: Number(pon),
                ont_id: ontId,
                mac,
                onu_mac: mac,
                serial: mac,
                onu_sn: "",
                onu_name: "",
                distance: null,
                status: "unknown",
                run_state: "unknown",
                voltage: null,
                tx_power: null,
                rx_power: null,
                bias_current: null,
                laser_bias: null,
                temperature: null
            };

            if (kind === "basic") {
                const fields = rest.split(/\s+/).filter(Boolean);

                // VERIFIED on the real OLT (probe 2026-10-29): an offline ONT
                // is listed with "--" instead of Type/Distance/Up time, e.g.
                //   0/0  2  13  48:AD:08:4F:24:85 --
                // and the footer counts it ("Total: 62, online 56").
                if (!fields.length || /^-+$/.test(fields[0])) {
                    row.status = "Offline";
                    row.run_state = "offline";
                    rows.push(row);
                    continue;
                }

                // The supplied PHP parser reads distance from column 6.
                // Here, use the first numeric field after the MAC/type.
                const distanceMatch = rest.match(/\b(\d+)\b/);

                if (distanceMatch) {
                    row.distance = distanceMatch[1];
                }

                if (fields.length) {
                    row.onu_name = fields[0].slice(0, 100);
                }

                if (/\b(offline|down|inactive|los)\b/i.test(rest)) {
                    row.status = "Offline";
                    row.run_state = "offline";
                } else if (
                    /\b(online|working|active|up)\b/i.test(rest)
                ) {
                    row.status = "Online";
                    row.run_state = "online";
                } else {
                    // The PHP basic-info table treats matched rows as online.
                    row.status = "Online";
                    row.run_state = "online";
                }
            }

            if (kind === "optical") {
                const nums = rest.match(/-?\d+(?:\.\d+)?/g) || [];

                if (nums.length >= 5) {
                    row.voltage = nums[0];
                    row.tx_power = nums[1];
                    row.rx_power = nums[2];
                    row.bias_current = nums[3];
                    row.laser_bias = nums[3];
                    row.temperature = nums[4];
                }
            }

            rows.push(row);
        }

        return rows;
    }

    /*
    |--------------------------------------------------------------------------
    | COMPATIBILITY METHODS
    |--------------------------------------------------------------------------
    */

    async getONUList() {
        const data = await this.getONUs();

        return data.map(row => ({
            ...row,
            status: String(row.status || "unknown").toLowerCase(),
            serial: row.mac || row.onu_mac || row.serial || ""
        }));
    }

    /*
    |--------------------------------------------------------------------------
    | LEARNED MAC (for customer auto-mapping)
    |--------------------------------------------------------------------------
    | Runs only when CDATA_LEARNED_MAC_CONFIG is set. Never throws for an
    | unsupported/unverified command; the caller keeps the ONU list intact.
    */

    async getLearnedMacs(onuRows = []) {
        const {
            collectLearnedMacs
        } = require("./cdata-learned-mac");

        return collectLearnedMacs(this, onuRows);
    }

    async getOnuPower() {
        const data = await this.getONUs();

        return data
            .filter(row =>
                row.rx_power !== null ||
                row.tx_power !== null
            )
            .map(row => ({
                fs: row.fs || row.f_s,
                pon: row.pon,
                ont_id: row.ont_id,
                mac: row.mac || row.onu_mac || "",
                voltage: row.voltage,
                tx_power: row.tx_power,
                rx_power: row.rx_power,
                bias_current: row.bias_current,
                temperature: row.temperature
            }));
    }

    async getPonStatus() {
        const data = await this.getONUs();
        const stats = {};

        for (const row of data) {
            const key = `${row.fs || row.f_s}/${row.pon}`;

            if (!stats[key]) {
                stats[key] = {
                    online: 0,
                    offline: 0
                };
            }

            if (String(row.status).toLowerCase() === "online") {
                stats[key].online++;
            } else if (
                String(row.status).toLowerCase() === "offline"
            ) {
                stats[key].offline++;
            }
        }

        return stats;
    }

    async getSystemInfo() {
        await this.connect();
        return this.detectModel();
    }

    async testConnection() {
        await this.connect();

        const info = await this.detectModel();

        return {
            success: true,
            ...info
        };
    }
}

module.exports = {
    CDataDriver
};
