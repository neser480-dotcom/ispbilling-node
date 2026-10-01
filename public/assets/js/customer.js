"use strict";

/*
|--------------------------------------------------------------------------
| ISP BILLING - CUSTOMER LIST
|--------------------------------------------------------------------------
| File:
| public/assets/js/customer.js
|
| Handles:
| - Customer loading
| - Customer summary
| - Search
| - Status filter
| - Limit
| - Pagination
| - Select all
| - Bulk selection bar
| - Refresh
| - Customer action modal
| - Customer row rendering
|--------------------------------------------------------------------------
*/

document.addEventListener("DOMContentLoaded", function () {

    /*
    |--------------------------------------------------------------------------
    | ELEMENTS
    |--------------------------------------------------------------------------
    */

    const tableBody =
        document.getElementById("customerTableBody");

    const searchInput =
        document.getElementById("customerSearch");

    const statusSelect =
        document.getElementById("customerStatus");

    const limitSelect =
        document.getElementById("customerLimit");

    const applyFilterBtn =
        document.getElementById("applyCustomerFilter");

    const refreshBtn =
        document.getElementById("refreshCustomersBtn");

    const clearSearchBtn =
        document.getElementById("clearSearchBtn");

    const selectAllCheckbox =
        document.getElementById("selectAllCustomers");

    const bulkActionBar =
        document.getElementById("bulkActionBar");

    const selectedCustomerCount =
        document.getElementById("selectedCustomerCount");

    const clearSelectionBtn =
        document.getElementById("clearSelectionBtn");

    const pagination =
        document.getElementById("customerPagination");

    const paginationInfo =
        document.getElementById("paginationInfo");

    const customerRangeText =
        document.getElementById("customerRangeText");

    const totalCustomers =
        document.getElementById("totalCustomers");

    const totalBill =
        document.getElementById("totalBill");

    const totalBalance =
        document.getElementById("totalBalance");

    const actionModalElement =
        document.getElementById("customerActionModal");

    const actionModalTitle =
        document.getElementById("customerActionModalTitle");

    const actionModalBody =
        document.getElementById("customerActionModalBody");


    /*
    |--------------------------------------------------------------------------
    | STATE
    |--------------------------------------------------------------------------
    */

    let currentPage = 1;

    let currentLimit =
        Number(limitSelect?.value || 100);

    let currentSearch = "";

    let currentStatus = "";

    let loadingCustomers = false;


    /*
    |--------------------------------------------------------------------------
    | HELPERS
    |--------------------------------------------------------------------------
    */

    function escapeHtml(value) {

        if (value === null || value === undefined) {
            return "";
        }

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    function formatMoney(value) {

        const amount =
            Number(value || 0);

        return amount.toLocaleString("en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
    }


    function formatDate(value) {

        if (!value) {
            return "-";
        }

        const date =
            new Date(value);

        if (Number.isNaN(date.getTime())) {
            return escapeHtml(value);
        }

        const day =
            String(date.getDate()).padStart(2, "0");

        const month =
            String(date.getMonth() + 1).padStart(2, "0");

        const year =
            date.getFullYear();

        const hours =
            String(date.getHours()).padStart(2, "0");

        const minutes =
            String(date.getMinutes()).padStart(2, "0");

        return `${day}-${month}-${year} ${hours}:${minutes}`;
    }


    function formatAddress(value) {

        if (!value) {
            return "-";
        }

        return escapeHtml(value);
    }


    function dayLeftClass(dayLeft) {

        const days =
            Number(dayLeft);

        if (days < 0) {
            return "text-danger fw-bold";
        }

        if (days <= 3) {
            return "text-warning fw-bold";
        }

        return "text-success fw-bold";
    }


    function getCustomerId(customer) {

        return (
            customer.id ??
            customer.customer_id ??
            ""
        );
    }


    function getBill(customer) {

        return Number(
            customer.display_bill ??
            customer.monthly_bill ??
            0
        );
    }


    function getPackage(customer) {

        return (
            customer.display_package ??
            customer.package_name ??
            "-"
        );
    }


    function getPaymentStatus(customer) {

        return String(
            customer.payment_status ||
            ""
        ).toLowerCase();
    }


    function getCustomerStatus(customer) {

        return String(
            customer.status ||
            ""
        ).toLowerCase();
    }


    /*
    |--------------------------------------------------------------------------
    | RENDER CUSTOMER ROW
    |--------------------------------------------------------------------------
    */

    function renderCustomerRow(customer) {

        const id =
            getCustomerId(customer);

        const customerId =
            customer.customer_id ??
            id;

        const name =
            customer.name ||
            "-";

        const pppoe =
            customer.pppoe_username ||
            customer.pppoe ||
            "-";

        const phone =
            customer.phone ||
            "-";

        const address =
            customer.address ||
            "";

        const packageName =
            getPackage(customer);

        const bill =
            getBill(customer);

        const balance =
            Number(customer.balance || 0);

        const billingCycle =
            customer.billing_cycle;

        const promiseDate =
            customer.promise_date;

        const dayLeft =
            Number(customer.day_left ?? 0);

        const paymentStatus =
            getPaymentStatus(customer);

        const customerStatus =
            getCustomerStatus(customer);

        const autoConnection =
            Number(customer.auto_connection ?? 1);

        /*
        |--------------------------------------------------------------------------
        | ID COLOR
        |--------------------------------------------------------------------------
        */

        const idClass =
            autoConnection === 0 || dayLeft < 0
                ? "text-danger fw-bold"
                : "fw-bold";


        /*
        |--------------------------------------------------------------------------
        | PAYMENT STATUS
        |--------------------------------------------------------------------------
        */

        let paymentHtml = "";

        if (paymentStatus === "paid") {

            paymentHtml = `
                <span class="badge bg-success">
                    Paid
                </span>
            `;

        } else {

            paymentHtml = `
                <span class="badge bg-danger">
                    Unpaid
                </span>
            `;
        }


        /*
        |--------------------------------------------------------------------------
        | CUSTOMER STATUS
        |--------------------------------------------------------------------------
        */

        let statusHtml = "";

        if (
            customerStatus === "active" ||
            customerStatus === "1"
        ) {

            statusHtml = `
                <span class="badge bg-success">
                    Active
                </span>
            `;

        } else if (
            customerStatus === "inactive" ||
            customerStatus === "0"
        ) {

            statusHtml = `
                <span class="badge bg-secondary">
                    Inactive
                </span>
            `;

        } else if (
            customerStatus === "expired"
        ) {

            statusHtml = `
                <span class="badge bg-danger">
                    Expired
                </span>
            `;

        } else {

            statusHtml = `
                <span class="badge bg-secondary">
                    ${escapeHtml(customer.status || "-")}
                </span>
            `;
        }


        /*
        |--------------------------------------------------------------------------
        | BILL / BALANCE
        |--------------------------------------------------------------------------
        */

        const billBalanceHtml = `
            <div class="fw-bold">
                ৳${formatMoney(bill)}
            </div>

            <div class="small text-muted">
                Balance:
                <span class="${
                    balance > 0
                        ? "text-danger fw-bold"
                        : "text-success"
                }">
                    ৳${formatMoney(balance)}
                </span>
            </div>
        `;


        /*
        |--------------------------------------------------------------------------
        | BILLING / PROMISE DATE
        |--------------------------------------------------------------------------
        */

        let billingHtml = "-";

        if (billingCycle) {

            billingHtml = `
                <div>
                    <strong>
                        ${formatDate(billingCycle)}
                    </strong>
                </div>
            `;
        }

        if (promiseDate) {

            billingHtml += `
                <div class="small text-muted">
                    Promise:
                    ${formatDate(promiseDate)}
                </div>
            `;
        }


        /*
        |--------------------------------------------------------------------------
        | DAY LEFT
        |--------------------------------------------------------------------------
        */

        const dayLeftHtml = `
            <span class="${dayLeftClass(dayLeft)}">
                ${dayLeft}
            </span>
        `;


        /*
        |--------------------------------------------------------------------------
        | ACTION MENU
        |--------------------------------------------------------------------------
        */

        const actionHtml = `
            <div class="dropdown">

                <button
                    type="button"
                    class="btn btn-link text-decoration-none fw-bold customer-action-btn"
                    data-bs-toggle="dropdown"
                    aria-expanded="false"
                    data-customer-id="${escapeHtml(id)}"
                    style="
                        font-size:18px;
                        padding:0;
                    "
                >
                    <i class="fa fa-ellipsis"></i>
                </button>

                <ul class="dropdown-menu dropdown-menu-end">

                    <li>
                        <a
                            href="#"
                            class="dropdown-item customer-action-item"
                            data-action="view"
                            data-id="${escapeHtml(id)}"
                        >
                            <i class="fa fa-eye me-2"></i>
                            View
                        </a>
                    </li>

                    <li>
                        <a
                            href="#"
                            class="dropdown-item customer-action-item"
                            data-action="recharge"
                            data-id="${escapeHtml(id)}"
                        >
                            <i class="fa fa-money-bill-wave me-2"></i>
                            Recharge
                        </a>
                    </li>

                    <li>
                        <a
                            href="#"
                            class="dropdown-item customer-action-item"
                            data-action="edit"
                            data-id="${escapeHtml(id)}"
                        >
                            <i class="fa fa-edit me-2"></i>
                            Edit
                        </a>
                    </li>

                    <li>
                        <a
                            href="#"
                            class="dropdown-item customer-action-item"
                            data-action="report"
                            data-id="${escapeHtml(id)}"
                        >
                            <i class="fa fa-file-lines me-2"></i>
                            Report
                        </a>
                    </li>

                </ul>

            </div>
        `;


        /*
        |--------------------------------------------------------------------------
        | ROW
        |--------------------------------------------------------------------------
        */

        return `
            <tr data-customer-id="${escapeHtml(id)}">

                <td class="text-center">
                    <input
                        type="checkbox"
                        class="form-check-input customer-checkbox"
                        name="customer_ids[]"
                        value="${escapeHtml(id)}"
                    >
                </td>

                <td class="text-center">
                    <span class="${idClass}">
                        ${escapeHtml(customerId)}
                    </span>
                </td>

                <td>
                    <div class="fw-semibold">
                        ${escapeHtml(name)}
                    </div>

                    <div class="small text-muted">
                        ${escapeHtml(pppoe)}
                    </div>
                </td>

                <td>
                    <div>
                        ${escapeHtml(phone)}
                    </div>

                    <div class="small text-muted">
                        ${formatAddress(address)}
                    </div>
                </td>

                <td>
                    ${escapeHtml(packageName)}
                </td>

                <td>
                    ${billBalanceHtml}
                </td>

                <td>
                    ${billingHtml}
                </td>

                <td class="text-center">
                    ${dayLeftHtml}
                </td>

                <td class="text-center">

                    <div class="mb-1">
                        ${paymentHtml}
                    </div>

                    <div>
                        ${statusHtml}
                    </div>

                </td>

                <td class="text-center">
                    ${actionHtml}
                </td>

            </tr>
        `;
    }


    /*
    |--------------------------------------------------------------------------
    | LOAD CUSTOMERS
    |--------------------------------------------------------------------------
    */

    async function loadCustomers(page = currentPage) {

        if (loadingCustomers) {
            return;
        }

        loadingCustomers = true;

        currentPage = page;

        if (tableBody) {

            tableBody.innerHTML = `
                <tr>
                    <td
                        colspan="10"
                        class="text-center py-4"
                    >
                        <div class="spinner-border spinner-border-sm me-2"></div>
                        Loading customers...
                    </td>
                </tr>
            `;
        }

        try {

            const params =
                new URLSearchParams();

            params.set(
                "page",
                String(currentPage)
            );

            params.set(
                "limit",
                String(currentLimit)
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


            const response =
                await fetch(
                    `/api/customers?${params.toString()}`,
                    {
                        method: "GET",
                        headers: {
                            "Accept": "application/json"
                        },
                        credentials: "same-origin"
                    }
                );


            const result =
                await response.json();


            if (!response.ok || !result.success) {

                throw new Error(
                    result.message ||
                    "Failed to load customers."
                );
            }


            const customers =
                Array.isArray(result.data)
                    ? result.data
                    : [];


            if (!tableBody) {
                return;
            }


            if (customers.length === 0) {

                tableBody.innerHTML = `
                    <tr>
                        <td
                            colspan="10"
                            class="text-center py-5 text-muted"
                        >
                            No customers found.
                        </td>
                    </tr>
                `;

            } else {

                tableBody.innerHTML =
                    customers
                        .map(renderCustomerRow)
                        .join("");
            }


            renderPagination(
                result.pagination
            );

            updateRangeText(
                result.pagination,
                customers.length
            );

            updateSelectionBar();

            await loadSummary();

        } catch (error) {

            console.error(
                "Customer loading error:",
                error
            );

            if (tableBody) {

                tableBody.innerHTML = `
                    <tr>
                        <td
                            colspan="10"
                            class="text-center py-5"
                        >
                            <div class="text-danger fw-bold mb-2">
                                Failed to load customers.
                            </div>

                            <div class="small text-muted">
                                ${escapeHtml(error.message)}
                            </div>

                            <button
                                type="button"
                                class="btn btn-sm btn-primary mt-3"
                                id="retryCustomerLoad"
                            >
                                <i class="fa fa-refresh me-1"></i>
                                Retry
                            </button>
                        </td>
                    </tr>
                `;

                const retryBtn =
                    document.getElementById(
                        "retryCustomerLoad"
                    );

                if (retryBtn) {

                    retryBtn.addEventListener(
                        "click",
                        function () {
                            loadCustomers(currentPage);
                        }
                    );
                }
            }

        } finally {

            loadingCustomers = false;
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


            const response =
                await fetch(
                    `/api/customers/summary?${params.toString()}`,
                    {
                        method: "GET",
                        headers: {
                            "Accept": "application/json"
                        },
                        credentials: "same-origin"
                    }
                );


            const result =
                await response.json();


            if (!response.ok || !result.success) {
                return;
            }


            const summary =
                result.data || {};


            if (totalCustomers) {

                totalCustomers.textContent =
                    Number(
                        summary.total_customers ??
                        summary.total ??
                        0
                    ).toLocaleString();
            }


            if (totalBill) {

                totalBill.textContent =
                    `৳${formatMoney(
                        summary.total_bill ??
                        summary.total_monthly_bill ??
                        0
                    )}`;
            }


            if (totalBalance) {

                totalBalance.textContent =
                    `৳${formatMoney(
                        summary.total_balance ??
                        0
                    )}`;
            }

        } catch (error) {

            console.error(
                "Customer summary error:",
                error
            );
        }
    }


    /*
    |--------------------------------------------------------------------------
    | PAGINATION
    |--------------------------------------------------------------------------
    */

    function renderPagination(data) {

        if (!pagination) {
            return;
        }

        pagination.innerHTML = "";


        if (!data) {
            return;
        }


        const total =
            Number(
                data.total ??
                data.total_records ??
                0
            );

        const page =
            Number(
                data.page ??
                currentPage
            );

        const limit =
            Number(
                data.limit ??
                currentLimit
            );

        const totalPages =
            Number(
                data.totalPages ??
                data.total_pages ??
                Math.ceil(
                    total / Math.max(limit, 1)
                )
            );


        if (totalPages <= 1) {
            return;
        }


        function addPage(
            pageNumber,
            label,
            disabled = false,
            active = false
        ) {

            const li =
                document.createElement("li");

            li.className =
                `page-item ${
                    disabled ? "disabled" : ""
                } ${
                    active ? "active" : ""
                }`;


            const button =
                document.createElement("button");

            button.type = "button";

            button.className =
                "page-link";

            button.textContent =
                label;


            if (disabled) {

                button.disabled = true;

            } else {

                button.addEventListener(
                    "click",
                    function () {

                        if (
                            pageNumber !== currentPage
                        ) {

                            loadCustomers(
                                pageNumber
                            );
                        }
                    }
                );
            }


            li.appendChild(button);

            pagination.appendChild(li);
        }


        addPage(
            page - 1,
            "‹",
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
                totalPages,
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

            addPage(
                1,
                "1",
                false,
                page === 1
            );

            if (start > 2) {

                addPage(
                    null,
                    "...",
                    true
                );
            }
        }


        for (
            let i = start;
            i <= end;
            i++
        ) {

            addPage(
                i,
                String(i),
                false,
                i === page
            );
        }


        if (end < totalPages) {

            if (end < totalPages - 1) {

                addPage(
                    null,
                    "...",
                    true
                );
            }

            addPage(
                totalPages,
                String(totalPages),
                false,
                page === totalPages
            );
        }


        addPage(
            page + 1,
            "›",
            page >= totalPages
        );
    }


    /*
    |--------------------------------------------------------------------------
    | RANGE TEXT
    |--------------------------------------------------------------------------
    */

    function updateRangeText(
        paginationData,
        loadedCount
    ) {

        if (!paginationData) {
            return;
        }


        const total =
            Number(
                paginationData.total ??
                paginationData.total_records ??
                0
            );

        const page =
            Number(
                paginationData.page ??
                currentPage
            );

        const limit =
            Number(
                paginationData.limit ??
                currentLimit
            );


        if (paginationInfo) {

            const from =
                total === 0
                    ? 0
                    : ((page - 1) * limit) + 1;

            const to =
                Math.min(
                    page * limit,
                    total
                );

            paginationInfo.textContent =
                `Showing ${from}-${to} of ${total}`;
        }


        if (customerRangeText) {

            const from =
                total === 0
                    ? 0
                    : ((page - 1) * limit) + 1;

            const to =
                Math.min(
                    page * limit,
                    total
                );

            customerRangeText.textContent =
                `${from}-${to} / ${total}`;
        }
    }


    /*
    |--------------------------------------------------------------------------
    | SELECTION
    |--------------------------------------------------------------------------
    */

    function getSelectedCheckboxes() {

        return Array.from(
            document.querySelectorAll(
                ".customer-checkbox:checked"
            )
        );
    }


    function updateSelectionBar() {

        const selected =
            getSelectedCheckboxes();


        if (selectedCustomerCount) {

            selectedCustomerCount.textContent =
                selected.length;
        }


        if (bulkActionBar) {

            if (selected.length > 0) {

                bulkActionBar.classList.remove(
                    "d-none"
                );

            } else {

                bulkActionBar.classList.add(
                    "d-none"
                );
            }
        }


        if (selectAllCheckbox) {

            const allCheckboxes =
                document.querySelectorAll(
                    ".customer-checkbox"
                );


            if (allCheckboxes.length === 0) {

                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;

            } else {

                const checkedCount =
                    selected.length;

                selectAllCheckbox.checked =
                    checkedCount ===
                    allCheckboxes.length;

                selectAllCheckbox.indeterminate =
                    checkedCount > 0 &&
                    checkedCount <
                    allCheckboxes.length;
            }
        }
    }


    /*
    |--------------------------------------------------------------------------
    | SELECT ALL
    |--------------------------------------------------------------------------
    */

    if (selectAllCheckbox) {

        selectAllCheckbox.addEventListener(
            "change",
            function () {

                const checked =
                    this.checked;

                document
                    .querySelectorAll(
                        ".customer-checkbox"
                    )
                    .forEach(
                        function (checkbox) {

                            checkbox.checked =
                                checked;
                        }
                    );

                updateSelectionBar();
            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | INDIVIDUAL CHECKBOX
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "change",
        function (event) {

            if (
                event.target &&
                event.target.classList.contains(
                    "customer-checkbox"
                )
            ) {

                updateSelectionBar();
            }
        }
    );


    /*
    |--------------------------------------------------------------------------
    | CLEAR SELECTION
    |--------------------------------------------------------------------------
    */

    if (clearSelectionBtn) {

        clearSelectionBtn.addEventListener(
            "click",
            function () {

                document
                    .querySelectorAll(
                        ".customer-checkbox"
                    )
                    .forEach(
                        function (checkbox) {

                            checkbox.checked =
                                false;
                        }
                    );

                if (selectAllCheckbox) {

                    selectAllCheckbox.checked =
                        false;

                    selectAllCheckbox.indeterminate =
                        false;
                }

                updateSelectionBar();
            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | SEARCH
    |--------------------------------------------------------------------------
    */

    function applyFilters() {

        currentSearch =
            String(
                searchInput?.value || ""
            ).trim();

        currentStatus =
            String(
                statusSelect?.value || ""
            ).trim();

        currentLimit =
            Number(
                limitSelect?.value || 100
            );

        currentPage = 1;

        loadCustomers(1);
    }


    if (applyFilterBtn) {

        applyFilterBtn.addEventListener(
            "click",
            applyFilters
        );
    }


    if (searchInput) {

        searchInput.addEventListener(
            "keydown",
            function (event) {

                if (
                    event.key === "Enter"
                ) {

                    event.preventDefault();

                    applyFilters();
                }
            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | CLEAR SEARCH
    |--------------------------------------------------------------------------
    */

    if (clearSearchBtn) {

        clearSearchBtn.addEventListener(
            "click",
            function () {

                if (searchInput) {
                    searchInput.value = "";
                }

                if (statusSelect) {
                    statusSelect.value = "";
                }

                currentSearch = "";
                currentStatus = "";
                currentPage = 1;

                loadCustomers(1);
            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | LIMIT CHANGE
    |--------------------------------------------------------------------------
    */

    if (limitSelect) {

        limitSelect.addEventListener(
            "change",
            function () {

                currentLimit =
                    Number(
                        this.value || 100
                    );

                currentPage = 1;

                loadCustomers(1);
            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | STATUS CHANGE
    |--------------------------------------------------------------------------
    */

    if (statusSelect) {

        statusSelect.addEventListener(
            "change",
            function () {

                currentStatus =
                    String(
                        this.value || ""
                    ).trim();

                currentPage = 1;

                loadCustomers(1);
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
            function () {

                loadCustomers(
                    currentPage
                );
            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | CUSTOMER ACTIONS
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "click",
        async function (event) {

            const actionItem =
                event.target.closest(
                    ".customer-action-item"
                );


            if (!actionItem) {
                return;
            }


            event.preventDefault();


            const action =
                actionItem.dataset.action;

            const id =
                actionItem.dataset.id;


            if (!id) {
                return;
            }


            /*
            |--------------------------------------------------------------------------
            | VIEW
            |--------------------------------------------------------------------------
            */

            if (action === "view") {

                openCustomerActionModal(
                    "View Customer",
                    `
                        <div class="text-center py-4">
                            <div class="spinner-border"></div>
                            <div class="mt-2">
                                Loading customer...
                            </div>
                        </div>
                    `
                );


                try {

                    const response =
                        await fetch(
                            `/api/customers/${encodeURIComponent(id)}`,
                            {
                                method: "GET",
                                headers: {
                                    "Accept":
                                        "application/json"
                                },
                                credentials:
                                    "same-origin"
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
                            "Failed to load customer."
                        );
                    }


                    const customer =
                        result.data || {};


                    openCustomerActionModal(
                        "Customer Details",
                        `
                            <div class="row g-3">

                                <div class="col-md-6">
                                    <strong>ID</strong>
                                    <div>
                                        ${escapeHtml(
                                            customer.customer_id ??
                                            customer.id ??
                                            "-"
                                        )}
                                    </div>
                                </div>

                                <div class="col-md-6">
                                    <strong>Name</strong>
                                    <div>
                                        ${escapeHtml(
                                            customer.name ||
                                            "-"
                                        )}
                                    </div>
                                </div>

                                <div class="col-md-6">
                                    <strong>PPPoE</strong>
                                    <div>
                                        ${escapeHtml(
                                            customer.pppoe_username ||
                                            "-"
                                        )}
                                    </div>
                                </div>

                                <div class="col-md-6">
                                    <strong>Phone</strong>
                                    <div>
                                        ${escapeHtml(
                                            customer.phone ||
                                            "-"
                                        )}
                                    </div>
                                </div>

                                <div class="col-md-6">
                                    <strong>Package</strong>
                                    <div>
                                        ${escapeHtml(
                                            customer.display_package ||
                                            customer.package_name ||
                                            "-"
                                        )}
                                    </div>
                                </div>

                                <div class="col-md-6">
                                    <strong>Bill</strong>
                                    <div>
                                        ৳${formatMoney(
                                            customer.display_bill ??
                                            customer.monthly_bill ??
                                            0
                                        )}
                                    </div>
                                </div>

                                <div class="col-md-12">
                                    <strong>Address</strong>
                                    <div>
                                        ${formatAddress(
                                            customer.address
                                        )}
                                    </div>
                                </div>

                            </div>
                        `
                    );

                } catch (error) {

                    openCustomerActionModal(
                        "Customer Details",
                        `
                            <div class="alert alert-danger">
                                ${escapeHtml(
                                    error.message
                                )}
                            </div>
                        `
                    );
                }

                return;
            }


            /*
            |--------------------------------------------------------------------------
            | OTHER ACTIONS
            |--------------------------------------------------------------------------
            */

            let title =
                "Customer Action";

            let message =
                "This action is ready for the customer.";

            if (action === "recharge") {

                title =
                    "Recharge Customer";

                message =
                    `Customer ID: ${escapeHtml(id)}`;
            }

            if (action === "edit") {

                title =
                    "Edit Customer";

                message =
                    `Customer ID: ${escapeHtml(id)}`;
            }

            if (action === "report") {

                title =
                    "Customer Report";

                message =
                    `Customer ID: ${escapeHtml(id)}`;
            }


            openCustomerActionModal(
                title,
                `
                    <div class="py-3">
                        ${message}
                    </div>
                `
            );
        }
    );


    /*
    |--------------------------------------------------------------------------
    | ACTION MODAL
    |--------------------------------------------------------------------------
    */

    function openCustomerActionModal(
        title,
        body
    ) {

        if (
            !actionModalElement ||
            !actionModalTitle ||
            !actionModalBody
        ) {
            return;
        }


        actionModalTitle.textContent =
            title;

        actionModalBody.innerHTML =
            body;


        if (
            typeof bootstrap !== "undefined"
        ) {

            const modal =
                bootstrap.Modal.getOrCreateInstance(
                    actionModalElement
                );

            modal.show();
        }
    }


    /*
    |--------------------------------------------------------------------------
    | INITIAL LOAD
    |--------------------------------------------------------------------------
    */

    loadCustomers(1);

});