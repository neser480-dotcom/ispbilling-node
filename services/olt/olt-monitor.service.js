"use strict";

const { EcomDriver } = require("../../drivers/hardware/ecom");
const { CDataDriver } = require("../../drivers/hardware/cdata");
const { VsolDriver } = require("../../drivers/hardware/vsol");
const bdcomTelemetry = require("./bdcom-telemetry");

const PON_PORTS = [
    "0/1/1", "0/1/2", "0/1/3", "0/1/4",
    "0/2/1", "0/2/2", "0/2/3", "0/2/4"
];

const CDATA_PON_PORTS = [
    "0/0/1", "0/0/2", "0/0/3", "0/0/4"
];

const DDM_FIELDS = ["temp", "voltage", "bias", "tx", "rx"];

/*
|--------------------------------------------------------------------------
| OUTPUT CLEANER
|--------------------------------------------------------------------------
*/

function cleanOutput(output) {
    return String(output ?? "")
        .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
        .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "")
        .replace(/\r/g, "")
        .replace(/--\s*More\s*--/gi, "")
        .trim();
}

/*
|--------------------------------------------------------------------------
| VALUE PARSER
|--------------------------------------------------------------------------
*/

function parseValue(text, labels) {
    const lines = cleanOutput(text).split("\n");

    for (const line of lines) {
        for (const label of labels) {
            const regex = new RegExp(
                "^\\s*" + label +
                "\\s*(?:\\([^)]*\\))?\\s*[:=]?\\s*" +
                "([+-]?\\d+(?:\\.\\d+)?)",
                "i"
            );

            const match = line.match(regex);

            if (match) {
                const value = Number(match[1]);

                if (Number.isFinite(value)) {
                    return value;
                }
            }
        }
    }

    return null;
}

/*
|--------------------------------------------------------------------------
| STANDARD UNAVAILABLE PORT
|--------------------------------------------------------------------------
*/

function unavailablePort(id, status = "unavailable") {
    return {
        id: String(id),
        name: `PON ${String(id).split("/").pop()}`,
        temp: null,
        voltage: null,
        bias: null,
        tx: null,
        rx: null,
        status,
        missing_fields: [...DDM_FIELDS]
    };
}

/*
|--------------------------------------------------------------------------
| FINALIZE ECOM PORT
|--------------------------------------------------------------------------
*/

function finalizePort(port) {
    const result = { ...port };

    const missing = DDM_FIELDS.filter(field => {
        const value = result[field];

        return (
            value === null ||
            value === undefined ||
            value === "" ||
            !Number.isFinite(Number(value))
        );
    });

    for (const field of missing) {
        result[field] = null;
    }

    result.status = missing.length === 0
        ? "ok"
        : missing.length === DDM_FIELDS.length
            ? "unavailable"
            : "partial";

    result.missing_fields = missing;

    return result;
}

/*
|--------------------------------------------------------------------------
| ECOM DDM PARSER
|--------------------------------------------------------------------------
*/

function parseDdm(output, id) {
    const text = cleanOutput(output);

    return {
        id: String(id),
        name: `PON ${String(id).split("/").pop()}`,

        temp: parseValue(text, [
            "Temperature",
            "Temp"
        ]),

        voltage: parseValue(text, [
            "Voltage",
            "Volt"
        ]),

        bias: parseValue(text, [
            "Bias\\s*Current",
            "Bias",
            "Laser\\s*Current"
        ]),

        tx: parseValue(text, [
            "TX\\s*Power",
            "Transmit\\s*Power",
            "TX"
        ]),

        rx: parseValue(text, [
            "RX\\s*Power",
            "Receive\\s*Power",
            "RX"
        ])
    };
}

/*
|--------------------------------------------------------------------------
| C-DATA DDM PARSER
|--------------------------------------------------------------------------
| Example:
| 0/0 pon1 34.2 3.29 8 7.70 -19.06
|--------------------------------------------------------------------------
*/

function parseCDataDdm(output) {
    const text = cleanOutput(output);
    const ports = [];
    const seen = new Set();

    // 0/0 pon1 ... | 0/0 epon 1 ... | pon0/0/1 ... | 0/0/1 ...
    const rowStart =
        /^\s*(?:(\d+\/\d+)\s+e?pon\s?([1-4])|e?pon\s?(\d+\/\d+)\/([1-4])|(\d+\/\d+)\/([1-4]))\s+(.+?)\s*$/i;

    // 34.2 | -19.06 | 34.2C | -19.06dBm | - | -- | N/A
    const cellPattern =
        /^(-?\d+(?:\.\d+)?|--?|N\/A)(?:dBm|mA|uA|V|\u00B0C|C)?$/i;

    function numeric(value) {
        if (
            value == null ||
            value === "-" ||
            value === "--" ||
            /^n\/a$/i.test(value)
        ) {
            return null;
        }

        const result = Number(value);

        return Number.isFinite(result) ? result : null;
    }

    for (const line of text.split("\n")) {
        const start = line.match(rowStart);

        if (!start) {
            continue;
        }

        const slot = start[1] || start[3] || start[5];
        const ponNumber = Number(start[2] || start[4] || start[6]);

        // temp, voltage, bias, tx, rx (extra columns are ignored)
        const cells = start[7].split(/\s+/).slice(0, 5);

        const parts = cells.map(cell => cell.match(cellPattern));

        if (cells.length < 5 || parts.some(part => !part)) {
            continue;
        }

        const id = `${slot}/${ponNumber}`;

        if (seen.has(id)) {
            continue;
        }

        seen.add(id);

        const [temp, voltage, bias, tx, rx] =
            parts.map(part => numeric(part[1]));

        const missing_fields = [];

        if (temp === null) missing_fields.push("temp");
        if (voltage === null) missing_fields.push("voltage");
        if (bias === null) missing_fields.push("bias");
        if (tx === null) missing_fields.push("tx");
        if (rx === null) missing_fields.push("rx");

        ports.push({
            id,
            name: `PON ${ponNumber}`,
            status: missing_fields.length ? "partial" : "ok",
            temp,
            voltage,
            bias,
            tx,
            rx,
            missing_fields
        });
    }

    return ports;
}

/*
|--------------------------------------------------------------------------
| PON CONFIGURATION
|--------------------------------------------------------------------------
*/

function getPonPorts(olt) {
    const configuredCount = Number(olt.pon_ports);

    const identity =
        `${olt.vendor || ""} ${olt.model || ""} ${olt.name || ""}`;

    const isEightPortEcom =
        Number(olt.id) === 45 ||
        /E08EP|Ecom\s*8s/i.test(identity);

    const count =
        Number.isInteger(configuredCount) && configuredCount > 0
            ? Math.min(configuredCount, PON_PORTS.length)
            : isEightPortEcom
                ? 8
                : 4;

    return PON_PORTS.slice(0, count);
}

function isCData(olt) {
    const vendor = String(olt.vendor || "")
        .trim()
        .toLowerCase();

    const identity =
        `${olt.model || ""} ${olt.name || ""}`;

    return (
        Number(olt.id) === 43 ||
        vendor.includes("cdata") ||
        vendor.includes("c-data") ||
        /E1204ES/i.test(identity)
    );
}

function isSupportedEcom(olt) {
    const vendor = String(olt.vendor || "")
        .trim()
        .toLowerCase();

    const identity =
        `${olt.model || ""} ${olt.name || ""}`;

    return (
        vendor.includes("ecom") &&
        (
            Number(olt.id) === 45 ||
            /E08EP/i.test(identity) ||
            /Ecom\s*8s/i.test(identity)
        )
    );
}

function buildDriverConfig(olt) {
    return {
        id: olt.id,
        olt_id: olt.id,
        company_id: olt.company_id,
        vendor: olt.vendor,
        name: olt.name,
        model: olt.model,
        ip: olt.ip,
        host: olt.ip,
        address: olt.ip,
        port: Number(olt.port) || 23,
        username: olt.username,
        user: olt.username,
        password: olt.password,
        timeout: 12000
    };
}

/*
|--------------------------------------------------------------------------
| ECOM SYSTEM TELEMETRY
|--------------------------------------------------------------------------
*/

function parseSystemTelemetry(outputs) {
    const fanText = cleanOutput(outputs.fan);
    const tempText = cleanOutput(outputs.temperature);
    const cpuText = cleanOutput(outputs.cpu);
    const memoryText = cleanOutput(outputs.memory);
    const powerText = cleanOutput(outputs.power);
    const deviceText = cleanOutput(outputs.device);
    const versionText = cleanOutput(outputs.version);
    const uptimeText = cleanOutput(outputs.uptime);

    const fanRpm = [
        ...fanText.matchAll(
            /FAN\[(\d+)\]\s+status:\s*([^(]+)\((\d+)\s*RPM\)/gi
        )
    ].map(match => ({
        name: `FAN ${match[1]}`,
        status: match[2].trim(),
        rpm: Number(match[3])
    }));

    const fanLevelMatch = fanText.match(
        /Fan speed level\s*:\s*(\d+)/i
    );

    const slotTemperatures = [
        ...tempText.matchAll(
            /^\s*(\d+)\s+(-?\d+(?:\.\d+)?)\s*$/gm
        )
    ].map(match => ({
        slot: Number(match[1]),
        temperatureC: Number(match[2])
    }));

    const cpu = {
        fiveSeconds: parseValue(cpuText, [
            "Load Average\\(5sec\\)"
        ]),
        oneMinute: parseValue(cpuText, [
            "Load Average\\(1min\\)"
        ]),
        fiveMinutes: parseValue(cpuText, [
            "Load Average\\(5min\\)"
        ]),
        fifteenMinutes: parseValue(cpuText, [
            "Load Average\\(15min\\)"
        ])
    };

    const memory = {
        totalMB: parseValue(memoryText, [
            "Total memory"
        ]),
        freeMB: parseValue(memoryText, [
            "Free memory"
        ]),
        utilizationPercent: parseValue(memoryText, [
            "Utilization"
        ])
    };

    const psu = [
        ...powerText.matchAll(
            /^\s*(\d+)\s+(YES|NO)\s+(ON|OFF)\s+(\S+)\s+(\S+)\s*$/gmi
        )
    ].map(match => ({
        name: `PSU Slot ${match[1]}`,
        slot: Number(match[1]),
        present: match[2].toUpperCase() === "YES",
        powerState: match[3].toUpperCase(),
        status: match[4],
        type: match[5],
        input: "N/A",
        output: "N/A",
        load: "N/A"
    }));

    const channelSection = powerText.match(
        /Channel\s+Vol\(V\)([\s\S]*?)(?:Device power:|$)/i
    );

    const voltageChannels = [
        ...(channelSection?.[1] || "").matchAll(
            /^\s*(\d+)\s+(-?\d+(?:\.\d+)?)\s*$/gm
        )
    ].map(match => ({
        channel: Number(match[1]),
        voltage: Number(match[2])
    }));

    const devicePowerW = parseValue(powerText, [
        "Device power"
    ]);

    const firmware = (
        versionText.match(/Firmware version\s*:\s*(.+)/i) || []
    )[1]?.trim() ?? null;

    const hardware = (
        versionText.match(/Hardware version\s*:\s*(.+)/i) || []
    )[1]?.trim() ?? null;

    const webVersion = (
        versionText.match(/Web version\s*:\s*(.+)/i) || []
    )[1]?.trim() ?? null;

    const softwareVersion = (
        versionText.match(/Software version\s+(.+)/i) || []
    )[1]?.trim() ?? null;

    const serial = (
        deviceText.match(/Device serial-number\s*:\s*(.+)/i) || []
    )[1]?.trim() ?? null;

    const deviceMac = (
        deviceText.match(/Device MAC address\s*:\s*(.+)/i) || []
    )[1]?.trim() ?? null;

    const uptime = (
        uptimeText.match(/System running time\s*:\s*(.+)/i) ||
        versionText.match(/EPON OLT uptime is\s*(.+)\./i) ||
        []
    )[1]?.trim() ?? null;

    const uptimeSince = (
        uptimeText.match(/System uptime time\s*:\s*(.+)/i) || []
    )[1]?.trim() ?? null;

    return {
        fan: {
            mode: (
                fanText.match(/Fan speed mode:\s*(.+)/i) || []
            )[1]?.trim() ?? null,

            level: fanLevelMatch
                ? Number(fanLevelMatch[1])
                : null,

            fans: fanRpm
        },

        slotTemperatures,

        temperatureC:
            slotTemperatures.find(item => item.slot === 0)
                ?.temperatureC ?? null,

        cpu,
        memory,
        psu,
        voltageChannels,

        voltageChannel0:
            voltageChannels.find(item => item.channel === 0)
                ?.voltage ?? null,

        devicePowerW,
        firmware,
        hardware,
        webVersion,
        softwareVersion,
        serial,
        deviceMac,
        uptime,
        uptimeSince
    };
}

/*
|--------------------------------------------------------------------------
| C-DATA SYSTEM TELEMETRY
|--------------------------------------------------------------------------
*/

function parseCDataSystem(outputs, olt) {
    const temperatureText = cleanOutput(outputs.temperature);
    const cpuText = cleanOutput(outputs.cpu);
    const memoryText = cleanOutput(outputs.memory);
    const uptimeText = cleanOutput(outputs.uptime);
    const deviceText = cleanOutput(outputs.device);
    const versionText = cleanOutput(outputs.version);
    const fanText = cleanOutput(outputs.fan);
    const powerText = cleanOutput(outputs.power);
    const boardText = cleanOutput(outputs.board);
    const timeText = cleanOutput(outputs.time);
    const ontStatsText = cleanOutput(outputs.ontStatistics);

    /*
     * CPU:
     * Utilization : 4%
     * Load Average(1min) : 11.65
     */

    const cpuPercent = parseValue(cpuText, [
        "CPU\\s*utilization",
        "CPU\\s*usage",
        "Utilization"
    ]);

    const loadAverage = {
        oneMinute: parseValue(cpuText, [
            "Load Average\\(1min\\)"
        ]),
        fiveMinutes: parseValue(cpuText, [
            "Load Average\\(5min\\)"
        ]),
        fifteenMinutes: parseValue(cpuText, [
            "Load Average\\(15min\\)"
        ])
    };

    /*
     * MEMORY:
     * Total memory 487MB
     * Free memory 295MB
     * Utilization 40%
     */

    const memoryTotalMB = parseValue(memoryText, [
        "Total\\s*memory",
        "Total"
    ]);

    const memoryFreeMB = parseValue(memoryText, [
        "Free\\s*memory",
        "Free"
    ]);

    const memoryUtilizationPercent = parseValue(memoryText, [
        "Utilization"
    ]);

    /*
     * TEMPERATURE:
     * The temperature of the board: 47.1(C)
     *
     * Also support other firmware label formats.
     */

    let temperatureC = parseValue(temperatureText, [
        "The\\s+temperature\\s+of\\s+the\\s+board",
        "Board\\s+temperature",
        "Temperature",
        "Temp"
    ]);

    /*
     * Some firmware versions include a slot number.
     */

    const slotTemperatures = [
        ...temperatureText.matchAll(
            /^\s*(\d+)\s+(-?\d+(?:\.\d+)?)\s*(?:\([^)]+\))?\s*$/gm
        )
    ].map(match => ({
        slot: Number(match[1]),
        temperatureC: Number(match[2])
    }));

    if (temperatureC === null && slotTemperatures.length) {
        temperatureC =
            slotTemperatures.find(item => item.slot === 0)
                ?.temperatureC ??
            slotTemperatures[0].temperatureC;
    }

    /*
     * UPTIME:
     * System up time : 181 day 1 hour ...
     * System boot time : Thu Apr 30 ...
     */

    const uptimeMatch = uptimeText.match(
        /System\s+up\s+time\s*:\s*(.*?)(?:;|\n|$)/i
    );

    const bootTimeMatch = uptimeText.match(
        /System\s+boot\s+time\s*:\s*(.*?)(?:\n|$)/i
    );

    const clockMatch = timeText.match(
        /^\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+[^\r\n]+)/m
    );

    /*
     * FAN:
     * FAN[1] status: Normal (9900RPM)
     * FAN[2] status: Normal (9780RPM)
     */

    const fanRows = [
        ...fanText.matchAll(
            /FAN\[(\d+)\]\s+status:\s*([^(]+?)\s*\(\s*(\d+)\s*RPM\s*\)/gi
        )
    ].map(match => ({
        name: `FAN ${match[1]}`,
        status: match[2].trim(),
        rpm: Number(match[3])
    }));

    const fanModeMatch = fanText.match(
        /Fan\s+speed\s+mode\s*[:=]?\s*(\w+)/i
    );

    const fanLevelMatch = fanText.match(
        /Fan\s+speed\s+level\s*[:=]?\s*(\d+)/i
    );

    /*
     * POWER:
     * Slot-ID   Status
     * 1         working
     * 2         no work
     *
     * These are PSU slot statuses, not wattage or voltage.
     */

    const powerSlots = [
        ...powerText.matchAll(
            /^\s*(\d+)\s+(working|no\s+work)\s*$/gmi
        )
    ].map(match => {
        const status = match[2]
            .trim()
            .replace(/\s+/g, " ");

        return {
            slot: Number(match[1]),
            status,
            working: /^working$/i.test(status)
        };
    });

    /*
     * ONT REGISTER STATISTICS
     */

    const registerStats = [
        ...ontStatsText.matchAll(
            /^\s*0\/0\s+([1-4])\s+\d+\s+(\d+)\s+(\d+)\s*$/gm
        )
    ].map(match => ({
        pon: `0/0/${match[1]}`,
        authenticated: Number(match[2]),
        online: Number(match[3])
    }));

    /*
     * DEVICE IDENTIFICATION
     */

    const firmware = (
        versionText.match(/Firmware version\s*:\s*(.+)/i) || []
    )[1]?.trim() ?? null;

    const hardware = (
        versionText.match(/Hardware version\s*:\s*(.+)/i) || []
    )[1]?.trim() ?? null;

    const webVersion = (
        versionText.match(/Web version\s*:\s*(.+)/i) || []
    )[1]?.trim() ?? null;

    const softwareVersion = (
        versionText.match(/Software version\s*[:=]?\s*(.+)/i) || []
    )[1]?.trim() ?? null;

    const serial = (
        deviceText.match(/Serial(?:\s+number)?\s*[:=]\s*(.+)/i) ||
        deviceText.match(/Device serial-number\s*:\s*(.+)/i) ||
        []
    )[1]?.trim() ?? null;

    const deviceMac = (
        deviceText.match(/Device MAC(?: address)?\s*[:=]\s*(.+)/i) || []
    )[1]?.trim() ?? null;

    const model = (
        deviceText.match(/Device model\s*[:=]\s*(.+)/i) ||
        deviceText.match(/Model\s*[:=]\s*(.+)/i) ||
        []
    )[1]?.trim() || olt.model || null;

    const csm = (
        deviceText.match(/\bCSM\s*[:=]\s*(.+)/i) || []
    )[1]?.trim() ?? null;

    const kernelVersion = (
        versionText.match(/Kernel version\s*:\s*(.+)/i) || []
    )[1]?.trim() ?? null;

    const modules = parseBoardModules(boardText, olt && olt.pon_ports);

    /*
     * Do not invent PSU voltage, channel voltage or power wattage.
     * The supplied "show power state" output provides slot statuses only.
     */

    return {
        vendor: "C-Data",
        model,
        csm,
        firmware,
        hardware,
        webVersion,
        softwareVersion,
        kernelVersion,
        serial,
        deviceMac,

        temperatureC,
        slotTemperatures,

        cpuUtilizationPercent: cpuPercent,
        loadAverage,

        memoryTotalMB,
        memoryFreeMB,
        memoryUtilizationPercent,

        uptime: uptimeMatch
            ? uptimeMatch[1].trim()
            : null,

        bootTime: bootTimeMatch
            ? bootTimeMatch[1].trim()
            : null,

        deviceTime: clockMatch
            ? clockMatch[1].trim()
            : null,

        fan: {
            mode: fanModeMatch
                ? fanModeMatch[1].trim()
                : null,

            level: fanLevelMatch
                ? Number(fanLevelMatch[1])
                : null,

            fans: fanRows
        },

        powerSlots,
        registerStats,
        board: boardText || null,
        modules,

        /*
         * These values remain null until a supported CLI command
         * returns actual voltage or wattage measurements.
         */
        psu: powerSlots.map(item => ({
            name: `PSU Slot ${item.slot}`,
            slot: item.slot,
            present: item.working,
            powerState: item.working ? "ON" : "OFF",
            status: item.status,
            type: "Not reported",
            input: "Not reported",
            output: "Not reported",
            load: "Not reported"
        })),
        voltage: null,
        voltageChannels: [],
        voltageChannel0: null,
        devicePowerW: null
    };
}

/*
|--------------------------------------------------------------------------
| C-DATA EXTRAS: DDM re-read, board modules, alarms/events
|--------------------------------------------------------------------------
*/

function nowStamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, "0");

    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
        " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

// Fills only the values that are still empty, from a second read.
async function fillMissingDdm(ports, reread) {
    if (
        !ports.length ||
        !ports.some(port => port.missing_fields && port.missing_fields.length)
    ) {
        return ports;
    }

    await new Promise(resolve => setTimeout(resolve, 1500));

    let again = [];

    try {
        again = parseCDataDdm(await reread());
    } catch (_) {
        return ports;
    }

    return ports.map(port => {
        const next = again.find(item => item.id === port.id);

        if (!next) return port;

        const merged = { ...port };

        for (const field of DDM_FIELDS) {
            if (
                (merged[field] === null || merged[field] === undefined) &&
                next[field] !== null &&
                next[field] !== undefined
            ) {
                merged[field] = next[field];
            }
        }

        const missing = DDM_FIELDS.filter(
            field => merged[field] === null || merged[field] === undefined
        );

        merged.missing_fields = missing;
        merged.status = missing.length ? "partial" : "ok";

        return merged;
    });
}

// "show board" row:  0   FD1204   191:11:44:01   Normal   --
function parseBoardModules(boardText, ponCount) {
    const count = Math.min(
        Math.max(Number(ponCount) || CDATA_PON_PORTS.length, 1),
        CDATA_PON_PORTS.length
    );

    const first = CDATA_PON_PORTS[0];
    const last = CDATA_PON_PORTS[count - 1];

    return [
        ...cleanOutput(boardText).matchAll(
            /^\s*(\d+)\s+(\S+)\s+(\d+):(\d+):(\d+):(\d+)\s+(\S+)(?:\s+(.*))?$/gm
        )
    ].map(match => {
        const reason = String(match[8] || "").trim();

        return {
            name: "Slot " + match[1] +
                " (plugged " + Number(match[3]) + "d " + Number(match[4]) + "h)",
            type: match[2],
            range: count + " PON ports (" + first + " - " + last + ")",
            status: match[7] + (reason && reason !== "--" ? " - " + reason : "")
        };
    });
}

// Defensive parser for "show alarm ... all" / "show event history all".
// Header, separator, prompt and error lines are skipped; nothing is invented.
function parseDeviceRecords(text, source) {
    const skip = [
        /^[-=\s]*$/,
        /^show\s/i,
        /\(config\)#|#\s*$/,
        /command incomplete|unknown command|no matched command|^%/i,
        /^(?:alarm\s?id|event\s?id|index|no\.?|time)\b/i,
        /total number/i,
        /\bno\s+(?:\w+\s+){0,2}(?:record|alarm|event)s?\b/i,
        /\b(?:0|zero)\s+(?:record|alarm|event)s?\b/i
    ];

    const levelOf = line =>
        /\bcrit(?:ical)?\b/i.test(line) ? "Critical" :
        /\berr(?:or)?\b/i.test(line) ? "Error" :
        /\bwarn(?:ing)?\b/i.test(line) ? "Warning" :
        "Info";

    const records = cleanOutput(text)
        .split("\n")
        .map(line => line.replace(/\s+/g, " ").trim())
        .filter(line => line && !skip.some(re => re.test(line)))
        .map(line => {
            const stamp = line.match(
                /\d{4}[-\/]\d{2}[-\/]\d{2}[ T]\d{2}:\d{2}:\d{2}/
            );

            return {
                time: stamp
                    ? stamp[0].replace(/\//g, "-").replace("T", " ")
                    : "-",
                event: line.slice(0, 160),
                source,
                level: levelOf(line),
                derived: false
            };
        });

    if (records.length && records.every(record => record.time !== "-")) {
        records.sort((a, b) =>
            a.time < b.time ? 1 : a.time > b.time ? -1 : 0
        );
    }

    return records.slice(0, 10);
}

// Current conditions that are really visible in the data we already read.
function buildDerivedEvents(system, ports) {
    const time = nowStamp();
    const events = [];

    for (const slot of (system && system.powerSlots) || []) {
        if (!slot.working) {
            events.push({
                time,
                event: "Power supply slot " + slot.slot +
                    " is not working (no power redundancy)",
                source: "PSU",
                level: "Warning",
                derived: true
            });
        }
    }

    for (const fan of (system && system.fan && system.fan.fans) || []) {
        if (!/normal|ok/i.test(String(fan.status))) {
            events.push({
                time,
                event: fan.name + " status: " + fan.status,
                source: "FAN",
                level: "Error",
                derived: true
            });
        }
    }

    for (const port of ports || []) {
        if (
            Array.isArray(port.missing_fields) &&
            port.missing_fields.includes("rx")
        ) {
            events.push({
                time,
                event: port.name + ": no RX power reading from the OLT",
                source: "PON " + String(port.id).split("/").pop(),
                level: "Info",
                derived: true
            });
        }
    }

    return events;
}

/*
|--------------------------------------------------------------------------
| C-DATA LIVE MONITORING
|--------------------------------------------------------------------------
*/

async function readCDataLiveDdm(olt) {
    const driver = new CDataDriver(buildDriverConfig(olt));
    const warnings = [];

    let ports = [];
    let system = null;
    let events = [];
    let inConfig = false;

    try {
        await driver.connect();

        /*
         * Keep the existing DDM command and parser.
         * If unsupported by this firmware, telemetry commands below
         * are still attempted independently.
         */

        let ddmOutput = "";

        try {
            ddmOutput = await driver.command(
                "show ddm-info all",
                15000
            );
        } catch (error) {
            warnings.push(
                `show ddm-info all: ${String(
                    error?.message || "command failed"
                ).slice(0, 120)}`
            );
        }

        ports = parseCDataDdm(ddmOutput);


        for (const id of CDATA_PON_PORTS) {
            const found = ports.some(
                port => String(port.id) === id
            );

            if (!found) {
                warnings.push(
                    `${id}: DDM row was not found in show ddm-info all output.`
                );
            }
        }

        ports.sort((a, b) =>
            a.id.localeCompare(
                b.id,
                undefined,
                { numeric: true }
            )
        );

        /*
         * Read each system command independently so an unsupported
         * command does not prevent other telemetry from being parsed.
         */

        const commands = {
            temperature: "show temperature",
            cpu: "show cpu",
            memory: "show memory",
            uptime: "show uptime",
            device: "show device",
            version: "show version",
            fan: "show fan",
            power: "show power state",
            board: "show board",
            time: "show time",
            ontStatistics: "show ont register-statistics all"
        };

        const outputs = {};

        for (const [key, command] of Object.entries(commands)) {
            try {
                outputs[key] = await driver.command(
                    command,
                    12000
                );
            } catch (error) {
                outputs[key] = "";

                warnings.push(
                    `${command}: ${String(
                        error?.message || "command failed"
                    ).slice(0, 120)}`
                );
            }
        }

        system = parseCDataSystem(outputs, olt);

        // DDM commands live in config mode (like the ONU commands). This runs
        // LAST, so nothing here can affect the telemetry read above.
        if (
            !ports.some(
                port =>
                    port.status === "ok" ||
                    port.status === "partial"
            )
        ) {
            const brief = text =>
                cleanOutput(text)
                    .split("\n")
                    .map(line => line.trim())
                    .filter(Boolean)
                    .slice(0, 14)
                    .join(" // ")
                    .slice(0, 500) || "(empty)";

            const words = text =>
                [
                    ...new Set(
                        cleanOutput(text)
                            .split("\n")
                            .map(line => line.trim())
                            .filter(
                                line =>
                                    line &&
                                    !/^%/.test(line) &&
                                    !/^show\b/i.test(line) &&
                                    !/#\s*$/.test(line)
                            )
                            .map(line => line.split(/\s+/)[0])
                    )
                ].join(", ").slice(0, 2500) || "(empty)";

            const ask = async command => {
                try {
                    return await driver.command(command, 20000);
                } catch (error) {
                    return (
                        "ERROR " +
                        String(error?.message || "").slice(0, 80)
                    );
                }
            };

            const attempts = [];

            try {
                await driver.enterConfig();
                inConfig = true;

                const all = await ask("show ddm-info all");

                ports = parseCDataDdm(all);

                // The OLT sometimes leaves RX empty for one read; read once more.
                ports = await fillMissingDdm(
                    ports,
                    () => ask("show ddm-info all")
                );

                if (!ports.length) {
                    attempts.push(
                        "[config] show ddm-info all => " + brief(all)
                    );

                    for (const id of CDATA_PON_PORTS) {
                        const output = await ask(
                            `show port ddm-info epon ${id}`
                        );

                        const port = finalizePort(parseDdm(output, id));

                        if (port.status !== "unavailable") {
                            ports.push(port);
                        } else if (id === CDATA_PON_PORTS[0]) {
                            attempts.push(
                                `[config] show port ddm-info epon ${id} => ` +
                                brief(output)
                            );
                        }
                    }
                }

                if (!ports.length) {
                    attempts.push(
                        "[config] show ? => " + words(await ask("show ?"))
                    );

                    const entered = await ask("interface epon 0/0");

                    if (/no matched|unknown|invalid|incomplete|ERROR/i.test(entered)) {
                        attempts.push(
                            "interface epon 0/0 => " + brief(entered)
                        );
                    } else {
                        attempts.push(
                            "[interface epon 0/0] show ? => " +
                            words(await ask("show ?"))
                        );
                    }
                }
            } catch (error) {
                attempts.push(
                    "ERROR " + String(error?.message || "").slice(0, 80)
                );
            }

            if (ports.length) {
                ports.sort((a, b) =>
                    a.id.localeCompare(b.id, undefined, { numeric: true })
                );

                for (let i = warnings.length - 1; i >= 0; i--) {
                    if (/DDM row was not found/.test(warnings[i])) {
                        warnings.splice(i, 1);
                    }
                }
            } else {
                warnings.push(
                    "DDM command probe: " + attempts.join(" ## ")
                );
            }
        }

        if (
            !ports.some(
                port =>
                    port.status === "ok" ||
                    port.status === "partial"
            )
        ) {
            warnings.push(
                "No valid PON DDM rows were parsed. " +
                "The current firmware may not support 'show ddm-info all'."
            );
        }

        // Device alarms / events (read-only "show" commands).
        try {
            if (!inConfig) {
                await driver.enterConfig();
                inConfig = true;
            }

            const readRecords = async (command, label) => {
                try {
                    return parseDeviceRecords(
                        await driver.command(command, 15000),
                        label
                    );
                } catch (error) {
                    warnings.push(
                        command + ": " +
                        String((error && error.message) || "failed").slice(0, 100)
                    );

                    return [];
                }
            };

            events = [
                ...(await readRecords("show alarm active all", "Alarm (active)")),
                ...(await readRecords("show alarm history all", "Alarm (history)")),
                ...(await readRecords("show event history all", "Event (history)"))
            ];
        } catch (error) {
            warnings.push(
                "Device alarm/event read failed: " +
                String((error && error.message) || "").slice(0, 100)
            );
        }

        events = [...buildDerivedEvents(system, ports), ...events];
    } catch (error) {
        warnings.push(
            `OLT ${olt.id}: ${String(
                error?.message || "C-Data monitoring failed"
            ).slice(0, 200)}`
        );

        ports = CDATA_PON_PORTS.map(
            id => unavailablePort(id, "error")
        );

        system = null;
    } finally {
        try {
            if (typeof driver.disconnect === "function") {
                await driver.disconnect();
            }
        } catch (_) {
            // Preserve collected telemetry.
        }
    }

    return {
        ports,
        warnings,
        system,
        events
    };
}

/*
|--------------------------------------------------------------------------
| ECOM LIVE MONITORING
|--------------------------------------------------------------------------
*/

async function readEcomLiveDdm(olt) {
    const ponPorts = getPonPorts(olt);
    const driver = new EcomDriver(buildDriverConfig(olt));

    const ports = [];
    const warnings = [];

    let system = null;

    try {
        await driver.connect();
        await driver.detectModel();
        await driver.enterConfig();

        for (const id of ponPorts) {
            try {
                const output = await driver.command(
                    `show port ddm-info epon ${id}`,
                    12000
                );

                const result = finalizePort(
                    parseDdm(output, id)
                );

                ports.push(result);

                if (result.missing_fields.length) {
                    warnings.push(
                        `${id}: missing DDM fields: ` +
                        result.missing_fields.join(", ")
                    );
                }
            } catch (error) {
                ports.push({
                    ...unavailablePort(id, "error"),
                    error: String(
                        error?.message || "DDM query failed"
                    ).slice(0, 150)
                });

                warnings.push(`${id}: DDM query failed.`);
            }
        }

        const systemCommands = {
            fan: "show fan",
            temperature: "show temperature",
            cpu: "show cpu",
            memory: "show memory",
            power: "show power state",
            device: "show device",
            version: "show version",
            uptime: "show uptime"
        };

        const systemOutputs = {};

        for (const [key, command] of Object.entries(systemCommands)) {
            try {
                systemOutputs[key] = await driver.command(
                    command,
                    12000
                );
            } catch (error) {
                systemOutputs[key] = "";

                warnings.push(
                    `${command}: ${String(
                        error?.message || "command failed"
                    ).slice(0, 120)}`
                );
            }
        }

        system = parseSystemTelemetry(systemOutputs);

        if (!system.fan.fans.length) {
            warnings.push(
                "Fan telemetry was not parsed from the device output."
            );
        }

        if (!system.slotTemperatures.length) {
            warnings.push(
                "Slot temperature telemetry was not parsed."
            );
        }

        if (system.devicePowerW === null) {
            warnings.push(
                "Device power was not parsed from show power state."
            );
        }
    } catch (error) {
        warnings.push(
            `OLT ${olt.id}: ${String(
                error?.message || "ECOM connection failed"
            ).slice(0, 200)}`
        );

        for (const id of ponPorts) {
            if (!ports.some(port => port.id === id)) {
                ports.push(
                    unavailablePort(id, "error")
                );
            }
        }
    } finally {
        try {
            if (typeof driver.disconnect === "function") {
                await driver.disconnect();
            }
        } catch (_) {
            // Preserve collected telemetry.
        }
    }

    return {
        ports,
        warnings,
        system
    };
}

/*
|--------------------------------------------------------------------------
| V-SOL ONU OPTICAL TELEMETRY
|--------------------------------------------------------------------------
| V-SOL reports optical readings per ONU, not as PON SFP DDM. Aggregate
| online ONU readings by EPON interface and label the source accurately.
*/

function averageValues(rows, field) {
    const values = rows
        .map(row => row[field])
        .filter(value => value !== null && value !== undefined && Number.isFinite(Number(value)))
        .map(Number);

    return values.length
        ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
        : null;
}

function interfacesCountFromOnus(onus) {
    return new Set((onus || []).map(row => String(row.f_s || "").trim()).filter(Boolean)).size || 4;
}

function parseVsolVersion(output) {
    const text = cleanOutput(output);
    const value = pattern => (text.match(pattern) || [])[1]?.trim() || null;
    return {
        serial: value(/Olt Serial Number\s*:\s*(.+)/i),
        hardware: value(/Hardware Version\s*:\s*(.+)/i),
        softwareVersion: value(/Software Version\s*:\s*(.+)/i),
        firmware: value(/Software Version\s*:\s*(.+)/i),
        softwareCreatedTime: value(/Software Created Time\s*:\s*(.+)/i),
        versionType: value(/Olt Version Type\s*:\s*(.+)/i)
    };
}

function parseVsolFan(output) {
    const text = cleanOutput(output);
    const state = (text.match(/current fans state\s*:\s*(.+)/i) || [])[1]?.trim() || null;
    const tempMatch = text.match(/current temperature\s*:\s*(-?\d+(?:\.\d+)?)/i);
    const thresholdMatch = text.match(/open fan temperature\s*:\s*(-?\d+(?:\.\d+)?)/i);
    return {
        temperatureC: tempMatch ? Number(tempMatch[1]) : null,
        fan: { mode: state, level: null, fans: state ? [{ name: "Chassis Fan", status: state, rpm: null }] : [] },
        fanStartTemperatureC: thresholdMatch ? Number(thresholdMatch[1]) : null
    };
}

function parseVsolPonOptical(output, fs) {
    const text = cleanOutput(output);
    const read = pattern => { const match = text.match(pattern); return match ? Number(match[1]) : null; };
    const txUw = read(/Transmit Power\s*:\s*([\d.]+)\s*uW/i);
    const txDbm = read(/Transmit Power\s*:\s*[\d.]+\s*uW\s*\(\s*(-?[\d.]+)\s*dBm\s*\)/i);
    const voltage = read(/Voltage\s*:\s*(-?[\d.]+)\s*V/i);
    const bias = read(/Bias Current\s*:\s*(-?[\d.]+)\s*mA/i);
    const txAvailable = txDbm !== null || (txUw !== null && txUw > 0);
    return {
        id: "epon" + fs, name: "PON " + fs.split("/").pop(),
        temp: read(/Temp(?:p)?erature\s*:\s*(-?[\d.]+)/i),
        voltage,
        bias,
        tx: txDbm !== null ? txDbm : (txUw !== null && txUw > 0 ? Number((10 * Math.log10(txUw / 1000)).toFixed(2)) : null),
        rx: null,
        // This VSOL command does not report SFP RX or temperature on this model.
        // Determine health from the fields it actually supplies.
        status: [voltage, bias, txAvailable].every(value => value !== null && value !== false) ? "ok" : "partial",
        missing_fields: [
            ...(voltage === null ? ["voltage"] : []),
            ...(bias === null ? ["bias"] : []),
            ...(txAvailable ? [] : ["tx"])
        ],
        detail: "SFP RX and temperature are not reported by this VSOL command.",
        reading_source: "pon_sfp_ddm"
    };
}

async function readVsolLiveDdm(olt) {
    const driver = new VsolDriver(buildDriverConfig(olt));
    const warnings = [];
    let ports = [];
    let system = null;
    const modules = [];
    try {
        await driver.connect();
        const modelInfo = await driver.detectModel();
        const onus = await driver.getONUs();
        const interfaces = [...new Set(onus.map(row => String(row.f_s || "").trim()).filter(Boolean))].sort((a, b) => {
            const aa = a.split("/").map(Number); const bb = b.split("/").map(Number);
            return (aa[0] - bb[0]) || (aa[1] - bb[1]);
        });
        // Reconnect so the CLI is back at privileged mode before entering config mode.
        driver.disconnect();
        await driver.connect();
        await driver.command("configure terminal", 10000);
        const systemOutputs = {};
        for (const [key, command] of Object.entries({ version: "show version", fan: "show fan" })) {
            try {
                const output = await driver.command(command, 12000);
                systemOutputs[key] = output;
                if (/unknown command|invalid command|ambiguous command/i.test(output)) warnings.push(`${command}: ${stripAnsi(output).trim().slice(0, 140)}`);
            } catch (error) {
                systemOutputs[key] = "";
                warnings.push(`${command}: ${String(error?.message || "command failed").slice(0, 140)}`);
            }
        }
        const version = parseVsolVersion(systemOutputs.version || "");
        const fan = parseVsolFan(systemOutputs.fan || "");
        system = { vendor: modelInfo.vendor, model: version.hardware ? "VSOL EPON OLT" : modelInfo.model, ...version, ...fan, cpu: null, memory: null, psu: [], voltageChannels: [], powerSlots: [] };
        if (version.hardware) {
            modules.push({ name: "Chassis / Main Board", type: version.hardware, range: `${interfaces.length || 4} PON`, status: "Detected" });
        }
        for (const fs of interfaces) {
            try {
                await driver.command(`interface epon ${fs}`, 10000);
                const output = await driver.command("show pon optical transceiver", 12000);
                if (/unknown command|invalid command|ambiguous command/i.test(output)) throw new Error(stripAnsi(output).trim().slice(0, 160));
                ports.push(parseVsolPonOptical(output, fs));
            } catch (error) {
                warnings.push(`EPON ${fs} SFP DDM: ${String(error?.message || "read failed").slice(0, 180)}`);
                ports.push({ id: "epon" + fs, name: "PON " + fs.split("/").pop(), temp: null, voltage: null, bias: null, tx: null, rx: null, status: "unavailable", missing_fields: ["temp", "voltage", "bias", "tx", "rx"], reading_source: "pon_sfp_ddm" });
            }
        }
        if (driver.opticalErrors.length) warnings.push(...driver.opticalErrors.map(message => String(message).slice(0, 220)));
        if (ports.length) warnings.push("VSOL PON readings are from the PON SFP transceiver; ONU optical readings are separate.");
        if (!version.serial || !version.hardware || !version.softwareVersion) warnings.push("VSOL version output did not contain every device identity field.");
        if (system.temperatureC === null) warnings.push("VSOL chassis temperature was not present in show fan output.");
    } catch (error) {
        warnings.push(`OLT ${olt.id}: ${String(error?.message || "VSOL monitoring read failed").slice(0, 220)}`);
    } finally { try { driver.disconnect(); } catch (_) { /* Preserve collected telemetry. */ } }
    return { ports, warnings, system, modules };
}
/*
|--------------------------------------------------------------------------
| PUBLIC ENTRY POINT
|--------------------------------------------------------------------------
*/

async function readLiveDdm(olt) {
    const identity = `${olt.vendor || ""} ${olt.model || ""} ${olt.name || ""}`;

    if (/v[-\s]?sol|vsol/i.test(identity)) {
        return readVsolLiveDdm(olt);
    }

    if (bdcomTelemetry.isBdcom(olt)) {
        return bdcomTelemetry.readBdcomLive(olt, buildDriverConfig(olt));
    }

    if (isCData(olt)) {
        return readCDataLiveDdm(olt);
    }

    if (isSupportedEcom(olt)) {
        return readEcomLiveDdm(olt);
    }

    return {
        ports: getPonPorts(olt).map(
            id => unavailablePort(id)
        ),

        warnings: [
            `OLT ${olt.id}: live DDM is not enabled for vendor/model ` +
            `${olt.vendor || "unknown"}/${olt.model || "unknown"}.`
        ],

        system: null
    };
}

module.exports = {
    readLiveDdm,
    parseDdm,
    parseCDataDdm,
    parseSystemTelemetry,
    parseCDataSystem,
    parseBoardModules,
    parseDeviceRecords,
    buildDerivedEvents,
    fillMissingDdm,
    PON_PORTS,
    CDATA_PON_PORTS
};