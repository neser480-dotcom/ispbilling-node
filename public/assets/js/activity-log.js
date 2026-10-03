"use strict";

document.addEventListener("DOMContentLoaded", () => {

    /*
    |--------------------------------------------------------------------------
    | ELEMENTS
    |--------------------------------------------------------------------------
    */

    const searchInput =
        document.getElementById("search");

    const fromDateInput =
        document.getElementById("fromDate");

    const toDateInput =
        document.getElementById("toDate");

    const limitInput =
        document.getElementById("limit");

    const filterBtn =
        document.getElementById("filterBtn");

    const refreshBtn =
        document.getElementById("refreshBtn");

    const csvBtn =
        document.getElementById("csvBtn");

    const printBtn =
        document.getElementById("printBtn");

    const activityBody =
        document.getElementById("activityBody");

    const pagination =
        document.getElementById("pagination");

    const pageInfo =
        document.getElementById("pageInfo");

    const totalData =
        document.getElementById("totalData");

    const companyBadge =
        document.getElementById("companyBadge");

    const companyHeader =
        document.getElementById("companyHeader");


    /*
    |--------------------------------------------------------------------------
    | STATE
    |--------------------------------------------------------------------------
    */

    let currentPage = 1;

    let currentLogs = [];

    let currentIsSuperAdmin = false;


    /*
    |--------------------------------------------------------------------------
    | HELPERS
    |--------------------------------------------------------------------------
    */

    function pad(value) {

        return String(value).padStart(2, "0");

    }


    function escapeHtml(value) {

        if (
            value === null ||
            value === undefined
        ) {
            return "";
        }

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

    }


    function safeValue(value, fallback = "N/A") {

        if (
            value === null ||
            value === undefined ||
            String(value).trim() === ""
        ) {
            return fallback;
        }

        return String(value);

    }


    /*
    |--------------------------------------------------------------------------
    | DATE FORMAT
    |--------------------------------------------------------------------------
    */

    function formatDate(value) {

        if (!value) {
            return "N/A";
        }


        let date;


        /*
         * MySQL DATETIME:
         * 2026-10-03 16:30:00
         */

        if (
            typeof value === "string" &&
            /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)
        ) {

            date =
                new Date(
                    value.replace(" ", "T")
                );

        } else {

            date =
                new Date(value);

        }


        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return escapeHtml(value);

        }


        let hours =
            date.getHours();

        const minutes =
            pad(
                date.getMinutes()
            );

        const seconds =
            pad(
                date.getSeconds()
            );

        const ampm =
            hours >= 12
                ? "PM"
                : "AM";


        hours =
            hours % 12 || 12;


        return (
            date.getFullYear() +
            "-" +
            pad(
                date.getMonth() + 1
            ) +
            "-" +
            pad(
                date.getDate()
            ) +
            " " +
            pad(hours) +
            ":" +
            minutes +
            ":" +
            seconds +
            " " +
            ampm
        );

    }


    /*
    |--------------------------------------------------------------------------
    | ACTION BADGE
    |--------------------------------------------------------------------------
    */

    function actionBadge(
        action,
        type
    ) {

        const text =
            escapeHtml(
                safeValue(
                    action,
                    "UNKNOWN"
                )
            );


        let className =
            "bg-primary";


        const actionText =
            String(
                action || ""
            ).toLowerCase();


        const actionType =
            String(
                type || ""
            ).toLowerCase();


        if (
            actionType === "danger" ||
            actionText.includes("delete") ||
            actionText.includes("remove")
        ) {

            className =
                "bg-danger";

        } else if (
            actionType === "success" ||
            actionText.includes("recharge") ||
            actionText.includes("payment") ||
            actionText.includes("paid")
        ) {

            className =
                "bg-success";

        } else if (
            actionType === "warning" ||
            actionText.includes("update") ||
            actionText.includes("edit")
        ) {

            className =
                "bg-warning text-dark";

        }


        return `
            <span class="badge ${className}">
                ${text}
            </span>
        `;

    }


    /*
    |--------------------------------------------------------------------------
    | LOADING
    |--------------------------------------------------------------------------
    */

    function showLoading() {

        if (!activityBody) {
            return;
        }


        activityBody.innerHTML = `
            <tr>
                <td
                    colspan="10"
                    class="text-center py-5"
                >
                    <i class="fas fa-spinner fa-spin me-1"></i>
                    Loading...
                </td>
            </tr>
        `;

    }


    /*
    |--------------------------------------------------------------------------
    | ERROR
    |--------------------------------------------------------------------------
    */

    function showError(message) {

        if (activityBody) {

            activityBody.innerHTML = `
                <tr>
                    <td
                        colspan="10"
                        class="text-center text-danger py-5"
                    >
                        <i class="fas fa-circle-exclamation me-1"></i>
                        ${escapeHtml(message)}
                    </td>
                </tr>
            `;

        }


        if (pagination) {
            pagination.innerHTML = "";
        }


        if (pageInfo) {
            pageInfo.textContent = "";
        }

    }


    /*
    |--------------------------------------------------------------------------
    | RENDER ROWS
    |--------------------------------------------------------------------------
    */

    function renderRows(
        rows,
        isSuperAdmin
    ) {

        if (!activityBody) {
            return;
        }


        if (
            !Array.isArray(rows) ||
            rows.length === 0
        ) {

            activityBody.innerHTML = `
                <tr>
                    <td
                        colspan="10"
                        class="text-center py-5 text-muted"
                    >
                        <i class="fas fa-info-circle me-1"></i>
                        No activity log found.
                    </td>
                </tr>
            `;

            return;
        }


        if (companyHeader) {

            companyHeader.style.display =
                isSuperAdmin
                    ? ""
                    : "none";

        }


        activityBody.innerHTML =
            rows.map((row) => {

                const companyCell =
                    isSuperAdmin
                        ? `
                            <td>
                                ${
                                    Number(
                                        row.company_id || 0
                                    ) > 0

                                        ? `
                                            <span
                                                class="badge bg-info text-dark"
                                            >
                                                Company #${escapeHtml(
                                                    row.company_id
                                                )}
                                            </span>
                                        `

                                        : `
                                            <span
                                                class="badge bg-secondary"
                                            >
                                                Global / Unassigned
                                            </span>
                                        `
                                }
                            </td>
                        `
                        : "";


                const userName =
                    safeValue(
                        row.user_name,
                        "N/A"
                    );


                const userId =
                    Number(
                        row.user_id || 0
                    );


                return `
                    <tr>

                        <td>
                            ${escapeHtml(
                                safeValue(
                                    row.serial,
                                    row.id || "-"
                                )
                            )}
                        </td>


                        ${companyCell}


                        <td
                            class="activity-description"
                        >
                            <strong>
                                ${escapeHtml(
                                    safeValue(
                                        row.description
                                    )
                                )}
                            </strong>
                        </td>


                        <td
                            class="activity-module"
                        >
                            <span
                                class="badge
                                       bg-light
                                       text-dark
                                       border"
                            >
                                ${escapeHtml(
                                    safeValue(
                                        row.module
                                    )
                                )}
                            </span>
                        </td>


                        <td
                            class="activity-ip"
                        >
                            ${escapeHtml(
                                safeValue(
                                    row.ip_address
                                )
                            )}
                        </td>


                        <td
                            class="activity-user"
                        >

                            <div class="fw-bold">
                                ${escapeHtml(
                                    userName
                                )}
                            </div>

                            ${
                                userId > 0
                                    ? `
                                        <small
                                            class="text-muted"
                                        >
                                            User #${userId}
                                        </small>
                                    `
                                    : ""
                            }

                        </td>


                        <td>

                            <span
                                class="badge bg-secondary"
                            >
                                ${escapeHtml(
                                    safeValue(
                                        row.role_name
                                    )
                                )}
                            </span>

                        </td>


                        <td
                            class="activity-action"
                        >
                            ${actionBadge(
                                row.action,
                                row.action_type
                            )}
                        </td>


                        <td
                            class="activity-date"
                        >
                            <small>
                                ${formatDate(
                                    row.created_at
                                )}
                            </small>
                        </td>


                        <td
                            class="text-center"
                        >

                            <button
                                type="button"
                                class="btn
                                       btn-sm
                                       btn-outline-primary"
                                data-log-id="${Number(
                                    row.id || 0
                                )}"
                                title="View"
                            >

                                <i
                                    class="fas fa-eye"
                                ></i>

                            </button>

                        </td>

                    </tr>
                `;

            }).join("");


        /*
        |--------------------------------------------------------------------------
        | VIEW BUTTONS
        |--------------------------------------------------------------------------
        */

        activityBody
            .querySelectorAll(
                "[data-log-id]"
            )
            .forEach((button) => {

                button.addEventListener(
                    "click",
                    () => {

                        const id =
                            Number(
                                button.dataset.logId
                            );


                        const row =
                            currentLogs.find(
                                (item) =>
                                    Number(
                                        item.id
                                    ) === id
                            );


                        if (row) {

                            viewActivityLog(row);

                        }

                    }
                );

            });

    }


    /*
    |--------------------------------------------------------------------------
    | PAGINATION
    |--------------------------------------------------------------------------
    */

    function renderPagination(info) {

        if (!pagination) {
            return;
        }


        pagination.innerHTML = "";


        if (pageInfo) {
            pageInfo.textContent = "";
        }


        if (!info) {
            return;
        }


        const page =
            Number(
                info.page || 1
            );


        const total =
            Number(
                info.total || 0
            );


        const totalPages =
            Number(
                info.totalPages ||
                info.total_pages ||
                1
            );


        const limit =
            Number(
                info.limit || 100
            );


        if (
            total > 0 &&
            pageInfo
        ) {

            const start =
                ((page - 1) * limit) + 1;


            const end =
                Math.min(
                    page * limit,
                    total
                );


            pageInfo.textContent =
                `Showing ${start}-${end} of ${total}`;

        }


        if (
            totalPages <= 1
        ) {

            return;

        }


        function addButton(
            label,
            targetPage,
            disabled,
            active = false
        ) {

            const li =
                document.createElement(
                    "li"
                );


            li.className =
                "page-item";


            if (disabled) {

                li.classList.add(
                    "disabled"
                );

            }


            if (active) {

                li.classList.add(
                    "active"
                );

            }


            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.className =
                "page-link";


            button.textContent =
                label;


            if (!disabled) {

                button.addEventListener(
                    "click",
                    () => {

                        loadLogs(
                            targetPage
                        );

                    }
                );

            }


            li.appendChild(
                button
            );


            pagination.appendChild(
                li
            );

        }


        addButton(
            "Previous",
            page - 1,
            page <= 1
        );


        const startPage =
            Math.max(
                1,
                page - 2
            );


        const endPage =
            Math.min(
                totalPages,
                page + 2
            );


        if (startPage > 1) {

            addButton(
                "1",
                1,
                false,
                page === 1
            );


            if (startPage > 2) {

                const li =
                    document.createElement(
                        "li"
                    );


                li.className =
                    "page-item disabled";


                li.innerHTML =
                    `
                        <span class="page-link">
                            ...
                        </span>
                    `;


                pagination.appendChild(
                    li
                );

            }

        }


        for (
            let i = startPage;
            i <= endPage;
            i++
        ) {

            addButton(
                String(i),
                i,
                false,
                i === page
            );

        }


        if (
            endPage < totalPages
        ) {

            if (
                endPage < totalPages - 1
            ) {

                const li =
                    document.createElement(
                        "li"
                    );


                li.className =
                    "page-item disabled";


                li.innerHTML =
                    `
                        <span class="page-link">
                            ...
                        </span>
                    `;


                pagination.appendChild(
                    li
                );

            }


            addButton(
                String(totalPages),
                totalPages,
                false,
                page === totalPages
            );

        }


        addButton(
            "Next",
            page + 1,
            page >= totalPages
        );

    }


    /*
    |--------------------------------------------------------------------------
    | VIEW MODAL
    |--------------------------------------------------------------------------
    */

    function viewActivityLog(row) {

        const fields = {

            viewUser:
                row.user_name,

            viewUserId:
                Number(
                    row.user_id || 0
                ) > 0
                    ? `User #${row.user_id}`
                    : "N/A",

            viewModule:
                row.module,

            viewAction:
                row.action,

            viewDescription:
                row.description,

            viewIp:
                row.ip_address,

            viewRole:
                row.role_name,

            viewCompany:
                Number(
                    row.company_id || 0
                ) > 0
                    ? `Company #${row.company_id}`
                    : "Global / Unassigned",

            viewDate:
                formatDate(
                    row.created_at
                )

        };


        Object.entries(fields)
            .forEach(
                ([id, value]) => {

                    const element =
                        document.getElementById(
                            id
                        );


                    if (element) {

                        element.textContent =
                            safeValue(
                                value
                            );

                    }

                }
            );


        const modalElement =
            document.getElementById(
                "activityViewModal"
            );


        if (
            !modalElement
        ) {

            return;
        }


        if (
            typeof bootstrap === "undefined" ||
            !bootstrap.Modal
        ) {

            console.error(
                "Bootstrap JS is not loaded."
            );

            return;
        }


        bootstrap.Modal
            .getOrCreateInstance(
                modalElement
            )
            .show();

    }


    /*
    |--------------------------------------------------------------------------
    | LOAD ACTIVITY LOGS
    |--------------------------------------------------------------------------
    */

    async function loadLogs(
        page = 1
    ) {

        currentPage =
            Number(page) || 1;


        showLoading();


        const params =
            new URLSearchParams();


        const search =
            searchInput
                ? searchInput.value.trim()
                : "";


        const fromDate =
            fromDateInput
                ? fromDateInput.value
                : "";


        const toDate =
            toDateInput
                ? toDateInput.value
                : "";


        const limit =
            limitInput
                ? limitInput.value
                : "100";


        params.set(
            "page",
            String(currentPage)
        );


        params.set(
            "limit",
            String(limit)
        );


        if (search) {

            params.set(
                "search",
                search
            );

        }


        /*
        |--------------------------------------------------------------------------
        | DATE PARAMETERS
        |--------------------------------------------------------------------------
        | Backend supports both names.
        | Current frontend uses from_date / to_date.
        |--------------------------------------------------------------------------
        */

        if (fromDate) {

            params.set(
                "from_date",
                fromDate
            );

        }


        if (toDate) {

            params.set(
                "to_date",
                toDate
            );

        }


        try {

            /*
            |--------------------------------------------------------------------------
            | IMPORTANT API PATH
            |--------------------------------------------------------------------------
            |
            | app.js:
            |
            | app.use(
            |     "/activity",
            |     requireSoftwareBilling,
            |     activityLogRoutes
            | );
            |
            | Therefore:
            |
            | /activity/api
            |
            |--------------------------------------------------------------------------
            */

            const response =
                await fetch(
                    `/activity/api?${params.toString()}`,
                    {
                        method: "GET",

                        credentials:
                            "same-origin",

                        headers: {
                            "Accept":
                                "application/json"
                        }
                    }
                );


            let result;


            try {

                result =
                    await response.json();

            } catch (jsonError) {

                throw new Error(
                    `Server returned invalid JSON (HTTP ${response.status}).`
                );

            }


            if (
                !response.ok ||
                result.status !== true
            ) {

                throw new Error(
                    result.message ||
                    `Failed to load activity log. HTTP ${response.status}`
                );

            }


            /*
            |--------------------------------------------------------------------------
            | SUMMARY
            |--------------------------------------------------------------------------
            */

            const summary =
                result.summary || {};


            const paginationData =
                result.pagination || {};


            const total =
                Number(
                    summary.total_data ??
                    paginationData.total ??
                    0
                );


            if (totalData) {

                totalData.textContent =
                    total.toLocaleString();

            }


            /*
            |--------------------------------------------------------------------------
            | COMPANY BADGE
            |--------------------------------------------------------------------------
            */

            currentIsSuperAdmin =
                Boolean(
                    result.is_super_admin
                );


            if (companyBadge) {

                if (
                    currentIsSuperAdmin
                ) {

                    companyBadge.className =
                        "badge bg-danger p-2 ms-1";

                    companyBadge.textContent =
                        "Super Admin";

                } else {

                    companyBadge.className =
                        "badge bg-success p-2 ms-1";

                    companyBadge.textContent =
                        `Company #${
                            result.company_id || 0
                        }`;

                }

            }


            if (companyHeader) {

                companyHeader.style.display =
                    currentIsSuperAdmin
                        ? ""
                        : "none";

            }


            /*
            |--------------------------------------------------------------------------
            | LOG DATA
            |--------------------------------------------------------------------------
            */

            currentLogs =
                Array.isArray(
                    result.logs
                )
                    ? result.logs
                    : [];


            renderRows(
                currentLogs,
                currentIsSuperAdmin
            );


            /*
            |--------------------------------------------------------------------------
            | PAGINATION
            |--------------------------------------------------------------------------
            */

            renderPagination(
                paginationData
            );

        } catch (error) {

            console.error(
                "Activity Log Error:",
                error
            );


            showError(
                error.message ||
                "Failed to load activity log."
            );

        }

    }


    /*
    |--------------------------------------------------------------------------
    | FILTER
    |--------------------------------------------------------------------------
    */

    if (filterBtn) {

        filterBtn.addEventListener(
            "click",
            () => {

                loadLogs(1);

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

                loadLogs(
                    currentPage
                );

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | SEARCH ENTER
    |--------------------------------------------------------------------------
    */

    if (searchInput) {

        searchInput.addEventListener(
            "keydown",
            (event) => {

                if (
                    event.key === "Enter"
                ) {

                    loadLogs(1);

                }

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | LIMIT
    |--------------------------------------------------------------------------
    */

    if (limitInput) {

        limitInput.addEventListener(
            "change",
            () => {

                loadLogs(1);

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | CSV EXPORT
    |--------------------------------------------------------------------------
    */

    function csvEscape(value) {

        const text =
            value === null ||
            value === undefined
                ? ""
                : String(value);


        return `"${text.replace(
            /"/g,
            '""'
        )}"`;

    }


    function exportCsv(rows) {

        if (
            !Array.isArray(rows) ||
            rows.length === 0
        ) {

            alert(
                "No activity data to export."
            );

            return;
        }


        const headers = [

            "#",
            "Company",
            "User ID",
            "User",
            "Description",
            "Module",
            "IP Address",
            "Role",
            "Action",
            "Date"

        ];


        const lines = [

            headers
                .map(csvEscape)
                .join(",")

        ];


        rows.forEach((row) => {

            lines.push(

                [

                    row.serial,

                    row.company_id,

                    row.user_id,

                    row.user_name,

                    row.description,

                    row.module,

                    row.ip_address,

                    row.role_name,

                    row.action,

                    formatDate(
                        row.created_at
                    )

                ]
                .map(csvEscape)
                .join(",")

            );

        });


        const blob =
            new Blob(
                [
                    "\uFEFF" +
                    lines.join("\r\n")
                ],
                {
                    type:
                        "text/csv;charset=utf-8;"
                }
            );


        const url =
            URL.createObjectURL(
                blob
            );


        const link =
            document.createElement(
                "a"
            );


        link.href =
            url;


        link.download =
            "activity_log.csv";


        document.body.appendChild(
            link
        );


        link.click();


        link.remove();


        URL.revokeObjectURL(
            url
        );

    }


    if (csvBtn) {

        csvBtn.addEventListener(
            "click",
            () => {

                exportCsv(
                    currentLogs
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

    loadLogs(1);

});
