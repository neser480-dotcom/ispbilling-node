"use strict";

const net = require("net");

/*
|--------------------------------------------------------------------------
| V-SOL EPON OLT DRIVER (Telnet CLI, read only)
|--------------------------------------------------------------------------
| Standalone: this file does not use ECOM, C-Data or any other vendor file.
|
| CLI (prompt "epon-olt>", after "enable" "epon-olt#"). Commands verified on a
| real OLT with 4 PON ports (EPON0/1 .. EPON0/4):
|
|   show onu status all   ONU-ID  Status  MAC  Distance(m)  RTT(TQ) ...
|   show onu opm-diag     ONU-ID  Temp(C)  Volt(V)  TXBias(mA)  TXPower  RXPower
|   show onu baisc-info   ONU-ID  VendorID  ModelID  hwVer  SwVer
|                         ("baisc" is spelled that way on the OLT)
|
| ONU-ID looks like "EPON0/1:4"  ->  PON "0/1", ONU 4.
| The three outputs are merged by ONU-ID. Offline ONUs keep MAC + status;
| optical values stay null when the OLT does not report them.
|
| This driver only reads. It never sends a command that changes the OLT.
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function cleanMac(value) {
    const hex = String(value || "").replace(/[^a-fA-F0-9]/g, "").toUpperCase();

    return hex.length === 12 ? hex.match(/.{2}/g).join(":") : "";
}

function numberOrNull(value) {
    if (value === null || value === undefined) return null;

    const text = String(value).trim();

    // "N/A", "--", "-" and similar mean "not reported": never turn into 0.
    if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;

    return Number(text);
}

function normalizeStatus(value) {
    const s = String(value || "").trim().toLowerCase();

    if (/^(online|up|working|normal|registered|active)$/.test(s)) return "online";
    if (/^(offline|down|los|inactive|unregistered)$/.test(s)) return "offline";

    return "unknown";
}

function stripAnsi(value) {
    return String(value || "")
        .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
        .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "");
}

function hasMorePrompt(value) {
    return /--\s*More[^\r\n]*$|Press\s+['"]?Q['"]?\s+to\s+quit[^\r\n]*$/i
        .test(stripAnsi(value));
}

function stripMorePrompt(value) {
    return stripAnsi(value)
        .replace(/--\s*More[^\r\n]*/gi, "")
        .replace(/Press\s+['"]?Q['"]?\s+to\s+quit[^\r\n]*/gi, "");
}

function linesOf(output) {
    return stripAnsi(output)
        .replace(/\r/g, "")
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);
}

/*
|--------------------------------------------------------------------------
| PARSERS
|--------------------------------------------------------------------------
*/

const ONU_ID = "EPON(\\d+\\/\\d+):(\\d+)";
const MAC = "((?:[0-9a-f]{2}:){5}[0-9a-f]{2})";

const STATUS_LINE = new RegExp(
    `^${ONU_ID}\\s+(\\S+)\\s+${MAC}\\s+(\\S+)\\s+(\\S+)(?:\\s+(.*))?$`,
    "i"
);

const OPM_LINE = new RegExp(
    `^${ONU_ID}\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)\\s*$`,
    "i"
);

const BASIC_LINE = new RegExp(
    `^${ONU_ID}\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)(?:\\s+(.*))?$`,
    "i"
);

/* show onu status all */
function parseOnuStatus(output) {
    const rows = [];

    for (const line of linesOf(output)) {
        const m = line.match(STATUS_LINE);

        if (!m) continue;

        const ontId = Number(m[2]);

        if (!Number.isInteger(ontId) || ontId < 1) continue;

        const rest = (m[7] || "").trim();

        rows.push({
            f_s: m[1],
            ont_id: ontId,
            status: normalizeStatus(m[3]),
            onu_mac: cleanMac(m[4]),
            distance: numberOrNull(m[5]),
            rtt: numberOrNull(m[6]),
            extra: rest || null,
            raw: line
        });
    }

    return rows;
}

/* show onu opm-diag : Temperature, Voltage, TX bias, TX power, RX power */
function parseOpmDiag(output) {
    const rows = [];

    for (const line of linesOf(output)) {
        const m = line.match(OPM_LINE);

        if (!m) continue;

        rows.push({
            f_s: m[1],
            ont_id: Number(m[2]),
            temperature: numberOrNull(m[3]),
            voltage: numberOrNull(m[4]),
            bias_current: numberOrNull(m[5]),
            tx_power: numberOrNull(m[6]),
            rx_power: numberOrNull(m[7])
        });
    }

    return rows;
}

/* show onu baisc-info : VendorID, Model ID, hwVer, SwVer */
function parseBasicInfo(output) {
    const rows = [];

    for (const line of linesOf(output)) {
        const m = line.match(BASIC_LINE);

        if (!m) continue;

        rows.push({
            f_s: m[1],
            ont_id: Number(m[2]),
            vendor_id: m[3],
            model_id: m[4],
            hw_version: m[5],
            sw_version: (m[6] || "").trim() || null
        });
    }

    return rows;
}

const keyOf = row => `${row.f_s}:${row.ont_id}`;

/*
| Merge by ONU-ID. The status table decides which ONUs exist.
| Optical data is used only for ONUs that are online; an offline ONU gets
| null instead of old or invented numbers.
*/
function mergeOnuRows(statusRows, opticalRows = [], basicRows = []) {
    const optical = new Map(opticalRows.map(r => [keyOf(r), r]));
    const basic = new Map(basicRows.map(r => [keyOf(r), r]));
    const seen = new Set();
    const result = [];

    for (const s of statusRows) {
        const key = keyOf(s);

        if (seen.has(key)) continue;

        seen.add(key);

        const online = s.status === "online";
        const o = online ? optical.get(key) : null;
        const b = basic.get(key);

        result.push({
            f_s: s.f_s,
            pon: `epon${s.f_s}`,
            ont_id: s.ont_id,
            onu_mac: s.onu_mac,
            mac: s.onu_mac,
            status: s.status,
            run_state: s.status,
            onu_sn: "",
            onu_name: "",
            distance: s.distance,
            rtt: s.rtt,
            rx_power: o ? o.rx_power : null,
            tx_power: o ? o.tx_power : null,
            voltage: o ? o.voltage : null,
            bias_current: o ? o.bias_current : null,
            laser_bias: o ? o.bias_current : null,
            temperature: o ? o.temperature : null,
            vendor_id: b ? b.vendor_id : null,
            model_id: b ? b.model_id : null,
            hw_version: b ? b.hw_version : null,
            sw_version: b ? b.sw_version : null,
            raw: s.raw
        });
    }

    return result;
}

/*
|--------------------------------------------------------------------------
| V-SOL TELNET DRIVER
|--------------------------------------------------------------------------
*/

const IAC = 255, DONT = 254, DO = 253, WONT = 252, WILL = 251, SB = 250, SE = 240;

const PROMPT_LINE = /^[A-Za-z0-9_.-]+(?:\([^)]*\))?[>#]$/;

class VsolDriver {
    constructor(config = {}) {
        this.config = config;
        this.host = config.ip || config.host || "";
        this.port = Number(config.port || 23);
        this.username = config.username || config.user || "";
        this.password = config.password || "";
        // OLT config stores timeout in seconds (for example, 12); socket timers use milliseconds.
        this.timeout = Math.max(3000, Number(config.timeout || 12) * 1000);
        this.model = String(config.model || "");
        this.vendor = "VSOL";

        this.socket = null;
        this.buffer = "";
        this.prompt = "";
        this.banner = "";
        this.loggedIn = false;
        this.lastSocketError = null;
        this.opticalErrors = [];
        this._connectPromise = null;
        this._iacCarry = null;
    }

    /* ---------- socket ---------- */

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /* Strip telnet option negotiation (IAC ...) and refuse every option. */
    _feed(socket, chunk) {
        let data = this._iacCarry ? Buffer.concat([this._iacCarry, chunk]) : chunk;

        this._iacCarry = null;

        const text = [];

        for (let i = 0; i < data.length; i++) {
            const b = data[i];

            if (b !== IAC) {
                text.push(b);
                continue;
            }

            if (i + 1 >= data.length) {
                this._iacCarry = data.slice(i);
                break;
            }

            const cmd = data[i + 1];

            if (cmd === IAC) {
                text.push(IAC);
                i += 1;
            } else if (cmd === DO || cmd === WILL || cmd === DONT || cmd === WONT) {
                if (i + 2 >= data.length) {
                    this._iacCarry = data.slice(i);
                    break;
                }

                const reply =
                    cmd === DO ? WONT :
                    cmd === WILL ? DONT : null;

                if (reply !== null && socket.writable) {
                    socket.write(Buffer.from([IAC, reply, data[i + 2]]));
                }

                i += 2;
            } else if (cmd === SB) {
                let end = -1;

                for (let j = i + 2; j + 1 < data.length; j++) {
                    if (data[j] === IAC && data[j + 1] === SE) {
                        end = j + 1;
                        break;
                    }
                }

                if (end === -1) {
                    this._iacCarry = data.slice(i);
                    break;
                }

                i = end;
            } else {
                i += 1;
            }
        }

        if (this.socket === socket && text.length) {
            this.buffer += Buffer.from(text).toString("latin1");
        }
    }

    async write(text) {
        const socket = this.socket;

        if (!socket || socket.destroyed || !socket.writable) {
            throw this.lastSocketError || new Error("OLT Telnet is not connected");
        }

        await new Promise((resolve, reject) => {
            socket.write(text, err => (err ? reject(err) : resolve()));
        });
    }

    async readAvailable(ms = 150) {
        const socket = this.socket;

        if (!socket || socket.destroyed) {
            throw this.lastSocketError || new Error("OLT Telnet connection closed");
        }

        let result = this.buffer;

        this.buffer = "";

        if (result) return result;

        await this.wait(ms);

        if (this.socket !== socket || socket.destroyed) {
            throw this.lastSocketError || new Error("OLT Telnet connection closed");
        }

        result = this.buffer;
        this.buffer = "";

        return result;
    }

    lastLineOf(output) {
        const lines = linesOf(output);

        return lines[lines.length - 1] || "";
    }

    detectPrompt(output) {
        const last = this.lastLineOf(output);

        if (hasMorePrompt(last)) return "";

        return PROMPT_LINE.test(last) ? last : "";
    }

    /* ---------- connect + login ---------- */

    async connect() {
        if (this.socket && !this.socket.destroyed && this.loggedIn) return true;

        if (this._connectPromise) return this._connectPromise;

        this._connectPromise = this._connectInternal();

        try {
            return await this._connectPromise;
        } finally {
            this._connectPromise = null;
        }
    }

    async _connectInternal() {
        if (!this.host) throw new Error("V-SOL OLT IP/host is missing");

        this.disconnect();

        this.buffer = "";
        this.prompt = "";
        this.banner = "";
        this.loggedIn = false;
        this.lastSocketError = null;
        this._iacCarry = null;

        const socket = net.createConnection({ host: this.host, port: this.port });

        this.socket = socket;
        socket.setTimeout(0);
        socket.on("data", chunk => this._feed(socket, chunk));
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
                const timer = setTimeout(
                    () => reject(new Error("V-SOL OLT connection timeout")),
                    this.timeout
                );

                socket.once("connect", () => { clearTimeout(timer); resolve(); });
                socket.once("error", err => { clearTimeout(timer); reject(err); });
            });

            const deadline = Date.now() + this.timeout;
            let received = "";
            let userSent = false;
            let passSent = false;
            let enableSent = false;
            let enablePassSent = false;
            let nudges = 0;
            let lastDataAt = Date.now();

            while (Date.now() < deadline) {
                if (socket.destroyed || this.socket !== socket) {
                    throw this.lastSocketError ||
                        new Error("OLT Telnet connection closed during login");
                }

                await this.wait(150);

                const chunk = this.buffer;

                this.buffer = "";

                if (chunk) {
                    received += chunk;
                    this.banner += chunk;
                    lastDataAt = Date.now();
                }

                received = stripAnsi(received);

                if (/incorrect|authentication failed|login failed|invalid password|access denied|bad password/i.test(received)) {
                    throw new Error("V-SOL OLT login failed; check username/password");
                }

                const tail = received.replace(/\r/g, "");

                if (!userSent && /(?:login|user\s*name|username|user)\s*[:>]?\s*$/i.test(tail)) {
                    await this.write(this.username + "\r\n");
                    userSent = true;
                    received = "";
                    continue;
                }

                if (/password\s*[:>]?\s*$/i.test(tail)) {
                    if (!passSent) {
                        await this.write(this.password + "\r\n");
                        passSent = true;
                        received = "";
                        continue;
                    }

                    if (enableSent && !enablePassSent) {
                        // Some firmwares ask for an enable password; use the same one.
                        await this.write(this.password + "\r\n");
                        enablePassSent = true;
                        received = "";
                        continue;
                    }
                }

                const last = this.lastLineOf(received);

                if (PROMPT_LINE.test(last)) {
                    this.prompt = last;

                    if (last.endsWith("#")) {
                        this.loggedIn = true;
                        this.buffer = "";
                        return true;
                    }

                    if (!enableSent) {
                        await this.write("enable\r\n");
                        enableSent = true;
                        received = "";
                        continue;
                    }
                }

                if (
                    !userSent && !passSent && received &&
                    Date.now() - lastDataAt >= 800 && nudges < 2
                ) {
                    await this.write("\r\n");
                    nudges += 1;
                    lastDataAt = Date.now();
                }
            }

            throw new Error(
                "V-SOL OLT login timeout. No authenticated CLI prompt received. " +
                (received.trim().slice(-300) || "No login banner received.")
            );
        } catch (error) {
            this.loggedIn = false;

            if (this.socket === socket) this.socket = null;

            if (!socket.destroyed) socket.destroy();

            throw error;
        }
    }

    /* ---------- command with pagination ---------- */

    async command(command, timeout = 20000) {
        if (!this.socket || this.socket.destroyed || !this.loggedIn) {
            await this.connect();
        }

        const socket = this.socket;
        const cmd = String(command).trim();

        await this.readAvailable(100);
        await this.write(cmd + "\r\n");

        let output = "";
        const deadline = Date.now() + timeout;

        while (Date.now() < deadline) {
            if (this.socket !== socket || socket.destroyed) {
                throw this.lastSocketError ||
                    new Error("OLT Telnet connection closed while executing: " + cmd);
            }

            const chunk = await this.readAvailable(150);

            if (chunk) output += chunk;

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
                (stripAnsi(output).trim().slice(-300) || "No command output received.")
            );
        }

        return stripMorePrompt(output)
            .replace(/\r/g, "")
            .split("\n")
            .filter(line => line.trim() !== cmd)
            .join("\n")
            .trim();
    }

    /* ---------- reading ONUs ---------- */

    async detectModel() {
        await this.connect();

        const version = /version\s+([0-9][\w.]*)/i.exec(stripAnsi(this.banner));

        this.model = this.model ||
            (this.prompt || "").replace(/[>#].*$/, "") ||
            "V-SOL EPON OLT";

        return {
            vendor: "VSOL",
            model: this.model,
            version: version ? version[1] : null
        };
    }

    /* Read-only inventory. This firmware rejects the global status command.
       Discover PONs from running-config, enter config mode once, then read
       status/optical/basic tables from each PON interface. Do not issue "end":
       this firmware's CLI does not reliably return to privileged mode. */
    async getONUs() {
        this.opticalErrors = [];
        await this.connect();

        const configOutput = await this.command("show running-config", 30000);
        const fsList = [...new Set(
            [...stripAnsi(configOutput).matchAll(/^\s*interface\s+epon\s+(\d+\/\d+)\s*$/gim)]
                .map(match => match[1])
        )];

        if (!fsList.length) {
            throw new Error(
                "V-SOL OLT returned no EPON interfaces in 'show running-config'."
            );
        }

        await this.command("configure terminal", 10000);

        const statusRows = [];
        const opticalRows = [];
        const basicRows = [];

        // The probe confirms that this firmware returns the complete OLT
        // status table (all PONs) even when the command is run in one PON
        // interface. Read it once; repeating it per PON only duplicates the
        // same 255-row inventory.
        await this.command(`interface epon ${fsList[0]}`, 10000);
        const statusOutput = await this.command("show onu status all", 40000);

        if (/unknown command|too many parameters|invalid command|ambiguous command/i.test(statusOutput)) {
            throw new Error(
                `V-SOL OLT rejected 'show onu status all' on EPON ${fsList[0]}: ` +
                stripAnsi(statusOutput).trim().slice(0, 250)
            );
        }

        statusRows.push(...parseOnuStatus(statusOutput));

        for (const fs of fsList) {
            // The first PON is already selected above. The CLI accepts a
            // direct interface switch for each remaining PON in config mode.
            if (fs !== fsList[0]) {
                await this.command(`interface epon ${fs}`, 10000);
            }

            try {
                const output = await this.command("show onu opm-diag", 40000);
                if (/unknown command|too many parameters|invalid command|ambiguous command/i.test(output)) {
                    throw new Error(stripAnsi(output).trim().slice(0, 200) || "command rejected");
                }
                opticalRows.push(...parseOpmDiag(output));
            } catch (error) {
                this.opticalErrors.push(`EPON ${fs} opm-diag: ${error.message}`);
            }

            try {
                const output = await this.command("show onu baisc-info", 40000);
                if (/unknown command|too many parameters|invalid command|ambiguous command/i.test(output)) {
                    throw new Error(stripAnsi(output).trim().slice(0, 200) || "command rejected");
                }
                basicRows.push(...parseBasicInfo(output));
            } catch (error) {
                this.opticalErrors.push(`EPON ${fs} baisc-info: ${error.message}`);
            }
        }

        if (!statusRows.length) {
            throw new Error(
                "V-SOL OLT returned no ONU rows from any configured EPON interface. " +
                "Checked: " + fsList.join(", ")
            );
        }

        return mergeOnuRows(statusRows, opticalRows, basicRows);
    }

    async getONUList() {
        return this.getONUs();
    }

    /* One ONU: the OLT has no per-ONU command, so the tables are read once and
       the caller picks its ONU by MAC. */
    async getONU() {
        return this.getONUs();
    }

    async getSystemInfo() {
        return this.detectModel();
    }

    async testConnection() {
        await this.connect();

        const info = await this.detectModel();

        return { success: true, message: "OLT connection successful", ...info };
    }

    disconnect() {
        const socket = this.socket;

        this.socket = null;
        this.loggedIn = false;
        this.prompt = "";
        this.buffer = "";

        if (socket && !socket.destroyed) socket.destroy();
    }
}

module.exports = {
    VsolDriver,
    cleanMac,
    parseOnuStatus,
    parseOpmDiag,
    parseBasicInfo,
    mergeOnuRows
};
