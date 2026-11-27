"use strict";

/*
|--------------------------------------------------------------------------
| BDCOM EPON OLT DRIVER (read only)
|--------------------------------------------------------------------------
| VERIFIED on a real BDCOM P3310D (Software 10.1.0F), probe 2026-11-26.
| Everything runs in the normal privileged mode, no config mode needed.
|
|   show epon onu-information     all registered ONUs (vendor/model/MAC)
|   show epon active-onu          online ONUs: distance(m), alive time
|   show epon inactive-onu        offline ONUs: dereg reason, absent time
|   show epon interface epon0/P:N onu ctc optical-transceiver-diagnosis
|                                 ONU-side temp/voltage/bias/Tx/Rx (CTC ONUs only)
|   show mac address-table        learned customer MACs with port "epon0/P:N"
|
| ONU identity: interface "EPON0/P:N" -> f_s "0/P", pon "epon0/P", ont_id N.
| The CLI wraps lines at 80 columns, so each record is re-joined before parsing.
| The OLT clock is 1970 (no NTP), so dates are ignored; only "alive time" is used.
|
| Not verified: "show epon optical-transceiver-diagnosis interface ..." returned
| the same -22.8 for two different ONUs, so it is NOT used.
|--------------------------------------------------------------------------
*/

const { EcomDriver, cleanMac } = require("./ecom");

function stripAnsi(value) {
    return String(value || "")
        .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

const MAC = "[0-9a-f]{4}\\.[0-9a-f]{4}\\.[0-9a-f]{4}";
const DATE = "(?:\\d{4}-\\d\\d-\\d\\d\\s+\\d\\d:\\d\\d:\\d\\d|N\\/A)";
const START = /^EPON\d+\/\d+:\d+\s/i;

/*
| Re-join CLI-wrapped records. A record starts with "EPONx/y:z"; following
| lines that do not start a new record (and are not prompts/headers) are
| glued directly onto it, because the break can fall inside a token.
*/
function joinRecords(output) {
    const records = [];
    let current = null;

    for (const raw of stripAnsi(output).replace(/\r/g, "").split("\n")) {
        if (START.test(raw)) {
            if (current !== null) records.push(current);
            current = raw;
            continue;
        }

        if (current === null) continue;

        // blank line, prompt, or separator ends the record
        if (!raw.trim() || /[>#]\s*$/.test(raw) || /^-{3,}/.test(raw.trim())) {
            records.push(current);
            current = null;
            continue;
        }

        current += raw;
    }

    if (current !== null) records.push(current);

    return records;
}

// "4 .16:03:05" -> seconds
function aliveSeconds(days, hms) {
    const [h = 0, m = 0, s = 0] = String(hms || "")
        .split(":")
        .map(Number);

    if ([h, m, s].some(Number.isNaN)) return null;

    return Number(days) * 86400 + h * 3600 + m * 60 + s;
}

function identity(port, ont) {
    return {
        f_s: `0/${port}`,
        pon: `epon0/${port}`,
        pon_no: Number(port),
        ont_id: Number(ont)
    };
}

/* show epon onu-information */
function parseOnuInformation(output) {
    const re = new RegExp(
        `^EPON(\\d+)/(\\d+):(\\d+)\\s+(\\S+)\\s+(\\S+)\\s+(${MAC})\\s+` +
        `(.*?)\\s*(static|dynamic)\\s+(\\S+)\\s*(\\S*)\\s*$`,
        "i"
    );

    const rows = [];

    for (const rec of joinRecords(output)) {
        const m = rec.match(re);

        if (!m) continue;

        const mac = cleanMac(m[6]);

        if (!mac) continue;

        const description = m[7].trim();

        rows.push({
            ...identity(m[2], m[3]),
            onu_mac: mac,
            vendor_id: m[4],
            model_id: m[5],
            onu_name: /^n\/a$/i.test(description) ? "" : description,
            bind_type: m[8].toLowerCase(),
            reg_state: m[9],
            dereg_reason: m[10] && !/^n\/a$/i.test(m[10]) ? m[10] : ""
        });
    }

    return rows;
}

/* show epon active-onu */
function parseActive(output) {
    const re = new RegExp(
        `^EPON(\\d+)/(\\d+):(\\d+)\\s+(${MAC})\\s+(\\S+)\\s+(\\S+)\\s+` +
        `(\\d+)\\s+(\\d+)\\s+${DATE}\\s+${DATE}\\s+(\\S+)\\s+(\\d+)\\s+\\.?(\\d+:\\d+:\\d+)\\s*$`,
        "i"
    );

    const rows = [];

    for (const rec of joinRecords(output)) {
        const m = rec.match(re);

        if (!m) continue;

        const mac = cleanMac(m[4]);

        if (!mac) continue;

        rows.push({
            ...identity(m[2], m[3]),
            onu_mac: mac,
            oam_status: m[6],
            distance: Number(m[7]),
            last_dereg_reason: m[9],
            uptime_seconds: aliveSeconds(m[10], m[11])
        });
    }

    return rows;
}

/* show epon inactive-onu */
function parseInactive(output) {
    const re = new RegExp(
        `^EPON(\\d+)/(\\d+):(\\d+)\\s+(${MAC})\\s+(\\S+)\\s+${DATE}\\s+${DATE}\\s+` +
        `(\\S+)\\s+(\\d+)\\s+\\.?(\\d+:\\d+:\\d+)\\s*$`,
        "i"
    );

    const rows = [];

    for (const rec of joinRecords(output)) {
        const m = rec.match(re);

        if (!m) continue;

        const mac = cleanMac(m[4]);

        if (!mac) continue;

        rows.push({
            ...identity(m[2], m[3]),
            onu_mac: mac,
            reg_state: m[5],
            dereg_reason: m[6],
            offline_seconds: aliveSeconds(m[7], m[8])
        });
    }

    return rows;
}

/* show epon interface epon0/P:N onu ctc optical-transceiver-diagnosis */
function parseCtcOptical(output) {
    const text = stripAnsi(output);

    const num = (label) => {
        const m = text.match(
            new RegExp(label + "[^:\\n]*:\\s*(-?\\d+(?:\\.\\d+)?)", "i")
        );

        return m ? Number(m[1]) : null;
    };

    const result = {
        temperature: num("operating temperature"),
        voltage: num("supply voltage"),
        bias_current: num("bias current"),
        tx_power: num("transmitted power"),
        rx_power: num("received power")
    };

    return Object.values(result).every(v => v === null) ? null : result;
}

/* show mac address-table  ->  [{ mac, pon_no, ont_id }] on EPON ports only */
function parseMacTable(output) {
    const rows = [];

    for (const raw of stripAnsi(output).replace(/\r/g, "").split("\n")) {
        const m = raw.trim().match(
            new RegExp(
                `^(?:\\d+|All)\\s+(${MAC})\\s+(DYNAMIC|STATIC)\\s+epon\\d+\\/(\\d+):(\\d+)$`,
                "i"
            )
        );

        if (!m || /^static$/i.test(m[2])) continue;

        const mac = cleanMac(m[1]);

        if (mac) {
            rows.push({ mac, pon_no: Number(m[3]), ont_id: Number(m[4]) });
        }
    }

    return rows;
}

const ERROR_OUTPUT =
    /invalid input|unknown command|unrecognized|incomplete command|too many parameters|% ?error/i;

class BdcomDriver extends EcomDriver {
    constructor(config = {}) {
        super(config);

        this.vendor = "BDCOM";
        this.model = config.model || "BDCOM EPON";
        this.opticalErrors = [];
    }

    /*
    | Log out politely. BDCOM OLTs have only a few Telnet (VTY) lines; a bare
    | socket.destroy() can leave the line busy until the idle timeout, after
    | which new logins are refused (ECONNREFUSED). Send "exit", then close.
    */
    disconnect() {
        const socket = this.socket;
        const wasLoggedIn = this.loggedIn;

        this.socket = null;
        this.loggedIn = false;
        this.prompt = "";
        this.buffer = "";

        if (!socket || socket.destroyed) return;

        try {
            if (wasLoggedIn) socket.write("exit\r\n");
            socket.end();
        } catch (_) {
            // fall through to destroy
        }

        const timer = setTimeout(() => {
            if (!socket.destroyed) socket.destroy();
        }, 800);

        if (timer.unref) timer.unref();
    }

    /*
    | Prompt detection for BDCOM. The inherited check treats ANY last line that
    | ends in ")" "]" ">" or "#" as the prompt, but BDCOM table headers such as
    | "Temperature(degree) ... TxPower(dBm)" end in ")". When the OLT's answer
    | arrived in several chunks, the read stopped at such a header and returned
    | a truncated table (PON 1/2 DDM missing, ONU lists cut short). Only a line
    | that looks like "HOSTNAME#", "HOSTNAME>" or "HOSTNAME(config)#" counts.
    */
    detectPrompt(output) {
        const lines = String(output || "")
            .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
            .replace(/\r/g, "")
            .split("\n")
            .map(line => line.trim())
            .filter(Boolean);

        const last = lines[lines.length - 1] || "";

        if (/--\s*more/i.test(last)) return "";

        return /^[A-Za-z0-9_.-]+(\([^)\s]*\))?[#>]$/.test(last) ? last : "";
    }

    async detectModel() {
        const output = await this.command("show version", 15000);

        const m = String(output).match(/BDCOM\(tm\)\s+(\S+)\s+Software,\s*Version\s+(\S+)/i);

        if (m) {
            this.model = m[1];
            this.firmware = m[2];
        }

        return {
            vendor: this.vendor,
            model: this.model,
            firmware: this.firmware || "",
            status: "online",
            interfaces: []
        };
    }

    async getONUs() {
        await this.connect();
        await this.detectModel();

        const info = parseOnuInformation(
            await this.command("show epon onu-information", 90000)
        );

        if (!info.length) {
            throw new Error(
                "BDCOM parser returned zero ONU rows. " +
                "Database sync must not continue."
            );
        }

        const active = new Map();
        const inactive = new Map();

        const activeText = await this.command("show epon active-onu", 90000);
        const inactiveText = await this.command("show epon inactive-onu", 90000);

        for (const r of parseActive(activeText)) {
            active.set(`${r.pon_no}:${r.ont_id}`, r);
        }

        for (const r of parseInactive(inactiveText)) {
            inactive.set(`${r.pon_no}:${r.ont_id}`, r);
        }

        const seen = new Set();
        const rows = [];

        for (const r of info) {
            const key = `${r.pon_no}:${r.ont_id}`;

            if (seen.has(key)) continue;

            seen.add(key);

            const act = active.get(key);
            const off = inactive.get(key);

            // Online only when the OLT lists it as active; everything else is offline.
            rows.push({
                ...r,
                status: act ? "online" : "offline",
                run_state: act ? "online" : "offline",
                distance: act ? act.distance : null,
                uptime_seconds: act ? act.uptime_seconds : null,
                oam_status: act ? act.oam_status : "",
                dereg_reason: (off && off.dereg_reason) ||
                    (act && act.last_dereg_reason) || r.dereg_reason || "",
                olt_model: this.model,
                vendor: this.vendor
            });
        }

        await this.collectOpticalCtc(rows);

        return rows;
    }

    /*
    | ONU-side optical readings, one command per online CTC ONU (~0.3 s each).
    | Never fatal: a failure leaves the readings empty. Limits:
    |   BDCOM_OPTICAL=off          skip completely
    |   BDCOM_OPTICAL_MAX_MS=150000  total time budget (default 150 s)
    */
    async collectOpticalCtc(rows) {
        this.opticalErrors = [];

        if (String(process.env.BDCOM_OPTICAL || "").toLowerCase() === "off") {
            return;
        }

        const budget = Number(process.env.BDCOM_OPTICAL_MAX_MS) || 150000;
        const started = Date.now();
        let skipped = 0;
        let failed = 0;

        for (const row of rows) {
            if (row.status !== "online" || !/^ctc/i.test(row.oam_status)) {
                continue;
            }

            if (Date.now() - started > budget) {
                skipped++;
                continue;
            }

            try {
                const text = await this.command(
                    `show epon interface epon0/${row.pon_no}:${row.ont_id} ` +
                    "onu ctc optical-transceiver-diagnosis",
                    10000
                );

                if (ERROR_OUTPUT.test(text)) {
                    failed++;
                    continue;
                }

                const values = parseCtcOptical(text);

                if (values) Object.assign(row, values);
                else failed++;
            } catch (error) {
                failed++;

                if (this.opticalErrors.length < 5) {
                    this.opticalErrors.push(
                        `epon0/${row.pon_no}:${row.ont_id}: ${error.message}`
                    );
                }

                if (!this.socket || this.socket.destroyed) break;
            }
        }

        if (skipped) {
            this.opticalErrors.push(`${skipped} ONU optical reads skipped (time budget)`);
        }

        if (failed) {
            this.opticalErrors.push(`${failed} ONU optical reads returned nothing`);
        }
    }

    /*
    | Customer MACs learned behind each ONU: one global command.
    | Result shape matches the C-Data/Ecom collectors: entries[{ onu_mac, learned_macs }].
    */
    async getLearnedMacs(onuRows = []) {
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

        const text = await this.command("show mac address-table", 90000);

        if (ERROR_OUTPUT.test(text)) {
            return empty("show mac address-table rejected");
        }

        const onuByKey = new Map(
            onuRows.map(r => [`${r.pon_no}:${r.ont_id}`, r.onu_mac])
        );

        const learned = new Map();
        let lines = 0;

        for (const e of parseMacTable(text)) {
            const onuMac = onuByKey.get(`${e.pon_no}:${e.ont_id}`);

            if (!onuMac || e.mac === onuMac) continue;

            if (!learned.has(onuMac)) learned.set(onuMac, new Set());

            learned.get(onuMac).add(e.mac);
            lines++;
        }

        return {
            supported: true,
            entries: [...learned].map(([onu_mac, set]) => ({
                onu_mac,
                learned_macs: [...set]
            })),
            errors: [],
            lines
        };
    }
}

module.exports = {
    BdcomDriver,
    parseOnuInformation,
    parseActive,
    parseInactive,
    parseCtcOptical,
    parseMacTable,
    joinRecords
};
