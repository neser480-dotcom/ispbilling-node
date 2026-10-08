"use strict";

document.addEventListener("DOMContentLoaded", () => {

    /*
    |--------------------------------------------------------------------------
    | CUSTOMER MODULE
    |--------------------------------------------------------------------------
    | Handles:
    | - Customer list
    | - Summary
    | - Search
    | - Status filter
    | - Pagination
    | - Select all
    | - Bulk actions
    | - Add/Edit popup
    | - Recharge
    | - Delete
    | - Connection ON/OFF
    | - MikroTik
    | - Package loading
    | - Router loading
    | - CSV export/template/import
    | - Toast / SweetAlert
    |--------------------------------------------------------------------------
    */


    /*
    |--------------------------------------------------------------------------
    | HELPERS
    |--------------------------------------------------------------------------
    */

    const $ = (selector, root = document) =>
        root.querySelector(selector);


    const $$ = (selector, root = document) =>
        [...root.querySelectorAll(selector)];


    function escapeHtml(value) {

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    function number(value) {

        const n = Number(value);

        return Number.isFinite(n)
            ? n
            : 0;
    }


    function money(value) {

        return number(value).toLocaleString(
            undefined,
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        );
    }


    function unique(values) {

        return [
            ...new Set(
                values
                    .map(value =>
                        String(value).trim()
                    )
                    .filter(Boolean)
            )
        ];
    }


    function selectedIds() {

        return unique(
            $$(
                ".customer-checkbox:checked, input[name='customer_ids[]']:checked"
            ).map(input => input.value)
        );
    }


    function csrfToken() {

        return (
            $("meta[name='csrf-token']")?.content ||
            $("#csrfTokenInput")?.value ||
            $("input[name='csrf_token']")?.value ||
            window.csrfToken ||
            ""
        );
    }


    function showAlert(
        icon,
        title,
        text = ""
    ) {

        if (
            typeof Swal !== "undefined"
        ) {

            return Swal.fire({
                icon,
                title,
                text
            });
        }


        window.alert(
            text || title
        );
    }


    function toast(
        title,
        message,
        type = "success"
    ) {

        const toastElement =
            $("#customerToast");


        if (
            toastElement &&
            typeof bootstrap !== "undefined"
        ) {

            const titleElement =
                $("#customerToastTitle");


            const bodyElement =
                $("#customerToastBody");


            if (titleElement) {

                titleElement.textContent =
                    title || "Customer";
            }


            if (bodyElement) {

                bodyElement.textContent =
                    message || "";
            }


            toastElement.classList.remove(
                "text-bg-success",
                "text-bg-danger",
                "text-bg-warning",
                "text-bg-info"
            );


            toastElement.classList.add(
                type === "error"
                    ? "text-bg-danger"
                    : type === "warning"
                        ? "text-bg-warning"
                        : type === "info"
                            ? "text-bg-info"
                            : "text-bg-success"
            );


            bootstrap.Toast
                .getOrCreateInstance(
                    toastElement
                )
                .show();


            return;
        }


        showAlert(
            type === "error"
                ? "error"
                : type,
            title,
            message
        );
    }


    /*
    |--------------------------------------------------------------------------
    | REQUEST
    |--------------------------------------------------------------------------
    */

    async function request(
        url,
        options = {}
    ) {

        const method =
            String(
                options.method || "GET"
            ).toUpperCase();


        const headers = {
            "X-Requested-With":
                "XMLHttpRequest",

            ...(options.headers || {})
        };


        /*
        |--------------------------------------------------------------------------
        | GET / HEAD
        |--------------------------------------------------------------------------
        | NEVER send a body.
        |--------------------------------------------------------------------------
        */

        if (
            method === "GET" ||
            method === "HEAD"
        ) {

            const response =
                await fetch(
                    url,
                    {
                        method,
                        credentials:
                            "same-origin",
                        headers,
                        cache:
                            "no-store"
                    }
                );


            const text =
                await response.text();


            let data;


            try {

                data =
                    JSON.parse(text);

            } catch (_) {

                throw new Error(
                    text ||
                    `HTTP ${response.status}`
                );
            }


            if (
                !response.ok ||
                data.success === false
            ) {

                throw new Error(
                    data.message ||
                    `HTTP ${response.status}`
                );
            }


            return data;
        }


        /*
        |--------------------------------------------------------------------------
        | POST / PUT / PATCH / DELETE
        |--------------------------------------------------------------------------
        */

        const fetchOptions = {

            method,

            credentials:
                "same-origin",

            headers
        };


        /*
        |--------------------------------------------------------------------------
        | FORMDATA
        |--------------------------------------------------------------------------
        */

        if (
            options.body instanceof FormData
        ) {

            const formData =
                options.body;


            if (
                csrfToken() &&
                !formData.has(
                    "csrf_token"
                )
            ) {

                formData.append(
                    "csrf_token",
                    csrfToken()
                );
            }


            fetchOptions.body =
                formData;
        }

        /*
        |--------------------------------------------------------------------------
        | JSON
        |--------------------------------------------------------------------------
        */

        else {

            headers["Content-Type"] =
                "application/json";


            let body =
                options.body;


            if (
                body === undefined ||
                body === null ||
                body === ""
            ) {

                body = {};
            }

            else if (
                typeof body === "string"
            ) {

                try {

                    body =
                        JSON.parse(body);

                } catch (_) {

                    body = {};
                }
            }


            if (
                csrfToken() &&
                body.csrf_token === undefined
            ) {

                body.csrf_token =
                    csrfToken();
            }


            fetchOptions.body =
                JSON.stringify(body);
        }


        /*
        |--------------------------------------------------------------------------
        | SEND REQUEST
        |--------------------------------------------------------------------------
        */

        const response =
            await fetch(
                url,
                fetchOptions
            );


        const text =
            await response.text();


        let data;


        try {

            data =
                JSON.parse(text);

        } catch (_) {

            throw new Error(
                text ||
                `HTTP ${response.status}`
            );
        }


        if (
            !response.ok ||
            data.success === false
        ) {

            throw new Error(
                data.message ||
                `HTTP ${response.status}`
            );
        }


        return data;
    }


    /*
    |--------------------------------------------------------------------------
    | STATE
    |--------------------------------------------------------------------------
    */

    let currentPage = 1;

    let currentLimit = 100;

    let currentSearch = "";

    let currentStatus = "";

    let loadingCustomers = false;

    let currentCustomers = [];

    let searchTimer = null;


    /*
    |--------------------------------------------------------------------------
    | SELECTION
    |--------------------------------------------------------------------------
    */

    function updateSelectAllState() {

        const master =
            $("#selectAll");


        if (!master) {
            return;
        }


        const boxes =
            $$('.customer-checkbox, input[name="customer_ids[]"]');


        if (!boxes.length) {

            master.checked = false;

            master.indeterminate = false;

            return;
        }


        const checked =
            boxes.filter(
                box => box.checked
            ).length;


        master.checked =
            checked === boxes.length;


        master.indeterminate =
            checked > 0 &&
            checked < boxes.length;
    }


    function refreshSelectionCount() {

        const count =
            selectedIds().length;


        [
            "#selectedCountBadge",
            "#selectedCount",
            ".selected-count",
            "[data-selected-count]"
        ].forEach(selector => {

            $$(selector).forEach(
                element => {

                    element.textContent =
                        count;
                }
            );
        });


        const toggle =
            $("#bulkFloatingToggle");


        if (toggle) {

            toggle.classList.toggle(
                "active",
                count > 0
            );
        }


        updateSelectAllState();
    }


    $("#selectAll")?.addEventListener(
        "change",
        event => {

            const checked =
                event.target.checked;


            $$('.customer-checkbox, input[name="customer_ids[]"]')
                .forEach(
                    box => {
                        box.checked =
                            checked;
                    }
                );


            refreshSelectionCount();
        }
    );


    document.addEventListener(
        "change",
        event => {

            if (
                event.target.matches(
                    '.customer-checkbox, input[name="customer_ids[]"]'
                )
            ) {

                refreshSelectionCount();
            }
        }
    );


    /*
    |--------------------------------------------------------------------------
    | DATE HELPERS
    |--------------------------------------------------------------------------
    */

    function parseDate(value) {

        if (!value) {
            return null;
        }


        const date =
            new Date(
                String(value)
                    .replace(" ", "T")
            );


        return Number.isNaN(
            date.getTime()
        )
            ? null
            : date;
    }


    function formatDate(value) {

        const date =
            parseDate(value);


        if (!date) {
            return "-";
        }


        return date.toLocaleString(
            undefined,
            {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit"
            }
        );
    }


    function toDateTimeLocal(value) {

        const date =
            parseDate(value);


        if (!date) {
            return "";
        }


        const pad =
            value =>
                String(value)
                    .padStart(2, "0");


        return [
            date.getFullYear(),
            "-",
            pad(date.getMonth() + 1),
            "-",
            pad(date.getDate()),
            "T",
            pad(date.getHours()),
            ":",
            pad(date.getMinutes())
        ].join("");
    }


    function daysLeft(customer) {

        const billing =
            parseDate(
                customer.billing_cycle
            );


        const promise =
            parseDate(
                customer.promise_date
            );


        let expiry =
            billing;


        if (
            promise &&
            (!expiry || promise > expiry)
        ) {

            expiry =
                promise;
        }


        if (!expiry) {
            return null;
        }


        const now =
            new Date();


        const diff =
            expiry.getTime() -
            now.getTime();


        return Math.ceil(
            diff /
            86400000
        );
    }


    function dayLeftHtml(customer) {

        const days =
            daysLeft(customer);


        if (days === null) {

            return `
                <span class="text-muted">
                    -
                </span>
            `;
        }


        if (days < 0) {

            return `
                <span class="text-danger fw-semibold">
                    ${Math.abs(days)} day ago
                </span>
            `;
        }


        if (days === 0) {

            return `
                <span class="text-warning fw-semibold">
                    Today
                </span>
            `;
        }


        return `
            <span class="fw-semibold">
                ${days}
                day${days === 1 ? "" : "s"}
            </span>
        `;
    }


    /*
    |--------------------------------------------------------------------------
    | STATUS
    |--------------------------------------------------------------------------
    */

    function statusHtml(status) {

        const value =
            String(
                status ||
                "Pending"
            );


        let cls =
            "bg-secondary";


        switch (value) {

            case "Active":
                cls =
                    "bg-success";
                break;

            case "Expired":
                cls =
                    "bg-danger";
                break;

            case "Inactive":
                cls =
                    "bg-secondary";
                break;

            case "Suspended":
                cls =
                    "bg-warning text-dark";
                break;

            case "Disabled":
                cls =
                    "bg-dark";
                break;

            case "Pending":
                cls =
                    "bg-info text-dark";
                break;
        }


        return `
            <span class="badge ${cls}">
                ${escapeHtml(value)}
            </span>
        `;
    }


    /*
    |--------------------------------------------------------------------------
    | ROW ACTIONS
    |--------------------------------------------------------------------------
    */

    function actionHtml(customer) {

        const id =
            Number(customer.id);


        return `
            <div class="btn-group btn-group-sm">

                <button
                    type="button"
                    class="btn btn-outline-primary customer-edit-btn"
                    data-id="${id}"
                    title="Edit"
                >
                    <i class="fa-solid fa-pen"></i>
                </button>


                <button
                    type="button"
                    class="btn btn-outline-success customer-recharge-btn"
                    data-id="${id}"
                    title="Recharge"
                >
                    <i class="fa-solid fa-wallet"></i>
                </button>


                <button
                    type="button"
                    class="btn btn-outline-secondary customer-connection-btn"
                    data-id="${id}"
                    title="Connection"
                >
                    <i class="fa-solid fa-power-off"></i>
                </button>


                <button
                    type="button"
                    class="btn btn-outline-danger customer-delete-btn"
                    data-id="${id}"
                    title="Delete"
                >
                    <i class="fa-solid fa-trash"></i>
                </button>

            </div>
        `;
    }


    /*
    |--------------------------------------------------------------------------
    | RENDER CUSTOMERS
    |--------------------------------------------------------------------------
    */

    function renderCustomers(customers) {

        const body =
            $("#customerTableBody");


        if (!body) {
            return;
        }


        currentCustomers =
            Array.isArray(customers)
                ? customers
                : [];


        if (!currentCustomers.length) {

            body.innerHTML = `
                <tr>
                    <td
                        colspan="10"
                        class="text-center py-5 text-muted"
                    >
                        No customers found.
                    </td>
                </tr>
            `;


            refreshSelectionCount();

            return;
        }


        body.innerHTML =
            currentCustomers
                .map(customer => {

                    const id =
                        Number(customer.id);


                    const bill =
                        number(
                            customer.display_bill ??
                            customer.monthly_bill
                        );


                    const balance =
                        number(
                            customer.balance
                        );


                    const packageName =
                        customer.display_package ||
                        customer.package_name ||
                        "-";


                    const billDate =
                        formatDate(
                            customer.billing_cycle
                        );


                    const promiseDate =
                        formatDate(
                            customer.promise_date
                        );


                    return `
                        <tr>

                            <td>
                                <input
                                    class="form-check-input customer-checkbox"
                                    type="checkbox"
                                    name="customer_ids[]"
                                    value="${id}"
                                >
                            </td>


                            <td>
                                ${escapeHtml(
                                    customer.customer_id ||
                                    customer.id ||
                                    "-"
                                )}
                            </td>


                            <td>

                                <div class="fw-semibold">
                                    ${escapeHtml(
                                        customer.name ||
                                        "-"
                                    )}
                                </div>

                                <div class="small text-muted">
                                    ${escapeHtml(
                                        customer.pppoe_username ||
                                        "-"
                                    )}
                                </div>

                            </td>


                            <td>

                                <div>
                                    ${escapeHtml(
                                        customer.phone ||
                                        "-"
                                    )}
                                </div>

                                <div class="small text-muted">
                                    ${escapeHtml(
                                        customer.address ||
                                        ""
                                    )}
                                </div>

                            </td>


                            <td>

                                <div class="fw-semibold">
                                    ${escapeHtml(
                                        packageName
                                    )}
                                </div>

                                ${
                                    customer.mikrotik_id
                                        ? `
                                            <div class="small text-muted">
                                                MT #
                                                ${escapeHtml(
                                                    customer.mikrotik_id
                                                )}
                                            </div>
                                        `
                                        : ""
                                }

                            </td>


                            <td>

                                <div class="fw-semibold">
                                    ${money(bill)}
                                </div>

                                <div class="small ${
                                    balance > 0
                                        ? "text-danger"
                                        : balance < 0
                                            ? "text-success"
                                            : "text-muted"
                                }">

                                    Balance:
                                    ${money(balance)}

                                </div>

                            </td>


                            <td>

                                <div class="small">

                                    <span class="fw-semibold">
                                        Bill:
                                    </span>

                                    ${escapeHtml(
                                        billDate
                                    )}

                                </div>


                                <div class="small text-muted">

                                    <span class="fw-semibold">
                                        Promise:
                                    </span>

                                    ${escapeHtml(
                                        promiseDate
                                    )}

                                </div>

                            </td>


                            <td>
                                ${dayLeftHtml(
                                    customer
                                )}
                            </td>


                            <td>
                                ${statusHtml(
                                    customer.status
                                )}
                            </td>


                            <td class="text-nowrap">
                                ${actionHtml(
                                    customer
                                )}
                            </td>

                        </tr>
                    `;
                })
                .join("");


        refreshSelectionCount();
    }


    /*
    |--------------------------------------------------------------------------
    | RANGE
    |--------------------------------------------------------------------------
    */

    function updateRangeText(
        pagination
    ) {

        const rangeText =
            $("#customerRangeText");


        const paginationInfo =
            $("#paginationInfo");


        const total =
            number(
                pagination?.total
            );


        const page =
            Math.max(
                1,
                number(
                    pagination?.page
                ) || 1
            );


        const limit =
            number(
                pagination?.limit
            ) || currentLimit;


        if (!total) {

            if (rangeText) {

                rangeText.textContent =
                    "Showing 0 customers";
            }


            if (paginationInfo) {

                paginationInfo.textContent =
                    "Showing 0 - 0 of 0";
            }


            return;
        }


        const start =
            ((page - 1) * limit) + 1;


        const end =
            Math.min(
                page * limit,
                total
            );


        if (rangeText) {

            rangeText.textContent =
                `Showing ${start} - ${end} of ${total} customers`;
        }


        if (paginationInfo) {

            paginationInfo.textContent =
                `Showing ${start} - ${end} of ${total}`;
        }
    }


    /*
    |--------------------------------------------------------------------------
    | PAGINATION
    |--------------------------------------------------------------------------
    */

    function renderPagination(
        pagination
    ) {

        const container =
            $("#customerPagination");


        if (!container) {
            return;
        }


        const total =
            number(
                pagination?.total
            );


        const pages =
            number(
                pagination?.pages
            );


        const page =
            number(
                pagination?.page
            ) || 1;


        container.innerHTML =
            "";


        if (
            !total ||
            pages <= 1
        ) {

            updateRangeText(
                pagination
            );

            return;
        }


        const fragment =
            document.createDocumentFragment();


        function addItem(
            label,
            targetPage,
            disabled = false,
            active = false
        ) {

            const li =
                document.createElement(
                    "li"
                );


            li.className =
                `page-item${
                    disabled
                        ? " disabled"
                        : ""
                }${
                    active
                        ? " active"
                        : ""
                }`;


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


            if (disabled) {

                button.disabled =
                    true;
            }


            if (!disabled) {

                button.addEventListener(
                    "click",
                    () => {

                        currentPage =
                            targetPage;

                        loadCustomers();
                    }
                );
            }


            li.appendChild(
                button
            );


            fragment.appendChild(
                li
            );
        }


        addItem(
            "‹",
            Math.max(
                1,
                page - 1
            ),
            page <= 1
        );


        const maxVisible =
            7;


        let start =
            Math.max(
                1,
                page - 3
            );


        let end =
            Math.min(
                pages,
                start + maxVisible - 1
            );


        if (
            end - start + 1 <
            maxVisible
        ) {

            start =
                Math.max(
                    1,
                    end - maxVisible + 1
                );
        }


        if (start > 1) {

            addItem(
                "1",
                1,
                false,
                page === 1
            );


            if (start > 2) {

                const li =
                    document.createElement(
                        "li"
                    );


                li.className =
                    "page-item disabled";


                const span =
                    document.createElement(
                        "span"
                    );


                span.className =
                    "page-link";


                span.textContent =
                    "...";


                li.appendChild(
                    span
                );


                fragment.appendChild(
                    li
                );
            }
        }


        for (
            let p = start;
            p <= end;
            p++
        ) {

            addItem(
                String(p),
                p,
                false,
                p === page
            );
        }


        if (end < pages) {

            if (
                end <
                pages - 1
            ) {

                const li =
                    document.createElement(
                        "li"
                    );


                li.className =
                    "page-item disabled";


                const span =
                    document.createElement(
                        "span"
                    );


                span.className =
                    "page-link";


                span.textContent =
                    "...";


                li.appendChild(
                    span
                );


                fragment.appendChild(
                    li
                );
            }


            addItem(
                String(pages),
                pages,
                false,
                page === pages
            );
        }


        addItem(
            "›",
            Math.min(
                pages,
                page + 1
            ),
            page >= pages
        );


        container.appendChild(
            fragment
        );


        updateRangeText(
            pagination
        );
    }


    /*
    |--------------------------------------------------------------------------
    | LOAD CUSTOMERS
    |--------------------------------------------------------------------------
    */

    async function loadCustomers() {

        if (loadingCustomers) {
            return;
        }


        loadingCustomers =
            true;


        const body =
            $("#customerTableBody");


        if (body) {

            body.innerHTML = `
                <tr>
                    <td
                        colspan="10"
                        class="text-center py-5"
                    >

                        <div class="spinner-border"></div>

                        <div class="mt-2 text-muted">
                            Loading customers...
                        </div>

                    </td>
                </tr>
            `;
        }


        try {

            const params =
                new URLSearchParams();


            params.set(
                "page",
                String(
                    currentPage
                )
            );


            params.set(
                "limit",
                String(
                    currentLimit
                )
            );


            if (currentSearch) {

                params.set(
                    "search",
                    currentSearch
                );
            }


            if (currentStatus) {

                params.set(
                    "status",
                    currentStatus
                );
            }


            const data =
                await request(
                    `/api/customers?${params.toString()}`,
                    {
                        method:
                            "GET",

                        headers: {
                            Accept:
                                "application/json"
                        }
                    }
                );


            renderCustomers(
                data.customers ||
                []
            );


            renderPagination(
                data.pagination ||
                {
                    page:
                        currentPage,

                    limit:
                        currentLimit,

                    total:
                        0,

                    pages:
                        0
                }
            );

        } catch (error) {

            console.error(
                "CUSTOMER LIST:",
                error
            );


            if (body) {

                body.innerHTML = `
                    <tr>

                        <td
                            colspan="10"
                            class="text-center py-5"
                        >

                            <div class="text-danger">
                                ${escapeHtml(
                                    error.message
                                )}
                            </div>


                            <button
                                type="button"
                                class="btn btn-sm btn-primary mt-3"
                                id="customerRetryBtn"
                            >
                                Retry
                            </button>

                        </td>

                    </tr>
                `;


                $("#customerRetryBtn")
                    ?.addEventListener(
                        "click",
                        () => {

                            loadCustomers();
                        }
                    );
            }


            const rangeText =
                $("#customerRangeText");


            if (rangeText) {

                rangeText.textContent =
                    "Unable to load customers";
            }

        } finally {

            loadingCustomers =
                false;
        }
    }


    /*
    |--------------------------------------------------------------------------
    | LOAD SUMMARY
    |--------------------------------------------------------------------------
    */

    async function loadSummary() {

        try {

            const params =
                new URLSearchParams();


            if (currentSearch) {

                params.set(
                    "search",
                    currentSearch
                );
            }


            if (currentStatus) {

                params.set(
                    "status",
                    currentStatus
                );
            }


            const data =
                await request(
                    `/api/customers/summary?${params.toString()}`,
                    {
                        method:
                            "GET",

                        headers: {
                            Accept:
                                "application/json"
                        }
                    }
                );


            const summary =
                data.summary ||
                {};


            const total =
                number(
                    summary.total_customers
                );


            const totalBill =
                number(
                    summary.total_bill
                );


            const totalBalance =
                number(
                    summary.total_balance
                );


            if (
                $("#totalCustomers")
            ) {

                $("#totalCustomers")
                    .textContent =
                    total.toLocaleString();
            }


            if (
                $("#totalBill")
            ) {

                $("#totalBill")
                    .textContent =
                    money(totalBill);
            }


            if (
                $("#totalBalance")
            ) {

                $("#totalBalance")
                    .textContent =
                    money(totalBalance);
            }

        } catch (error) {

            console.error(
                "CUSTOMER SUMMARY:",
                error
            );


            if (
                $("#totalCustomers")
            ) {

                $("#totalCustomers")
                    .textContent =
                    "0";
            }


            if (
                $("#totalBill")
            ) {

                $("#totalBill")
                    .textContent =
                    "0.00";
            }


            if (
                $("#totalBalance")
            ) {

                $("#totalBalance")
                    .textContent =
                    "0.00";
            }
        }
    }


    /*
    |--------------------------------------------------------------------------
    | REFRESH ALL
    |--------------------------------------------------------------------------
    */

    async function refreshAll() {

        await Promise.all([
            loadCustomers(),
            loadSummary()
        ]);
    }


    /*
    |--------------------------------------------------------------------------
    | SEARCH
    |--------------------------------------------------------------------------
    */

    const searchInput =
        $("#customerSearch");


    searchInput?.addEventListener(
        "input",
        () => {

            clearTimeout(
                searchTimer
            );


            searchTimer =
                setTimeout(
                    () => {

                        currentSearch =
                            searchInput.value.trim();


                        currentPage =
                            1;


                        refreshAll();

                    },
                    300
                );
        }
    );


    $("#clearSearchBtn")
        ?.addEventListener(
            "click",
            event => {

                event.preventDefault();


                if (searchInput) {

                    searchInput.value =
                        "";
                }


                currentSearch =
                    "";


                currentPage =
                    1;


                refreshAll();
            }
        );


    /*
    |--------------------------------------------------------------------------
    | STATUS FILTER
    |--------------------------------------------------------------------------
    */

    $("#customerStatus")
        ?.addEventListener(
            "change",
            event => {

                currentStatus =
                    String(
                        event.target.value ||
                        ""
                    ).trim();


                currentPage =
                    1;


                refreshAll();
            }
        );


    /*
    |--------------------------------------------------------------------------
    | LIMIT FILTER
    |--------------------------------------------------------------------------
    */

    $("#customerLimit")
        ?.addEventListener(
            "change",
            event => {

                const value =
                    String(
                        event.target.value ||
                        "100"
                    );


                currentLimit =
                    value.toLowerCase() === "all"
                        ? 100000
                        : Math.max(
                            1,
                            number(value) ||
                            100
                        );


                currentPage =
                    1;


                refreshAll();
            }
        );


    /*
    |--------------------------------------------------------------------------
    | APPLY FILTER
    |--------------------------------------------------------------------------
    */

    $("#applyCustomerFilter")
        ?.addEventListener(
            "click",
            event => {

                event.preventDefault();


                currentSearch =
                    searchInput?.value.trim() ||
                    "";


                currentStatus =
                    $("#customerStatus")?.value ||
                    "";


                const selectedLimit =
                    $("#customerLimit")?.value ||
                    "100";


                currentLimit =
                    selectedLimit.toLowerCase() === "all"
                        ? 100000
                        : Math.max(
                            1,
                            number(
                                selectedLimit
                            ) || 100
                        );


                currentPage =
                    1;


                refreshAll();
            }
        );


    /*
    |--------------------------------------------------------------------------
    | REFRESH BUTTON
    |--------------------------------------------------------------------------
    */

    $("#refreshCustomersBtn")
        ?.addEventListener(
            "click",
            event => {

                event.preventDefault();

                refreshAll();
            }
        );


    /*
    |--------------------------------------------------------------------------
    | ACTION MODAL
    |--------------------------------------------------------------------------
    */

    function getActionModal() {

        const modal =
            $("#customerActionModal");


        const body =
            $("#customerActionModalBody") ||
            $("#actionModalBody");


        if (
            !modal ||
            !body
        ) {

            return null;
        }


        return {
            modal,
            body
        };
    }


    /*
    |--------------------------------------------------------------------------
    | OPEN POPUP
    |--------------------------------------------------------------------------
    */

    async function openPopup(
        url,
        title = "Customer Action",
        bulk = false
    ) {

        const idsNow =
            selectedIds();


        if (
            bulk &&
            !idsNow.length
        ) {

            showAlert(
                "warning",
                "No Customer Selected",
                "Please select at least one customer."
            );

            return;
        }


        const actionModal =
            getActionModal();


        if (!actionModal) {

            location.href =
                url;

            return;
        }


        const targetUrl =
            new URL(
                url,
                location.origin
            );


        if (bulk) {

            targetUrl.searchParams.set(
                "ids",
                idsNow.join(",")
            );
        }


        const {
            modal,
            body
        } =
            actionModal;


        body.innerHTML = `
            <div class="text-center p-4">

                <div class="spinner-border"></div>

                <div class="mt-2 text-muted">
                    Loading...
                </div>

            </div>
        `;


        const label =
            $("#customerActionModalLabel");


        if (label) {

            label.textContent =
                title;
        }


        const modalTitle =
            $(".modal-title", modal);


        if (modalTitle) {

            modalTitle.textContent =
                title;
        }


        if (
            typeof bootstrap !== "undefined"
        ) {

            bootstrap.Modal
                .getOrCreateInstance(
                    modal
                )
                .show();
        }


        try {

            const response =
                await fetch(
                    targetUrl.toString(),
                    {
                        method:
                            "GET",

                        credentials:
                            "same-origin",

                        headers: {
                            Accept:
                                "text/html",

                            "X-Requested-With":
                                "XMLHttpRequest"
                        },

                        cache:
                            "no-store"
                    }
                );


            const html =
                await response.text();


            if (!response.ok) {

                throw new Error(
                    html ||
                    `HTTP ${response.status}`
                );
            }


            body.innerHTML =
                html;


            bindForms(
                body,
                idsNow
            );

        } catch (error) {

            body.innerHTML = `
                <div class="alert alert-danger m-3">
                    ${escapeHtml(
                        error.message
                    )}
                </div>
            `;
        }
    }


    /*
    |--------------------------------------------------------------------------
    | FORM BINDING
    |--------------------------------------------------------------------------
    */

    function bindForms(
        root,
        idsNow = []
    ) {

        if (!root) {
            return;
        }


        root.querySelectorAll("form")
            .forEach(
                form => {

                    if (
                        form.dataset.customerBound ===
                        "1"
                    ) {

                        return;
                    }


                    form.dataset.customerBound =
                        "1";


                    form.addEventListener(
                        "submit",
                        async event => {

                            event.preventDefault();


                            const formData =
                                new FormData(
                                    form
                                );


                            const chosen =
                                idsNow.length
                                    ? idsNow
                                    : selectedIds();


                            if (
                                chosen.length
                            ) {

                                formData.delete(
                                    "customer_ids[]"
                                );


                                chosen.forEach(
                                    id => {

                                        formData.append(
                                            "customer_ids[]",
                                            id
                                        );
                                    }
                                );
                            }


                            const submitButton =
                                form.querySelector(
                                    "[type='submit']"
                                );


                            if (
                                submitButton
                            ) {

                                submitButton.disabled =
                                    true;


                                submitButton.dataset.oldText =
                                    submitButton.innerHTML;


                                submitButton.innerHTML =
                                    `
                                    <span
                                        class="spinner-border spinner-border-sm me-1"
                                    ></span>
                                    Saving...
                                    `;
                            }


                            try {

                                const data =
                                    await request(
                                        form.action ||
                                        location.href,
                                        {
                                            method:
                                                String(
                                                    form.method ||
                                                    "POST"
                                                ).toUpperCase(),

                                            body:
                                                formData
                                        }
                                    );


                                showAlert(
                                    "success",
                                    "Success",
                                    data.message ||
                                    "Customer updated successfully."
                                );


                                const modal =
                                    $("#customerActionModal");


                                if (
                                    modal &&
                                    typeof bootstrap !==
                                    "undefined"
                                ) {

                                    bootstrap.Modal
                                        .getOrCreateInstance(
                                            modal
                                        )
                                        .hide();
                                }


                                await refreshAll();

                                refreshSelectionCount();

                            } catch (error) {

                                showAlert(
                                    "error",
                                    "Error",
                                    error.message
                                );

                            } finally {

                                if (
                                    submitButton
                                ) {

                                    submitButton.disabled =
                                        false;


                                    submitButton.innerHTML =
                                        submitButton.dataset.oldText ||
                                        "Save";
                                }
                            }
                        }
                    );
                }
            );
    }


    /*
    |--------------------------------------------------------------------------
    | BULK ACTION POPUPS
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    ".bulk-action-popup"
                );


            if (!button) {
                return;
            }


            event.preventDefault();


            const url =
                button.dataset.url;


            if (!url) {
                return;
            }


            openPopup(
                url,
                button.dataset.title ||
                "Bulk Customer Action",
                true
            );
        }
    );


    /*
    |--------------------------------------------------------------------------
    | BULK RECHARGE
    |--------------------------------------------------------------------------
    */

    $("#bulkRechargeBtn")
        ?.addEventListener(
            "click",
            event => {

                event.preventDefault();


                openPopup(
                    "/api/customers/bulk/recharge",
                    "Bulk Recharge",
                    true
                );
            }
        );


    /*
    |--------------------------------------------------------------------------
    | BULK FLOATING PANEL
    |--------------------------------------------------------------------------
    */

    $("#bulkFloatingToggle")
        ?.addEventListener(
            "click",
            event => {

                event.preventDefault();


                if (
                    !selectedIds().length
                ) {

                    showAlert(
                        "warning",
                        "No Customer Selected",
                        "Please select at least one customer."
                    );

                    return;
                }


                $("#bulkFloatingPanel")
                    ?.classList.toggle(
                        "show"
                    );
            }
        );


    /*
    |--------------------------------------------------------------------------
    | ADD CUSTOMER
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    ".action-popup[data-url]"
                );


            if (!button) {
                return;
            }


            if (
                button.classList.contains(
                    "bulk-action-popup"
                )
            ) {

                return;
            }


            event.preventDefault();


            openPopup(
                button.dataset.url,
                button.dataset.title ||
                "Customer Action",
                false
            );
        }
    );


    /*
    |--------------------------------------------------------------------------
    | SINGLE EDIT
    |--------------------------------------------------------------------------
    */

    async function editCustomer(id) {

        try {

            const data =
                await request(
                    `/api/customers/${id}`,
                    {
                        method:
                            "GET",

                        headers: {
                            Accept:
                                "application/json"
                        }
                    }
                );


            const customer =
                data.customer ||
                data;


            const actionModal =
                getActionModal();


            if (!actionModal) {

                return;
            }


            const {
                modal,
                body
            } =
                actionModal;


            const label =
                $("#customerActionModalLabel");


            if (label) {

                label.textContent =
                    "Edit Customer";
            }


            const modalTitle =
                $(".modal-title", modal);


            if (modalTitle) {

                modalTitle.textContent =
                    "Edit Customer";
            }


            body.innerHTML = `

                <form
                    method="post"
                    action="/api/customers/${id}"
                >

                    <input
                        type="hidden"
                        name="csrf_token"
                        value="${escapeHtml(
                            csrfToken()
                        )}"
                    >


                    <div class="modal-body">

                        <div class="row g-3">

                            <div class="col-md-6">

                                <label class="form-label">
                                    Customer ID
                                </label>

                                <input
                                    class="form-control"
                                    name="customer_id"
                                    value="${escapeHtml(
                                        customer.customer_id
                                    )}"
                                >

                            </div>


                            <div class="col-md-6">

                                <label class="form-label">
                                    Name
                                </label>

                                <input
                                    class="form-control"
                                    name="name"
                                    required
                                    value="${escapeHtml(
                                        customer.name
                                    )}"
                                >

                            </div>


                            <div class="col-md-6">

                                <label class="form-label">
                                    Phone
                                </label>

                                <input
                                    class="form-control"
                                    name="phone"
                                    value="${escapeHtml(
                                        customer.phone
                                    )}"
                                >

                            </div>


                            <div class="col-md-6">

                                <label class="form-label">
                                    PPPoE Username
                                </label>

                                <input
                                    class="form-control"
                                    name="pppoe_username"
                                    value="${escapeHtml(
                                        customer.pppoe_username
                                    )}"
                                >

                            </div>


                            <div class="col-md-6">

                                <label class="form-label">
                                    PPPoE Password
                                </label>

                                <input
                                    class="form-control"
                                    name="pppoe_password"
                                    value="${escapeHtml(
                                        customer.pppoe_password
                                    )}"
                                >

                            </div>


                            <div class="col-md-6">

                                <label class="form-label">
                                    Monthly Bill
                                </label>

                                <input
                                    class="form-control"
                                    type="number"
                                    step="0.01"
                                    name="monthly_bill"
                                    value="${escapeHtml(
                                        customer.monthly_bill
                                    )}"
                                >

                            </div>


                            <div class="col-md-6">

                                <label class="form-label">
                                    Balance
                                </label>

                                <input
                                    class="form-control"
                                    type="number"
                                    step="0.01"
                                    name="balance"
                                    value="${escapeHtml(
                                        customer.balance
                                    )}"
                                >

                            </div>


                            <div class="col-md-6">

                                <label class="form-label">
                                    Status
                                </label>

                                <select
                                    class="form-select"
                                    name="status"
                                >

                                    ${
                                        [
                                            "Active",
                                            "Expired",
                                            "Inactive",
                                            "Suspended",
                                            "Disabled",
                                            "Pending"
                                        ]
                                            .map(
                                                status =>
                                                    `
                                                    <option
                                                        value="${status}"
                                                        ${
                                                            String(
                                                                customer.status
                                                            ) ===
                                                            status
                                                                ? "selected"
                                                                : ""
                                                        }
                                                    >
                                                        ${status}
                                                    </option>
                                                    `
                                            )
                                            .join("")
                                    }

                                </select>

                            </div>


                            <div class="col-12">

                                <label class="form-label">
                                    Address
                                </label>

                                <textarea
                                    class="form-control"
                                    name="address"
                                    rows="2"
                                >${escapeHtml(
                                    customer.address
                                )}</textarea>

                            </div>


                            <div class="col-md-6">

                                <label class="form-label">
                                    Billing Cycle
                                </label>

                                <input
                                    class="form-control"
                                    type="datetime-local"
                                    name="billing_cycle"
                                    value="${toDateTimeLocal(
                                        customer.billing_cycle
                                    )}"
                                >

                            </div>


                            <div class="col-md-6">

                                <label class="form-label">
                                    Promise Date
                                </label>

                                <input
                                    class="form-control"
                                    type="datetime-local"
                                    name="promise_date"
                                    value="${toDateTimeLocal(
                                        customer.promise_date
                                    )}"
                                >

                            </div>


                            <div class="col-md-6">

                                <label class="form-label">
                                    Payment Status
                                </label>

                                <select
                                    class="form-select"
                                    name="payment_status"
                                >

                                    <option
                                        value="paid"
                                        ${
                                            customer.payment_status ===
                                            "paid"
                                                ? "selected"
                                                : ""
                                        }
                                    >
                                        Paid
                                    </option>


                                    <option
                                        value="unpaid"
                                        ${
                                            customer.payment_status !==
                                            "paid"
                                                ? "selected"
                                                : ""
                                        }
                                    >
                                        Unpaid
                                    </option>

                                </select>

                            </div>


                            <div class="col-md-6">

                                <label class="form-label">
                                    Auto Connection
                                </label>

                                <select
                                    class="form-select"
                                    name="auto_connection"
                                >

                                    <option
                                        value="1"
                                        ${
                                            number(
                                                customer.auto_connection
                                            ) !== 0
                                                ? "selected"
                                                : ""
                                        }
                                    >
                                        ON
                                    </option>


                                    <option
                                        value="0"
                                        ${
                                            number(
                                                customer.auto_connection
                                            ) === 0
                                                ? "selected"
                                                : ""
                                        }
                                    >
                                        OFF
                                    </option>

                                </select>

                            </div>

                        </div>

                    </div>


                    <div class="modal-footer">

                        <button
                            type="button"
                            class="btn btn-secondary"
                            data-bs-dismiss="modal"
                        >
                            Cancel
                        </button>


                        <button
                            type="submit"
                            class="btn btn-primary"
                        >
                            Save Changes
                        </button>

                    </div>

                </form>
            `;


            const form =
                body.querySelector(
                    "form"
                );


            if (form) {

                form.addEventListener(
                    "submit",
                    async event => {

                        event.preventDefault();


                        const formData =
                            new FormData(
                                form
                            );


                        const data =
                            {};


                        formData.forEach(
                            (value, key) => {

                                if (
                                    key ===
                                    "csrf_token"
                                ) {

                                    return;
                                }


                                data[key] =
                                    value;
                            }
                        );


                        try {

                            const result =
                                await request(
                                    `/api/customers/${id}`,
                                    {
                                        method:
                                            "PUT",

                                        body:
                                            data
                                    }
                                );


                            showAlert(
                                "success",
                                "Success",
                                result.message ||
                                "Customer updated successfully."
                            );


                            if (
                                typeof bootstrap !==
                                "undefined"
                            ) {

                                bootstrap.Modal
                                    .getOrCreateInstance(
                                        modal
                                    )
                                    .hide();
                            }


                            await refreshAll();

                        } catch (error) {

                            showAlert(
                                "error",
                                "Error",
                                error.message
                            );
                        }
                    }
                );
            }


            if (
                typeof bootstrap !==
                "undefined"
            ) {

                bootstrap.Modal
                    .getOrCreateInstance(
                        modal
                    )
                    .show();
            }

        } catch (error) {

            showAlert(
                "error",
                "Unable to Open Customer",
                error.message
            );
        }
    }


    /*
    |--------------------------------------------------------------------------
    | SINGLE RECHARGE
    |--------------------------------------------------------------------------
    */

    function openRecharge(id) {

        openPopup(
            `/api/customers/${id}/recharge`,
            "Recharge Customer",
            false
        );
    }


    /*
    |--------------------------------------------------------------------------
    | SINGLE CONNECTION
    |--------------------------------------------------------------------------
    */

    async function toggleConnection(
        id,
        button
    ) {

        const customer =
            currentCustomers.find(
                item =>
                    Number(item.id) ===
                    Number(id)
            );


        if (!customer) {

            return;
        }


        const enabled =
            number(
                customer.auto_connection
            ) !== 0;


        const endpoint =
            enabled
                ? `/api/customers/${id}/connection_off`
                : `/api/customers/${id}/connection_on`;


        try {

            button.disabled =
                true;


            const data =
                await request(
                    endpoint,
                    {
                        method:
                            "POST",

                        body:
                            {}
                    }
                );


            showAlert(
                "success",
                "Success",
                data.message ||
                (
                    enabled
                        ? "Connection disabled."
                        : "Connection enabled."
                )
            );


            await refreshAll();

        } catch (error) {

            showAlert(
                "error",
                "Connection Error",
                error.message
            );

        } finally {

            button.disabled =
                false;
        }
    }


    /*
    |--------------------------------------------------------------------------
    | SINGLE DELETE
    |--------------------------------------------------------------------------
    */

    async function deleteCustomer(id) {

        let confirmed =
            false;


        if (
            typeof Swal !== "undefined"
        ) {

            const result =
                await Swal.fire({

                    icon:
                        "warning",

                    title:
                        "Delete Customer?",

                    text:
                        "Customers with payment history cannot be deleted.",

                    showCancelButton:
                        true,

                    confirmButtonText:
                        "Delete",

                    cancelButtonText:
                        "Cancel"
                });


            confirmed =
                result.isConfirmed;

        } else {

            confirmed =
                window.confirm(
                    "Delete this customer?"
                );
        }


        if (!confirmed) {

            return;
        }


        let deleteMikrotik =
            false;


        if (
            typeof Swal !== "undefined"
        ) {

            const result =
                await Swal.fire({

                    icon:
                        "question",

                    title:
                        "MikroTik Secret",

                    text:
                        "Remove PPPoE secret from MikroTik too?",

                    showCancelButton:
                        true,

                    confirmButtonText:
                        "Remove Secret",

                    cancelButtonText:
                        "Keep Secret"
                });


            if (
                result.isDismissed
            ) {

                return;
            }


            deleteMikrotik =
                result.isConfirmed;
        }


        try {

            const data =
                await request(
                    `/api/customers/${id}`,
                    {
                        method:
                            "DELETE",

                        body: {
                            delete_mikrotik:
                                deleteMikrotik
                                    ? 1
                                    : 0
                        }
                    }
                );


            showAlert(
                "success",
                "Deleted",
                data.message ||
                "Customer deleted successfully."
            );


            await refreshAll();

        } catch (error) {

            showAlert(
                "error",
                "Delete Failed",
                error.message
            );
        }
    }


    /*
    |--------------------------------------------------------------------------
    | ROW ACTION EVENTS
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "click",
        event => {

            const editButton =
                event.target.closest(
                    ".customer-edit-btn"
                );


            if (editButton) {

                event.preventDefault();


                editCustomer(
                    editButton.dataset.id
                );


                return;
            }


            const rechargeButton =
                event.target.closest(
                    ".customer-recharge-btn"
                );


            if (rechargeButton) {

                event.preventDefault();


                openRecharge(
                    rechargeButton.dataset.id
                );


                return;
            }


            const connectionButton =
                event.target.closest(
                    ".customer-connection-btn"
                );


            if (connectionButton) {

                event.preventDefault();


                toggleConnection(
                    connectionButton.dataset.id,
                    connectionButton
                );


                return;
            }


            const deleteButton =
                event.target.closest(
                    ".customer-delete-btn"
                );


            if (deleteButton) {

                event.preventDefault();


                deleteCustomer(
                    deleteButton.dataset.id
                );
            }
        }
    );


    /*
    |--------------------------------------------------------------------------
    | CSV EXPORT
    |--------------------------------------------------------------------------
    */

    $("#exportCustomersBtn")
        ?.addEventListener(
            "click",
            event => {

                event.preventDefault();


                const params =
                    new URLSearchParams();


                if (currentSearch) {

                    params.set(
                        "search",
                        currentSearch
                    );
                }


                if (currentStatus) {

                    params.set(
                        "status",
                        currentStatus
                    );
                }


                window.location.href =
                    `/api/customers/export/csv?${params.toString()}`;
            }
        );


    /*
    |--------------------------------------------------------------------------
    | CSV TEMPLATE
    |--------------------------------------------------------------------------
    */

    $("#csvTemplateBtn")
        ?.addEventListener(
            "click",
            event => {

                event.preventDefault();


                window.location.href =
                    "/api/customers/import/template";
            }
        );


    /*
    |--------------------------------------------------------------------------
    | CSV IMPORT
    |--------------------------------------------------------------------------
    */

    $("#csvImportForm")
        ?.addEventListener(
            "submit",
            async event => {

                event.preventDefault();


                const form =
                    event.currentTarget;


                const file =
                    $("#csv_file");


                const message =
                    $("#csvImportMessage");


                if (
                    !file?.files?.length
                ) {

                    if (message) {

                        message.innerHTML = `
                            <div class="alert alert-warning">
                                Please select a CSV file.
                            </div>
                        `;
                    }


                    return;
                }


                const formData =
                    new FormData(
                        form
                    );


                if (
                    csrfToken() &&
                    !formData.has(
                        "csrf_token"
                    )
                ) {

                    formData.append(
                        "csrf_token",
                        csrfToken()
                    );
                }


                const submit =
                    $("#csvImportSubmit");


                if (submit) {

                    submit.disabled =
                        true;


                    submit.dataset.oldText =
                        submit.innerHTML;


                    submit.innerHTML =
                        `
                        <span
                            class="spinner-border spinner-border-sm me-1"
                        ></span>
                        Importing...
                        `;
                }


                try {

                    const data =
                        await request(
                            form.action ||
                            "/api/customers/import",
                            {
                                method:
                                    "POST",

                                body:
                                    formData
                            }
                        );


                    if (message) {

                        message.innerHTML = `
                            <div class="alert alert-success">
                                ${escapeHtml(
                                    data.message ||
                                    "CSV imported successfully."
                                )}
                            </div>
                        `;
                    }


                    await refreshAll();

                } catch (error) {

                    if (message) {

                        message.innerHTML = `
                            <div class="alert alert-danger">
                                ${escapeHtml(
                                    error.message
                                )}
                            </div>
                        `;
                    }

                } finally {

                    if (submit) {

                        submit.disabled =
                            false;


                        submit.innerHTML =
                            submit.dataset.oldText ||
                            "Import";
                    }
                }
            }
        );


    /*
    |--------------------------------------------------------------------------
    | LOAD ROUTERS
    |--------------------------------------------------------------------------
    */

    async function loadRouters(select) {

        if (!select) {
            return;
        }


        try {

            const data =
                await request(
                    "/api/customers/routers",
                    {
                        method:
                            "GET",

                        headers: {
                            Accept:
                                "application/json"
                        }
                    }
                );


            const routers =
                Array.isArray(
                    data.routers
                )
                    ? data.routers
                    : [];


            select.innerHTML =
                `
                <option value="">
                    Select MikroTik
                </option>
                ` +
                routers
                    .map(
                        router =>
                            `
                            <option
                                value="${escapeHtml(
                                    router.id
                                )}"
                            >
                                ${escapeHtml(
                                    router.name ||
                                    `Router #${router.id}`
                                )}
                            </option>
                            `
                    )
                    .join("");

        } catch (error) {

            console.error(
                "ROUTER LOAD:",
                error
            );
        }
    }


    /*
    |--------------------------------------------------------------------------
    | LOAD PACKAGES
    |--------------------------------------------------------------------------
    */

    async function loadPackages(
        select,
        routerId = ""
    ) {

        if (!select) {
            return;
        }


        select.innerHTML = `
            <option value="">
                Loading packages...
            </option>
        `;


        try {

            const query =
                routerId
                    ? `?router_id=${encodeURIComponent(
                        routerId
                    )}`
                    : "";


            const data =
                await request(
                    `/api/customers/packages${query}`,
                    {
                        method:
                            "GET",

                        headers: {
                            Accept:
                                "application/json"
                        }
                    }
                );


            const packages =
                Array.isArray(
                    data.packages
                )
                    ? data.packages
                    : [];


            select.innerHTML =
                `
                <option value="">
                    Select Package
                </option>
                ` +
                packages
                    .map(
                        pkg =>
                            `
                            <option
                                value="${escapeHtml(
                                    pkg.id
                                )}"
                                data-price="${escapeHtml(
                                    pkg.price
                                )}"
                            >
                                ${escapeHtml(
                                    pkg.package_name
                                )}
                                ${
                                    pkg.price !==
                                    undefined &&
                                    pkg.price !==
                                    null
                                        ? ` - ${money(
                                            pkg.price
                                        )}`
                                        : ""
                                }
                            </option>
                            `
                    )
                    .join("");

        } catch (error) {

            console.error(
                "PACKAGE LOAD:",
                error
            );


            select.innerHTML = `
                <option value="">
                    Unable to load packages
                </option>
            `;
        }
    }


    /*
    |--------------------------------------------------------------------------
    | ROUTER -> PACKAGE
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "change",
        event => {

            const routerSelect =
                event.target.closest(
                    "[name='mikrotik_id'], #router_id"
                );


            if (!routerSelect) {
                return;
            }


            const root =
                event.target.closest(
                    "form, .modal-body, .customer-action-form"
                ) ||
                document;


            const packageSelect =
                root.querySelector(
                    "[name='package_id'], #package_id"
                );


            if (packageSelect) {

                loadPackages(
                    packageSelect,
                    routerSelect.value
                );
            }
        }
    );


    /*
    |--------------------------------------------------------------------------
    | INITIAL POPUP SELECT LOADING
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    ".action-popup"
                );


            if (!button) {
                return;
            }


            setTimeout(
                async () => {

                    const root =
                        $("#customerActionModal");


                    if (!root) {
                        return;
                    }


                    const routerSelect =
                        root.querySelector(
                            "[name='mikrotik_id'], #router_id"
                        );


                    if (routerSelect) {

                        await loadRouters(
                            routerSelect
                        );
                    }


                    const packageSelect =
                        root.querySelector(
                            "[name='package_id'], #package_id"
                        );


                    if (packageSelect) {

                        const routerValue =
                            routerSelect?.value ||
                            "";


                        await loadPackages(
                            packageSelect,
                            routerValue
                        );
                    }

                },
                100
            );
        }
    );


    /*
    |--------------------------------------------------------------------------
    | PUBLIC API
    |--------------------------------------------------------------------------
    */

    window.CustomerModule = {

        request,

        selected:
            selectedIds,

        loadCustomers,

        loadSummary,

        refresh:
            refreshAll,

        openPopup,

        bindForms
    };


    /*
    |--------------------------------------------------------------------------
    | INITIAL LOAD
    |--------------------------------------------------------------------------
    */

    refreshSelectionCount();

    refreshAll();

});