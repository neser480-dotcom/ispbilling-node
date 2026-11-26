"use strict";

/*
|--------------------------------------------------------------------------
| HIOSO EPON OLT DRIVER (SNMP, read only)
|--------------------------------------------------------------------------
| Standalone: this file does not use any other OLT vendor's code.
| OIDs and reading rules follow the open-source KusumaVision NMS
| (MIT licence, (c) 2026 PT BERKAH MEDIA KUSUMA VISION), HiosoEponSnmpService.
|
| Enterprise 25355. ONU tables are indexed  <table>.<PON>.<ONU>.
|   MAC  ...3.2.6.3.2.1.11.1   (6 bytes)
|   Name ...3.2.6.3.2.1.37.1
|   Link ...3.2.6.3.2.1.39.1   (1 = up)
|   RX   ...3.2.6.14.2.1.8.1   (dBm as text, "NA" when no light)
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
    ifDescr: "1.3.6.1.2.1.2.2.1.2",
    firmware: "1.3.6.1.4.1.25355.3.1.8.1.1.2.1",
    onuMac: "1.3.6.1.4.1.25355.3.2.6.3.2.1.11.1",
    onuName: "1.3.6.1.4.1.25355.3.2.6.3.2.1.37.1",
    onuLink: "1.3.6.1.4.1.25355.3.2.6.3.2.1.39.1",
    onuRx: "1.3.6.1.4.1.25355.3.2.6.14.2.1.8.1"
};

const LINK_UP = 1;

function cleanText(value) {
    const text = valueToText(value);

    return text === null ? null : text;
}

// "-18.52" -> -18.52 ; "NA", 0, out of range -> null
function rxDbm(value) {
    const text = (cleanText(value) || "").toLowerCase();

    if (!text || text === "na" || text === "n/a" || !/^-?\d+(\.\d+)?$/.test(text)) {
        return null;
    }

    const dbm = Math.round(Number(text) * 100) / 100;

    return dbm !== 0 && dbm >= -60 && dbm <= 5 ? dbm : null;
}

class HiosoDriver {
    constructor(config = {}) {
        this.config = config;
        this.vendor = "HIOSO";
        this.model = String(config.model || "HIOSO EPON");
        this.opticalErrors = [];
        this.sysObjectId = null;

        this.snmp = config.snmpClient || new SnmpTransport({
            host: config.ip || config.host,
            port: config.snmpPort,
            community: config.community,
            // HIOSO is often reached over WAN: longer timeout, more retries.
            timeout: config.snmpTimeout || 10000,
            retries: config.snmpRetries ?? 3,
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

        this.sysObjectId = cleanText(objectId);
    }

    async disconnect() {
        this.snmp.close();
    }

    async detectModel() {
        const descr = cleanText(await this.snmp.get(OID.sysDescr));
        const name = cleanText(await this.snmp.get(OID.sysName));
        const firmware = cleanText(await this.snmp.get(OID.firmware).catch(() => null));

        this.model = (descr || name || this.model).slice(0, 80);

        return { model: this.model, name, firmware };
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

    // PON numbers from ifDescr ("pon-nni 3", "ponnni3", ...).
    async ponNumbers() {
        const ports = new Set();
        const rows = await robustWalk(this.snmp, OID.ifDescr, 2);

        for (const [, value] of rows) {
            const match = String(cleanText(value) || "").match(/pon-?nni\s*(\d+)/i);

            if (match) ports.add(Number(match[1]));
        }

        return Array.from(ports).sort((a, b) => a - b);
    }

    // One table -> Map("pon.onu" -> value). Walked per PON when PONs are known
    // (a single whole-table walk can come back partial on this OLT family).
    async table(base, ports, label) {
        const result = new Map();

        const add = rows => {
            for (const [oid, value] of rows) {
                const seg = lastSegments(oid, 2);

                if (seg) {
                    const key = `${seg[0]}.${seg[1]}`;

                    if (!result.has(key)) result.set(key, value);
                }
            }
        };

        if (!ports.length) {
            add(await robustWalk(this.snmp, base));
            return result;
        }

        for (const port of ports) {
            try {
                add(await robustWalk(this.snmp, `${base}.${port}`));
            } catch (error) {
                // One failing PON must not hide the others.
                this.opticalErrors.push(`${label} pon ${port}: ${error.message}`);
            }
        }

        return result;
    }

    // One ONU: walk only its PON (target.pon), not the whole OLT.
    async getONU(target = {}) {
        return this.getONUList({
            onlyPon: Number.isInteger(target.pon) && target.pon > 0
                ? target.pon
                : null
        });
    }

    async getONUList(options = {}) {
        this.opticalErrors = [];

        const ports = options.onlyPon
            ? [options.onlyPon]
            : await this.ponNumbers();
        const macTable = await this.table(OID.onuMac, ports, "mac");

        const registered = [];

        for (const [key, value] of macTable) {
            const mac = macFromValue(value);

            if (!mac) continue; // empty slot / not registered

            const [pon, onuId] = key.split(".").map(Number);

            registered.push({ key, pon, onuId, mac });
        }

        if (!registered.length) {
            if (
                this.sysObjectId &&
                !this.sysObjectId.includes("25355")
            ) {
                throw new Error(
                    "This device does not look like a HIOSO OLT " +
                    `(sysObjectID ${this.sysObjectId}). Check the OLT vendor.`
                );
            }

            return [];
        }

        const names = await this.table(OID.onuName, ports, "name");
        const links = await this.table(OID.onuLink, ports, "link");
        const rx = await this.table(OID.onuRx, ports, "rx");

        registered.sort((a, b) => a.pon - b.pon || a.onuId - b.onuId);

        return registered.map(item => {
            const linkValue = links.get(item.key);
            const linkNumber = linkValue === undefined
                ? null
                : toInteger(linkValue);

            const rxSeen = rx.has(item.key);
            const rxPower = rxSeen ? rxDbm(rx.get(item.key)) : null;

            let status = "unknown";

            if (linkNumber === LINK_UP || rxPower !== null) {
                status = "online";
            } else if (linkNumber !== null || rxSeen) {
                status = "offline";
            }

            return {
                mac: item.mac,
                onu_mac: item.mac,
                serial: item.mac,
                pon: item.pon,
                f_s: "0/1",
                ont_id: item.onuId,
                name: cleanText(names.get(item.key)),
                status,
                rx_power: status === "online" ? rxPower : null,
                olt_model: this.model,
                vendor: this.vendor
            };
        });
    }
}

module.exports = {
    HiosoDriver,
    rxDbm
};
