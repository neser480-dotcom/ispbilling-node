"use strict";

document.addEventListener("DOMContentLoaded", () => {

    const routerSelect =
        document.getElementById("routerSelect");

    const refreshButton =
        document.getElementById("refreshInterface");

    const ethernetBody =
        document.getElementById("ethernetBody");

    const vlanBody =
        document.getElementById("vlanBody");

    const ethernetCount =
        document.getElementById("ethernetCount");

    const vlanCount =
        document.getElementById("vlanCount");

    const connectionError =
        document.getElementById("connectionError");

    const bandwidthModalElement =
        document.getElementById("bandwidthModal");

    const modalInterfaceTitle =
        document.getElementById(
            "modalInterfaceTitle"
        );

    const bandwidthLoading =
        document.getElementById(
            "bandwidthLoading"
        );

    const bandwidthError =
        document.getElementById(
            "bandwidthError"
        );

    const bandwidthStats =
        document.getElementById(
            "bandwidthStats"
        );

    const downloadSpeed =
        document.getElementById(
            "downloadSpeed"
        );

    const uploadSpeed =
        document.getElementById(
            "uploadSpeed"
        );

    const bandwidthChart =
        document.getElementById(
            "bandwidthChart"
        );


    if (!routerSelect) {
        return;
    }


    let bandwidthTimer = null;

    let bandwidthHistory = [];

    let currentBandwidthRouter = 0;

    let currentBandwidthInterface = "";


    function escapeHtml(value) {

        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }


    function getRouterId() {

        return Number(
            routerSelect.value || 0
        );

    }


    function showError(message) {

        if (!connectionError) {
            return;
        }

        connectionError.textContent =
            message || "Unknown error.";

        connectionError.classList.remove(
            "d-none"
        );
    }


    function hideError() {

        if (!connectionError) {
            return;
        }

        connectionError.textContent = "";

        connectionError.classList.add(
            "d-none"
        );
    }


    function statusBadge(status) {

        if (status === "up") {

            return `
                <span class="badge bg-success">
                    up
                </span>
            `;

        }

        return `
            <span class="badge bg-danger">
                down
            </span>
        `;
    }


    function bandwidthButton(
        interfaceName,
        routerId
    ) {

        return `
            <button
                type="button"
                class="btn btn-primary btn-sm view-bandwidth"
                data-interface="${escapeHtml(interfaceName)}"
                data-router="${routerId}"
                title="Bandwidth"
            >
                <i class="fas fa-chart-bar"></i>
            </button>
        `;
    }


    function renderEthernet(items, router) {

        ethernetCount.textContent =
            items.length;


        if (!items.length) {

            ethernetBody.innerHTML = `
                <tr>
                    <td
                        colspan="5"
                        class="text-center text-muted py-4"
                    >
                        No Ethernet/Bridge interfaces found.
                    </td>
                </tr>
            `;

            return;
        }


        ethernetBody.innerHTML =
            items.map((item, index) => {

                return `
                    <tr>

                        <td>
                            ${index + 1}
                        </td>

                        <td>
                            <strong>
                                ${escapeHtml(item.name)}
                            </strong>
                        </td>

                        <td>
                            ${statusBadge(item.status)}
                        </td>

                        <td>
                            ${escapeHtml(
                                item.mikrotik ||
                                router?.name ||
                                ""
                            )}
                        </td>

                        <td>
                            ${bandwidthButton(
                                item.name,
                                router.id
                            )}
                        </td>

                    </tr>
                `;

            }).join("");

    }


    function renderVlan(items, router) {

        vlanCount.textContent =
            items.length;


        if (!items.length) {

            vlanBody.innerHTML = `
                <tr>
                    <td
                        colspan="6"
                        class="text-center text-muted py-4"
                    >
                        No VLAN interfaces found.
                    </td>
                </tr>
            `;

            return;
        }


        vlanBody.innerHTML =
            items.map((item, index) => {

                return `
                    <tr>

                        <td>
                            ${index + 1}
                        </td>

                        <td>
                            <strong>
                                ${escapeHtml(item.name)}
                            </strong>
                        </td>

                        <td>
                            ${escapeHtml(
                                item.vlan_id
                            )}
                        </td>

                        <td>
                            ${statusBadge(item.status)}
                        </td>

                        <td>
                            ${escapeHtml(
                                item.mikrotik ||
                                router?.name ||
                                ""
                            )}
                        </td>

                        <td>
                            ${bandwidthButton(
                                item.name,
                                router.id
                            )}
                        </td>

                    </tr>
                `;

            }).join("");

    }


    function renderRouters(
        routers,
        selectedRouter
    ) {

        if (!routers || !routers.length) {

            routerSelect.innerHTML = `
                <option value="">
                    No Router Found
                </option>
            `;

            return;
        }


        routerSelect.innerHTML =
            routers.map(router => {

                const selected =
                    Number(router.id) ===
                    Number(selectedRouter?.id)
                        ? "selected"
                        : "";

                return `
                    <option
                        value="${router.id}"
                        ${selected}
                    >
                        ${escapeHtml(router.name)}
                    </option>
                `;

            }).join("");

    }


    async function loadInterfaces() {

        hideError();

        const routerId =
            getRouterId();


        if (refreshButton) {

            refreshButton.disabled = true;

            refreshButton
                .querySelector("i")
                ?.classList.add("fa-spin");

        }


        try {

            const url =
                routerId
                    ? `/monitoring/interface/data?id=${encodeURIComponent(routerId)}`
                    : `/monitoring/interface/data`;


            const response =
                await fetch(
                    url,
                    {
                        method: "GET",
                        credentials: "same-origin",
                        headers: {
                            Accept:
                                "application/json"
                        },
                        cache: "no-store"
                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data.message ||
                    "Interface Monitor request failed."
                );

            }


            renderRouters(
                data.routers || [],
                data.router
            );


            if (
                data.connectionError
            ) {

                showError(
                    data.connectionError
                );

            }


            renderEthernet(
                data.ethernet_interfaces || [],
                data.router
            );


            renderVlan(
                data.vlan_interfaces || [],
                data.router
            );


        } catch (error) {

            console.error(
                "Interface Monitor:",
                error
            );

            showError(
                error.message ||
                "Interface Monitor loading failed."
            );


            ethernetBody.innerHTML = `
                <tr>
                    <td
                        colspan="5"
                        class="text-center text-danger py-4"
                    >
                        Failed to load interfaces.
                    </td>
                </tr>
            `;


            vlanBody.innerHTML = `
                <tr>
                    <td
                        colspan="6"
                        class="text-center text-danger py-4"
                    >
                        Failed to load interfaces.
                    </td>
                </tr>
            `;

        } finally {

            if (refreshButton) {

                refreshButton.disabled = false;

                refreshButton
                    .querySelector("i")
                    ?.classList.remove("fa-spin");

            }

        }

    }


    function resetBandwidthModal() {

        bandwidthLoading.classList.remove(
            "d-none"
        );

        bandwidthError.classList.add(
            "d-none"
        );

        bandwidthError.textContent = "";

        bandwidthStats.classList.add(
            "d-none"
        );

        bandwidthChart.innerHTML = "";

        downloadSpeed.textContent =
            "0 Mbps";

        uploadSpeed.textContent =
            "0 Mbps";

        bandwidthHistory = [];

    }


    function renderBandwidthChart() {

        if (
            typeof CanvasJS ===
            "undefined"
        ) {
            return;
        }


        const chart =
            new CanvasJS.Chart(
                bandwidthChart,
                {
                    animationEnabled: true,

                    theme: "light2",

                    title: {
                        text: "Live Bandwidth"
                    },

                    axisX: {
                        title: "Time"
                    },

                    axisY: {
                        title: "Mbps",
                        includeZero: true
                    },

                    toolTip: {
                        shared: true
                    },

                    legend: {
                        cursor: "pointer"
                    },

                    data: [
                        {
                            type: "line",
                            name: "Download",
                            showInLegend: true,
                            dataPoints:
                                bandwidthHistory.map(
                                    point => ({
                                        label:
                                            point.label,
                                        y:
                                            point.download
                                    })
                                )
                        },
                        {
                            type: "line",
                            name: "Upload",
                            showInLegend: true,
                            dataPoints:
                                bandwidthHistory.map(
                                    point => ({
                                        label:
                                            point.label,
                                        y:
                                            point.upload
                                    })
                                )
                        }
                    ]
                }
            );


        chart.render();

    }


    async function loadBandwidth() {

        if (
            !currentBandwidthRouter ||
            !currentBandwidthInterface
        ) {
            return;
        }


        try {

            const url =
                `/monitoring/interface/bandwidth?id=${encodeURIComponent(
                    currentBandwidthRouter
                )}&interface=${encodeURIComponent(
                    currentBandwidthInterface
                )}`;


            const response =
                await fetch(
                    url,
                    {
                        method: "GET",
                        credentials: "same-origin",
                        headers: {
                            Accept:
                                "application/json"
                        },
                        cache: "no-store"
                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data.message ||
                    "Bandwidth request failed."
                );

            }


            if (!data.success) {

                throw new Error(
                    data.message ||
                    "Bandwidth unavailable."
                );

            }


            bandwidthLoading.classList.add(
                "d-none"
            );

            bandwidthStats.classList.remove(
                "d-none"
            );


            downloadSpeed.textContent =
                `${Number(
                    data.downloadMbps || 0
                ).toFixed(2)} Mbps`;


            uploadSpeed.textContent =
                `${Number(
                    data.uploadMbps || 0
                ).toFixed(2)} Mbps`;


            const now =
                new Date(
                    data.timestamp ||
                    Date.now()
                );


            const label =
                now.toLocaleTimeString();


            bandwidthHistory.push({
                label,
                download:
                    Number(
                        data.downloadMbps || 0
                    ),
                upload:
                    Number(
                        data.uploadMbps || 0
                    )
            });


            if (
                bandwidthHistory.length > 30
            ) {
                bandwidthHistory.shift();
            }


            renderBandwidthChart();


        } catch (error) {

            console.error(
                "Bandwidth:",
                error
            );

            bandwidthError.textContent =
                error.message ||
                "Bandwidth loading failed.";

            bandwidthError.classList.remove(
                "d-none"
            );

        }

    }


    function openBandwidth(
        interfaceName,
        routerId
    ) {

        currentBandwidthInterface =
            interfaceName;

        currentBandwidthRouter =
            Number(routerId);


        resetBandwidthModal();


        modalInterfaceTitle.textContent =
            `${interfaceName} Bandwidth Monitor`;


        const modal =
            bootstrap.Modal.getOrCreateInstance(
                bandwidthModalElement
            );


        modal.show();


        loadBandwidth();


        if (bandwidthTimer) {
            clearInterval(
                bandwidthTimer
            );
        }


        bandwidthTimer =
            setInterval(
                loadBandwidth,
                2000
            );


        bandwidthModalElement.addEventListener(
            "hidden.bs.modal",
            () => {

                if (bandwidthTimer) {

                    clearInterval(
                        bandwidthTimer
                    );

                    bandwidthTimer = null;

                }

            },
            {
                once: true
            }
        );

    }


    document.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    ".view-bandwidth"
                );


            if (!button) {
                return;
            }


            const interfaceName =
                button.dataset.interface;


            const routerId =
                button.dataset.router;


            openBandwidth(
                interfaceName,
                routerId
            );

        }
    );


    routerSelect.addEventListener(
        "change",
        () => {

            const id =
                Number(
                    routerSelect.value || 0
                );


            const url =
                id
                    ? `/monitoring/interface?id=${encodeURIComponent(id)}`
                    : "/monitoring/interface";


            window.history.replaceState(
                {},
                "",
                url
            );


            loadInterfaces();

        }
    );


    refreshButton?.addEventListener(
        "click",
        () => {

            loadInterfaces();

        }
    );


    loadInterfaces();

});