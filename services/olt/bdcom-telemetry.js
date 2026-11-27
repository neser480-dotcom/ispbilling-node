"use strict";

/*
|--------------------------------------------------------------------------
| BDCOM OLT MONITORING TELEMETRY (read only)
|--------------------------------------------------------------------------
| Verified on a real BDCOM P3310D (Software 10.1.0F) probe, 2026-11-26:
|
|   show version      model, firmware, hardware, serial, MAC, uptime
|   show temperature  current / upper / low threshold, status
|   show fan          FAN_NUMBER STATUS ("running")
|   show power        POWER_NUMBER STATUS ("on")
|
|   show cpu          "CPU utilization for one second: 10%; one minute: 14%; ..."
|   show memory region "Memory utilization 61%(Image 21%, Region 23%, ...)"
|   show epon optical-transceiver-diagnosis interface epon0/N
|                     PON SFP temperature / voltage / current(bias) / TxPower,
|                     plus the OLT-side RxPower of every ONU on that port.
|
| If a command is rejected on another BDCOM model, the app asks the OLT for
| its help list ("show memory ?") and tries what it offers; a miss only adds
| a warning, nothing breaks.
|--------------------------------------------------------------------------
*/

const { BdcomDriver } = require("../../drivers/hardware/bdcom");

const BDCOM_PON_PORTS = ["0/1", "0/2", "0/3", "0/4"];

const DDM_FIELDS = ["temp", "voltage", "bias", "tx", "rx"];

const CPU_COMMANDS = ["show cpu", "show processes cpu", "show cpu usage"];

// verified on P3310D: "show memory region" -> "Memory utilization 61%(Image 21%, ...)"
const MEMORY_COMMANDS = ["show memory region"];

const ERROR_OUTPUT =
    /invalid input|unknown command|unrecognized|incomplete command|too many parameters|ambiguous|% ?error/i;

function clean(output) {
    return String(output ?? "")
        .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
        .replace(/\r/g, "")
        .replace(/--\s*More\s*--/gi, "")
        .split("\n")
        .filter(line => !/^\s*[\w.-]+(\([^)]*\))?[>#]\s*$/.test(line))
        .join("\n")
        .trim();
}

function isBdcom(olt) {
    return String(olt?.vendor || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .startsWith("bdcom");
}

function num(value) {
    const n = Number(value);

    return Number.isFinite(n) ? n : null;
}

// "94:14:33:42" (days:hh:mm:ss) -> "94d 14h 33m 42s"
function formatUptime(raw) {
    const parts = String(raw || "").split(":").map(Number);

    if (parts.length !== 4 || parts.some(Number.isNaN)) return raw || null;

    const [d, h, m, s] = parts;

    return `${d}d ${h}h ${m}m ${s}s`;
}

function parseVersion(text) {
    const t = clean(text);
    const pick = re => (t.match(re) || [])[1]?.trim() ?? null;

    const head = t.match(
        /BDCOM\(tm\)\s+(\S+)\s+Software,\s*Version\s+(\S+)(?:\s+Build\s+(\S+))?/i
    ) || [];

    return {
        model: head[1] || null,
        softwareVersion: head[2]
            ? head[3] ? `${head[2]} Build ${head[3]}` : head[2]
            : null,
        hardware: pick(/hardware version\s*:\s*(\S+)/i),
        serial: pick(/Serial num\s*:\s*(\S+)/i),
        deviceMac: pick(/Base ethernet MAC Address:\s*([0-9a-f:.-]+)/i),
        uptimeRaw: pick(/uptime is\s+(\d+:\d+:\d+:\d+)/i),
        deviceTime: pick(/The current time:\s*(.+)$/im)
    };
}

function parseTemperature(text) {
    const t = clean(text);
    const pick = re => num((t.match(re) || [])[1]);

    return {
        current: pick(/current temperature is\s*(-?\d+(?:\.\d+)?)/i),
        upper: pick(/upper temperature threshold is\s*(-?\d+(?:\.\d+)?)/i),
        low: pick(/low temperature threshold is\s*(-?\d+(?:\.\d+)?)/i),
        status: (t.match(/Status\s*:\s*(\w+)/i) || [])[1] || null
    };
}

// FAN_NUMBER  STATUS / "1   running"
function parseFans(text) {
    return [
        ...clean(text).matchAll(/^\s*(\d+)\s+([A-Za-z][\w -]*?)\s*$/gm)
    ].map(m => {
        const raw = m[2].trim();

        return {
            name: `FAN ${m[1]}`,
            status: /^(running|normal|ok|on)$/i.test(raw) ? "Normal" : raw,
            rpm: null
        };
    });
}

// POWER_NUMBER  STATUS / "1   on"
function parsePower(text) {
    return [
        ...clean(text).matchAll(/^\s*(\d+)\s+(on|off|normal|fail\w*|abnormal)\s*$/gim)
    ].map(m => {
        const working = /^(on|normal)$/i.test(m[2]);

        return {
            slot: Number(m[1]),
            status: working ? "working" : "no work",
            working
        };
    });
}

// best effort, unknown output format: returns null when nothing recognisable
function parseCpu(text) {
    const t = clean(text);

    if (!t || ERROR_OUTPUT.test(t)) return null;

    // real P3310D: "CPU utilization for one second: 10%; one minute: 14%; five minutes: 12%"
    const five = t.match(/(?:five|one)\s+seconds?[^0-9\n]*(\d+(?:\.\d+)?)\s*%/i);
    const one = t.match(/one\s+minute[^0-9\n]*(\d+(?:\.\d+)?)\s*%/i);
    const fiveMin = t.match(/five\s+minutes?[^0-9\n]*(\d+(?:\.\d+)?)\s*%/i);
    const any = t.match(/(?:cpu|usage|utili[sz]ation)[^0-9\n%]*(\d+(?:\.\d+)?)\s*%/i);

    const value = num((five || any || [])[1]);

    if (value === null) return null;

    return {
        percent: value,
        oneMinute: num((one || [])[1]),
        fiveMinutes: num((fiveMin || [])[1])
    };
}

// best effort: total / used / free in KB or bytes -> percent
function parseMemory(text) {
    const t = clean(text);

    if (!t || ERROR_OUTPUT.test(t)) return null;

    const pct = t.match(/(?:memory|ram|usage|utili[sz]ation)[^0-9\n%]*(\d+(?:\.\d+)?)\s*%/i);
    const total = num((t.match(/total\D{0,20}(\d+)/i) || [])[1]);
    const used = num((t.match(/used\D{0,20}(\d+)/i) || [])[1]);
    const free = num((t.match(/free\D{0,20}(\d+)/i) || [])[1]);

    let percent = num((pct || [])[1]);

    if (percent === null && total && used !== null) {
        percent = Math.round((used / total) * 1000) / 10;
    } else if (percent === null && total && free !== null) {
        percent = Math.round(((total - free) / total) * 1000) / 10;
    }

    return percent === null ? null : { percent, total, used, free };
}

/*
| show epon optical-transceiver-diagnosis interface epon0/N
|   epon0/1   42.4   3.3   20.0   9.2        <- port: temp, voltage, mA, TxPower
|   epon0/1:1 -23.4                          <- ONU: OLT-side RxPower
*/
function parsePonDdm(output) {
    const text = clean(output);

    const row = text.match(
        /^\s*epon\d+\/(\d+)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*$/im
    );

    const rx = [
        ...text.matchAll(
            /^\s*epon\d+\/\d+:(\d+)\s+(-?\d+(?:\.\d+)?)\s*$/gim
        )
    ].map(m => ({ ont_id: Number(m[1]), rx: Number(m[2]) }));

    if (!row) return null;

    const avg = rx.length
        ? Math.round((rx.reduce((a, b) => a + b.rx, 0) / rx.length) * 10) / 10
        : null;

    return {
        port: Number(row[1]),
        temp: Number(row[2]),
        voltage: Number(row[3]),
        bias: Number(row[4]),
        tx: Number(row[5]),
        rx: avg,
        rxMin: rx.length ? Math.min(...rx.map(x => x.rx)) : null,
        rxMax: rx.length ? Math.max(...rx.map(x => x.rx)) : null,
        onuCount: rx.length
    };
}

function ddmPort(id, d) {
    const port = {
        id: String(id),
        name: `PON ${String(id).split("/").pop()}`,
        temp: d.temp,
        voltage: d.voltage,
        bias: d.bias,
        tx: d.tx,
        rx: d.rx,
        onu_rx_min: d.rxMin,
        onu_rx_max: d.rxMax,
        onu_rx_count: d.onuCount
    };

    const missing = DDM_FIELDS.filter(f => !Number.isFinite(Number(port[f])) || port[f] === null);

    port.missing_fields = missing;
    port.status = missing.length === 0
        ? "ok"
        : missing.length === DDM_FIELDS.length ? "unavailable" : "partial";

    return port;
}

function parseBdcomSystem(outputs, olt = {}) {
    const version = parseVersion(outputs.version);
    const temp = parseTemperature(outputs.temperature);
    const fans = parseFans(outputs.fan);
    const powerSlots = parsePower(outputs.power);
    const cpu = parseCpu(outputs.cpu);
    const memory = parseMemory(outputs.memory);

    return {
        vendor: "BDCOM",
        model: version.model || olt.model || null,
        firmware: version.softwareVersion,
        hardware: version.hardware,
        softwareVersion: version.softwareVersion,
        serial: version.serial,
        deviceMac: version.deviceMac,

        temperatureC: temp.current,
        temperatureHighC: temp.upper,
        temperatureLowC: temp.low,
        temperatureStatus: temp.status,
        slotTemperatures: temp.current === null
            ? []
            : [{ slot: 0, temperatureC: temp.current }],

        cpuUtilizationPercent: cpu ? cpu.percent : null,
        cpu: cpu
            ? {
                fiveSeconds: cpu.percent,
                oneMinute: cpu.oneMinute,
                fiveMinutes: cpu.fiveMinutes
            }
            : null,
        loadAverage: null,

        memoryTotalMB: null,
        memoryFreeMB: null,
        memoryUtilizationPercent: memory ? memory.percent : null,

        uptime: formatUptime(version.uptimeRaw),
        bootTime: null,
        deviceTime: version.deviceTime,

        fan: {
            mode: null,
            level: null,
            fans
        },

        powerSlots,
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
        devicePowerW: null,
        modules: [],
        registerStats: []
    };
}

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
| Ask the OLT itself which sub-commands exist: send "<base> ?" and read the
| help list ("usage   Show memory usage" -> usage). Verified syntax is not
| known for this model, so this lets the app find it on the live device.
*/
function parseHelpWords(output, base) {
    const baseWords = base.toLowerCase().split(/\s+/);

    return [
        ...new Set(
            clean(output)
                .split("\n")
                .map(line => line.trim())
                .filter(line =>
                    line &&
                    !/^<cr>|^\^|incomplete|invalid|unknown|too many|ambiguous/i.test(line) &&
                    !line.toLowerCase().startsWith(baseWords.join(" "))
                )
                .map(line => (line.match(/^([a-z][\w-]*)(?:\s+\S|\s*$)/) || [])[1])
                .filter(Boolean)
                .filter(word => !baseWords.includes(word.toLowerCase()))
        )
    ].slice(0, 8);
}

async function discoverCommands(driver, base, warnings) {
    try {
        const help = await driver.command(`${base} ?`, 12000);
        const words = parseHelpWords(help, base);

        if (words.length) {
            warnings.push(`${base} ? offers: ${words.join(", ")}`);
        }

        return words.map(word => `${base} ${word}`);
    } catch (error) {
        warnings.push(
            `${base} ?: ${String(error?.message || "failed").slice(0, 80)}`
        );

        return [];
    }
}

async function firstUsable(driver, commands, parser, warnings, label, discoverBase) {
    const tried = [];

    for (let pass = 0; pass < 2; pass++) {
        let list = commands;

        if (pass === 1) {
            if (!discoverBase) break;

            list = (await discoverCommands(driver, discoverBase, warnings))
                .filter(command => !tried.includes(command));
        }

        const found = await tryCommands(driver, list, parser, warnings, tried);

        if (found) return found;
    }

    warnings.push(
        `${label}: no supported command found on this BDCOM model ` +
        `(tried: ${tried.join(", ")}).`
    );

    return "";
}

async function tryCommands(driver, commands, parser, warnings, tried) {
    for (const command of commands) {
        tried.push(command);

        try {
            const output = await driver.command(command, 12000);

            if (!ERROR_OUTPUT.test(clean(output)) && parser(output)) {
                return output;
            }
        } catch (error) {
            warnings.push(
                `${command}: ${String(error?.message || "failed").slice(0, 100)}`
            );
        }
    }

    return "";
}

async function readBdcomLive(olt, config) {
    const driver = new BdcomDriver(config);
    const ports = BDCOM_PON_PORTS.map(id => unavailablePort(id));
    const warnings = [];
    let system = null;

    try {
        await driver.connect();

        const outputs = {};

        for (const [key, command] of Object.entries({
            version: "show version",
            temperature: "show temperature",
            fan: "show fan",
            power: "show power"
        })) {
            try {
                outputs[key] = await driver.command(command, 12000);
            } catch (error) {
                outputs[key] = "";

                warnings.push(
                    `${command}: ${String(error?.message || "failed").slice(0, 100)}`
                );
            }
        }

        outputs.cpu = await firstUsable(
            driver, CPU_COMMANDS, parseCpu, warnings, "CPU", "show cpu"
        );

        outputs.memory = await firstUsable(
            driver, MEMORY_COMMANDS, parseMemory, warnings, "Memory", "show memory"
        );

        system = parseBdcomSystem(outputs, olt);

        if (system.temperatureC === null) {
            warnings.push("Temperature was not parsed from show temperature.");
        }

        if (!system.fan.fans.length) {
            warnings.push("Fan status was not parsed from show fan.");
        }

        // PON SFP DDM + OLT-side ONU Rx, one command per PON port (~0.7 s each)
        for (let i = 0; i < BDCOM_PON_PORTS.length; i++) {
            const id = BDCOM_PON_PORTS[i];

            try {
                const output = await driver.command(
                    `show epon optical-transceiver-diagnosis interface epon${id}`,
                    20000
                );

                const ddm = ERROR_OUTPUT.test(clean(output))
                    ? null
                    : parsePonDdm(output);

                if (ddm) {
                    ports[i] = ddmPort(id, ddm);
                } else {
                    warnings.push(`PON ${id}: optical diagnosis returned no data.`);
                }
            } catch (error) {
                warnings.push(
                    `PON ${id}: ${String(error?.message || "optical query failed").slice(0, 100)}`
                );
            }
        }
    } catch (error) {
        warnings.push(
            `OLT ${olt.id}: ${String(error?.message || "BDCOM connection failed").slice(0, 200)}`
        );

        ports.forEach(port => { port.status = "error"; });
    } finally {
        try {
            if (typeof driver.disconnect === "function") {
                await driver.disconnect();
            }
        } catch (_) {
            // keep collected telemetry
        }
    }

    return { ports, warnings, system };
}

module.exports = {
    isBdcom,
    readBdcomLive,
    parseBdcomSystem,
    parseVersion,
    parseTemperature,
    parseFans,
    parsePower,
    parseCpu,
    parseMemory,
    parsePonDdm,
    ddmPort,
    parseHelpWords,
    formatUptime,
    BDCOM_PON_PORTS
};
