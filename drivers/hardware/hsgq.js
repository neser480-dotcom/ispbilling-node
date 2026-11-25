"use strict";

/*
|--------------------------------------------------------------------------
| HSGQ OLT DRIVER (SNMP, read only; EPON and GPON models)
|--------------------------------------------------------------------------
| Standalone: this file does not use any other OLT vendor's code.
| OIDs and reading rules follow the open-source KusumaVision NMS
| (MIT licence, (c) 2026 PT BERKAH MEDIA KUSUMA VISION), HsgqSnmpService.
|
| Enterprise 50224. Two table layouts exist (detected automatically):
|   "id"     ...3.12.2.1.<col>.<index>   (newer firmware, optics ...3.12.3.1)
|   "legacy" ...3.3.2.1.<col>.<index>    (older firmware, optics ...3.3.3.1)
| <index> = 0x01000000 | (PON << 8) | ONU-ID.
| RX/TX are centi-dBm in optics column 4 / 5 (suffix .0.0 = ONU side).
|
| Online/offline: three possible sources (status column, online time, RX).
| The one whose per-PON counts match the OLT's own PON counters is used.
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
    firmware: "1.3.6.1.4.1.50224.3.1.1.6.0",
    ponRegistered: "1.3.6.1.4.1.50224.3.2.3.1.3",
    ponOnline: "1.3.6.1.4.1.50224.3.2.3.1.4"
};

const SCHEMAS = {
    id: {
        table: "1.3.6.1.4.1.50224.3.12.2.1",
        optic: "1.3.6.1.4.1.50224.3.12.3.1",
        name: 2,
        status: 3,
        identity: 15,
        identityIsMac: false,
        vendor: 8,
        model: 9,
        distance: 19,
        onlineTime: 23
    },
    legacy: {
        table: "1.3.6.1.4.1.50224.3.3.2.1",
        optic: "1.3.6.1.4.1.50224.3.3.3.1",
        name: 2,
        status: 9,
        identity: 7,
        identityIsMac: true,
        vendor: 25,
        model: null,
        distance: 15,
        onlineTime: null
    }
};

const OPTIC_RX = 4;
const OPTIC_TX = 5;
const STATUS_CANDIDATES = ["status_column", "online_time", "rx"];
const INDEX_TOP_BYTE = 0x01;

function cleanText(value) {
    return valueToText(value);
}

// Text columns sometimes arrive as hex bytes ("68 65 6C 6C 6F") -> "hello".
function readableText(value) {
    const clean = cleanText(value);

    if (clean === null) return null;

    if (/^(?:[0-9A-Fa-f]{2}\s+)+[0-9A-Fa-f]{2}$/.test(clean)) {
        const decoded = Buffer
            .from(clean.replace(/\s+/g, ""), "hex")
            .toString("latin1")
            .replace(/\0+$/, "");

        return /^[\x20-\x7e]+$/.test(decoded) ? decoded : clean;
    }

    return clean;
}

function decodeIndex(index) {
    if (((index >>> 24) & 0xff) !== INDEX_TOP_BYTE) return null;

    const pon = (index >>> 8) & 0xff;

    return pon >= 1 ? { pon, onuId: index & 0xff } : null;
}

function macFromText(clean) {
    if (clean === null) return null;

    if (
        /^(?:[0-9A-Fa-f]{2}[\s:\-]){5}[0-9A-Fa-f]{2}$/.test(clean) ||
        /^[0-9A-Fa-f]{12}$/.test(clean)
    ) {
        const hex = clean.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();

        return hex === "000000000000" ? null : hex.match(/.{2}/g).join(":");
    }

    return null;
}

// -> { serial, mac }. EPON gives a MAC, GPON a 12-char serial (e.g. HWTC1A2B3C4D).
function identity(value, preferMac = false) {
    const none = { serial: null, mac: null };

    if (Buffer.isBuffer(value) && value.length === 6 && preferMac) {
        const mac = macFromValue(value);

        return mac ? { serial: mac, mac } : none;
    }

    const clean = cleanText(value);

    if (clean === null) return none;

    const serialText = /^[A-Za-z0-9]{4}[0-9A-Fa-f]{8}$/.test(clean);
    const mac = preferMac || !serialText ? macFromText(clean) : null;

    if (mac) return { serial: mac, mac };

    let bytes;

    if (/^(?:[0-9A-Fa-f]{2}\s+){7}[0-9A-Fa-f]{2}$/.test(clean)) {
        bytes = Buffer.from(clean.replace(/\s+/g, ""), "hex");
    } else if (clean.length === 8) {
        bytes = Buffer.from(clean, "latin1");
    } else if (serialText) {
        return { serial: clean.toUpperCase(), mac: null };
    } else {
        return none;
    }

    const vendor = bytes.subarray(0, 4).toString("latin1");

    if (!/^[A-Za-z0-9]{4}$/.test(vendor)) return none;

    return {
        serial: (vendor + bytes.subarray(4, 8).toString("hex")).toUpperCase(),
        mac: null
    };
}

// centi-dBm -> dBm, only the usable window (-60..0)
function centiDbm(value) {
    const raw = toInteger(value);

    if (raw === null) return null;

    const dbm = Math.round(raw) / 100;

    return dbm < 0 && dbm > -60 ? dbm : null;
}

function centi(value) {
    const raw = toInteger(value);

    return raw === null || raw === 0 ? null : raw / 100;
}

class HsgqDriver {
    constructor(config = {}) {
        this.config = config;
        this.vendor = "HSGQ";
        this.model = String(config.model || "HSGQ OLT");
        this.opticalErrors = [];
        this.statusCheck = null;

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

    // Column of a per-ONU table -> Map(index -> value)
    async column(base) {
        const values = new Map();

        for (const [oid, value] of await robustWalk(this.snmp, base, 2)) {
            const suffix = oidSuffix(oid, base);

            if (suffix && suffix.length === 1) values.set(suffix[0], value);
        }

        return values;
    }

    // Optic column -> [onuSide, oltSide]; suffix is <index>.<a>.<b>
    async opticColumn(base) {
        const onuSide = new Map();
        const oltSide = new Map();

        for (const [oid, value] of await robustWalk(this.snmp, base, 2)) {
            const suffix = oidSuffix(oid, base);

            if (!suffix || suffix.length !== 3) continue;

            const [index, a, b] = suffix;

            if (a === 0 && b === 0) onuSide.set(index, value);
            else if (a === 65535 && b === 65535) oltSide.set(index, value);
        }

        return [onuSide, oltSide];
    }

    async detectSchema() {
        for (const [key, schema] of Object.entries(SCHEMAS)) {
            for (const col of [schema.identity, schema.name]) {
                const rows = await this.snmp.walk(`${schema.table}.${col}`);

                if (rows.length) return key;
            }
        }

        return null;
    }

    // { pon -> { registered, online } } from the OLT's own counters
    async ponCounters() {
        const counters = new Map();

        for (const [field, base] of [
            ["registered", OID.ponRegistered],
            ["online", OID.ponOnline]
        ]) {
            let rows;

            try {
                rows = await this.column(base);
            } catch (error) {
                continue;
            }

            for (const [index, value] of rows) {
                const position = decodeIndex(index);

                if (!position) continue;

                const entry = counters.get(position.pon) ||
                    { registered: null, online: null };

                entry[field] = toInteger(value);
                counters.set(position.pon, entry);
            }
        }

        return counters;
    }

    isOnline(row, source) {
        if (source === "status_column") return row.statusRaw === 1;
        if (source === "online_time") return (row.onlineTime || 0) > 0;

        return row.rx !== null;
    }

    // Pick the status source whose per-PON online counts match the OLT.
    async resolveStatus(rows, hasStatusColumn, hasOnlineTime) {
        const available = {
            status_column: hasStatusColumn,
            online_time: hasOnlineTime,
            rx: true
        };

        const expected = new Map();

        for (const [pon, count] of await this.ponCounters()) {
            if (
                count.online !== null &&
                (count.registered === null || count.online <= count.registered)
            ) {
                expected.set(pon, count.online);
            }
        }

        if (expected.size && rows.length) {
            for (const candidate of STATUS_CANDIDATES) {
                if (!available[candidate]) continue;

                const counts = new Map();

                for (const row of rows) {
                    counts.set(
                        row.pon,
                        (counts.get(row.pon) || 0) + (this.isOnline(row, candidate) ? 1 : 0)
                    );
                }

                const pons = new Set([...expected.keys(), ...counts.keys()]);
                let matches = true;

                for (const pon of pons) {
                    if ((counts.get(pon) || 0) !== (expected.get(pon) || 0)) {
                        matches = false;
                        break;
                    }
                }

                if (matches) {
                    this.statusCheck = { source: candidate, verified: true };
                    return { source: candidate, verified: true };
                }
            }
        }

        const fallback = hasStatusColumn
            ? "status_column"
            : hasOnlineTime ? "online_time" : "rx";

        this.statusCheck = { source: fallback, verified: false };

        return { source: fallback, verified: false };
    }

    async getONUList() {
        this.opticalErrors = [];

        const schemaKey = await this.detectSchema();

        if (!schemaKey) return [];

        const schema = SCHEMAS[schemaKey];
        const col = number => (number === null
            ? Promise.resolve(new Map())
            : this.column(`${schema.table}.${number}`));

        const names = await col(schema.name);
        const identities = await col(schema.identity);
        const statuses = await col(schema.status);
        const vendors = await col(schema.vendor);
        const models = await col(schema.model);
        const distances = await col(schema.distance);
        const onlineTimes = await col(schema.onlineTime);

        let rxOnu = new Map();
        let txOnu = new Map();

        try {
            [rxOnu] = await this.opticColumn(`${schema.optic}.${OPTIC_RX}`);
            [txOnu] = await this.opticColumn(`${schema.optic}.${OPTIC_TX}`);
        } catch (error) {
            this.opticalErrors.push(`optics: ${error.message}`);
        }

        const rows = [];
        const indexes = new Set([...identities.keys(), ...names.keys()]);

        for (const index of indexes) {
            const position = decodeIndex(index);

            if (!position) continue;

            rows.push({
                index,
                pon: position.pon,
                onuId: position.onuId,
                identity: identity(identities.get(index), schema.identityIsMac),
                name: readableText(names.get(index)),
                statusRaw: toInteger(statuses.get(index)),
                onlineTime: toInteger(onlineTimes.get(index)),
                rx: centiDbm(rxOnu.get(index)),
                tx: centi(txOnu.get(index)),
                model: readableText(models.get(index)),
                vendor: readableText(vendors.get(index)),
                distance: toInteger(distances.get(index))
            });
        }

        const { source } = await this.resolveStatus(
            rows,
            statuses.size > 0,
            onlineTimes.size > 0
        );

        rows.sort((a, b) => a.pon - b.pon || a.onuId - b.onuId);

        return rows.map(row => {
            const online = this.isOnline(row, source);

            return {
                mac: row.identity.mac,
                onu_mac: row.identity.mac,
                serial: row.identity.serial || row.identity.mac,
                pon: row.pon,
                f_s: "0/1",
                ont_id: row.onuId,
                name: row.name,
                status: online ? "online" : "offline",
                rx_power: online ? row.rx : null,
                tx_power: online ? row.tx : null,
                distance: row.distance !== null && row.distance > 0
                    ? row.distance
                    : null,
                olt_model: this.model,
                onu_model: row.model,
                onu_vendor: row.vendor,
                vendor: this.vendor
            };
        });
    }
}

module.exports = {
    HsgqDriver,
    decodeIndex,
    identity,
    centiDbm
};
