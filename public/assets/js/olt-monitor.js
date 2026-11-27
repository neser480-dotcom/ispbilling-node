
"use strict";

(function () {
    const root = document.getElementById("oltMonitor");

    if (!root || root.dataset.initialized === "true") return;
    root.dataset.initialized = "true";

    const $ = (id) => document.getElementById(id);

    const DASHBOARD_URL = "/api/olt-monitor/dashboard";

    let selectedPon = 1;
    let currentData = null;
    let refreshInProgress = false;
    let refreshPending = false;
    let forceNext = false;
    let snapshotMeta = null;

    function ageText(iso) {
        const time = Date.parse(iso);

        if (!Number.isFinite(time)) return "unknown";

        const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));

        if (seconds < 60) return "just now";

        const minutes = Math.round(seconds / 60);

        if (minutes < 60) return minutes + " min ago";

        const hours = Math.floor(minutes / 60);

        if (hours < 48) return hours + " h " + (minutes % 60) + " min ago";

        return Math.floor(hours / 24) + " days ago";
    }

    function renderSnapshotAge() {
        const element = document.getElementById("omLastUpdated");

        if (!element || !snapshotMeta) return;

        let text = snapshotMeta.capturedAt
            ? "Last updated: " +
              new Date(snapshotMeta.capturedAt).toLocaleString() +
              " (" + ageText(snapshotMeta.capturedAt) + ")"
            : "Last updated: -";

        if (snapshotMeta.refreshing) {
            text += " | reading the OLT in the background";
        }

        if (snapshotMeta.throttled) {
            text += " | OLT was just read (at most once per 30 s)";
        }

        element.textContent = text;
    }

    setInterval(renderSnapshotAge, 30000);

    function getLiveUrl(oltId, force) {
        const base = getLiveUrlBase(oltId);

        return force ? base + "&refresh=1" : base;
    }

    function getLiveUrlBase(oltId) {
        const id = Number(oltId);

        if (!Number.isInteger(id) || id < 1) {
            throw new Error("Invalid OLT ID");
        }

        return `/api/olt-monitor/live?olt_id=${encodeURIComponent(id)}`;
    }

    function escapeHtml(value) {
        return String(value ?? "N/A").replace(/[&<>"']/g, (ch) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[ch]);
    }

    function statusClass(status) {
        const value = String(status ?? "").toLowerCase();

        if (/critical|offline|error|failed|down/.test(value)) return "bad";
        if (/warning|low|partial|degraded|missing|no ddm|unavailable/.test(value)) return "warn";
        if (/normal|active|online|healthy|connected|ok|working|^on$/.test(value)) return "good";

        return "neutral";
    }

    // A PON is active when it has online ONUs; falls back to the DDM status.
    function isActivePon(port, onuKnown) {
        if (onuKnown && port.totalOnu !== null && port.totalOnu !== undefined) {
            return port.onlineOnu > 0;
        }

        return statusClass(port.status) === "good";
    }

    function pill(status) {
        return `<span class="om-pill ${statusClass(status)}">
            <i class="om-dot"></i>${escapeHtml(status)}
        </span>`;
    }

    function kv(label, value) {
        return `<div class="om-kv-row">
            <span class="om-k">${escapeHtml(label)}</span>
            <span class="om-v">${escapeHtml(value)}</span>
        </div>`;
    }

    function stat(label, value) {
        return `<div class="om-stat">
            <span class="om-stat-label">${escapeHtml(label)}</span>
            <span class="om-stat-value">${escapeHtml(value)}</span>
        </div>`;
    }

    function emptyRow(columns, message) {
        return `<tr><td class="om-empty" colspan="${columns}">
            ${escapeHtml(message)}
        </td></tr>`;
    }

    function setConnection(status, message, isError = false) {
        const statusElement = $("omConnectionStatus");
        const onlineLabel = $("omOnlineLabel");
        const dataNote = $("omDataNote");
        const errorMessage = $("omErrorMessage");

        if (statusElement) {
            statusElement.className = `om-status ${statusClass(status)}`;
        }

        if (onlineLabel) onlineLabel.textContent = status;
        if (dataNote) dataNote.textContent = message;

        if (errorMessage) {
            errorMessage.textContent = isError ? message : "";
        }
    }

    function numberOrNull(value) {
        if (value === null || value === undefined || value === "") {
            return null;
        }

        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function displayNumber(value, decimals = 1) {
        const number = numberOrNull(value);

        return number === null
            ? "N/A"
            : number.toFixed(decimals);
    }

    function getPonNumber(port, index) {
        if (port.n != null && Number.isInteger(Number(port.n))) {
            const n = Number(port.n);
            if (n >= 1 && n <= 128) return n;
        }

        const id = String(port.id ?? port.pon ?? "").trim();

        // VSOL EPON ports: epon0/1 to epon0/4
        const vsol = id.match(/^epon\d+\/([1-4])$/i);
        if (vsol) return Number(vsol[1]);

        // C-Data OLT43: 0/0/1 to 0/0/4
        const cdata = id.match(/^0\/0\/([1-4])$/);

        if (cdata) return Number(cdata[1]);

        // ECOM OLT45: 0/1/1 to 0/1/4, then 0/2/1 to 0/2/4
        const ecom = id.match(/^0\/([12])\/([1-4])$/);

        if (ecom) {
            return (Number(ecom[1]) - 1) * 4 + Number(ecom[2]);
        }

        return index + 1;
    }

    function normalizeData(data) {
        if (!data || typeof data !== "object" || data.success === false) {
            throw new Error(data?.message || "Invalid OLT API response.");
        }

        const olt = data.olt ?? {};
        const system = data.system ?? {};

        const rawPorts = Array.isArray(data.ports)
            ? data.ports
            : Array.isArray(data.pons)
                ? data.pons
                : [];

        const vendor = String(
            system.vendor ?? olt.vendor ?? data.brand ?? ""
        ).toLowerCase();

        const model = String(
            system.model ?? olt.model ?? data.model ?? ""
        );

        const isCData =
            vendor.includes("cdata") ||
            vendor.includes("c-data") ||
            model.toLowerCase().includes("e1204");

        const configuredCount = numberOrNull(
            olt.pon_ports ??
            data.ports_count ??
            data.port_count
        );

        const portCount = configuredCount ??
            (isCData ? 4 : 8);

        // If API has no DDM rows, show physical port placeholders.
        // These placeholders do NOT represent actual optical readings.
        const portSource = rawPorts.length
            ? rawPorts
            : Array.from(
                { length: Math.min(128, Math.max(1, portCount)) },
                (_, index) => ({
                    id: isCData
                        ? `0/0/${index + 1}`
                        : index < 4
                            ? `0/1/${index + 1}`
                            : `0/2/${index - 3}`,
                    tx: null,
                    rx: null,
                    bias: null,
                    temp: null,
                    voltage: null,
                    status: "No DDM data",
                    detail: "Physical port listed; live DDM reading unavailable."
                })
            );

        const onuOptical = Array.isArray(data.onuOptical)
            ? data.onuOptical.map(port => ({
                n: getPonNumber(port, 0), id: String(port.id ?? ""),
                onlineOnu: numberOrNull(port.onlineOnu) ?? 0,
                rx: port.rx ?? "No reading", tx: port.tx ?? "No reading",
                bias: port.bias ?? "No reading", temp: port.temp ?? "No reading",
                voltage: port.voltage ?? "No reading"
            })).sort((a, b) => a.n - b.n)
            : [];

        const pons = portSource.map((port, index) => ({
            n: getPonNumber(port, index),
            id: String(port.id ?? port.pon ?? ""),
            tx: port.tx ?? "No reading",
            rx: port.rx ?? "No reading",
            bias: port.bias ?? "No reading",
            temp: port.temp ?? "No reading",
            voltage: port.voltage ?? "No reading",
            totalOnu: numberOrNull(port.totalOnu),
            onlineOnu: numberOrNull(port.onlineOnu),
            status: port.status ?? "No DDM data",
            detail: port.error
                ? String(port.error)
                : Array.isArray(port.missing_fields) &&
                  port.missing_fields.length
                    ? `Missing fields: ${port.missing_fields.join(", ")}`
                    : port.detail ?? `OLT port ${port.id ?? index + 1}`
        }));

        const uniqueNumbers = new Set(pons.map((port) => port.n));

        if (uniqueNumbers.size !== pons.length) {
            throw new Error("API returned duplicate PON numbers.");
        }

        pons.sort((a, b) => a.n - b.n);

        const cpu = system.cpu ?? {};
        const memory = system.memory ?? {};
        const fan = system.fan ?? {};

        const cpuValue = numberOrNull(
            system.cpuUtilizationPercent ??
            cpu.fiveSeconds ??
            cpu.utilizationPercent ??
            data.cpu
        );

        const memoryValue = numberOrNull(
            system.memoryUtilizationPercent ??
            memory.utilizationPercent ??
            data.memory
        );

        const totalMemory = numberOrNull(
            system.memoryTotalMB ?? memory.totalMB
        );

        const freeMemory = numberOrNull(
            system.memoryFreeMB ?? memory.freeMB
        );

        const memoryUsage = memoryValue !== null
            ? `${displayNumber(memoryValue)}%`
            : "N/A";

        const cpuUsage = cpuValue !== null
            ? `${displayNumber(cpuValue)}%`
            : "N/A";

        const fans = Array.isArray(fan.fans) ? fan.fans : [];

        const fanStatus = fans.length
            ? fans.map((item) => {
                const rpm = numberOrNull(item.rpm);
                const rpmText = rpm !== null ? ` (${rpm} RPM)` : "";

                return `${item.name || "Fan"}: ${
                    item.status || "Unknown"
                }${rpmText}`;
            }).join(" | ")
            : "N/A";

        const temperatureValue = numberOrNull(
            system.temperatureC ??
            system.temp ??
            data.temperature
        );

        const temperature = temperatureValue !== null
            ? `${displayNumber(temperatureValue)} °C`
            : "N/A";

        const voltageValue = numberOrNull(
            system.voltageChannel0 ??
            system.voltage ??
            data.voltage
        );

        const voltage = voltageValue !== null
            ? `${displayNumber(voltageValue, 2)} V`
            : "Not reported by this OLT";

        const powerValue = numberOrNull(system.devicePowerW);

        const devicePower = powerValue !== null
            ? `${displayNumber(powerValue, 2)} W`
            : "Not reported by this OLT";

        const powerSlots = Array.isArray(system.powerSlots)
            ? system.powerSlots
            : [];

        const powerSlotText = powerSlots.length
            ? powerSlots.map((slot) =>
                `Slot ${slot.slot ?? "?"}: ${slot.status ?? "Unknown"}`
            ).join(" | ")
            : "N/A";

        const onuKnown = pons.some((port) => port.totalOnu > 0);

        const activePorts = pons.filter(
            (port) => isActivePon(port, onuKnown)
        ).length;

        const hasLiveDdm = rawPorts.length > 0;

        return {
            name: olt.name ?? data.name ?? "OLT",
            brand: system.vendor ?? olt.vendor ?? data.brand ?? "Unknown",
            model: system.model ?? olt.model ?? data.model ?? "N/A",

            ports: Math.max(
                configuredCount ?? 0,
                pons.length
            ),

            state: hasLiveDdm && activePorts > 0
                ? "Online"
                : hasLiveDdm
                    ? "Warning"
                    : "Telemetry Available / DDM Missing",

            hardware: system.hardware ?? data.hardware ?? olt.hardware ?? "N/A",
            firmware: system.firmware ?? data.firmware ?? olt.firmware ?? "N/A",
            softwareVersion: system.softwareVersion ?? "N/A",
            kernelVersion: system.kernelVersion ?? "N/A",
            webVersion: system.webVersion ?? "N/A",
            serial: system.serial ?? data.serial ?? olt.serial ?? "N/A",
            deviceMac: system.deviceMac ?? "N/A",
            ip: olt.ip ?? data.ip ?? "N/A",
            location: olt.location ?? data.location ?? "N/A",

            temperature,
            voltage,
            cpu: cpuUsage,

            cpuDetails: {
                ...cpu,
                fiveSeconds: cpuValue,
                loadAverage: system.loadAverage ?? null
            },

            memory: memoryUsage,

            memoryDetails: {
                totalMB: totalMemory,
                freeMB: freeMemory,
                utilizationPercent: memoryValue
            },

            fan: fanStatus,
            fanDetails: fan,
            power: devicePower,
            powerSlots,
            powerSlotText,

            uptime: system.uptime ?? "N/A",
            uptimeSince: system.bootTime ?? system.uptimeSince ?? "N/A",

            slotTemperatures: Array.isArray(system.slotTemperatures)
                ? system.slotTemperatures
                : [],

            voltageChannels: Array.isArray(system.voltageChannels)
                ? system.voltageChannels
                : [],

            totalOnu: data.totalOnu ?? olt.onu_total ?? "N/A",
            activeOnu: data.activeOnu ?? olt.online ?? "N/A",
            offlineOnu: data.offlineOnu ?? olt.offline ?? "N/A",

            modules: Array.isArray(data.modules) ? data.modules : [],
            psu: Array.isArray(system.psu)
                ? system.psu
                : Array.isArray(data.psu)
                    ? data.psu
                    : [],

            pons,
            onuOptical,
            onuKnown,
            alarms: Array.isArray(data.alarms) ? data.alarms : [],
            warnings: Array.isArray(data.warnings) ? data.warnings : []
        };
    }

    function renderSelectedPon(olt) {
        const pon = olt.pons.find(
            (item) => item.n === selectedPon
        ) || olt.pons[0];

        const info = $("omSelectedInfo");
        const status = $("omSelectedStatus");

        if (!pon) {
            if (info) {
                info.innerHTML =
                    '<div class="om-empty">No PON data available.</div>';
            }
            return;
        }

        selectedPon = pon.n;

        if (status) {
            status.textContent = `PON ${pon.n} - ${pon.status}`;
            status.className = `om-pill ${statusClass(pon.status)}`;
        }

        if (info) {
            info.innerHTML = [
                kv("PON Port", `PON ${pon.n}`),
                kv("OLT Port ID", pon.id || "N/A"),
                kv("Status", pon.status),
                kv("TX Power", `${pon.tx} dBm`),
                kv("RX Power", `${pon.rx} dBm`),
                kv("Bias Current", `${pon.bias} mA`),
                kv("Temperature", `${pon.temp} °C`),
                kv("Voltage", `${pon.voltage} V`),
                kv(
                    "ONUs Online / Total",
                    pon.onlineOnu === null
                        ? "No ONU data"
                        : pon.onlineOnu + " / " + pon.totalOnu
                ),
                kv("Details", pon.detail)
            ].join("").replace(
                // no unit after a missing value ("No reading dBm" -> "No reading")
                /No reading\s*(?:dBm|mA|°C|V)/g,
                "No reading"
            );
        }
    }

    function render(olt) {
        const frontTitle = $("omFrontTitle");
        const brand = $("omBrand");
        const brandModel = $("omBrandModel");
        const onlineLabel = $("omOnlineLabel");
        const deviceState = $("omDeviceState");

        if (frontTitle) {
            frontTitle.textContent = `${olt.name} - Front Panel View`;
        }

        if (brand) brand.textContent = olt.brand;
        if (brandModel) brandModel.textContent = olt.model;
        if (onlineLabel) onlineLabel.textContent = olt.state;

        if (deviceState) {
            deviceState.textContent = olt.state;
            deviceState.className = `om-pill ${statusClass(olt.state)}`;
        }

        const deviceInfo = $("omDeviceInfo");

        if (deviceInfo) {
            deviceInfo.innerHTML = [
                kv("Model", olt.model),
                kv("Hardware Version", olt.hardware),
                kv("Firmware Version", olt.firmware),
                olt.softwareVersion !== "N/A"
                    ? kv("Software Version", olt.softwareVersion)
                    : kv(
                        "Kernel Version",
                        olt.kernelVersion !== "N/A"
                            ? olt.kernelVersion
                            : "Not reported by this OLT"
                    ),
                kv("Web Version", olt.webVersion),
                kv("Serial Number", olt.serial),
                kv("Device MAC", olt.deviceMac),
                kv("IP Address", olt.ip),
                kv(
                    "Location",
                    olt.location && olt.location !== "N/A"
                        ? olt.location
                        : "Not set"
                )
            ].join("");
        }

        const memoryText = olt.memoryDetails.totalMB !== null
            ? `${olt.memory} (${olt.memoryDetails.freeMB ?? "N/A"} MB free / ${olt.memoryDetails.totalMB} MB)`
            : olt.memory;

        const cpuText = olt.cpuDetails.fiveSeconds !== null
            ? `${displayNumber(olt.cpuDetails.fiveSeconds)}%`
            : olt.cpu;

        const temperatureStats = olt.slotTemperatures.length
            ? olt.slotTemperatures.map((item) =>
                `Slot ${item.slot}: ${displayNumber(item.temperatureC)} °C`
            ).join(" | ")
            : olt.temperature;

        const systemInfo = $("omSystemInfo");

        if (systemInfo) {
            systemInfo.innerHTML = [
                stat("System Temperature", olt.temperature),
                stat("Slot Temperatures", temperatureStats),
                stat("CPU Usage", cpuText),
                stat("Memory Usage", memoryText),
                stat("Fan Status", olt.fan),
                stat("Device Power", olt.power),
                stat("Power Slot Status", olt.powerSlotText),
                stat("Voltage Channel 0", olt.voltage),
                stat("System Uptime", olt.uptime),
                stat("Boot Time", olt.uptimeSince)
            ].join("");
        }

        const ponOverview = $("omPonOverview");

        if (ponOverview) {
            ponOverview.innerHTML = [
                stat("Total PON Ports", olt.ports),
                stat("Active PON Ports", olt.pons.filter(
                    (port) => isActivePon(port, olt.onuKnown)
                ).length),
                stat("Total ONUs", olt.totalOnu),
                stat("Online ONUs", olt.activeOnu),
                stat("Offline ONUs", olt.offlineOnu)
            ].join("");
        }

        const portBank = $("omPortBank");

        if (portBank) {
            portBank.style.gridTemplateColumns =
                `repeat(${olt.ports <= 4 ? 4 : 8}, minmax(0, 1fr))`;

            portBank.innerHTML = olt.pons.map((pon) => {
                const state = statusClass(pon.status);
                const led = state === "good" ? "ok"
                    : state === "warn" ? "warn"
                    : state === "bad" ? "bad"
                    : "";

                return `<button type="button"
                    class="om-port"
                    data-pon="${pon.n}"
                    aria-pressed="${selectedPon === pon.n}"
                    title="Select PON ${pon.n}">
                    <span class="om-port-label">PON ${pon.n}</span>
                    <span class="om-port-lights">
                        <i class="om-led ${led}"></i>
                        <i class="om-led ${led}"></i>
                    </span>
                    <span class="om-port-socket"></span>
                    <span class="om-port-state">${escapeHtml(pon.status)}</span>
                </button>`;
            }).join("");
        }

        const moduleRows = $("omModuleRows");

        if (moduleRows) {
            moduleRows.innerHTML = olt.modules.length
                ? olt.modules.map((module) => `<tr>
                    <td>${escapeHtml(module.name)}</td>
                    <td>${escapeHtml(module.type)}</td>
                    <td>${escapeHtml(module.range ?? module.ports)}</td>
                    <td>${pill(module.status)}</td>
                </tr>`).join("")
                : emptyRow(4, "Module data not supplied by the device/API.");
        }

        const portCount = $("omPortCount");
        if (portCount) portCount.textContent = `${olt.ports} ports`;

        const ponTiles = $("omPonTiles");

        if (ponTiles) {
            ponTiles.innerHTML = olt.pons.map((pon) => {
                const state = statusClass(pon.status);
                const ring = state === "bad" ? "bad"
                    : state === "warn" ? "warn"
                    : state === "good" ? ""
                    : "neutral";

                return `<button type="button"
                    class="om-pon-tile"
                    data-pon="${pon.n}"
                    aria-pressed="${selectedPon === pon.n}">
                    <span class="om-ring ${ring}"></span>
                    <span class="om-pon-name">PON ${pon.n}</span>
                    <span class="om-pon-text ${ring}">${escapeHtml(pon.status)}</span>
                </button>`;
            }).join("");
        }

        const psuRows = $("omPsuRows");

        if (psuRows) {
            // psuStatusNote: this OLT reports only slot status (working / no work).
            const psuTable = psuRows.closest("table");
            const psuHead = psuTable && psuTable.querySelector("thead tr");

            if (psuHead) {
                psuHead.innerHTML = "<th>PSU</th><th>Status</th><th>Note</th>";
            }

            const isPsuOk = (psu) => /^(working|on)$/i.test(
                String(psu.status ?? psu.powerState ?? "")
            );

            const psuTotal = olt.psu.length;
            const psuGood = olt.psu.filter(isPsuOk).length;

            let psuHtml = olt.psu.map((psu) => {
                const status = psu.status ?? psu.powerState ?? "Unknown";
                const note = isPsuOk(psu)
                    ? "Powering the OLT"
                    : "No power (not installed or failed)";

                return "<tr><td>" + escapeHtml(psu.name ?? ("Slot " + (psu.slot ?? "?"))) +
                    "</td><td>" + pill(status) +
                    "</td><td>" + escapeHtml(note) + "</td></tr>";
            }).join("");

            if (psuTotal && psuGood === 0) {
                psuHtml += "<tr><td colspan=\"3\"><span class=\"om-pill bad\"><i class=\"om-dot\"></i>" +
                    "No PSU is working</span></td></tr>";
            } else if (psuTotal && psuGood < psuTotal) {
                psuHtml += "<tr><td colspan=\"3\"><span class=\"om-pill warn\"><i class=\"om-dot\"></i>" +
                    "No power backup: " + psuGood + " of " + psuTotal +
                    " PSU slots working</span></td></tr>";
            }

            psuRows.innerHTML = psuTotal
                ? psuHtml
                : emptyRow(3, "PSU status is not available from the OLT.");
        }

        const powerRows = $("omPowerRows");

        if (powerRows) {
            powerRows.innerHTML = olt.pons.map((pon) => `<tr
                style="${selectedPon === pon.n ? "background:#16304b66" : ""}">
                <td>
                    <button type="button" data-pon="${pon.n}"
                        style="background:none;border:0;color:#8ecbff;cursor:pointer">
                        PON ${pon.n}
                    </button>
                </td>
                <td>${escapeHtml(pon.tx)}</td>
                <td>${escapeHtml(pon.rx)}</td>
                <td>${escapeHtml(pon.bias)}</td>
                <td>${escapeHtml(pon.temp)}</td>
                <td>${escapeHtml(pon.voltage)}</td>
                <td>${escapeHtml(pon.onlineOnu === null ? "N/A" : `${pon.onlineOnu} / ${pon.totalOnu ?? 0}`)}</td>
                <td>${pill(pon.status)}</td>
            </tr>`).join("");
        }

        const onuOpticalRows = $("omOnuOpticalRows");
        if (onuOpticalRows) {
            onuOpticalRows.innerHTML = olt.onuOptical.length
                ? olt.onuOptical.map(port => "<tr><td>PON " + port.n + "</td><td>" + escapeHtml(port.rx) + "</td><td>" + escapeHtml(port.tx) + "</td><td>" + escapeHtml(port.bias) + "</td><td>" + escapeHtml(port.temp) + "</td><td>" + escapeHtml(port.voltage) + "</td><td>" + escapeHtml(port.onlineOnu) + "</td></tr>").join("")
                : emptyRow(7, "No online ONU optical readings are available.");
        }

        const alarmRows = $("omAlarmRows");

        if (alarmRows) {
            alarmRows.innerHTML = olt.alarms.length
                ? olt.alarms.map((alarm) => `<tr>
                    <td>${escapeHtml(alarm.time)}</td>
                    <td>${escapeHtml(alarm.event ?? alarm.message)}</td>
                    <td>${escapeHtml(alarm.source ?? alarm.olt_id)}</td>
                    <td>${pill(alarm.level ?? alarm.severity)}</td>
                </tr>`).join("")
                : emptyRow(
                    4,
                    olt.warnings.length
                        ? `Warnings: ${olt.warnings.join(" | ")}`
                        : "No events reported by the OLT."
                );
        }

        renderSelectedPon(olt);
    }

    async function fetchJson(url) {
        const response = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json" },
            credentials: "same-origin",
            cache: "no-store"
        });

        const result = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(
                result?.message || `Request failed (HTTP ${response.status})`
            );
        }

        if (!result || result.success === false) {
            throw new Error(result?.message || "Invalid API response.");
        }

        return result;
    }

    async function refreshLiveData() {
        if (refreshInProgress) {
            refreshPending = true;
            return;
        }

        refreshInProgress = true;

        // Only the Refresh button reads the OLT; everything else uses saved data.
        const force = forceNext;
        forceNext = false;

        const refreshButton = $("omRefresh");

        if (refreshButton) {
            refreshButton.disabled = true;
            refreshButton.textContent = force ? "Reading OLT..." : "Loading...";
        }

        if ($("omErrorMessage")) {
            $("omErrorMessage").textContent = "";
        }

        try {
            const select = $("omOltSelect");
            let oltId = select?.value;

            if (!oltId) {
                const dashboard = await fetchJson(DASHBOARD_URL);

                const olts = Array.isArray(dashboard.olts)
                    ? dashboard.olts
                    : Array.isArray(dashboard.data?.olts)
                        ? dashboard.data.olts
                        : [];

                if (!olts.length) {
                    throw new Error("No OLTs available.");
                }

                if (select) {
                    select.replaceChildren();

                    olts.forEach((olt) => {
                        const id = olt.id ?? olt.olt_id;
                        if (id == null) return;

                        const option = document.createElement("option");
                        option.value = String(id);
                        option.textContent =
                            `${olt.name || `OLT ${id}`}` +
                            (olt.ip ? ` · ${olt.ip}` : "");

                        select.appendChild(option);
                    });

                    oltId = select.value;
                } else {
                    oltId = olts[0].id ?? olts[0].olt_id;
                }
            }

            const result = await fetchJson(getLiveUrl(oltId, force));

            const currentOltId = $("omOltSelect")?.value;

            if (currentOltId && String(currentOltId) !== String(oltId)) {
                refreshPending = true;
                return;
            }

            const normalized = normalizeData(result);

            if (!normalized.pons.length) {
                throw new Error("OLT API returned no PON port records.");
            }

            currentData = normalized;

            if (!normalized.pons.some((pon) => pon.n === selectedPon)) {
                selectedPon = normalized.pons[0].n;
            }

            render(normalized);

            const hasDdm = Array.isArray(result.ports) &&
                result.ports.length > 0;

            setConnection(
                hasDdm ? normalized.state : "Telemetry Available / DDM Missing",
                normalized.warnings.length
                    ? normalized.warnings.join(" | ")
                    : hasDdm
                        ? "Live system and PON data received."
                        : "System telemetry received, but live PON DDM data is unavailable.",
                false
            );

            snapshotMeta = {
                capturedAt: result.captured_at || null,
                refreshing: Boolean(result.refreshing),
                throttled: Boolean(result.throttled)
            };

            renderSnapshotAge();
        } catch (error) {
            console.error("OLT monitoring refresh failed:", error);

            setConnection(
                "Unavailable",
                error?.message || "Unknown error while loading OLT data.",
                true
            );
        } finally {
            refreshInProgress = false;

            if (refreshButton) {
                refreshButton.disabled = false;
                refreshButton.textContent = "Refresh";
            }

            if (refreshPending) {
                refreshPending = false;
                refreshLiveData();
            }
        }
    }

    const select = $("omOltSelect");

    if (select) {
        select.addEventListener("change", () => {
            selectedPon = 1;
            refreshLiveData();
        });
    }

    const refreshButton = $("omRefresh");

    if (refreshButton) {
        refreshButton.addEventListener("click", () => {
            forceNext = true;
            refreshLiveData();
        });
    }

    root.addEventListener("click", (event) => {
        const button = event.target.closest("[data-pon]");

        if (!button || !root.contains(button) || !currentData) return;

        selectedPon = Number(button.getAttribute("data-pon")) || 1;
        render(currentData);
    });

    window.renderOltMonitor = function (apiData) {
        try {
            const normalized = normalizeData(apiData);
            currentData = normalized;

            if (!normalized.pons.some((pon) => pon.n === selectedPon)) {
                selectedPon = normalized.pons[0]?.n ?? 1;
            }

            render(normalized);
            setConnection(
                normalized.state,
                normalized.warnings.join(" | ") || "OLT data received.",
                false
            );
        } catch (error) {
            console.error("Invalid OLT monitoring data:", error);
            setConnection("Invalid data", error.message, true);
        }
    };

    const emptyOlt = normalizeData({
        success: true,
        olt: {
            id: 0,
            name: "OLT",
            vendor: "Unknown",
            model: "Unknown",
            pon_ports: 4,
            ip: "N/A"
        },
        ports: [],
        system: {},
        warnings: ["Waiting for live API data."]
    });

    currentData = emptyOlt;
    render(emptyOlt);

    setConnection(
        "Not connected",
        "Waiting for live data from the Node.js OLT monitoring API.",
        false
    );

    // Pick up the background (20 minute) OLT reads; this never touches the OLT.
    setInterval(() => {
        if (!document.hidden) refreshLiveData();
    }, 60000);

    refreshLiveData();
})();
