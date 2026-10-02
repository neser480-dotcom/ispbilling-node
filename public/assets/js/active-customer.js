"use strict";

document.addEventListener("DOMContentLoaded", () => {

    /*
    |--------------------------------------------------------------------------
    | API BASE
    |--------------------------------------------------------------------------
    */

    const API_BASE =
        "/customers/active-pppoe/api";


    /*
    |--------------------------------------------------------------------------
    | ELEMENTS
    |--------------------------------------------------------------------------
    */

    const page =
        document.querySelector(".active-customer-page");

    const filterBtn =
        document.getElementById("activeFilterBtn");

    const filterPanel =
        document.getElementById("activeFilterPanel");

    const refreshBtn =
        document.getElementById("activeRefreshBtn");

    const btrcBtn =
        document.getElementById("activeBtrcBtn");

    const printBtn =
        document.getElementById("activePrintBtn");

    const collapseBtn =
        document.getElementById("activeCollapseBtn");

    const routerFilter =
        document.getElementById("routerFilter");

    const packageFilter =
        document.getElementById("packageFilter");

    const areaFilter =
        document.getElementById("areaFilter");

    const subAreaFilter =
        document.getElementById("subAreaFilter");

    const statusFilter =
        document.getElementById("connectionStatusFilter");

    const applyFilterBtn =
        document.getElementById("applyFilterBtn");

    const resetFilterBtn =
        document.getElementById("resetFilterBtn");

    const tableBody =
        document.getElementById("userTableBody");

    const totalData =
        document.getElementById("activeTotalData");

    const activeCount =
        document.getElementById("activeCount");

    const offlineCount =
        document.getElementById("offlineCount");

    const searchInput =
        document.getElementById("searchInput");

    const searchClearBtn =
        document.getElementById("searchClearBtn");

    const selectAll =
        document.getElementById("selectAllActive");


    /*
    |--------------------------------------------------------------------------
    | REQUIRED ELEMENT CHECK
    |--------------------------------------------------------------------------
    */

    if (!page || !tableBody) {
        console.error(
            "Active Customer: required HTML elements are missing."
        );
        return;
    }


    /*
    |--------------------------------------------------------------------------
    | STATE
    |--------------------------------------------------------------------------
    */

    let allRows = [];


    /*
    |--------------------------------------------------------------------------
    | HELPERS
    |--------------------------------------------------------------------------
    */

    function escapeHtml(value) {

        const div =
            document.createElement("div");

        div.textContent =
            value === null ||
            value === undefined
                ? ""
                : String(value);

        return div.innerHTML;
    }


    function getQuery() {

        const params =
            new URLSearchParams();

        const routerId =
            routerFilter?.value || "";

        const packageValue =
            packageFilter?.value || "";

        const areaValue =
            areaFilter?.value || "";

        const subAreaValue =
            subAreaFilter?.value || "";

        const statusValue =
            statusFilter?.value || "all";


        if (routerId) {
            params.set(
                "router_id",
                routerId
            );
        }

        if (packageValue) {
            params.set(
                "package",
                packageValue
            );
        }

        if (areaValue) {
            params.set(
                "area",
                areaValue
            );
        }

        if (subAreaValue) {
            params.set(
                "sub_area",
                subAreaValue
            );
        }

        if (statusValue) {
            params.set(
                "connection_status",
                statusValue
            );
        }

        return params.toString();
    }


    /*
    |--------------------------------------------------------------------------
    | LOAD ROUTERS
    |--------------------------------------------------------------------------
    */

    async function loadRouters() {

        if (!routerFilter) {
            return;
        }

        routerFilter.innerHTML =
            `<option value="">Loading...</option>`;


        try {

            const response =
                await fetch(
                    `${API_BASE}/routers`,
                    {
                        credentials: "same-origin",
                        cache: "no-store"
                    }
                );


            const result =
                await response.json();


            if (
                !response.ok ||
                !result.success
            ) {
                throw new Error(
                    result.message ||
                    "Unable to load routers."
                );
            }


            routerFilter.innerHTML =
                `<option value="">All Routers</option>`;


            if (
                !Array.isArray(result.data) ||
                result.data.length === 0
            ) {

                routerFilter.innerHTML =
                    `<option value="">
                        No MikroTik Router
                    </option>`;

                return;
            }


            result.data.forEach(router => {

                const option =
                    document.createElement("option");

                option.value =
                    router.id;

                option.textContent =
                    router.name ||
                    `Router #${router.id}`;

                routerFilter.appendChild(
                    option
                );
            });


            /*
            |------------------------------------------------------------------
            | AUTO SELECT FIRST ROUTER
            |------------------------------------------------------------------
            */

            if (result.data.length === 1) {

                routerFilter.value =
                    String(result.data[0].id);
            }


        } catch (error) {

            console.error(
                "Router loading error:",
                error
            );

            routerFilter.innerHTML =
                `<option value="">
                    Router loading failed
                </option>`;
        }
    }


    /*
    |--------------------------------------------------------------------------
    | LOAD DATA
    |--------------------------------------------------------------------------
    */

    async function loadData() {

        tableBody.innerHTML =
            `
            <tr>
                <td colspan="10"
                    class="loading-row">

                    <i class="fa-solid fa-spinner fa-spin"></i>

                    Loading Customers...

                </td>
            </tr>
            `;


        try {

            const query =
                getQuery();


            const url =
                query
                    ? `${API_BASE}/data?${query}`
                    : `${API_BASE}/data`;


            console.log(
                "Active Customer API:",
                url
            );


            const response =
                await fetch(
                    url,
                    {
                        credentials: "same-origin",
                        cache: "no-store"
                    }
                );


            /*
            |--------------------------------------------------------------------------
            | RESPONSE CHECK
            |--------------------------------------------------------------------------
            */

            if (!response.ok) {

                const text =
                    await response.text();

                throw new Error(
                    `HTTP ${response.status}: ${text}`
                );
            }


            const result =
                await response.json();


            console.log(
                "Active Customer API Result:",
                result
            );


            if (!result.success) {

                throw new Error(
                    result.message ||
                    "Unable to load customers."
                );
            }


            /*
            |--------------------------------------------------------------------------
            | DATA
            |--------------------------------------------------------------------------
            */

            allRows =
                Array.isArray(result.data)
                    ? result.data
                    : [];


            /*
            |--------------------------------------------------------------------------
            | COUNTS
            |--------------------------------------------------------------------------
            */

            totalData.textContent =
                result.total ??
                allRows.length;


            activeCount.textContent =
                result.active ??
                allRows.filter(
                    row =>
                        String(row.status)
                            .toLowerCase() ===
                        "active"
                ).length;


            offlineCount.textContent =
                result.offline ??
                allRows.filter(
                    row =>
                        String(row.status)
                            .toLowerCase() !==
                        "active"
                ).length;


            /*
            |--------------------------------------------------------------------------
            | RENDER
            |--------------------------------------------------------------------------
            */

            renderRows(allRows);


        } catch (error) {

            console.error(
                "Active Customer error:",
                error
            );


            allRows = [];


            totalData.textContent =
                "0";

            activeCount.textContent =
                "0";

            offlineCount.textContent =
                "0";


            tableBody.innerHTML =
                `
                <tr>
                    <td colspan="10"
                        class="error-row">

                        <i class="fa-solid fa-triangle-exclamation"></i>

                        ${escapeHtml(
                            error.message ||
                            "Unable to load customers."
                        )}

                    </td>
                </tr>
                `;
        }


        updateSelectAll();
    }


    /*
    |--------------------------------------------------------------------------
    | RENDER ROWS
    |--------------------------------------------------------------------------
    */

    function renderRows(rows) {

        if (!Array.isArray(rows) || !rows.length) {

            tableBody.innerHTML =
                `
                <tr>
                    <td colspan="10"
                        class="empty-row">

                        <i class="fa-solid fa-user-slash"></i>

                        No customer found.

                    </td>
                </tr>
                `;

            return;
        }


        tableBody.innerHTML =
            rows
                .map(row => createRowHtml(row))
                .join("");


        bindRowEvents();

        applySearch();
    }


    /*
    |--------------------------------------------------------------------------
    | ROW HTML
    |--------------------------------------------------------------------------
    */

    function createRowHtml(row) {

        const isActive =
            String(row.status || "")
                .toLowerCase() ===
            "active";


        const statusHtml =
            isActive
                ? `
                    <span class="status-badge status-active">

                        <i
                            class="fa-solid fa-circle"
                            style="font-size:7px"
                        ></i>

                        &nbsp;Active

                    </span>
                `
                : `
                    <span class="status-badge status-offline">

                        <i
                            class="fa-solid fa-circle"
                            style="font-size:7px"
                        ></i>

                        &nbsp;Offline

                    </span>
                `;


        const ip =
            row.address ||
            "—";


        const mac =
            row.caller_id ||
            "—";


        const upload =
            row.upload_display ||
            "0 MB";


        const download =
            row.download_display ||
            "0 MB";


        return `
            <tr
                data-status="${escapeHtml(
                    row.status || ""
                )}"
            >

                <td class="select-column">

                    <input
                        type="checkbox"
                        class="active-user-check"
                        value="${escapeHtml(
                            row.username || ""
                        )}"
                    >

                </td>


                <td>
                    ${escapeHtml(
                        row.id ?? "—"
                    )}
                </td>


                <td>

                    <div class="customer-name">

                        ${escapeHtml(
                            row.customer_name ||
                            "—"
                        )}

                    </div>

                    <div class="customer-pppoe">

                        ${escapeHtml(
                            row.username ||
                            "—"
                        )}

                    </div>

                </td>


                <td>

                    <div class="ip-address">

                        ${escapeHtml(ip)}

                    </div>

                    <div class="mac-address">

                        ${escapeHtml(mac)}

                    </div>

                </td>


                <td>

                    ${escapeHtml(
                        row.package ||
                        "PPPoE"
                    )}

                </td>


                <td>

                    <div class="traffic-up">

                        ↑ ${escapeHtml(
                            upload
                        )}

                    </div>

                    <div class="traffic-down">

                        ↓ ${escapeHtml(
                            download
                        )}

                    </div>

                </td>


                <td>

                    ${escapeHtml(
                        row.uptime ||
                        "—"
                    )}

                </td>


                <td>

                    <div>

                        ${escapeHtml(
                            row.login_time ||
                            "—"
                        )}

                    </div>

                    <div class="mac-address">

                        ${escapeHtml(
                            row.logout_time ||
                            "—"
                        )}

                    </div>

                </td>


                <td>

                    ${statusHtml}

                </td>


                <td>

                    <div class="dropdown">

                        <button
                            class="btn btn-link action-button dropdown-toggle"
                            type="button"
                            data-bs-toggle="dropdown"
                            aria-expanded="false"
                        >

                            <i class="fa-solid fa-ellipsis"></i>

                        </button>


                        <ul class="dropdown-menu dropdown-menu-end">

                            <li>

                                <a
                                    class="dropdown-item"
                                    href="ping.php?ip=${encodeURIComponent(
                                        row.address || ""
                                    )}"
                                >

                                    <i class="fa-solid fa-bolt"></i>

                                    Ping

                                </a>

                            </li>


                            <li>

                                <a
                                    class="dropdown-item"
                                    href="bandwidth.php?user=${encodeURIComponent(
                                        row.username || ""
                                    )}"
                                >

                                    <i class="fa-solid fa-gauge-high"></i>

                                    Bandwidth

                                </a>

                            </li>


                            <li>

                                <a
                                    class="dropdown-item"
                                    href="mac_binding.php?mac=${encodeURIComponent(
                                        row.caller_id || ""
                                    )}"
                                >

                                    <i class="fa-solid fa-link"></i>

                                    MAC-Binding

                                </a>

                            </li>


                            ${
                                isActive
                                    ? `
                                        <li>

                                            <hr class="dropdown-divider">

                                        </li>


                                        <li>

                                            <a
                                                class="dropdown-item text-danger"
                                                href="remove_conn.php?id=${encodeURIComponent(
                                                    row[".id"] || ""
                                                )}&router_id=${encodeURIComponent(
                                                    routerFilter?.value || ""
                                                )}"
                                            >

                                                <i class="fa-solid fa-power-off"></i>

                                                Remove Connection

                                            </a>

                                        </li>
                                    `
                                    : ""
                            }

                        </ul>

                    </div>

                </td>

            </tr>
        `;
    }


    /*
    |--------------------------------------------------------------------------
    | SEARCH
    |--------------------------------------------------------------------------
    */

    function applySearch() {

        if (!searchInput) {
            return;
        }


        const keyword =
            String(
                searchInput.value || ""
            )
                .trim()
                .toLowerCase();


        const rows =
            tableBody.querySelectorAll(
                "tr"
            );


        let visible =
            0;


        rows.forEach(row => {

            /*
            |------------------------------------------------------------------
            | Don't search loading/error/empty rows
            |------------------------------------------------------------------
            */

            if (
                !row.querySelector(
                    ".active-user-check"
                )
            ) {
                return;
            }


            const text =
                row.textContent
                    .toLowerCase();


            if (
                !keyword ||
                text.includes(keyword)
            ) {

                row.style.display =
                    "";

                visible++;

            } else {

                row.style.display =
                    "none";
            }

        });


        /*
        |--------------------------------------------------------------------------
        | TOTAL DISPLAY
        |--------------------------------------------------------------------------
        */

        totalData.textContent =
            keyword
                ? visible
                : allRows.length;


        updateSelectAll();
    }


    /*
    |--------------------------------------------------------------------------
    | CHECKBOX EVENTS
    |--------------------------------------------------------------------------
    */

    function bindRowEvents() {

        const checks =
            document.querySelectorAll(
                ".active-user-check"
            );


        checks.forEach(checkbox => {

            checkbox.addEventListener(
                "change",
                updateSelectAll
            );

        });
    }


    function updateSelectAll() {

        if (!selectAll) {
            return;
        }


        const visibleChecks =
            Array.from(
                document.querySelectorAll(
                    ".active-user-check"
                )
            )
            .filter(checkbox => {

                const row =
                    checkbox.closest("tr");

                return (
                    row &&
                    row.style.display !==
                    "none"
                );
            });


        const checked =
            visibleChecks.filter(
                checkbox =>
                    checkbox.checked
            );


        selectAll.checked =
            visibleChecks.length > 0 &&
            checked.length ===
            visibleChecks.length;


        selectAll.indeterminate =
            checked.length > 0 &&
            checked.length <
            visibleChecks.length;
    }


    /*
    |--------------------------------------------------------------------------
    | FILTER BUTTON
    |--------------------------------------------------------------------------
    */

    if (filterBtn && filterPanel) {

        filterBtn.addEventListener(
            "click",
            () => {

                const hidden =
                    filterPanel.style.display ===
                    "none";


                filterPanel.style.display =
                    hidden
                        ? "block"
                        : "none";
            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | APPLY FILTER
    |--------------------------------------------------------------------------
    */

    if (applyFilterBtn) {

        applyFilterBtn.addEventListener(
            "click",
            () => {

                loadData();
            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | RESET
    |--------------------------------------------------------------------------
    */

    if (resetFilterBtn) {

        resetFilterBtn.addEventListener(
            "click",
            () => {

                if (packageFilter) {
                    packageFilter.value =
                        "";
                }

                if (areaFilter) {
                    areaFilter.value =
                        "";
                }

                if (subAreaFilter) {
                    subAreaFilter.value =
                        "";
                }

                if (statusFilter) {
                    statusFilter.value =
                        "all";
                }

                loadData();
            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | ROUTER CHANGE
    |--------------------------------------------------------------------------
    */

    if (routerFilter) {

        routerFilter.addEventListener(
            "change",
            () => {

                loadData();
            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | REFRESH
    |--------------------------------------------------------------------------
    */

    if (refreshBtn) {

        refreshBtn.addEventListener(
            "click",
            () => {

                loadData();
            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | SEARCH
    |--------------------------------------------------------------------------
    */

    if (searchInput) {

        searchInput.addEventListener(
            "input",
            applySearch
        );
    }


    if (searchClearBtn) {

        searchClearBtn.addEventListener(
            "click",
            () => {

                searchInput.value =
                    "";

                applySearch();

                searchInput.focus();
            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | SELECT ALL
    |--------------------------------------------------------------------------
    */

    if (selectAll) {

        selectAll.addEventListener(
            "change",
            () => {

                const checks =
                    document.querySelectorAll(
                        ".active-user-check"
                    );


                checks.forEach(checkbox => {

                    const row =
                        checkbox.closest("tr");


                    if (
                        row &&
                        row.style.display !==
                        "none"
                    ) {

                        checkbox.checked =
                            selectAll.checked;
                    }

                });

            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | COLLAPSE
    |--------------------------------------------------------------------------
    */

    if (collapseBtn) {

        collapseBtn.addEventListener(
            "click",
            () => {

                page.classList.toggle(
                    "collapsed"
                );


                const icon =
                    collapseBtn.querySelector(
                        "i"
                    );


                if (!icon) {
                    return;
                }


                if (
                    page.classList.contains(
                        "collapsed"
                    )
                ) {

                    icon.className =
                        "fa-solid fa-chevron-down";

                } else {

                    icon.className =
                        "fa-solid fa-chevron-up";
                }

            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | BTRC
    |--------------------------------------------------------------------------
    */

    if (btrcBtn) {

        btrcBtn.addEventListener(
            "click",
            () => {

                alert(
                    "BTRC report module is ready for integration."
                );

            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | PRINT
    |--------------------------------------------------------------------------
    */

    if (printBtn) {

        printBtn.addEventListener(
            "click",
            () => {

                window.print();

            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | INITIAL LOAD
    |--------------------------------------------------------------------------
    */

    async function init() {

        await loadRouters();

        await loadData();

    }


    init();

});