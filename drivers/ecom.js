
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

    if (/offline|down|los|dying|inactive/.test(s)) {
        return "offline";
    }

    if (/online|working|up|active|normal/.test(s)) {
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
*/

function parseRows(output, pon, kind) {
    const rows = [];

    const lines = stripAnsi(output)
        .replace(/\r/g, "")
        .split("\n");

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (
            !line ||
            /^(index|ont\s+id|no\.?\s+ont|[-=+]+)$/i.test(line) ||
            /total\s+(number|count)|command\s+(failed|not found)/i.test(line) ||
            /unknown command|invalid input|error:/i.test(line) ||
            /show ont|config-epon|--more|press\s+['"]?q/i.test(line)
        ) {
            continue;
        }

        const cols = line
            .split(/\s{2,}|\t+|\s*\|\s*/)
            .map(value => value.trim())
            .filter(Boolean);

        if (cols.length < 2) continue;

        if (/^(ont|onu|id|no\.?)$/i.test(cols[0])) {
            continue;
        }

        const idMatch = line.match(/^\s*(\d{1,3})\s+/);

        if (!idMatch) continue;

        const ontId = Number(idMatch[1]);

        if (ontId < 1 || ontId > 256) continue;

        const macMatch = line.match(
            /\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/i
        );

        const row = {
            pon: Number(pon),
            ont_id: ontId,
            f_s: "0/1",
            status: "unknown",
            run_state: "unknown",
            onu_mac: macMatch ? cleanMac(macMatch[0]) : "",
            onu_sn: "",
            onu_name: "",
            distance: null,
            rx_power: null,
            tx_power: null,
            voltage: null,
            laser_bias: null,
            temperature: null,
            raw: line
        };

        if (kind === "info") {
            const statusMatch = line.match(
                /\b(online|offline|working|down|up|active|inactive)\b/i
            );

            if (statusMatch) {
                row.run_state = normalizeStatus(statusMatch[0]);
                row.status = row.run_state;
            }
        }

        if (kind === "basic") {
            const withoutMac = macMatch
                ? line.replace(macMatch[0], " ")
                : line;

            const tokens =
                withoutMac.match(/\b[A-Z0-9]{8,20}\b/gi) || [];

            if (tokens.length) {
                row.onu_sn = tokens[0];
            }

            if (cols.length > 1) {
                row.onu_name = cols.slice(1, 3).join(" ").slice(0, 100);
            }

            const distanceMatch = line.match(
                /(-?\d+(?:\.\d+)?)\s*m\b/i
            );

            if (distanceMatch) {
                row.distance = Number(distanceMatch[1]);
            }
        }

        if (kind === "optical") {
            const nums = line.match(/-?\d+(?:\.\d+)?/g) || [];

            if (nums.length >= 2) row.voltage = numberOrNull(nums[1]);
            if (nums.length >= 3) row.temperature = numberOrNull(nums[2]);
            if (nums.length >= 4) row.laser_bias = numberOrNull(nums[3]);
            if (nums.length >= 5) row.tx_power = numberOrNull(nums[4]);
            if (nums.length >= 6) row.rx_power = numberOrNull(nums[5]);
        }

        rows.push(row);
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

        // Use our own deadlines rather than destroying an idle socket.
        socket.setTimeout(0);

        socket.on("data", data => {
            if (this.socket === socket) {
                this.buffer += data;
            }
        });

        // Keep an error listener attached for the socket's lifetime.
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
                        new Error("OLT Telnet connection closed during login");
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
                        new Error("OLT Telnet connection closed during login");
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

        // Clear stale data before issuing the command.
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
                // The CLI is waiting for the next page.
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
    */

    async getONUs() {
        await this.connect();
        await this.detectModel();
        await this.enterConfig();

        const merged = new Map();
        const failures = [];

        for (const iface of this.interfacePaths) {
            const enter = await this.command(
                `interface epon ${iface}`,
                8000
            );

            if (/unknown command|invalid input|failed/i.test(enter)) {
                failures.push(`interface epon ${iface}: ${enter}`);
                continue;
            }

            for (let pon = 1; pon <= 4; pon++) {
                let infoOutput = "";
                let basicOutput = "";
                let opticalOutput = "";

                try {
                    infoOutput = await this.command(
                        `show ont info ${pon} all`,
                        30000
                    );

                    if (/unknown command|invalid input/i.test(infoOutput)) {
                        infoOutput = await this.command(
                            `show ont info ${iface} ${pon} all`,
                            30000
                        );
                    }

                    basicOutput = await this.command(
                        `show ont basic-info ${pon} all`,
                        30000
                    );

                    if (/unknown command|invalid input/i.test(basicOutput)) {
                        basicOutput = await this.command(
                            `show ont basic-info ${iface} ${pon} all`,
                            30000
                        );
                    }

                    opticalOutput = await this.command(
                        `show ont optical-info ${pon} all`,
                        30000
                    );

                    if (/unknown command|invalid input/i.test(opticalOutput)) {
                        opticalOutput = await this.command(
                            `show ont optical-info ${iface} ${pon} all`,
                            30000
                        );
                    }
                } catch (err) {
                    failures.push(`${iface} PON ${pon}: ${err.message}`);
                    continue;
                }

                if (
                    /unknown command|invalid input|command failed/i.test(infoOutput) &&
                    /unknown command|invalid input|command failed/i.test(basicOutput)
                ) {
                    failures.push(
                        `${iface} PON ${pon}: info/basic commands failed`
                    );
                    continue;
                }

                const info = parseRows(infoOutput, pon, "info");
                const basic = parseRows(basicOutput, pon, "basic");
                const optical = parseRows(opticalOutput, pon, "optical");

                const keyOf = row =>
                    `${iface}:${pon}:${row.ont_id}`;

                const byKey = new Map();

                for (const row of [...info, ...basic, ...optical]) {
                    const key = keyOf(row);

                    const previous = byKey.get(key) || {
                        pon,
                        ont_id: row.ont_id,
                        f_s: iface,
                        status: "unknown",
                        run_state: "unknown",
                        onu_mac: "",
                        onu_sn: "",
                        onu_name: "",
                        distance: null,
                        rx_power: null,
                        tx_power: null,
                        voltage: null,
                        laser_bias: null,
                        temperature: null
                    };

                    const next = {
                        ...previous,
                        ...row,
                        pon,
                        ont_id: row.ont_id,
                        f_s: iface
                    };

                    if (
                        row.status === "unknown" &&
                        previous.status !== "unknown"
                    ) {
                        next.status = previous.status;
                        next.run_state = previous.run_state;
                    }

                    for (const field of [
                        "onu_mac",
                        "onu_sn",
                        "onu_name",
                        "distance",
                        "rx_power",
                        "tx_power",
                        "voltage",
                        "laser_bias",
                        "temperature"
                    ]) {
                        if (
                            row[field] === "" ||
                            row[field] === null ||
                            row[field] === undefined
                        ) {
                            next[field] = previous[field] ??
                                (typeof row[field] === "string" ? "" : null);
                        }
                    }

                    byKey.set(key, next);
                }

                for (const [key, row] of byKey) {
                    if (!row.ont_id) continue;

                    merged.set(key, {
                        ...row,
                        olt_model: this.model || "ECOM EPON",
                        vendor: this.vendor,
                        onu_mac: cleanMac(row.onu_mac) || "",
                        status: normalizeStatus(
                            row.run_state || row.status
                        )
                    });
                }
            }

            await this.command("exit", 8000);
            await this.enterConfig();
        }

        if (!merged.size && failures.length) {
            throw new Error(
                "ONU scan failed; refusing to report an empty list. " +
                failures.join(" | ")
            );
        }

        return [...merged.values()];
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
    parseRows
};
