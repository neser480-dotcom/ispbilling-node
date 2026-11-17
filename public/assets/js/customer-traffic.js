"use strict";

document.addEventListener("DOMContentLoaded", () => {

    const API = "/api/monitoring/customer-traffic/monthly";
    const REFRESH_MS = 60 * 1000;

    const $ = id => document.getElementById(id);

    const chartEl = $("trafficChart");
    const tableBody = $("trafficTableBody");
    const totalEl = $("trafficTotal");
    const searchInput = $("trafficSearch");
    const refreshBtn = $("trafficRefreshBtn");

    if (!chartEl || !tableBody) {
        console.error("Customer Traffic: required HTML elements are missing.");
        return;
    }

    let rows = [];
    let sortKey = "";
    let sortDir = 1;
    let chart = null;
    let loading = false;

    /* ------------------------------------------------------------ helpers */

    function esc(value) {
        const div = document.createElement("div");
        div.textContent = value === null || value === undefined ? "" : String(value);
        return div.innerHTML;
    }

    function fmtBytes(bytes) {
        const b = Number(bytes) || 0;

        if (b >= 1024 * 1024 * 1024) {
            return (b / (1024 * 1024 * 1024)).toFixed(2) + " GB";
        }

        return (b / (1024 * 1024)).toFixed(2) + " MB";
    }

    async function getJson(url) {
        const response = await fetch(url, {
            credentials: "same-origin",
            cache: "no-store",
            headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" }
        });

        let result = {};
        try { result = await response.json(); } catch (e) { /* not json */ }

        if (!response.ok || result.success === false) {
            throw new Error(result.message || "HTTP " + response.status);
        }

        return result;
    }

    /* -------------------------------------------------------------- chart */

    function renderChart(data) {
        if (typeof CanvasJS === "undefined") {
            chartEl.innerHTML = '<div class="ct-chart-empty">CanvasJS could not be loaded.</div>';
            return;
        }

        const list = Array.isArray(data.chart) ? data.chart : [];
        const totals = data.totals || {};

        const upload = list.map(d => ({ label: String(d.day), y: Number(d.upload_gb) || 0 }));
        const download = list.map(d => ({ label: String(d.day), y: Number(d.download_gb) || 0 }));

        if (chart) {
            chart.destroy();
        }

        chart = new CanvasJS.Chart("trafficChart", {
            animationEnabled: false,
            exportEnabled: true,
            axisX: { interval: 1 },
            axisY: { title: "Data Consumed (GB)" },
            toolTip: { shared: true },
            legend: {
                cursor: "pointer",
                verticalAlign: "bottom",
                horizontalAlign: "center",
                itemclick: function (e) {
                    e.dataSeries.visible = !(typeof e.dataSeries.visible === "undefined" || e.dataSeries.visible);
                    e.chart.render();
                }
            },
            data: [
                {
                    type: "column",
                    name: "Upload: " + (Number(totals.upload_gb) || 0).toFixed(2) + " GB",
                    showInLegend: true,
                    color: "#4F81BC",
                    dataPoints: upload
                },
                {
                    type: "column",
                    name: "Download: " + (Number(totals.download_gb) || 0).toFixed(2) + " GB",
                    showInLegend: true,
                    color: "#C0504E",
                    dataPoints: download
                }
            ]
        });

        chart.render();
    }

    /* -------------------------------------------------------------- table */

    function sortedRows() {
        if (!sortKey) {
            return rows;
        }

        const list = [...rows];

        list.sort((a, b) => {
            const x = a[sortKey];
            const y = b[sortKey];

            if (typeof x === "number" && typeof y === "number") {
                return (x - y) * sortDir;
            }

            return String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true }) * sortDir;
        });

        return list;
    }

    function rowHtml(row) {
        return `
        <tr>
            <td>${esc(row.customer_id || "—")}</td>
            <td>
                <div class="ct-name">${esc(row.name || "—")}</div>
                <div class="ct-sub">${esc(row.username || "—")}</div>
            </td>
            <td>${esc(row.package || "PPPoE")}</td>
            <td>${esc(fmtBytes(row.upload_bytes))}</td>
            <td>${esc(fmtBytes(row.download_bytes))}</td>
            <td>${esc(row.sessions)}</td>
            <td>${esc(row.last_logged_out || "—")}</td>
        </tr>`;
    }

    function renderTable() {
        const list = sortedRows();

        if (!list.length) {
            tableBody.innerHTML = `
                <tr><td colspan="7" class="empty-row">
                    <i class="fa-solid fa-chart-column"></i>&nbsp; No traffic data yet. Data is collected every minute from now on.
                </td></tr>`;
            totalEl.textContent = "0";
            return;
        }

        tableBody.innerHTML = list.map(rowHtml).join("");
        applySearch();
    }

    function applySearch() {
        const keyword = String(searchInput.value || "").trim().toLowerCase();
        let visible = 0;

        tableBody.querySelectorAll("tr").forEach(tr => {
            if (tr.children.length < 7) {
                return;
            }

            const show = !keyword || tr.textContent.toLowerCase().includes(keyword);
            tr.style.display = show ? "" : "none";

            if (show) {
                visible++;
            }
        });

        totalEl.textContent = String(visible);
    }

    /* --------------------------------------------------------------- load */

    async function load(silent) {
        if (loading) {
            return;
        }

        loading = true;
        refreshBtn?.classList.add("busy");

        if (!silent) {
            tableBody.innerHTML = `
                <tr><td colspan="7" class="loading-row">
                    <i class="fa-solid fa-spinner fa-spin"></i>&nbsp; Loading Customer Traffic...
                </td></tr>`;
        }

        try {
            const data = await getJson(API);

            rows = Array.isArray(data.customers) ? data.customers : [];

            renderChart(data);
            renderTable();
        } catch (error) {
            console.error("Customer Traffic:", error);

            if (!silent) {
                rows = [];
                totalEl.textContent = "0";
                tableBody.innerHTML = `
                    <tr><td colspan="7" class="error-row">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        ${esc(error.message || "Unable to load Customer Traffic.")}
                    </td></tr>`;
            }
        } finally {
            loading = false;
            refreshBtn?.classList.remove("busy");
        }
    }

    /* ------------------------------------------------------------- events */

    document.querySelectorAll("#trafficTable th.sortable").forEach(th => {
        th.addEventListener("click", () => {
            const key = th.dataset.sort;

            if (sortKey === key) {
                sortDir = -sortDir;
            } else {
                sortKey = key;
                sortDir = 1;
            }

            renderTable();
        });
    });

    searchInput?.addEventListener("input", applySearch);
    refreshBtn?.addEventListener("click", () => load(false));

    load(false);
    setInterval(() => load(true), REFRESH_MS);
});
