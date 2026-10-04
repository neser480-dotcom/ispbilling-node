"use strict";

document.addEventListener(
"DOMContentLoaded",
() => {

    /*
    |--------------------------------------------------------------------------
    | STATE
    |--------------------------------------------------------------------------
    */

    let currentPage = 1;
    let currentLimit = 100;
    let currentSearch = "";
    let currentStatus = "";

    let searchTimer = null;

    /*
    |--------------------------------------------------------------------------
    | HELPERS
    |--------------------------------------------------------------------------
    */

    function getElement(id) {
        return document.getElementById(id);
    }

    function csrfToken() {

        const meta =
            document.querySelector(
                'meta[name="csrf-token"]'
            );

        if (meta && meta.content) {
            return meta.content;
        }

        const input =
            document.getElementById(
                "csrfTokenInput"
            );

        return input
            ? input.value
            : "";
    }

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

    function number(value) {

        const n =
            Number(value);

        return Number.isFinite(n)
            ? n
            : 0;
    }

    function money(value) {

        return number(value)
            .toLocaleString(
                "en-US",
                {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }
            );
    }

    function onlyDigits(value) {

        return String(
            value || ""
        ).replace(
            /\D/g,
            ""
        );
    }

    function formatDate(value) {

        if (!value) {
            return "—";
        }

        const date =
            new Date(
                String(value)
                    .replace(
                        " ",
                        "T"
                    )
            );

        if (
            Number.isNaN(
                date.getTime()
            )
        ) {
            return escapeHtml(
                value
            );
        }

        const year =
            date.getFullYear();

        const month =
            String(
                date.getMonth() + 1
            ).padStart(
                2,
                "0"
            );

        const day =
            String(
                date.getDate()
            ).padStart(
                2,
                "0"
            );

        let hour =
            date.getHours();

        const minute =
            String(
                date.getMinutes()
            ).padStart(
                2,
                "0"
            );

        const ampm =
            hour >= 12
                ? "PM"
                : "AM";

        hour =
            hour % 12 || 12;

        hour =
            String(hour)
                .padStart(
                    2,
                    "0"
                );

        return (
            `${year}/${month}/${day} ` +
            `${hour}:${minute} ${ampm}`
        );
    }

    /*
    |--------------------------------------------------------------------------
    | TOAST
    |--------------------------------------------------------------------------
    */

    function showSuccess(message) {

        if (
            typeof Swal !==
            "undefined"
        ) {
            Swal.fire({
                toast: true,
                position: "top-end",
                icon: "success",
                title: message,
                showConfirmButton: false,
                timer: 2200,
                timerProgressBar: true
            });

            return;
        }

        alert(message);
    }

    function showError(message) {

        if (
            typeof Swal !==
            "undefined"
        ) {
            Swal.fire({
                toast: true,
                position: "top-end",
                icon: "error",
                title: message,
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true
            });

            return;
        }

        alert(message);
    }

    /*
    |--------------------------------------------------------------------------
    | CUSTOMER ACTION URL
    |--------------------------------------------------------------------------
    |
    | CUSTOMER API prefix:
    | /api/customers
    |
    */

    function actionUrl(
        action,
        id
    ) {

        return (
            `/api/customers/${action}` +
            `?id=${encodeURIComponent(id)}`
        );
    }

    /*
    |--------------------------------------------------------------------------
    | ACTION MENU
    |--------------------------------------------------------------------------
    */

    function renderActionMenu(customer) {

        const id =
            customer.id;

        const phone =
            onlyDigits(
                customer.phone
            );

let html = `
    <div class="dropdown">
        <button
            type="button"
            class="btn btn-sm btn-light"
            data-bs-toggle="dropdown"
            aria-expanded="false"
            title="Actions"
            style="
                border: 0;
                background: transparent;
                font-size: 20px;
                font-weight: 700;
                line-height: 1;
                padding: 4px 8px;
            ">
            ...
        </button>

        <ul class="dropdown-menu dropdown-menu-end">
`;

        html += `
            <li>
                <a
                    href="${actionUrl(
                        "profile",
                        id
                    )}"
                    class="dropdown-item action-popup"
                    data-url="${actionUrl(
                        "profile",
                        id
                    )}"
                    data-title="Customer Profile">
                    <i class="fa-solid fa-user me-2"></i>
                    Profile
                </a>
            </li>
        `;

        html += `
            <li>
                <a
                    href="javascript:void(0)"
                    class="dropdown-item recharge-single-btn"
                    data-id="${escapeHtml(id)}"
                    data-customer-id="${escapeHtml(customer.customer_id)}"
                    data-name="${escapeHtml(customer.name)}"
                    data-pppoe="${escapeHtml(customer.pppoe_username)}"
                    data-mobile="${escapeHtml(customer.phone)}"
                    data-monthly="${escapeHtml(customer.display_bill)}"
                    data-package="${escapeHtml(customer.display_package)}"
                    data-balance="${escapeHtml(customer.balance)}">
                    <i class="fa-solid fa-bolt me-2"></i>
                    Recharge
                </a>
            </li>
        `;

        html += `
            <li>
                <a
                    href="javascript:void(0)"
                    class="dropdown-item edit-customer-btn"
                    data-id="${escapeHtml(id)}">
                    <i class="fa-solid fa-pen me-2"></i>
                    Edit
                </a>
            </li>
        `;

        html += `
            <li>
                <a
                    href="${actionUrl(
                        "report",
                        id
                    )}"
                    class="dropdown-item action-popup"
                    data-url="${actionUrl(
                        "report",
                        id
                    )}"
                    data-title="Customer Report">
                    <i class="fa-solid fa-file-lines me-2"></i>
                    Report
                </a>
            </li>
        `;

        html += `
            <li>
                <a
                    href="${actionUrl(
                        "note",
                        id
                    )}"
                    class="dropdown-item action-popup"
                    data-url="${actionUrl(
                        "note",
                        id
                    )}"
                    data-title="Customer Note">
                    <i class="fa-solid fa-note-sticky me-2"></i>
                    Note
                </a>
            </li>
        `;

        html += `
            <li>
                <a
                    href="${actionUrl(
                        "message",
                        id
                    )}"
                    class="dropdown-item action-popup"
                    data-url="${actionUrl(
                        "message",
                        id
                    )}"
                    data-title="Customer Message">
                    <i class="fa-solid fa-message me-2"></i>
                    Message
                </a>
            </li>
        `;

        html += `
            <li>
                <a
                    href="${actionUrl(
                        "transfer",
                        id
                    )}"
                    class="dropdown-item action-popup"
                    data-url="${actionUrl(
                        "transfer",
                        id
                    )}"
                    data-title="Transfer Customer">
                    <i class="fa-solid fa-right-left me-2"></i>
                    Transfer
                </a>
            </li>
        `;

        html += `
            <li>
                <a
                    href="${actionUrl(
                        "reseller",
                        id
                    )}"
                    class="dropdown-item action-popup"
                    data-url="${actionUrl(
                        "reseller",
                        id
                    )}"
                    data-title="Reseller">
                    <i class="fa-solid fa-users me-2"></i>
                    Reseller
                </a>
            </li>
        `;

        html += `
            <li>
                <a
                    href="${actionUrl(
                        "support-ticket",
                        id
                    )}"
                    class="dropdown-item action-popup"
                    data-url="${actionUrl(
                        "support-ticket",
                        id
                    )}"
                    data-title="Support Ticket">
                    <i class="fa-solid fa-ticket me-2"></i>
                    Support Ticket
                </a>
            </li>
        `;

        html += `
            <li>
                <a
                    href="${actionUrl(
                        "reset-password",
                        id
                    )}"
                    class="dropdown-item action-popup"
                    data-url="${actionUrl(
                        "reset-password",
                        id
                    )}"
                    data-title="Reset Password">
                    <i class="fa-solid fa-key me-2"></i>
                    Reset Password
                </a>
            </li>
        `;

        html += `
            <li>
                <a
                    href="${actionUrl(
                        "activity-log",
                        id
                    )}"
                    class="dropdown-item action-popup"
                    data-url="${actionUrl(
                        "activity-log",
                        id
                    )}"
                    data-title="Activity Log">
                    <i class="fa-solid fa-clock-rotate-left me-2"></i>
                    Activity Log
                </a>
            </li>
        `;

        if (phone) {

            html += `
                <li>
                    <a
                        href="https://wa.me/${phone}"
                        target="_blank"
                        rel="noopener"
                        class="dropdown-item">
                        <i class="fa-brands fa-whatsapp me-2"></i>
                        WhatsApp
                    </a>
                </li>
            `;
        }

        html += `
                <li>
                    <hr class="dropdown-divider">
                </li>

                <li>
                    <a
                        href="javascript:void(0)"
                        class="dropdown-item text-danger delete-customer-btn"
                        data-id="${escapeHtml(id)}"
                        data-name="${escapeHtml(customer.name)}">
                        <i class="fa-solid fa-trash me-2"></i>
                        Delete
                    </a>
                </li>
            </ul>
        </div>
        `;

        return html;
    }

    /*
    |--------------------------------------------------------------------------
    | STATUS BADGE
    |--------------------------------------------------------------------------
    */

    function renderStatus(status) {

        const value =
            String(
                status || "inactive"
            ).toLowerCase();

        const label =
            value
                .charAt(0)
                .toUpperCase() +
            value.slice(1);

        let cls =
            "bg-secondary";

        if (
            value === "active"
        ) {
            cls =
                "bg-success";
        } else if (
            value === "expired"
        ) {
            cls =
                "bg-danger";
        } else if (
            value === "inactive"
        ) {
            cls =
                "bg-secondary";
        } else if (
            value === "pending"
        ) {
            cls =
                "bg-warning text-dark";
        }

        return `
            <span class="badge ${cls}">
                ${escapeHtml(label)}
            </span>
        `;
    }

    /*
    |--------------------------------------------------------------------------
    | PAYMENT BADGE
    |--------------------------------------------------------------------------
    */

    function renderPaymentStatus(
        status
    ) {

        const value =
            String(
                status || "paid"
            ).toLowerCase();

        if (
            value === "paid"
        ) {
            return `
                <span class="badge bg-success">
                    Paid
                </span>
            `;
        }

        return `
            <span class="badge bg-danger">
                ${escapeHtml(
                    value
                        .charAt(0)
                        .toUpperCase() +
                    value.slice(1)
                )}
            </span>
        `;
    }

    /*
    |--------------------------------------------------------------------------
    | DAY LEFT
    |--------------------------------------------------------------------------
    */

    function renderDayLeft(
        dayLeft
    ) {

        if (
            dayLeft === null ||
            dayLeft === undefined ||
            dayLeft === ""
        ) {
            return `
                <span class="cm-dayleft-na">
                    —
                </span>
            `;
        }

        dayLeft =
            Number(dayLeft);

        if (
            !Number.isFinite(dayLeft)
        ) {
            return `
                <span class="cm-dayleft-na">
                    —
                </span>
            `;
        }

        if (dayLeft < 0) {

            return `
                <span class="cm-dayleft cm-dayleft-over">
                    ${Math.abs(dayLeft)} days overdue
                </span>
            `;
        }

        return `
            <span class="cm-dayleft">
                ${dayLeft} days
            </span>
        `;
    }

    /*
    |--------------------------------------------------------------------------
    | CUSTOMER ROW
    |--------------------------------------------------------------------------
    */

    function renderCustomerRow(
        customer
    ) {

        const id =
            customer.id;

        const name =
            customer.name || "—";

        const pppoe =
            customer.pppoe_username ||
            "—";

        const phone =
            customer.phone || "—";

        const address =
            customer.address || "—";

        const packageName =
            customer.display_package ||
            "—";

        const bill =
            number(
                customer.display_bill
            );

        const balance =
            number(
                customer.balance
            );

        const billingCycle =
            customer.billing_cycle;

        const promiseDate =
            customer.promise_date;

        return `
            <tr>

                <td>
                    <input
                        type="checkbox"
                        class="form-check-input customer-checkbox"
                        name="customer_ids[]"
                        value="${escapeHtml(id)}"
                        data-name="${escapeHtml(name)}"
                        data-pppoe="${escapeHtml(pppoe)}"
                        data-package="${escapeHtml(packageName)}"
                        data-monthly="${escapeHtml(bill)}">
                </td>

                <td class="cm-id">
                    ${escapeHtml(
                        customer.customer_id ||
                        id
                    )}
                </td>

                <td>
                    <div class="fw-semibold">
                        ${escapeHtml(name)}
                    </div>

                    <div class="small text-muted">
                        <i class="fa-solid fa-user me-1"></i>
                        ${escapeHtml(pppoe)}
                    </div>
                </td>

                <td>
                    <div>
                        <i class="fa-solid fa-phone me-1"></i>
                        ${escapeHtml(phone)}
                    </div>

                    <div class="small text-muted">
                        <i class="fa-solid fa-location-dot me-1"></i>
                        ${escapeHtml(address)}
                    </div>
                </td>

                <td class="cm-package">
                    ${escapeHtml(packageName)}
                </td>

                <td>
                    <div class="fw-semibold">
                        ৳${money(bill)}
                    </div>

                    <div class="small text-muted">
                        Balance:
                        <span class="fw-semibold">
                            ৳${money(balance)}
                        </span>
                    </div>
                </td>

                <td>
                    <div>
                        ${formatDate(
                            billingCycle
                        )}
                    </div>

                    <div class="small text-muted">
                        Promise:
                        ${formatDate(
                            promiseDate
                        )}
                    </div>
                </td>

                <td>
                    ${renderDayLeft(
                        customer.day_left
                    )}
                </td>

                <td>
                    <div>
                        ${renderPaymentStatus(
                            customer.payment_status
                        )}
                    </div>

                    <div class="mt-1">
                        ${renderStatus(
                            customer.status
                        )}
                    </div>
                </td>

                <td>
                    ${renderActionMenu(
                        customer
                    )}
                </td>

            </tr>
        `;
    }

    /*
    |--------------------------------------------------------------------------
    | LOADING
    |--------------------------------------------------------------------------
    */

    function showTableLoading() {

        const body =
            getElement(
                "customerTableBody"
            );

        if (!body) {
            return;
        }

        body.innerHTML = `
            <tr>
                <td
                    colspan="10"
                    class="text-center py-5">

                    <div
                        class="spinner-border"
                        role="status">
                    </div>

                    <div class="mt-2 text-muted">
                        Loading customers...
                    </div>

                </td>
            </tr>
        `;
    }

    /*
    |--------------------------------------------------------------------------
    | EMPTY
    |--------------------------------------------------------------------------
    */

    function showEmptyCustomers() {

        const body =
            getElement(
                "customerTableBody"
            );

        if (!body) {
            return;
        }

        body.innerHTML = `
            <tr>
                <td
                    colspan="10"
                    class="text-center py-5">

                    <i
                        class="fa-solid fa-users-slash fa-2x text-muted mb-2">
                    </i>

                    <div class="text-muted">
                        No customers found.
                    </div>

                </td>
            </tr>
        `;
    }

    /*
    |--------------------------------------------------------------------------
    | LOAD SUMMARY
    |--------------------------------------------------------------------------
    */

    async function loadSummary() {

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

        try {

            const response =
                await fetch(
                    `/api/customers/summary?${params.toString()}`,
                    {
                        credentials:
                            "same-origin",
                        headers: {
                            "Accept":
                                "application/json"
                        }
                    }
                );

            const contentType =
                response.headers.get(
                    "content-type"
                ) || "";

            if (
                !contentType.includes(
                    "application/json"
                )
            ) {
                const text =
                    await response.text();

                throw new Error(
                    text
                        .replace(
                            /<[^>]*>/g,
                            " "
                        )
                        .replace(
                            /\s+/g,
                            " "
                        )
                        .trim()
                        .slice(
                            0,
                            300
                        ) ||
                    `Invalid server response (${response.status}).`
                );
            }

            const result =
                await response.json();

            if (
                !response.ok ||
                !result.success
            ) {
                throw new Error(
                    result.message ||
                    "Failed to load summary."
                );
            }

            const data =
                result.data || {};

            const totalCustomers =
                getElement(
                    "totalCustomers"
                );

            const totalBill =
                getElement(
                    "totalBill"
                );

            const totalBalance =
                getElement(
                    "totalBalance"
                );

            if (totalCustomers) {
                totalCustomers.textContent =
                    number(
                        data.total_customer
                    ).toLocaleString(
                        "en-US"
                    );
            }

            if (totalBill) {
                totalBill.textContent =
                    "৳" +
                    money(
                        data.total_bill
                    );
            }

            if (totalBalance) {
                totalBalance.textContent =
                    "৳" +
                    money(
                        data.total_balance
                    );
            }

        } catch (error) {

            console.error(
                "Summary error:",
                error
            );
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
            getElement(
                "customerPagination"
            );

        if (!container) {
            return;
        }

        const page =
            Number(
                pagination?.page || 1
            );

        const totalPages =
            Number(
                pagination?.totalPages || 1
            );

        const limit =
            Number(
                pagination?.limit || 0
            );

        container.innerHTML = "";

        if (
            totalPages <= 1 ||
            limit === 0
        ) {
            return;
        }

        function addPage(
            pageNumber,
            label,
            disabled = false,
            active = false
        ) {

            const li =
                document.createElement(
                    "li"
                );

            li.className =
                "page-item" +
                (disabled
                    ? " disabled"
                    : "") +
                (active
                    ? " active"
                    : "");

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

                        currentPage =
                            pageNumber;

                        loadCustomers();
                    }
                );
            }

            li.appendChild(
                button
            );

            container.appendChild(
                li
            );
        }

        addPage(
            page - 1,
            "Previous",
            page <= 1
        );

        let start =
            Math.max(
                1,
                page - 2
            );

        let end =
            Math.min(
                totalPages,
                page + 2
            );

        if (
            page <= 3
        ) {
            end =
                Math.min(
                    totalPages,
                    5
                );
        }

        if (
            page >=
            totalPages - 2
        ) {
            start =
                Math.max(
                    1,
                    totalPages - 4
                );
        }

        if (start > 1) {

            addPage(
                1,
                "1"
            );

            if (start > 2) {

                const li =
                    document.createElement(
                        "li"
                    );

                li.className =
                    "page-item disabled";

                li.innerHTML = `
                    <span class="page-link">
                        ...
                    </span>
                `;

                container.appendChild(
                    li
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

        if (
            end < totalPages
        ) {

            if (
                end <
                totalPages - 1
            ) {

                const li =
                    document.createElement(
                        "li"
                    );

                li.className =
                    "page-item disabled";

                li.innerHTML = `
                    <span class="page-link">
                        ...
                    </span>
                `;

                container.appendChild(
                    li
                );
            }

            addPage(
                totalPages,
                String(totalPages)
            );
        }

        addPage(
            page + 1,
            "Next",
            page >= totalPages
        );
    }

    /*
    |--------------------------------------------------------------------------
    | RANGE
    |--------------------------------------------------------------------------
    */

    function updateRange(
        pagination
    ) {

        const info =
            getElement(
                "paginationInfo"
            );

        if (!info) {
            return;
        }

        const total =
            number(
                pagination?.total
            );

        const from =
            number(
                pagination?.from
            );

        const to =
            number(
                pagination?.to
            );

        if (!total) {

            info.textContent =
                "Showing 0 of 0";

            return;
        }

        info.textContent =
            `Showing ${from.toLocaleString()} - ` +
            `${to.toLocaleString()} of ` +
            `${total.toLocaleString()}`;
    }

    /*
    |--------------------------------------------------------------------------
    | LOAD CUSTOMERS
    |--------------------------------------------------------------------------
    */

    async function loadCustomers() {

        showTableLoading();

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

        try {

            const response =
                await fetch(
                    `/api/customers/?${params.toString()}`,
                    {
                        credentials:
                            "same-origin",
                        headers: {
                            "Accept":
                                "application/json"
                        }
                    }
                );

            const contentType =
                response.headers.get(
                    "content-type"
                ) || "";

            if (
                !contentType.includes(
                    "application/json"
                )
            ) {

                const text =
                    await response.text();

                throw new Error(
                    text
                        .replace(
                            /<[^>]*>/g,
                            " "
                        )
                        .replace(
                            /\s+/g,
                            " "
                        )
                        .trim()
                        .slice(
                            0,
                            500
                        ) ||
                    `Invalid server response (${response.status}).`
                );
            }

            const result =
                await response.json();

            if (
                !response.ok ||
                !result.success
            ) {
                throw new Error(
                    result.message ||
                    "Failed to load customers."
                );
            }

            const customers =
                Array.isArray(
                    result.data
                )
                    ? result.data
                    : [];

            const body =
                getElement(
                    "customerTableBody"
                );

            if (!body) {
                return;
            }

            if (!customers.length) {
                showEmptyCustomers();
            } else {

                body.innerHTML =
                    customers
                        .map(
                            renderCustomerRow
                        )
                        .join("");
            }

            renderPagination(
                result.pagination
            );

            updateRange(
                result.pagination
            );

            updateSelectedCount();

            await loadSummary();

        } catch (error) {

            console.error(
                "Customer list error:",
                error
            );

            const body =
                getElement(
                    "customerTableBody"
                );

            if (body) {

                body.innerHTML = `
                    <tr>
                        <td
                            colspan="10"
                            class="text-center text-danger py-5">

                            <i
                                class="fa-solid fa-triangle-exclamation fa-2x mb-2">
                            </i>

                            <div>
                                ${escapeHtml(
                                    error.message
                                )}
                            </div>

                            <button
                                type="button"
                                class="btn btn-sm btn-outline-primary mt-3"
                                id="retryCustomerLoad">
                                Retry
                            </button>

                        </td>
                    </tr>
                `;

                const retry =
                    getElement(
                        "retryCustomerLoad"
                    );

                if (retry) {
                    retry.addEventListener(
                        "click",
                        loadCustomers
                    );
                }
            }

            showError(
                error.message ||
                "Failed to load customers."
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | SELECTED CUSTOMER IDS
    |--------------------------------------------------------------------------
    */

    function getSelectedCustomerIds() {

        return Array.from(
            document.querySelectorAll(
                'input[name="customer_ids[]"]:checked'
            )
        ).map(
            checkbox =>
                checkbox.value
        );
    }

    function updateSelectedCount() {

        const selected =
            getSelectedCustomerIds();

        const count =
            selected.length;

        const selectAll =
            getElement(
                "selectAll"
            );

        const toggle =
            document.querySelector(
                ".bulk-floating-toggle"
            );

        const panel =
            document.querySelector(
                ".bulk-floating-panel"
            );

        const countElements =
            document.querySelectorAll(
                ".selected-customer-count"
            );

        countElements.forEach(
            element => {
                element.textContent =
                    count;
            }
        );

        const selectedCountElement =
            getElement(
                "selectedCount"
            );

        if (selectedCountElement) {
            selectedCountElement.textContent =
                count;
        }

        if (toggle) {

            toggle.classList.toggle(
                "active",
                count > 0
            );
        }

        if (panel) {

            panel.classList.toggle(
                "show",
                count > 0
            );
        }

        if (selectAll) {

            const boxes =
                document.querySelectorAll(
                    ".customer-checkbox"
                );

            selectAll.checked =
                boxes.length > 0 &&
                count === boxes.length;

            selectAll.indeterminate =
                count > 0 &&
                count < boxes.length;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | SELECT ALL
    |--------------------------------------------------------------------------
    */

    const selectAll =
        getElement(
            "selectAll"
        );

    if (selectAll) {

        selectAll.addEventListener(
            "change",
            function () {

                document
                    .querySelectorAll(
                        ".customer-checkbox"
                    )
                    .forEach(
                        checkbox => {
                            checkbox.checked =
                                this.checked;
                        }
                    );

                updateSelectedCount();
            }
        );
    }

    document.addEventListener(
        "change",
        event => {

            if (
                event.target.matches(
                    ".customer-checkbox"
                )
            ) {
                updateSelectedCount();
            }
        }
    );

    /*
    |--------------------------------------------------------------------------
    | BULK FLOATING PANEL
    |--------------------------------------------------------------------------
    */

    const bulkToggle =
        document.querySelector(
            ".bulk-floating-toggle"
        );

    const bulkPanel =
        document.querySelector(
            ".bulk-floating-panel"
        );

    if (bulkToggle) {

        bulkToggle.addEventListener(
            "click",
            event => {

                event.stopPropagation();

                const ids =
                    getSelectedCustomerIds();

                if (!ids.length) {

                    showError(
                        "Please select at least one customer."
                    );

                    return;
                }

                if (bulkPanel) {

                    bulkPanel.classList.toggle(
                        "show"
                    );
                }
            }
        );
    }

    document.addEventListener(
        "click",
        event => {

            if (
                bulkPanel &&
                bulkToggle &&
                !bulkPanel.contains(
                    event.target
                ) &&
                !bulkToggle.contains(
                    event.target
                )
            ) {
                bulkPanel.classList.remove(
                    "show"
                );
            }
        }
    );

    /*
    |--------------------------------------------------------------------------
    | BULK ACTION POPUP
    |--------------------------------------------------------------------------
    */

    function openBulkAction(
        url,
        title
    ) {

        const ids =
            getSelectedCustomerIds();

        if (!ids.length) {

            showError(
                "Please select at least one customer."
            );

            return;
        }

        const separator =
            url.includes("?")
                ? "&"
                : "?";

        loadPopup(
            `${url}${separator}ids=${encodeURIComponent(ids.join(","))}`,
            title,
            {
                bulk: true
            }
        );
    }

    /*
    |--------------------------------------------------------------------------
    | UNIVERSAL POPUP
    |--------------------------------------------------------------------------
    */

    const actionModal =
        getElement(
            "customerActionModal"
        );

    let actionModalInstance =
        null;

    if (
        actionModal &&
        typeof bootstrap !==
        "undefined"
    ) {

        actionModalInstance =
            bootstrap.Modal.getOrCreateInstance(
                actionModal
            );
    }

    async function loadPopup(
        url,
        title = "Action",
        options = {}
    ) {

        if (!actionModal) {
            return;
        }

        const titleElement =
            actionModal.querySelector(
                ".modal-title"
            );

        const bodyElement =
            actionModal.querySelector(
                ".modal-body"
            );

        if (titleElement) {
            titleElement.textContent =
                title;
        }

        if (bodyElement) {

            bodyElement.innerHTML = `
                <div
                    class="text-center py-5">

                    <div
                        class="spinner-border"
                        role="status">
                    </div>

                    <div
                        class="mt-2 text-muted">
                        Loading...
                    </div>

                </div>
            `;
        }

        actionModal.classList.toggle(
            "bulk-popup",
            Boolean(options.bulk)
        );

        if (actionModalInstance) {
            actionModalInstance.show();
        }

        try {

            const response =
                await fetch(
                    url,
                    {
                        credentials:
                            "same-origin",
                        headers: {
                            "X-Requested-With":
                                "XMLHttpRequest",
                            "Accept":
                                "text/html, application/json"
                        }
                    }
                );

            const html =
                await response.text();

            if (!response.ok) {
                throw new Error(
                    `Server returned ${response.status}`
                );
            }

            if (bodyElement) {
                bodyElement.innerHTML =
                    html;
            }

            activatePopupForms(
                bodyElement
            );

            /*
            |--------------------------------------------------------------------------
            | RUN INLINE SCRIPTS
            |--------------------------------------------------------------------------
            */

            if (bodyElement) {

                const scripts =
                    Array.from(
                        bodyElement.querySelectorAll(
                            "script"
                        )
                    );

                scripts.forEach(
                    oldScript => {

                        const newScript =
                            document.createElement(
                                "script"
                            );

                        Array.from(
                            oldScript.attributes
                        ).forEach(
                            attribute => {

                                newScript.setAttribute(
                                    attribute.name,
                                    attribute.value
                                );
                            }
                        );

                        newScript.textContent =
                            oldScript.textContent;

                        oldScript.replaceWith(
                            newScript
                        );
                    }
                );
            }

        } catch (error) {

            console.error(
                "Popup error:",
                error
            );

            if (bodyElement) {

                bodyElement.innerHTML = `
                    <div
                        class="alert alert-danger">
                        ${escapeHtml(
                            error.message
                        )}
                    </div>
                `;
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | POPUP FORMS
    |--------------------------------------------------------------------------
    */

    function activatePopupForms(
        container
    ) {

        if (!container) {
            return;
        }

        container
            .querySelectorAll("form")
            .forEach(
                form => {

                    if (
                        form.dataset.ajaxBound ===
                        "1"
                    ) {
                        return;
                    }

                    form.dataset.ajaxBound =
                        "1";

                    form.addEventListener(
                        "submit",
                        async event => {

                            event.preventDefault();

                            const formData =
                                new FormData(
                                    form
                                );

                            const token =
                                csrfToken();

                            if (
                                token &&
                                !formData.has(
                                    "_csrf"
                                ) &&
                                !formData.has(
                                    "csrf_token"
                                )
                            ) {
                                formData.append(
                                    "csrf_token",
                                    token
                                );
                            }

                            const selected =
                                getSelectedCustomerIds();

                            if (
                                selected.length &&
                                !formData.has(
                                    "customer_ids[]"
                                )
                            ) {

                                selected.forEach(
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
                                    '[type="submit"]'
                                );

                            if (submitButton) {
                                submitButton.disabled =
                                    true;
                            }

                            try {

                                const response =
                                    await fetch(
                                        form.action ||
                                        window.location.href,
                                        {
                                            method:
                                                "POST",
                                            body:
                                                formData,
                                            credentials:
                                                "same-origin",
                                            headers: {
                                                "X-Requested-With":
                                                    "XMLHttpRequest",
                                                "Accept":
                                                    "application/json"
                                            }
                                        }
                                    );

                                const contentType =
                                    response.headers.get(
                                        "content-type"
                                    ) || "";

                                if (
                                    contentType.includes(
                                        "application/json"
                                    )
                                ) {

                                    const result =
                                        await response.json();

                                    if (
                                        !response.ok ||
                                        !result.success
                                    ) {
                                        throw new Error(
                                            result.message ||
                                            "Action failed."
                                        );
                                    }

                                    showSuccess(
                                        result.message ||
                                        "Action completed."
                                    );

                                    if (
                                        actionModalInstance
                                    ) {
                                        actionModalInstance.hide();
                                    }

                                    await loadCustomers();

                                } else {

                                    const text =
                                        await response.text();

                                    throw new Error(
                                        text
                                            .replace(
                                                /<[^>]*>/g,
                                                " "
                                            )
                                            .replace(
                                                /\s+/g,
                                                " "
                                            )
                                            .trim()
                                            .slice(
                                                0,
                                                500
                                            ) ||
                                        "Server returned an invalid response."
                                    );
                                }

                            } catch (error) {

                                console.error(
                                    "Form action error:",
                                    error
                                );

                                showError(
                                    error.message
                                );

                            } finally {

                                if (submitButton) {
                                    submitButton.disabled =
                                        false;
                                }
                            }
                        }
                    );
                }
            );
    }

    /*
    |--------------------------------------------------------------------------
    | ACTION POPUP
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "click",
        event => {

            const link =
                event.target.closest(
                    ".action-popup"
                );

            if (!link) {
                return;
            }

            event.preventDefault();

            const url =
                link.dataset.url ||
                link.getAttribute(
                    "href"
                );

            const title =
                link.dataset.title ||
                "Customer Action";

            if (url) {

                loadPopup(
                    url,
                    title
                );
            }
        }
    );

    /*
    |--------------------------------------------------------------------------
    | BULK ACTION POPUP
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
                button.dataset.url ||
                button.getAttribute(
                    "href"
                );

            const title =
                button.dataset.title ||
                button.textContent.trim() ||
                "Bulk Action";

            if (url) {

                openBulkAction(
                    url,
                    title
                );
            }
        }
    );

    /*
    |--------------------------------------------------------------------------
    | BULK RECHARGE
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    "#bulkRechargeBtn, .bulk-recharge-btn"
                );

            if (!button) {
                return;
            }

            event.preventDefault();

            const ids =
                getSelectedCustomerIds();

            if (!ids.length) {

                showError(
                    "Please select at least one customer."
                );

                return;
            }

            if (
                typeof window.openBulkRecharge ===
                "function"
            ) {

                window.openBulkRecharge(
                    ids
                );

                return;
            }

            openBulkAction(
                "/api/customers/bulk-recharge",
                "Bulk Recharge"
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | SINGLE DELETE
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "click",
        async event => {

            const button =
                event.target.closest(
                    ".delete-customer-btn"
                );

            if (!button) {
                return;
            }

            event.preventDefault();

            const id =
                button.dataset.id;

            const name =
                button.dataset.name ||
                "this customer";

            if (!id) {
                return;
            }

            let confirmed = false;

            if (
                typeof Swal !==
                "undefined"
            ) {

                const result =
                    await Swal.fire({
                        icon: "warning",
                        title:
                            "Delete Customer?",
                        html:
                            `Are you sure you want to delete <strong>${escapeHtml(name)}</strong>?`,
                        showCancelButton: true,
                        confirmButtonText:
                            "Delete",
                        cancelButtonText:
                            "Cancel",
                        reverseButtons: true
                    });

                confirmed =
                    result.isConfirmed;

            } else {

                confirmed =
                    window.confirm(
                        `Delete ${name}?`
                    );
            }

            if (!confirmed) {
                return;
            }

            const form =
                document.createElement(
                    "form"
                );

            form.method =
                "POST";

            form.action =
                "/api/customers/delete";

            form.style.display =
                "none";

            const idInput =
                document.createElement(
                    "input"
                );

            idInput.type =
                "hidden";

            idInput.name =
                "id";

            idInput.value =
                id;

            form.appendChild(
                idInput
            );

            const token =
                csrfToken();

            if (token) {

                const tokenInput =
                    document.createElement(
                        "input"
                    );

                tokenInput.type =
                    "hidden";

                tokenInput.name =
                    "csrf_token";

                tokenInput.value =
                    token;

                form.appendChild(
                    tokenInput
                );
            }

            document.body.appendChild(
                form
            );

            form.submit();
        }
    );

    /*
    |--------------------------------------------------------------------------
    | BULK DELETE
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    ".bulk-delete-btn"
                );

            if (!button) {
                return;
            }

            event.preventDefault();

            const ids =
                getSelectedCustomerIds();

            if (!ids.length) {

                showError(
                    "Please select at least one customer."
                );

                return;
            }

            const url =
                button.dataset.url ||
                "/api/customers/bulk/delete";

            openBulkAction(
                url,
                "Delete Customers"
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | SEARCH
    |--------------------------------------------------------------------------
    */

    const searchInput =
        getElement(
            "customerSearch"
        );

    if (searchInput) {

        searchInput.addEventListener(
            "input",
            function () {

                clearTimeout(
                    searchTimer
                );

                searchTimer =
                    setTimeout(
                        () => {

                            currentSearch =
                                this.value.trim();

                            currentPage =
                                1;

                            loadCustomers();

                        },
                        350
                    );
            }
        );

        searchInput.addEventListener(
            "keydown",
            event => {

                if (
                    event.key ===
                    "Enter"
                ) {

                    event.preventDefault();

                    clearTimeout(
                        searchTimer
                    );

                    currentSearch =
                        searchInput.value.trim();

                    currentPage =
                        1;

                    loadCustomers();
                }
            }
        );
    }

    /*
    |--------------------------------------------------------------------------
    | CLEAR SEARCH
    |--------------------------------------------------------------------------
    */

    const clearSearch =
        getElement(
            "clearSearchBtn"
        );

    if (clearSearch) {

        clearSearch.addEventListener(
            "click",
            () => {

                if (searchInput) {
                    searchInput.value =
                        "";
                }

                currentSearch =
                    "";

                currentPage =
                    1;

                loadCustomers();
            }
        );
    }

    /*
    |--------------------------------------------------------------------------
    | STATUS + LIMIT
    |--------------------------------------------------------------------------
    */

    const statusSelect =
        getElement(
            "customerStatus"
        );

    const limitSelect =
        getElement(
            "customerLimit"
        );

    const applyFilter =
        getElement(
            "applyCustomerFilter"
        );

    if (applyFilter) {

        applyFilter.addEventListener(
            "click",
            () => {

                currentStatus =
                    statusSelect
                        ? statusSelect.value
                        : "";

                currentLimit =
                    limitSelect
                        ? Number(
                            limitSelect.value
                        )
                        : 100;

                if (
                    ![
                        100,
                        200,
                        500,
                        5000,
                        0
                    ].includes(
                        currentLimit
                    )
                ) {
                    currentLimit =
                        100;
                }

                currentPage =
                    1;

                loadCustomers();
            }
        );
    }

    /*
    |--------------------------------------------------------------------------
    | REFRESH
    |--------------------------------------------------------------------------
    */

    const refreshButton =
        getElement(
            "refreshCustomersBtn"
        );

    if (refreshButton) {

        refreshButton.addEventListener(
            "click",
            () => {

                loadCustomers();
            }
        );
    }

    /*
    |--------------------------------------------------------------------------
    | EDIT CUSTOMER
    |--------------------------------------------------------------------------
    */

    async function openEditCustomer(
        id
    ) {

        if (!id) {
            return;
        }

        try {

            const response =
                await fetch(
                    `/api/customers/${encodeURIComponent(id)}`,
                    {
                        credentials:
                            "same-origin",
                        headers: {
                            "Accept":
                                "application/json"
                        }
                    }
                );

            const contentType =
                response.headers.get(
                    "content-type"
                ) || "";

            if (
                !contentType.includes(
                    "application/json"
                )
            ) {

                const text =
                    await response.text();

                throw new Error(
                    text
                        .replace(
                            /<[^>]*>/g,
                            " "
                        )
                        .replace(
                            /\s+/g,
                            " "
                        )
                        .trim()
                        .slice(
                            0,
                            500
                        ) ||
                    `Invalid server response (${response.status}).`
                );
            }

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
                result.customer ||
                result.data;

            if (!customer) {
                throw new Error(
                    "Customer data not found."
                );
            }

            const fields = {
                edit_db_id:
                    customer.id,

                edit_customer_id:
                    customer.customer_id,

                edit_name:
                    customer.name,

                edit_phone:
                    customer.phone,

                edit_address:
                    customer.address,

                edit_nid_no:
                    customer.nid_no,

                edit_birth_date:
                    customer.birth_date,

                edit_email:
                    customer.email,

                edit_monthly_bill:
                    customer.monthly_bill,

                edit_balance:
                    customer.balance,

                edit_pppoe_username:
                    customer.pppoe_username,

                edit_pppoe_password:
                    customer.pppoe_password,

                edit_billing_cycle:
                    customer.billing_cycle,

                edit_promise_date:
                    customer.promise_date,

                edit_connection_fee:
                    customer.connection_fee,

                edit_billing_type:
                    customer.billing_type,

                edit_payment_status:
                    customer.payment_status,

                edit_status:
                    customer.status,

                edit_reference_name:
                    customer.reference_name,

                edit_reference_mobile:
                    customer.reference_mobile,

                edit_comments:
                    customer.comments
            };

            Object.entries(
                fields
            ).forEach(
                ([fieldId, value]) => {

                    const element =
                        getElement(
                            fieldId
                        );

                    if (!element) {
                        return;
                    }

                    element.value =
                        value ?? "";
                }
            );

            const header =
                getElement(
                    "modalCustomerNameHeader"
                );

            if (header) {
                header.textContent =
                    customer.name ||
                    customer.customer_id ||
                    "Customer";
            }

            const modal =
                getElement(
                    "customerActionModal"
                );

            if (
                modal &&
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

            console.error(
                "Edit customer error:",
                error
            );

            showError(
                error.message
            );
        }
    }

    document.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    ".edit-customer-btn"
                );

            if (!button) {
                return;
            }

            event.preventDefault();

            openEditCustomer(
                button.dataset.id
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | PACKAGE PRICE / PROFILE
    |--------------------------------------------------------------------------
    */

    function updatePackageFields(
        packageSelect,
        billId,
        profileId
    ) {

        if (!packageSelect) {
            return;
        }

        const option =
            packageSelect.options[
                packageSelect.selectedIndex
            ];

        if (!option) {
            return;
        }

        const price =
            option.dataset.price;

        const profile =
            option.dataset.profile;

        const bill =
            getElement(
                billId
            );

        const profileElement =
            getElement(
                profileId
            );

        if (
            bill &&
            price !== undefined
        ) {
            bill.value =
                price;
        }

        if (
            profileElement &&
            profile !== undefined
        ) {
            profileElement.value =
                profile;
        }
    }

    document.addEventListener(
        "change",
        event => {

            if (
                event.target.matches(
                    "#package_id"
                )
            ) {

                updatePackageFields(
                    event.target,
                    "monthly_bill",
                    "profile"
                );
            }

            if (
                event.target.matches(
                    "#edit_package_id"
                )
            ) {

                updatePackageFields(
                    event.target,
                    "edit_monthly_bill",
                    "edit_profile"
                );
            }
        }
    );

    /*
    |--------------------------------------------------------------------------
    | CSV EXPORT
    |--------------------------------------------------------------------------
    */

    const exportButton =
        getElement(
            "exportCustomersBtn"
        );

    if (exportButton) {

        exportButton.addEventListener(
            "click",
            () => {

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
                    `/api/customers/csv/export?${params.toString()}`;
            }
        );
    }

    /*
    |--------------------------------------------------------------------------
    | CSV TEMPLATE
    |--------------------------------------------------------------------------
    */

    const templateButton =
        getElement(
            "csvTemplateBtn"
        );

    if (templateButton) {

        templateButton.addEventListener(
            "click",
            () => {

                window.location.href =
                    "/api/customers/csv/template";
            }
        );
    }

    /*
    |--------------------------------------------------------------------------
    | INITIAL LOAD
    |--------------------------------------------------------------------------
    */

    updateSelectedCount();

    loadCustomers();

}


);
