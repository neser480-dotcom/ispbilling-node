"use strict";

document.addEventListener("DOMContentLoaded", () => {

    const $ = id => document.getElementById(id);
    const params = new URLSearchParams(location.search);

    const oltId = params.get("olt_id");
    const pon = params.get("pon");

    const body = $("onuBody");
    const search = $("onuSearch");
    const refreshButton = $("refreshFaultDetails");

    let allOnus = [];
    let currentFault = {};

    function safe(v) {
        return String(v ?? "").replace(/[&<>"']/g, ch => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[ch]);
    }

    function value(v) {
        return v === null || v === undefined || String(v).trim() === ""
            ? "-"
            : v;
    }

    function serial(onu) {
        return onu.onu_sn ??
            onu.serial_number ??
            onu.serial ??
            onu.sn ??
            onu.onu_mac ??
            onu.mac_address ??
            onu.mac ??
            "-";
    }

    function normalizedStatus(status) {
        const s = String(status ?? "").trim().toLowerCase();

        if (["online", "up", "active", "connected", "1"].includes(s)) {
            return "online";
        }

        if (["offline", "down", "disconnected", "0"].includes(s)) {
            return "offline";
        }

        return "unknown";
    }

    function numberOrNull(v) {
        if (v === null || v === undefined || String(v).trim() === "") {
            return null;
        }

        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    function getRxSeverity(rx) {
        if (rx === null) return "unknown";
        if (rx <= -30) return "critical";
        if (rx <= -27) return "weak";
        if (rx <= -25) return "warning";
        return "normal";
    }

    function getFaultReason(onu) {
        const faultType = String(
            currentFault.fault_type || currentFault.type || ""
        ).toLowerCase();

        const status = normalizedStatus(onu.status);

        if (faultType.includes("stale")) {
            if (status === "offline") {
                return "ONU Offline — monitoring data stale";
            }

            if (status === "unknown") {
                return "ONU Data Stale — actual offline status not confirmed";
            }
        }

        if (status === "offline") {
            return "ONU Offline";
        }

        const rx = numberOrNull(onu.rx_power);
        const severity = getRxSeverity(rx);

        if (severity === "critical") return "Critical RX Power";
        if (severity === "weak") return "Weak RX Power";
        if (severity === "warning") return "Low RX Power";

        if (status === "unknown") {
            return "Status Unknown";
        }

        return value(onu.fault_reason) === "-"
            ? "No active fault"
            : onu.fault_reason;
    }

    function getStatusLabel(onu) {
        const status = normalizedStatus(onu.status);
        const faultType = String(
            currentFault.fault_type || currentFault.type || ""
        ).toLowerCase();

        if (status === "online") return "Online";
        if (status === "offline") return "Offline";

        if (faultType.includes("stale")) {
            return "Unknown / Stale";
        }

        return "Unknown";
    }

    function getStatusClass(onu) {
        const status = normalizedStatus(onu.status);

        if (status === "online") return "status-online";
        if (status === "offline") return "status-offline";

        return "status-unknown";
    }

    function getTx(onu) {
        return onu.tx_power ??
            onu.txPower ??
            onu.transmit_power ??
            onu.tx_optical_power ??
            null;
    }

    function formatPower(v) {
        const n = numberOrNull(v);

        if (n === null) return "-";

        return `${n.toFixed(2)} dBm`;
    }

    function formatDistance(v) {
        if (v === null || v === undefined || String(v).trim() === "") {
            return "-";
        }

        return String(v);
    }

    function renderRows(rows) {

        if (!rows.length) {
            body.innerHTML = `
                <tr>
                    <td colspan="12" class="loading">
                        No affected ONU found for this fault.
                    </td>
                </tr>`;
            return;
        }

        body.innerHTML = rows.map((onu, i) => {

            const tx = getTx(onu);
            const statusLabel = getStatusLabel(onu);
            const statusClass = getStatusClass(onu);
            const reason = getFaultReason(onu);

            const rx = onu.rx_power;

            return `
                <tr>
                    <td>${i + 1}</td>
                    <td>${safe(value(onu.customer_code))}</td>
                    <td>${safe(value(onu.customer_name))}</td>
                    <td>${safe(value(onu.customer_phone))}</td>
                    <td>${safe(value(serial(onu)))}</td>
                    <td>${safe(value(onu.pppoe_username))}</td>
                    <td>${safe(value(onu.pon ?? pon))}</td>
                    <td>${safe(formatPower(rx))}</td>
                    <td>${safe(formatPower(tx))}</td>
                    <td>${safe(formatDistance(onu.distance))}</td>
                    <td>
                        <span class="${statusClass}">
                            ${safe(statusLabel)}
                        </span>
                    </td>
                    <td>${safe(reason)}</td>
                </tr>`;
        }).join("");
    }

    function updateSummary(rows) {

        let offline = 0;
        let weak = 0;
        let critical = 0;

        rows.forEach(onu => {

            if (normalizedStatus(onu.status) === "offline") {
                offline++;
            }

            const rx = numberOrNull(onu.rx_power);
            const severity = getRxSeverity(rx);

            if (severity === "weak") weak++;
            if (severity === "critical") critical++;
        });

        $("totalONU").textContent = rows.length;
        $("offlineONU").textContent = offline;
        $("weakRX").textContent = weak;
        $("criticalRX").textContent = critical;
    }

    function render(data) {

        const fault = data.fault || {};
        const olt = data.olt || {};

        currentFault = fault;

        $("pageTitle").textContent =
            `${olt.name || olt.olt_name || "OLT"} Fault Details`;

        $("oltPon").textContent =
            `OLT: ${olt.name || olt.olt_name || olt.id || oltId} | PON: ${data.pon || pon}`;

        $("faultType").textContent =
            fault.fault_type || fault.type || "No active fault";

        $("faultSeverity").textContent = fault.severity || "-";
        $("faultArea").textContent = fault.estimated_fault_area || "-";
        $("likelyCause").textContent = fault.likely_cause || "-";
        $("faultReason").textContent =
            fault.reason || "No fault reason available.";

        const confidenceValue = fault.fault_confidence;

        if (
            confidenceValue === null ||
            confidenceValue === undefined ||
            confidenceValue === ""
        ) {
            $("faultConfidence").textContent = "-";
        } else {
            const confidence = Number(confidenceValue);

            $("faultConfidence").textContent =
                Number.isFinite(confidence)
                    ? `${confidence <= 1
                        ? Math.round(confidence * 100)
                        : Math.round(confidence)}%`
                    : "-";
        }

        const type = String(
            fault.fault_type || fault.type || ""
        ).toLowerCase();

        if (type.includes("stale")) {
            $("fiberAnalysis").textContent =
                "ONU monitoring data is stale. This does not by itself confirm a physical fiber fault. Check OLT synchronization, ONU polling and monitoring service before diagnosing offline ONU or optical loss.";
        } else if (type.includes("optical") || type.includes("loss")) {
            $("fiberAnalysis").textContent =
                "Optical loss detected. Check splitter, connector, splice points and fiber attenuation. Compare affected ONU RX readings along this PON.";
        } else {
            $("fiberAnalysis").textContent =
                "Check affected ONU drop fiber, connector, splitter output and local power. If multiple ONU are confirmed offline, inspect the common fiber and splitter path.";
        }

        allOnus = Array.isArray(data.onus) ? data.onus : [];

        updateSummary(allOnus);
        renderRows(allOnus);
    }

    async function load() {

        if (!oltId || !pon) {
            body.innerHTML = `
                <tr>
                    <td colspan="12" class="loading">
                        Missing olt_id or pon in URL.
                    </td>
                </tr>`;

            $("oltPon").textContent = "Missing OLT/PON information";
            return;
        }

        body.innerHTML = `
            <tr>
                <td colspan="12" class="loading">
                    Loading affected ONU...
                </td>
            </tr>`;

        if (refreshButton) {
            refreshButton.disabled = true;
            refreshButton.textContent = "Loading...";
        }

        try {

            const query = new URLSearchParams({
                olt_id: oltId,
                pon: pon
            });

            const response = await fetch(
                `/api/monitoring/fault-details/api?${query}`,
                {
                    credentials: "same-origin",
                    headers: {
                        Accept: "application/json"
                    },
                    cache: "no-store"
                }
            );

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.message || `HTTP ${response.status}`
                );
            }

            render(data);

        } catch (error) {

            console.error("Fault details:", error);

            body.innerHTML = `
                <tr>
                    <td colspan="12" class="loading">
                        ${safe(error.message)}
                    </td>
                </tr>`;

            $("oltPon").textContent =
                "Unable to load fault details";

        } finally {

            if (refreshButton) {
                refreshButton.disabled = false;
                refreshButton.textContent = "Refresh";
            }
        }
    }

    if (search) {
        search.addEventListener("input", () => {

            const q = search.value.trim().toLowerCase();

            renderRows(
                !q
                    ? allOnus
                    : allOnus.filter(onu => [
                        onu.customer_code,
                        onu.customer_name,
                        onu.customer_phone,
                        serial(onu),
                        onu.onu_mac,
                        onu.pppoe_username,
                        onu.pon,
                        onu.rx_power,
                        getTx(onu),
                        onu.distance,
                        getStatusLabel(onu),
                        getFaultReason(onu)
                    ].some(v =>
                        String(v ?? "").toLowerCase().includes(q)
                    ))
            );
        });
    }

    if (refreshButton) {
        refreshButton.addEventListener("click", load);
    }

    load();
});
