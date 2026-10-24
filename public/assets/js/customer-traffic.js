"use strict";

/*
|--------------------------------------------------------------------------
| CUSTOMER TRAFFIC LIVE JS
|--------------------------------------------------------------------------
*/

document.addEventListener(
    "DOMContentLoaded",
    function () {

        const routerSelect =
            document.getElementById(
                "routerSelect"
            );

        const refreshButton =
            document.getElementById(
                "refreshTraffic"
            );

        const searchInput =
            document.getElementById(
                "trafficSearch"
            );

        const clearSearch =
            document.getElementById(
                "clearTrafficSearch"
            );

        const tableBody =
            document.getElementById(
                "trafficTableBody"
            );

        const chartElement =
            document.getElementById(
                "trafficChart"
            );

        let trafficData = [];

        let chart = null;

        let loading = false;

        let autoRefresh = null;

        /*
        |--------------------------------------------------------------------------
        | HELPERS
        |--------------------------------------------------------------------------
        */

        function escapeHtml(value) {

            return String(
                value ?? ""
            )
                .replace(
                    /&/g,
                    "&amp;"
                )
                .replace(
                    /</g,
                    "&lt;"
                )
                .replace(
                    />/g,
                    "&gt;"
                )
                .replace(
                    /"/g,
                    "&quot;"
                )
                .replace(
                    /'/g,
                    "&#039;"
                );

        }

        function number(value, decimals = 2) {

            const n =
                Number(value);

            if (!Number.isFinite(n)) {
                return "0";
            }

            return n.toFixed(
                decimals
            );

        }

        function showError(message) {

            const box =
                document.getElementById(
                    "trafficError"
                );

            if (!box) {
                return;
            }

            box.textContent =
                message || "Error";

            box.style.display =
                "block";
        }

        function hideError() {

            const box =
                document.getElementById(
                    "trafficError"
                );

            if (!box) {
                return;
            }

            box.style.display =
                "none";

            box.textContent =
                "";
        }

        /*
        |--------------------------------------------------------------------------
        | ROUTER SELECT
        |--------------------------------------------------------------------------
        */

        function renderRouters(routers, selectedId) {

            if (!routerSelect) {
                return;
            }

            routerSelect.innerHTML = "";

            if (
                !Array.isArray(routers) ||
                routers.length === 0
            ) {

                routerSelect.innerHTML =
                    `
                    <option value="">
                        No Router Found
                    </option>
                    `;

                return;
            }

            routers.forEach(
                function (router) {

                    const option =
                        document.createElement(
                            "option"
                        );

                    option.value =
                        router.id;

                    option.textContent =
                        router.name ||
                        `Router ${router.id}`;

                    if (
                        Number(router.id) ===
                        Number(selectedId)
                    ) {

                        option.selected =
                            true;

                    }

                    routerSelect.appendChild(
                        option
                    );

                }
            );
        }

        /*
        |--------------------------------------------------------------------------
        | SUMMARY
        |--------------------------------------------------------------------------
        */

        function updateSummary(data) {

            const totals =
                data.totals || {};

            const active =
                document.getElementById(
                    "activeUsers"
                );

            const downloadMbps =
                document.getElementById(
                    "downloadMbps"
                );

            const uploadMbps =
                document.getElementById(
                    "uploadMbps"
                );

            const downloadGB =
                document.getElementById(
                    "downloadGB"
                );

            const uploadGB =
                document.getElementById(
                    "uploadGB"
                );

            const routerName =
                document.getElementById(
                    "selectedRouterName"
                );

            const lastUpdate =
                document.getElementById(
                    "lastUpdate"
                );

            if (active) {

                active.textContent =
                    totals.activeUsers ||
                    0;

            }

            if (downloadMbps) {

                downloadMbps.textContent =
                    number(
                        totals.downloadMbps
                    );

            }

            if (uploadMbps) {

                uploadMbps.textContent =
                    number(
                        totals.uploadMbps
                    );

            }

            if (downloadGB) {

                downloadGB.textContent =
                    number(
                        totals.downloadGB
                    );

            }

            if (uploadGB) {

                uploadGB.textContent =
                    number(
                        totals.uploadGB
                    );

            }

            if (
                routerName &&
                data.router
            ) {

                routerName.textContent =
                    data.router.name ||
                    "Unknown Router";

            }

            if (lastUpdate) {

                const date =
                    new Date(
                        data.lastUpdate
                    );

                lastUpdate.textContent =
                    date.toLocaleTimeString();

            }
        }

        /*
        |--------------------------------------------------------------------------
        | TABLE
        |--------------------------------------------------------------------------
        */

        function renderTable(rows) {

            if (!tableBody) {
                return;
            }

            if (
                !Array.isArray(rows) ||
                rows.length === 0
            ) {

                tableBody.innerHTML =
                    `
                    <tr>
                        <td
                            colspan="7"
                            class="text-center text-muted py-4"
                        >
                            No Active PPPoE User Found
                        </td>
                    </tr>
                    `;

                return;
            }

            const html =
                rows.map(
                    function (row) {

                        const matched =
                            row.matched === true;

                        return `
                            <tr>

                                <td>
                                    ${escapeHtml(
                                        row.customer_id ||
                                        row.id ||
                                        "-"
                                    )}
                                </td>

                                <td>

                                    <span class="customer-name">
                                        ${escapeHtml(
                                            row.name ||
                                            row.username
                                        )}
                                    </span>

                                    <span class="customer-pppoe">

                                        ${escapeHtml(
                                            row.username
                                        )}

                                        ${
                                            !matched
                                                ? `
                                                <span
                                                    class="mikrotik-only-badge"
                                                >
                                                    MikroTik
                                                </span>
                                                `
                                                : ""
                                        }

                                    </span>

                                </td>

                                <td>
                                    ${escapeHtml(
                                        row.package ||
                                        "PPPoE"
                                    )}
                                </td>

                                <td>

                                    <span class="speed-value">
                                        ${number(
                                            row.upload_mbps
                                        )}
                                    </span>

                                    <span class="speed-unit">
                                        Mbps
                                    </span>

                                    <br>

                                    <small class="text-muted">
                                        ${number(
                                            row.upload_gb
                                        )}
                                        GB
                                    </small>

                                </td>

                                <td>

                                    <span class="speed-value">
                                        ${number(
                                            row.download_mbps
                                        )}
                                    </span>

                                    <span class="speed-unit">
                                        Mbps
                                    </span>

                                    <br>

                                    <small class="text-muted">
                                        ${number(
                                            row.download_gb
                                        )}
                                        GB
                                    </small>

                                </td>

                                <td>
                                    ${escapeHtml(
                                        row.address ||
                                        "-"
                                    )}
                                </td>

                                <td>
                                    <span class="live-dot"></span>
                                    ${escapeHtml(
                                        row.uptime ||
                                        "-"
                                    )}
                                </td>

                            </tr>
                        `;

                    }
                )
                .join("");

            tableBody.innerHTML =
                html;
        }

        /*
        |--------------------------------------------------------------------------
        | CHART
        |--------------------------------------------------------------------------
        */

        function renderChart(data) {

            if (!chartElement) {
                return;
            }

            const rows =
                Array.isArray(data.chart)
                    ? data.chart
                    : [];

            if (
                typeof CanvasJS ===
                "undefined"
            ) {

                chartElement.innerHTML =
                    `
                    <div
                        class="text-center text-muted py-5"
                    >
                        CanvasJS not loaded.
                    </div>
                    `;

                return;
            }

            const downloadData =
                rows.map(
                    function (row) {
                        return {
                            label:
                                row.label,

                            y:
                                Number(
                                    row.download ||
                                    0
                                )
                        };
                    }
                );

            const uploadData =
                rows.map(
                    function (row) {
                        return {
                            label:
                                row.label,

                            y:
                                Number(
                                    row.upload ||
                                    0
                                )
                        };
                    }
                );

            if (chart) {

                chart.destroy();

            }

            chart =
                new CanvasJS.Chart(
                    chartElement,
                    {
                        animationEnabled:
                            false,

                        theme:
                            "light2",

                        axisY: {
                            title:
                                "Mbps",

                            includeZero:
                                true
                        },

                        axisX: {
                            labelAngle:
                                -45
                        },

                        toolTip: {
                            shared:
                                true
                        },

                        legend: {
                            cursor:
                                "pointer"
                        },

                        data: [

                            {
                                type:
                                    "column",

                                name:
                                    "Download",

                                showInLegend:
                                    true,

                                dataPoints:
                                    downloadData
                            },

                            {
                                type:
                                    "column",

                                name:
                                    "Upload",

                                showInLegend:
                                    true,

                                dataPoints:
                                    uploadData
                            }

                        ]
                    }
                );

            chart.render();
        }

        /*
        |--------------------------------------------------------------------------
        | LOAD LIVE DATA
        |--------------------------------------------------------------------------
        */

        async function loadTraffic(
            showLoading = false
        ) {

            if (loading) {
                return;
            }

            loading = true;

            if (showLoading) {

                tableBody.innerHTML =
                    `
                    <tr>
                        <td
                            colspan="7"
                            class="text-center py-4"
                        >
                            <div
                                class="spinner-border spinner-border-sm"
                            ></div>

                            Loading live traffic...
                        </td>
                    </tr>
                    `;

            }

            try {

                hideError();

                const selected =
                    routerSelect
                        ? routerSelect.value
                        : "";

                let url =
                    "/api/monitoring/customer-traffic/live";

                if (selected) {

                    url +=
                        "?id=" +
                        encodeURIComponent(
                            selected
                        );

                }

                const response =
                    await fetch(
                        url,
                        {
                            method:
                                "GET",

                            headers: {
                                "Accept":
                                    "application/json",

                                "X-Requested-With":
                                    "XMLHttpRequest"
                            },

                            cache:
                                "no-store"
                        }
                    );

                const data =
                    await response.json();

                if (!response.ok) {

                    throw new Error(
                        data.message ||
                        "Traffic API failed."
                    );

                }

                if (!data.success) {

                    showError(
                        data.message ||
                        "MikroTik Connection Failed!"
                    );

                    trafficData =
                        [];

                    renderTable([]);

                    updateSummary(
                        data
                    );

                    return;
                }

                trafficData =
                    Array.isArray(
                        data.customers
                    )
                        ? data.customers
                        : [];

                /*
                |--------------------------------------------------------------------------
                | Router dropdown
                |--------------------------------------------------------------------------
                */

                renderRouters(
                    data.routers || [],
                    data.router
                        ? data.router.id
                        : selected
                );

                /*
                |--------------------------------------------------------------------------
                | UI
                |--------------------------------------------------------------------------
                */

                updateSummary(
                    data
                );

                renderTable(
                    trafficData
                );

                renderChart(
                    data
                );

            } catch (error) {

                console.error(
                    "Customer Traffic:",
                    error
                );

                showError(
                    error.message ||
                    "Unable to load Customer Traffic."
                );

            } finally {

                loading =
                    false;
            }
        }

        /*
        |--------------------------------------------------------------------------
        | SEARCH
        |--------------------------------------------------------------------------
        */

        function filterTable() {

            const query =
                searchInput
                    ? searchInput.value
                        .trim()
                        .toLowerCase()
                    : "";

            if (!query) {

                renderTable(
                    trafficData
                );

                return;
            }

            const filtered =
                trafficData.filter(
                    function (row) {

                        const text =
                            [
                                row.customer_id,
                                row.name,
                                row.username,
                                row.package,
                                row.address,
                                row.uptime
                            ]
                                .join(" ")
                                .toLowerCase();

                        return text.includes(
                            query
                        );
                    }
                );

            renderTable(
                filtered
            );
        }

        if (searchInput) {

            searchInput.addEventListener(
                "input",
                filterTable
            );

        }

        if (clearSearch) {

            clearSearch.addEventListener(
                "click",
                function () {

                    if (searchInput) {

                        searchInput.value =
                            "";

                    }

                    renderTable(
                        trafficData
                    );

                }
            );

        }

        /*
        |--------------------------------------------------------------------------
        | ROUTER CHANGE
        |--------------------------------------------------------------------------
        */

        if (routerSelect) {

            routerSelect.addEventListener(
                "change",
                function () {

                    loadTraffic(
                        true
                    );

                }
            );

        }

        /*
        |--------------------------------------------------------------------------
        | MANUAL REFRESH
        |--------------------------------------------------------------------------
        */

        if (refreshButton) {

            refreshButton.addEventListener(
                "click",
                function () {

                    loadTraffic(
                        true
                    );

                }
            );

        }

        /*
        |--------------------------------------------------------------------------
        | CANVASJS
        |--------------------------------------------------------------------------
        */

        const canvasScript =
            document.createElement(
                "script"
            );

        canvasScript.src =
            "https://canvasjs.com/assets/script/canvasjs.min.js";

        canvasScript.onload =
            function () {

                loadTraffic(
                    true
                );

            };

        canvasScript.onerror =
            function () {

                loadTraffic(
                    true
                );

            };

        document.head.appendChild(
            canvasScript
        );

        /*
        |--------------------------------------------------------------------------
        | AUTO LIVE REFRESH
        |--------------------------------------------------------------------------
        */

        autoRefresh =
            setInterval(
                function () {

                    loadTraffic(
                        false
                    );

                },
                5000
            );

    }
);