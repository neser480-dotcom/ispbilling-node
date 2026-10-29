
"use strict";

const net = require("net");

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function cleanMac(value) {
    const hex = String(value || "")
        .replace(/[^a-fA-F0-9]/g, "")
        .toUpperCase();

    if (hex.length !== 12) return "";

    return hex.match(/.{2}/g).join(":");
}

function numberOrNull(value) {
    if (value === null || value === undefined) return null;

    const match = String(value).match(/-?\d+(?:\.\d+)?/);

    return match ? Number(match[0]) : null;
}

function normalizeStatus(value) {
    const s = String(value || "").trim().toLowerCase();

    if (/^(offline|down|los|inactive|unregistered)$/.test(s)) {
        return "offline";
    }

    if (/^(online|working|up|normal|registered)$/.test(s)) {
        return "online";
    }

    return "unknown";
}

function stripAnsi(value) {
    return String(value || "")
        .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
        .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "");
}

function hasMorePrompt(value) {
    return /--\s*More\b|Press\s+['"]?Q['"]?\s+to\s+quit|--More\s*\(/i
        .test(stripAnsi(value));
}

function stripMorePrompt(value) {
    return stripAnsi(value)
        .replace(/--\s*More[^\r\n]*/gi, "")
        .replace(/Press\s+['"]?Q['"]?\s+to\s+quit[^\r\n]*/gi, "");
}

/*
|--------------------------------------------------------------------------
| ONU TABLE PARSER
|--------------------------------------------------------------------------
| Verified ECOM E08EP-4S+ row:
| 0/1 1 8 10:AF:8F:76:F5:9D Active Online success match dying-gasp
|--------------------------------------------------------------------------
*/

function parseRows(output, pon, kind) {
    const rows = [];

    const lines = stripAnsi(output)
        .replace(/\r/g, "")
        .split("\n");

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) continue;

        const match = line.match(
            /^(\d+\/\d+)\s+(\d+)\s+(\d+)\s+((?:[0-9a-f]{2}:){5}[0-9a-f]{2})\s+(\S+)\s+(\S+)/i
        );

        if (!match) continue;

        const fs = match[1];
        const ponNumber = Number(match[2]);
        const ontId = Number(match[3]);
        const mac = cleanMac(match[4]);
        const controlFlag = match[5];
        const runState = normalizeStatus(match[6]);

        if (
            !fs ||
            !Number.isInteger(ponNumber) ||
            ponNumber < 1 ||
            !Number.isInteger(ontId) ||
            ontId < 1 ||
            !mac
        ) {
            continue;
        }

        rows.push({
            f_s: fs,
            pon: ponNumber,
            ont_id: ontId,
            onu_mac: mac,
            control_flag: controlFlag,
            run_state: runState,
            status: runState,
            onu_sn: "",
            onu_name: "",
            distance: null,
            rx_power: null,
            tx_power: null,
            voltage: null,
            laser_bias: null,
            temperature: null,
            raw: line
        });
    }

    return rows;
}

/*
|--------------------------------------------------------------------------
| OPTICAL / BASIC INFO PARSERS
|--------------------------------------------------------------------------
| Verified on the real OLT (probe 2026-10-28), inside "interface epon <F/S>":
|
|   show ont optical-info <PON> all
|     0/1  1  8    10:af:8f:76:f5:9d   3.27   2.32   -15.69   13.85   59.75
|                                      Volt   Tx     Rx       Bias     Temp
|   show ont basic-info <PON> all
|     0/1  1  8  10:AF:8F:76:F5:9D SFU   1279   0:01:55:17  0000
|                                  Type  Dist(m) Up time     Model
|--------------------------------------------------------------------------
*/

const NUM = "(-?\\d+(?:\\.\\d+)?)";

const OPTICAL_LINE = new RegExp(
    "^(\\d+\\/\\d+)\\s+(\\d+)\\s+(\\d+)\\s+" +
    "((?:[0-9a-f]{2}:){5}[0-9a-f]{2})\\s+" +
    [NUM, NUM, NUM, NUM, NUM].join("\\s+") + "$",
    "i"
);

const BASIC_LINE =
    /^(\d+\/\d+)\s+(\d+)\s+(\d+)\s+((?:[0-9a-f]{2}:){5}[0-9a-f]{2})\s+(\S+)\s+(\d+)\s+/i;

function parseOpticalInfo(output) {
    const rows = [];

    for (const raw of stripAnsi(output).replace(/\r/g, "").split("\n")) {
        const m = raw.trim().match(OPTICAL_LINE);

        if (!m) continue;

        rows.push({
            f_s: m[1],
            pon: Number(m[2]),
            ont_id: Number(m[3]),
            onu_mac: cleanMac(m[4]),
            voltage: Number(m[5]),
            tx_power: Number(m[6]),
            rx_power: Number(m[7]),
            bias_current: Number(m[8]),
            temperature: Number(m[9])
        });
    }

    return rows;
}

function parseBasicInfo(output) {
    const rows = [];

    for (const raw of stripAnsi(output).replace(/\r/g, "").split("\n")) {
        const m = raw.trim().match(BASIC_LINE);

        if (!m) continue;

        rows.push({
            f_s: m[1],
            pon: Number(m[2]),
            ont_id: Number(m[3]),
            onu_mac: cleanMac(m[4]),
            distance: Number(m[6])
        });
    }

    return rows;
}

/*
|--------------------------------------------------------------------------
| ECOM TELNET DRIVER
|--------------------------------------------------------------------------
*/

class EcomDriver {
    constructor(config = {}) {
        this.config = config;

        this.host = config.ip || config.host || "";
        this.port = Number(config.port || 23);
        this.username = config.username || config.user || "";
        this.password = config.password || "";

        this.timeout = Math.max(
            3000,
            Number(config.timeout || 12000)
        );

        this.socket = null;
        this.buffer = "";
        this.model = String(config.model || "");
        this.vendor = "ECOM";
        this.interfacePaths = [];
        this.prompt = "";
        this.loggedIn = false;
        this.lastSocketError = null;
        this._connectPromise = null;
    }

    /*
    |--------------------------------------------------------------------------
    | CONNECT AND LOGIN
    |--------------------------------------------------------------------------
    */

    async connect() {
        if (
            this.socket &&
            !this.socket.destroyed &&
            this.loggedIn
        ) {
            return true;
        }

        if (this._connectPromise) {
            return this._connectPromise;
        }

        this._connectPromise = this._connectInternal();

        try {
            return await this._connectPromise;
        } finally {
            this._connectPromise = null;
        }
    }

    async _connectInternal() {
        if (!this.host) {
            throw new Error("ECOM OLT IP/host is missing");
        }

        this.disconnect();

        this.buffer = "";
        this.prompt = "";
        this.loggedIn = false;
        this.lastSocketError = null;

        const socket = net.createConnection({
            host: this.host,
            port: this.port
        });

        this.socket = socket;
        socket.setEncoding("utf8");
        socket.setTimeout(0);

        socket.on("data", data => {
            if (this.socket === socket) {
                this.buffer += data;
            }
        });

        socket.on("error", err => {
            this.lastSocketError = err;
            this.loggedIn = false;
        });

        socket.on("close", () => {
            if (this.socket === socket) {
                this.socket = null;
                this.loggedIn = false;
                this.prompt = "";
            }
        });

        try {
            await new Promise((resolve, reject) => {
                let settled = false;

                const onConnect = () => {
                    if (settled) return;

                    settled = true;
                    socket.removeListener("error", onError);
                    resolve();
                };

                const onError = err => {
                    if (settled) return;

                    settled = true;
                    socket.removeListener("connect", onConnect);
                    reject(err);
                };

                socket.once("connect", onConnect);
                socket.once("error", onError);
            });

            const deadline = Date.now() + this.timeout;

            let received = "";
            let usernameSent = false;
            let passwordSent = false;
            let enableSent = false;
            let enterAttempts = 0;
            let lastDataAt = Date.now();

            const send = value => {
                if (
                    this.socket !== socket ||
                    socket.destroyed ||
                    !socket.writable
                ) {
                    throw this.lastSocketError ||
                        new Error(
                            "OLT Telnet connection closed during login"
                        );
                }

                return new Promise((resolve, reject) => {
                    socket.write(value, err => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            };

            while (Date.now() < deadline) {
                if (
                    socket.destroyed ||
                    this.socket !== socket
                ) {
                    throw this.lastSocketError ||
                        new Error(
                            "OLT Telnet connection closed during login"
                        );
                }

                await this.wait(150);

                const chunk = this.buffer;
                this.buffer = "";

                if (chunk) {
                    received += chunk;
                    lastDataAt = Date.now();
                }

                received = stripAnsi(received);

                if (
                    /incorrect|authentication failed|login failed|invalid password|access denied/i
                        .test(received)
                ) {
                    throw new Error(
                        "ECOM OLT login failed; check username/password"
                    );
                }

                if (
                    !usernameSent &&
                    /(?:user\s*name|username|login|user)\s*[:>]?\s*$/im
                        .test(received)
                ) {
                    await send(this.username + "\r\n");
                    usernameSent = true;
                    received = "";
                    lastDataAt = Date.now();
                    continue;
                }

                if (
                    !passwordSent &&
                    /password\s*[:>]?\s*$/im.test(received)
                ) {
                    await send(this.password + "\r\n");
                    passwordSent = true;
                    received = "";
                    lastDataAt = Date.now();
                    continue;
                }

                const lines = received
                    .replace(/\r/g, "")
                    .split("\n")
                    .map(line => line.trim())
                    .filter(Boolean);

                const lastLine = lines.length
                    ? lines[lines.length - 1]
                    : "";

                const isCliPrompt =
                    /(?:E08EP-4S\+(?:\([^)]+\))?|[A-Za-z0-9_.-]+(?:\([^)]+\))?)[>#]\s*$/i
                        .test(lastLine);

                if (isCliPrompt) {
                    this.prompt = lastLine;

                    if (lastLine.endsWith("#")) {
                        this.loggedIn = true;
                        this.buffer = "";
                        return true;
                    }

                    if (
                        lastLine.endsWith(">") &&
                        !enableSent
                    ) {
                        await send("enable\r\n");
                        enableSent = true;
                        received = "";
                        lastDataAt = Date.now();
                        continue;
                    }
                }

                if (
                    !usernameSent &&
                    !passwordSent &&
                    !enableSent &&
                    received &&
                    Date.now() - lastDataAt >= 800 &&
                    enterAttempts < 2
                ) {
                    await send("\r\n");
                    enterAttempts++;
                    lastDataAt = Date.now();
                }
            }

            throw new Error(
                "ECOM OLT login timeout. No authenticated CLI prompt received. " +
                (received.trim().slice(-400) || "No login banner received.")
            );
        } catch (err) {
            this.loggedIn = false;

            if (this.socket === socket) {
                this.socket = null;
            }

            if (!socket.destroyed) {
                socket.destroy();
            }

            throw err;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | SOCKET HELPERS
    |--------------------------------------------------------------------------
    */

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async write(text) {
        const socket = this.socket;

        if (
            !socket ||
            socket.destroyed ||
            !socket.writable
        ) {
            throw this.lastSocketError ||
                new Error("OLT Telnet is not connected");
        }

        await new Promise((resolve, reject) => {
            socket.write(text, err => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async readAvailable(ms = 150) {
        const socket = this.socket;

        if (!socket || socket.destroyed) {
            throw this.lastSocketError ||
                new Error("OLT Telnet connection closed");
        }

        let result = this.buffer;
        this.buffer = "";

        if (result) return result;

        await this.wait(ms);

        if (
            this.socket !== socket ||
            socket.destroyed
        ) {
            throw this.lastSocketError ||
                new Error("OLT Telnet connection closed");
        }

        result = this.buffer;
        this.buffer = "";

        return result;
    }

    async readUntil(regex, timeout = 10000) {
        const deadline = Date.now() + timeout;
        let result = "";

        while (Date.now() < deadline) {
            result += await this.readAvailable(150);

            if (hasMorePrompt(result)) {
                await this.write(" ");
                result = stripMorePrompt(result);
            }

            regex.lastIndex = 0;

            if (regex.test(result)) {
                break;
            }
        }

        return result;
    }

    detectPrompt(output) {
        const lines = stripAnsi(output)
            .replace(/\r/g, "")
            .split("\n")
            .map(line => line.trim())
            .filter(Boolean);

        const last = lines[lines.length - 1] || "";

        if (hasMorePrompt(last)) {
            return "";
        }

        return /[>#)\]]\s*$/.test(last) ? last : "";
    }

    /*
    |--------------------------------------------------------------------------
    | COMMAND EXECUTION WITH PAGINATION
    |--------------------------------------------------------------------------
    */

    async command(command, timeout = 15000) {
        if (
            !this.socket ||
            this.socket.destroyed ||
            !this.loggedIn
        ) {
            await this.connect();
        }

        const socket = this.socket;

        if (
            !socket ||
            socket.destroyed ||
            !this.loggedIn
        ) {
            throw new Error("OLT Telnet is not connected");
        }

        const cmd = String(command).trim();

        await this.readAvailable(100);
        await this.write(cmd + "\r\n");

        let output = "";
        const deadline = Date.now() + timeout;

        while (Date.now() < deadline) {
            if (
                this.socket !== socket ||
                socket.destroyed
            ) {
                throw this.lastSocketError ||
                    new Error(
                        "OLT Telnet connection closed while executing: " + cmd
                    );
            }

            const chunk = await this.readAvailable(150);

            if (chunk) {
                output += chunk;
            }

            if (hasMorePrompt(output)) {
                await this.write(" ");
                output = stripMorePrompt(output);
                continue;
            }

            const prompt = this.detectPrompt(output);

            if (prompt) {
                this.prompt = prompt;
                break;
            }
        }

        if (!this.detectPrompt(output)) {
            throw new Error(
                `OLT command timed out: ${cmd}. ` +
                (
                    stripAnsi(output).trim().slice(-500) ||
                    "No command output received."
                )
            );
        }

        output = stripAnsi(output)
            .replace(/\r/g, "")
            .replace(/--\s*More[^\n]*/gi, "");

        return output
            .split("\n")
            .filter(line => line.trim() !== cmd)
            .join("\n")
            .trim();
    }

    /*
    |--------------------------------------------------------------------------
    | DEVICE MODEL
    |--------------------------------------------------------------------------
    */

    async detectModel() {
        const output = await this.command("show device", 15000);

        if (/E1204ES|FD1204/i.test(output)) {
            this.model = output.match(/E1204ES|FD1204/i)[0].toUpperCase();
            this.interfacePaths = ["0/0"];
        } else if (/E08EP-4S\+/i.test(output)) {
            this.model = "E08EP-4S+";
            this.interfacePaths = ["0/1", "0/2"];
        } else {
            if (!this.interfacePaths.length) {
                this.interfacePaths = ["0/0", "0/1", "0/2"];
            }
        }

        return {
            vendor: this.vendor,
            model: this.model || "ECOM EPON",
            status: "online",
            interfaces: this.interfacePaths
        };
    }

    async enterConfig() {
        // Already in global config mode: "config" would only be rejected.
        if (/\(config\)#\s*$/.test(this.prompt || "")) {
            return "";
        }

        let output = await this.command("config", 8000);

        if (/unknown command|invalid input/i.test(output)) {
            output = await this.command("configure terminal", 8000);
        }

        return output;
    }

    /*
    |--------------------------------------------------------------------------
    | ONU DISCOVERY
    |--------------------------------------------------------------------------
    | E08EP-4S+ has been verified with the global read-only command:
    | show ont info all
    |--------------------------------------------------------------------------
    */

    async getONUs() {
        await this.connect();
        await this.detectModel();

        if (this.model !== "E08EP-4S+") {
            throw new Error(
                "The verified ONU parser currently supports E08EP-4S+ only. " +
                "Detected model: " + (this.model || "Unknown")
            );
        }

        const output = await this.command(
            "show ont info all",
            30000
        );

        const rows = parseRows(output, null, "info");

        if (!rows.length) {
            throw new Error(
                "ECOM parser returned zero ONU rows. " +
                "Database sync must not continue."
            );
        }

        const identities = new Set();
        const macs = new Set();

        for (const row of rows) {
            if (
                !row.f_s ||
                !Number.isInteger(row.pon) ||
                row.pon < 1 ||
                !Number.isInteger(row.ont_id) ||
                row.ont_id < 1 ||
                !row.onu_mac
            ) {
                throw new Error(
                    "Invalid ONU row detected; refusing incomplete results."
                );
            }

            const identity =
                `${row.f_s}:${row.pon}:${row.ont_id}`;

            if (identities.has(identity)) {
                throw new Error(
                    "Duplicate ONU identity detected: " + identity
                );
            }

            if (macs.has(row.onu_mac)) {
                throw new Error(
                    "Duplicate ONU MAC detected: " + row.onu_mac
                );
            }

            identities.add(identity);
            macs.add(row.onu_mac);
        }

        const optical = await this.collectOptical(rows);

        return rows.map(row => ({
            ...row,
            ...(optical.get(
                `${row.f_s}:${row.pon}:${row.ont_id}`
            ) || {}),
            olt_model: this.model,
            vendor: this.vendor
        }));
    }

    /*
    |--------------------------------------------------------------------------
    | OPTICAL POWER / DISTANCE (read only, optional)
    |--------------------------------------------------------------------------
    | Needs "interface epon <F/S>". Any failure only leaves these readings
    | empty; the ONU list itself is never affected. Values are matched by
    | F/S + PON + ONT-ID and must also carry the same MAC as the ONU row.
    |--------------------------------------------------------------------------
    */

    async collectOptical(rows) {
        const result = new Map();

        this.opticalErrors = [];

        const ports = new Map(); // f_s -> Set(pon)

        for (const row of rows) {
            if (!ports.has(row.f_s)) ports.set(row.f_s, new Set());
            ports.get(row.f_s).add(row.pon);
        }

        const macOf = new Map(
            rows.map(row => [
                `${row.f_s}:${row.pon}:${row.ont_id}`,
                row.onu_mac
            ])
        );

        const take = (items) => {
            for (const item of items) {
                const key = `${item.f_s}:${item.pon}:${item.ont_id}`;

                // Never attach a reading to a different device.
                if (macOf.get(key) !== item.onu_mac) continue;

                const { f_s, pon, ont_id, onu_mac, ...values } = item;

                result.set(key, { ...(result.get(key) || {}), ...values });
            }
        };

        try {
            await this.enterConfig();

            for (const [fs, pons] of ports) {
                const entered = await this.command(
                    `interface epon ${fs}`, 8000
                );

                if (/unknown command|invalid input|command failed/i
                    .test(entered)) {
                    this.opticalErrors.push(`interface epon ${fs}: rejected`);
                    continue;
                }

                try {
                    for (const pon of [...pons].sort((a, b) => a - b)) {
                        for (const [kind, parse] of [
                            ["optical-info", parseOpticalInfo],
                            ["basic-info", parseBasicInfo]
                        ]) {
                            const command =
                                `show ont ${kind} ${pon} all`;

                            try {
                                const text = await this.command(command, 30000);

                                if (/unknown command|invalid input|command failed|incomplete command/i
                                    .test(text)) {
                                    this.opticalErrors.push(`${fs} ${command}: rejected`);
                                    continue;
                                }

                                take(parse(text));
                            } catch (error) {
                                this.opticalErrors.push(
                                    `${fs} ${command}: ${error.message}`
                                );
                            }
                        }
                    }
                } finally {
                    try {
                        await this.command("exit", 8000);
                    } catch (error) {
                        this.opticalErrors.push("exit: " + error.message);
                    }
                }
            }
        } catch (error) {
            this.opticalErrors.push(error.message);
        }

        return result;
    }

    async getONUList() {
        return this.getONUs();
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

    /*
    |--------------------------------------------------------------------------
    | LEARNED MAC COLLECTION - READ ONLY
    |--------------------------------------------------------------------------
    | Verified on E08EP-4S+ (OLT 45 probe):
    |   show mac-address port pon <F/S/P> with-ont-location   (config mode)
    | One command per PON; each line carries the ONT-Id. See
    | ecom-learned-mac.js. A failure here never affects ONU discovery.
    |--------------------------------------------------------------------------
    */

    async getLearnedMacs(onuRows = []) {
        const { collectEcomLearnedMacs } = require("./ecom-learned-mac");

        const empty = (message) => ({
            supported: false,
            entries: [],
            errors: [message],
            lines: 0
        });

        if (!Array.isArray(onuRows) || !onuRows.length) {
            return empty("No ONU rows supplied.");
        }

        await this.connect();

        if (!this.model) {
            await this.detectModel();
        }

        if (this.model !== "E08EP-4S+") {
            return empty(
                "Learned-MAC command not verified for model: " +
                (this.model || "Unknown")
            );
        }

        // The verified command is run in configuration mode.
        await this.enterConfig();

        return collectEcomLearnedMacs(this, onuRows);
    }

    /*
    |--------------------------------------------------------------------------
    | DISCONNECT
    |--------------------------------------------------------------------------
    */

    disconnect() {
        const socket = this.socket;

        this.socket = null;
        this.loggedIn = false;
        this.prompt = "";
        this.buffer = "";

        if (socket && !socket.destroyed) {
            socket.destroy();
        }
    }
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
    EcomDriver,
    cleanMac,
    parseRows,
    parseOpticalInfo,
    parseBasicInfo
};
