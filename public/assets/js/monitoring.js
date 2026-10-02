"use strict";

document.addEventListener("DOMContentLoaded", () => {

    const tableBody =
        document.getElementById(
            "faultTableBody"
        );

    const refreshButton =
        document.getElementById(
            "refreshFaults"
        );

    const searchInput =
        document.getElementById(
            "faultSearch"
        );

    const severityFilter =
        document.getElementById(
            "severityFilter"
        );

    const perPageSelect =
        document.getElementById(
            "faultPerPage"
        );

    const clearFilterButton =
        document.getElementById(
            "clearFaultFilter"
        );

    const pagination =
        document.getElementById(
            "faultPagination"
        );

    if (!tableBody) {
        return;
    }


    let allFaults = [];

    let currentPage = 1;

    let perPage = Number(
        window.NETFEE_MONITORING
            ?.defaultPerPage ?? 25
    );

    if (
        perPageSelect &&
        perPageSelect.value
    ) {
        perPage =
            Number(
                perPageSelect.value
            );
    }


    /*
    |--------------------------------------------------------------------------
    | HELPERS
    |--------------------------------------------------------------------------
    */

    function escapeHtml(value) {

        return String(
            value ?? ""
        )
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }


    function formatNumber(
        value,
        decimals = 2
    ) {

        const number =
            Number(value);

        if (
            !Number.isFinite(number)
        ) {
            return "-";
        }

        return number.toFixed(
            decimals
        );
    }


    function formatDate(value) {

        if (!value) {
            return "-";
        }

        const date =
            new Date(value);

        if (
            Number.isNaN(
                date.getTime()
            )
        ) {
            return escapeHtml(
                value
            );
        }

        return escapeHtml(
            date.toLocaleString()
        );
    }


    function severityBadge(
        severity
    ) {

        const value =
            String(
                severity ?? "warning"
            ).toLowerCase();

        if (
            value === "critical"
        ) {

            return `
                <span class="badge bg-danger">
                    <i class="fa fa-circle-exclamation"></i>
                    Critical
                </span>
            `;
        }


        if (
            value === "recovered"
        ) {

            return `
                <span class="badge bg-success">
                    <i class="fa fa-circle-check"></i>
                    Recovered
                </span>
            `;
        }


        return `
            <span class="badge bg-warning text-dark">
                <i class="fa fa-triangle-exclamation"></i>
                Warning
            </span>
        `;
    }


    function healthBadge(
        health
    ) {

        const value =
            String(
                health ?? "unknown"
            ).toLowerCase();


        if (
            value === "critical"
        ) {

            return `
                <span class="badge bg-danger">
                    Critical
                </span>
            `;
        }


        if (
            value === "degraded"
        ) {

            return `
                <span class="badge bg-warning text-dark">
                    Degraded
                </span>
            `;
        }


        if (
            value === "healthy"
        ) {

            return `
                <span class="badge bg-success">
                    Healthy
                </span>
            `;
        }


        if (
            value === "data_stale"
        ) {

            return `
                <span class="badge bg-secondary">
                    Data Stale
                </span>
            `;
        }


        return `
            <span class="badge bg-light text-dark border">
                Unknown
            </span>
        `;
    }


    function confidenceBadge(
        confidence
    ) {

        const value =
            String(
                confidence ?? "low"
            ).toLowerCase();


        if (
            value === "high"
        ) {

            return `
                <span class="badge bg-success">
                    High
                </span>
            `;
        }


        if (
            value === "medium"
        ) {

            return `
                <span class="badge bg-warning text-dark">
                    Medium
                </span>
            `;
        }


        return `
            <span class="badge bg-secondary">
                Low
            </span>
        `;
    }


    function rxEvidence(
        fault
    ) {

        const critical =
            Number(
                fault.critical_rx_count ?? 0
            );

        const weak =
            Number(
                fault.weak_rx_count ?? 0
            );

        const average =
            fault.rx_average !== null &&
            fault.rx_average !== undefined
                ? formatNumber(
                    fault.rx_average
                )
                : null;

        let html = "";


        if (critical > 0) {

            html += `
                <div class="text-danger fw-bold">
                    <i class="fa fa-circle-exclamation"></i>
                    Critical: ${critical}
                </div>
            `;
        }


        if (weak > 0) {

            html += `
                <div class="text-warning fw-bold">
                    <i class="fa fa-triangle-exclamation"></i>
                    Weak: ${weak}
                </div>
            `;
        }


        if (average !== null) {

            html += `
                <div class="small text-muted">
                    Avg RX: ${average} dBm
                </div>
            `;
        }


        if (
            !html
        ) {

            return `
                <span class="text-muted">
                    No RX evidence
                </span>
            `;
        }


        return html;
    }


    function dataQualityBadge(
        fault
    ) {

        const quality =
            String(
                fault.data_quality ?? "fresh"
            ).toLowerCase();


        if (
            quality === "stale"
        ) {

            return `
                <span
                    class="badge bg-secondary"
                    title="All ONU monitoring data is stale"
                >
                    <i class="fa fa-clock"></i>
                    Stale
                </span>
            `;
        }


        if (
            quality === "partial_stale"
        ) {

            return `
                <span
                    class="badge bg-warning text-dark"
                    title="Some ONU monitoring data is stale"
                >
                    <i class="fa fa-clock"></i>
                    Partial Stale
                </span>
            `;
        }


        return `
            <span
                class="badge bg-success"
                title="ONU monitoring data is fresh"
            >
                <i class="fa fa-circle-check"></i>
                Fresh
            </span>
        `;
    }


    /*
    |--------------------------------------------------------------------------
    | FAULT ROW
    |--------------------------------------------------------------------------
    */

    function faultRow(
        fault
    ) {

        const severity =
            String(
                fault.severity ?? "warning"
            ).toLowerCase();


        const rowClass =
            severity === "critical"
                ? "table-danger"
                : severity === "recovered"
                    ? "table-success"
                    : "table-warning";


        const affected =
            Number(
                fault.affected_onu ?? 0
            );

        const total =
            Number(
                fault.total_onu ?? 0
            );

        const offline =
            Number(
                fault.offline_onu ?? 0
            );

        const stale =
            Number(
                fault.stale_onu_count ?? 0
            );


        const recommendedChecks =
            Array.isArray(
                fault.recommended_checks
            )
                ? fault.recommended_checks
                : [];


        const checksHtml =
            recommendedChecks.length
                ? `
                    <ul class="fault-check-list">
                        ${recommendedChecks
                            .slice(0, 5)
                            .map(
                                item =>
                                    `<li>${escapeHtml(item)}</li>`
                            )
                            .join("")}
                    </ul>
                `
                : `
                    <span class="text-muted">
                        No checklist available
                    </span>
                `;


        return `
            <tr class="${rowClass}">

                <!-- SEVERITY -->

                <td>

                    ${severityBadge(
                        fault.severity
                    )}

                    <div class="mt-2">
                        ${healthBadge(
                            fault.pon_health
                        )}
                    </div>

                </td>


                <!-- FAULT TYPE -->

                <td>

                    <strong>
                        ${escapeHtml(
                            fault.fault_type
                        )}
                    </strong>

                    <div class="small text-muted">
                        ${formatNumber(
                            fault.offline_percent
                        )}% offline
                    </div>

                    ${
                        fault.fault_confidence
                            ? `
                                <div class="small mt-1">
                                    Confidence:
                                    ${confidenceBadge(
                                        fault.fault_confidence
                                    )}
                                </div>
                            `
                            : ""
                    }

                </td>


                <!-- OLT -->

                <td>

                    <strong>
                        ${escapeHtml(
                            fault.olt_name || "-"
                        )}
                    </strong>

                    <div class="small text-muted">
                        OLT ID:
                        ${escapeHtml(
                            fault.olt_id
                        )}
                    </div>

                </td>


                <!-- PON -->

                <td>

                    <strong>
                        ${escapeHtml(
                            fault.pon || "-"
                        )}
                    </strong>

                </td>


                <!-- AFFECTED ONU -->

                <td>

                    <strong class="fs-5">
                        ${affected}
                    </strong>

                    /
                    ${total}

                    <div class="small text-danger">
                        Offline:
                        ${offline}
                    </div>

                    ${
                        stale > 0
                            ? `
                                <div class="small text-secondary">
                                    Stale:
                                    ${stale}
                                </div>
                            `
                            : ""
                    }

                </td>


                <!-- DISTANCE -->

                <td>

                    <div>
                        ${escapeHtml(
                            fault.estimated_fault_area ||
                            "Distance data unavailable"
                        )}
                    </div>

                    <div class="small mt-1">

                        Distance confidence:
                        ${confidenceBadge(
                            fault.estimated_confidence
                        )}

                    </div>

                    ${
                        fault.nearest_online_km !== null &&
                        fault.nearest_online_km !== undefined
                            ? `
                                <div class="small text-muted mt-1">
                                    Nearest online:
                                    ${formatNumber(
                                        fault.nearest_online_km
                                    )} km
                                </div>
                            `
                            : ""
                    }

                </td>


                <!-- RX -->

                <td>

                    ${rxEvidence(
                        fault
                    )}

                    ${
                        fault.rx_min !== null &&
                        fault.rx_min !== undefined
                            ? `
                                <div class="small text-muted mt-1">
                                    Range:
                                    ${formatNumber(
                                        fault.rx_min
                                    )}
                                    to
                                    ${formatNumber(
                                        fault.rx_max
                                    )}
                                    dBm
                                </div>
                            `
                            : ""
                    }

                </td>


                <!-- REASON -->

                <td>

                    <div class="fault-reason">

                        ${escapeHtml(
                            fault.reason ||
                            "Network condition detected."
                        )}

                    </div>


                    ${
                        fault.likely_cause
                            ? `
                                <div class="fault-cause mt-2">

                                    <strong>
                                        Likely Cause:
                                    </strong>

                                    ${escapeHtml(
                                        fault.likely_cause
                                    )}

                                </div>
                            `
                            : ""
                    }


                    <div class="mt-2">

                        ${dataQualityBadge(
                            fault
                        )}

                    </div>


                    ${
                        stale > 0
                            ? `
                                <div class="small text-secondary mt-1">
                                    Stale ONU:
                                    ${stale}
                                    /
                                    ${total}
                                </div>
                            `
                            : ""
                    }


                    <div class="small text-muted mt-2">

                        Last Update:
                        ${formatDate(
                            fault.last_update
                        )}

                    </div>

                </td>


                <!-- DETECTED -->

                <td class="text-nowrap">

                    ${formatDate(
                        fault.detected_at
                    )}

                    ${
                        fault.data_age_seconds !== null &&
                        fault.data_age_seconds !== undefined
                            ? `
                                <div class="small text-muted mt-1">
                                    Data age:
                                    ${formatAge(
                                        fault.data_age_seconds
                                    )}
                                </div>
                            `
                            : ""
                    }

                </td>


                <!-- ACTION -->

                <td class="text-nowrap">

                    <a
                        href="/monitoring/fault-details?olt_id=${encodeURIComponent(
                            fault.olt_id
                        )}&pon=${encodeURIComponent(
                            fault.pon
                        )}"
                        class="btn btn-sm btn-primary"
                    >

                        <i class="fa fa-eye"></i>
                        Details

                    </a>


                    ${
                        recommendedChecks.length
                            ? `
                                <button
                                    type="button"
                                    class="btn btn-sm btn-outline-secondary mt-1"
                                    data-bs-toggle="tooltip"
                                    data-bs-placement="top"
                                    title="${escapeHtml(
                                        recommendedChecks.join(" • ")
                                    )}"
                                >
                                    <i class="fa fa-list-check"></i>
                                </button>
                            `
                            : ""
                    }

                </td>

            </tr>
        `;
    }


    function formatAge(
        seconds
    ) {

        const value =
            Number(seconds);

        if (
            !Number.isFinite(value) ||
            value < 0
        ) {
            return "-";
        }


        if (
            value < 60
        ) {

            return `${value}s`;
        }


        const minutes =
            Math.floor(
                value / 60
            );


        if (
            minutes < 60
        ) {

            return `${minutes}m`;
        }


        const hours =
            Math.floor(
                minutes / 60
            );


        if (
            hours < 24
        ) {

            return `${hours}h`;
        }


        const days =
            Math.floor(
                hours / 24
            );


        return `${days}d`;
    }


    /*
    |--------------------------------------------------------------------------
    | EMPTY ROW
    |--------------------------------------------------------------------------
    */

    function emptyRow() {

        return `
            <tr>

                <td
                    colspan="10"
                    class="text-center py-5 text-muted"
                >

                    <i class="fa fa-circle-check fa-2x mb-2"></i>

                    <div>
                        No active network fault found.
                    </div>

                </td>

            </tr>
        `;
    }


    /*
    |--------------------------------------------------------------------------
    | ERROR ROW
    |--------------------------------------------------------------------------
    */

    function errorRow(
        message
    ) {

        return `
            <tr>

                <td
                    colspan="10"
                    class="text-center text-danger py-5"
                >

                    <i class="fa fa-triangle-exclamation fa-2x mb-2"></i>

                    <div>
                        ${escapeHtml(
                            message
                        )}
                    </div>

                </td>

            </tr>
        `;
    }


    /*
    |--------------------------------------------------------------------------
    | SUMMARY
    |--------------------------------------------------------------------------
    */

    function updateSummary(
        summary
    ) {

        const total =
            document.getElementById(
                "totalCount"
            );

        const critical =
            document.getElementById(
                "criticalCount"
            );

        const warning =
            document.getElementById(
                "warningCount"
            );

        const recovered =
            document.getElementById(
                "recoveredCount"
            );


        if (total) {

            total.textContent =
                Number(
                    summary.total ?? 0
                );
        }


        if (critical) {

            critical.textContent =
                Number(
                    summary.critical ?? 0
                );
        }


        if (warning) {

            warning.textContent =
                Number(
                    summary.warning ?? 0
                );
        }


        if (recovered) {

            recovered.textContent =
                Number(
                    summary.recovered ?? 0
                );
        }
    }


    /*
    |--------------------------------------------------------------------------
    | FILTER
    |--------------------------------------------------------------------------
    */

    function getFilteredFaults() {

        const keyword =
            String(
                searchInput?.value ?? ""
            )
                .trim()
                .toLowerCase();


        const severity =
            String(
                severityFilter?.value ?? ""
            )
                .trim()
                .toLowerCase();


        return allFaults.filter(
            fault => {

                const searchable = [

                    fault.fault_type,

                    fault.olt_name,

                    fault.olt_id,

                    fault.pon,

                    fault.reason,

                    fault.likely_cause,

                    fault.estimated_fault_area,

                    fault.pon_health,

                    fault.fault_confidence,

                    fault.data_quality,

                    ...(Array.isArray(
                        fault.recommended_checks
                    )
                        ? fault.recommended_checks
                        : [])

                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();


                if (
                    keyword &&
                    !searchable.includes(
                        keyword
                    )
                ) {

                    return false;
                }


                if (
                    severity &&
                    String(
                        fault.severity ?? ""
                    )
                        .toLowerCase() !==
                    severity
                ) {

                    return false;
                }


                return true;
            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | RENDER
    |--------------------------------------------------------------------------
    */

    function render() {

        const filtered =
            getFilteredFaults();


        /*
        | ALL
        */

        if (
            !perPage ||
            perPage <= 0
        ) {

            tableBody.innerHTML =
                filtered.length
                    ? filtered
                        .map(faultRow)
                        .join("")
                    : emptyRow();


            renderPagination(
                filtered.length,
                1,
                1
            );


            initializeTooltips();

            return;
        }


        const totalPages =
            Math.max(
                1,
                Math.ceil(
                    filtered.length /
                    perPage
                )
            );


        if (
            currentPage >
            totalPages
        ) {

            currentPage =
                totalPages;
        }


        const start =
            (
                currentPage - 1
            ) * perPage;


        const pageRows =
            filtered.slice(
                start,
                start + perPage
            );


        tableBody.innerHTML =
            pageRows.length
                ? pageRows
                    .map(faultRow)
                    .join("")
                : emptyRow();


        renderPagination(
            filtered.length,
            totalPages,
            currentPage
        );


        initializeTooltips();
    }


    /*
    |--------------------------------------------------------------------------
    | TOOLTIP
    |--------------------------------------------------------------------------
    */

    function initializeTooltips() {

        if (
            typeof bootstrap ===
            "undefined"
        ) {
            return;
        }


        const elements =
            document.querySelectorAll(
                '[data-bs-toggle="tooltip"]'
            );


        elements.forEach(
            element => {

                bootstrap.Tooltip
                    .getOrCreateInstance(
                        element
                    );
            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | PAGINATION
    |--------------------------------------------------------------------------
    */

    function renderPagination(
        totalItems,
        totalPages,
        page
    ) {

        if (!pagination) {
            return;
        }


        if (
            !perPage ||
            totalItems <= perPage
        ) {

            pagination.innerHTML =
                "";

            return;
        }


        let html = `
            <nav>
                <ul class="pagination mb-0">
        `;


        html += `
            <li class="page-item ${
                page <= 1
                    ? "disabled"
                    : ""
            }">

                <button
                    type="button"
                    class="page-link"
                    data-page="${page - 1}"
                >
                    Previous
                </button>

            </li>
        `;


        const maxButtons = 7;


        let start =
            Math.max(
                1,
                page - 3
            );


        let end =
            Math.min(
                totalPages,
                start +
                maxButtons -
                1
            );


        if (
            end - start + 1 <
            maxButtons
        ) {

            start =
                Math.max(
                    1,
                    end -
                    maxButtons +
                    1
                );
        }


        for (
            let i = start;
            i <= end;
            i++
        ) {

            html += `
                <li class="page-item ${
                    i === page
                        ? "active"
                        : ""
                }">

                    <button
                        type="button"
                        class="page-link"
                        data-page="${i}"
                    >
                        ${i}
                    </button>

                </li>
            `;
        }


        html += `
            <li class="page-item ${
                page >= totalPages
                    ? "disabled"
                    : ""
            }">

                <button
                    type="button"
                    class="page-link"
                    data-page="${page + 1}"
                >
                    Next
                </button>

            </li>
        `;


        html += `
                </ul>
            </nav>
        `;


        pagination.innerHTML =
            html;


        pagination
            .querySelectorAll(
                "[data-page]"
            )
            .forEach(
                button => {

                    button.addEventListener(
                        "click",
                        () => {

                            const target =
                                Number(
                                    button.dataset.page
                                );


                            if (
                                target < 1 ||
                                target > totalPages
                            ) {
                                return;
                            }


                            currentPage =
                                target;


                            render();
                        }
                    );
                }
            );
    }


    /*
    |--------------------------------------------------------------------------
    | LOAD
    |--------------------------------------------------------------------------
    */

    async function loadFaults() {

        try {

            if (
                refreshButton
            ) {

                refreshButton.disabled =
                    true;

                refreshButton
                    .classList
                    .add("loading");

            }


            const response =
                await fetch(
                    "/api/monitoring/faults",
                    {
                        method: "GET",

                        headers: {
                            Accept:
                                "application/json"
                        },

                        credentials:
                            "same-origin",

                        cache:
                            "no-store"
                    }
                );


            let data;

            try {

                data =
                    await response.json();

            } catch (jsonError) {

                throw new Error(
                    `Server returned invalid JSON (${response.status}).`
                );
            }


            if (
                !response.ok ||
                !data.success
            ) {

                throw new Error(
                    data.message ||
                    "Unable to load monitoring data."
                );
            }


            allFaults =
                Array.isArray(
                    data.faults
                )
                    ? data.faults
                    : [];


            updateSummary(
                data.summary || {}
            );


            currentPage =
                1;


            render();


            const updated =
                document.getElementById(
                    "faultLastUpdate"
                );


            if (updated) {

                updated.textContent =
                    data.updated_at
                        ? `Updated: ${
                            new Date(
                                data.updated_at
                            ).toLocaleString()
                        }`
                        : "Updated: -";
            }


        } catch (error) {

            console.error(
                "Live Fault:",
                error
            );


            tableBody.innerHTML =
                errorRow(
                    error.message
                );

        } finally {

            if (
                refreshButton
            ) {

                refreshButton.disabled =
                    false;

                refreshButton
                    .classList
                    .remove("loading");
            }
        }
    }


    /*
    |--------------------------------------------------------------------------
    | EVENTS
    |--------------------------------------------------------------------------
    */

    refreshButton?.addEventListener(
        "click",
        () => {

            loadFaults();
        }
    );


    searchInput?.addEventListener(
        "input",
        () => {

            currentPage =
                1;

            render();
        }
    );


    severityFilter?.addEventListener(
        "change",
        () => {

            currentPage =
                1;

            render();
        }
    );


    perPageSelect?.addEventListener(
        "change",
        () => {

            perPage =
                Number(
                    perPageSelect.value
                );


            currentPage =
                1;


            render();
        }
    );


    clearFilterButton?.addEventListener(
        "click",
        () => {

            if (searchInput) {
                searchInput.value =
                    "";
            }


            if (severityFilter) {
                severityFilter.value =
                    "";
            }


            if (perPageSelect) {

                perPageSelect.value =
                    "25";

                perPage =
                    25;
            }


            currentPage =
                1;


            render();
        }
    );


    /*
    |--------------------------------------------------------------------------
    | AUTO REFRESH
    |--------------------------------------------------------------------------
    */

    const refreshInterval =
        Number(
            window.NETFEE_MONITORING
                ?.refreshInterval ??
            30000
        );


    loadFaults();


    if (
        refreshInterval > 0
    ) {

        setInterval(
            loadFaults,
            refreshInterval
        );
    }

});