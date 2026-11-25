"use strict";

/*
|--------------------------------------------------------------------------
| ZTE EPON OLT DRIVER (SNMP, read only)
|--------------------------------------------------------------------------
| Standalone: this file does not use any other OLT vendor's code.
| OIDs and reading rules follow the open-source KusumaVision NMS
| (MIT licence, (c) 2026 PT BERKAH MEDIA KUSUMA VISION), ZteEponSnmpReader.
|
| ZTE EPON cards (ETGx / ETTx) in a C300 / C320 shelf. ONU rows come from
|   state  1.3.6.1.4.1.3902.1015.1010.1.2.1.1.1.<index>   (1 online, 2 offline)
|   MAC    1.3.6.1.4.1.3902.1015.1010.1.1.1.1.1.4.<index>
|   model  1.3.6.1.4.1.3902.1015.1010.1.1.1.1.1.3.<index>
| <index> = (3 << 28) | (slot << 19) | ((port-1) << 16) | (onu-id << 8)
| This index only holds 8 PON ports per card.
|
| ONU RX power is not available over SNMP on this family (the reference
| reads it with the CLI command "show pon power onu-rx"), so rx_power stays
| empty here.
|
| Needs on the OLT record: ip, snmp_community (optional snmp_port, default 161).
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| SNMP TRANSPORT (private to this vendor file)
|--------------------------------------------------------------------------
| Read-only SNMP v1/v2c. Uses the "net-snmp" npm package (npm install
| net-snmp). Tests can pass config.snmpClient with the same three methods:
|   get(oid) -> value|null, walk(oid) -> [[oid, value], ...], close().
| walk() never returns error varbinds; values stay Buffer / number / string.
*/

function loadSnmpLibrary() {
    try {
        return require("net-snmp");
    } catch (error) {
        throw new Error(
            'The "net-snmp" package is not installed. Run: npm install net-snmp'
        );
    }
}

class SnmpTransport {
    constructor(options = {}) {
        this.host = options.host;
        this.port = Number(options.port || 161);
        this.community = String(options.community || "");
        this.timeout = Number(options.timeout || 5000);
        this.retries = Number(options.retries ?? 2);
        this.version = /^(1|v1)$/i.test(String(options.version || "")) ? "1" : "2c";
        this.lib = null;
        this.session = null;
    }

    open() {
        if (this.session) return;

        if (!this.host) {
            throw new Error("OLT IP address is missing.");
        }

        if (!this.community) {
            throw new Error(
                "SNMP community is missing for this OLT. " +
                "Set snmp_community on the OLT record."
            );
        }

        this.lib = loadSnmpLibrary();

        this.session = this.lib.createSession(this.host, this.community, {
            port: this.port,
            retries: this.retries,
            timeout: this.timeout,
            version: this.version === "1"
                ? this.lib.Version1
                : this.lib.Version2c
        });

        // A socket error must reject the running request, not crash Node.
        this.session.on("error", () => {});
    }

    get(oid) {
        this.open();

        return new Promise((resolve, reject) => {
            this.session.get([oid], (error, varbinds) => {
                if (error) return reject(error);

                const item = varbinds && varbinds[0];

                if (!item || this.lib.isVarbindError(item)) {
                    return resolve(null);
                }

                resolve(item.value);
            });
        });
    }

    walk(oid) {
        this.open();

        return new Promise((resolve, reject) => {
            const rows = [];

            this.session.subtree(
                oid,
                20,
                varbinds => {
                    for (const item of varbinds) {
                        if (this.lib.isVarbindError(item)) continue;

                        rows.push([String(item.oid).replace(/^\./, ""), item.value]);
                    }
                },
                error => (error ? reject(error) : resolve(rows))
            );
        });
    }

    close() {
        if (this.session) {
            try {
                this.session.close();
            } catch (error) {
                // already closed
            }

            this.session = null;
        }
    }
}

// SNMP value -> readable text. Printable bytes stay text, anything else
// becomes "AA BB CC" hex (same shape the reference NMS code expects).
function valueToText(value) {
    if (value === null || value === undefined) return null;

    if (Buffer.isBuffer(value)) {
        const printable = value.length > 0 &&
            value.every(byte => byte >= 0x20 && byte <= 0x7e);

        const text = printable
            ? value.toString("latin1")
            : Array.from(value, byte =>
                byte.toString(16).padStart(2, "0")
            ).join(" ").toUpperCase();

        return text.trim() || null;
    }

    const text = String(value)
        .replace(/^(?:STRING|Hex-STRING|INTEGER|Gauge32|Counter(?:32|64)?|Timeticks|IpAddress|OID|BITS):\s*/i, "")
        .replace(/^["\s\0]+|["\s\0]+$/g, "");

    return text === "" ? null : text;
}

// ".1.3.6.1.4.1.x.7.2.5" below base "1.3.6.1.4.1.x.7" -> [2, 5]; else null.
function oidSuffix(oid, base) {
    const full = String(oid).replace(/^\./, "");
    const prefix = String(base).replace(/^\./, "").replace(/\.$/, "") + ".";

    if (!full.startsWith(prefix)) return null;

    const parts = full.slice(prefix.length).split(".");

    return parts.every(part => /^\d+$/.test(part))
        ? parts.map(Number)
        : null;
}

function lastSegments(oid, count) {
    const parts = String(oid)
        .replace(/^\./, "")
        .split(".")
        .filter(part => /^\d+$/.test(part))
        .map(Number);

    return parts.length >= count ? parts.slice(-count) : null;
}

function macFromValue(value) {
    if (value === null || value === undefined) return null;

    let hex;

    if (Buffer.isBuffer(value) && value.length === 6) {
        hex = value.toString("hex");
    } else {
        const text = valueToText(value);

        if (!text) return null;

        hex = text.replace(/^0x/i, "").replace(/[^0-9a-fA-F]/g, "");
    }

    if (hex.length !== 12 || /^0+$/.test(hex)) return null;

    return hex.toUpperCase().match(/.{2}/g).join(":");
}

function toInteger(value) {
    if (value === null || value === undefined) return null;

    if (typeof value === "number") {
        return Number.isInteger(value) ? value : null;
    }

    const text = valueToText(value);
    const wrapped = text && text.match(/^\((\d+)\)/);

    if (wrapped) return Number(wrapped[1]);

    return text && /^-?\d+$/.test(text) ? Number(text) : null;
}

// Walk a table, retrying so a partial answer from a busy OLT is completed.
// Rows are merged by OID; stops when a retry adds nothing new.
async function robustWalk(snmp, oid, attempts = 3) {
    const merged = new Map();

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        let rows;

        try {
            rows = await snmp.walk(oid);
        } catch (error) {
            if (!merged.size) throw error;
            break;
        }

        const before = merged.size;

        for (const [rowOid, value] of rows) {
            if (!merged.has(rowOid)) merged.set(rowOid, value);
        }

        if (attempt > 0 && merged.size === before) break;
        if (!rows.length && !merged.size) break;
    }

    return Array.from(merged.entries());
}


const OID = {
    sysDescr: "1.3.6.1.2.1.1.1.0",
    sysObjectId: "1.3.6.1.2.1.1.2.0",
    sysName: "1.3.6.1.2.1.1.5.0",
    boardName: "1.3.6.1.4.1.3902.1015.2.1.1.3.1.4",
    ifName: "1.3.6.1.2.1.31.1.1.1.1",
    onuModel: "1.3.6.1.4.1.3902.1015.1010.1.1.1.1.1.3",
    onuMac: "1.3.6.1.4.1.3902.1015.1010.1.1.1.1.1.4",
    onuState: "1.3.6.1.4.1.3902.1015.1010.1.2.1.1.1"
};

const MAX_DECODABLE_PORTS = 8;
const EPON_CARD = /^ET[GT]/i;

function cleanText(value) {
    return valueToText(value);
}

function decodeOnuIndex(index) {
    if ((index >>> 28) !== 3 || (index & 0xff) !== 0) return null;

    const onuId = (index >>> 8) & 0xff;
    const slot = (index >>> 19) & 0x1f;

    if (onuId < 1 || slot < 1) return null;

    return { slot, port: ((index >>> 16) & 0x7) + 1, onuId };
}

class ZteEponDriver {
    constructor(config = {}) {
        this.config = config;
        this.vendor = "ZTE";
        this.model = String(config.model || "ZTE EPON");
        this.opticalErrors = [];

        this.snmp = config.snmpClient || new SnmpTransport({
            host: config.ip || config.host,
            port: config.snmpPort,
            community: config.community,
            timeout: config.snmpTimeout || 5000,
            retries: config.snmpRetries ?? 2,
            version: config.snmpVersion
        });
    }

    async connect() {
        const objectId = await this.snmp.get(OID.sysObjectId);

        if (objectId === null) {
            throw new Error(
                "No SNMP answer from the OLT. Check IP, snmp_community, " +
                "SNMP port and that SNMP is enabled on the OLT."
            );
        }
    }

    async disconnect() {
        this.snmp.close();
    }

    async detectModel() {
        const descr = cleanText(await this.snmp.get(OID.sysDescr));
        const name = cleanText(await this.snmp.get(OID.sysName));

        this.model = (descr || name || this.model).slice(0, 80);

        return { model: this.model, name };
    }

    async testConnection() {
        await this.connect();

        const info = await this.detectModel();

        return {
            success: true,
            message: "OLT SNMP connection successful",
            model: info.model
        };
    }

    // Slots that hold EPON cards (ETGx / ETTx). Empty when the shelf table
    // cannot be read; the port list then decides.
    async eponSlots() {
        const slots = new Set();

        try {
            for (const [oid, value] of await robustWalk(this.snmp, OID.boardName, 2)) {
                const match = `.${oid}`.match(/\.(\d+)\.(\d+)\.(\d+)$/);

                if (match && EPON_CARD.test(String(cleanText(value) || "").trim())) {
                    slots.add(Number(match[3]));
                }
            }
        } catch (error) {
            this.opticalErrors.push(`cards: ${error.message}`);
        }

        return slots;
    }

    // EPON PON ports from ifName: "epon-olt_1/<slot>/<port>"
    async eponPorts(slots) {
        const ports = new Map();

        for (const [, value] of await robustWalk(this.snmp, OID.ifName, 2)) {
            const match = String(cleanText(value) || "")
                .trim()
                .match(/^epon(?:-olt)?_1\/(\d+)\/(\d+)$/i);

            if (!match) continue;

            const slot = Number(match[1]);

            if (slots.size && !slots.has(slot)) continue;

            ports.set(`${slot}_${match[2]}`, { slot, port: Number(match[2]) });
        }

        return ports;
    }

    // Column below base -> Map(decoded position key -> value)
    async onuColumn(base) {
        const map = new Map();

        for (const [oid, value] of await robustWalk(this.snmp, base, 2)) {
            const suffix = oidSuffix(oid, base);

            if (!suffix || suffix.length !== 1) continue;

            const position = decodeOnuIndex(suffix[0]);

            if (position) {
                map.set(`${position.slot}_${position.port}_${position.onuId}`, {
                    position,
                    value
                });
            }
        }

        return map;
    }

    async getONUList() {
        this.opticalErrors = [];

        const slots = await this.eponSlots();
        const ports = await this.eponPorts(slots);

        if (!ports.size) {
            throw new Error(
                "No ZTE EPON ports found (epon-olt_1/slot/port). " +
                "Check that this OLT has EPON cards and the vendor is correct."
            );
        }

        const perSlot = new Map();

        for (const { slot } of ports.values()) {
            perSlot.set(slot, (perSlot.get(slot) || 0) + 1);
        }

        for (const [slot, count] of perSlot) {
            if (count > MAX_DECODABLE_PORTS) {
                throw new Error(
                    `ZTE EPON slot ${slot} has ${count} PON ports; the ONU index ` +
                    `only supports ${MAX_DECODABLE_PORTS}. Refusing to guess.`
                );
            }
        }

        const states = await this.onuColumn(OID.onuState);

        let macs = new Map();
        let models = new Map();

        try {
            macs = await this.onuColumn(OID.onuMac);
        } catch (error) {
            this.opticalErrors.push(`mac: ${error.message}`);
        }

        try {
            models = await this.onuColumn(OID.onuModel);
        } catch (error) {
            this.opticalErrors.push(`model: ${error.message}`);
        }

        const rows = [];

        for (const [key, { position, value }] of states) {
            if (!ports.has(`${position.slot}_${position.port}`)) continue;

            const code = toInteger(value);
            const macEntry = macs.get(key);
            const modelEntry = models.get(key);
            const mac = macEntry ? macFromValue(macEntry.value) : null;

            rows.push({
                mac,
                onu_mac: mac,
                serial: mac,
                pon: position.port,
                f_s: `1/${position.slot}`,
                ont_id: position.onuId,
                name: null,
                status: code === 1 ? "online" : code === 2 ? "offline" : "unknown",
                olt_model: this.model,
                onu_model: modelEntry ? cleanText(modelEntry.value) : null,
                vendor: this.vendor
            });
        }

        rows.sort((a, b) =>
            String(a.f_s).localeCompare(String(b.f_s)) ||
            a.pon - b.pon ||
            a.ont_id - b.ont_id
        );

        return rows;
    }
}

module.exports = {
    ZteEponDriver,
    decodeOnuIndex
};
