"use strict";

(function () {

    let currentPage = 1;
    let currentSearch = "";
    let currentStatus = "";
    let currentLimit = 100;

    let loadingCustomers = false;
    let searchTimer = null;
    let initialized = false;

    /*
    |--------------------------------------------------------------------------
    | SELECTED CUSTOMER IDS
    |--------------------------------------------------------------------------
    | Keeps selected customers even when the table is re-rendered.
    */

    let selectedCustomerIds = new Set();


    /*
    |--------------------------------------------------------------------------
    | HELPERS
    |--------------------------------------------------------------------------
    */

    function number(value) {

        const n = Number(value);

        return Number.isFinite(n) ? n : 0;
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


    function escapeHtml(value) {

        return String(value ?? "").replace(
            /[&<>"']/g,
            function (char) {

                return {
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;"
                }[char];

            }
        );
    }


    function normalizeCustomerLimit(value) {

        const raw =
            String(value ?? "").trim();

        if (
            raw === "all" ||
            raw === "0" ||
            raw === "100000"
        ) {
            return 0;
        }

        const allowed = [
            100,
            200,
            500,
            5000
        ];

        const parsed = Number(raw);

        return allowed.includes(parsed)
            ? parsed
            : 100;
    }


    /*
    |--------------------------------------------------------------------------
    | CSRF
    |--------------------------------------------------------------------------
    */

    function getCsrfToken() {

        const meta =
            document.querySelector(
                'meta[name="csrf-token"]'
            );

        if (
            meta &&
            meta.content
        ) {
            return meta.content.trim();
        }


        const input =
            document.getElementById(
                "csrfTokenInput"
            );

        if (
            input &&
            input.value
        ) {
            return input.value.trim();
        }


        if (
            window.CSRF_TOKEN &&
            typeof window.CSRF_TOKEN === "string"
        ) {
            return window.CSRF_TOKEN.trim();
        }


        return "";
    }


    /*
    |--------------------------------------------------------------------------
    | CUSTOMER FIELD HELPERS
    |--------------------------------------------------------------------------
    */

    function databaseId(customer) {

        return number(
            customer.id ??
            customer.customer_db_id ??
            customer.customerIdDb
        );
    }


    function customerId(customer) {

        return (
            customer.customer_id ??
            customer.customerId ??
            ""
        );
    }


    function customerName(customer) {

        return String(
            customer.name ??
            customer.full_name ??
            customer.customer_name ??
            ""
        ).trim();
    }


    function pppoeUsername(customer) {

        return String(
            customer.pppoe_username ??
            customer.pppoe_name ??
            customer.username ??
            ""
        ).trim();
    }


    function phone(customer) {

        return String(
            customer.phone ??
            customer.mobile ??
            customer.mobile_no ??
            ""
        ).trim();
    }


    function address(customer) {

        return String(
            customer.address ??
            ""
        ).trim();
    }


    function packageDisplay(customer) {

        return String(
            customer.display_package ??
            customer.package_name ??
            customer.package ??
            ""
        ).trim();
    }


    function monthlyBill(customer) {

        return number(
            customer.display_bill ??
            customer.monthly_bill ??
            customer.monthlyBill ??
            0
        );
    }


    function balance(customer) {

        return number(
            customer.balance ??
            0
        );
    }


    function customerStatus(customer) {

        return String(
            customer.status ??
            "Inactive"
        ).trim();
    }


    function paymentStatus(customer) {

        return String(
            customer.payment_status ??
            customer.paymentStatus ??
            "unpaid"
        )
            .trim()
            .toLowerCase();
    }


    /*
    |--------------------------------------------------------------------------
    | STATUS BADGES
    |--------------------------------------------------------------------------
    */

    function taka(value) {

        return number(value).toLocaleString(
            "en-IN",
            {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            }
        );
    }


    function dateTimeDisplay(value) {

        if (!value) {
            return "";
        }

        const date =
            new Date(value);

        if (
            Number.isNaN(
                date.getTime()
            )
        ) {
            return escapeHtml(value);
        }

        const pad = function (n) {
            return String(n).padStart(2, "0");
        };

        let hours =
            date.getHours();

        const suffix =
            hours >= 12
                ? "PM"
                : "AM";

        hours =
            hours % 12 || 12;

        return (
            date.getFullYear() + "/" +
            pad(date.getMonth() + 1) + "/" +
            pad(date.getDate()) + " " +
            pad(hours) + ":" +
            pad(date.getMinutes()) + " " +
            suffix
        );
    }


    function isNewCustomer(customer) {

        const flag =
            customer.is_new ??
            customer.isNew;

        if (
            flag !== undefined &&
            flag !== null &&
            flag !== ""
        ) {

            return (
                flag === true ||
                flag === 1 ||
                flag === "1" ||
                flag === "true"
            );
        }

        const created =
            customer.created_at ??
            customer.createdAt;

        if (!created) {
            return false;
        }

        const time =
            new Date(created).getTime();

        return (
            Number.isFinite(time) &&
            (Date.now() - time) <
            7 * 24 * 60 * 60 * 1000
        );
    }


    function statusBadge(customer) {

        const payment =
            paymentStatus(customer);

        const status =
            customerStatus(customer);

        const paymentClass =
            payment === "paid"
                ? "cl-paid"
                : "cl-unpaid";

        const paymentText =
            payment === "paid"
                ? "paid"
                : "unpaid";

        let statusClass =
            "cl-inactive";

        switch (
            status.toLowerCase()
        ) {

            case "active":
                statusClass = "cl-active";
                break;

            case "expired":
                statusClass = "cl-unpaid";
                break;

            case "suspended":
            case "pending":
                statusClass = "cl-warn";
                break;
        }

        return `
            <div class="cl-badges">

                <span class="cl-badge ${paymentClass}">
                    ${paymentText}
                </span>

                <span class="cl-badge ${statusClass}">
                    ${escapeHtml(
                        (status || "unknown").toLowerCase()
                    )}
                </span>

            </div>
        `;
    }


    /*
    |--------------------------------------------------------------------------
    | DAY LEFT
    |--------------------------------------------------------------------------
    */

    function dayLeftDisplay(customer) {

        const raw =
            customer.day_left ??
            customer.dayLeft ??
            "";

        if (
            raw === "" ||
            raw === null ||
            raw === undefined
        ) {

            return `
                <span class="cl-dayleft-na">
                    N/A
                </span>
            `;
        }

        const value =
            number(raw);

        const title =
            value < 0
                ? Math.abs(value) + " days overdue"
                : value + " day(s) left";

        const tier =
            value <= 0
                ? " cl-dayleft-over"
                : value <= 15
                    ? " cl-dayleft-mid"
                    : " cl-dayleft-high";

        return `
            <span
                class="cl-dayleft${tier}"
                title="${title}"
            >${value}</span>
        `;
    }


    /*
    |--------------------------------------------------------------------------
    | DATE
    |--------------------------------------------------------------------------
    */

    function dateDisplay(value) {

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

            return escapeHtml(value);
        }


        return date.toLocaleDateString();
    }


    function billingDateDisplay(customer) {

        const billing =
            customer.billing_cycle ??
            customer.billing_date ??
            null;

        const promise =
            customer.promise_date ??
            customer.promiseDate ??
            null;

        const lines = [];

        const dl =
            customer.day_left ??
            customer.dayLeft ??
            "";

        const promiseOk =
            dl !== "" &&
            dl !== null &&
            number(dl) > 0;

        if (billing) {

            lines.push(
                `<div>${dateTimeDisplay(billing)}</div>`
            );
        }

        if (promise) {

            lines.push(
                `<div class="cl-promise${promiseOk ? " cl-promise-ok" : ""}">${dateTimeDisplay(promise)}</div>`
            );
        }

        return lines.length
            ? `<div class="cl-dates">${lines.join("")}</div>`
            : "-";
    }


    /*
    |--------------------------------------------------------------------------
    | CONTACT
    |--------------------------------------------------------------------------
    */

    function contactDisplay(customer) {

        const mobile =
            phone(customer);

        const customerAddress =
            address(customer);

        return `
            <div class="cl-contact">

                <div class="cl-line">
                    <i class="fa-solid fa-mobile-screen-button cl-ico-phone"></i>
                    ${escapeHtml(mobile || "N/A")}
                </div>

                <div class="cl-line">
                    <i class="fa-solid fa-location-dot cl-ico-pin"></i>
                    ${escapeHtml(customerAddress || "N/A")}
                </div>

            </div>
        `;
    }


    /*
    |--------------------------------------------------------------------------
    | BILL / BALANCE
    |--------------------------------------------------------------------------
    */

    function billBalanceDisplay(customer) {

        const bal =
            balance(customer);

        return `
            <div>

                <div class="cl-bill">
                    ${taka(
                        monthlyBill(customer)
                    )}
                </div>

                <div class="cl-balance${bal < 0 ? " cl-balance-neg" : ""}">
                    ${taka(bal)}
                </div>

            </div>
        `;
    }


    /*
    |--------------------------------------------------------------------------
    | WHATSAPP
    |--------------------------------------------------------------------------
    */

    function whatsappUrl(customer) {

        let mobile =
            phone(customer)
                .replace(/\D/g, "");

        if (!mobile) {
            return "";
        }


        if (mobile.startsWith("0")) {

            mobile =
                "88" + mobile;

        } else if (
            !mobile.startsWith("88")
        ) {

            mobile =
                "88" + mobile;
        }


        return (
            "https://wa.me/" +
            mobile
        );
    }


    /*
    |--------------------------------------------------------------------------
    | SINGLE ACTION MENU
    |--------------------------------------------------------------------------
    */

    function actionMenu(customer) {

        const id =
            databaseId(customer);


        if (!id) {
            return "-";
        }


        const name =
            customerName(customer) ||
            pppoeUsername(customer) ||
            customerId(customer) ||
            "Customer";

        const displayId =
            customerId(customer);

        const mobile =
            phone(customer);

        const pppoe =
            pppoeUsername(customer);

        const packageName =
            packageDisplay(customer);

        const monthly =
            monthlyBill(customer);

        const customerBalance =
            balance(customer);

        const whatsapp =
            whatsappUrl(customer);


        return `
            <div class="dropdown">

<button
    type="button"
    class="btn btn-link customer-action-trigger"
    data-bs-toggle="dropdown"
    data-bs-auto-close="outside"
    data-bs-popper-config='{"strategy":"fixed"}'
    aria-expanded="false"
    aria-label="Customer actions"
    title="Actions"
>
    <i class="fa-solid fa-ellipsis"></i>
</button>


                <ul class="dropdown-menu dropdown-menu-end shadow-sm">
<li>
                        <a
                            href="#"
                            class="dropdown-item customer-profile-btn"
                            data-id="${id}"
                            data-name="${escapeHtml(name)}"
                        >
                            <i class="fa-regular fa-user me-2"></i>
                            Profile
                        </a>
                    </li><li>
                        <a
                            href="#"
                            class="dropdown-item recharge-single-btn"
                            data-id="${id}"
                            data-customer-id="${escapeHtml(displayId)}"
                            data-name="${escapeHtml(customerName(customer))}"
                            data-pppoe="${escapeHtml(pppoe)}"
                            data-mobile="${escapeHtml(mobile)}"
                            data-monthly="${monthly}"
                            data-package="${escapeHtml(packageName)}"
                            data-balance="${customerBalance}"
                        >
                            <i class="fa-solid fa-money-bill-wave me-2"></i>
                            Recharge
                        </a>
                    </li><li>
                        <a
                            href="#"
                            class="dropdown-item customer-edit-btn"
                            data-id="${id}"
                            data-name="${escapeHtml(name)}"
                        >
                            <i class="fa-regular fa-pen-to-square me-2"></i>
                            Edit
                        </a>
                    </li>
                    <li>
                        <a
                            href="/reports/collection?customer_id=${encodeURIComponent(id)}"
                            class="dropdown-item customer-bill-report-btn"
                            data-id="${id}"
                        >
                            <i class="fa-solid fa-file-lines"></i>
                            Report
                        </a>
                    </li>

                    <li>
                        <a
                            href="/customers/note?id=${encodeURIComponent(id)}"
                            class="dropdown-item customer-note-btn"
                            data-id="${id}"
                        >
                            <i class="fa-regular fa-note-sticky"></i>
                            Note
                        </a>
                    </li>
<li>
                        <a
                            href="#"
                            class="dropdown-item text-danger delete-customer-btn"
                            data-id="${id}"
                            data-name="${escapeHtml(name)}"
                        >
                            <i class="fa-regular fa-trash-can me-2"></i>
                            Delete
                        </a>
                    </li>
                    <li>
                        <a
                            href="/customers/message?id=${encodeURIComponent(id)}"
                            class="dropdown-item customer-message-btn"
                            data-id="${id}"
                        >
                            <i class="fa-regular fa-comment-dots"></i>
                            Message
                        </a>
                    </li>

                    <li>
                        <a
                            href="/customers/reseller?id=${encodeURIComponent(id)}"
                            class="dropdown-item customer-reseller-btn"
                            data-id="${id}"
                        >
                            <i class="fa-solid fa-right-long"></i>
                            Transfer to Reseller
                        </a>
                    </li>

                    <li>
                        <a
                            href="/customers/ticket_add?id=${encodeURIComponent(id)}"
                            class="dropdown-item customer-ticket-btn"
                            data-id="${id}"
                        >
                            <i class="fa-regular fa-life-ring"></i>
                            Open Support Ticket
                        </a>
                    </li>

                    <li>
                        <a
                            href="/customers/invoices?id=${encodeURIComponent(id)}"
                            class="dropdown-item customer-invoice-btn"
                            data-id="${id}"
                        >
                            <i class="fa-regular fa-file"></i>
                            Invoices
                        </a>
                    </li>

                    <li>
                        <a
                            href="/customers/activity_log?id=${encodeURIComponent(id)}"
                            class="dropdown-item customer-activity-log-btn"
                            data-id="${id}"
                        >
                            <i class="fa-regular fa-clock"></i>
                            Activity Log
                        </a>
                    </li>

                    <li>
                        <a
                            href="/customers/data_usage?id=${encodeURIComponent(id)}"
                            class="dropdown-item customer-usage-btn"
                            data-id="${id}"
                        >
                            <i class="fa-regular fa-file-lines"></i>
                            Data Usage Report
                        </a>
                    </li>

+                    <li><hr class="dropdown-divider"></li>

                    <li>
                        <a
                            href="/customers/transfer?id=${encodeURIComponent(id)}"
                            class="dropdown-item customer-transfer-btn"
                            data-id="${id}"
                        >
                            <i class="fa-solid fa-right-left"></i>
                            Transfer
                        </a>
                    </li>

                    <li>
                        <a
                            href="/customers/reset_password?id=${encodeURIComponent(id)}"
                            class="dropdown-item customer-reset-password-btn"
                            data-id="${id}"
                        >
                            <i class="fa-solid fa-key"></i>
                            Reset Password
                        </a>
                    </li>

                    ${
                        whatsapp
                            ? `
                                <li>
                                    <a
                                        href="${escapeHtml(whatsapp)}"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="dropdown-item"
                                    >
                                        <i class="fa-brands fa-whatsapp me-2 text-success"></i>
                                        WhatsApp
                                    </a>
                                </li>
                            `
                            : `
                                <li>
                                    <span class="dropdown-item text-muted disabled">
                                        <i class="fa-brands fa-whatsapp me-2"></i>
                                        WhatsApp
                                    </span>
                                </li>
                            `
                    }
                </ul>
            </div>
        `;
    }


    /*
    |--------------------------------------------------------------------------
    | CUSTOMER ROW
    |--------------------------------------------------------------------------
    */

    function renderCustomerRow(customer) {

        const id =
            databaseId(customer);

        const idString =
            String(id);

        const packageName =
            packageDisplay(customer);

        const billingType =
            String(
                customer.billing_type ??
                customer.billingType ??
                ""
            )
                .trim()
                .toLowerCase();


        return `
            <tr>

                <td>
                    <input
                        type="checkbox"
                        class="form-check-input customer-checkbox"
                        name="customer_ids[]"
                        value="${id}"
                        data-name="${escapeHtml(
                            customerName(customer)
                        )}"
                        data-pppoe="${escapeHtml(
                            pppoeUsername(customer)
                        )}"
                        data-package="${escapeHtml(
                            packageName
                        )}"
                        data-monthly="${monthlyBill(customer)}"
                        ${selectedCustomerIds.has(idString) ? "checked" : ""}
                    >
                </td>

                <td class="cl-id">

                    <a
                        href="#"
                        class="cl-id-link customer-profile-btn"
                        data-id="${id}"
                        data-name="${escapeHtml(
                            customerName(customer)
                        )}"
                    >${escapeHtml(
                        customerId(customer)
                    )}</a>

                    ${
                        isNewCustomer(customer)
                            ? '<span class="cl-new">new</span>'
                            : ""
                    }

                </td>

                <td>
                    <div class="cl-name">
                        ${escapeHtml(
                            customerName(customer) ||
                            "-"
                        )}
                    </div>

                    <div class="cl-sub">
                        ${escapeHtml(
                            pppoeUsername(customer) ||
                            customerId(customer) ||
                            "-"
                        )}
                    </div>
                </td>

                <td>
                    ${contactDisplay(customer)}
                </td>

                <td>
                    <div class="cl-package">
                        ${escapeHtml(
                            packageName ||
                            "-"
                        )}
                    </div>

                    ${
                        billingType
                            ? `<span class="cl-tag">${escapeHtml(billingType)}</span>`
                            : ""
                    }
                </td>

                <td>
                    ${billBalanceDisplay(customer)}
                </td>

                <td>
                    ${billingDateDisplay(customer)}
                </td>

                <td class="text-center">
                    ${dayLeftDisplay(customer)}
                </td>

                <td>
                    ${statusBadge(customer)}
                </td>

                <td class="text-center">
                    ${actionMenu(customer)}
                </td>

            </tr>
        `;
    }


    /*
    |--------------------------------------------------------------------------
    | TABLE HELPERS
    |--------------------------------------------------------------------------
    */

    function getTableBody() {

        return (
            document.getElementById(
                "customerTableBody"
            ) ||
            document.querySelector(
                "#customerTable tbody"
            ) ||
            document.querySelector(
                ".cm-table tbody"
            )
        );
    }


    function showLoading() {

        const tbody =
            getTableBody();

        if (!tbody) {
            return;
        }


        tbody.innerHTML = `
            <tr>
                <td
                    colspan="10"
                    class="text-center py-5"
                >
                    <div
                        class="spinner-border spinner-border-sm me-2"
                    ></div>
                    Loading customers...
                </td>
            </tr>
        `;
    }


    function showEmpty() {

        const tbody =
            getTableBody();

        if (!tbody) {
            return;
        }


        tbody.innerHTML = `
            <tr>
                <td
                    colspan="10"
                    class="text-center py-5 text-muted"
                >
                    No customers found.
                </td>
            </tr>
        `;
    }


    function showError(message) {

        const tbody =
            getTableBody();

        if (!tbody) {
            return;
        }


        tbody.innerHTML = `
            <tr>
                <td
                    colspan="10"
                    class="text-center py-5 text-danger"
                >
                    ${escapeHtml(message)}
                </td>
            </tr>
        `;
    }


    /*
    |--------------------------------------------------------------------------
    | SUMMARY
    |--------------------------------------------------------------------------
    */

    function updateSummary(summary) {

        const totalCustomers =
            document.getElementById(
                "totalCustomers"
            );

        const totalBill =
            document.getElementById(
                "totalBill"
            );

        const totalBalance =
            document.getElementById(
                "totalBalance"
            );


        if (totalCustomers) {

            totalCustomers.textContent =
                number(
                    summary.total_customer ??
                    summary.totalCustomers ??
                    0
                ).toLocaleString();

            totalCustomers.dataset.total = totalCustomers.textContent;
            updateSelectedCount();
        }


        if (totalBill) {

            totalBill.textContent =
                taka(
                    summary.monthly_fee ??
                    summary.total_bill ??
                    summary.totalBill ??
                    0
                );
        }


        if (totalBalance) {

            totalBalance.textContent =
                taka(
                    summary.balance ??
                    summary.total_balance ??
                    summary.totalBalance ??
                    0
                );
        }
    }


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


        customerAdvancedFilters(params);

        const response =
            await fetch(
                "/api/customers/summary?" +
                params.toString(),
                {
                    credentials:
                        "same-origin",

                    headers: {
                        "X-Requested-With":
                            "XMLHttpRequest"
                    }
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
                "Failed to load customer summary."
            );
        }


        updateSummary(
            result.summary ||
            result.data ||
            {}
        );
    }


    /*
    |--------------------------------------------------------------------------
    | SHOWING
    |--------------------------------------------------------------------------
    */

    function updateShowing(pagination) {

        const info =
            document.getElementById(
                "paginationInfo"
            );


        if (!info) {
            return;
        }


        const total =
            number(
                pagination.total
            );

        const page =
            number(
                pagination.page
            ) || 1;

        const limit =
            number(
                pagination.limit
            );


        if (!total) {

            info.textContent =
                "Showing 0 customers";

            return;
        }


        if (!limit) {

            info.textContent =
                `Showing ${total.toLocaleString()} customers`;

            return;
        }


        const start =
            ((page - 1) * limit) + 1;

        const end =
            Math.min(
                page * limit,
                total
            );


        info.textContent =
            `Showing ${start.toLocaleString()}-${end.toLocaleString()} of ${total.toLocaleString()} customers`;
    }


    /*
    |--------------------------------------------------------------------------
    | PAGINATION
    |--------------------------------------------------------------------------
    */

    function renderPagination(pagination) {

        const container =
            document.getElementById(
                "customerPagination"
            );

        if (!container) {
            return;
        }

        container.innerHTML = "";

        const totalPages =
            number(
                pagination.totalPages
            );

        if (totalPages <= 1) {
            return;
        }

        const current =
            Math.min(
                Math.max(
                    number(pagination.page) || 1,
                    1
                ),
                totalPages
            );


        function addItem(
            label,
            page,
            disabled,
            active,
            title
        ) {

            const li =
                document.createElement("li");

            li.className =
                "page-item" +
                (disabled ? " disabled" : "") +
                (active ? " active" : "");

            const button =
                document.createElement("button");

            button.type =
                "button";

            button.className =
                "page-link";

            button.textContent =
                label;

            if (title) {
                button.title = title;
            }

            if (!disabled && !active) {

                button.addEventListener(
                    "click",
                    function () {

                        currentPage =
                            page;

                        loadCustomers();
                    }
                );
            }

            li.appendChild(button);

            container.appendChild(li);
        }


        function addText(label) {

            const li =
                document.createElement("li");

            li.className =
                "page-item cl-of";

            const span =
                document.createElement("span");

            span.className =
                "page-link";

            span.textContent =
                label;

            li.appendChild(span);

            container.appendChild(li);
        }


        addItem("<<", 1, current <= 1, false, "First");

        addItem("<", current - 1, current <= 1, false, "Previous");

        addItem(String(current), current, false, true);

        addText("of");

        addItem(
            String(totalPages),
            totalPages,
            false,
            current === totalPages,
            "Last page"
        );

        addItem(">", current + 1, current >= totalPages, false, "Next");

        addItem(">>", totalPages, current >= totalPages, false, "Last");
    }


    /*
    |--------------------------------------------------------------------------
    | SELECTED CUSTOMERS
    |--------------------------------------------------------------------------
    */

    function getCustomerCheckboxes() {

        const selectors = [
            "#customerTableBody .customer-checkbox",
            "#customerTableBody input[name='customer_ids[]']",
            "#customerTable .customer-checkbox",
            "#customerTable input[name='customer_ids[]']",
            ".cm-table .customer-checkbox",
            ".cm-table input[name='customer_ids[]']"
        ];


        const checkboxes = [];
        const seen = new Set();


        selectors.forEach(
            function (selector) {

                document
                    .querySelectorAll(selector)
                    .forEach(
                        function (checkbox) {

                            if (
                                !seen.has(checkbox)
                            ) {

                                seen.add(
                                    checkbox
                                );

                                checkboxes.push(
                                    checkbox
                                );
                            }
                        }
                    );
            }
        );


        return checkboxes;
    }


    /*
    |--------------------------------------------------------------------------
    | SYNC VISIBLE CHECKBOXES
    |--------------------------------------------------------------------------
    */

    function syncVisibleSelectionsFromDom() {

        getCustomerCheckboxes()
            .forEach(
                function (checkbox) {

                    const id =
                        String(
                            checkbox.value || ""
                        ).trim();


                    if (!id) {
                        return;
                    }


                    if (checkbox.checked) {

                        selectedCustomerIds.add(
                            id
                        );

                    } else {

                        selectedCustomerIds.delete(
                            id
                        );
                    }
                }
            );
    }


    /*
    |--------------------------------------------------------------------------
    | SELECTED CUSTOMER IDS
    |--------------------------------------------------------------------------
    */

    function getSelectedCustomerIds() {

        return Array.from(
            selectedCustomerIds
        );
    }


    /*
    |--------------------------------------------------------------------------
    | BULK COUNT
    |--------------------------------------------------------------------------
    */

    function updateSelectedCount() {

        const ids =
            getSelectedCustomerIds();

        const count =
            ids.length;


        document
            .querySelectorAll(
                "#selectedCount, " +
                ".selected-count, " +
                "[data-selected-count]"
            )
            .forEach(
                function (element) {

                    element.textContent =
                        String(count);
                }
            );


        const totalPill =
            document.getElementById(
                "totalCustomers"
            );

        if (totalPill) {

            const total =
                totalPill.dataset.total ||
                String(totalPill.textContent).split("/")[0].trim();

            totalPill.dataset.total = total;

            totalPill.textContent =
                count > 0
                    ? total + " / " + count
                    : total;
        }

        const toggle =
            document.getElementById(
                "bulkFloatingToggle"
            ) ||
            document.querySelector(
                ".bulk-floating-toggle"
            );


        if (toggle) {

            if (count > 0) {

                toggle.classList.add(
                    "active"
                );

                toggle.style.display =
                    "flex";

                toggle.setAttribute(
                    "aria-hidden",
                    "false"
                );

            } else {

                toggle.classList.remove(
                    "active"
                );

                toggle.style.display =
                    "none";

                toggle.setAttribute(
                    "aria-hidden",
                    "true"
                );


                const panel =
                    document.getElementById(
                        "bulkFloatingPanel"
                    );


                if (panel) {

                    panel.classList.remove(
                        "show"
                    );
                }
            }
        }


        document
            .querySelectorAll(
                "#bulkFloatingPanel .selected-count, " +
                ".bulk-floating-panel .selected-count"
            )
            .forEach(
                function (element) {

                    element.textContent =
                        String(count);
                }
            );
    }


    /*
    |--------------------------------------------------------------------------
    | SELECT ALL
    |--------------------------------------------------------------------------
    */

    function updateSelectAllState() {

        const selectAll =
            document.getElementById(
                "selectAll"
            );


        if (!selectAll) {
            return;
        }


        const checkboxes =
            getCustomerCheckboxes();


        const checked =
            checkboxes.filter(
                function (checkbox) {

                    return checkbox.checked;
                }
            );


        selectAll.checked =
            checkboxes.length > 0 &&
            checked.length ===
                checkboxes.length;


        selectAll.indeterminate =
            checked.length > 0 &&
            checked.length <
                checkboxes.length;
    }


    function resetSelectAll() {

        const selectAll =
            document.getElementById(
                "selectAll"
            );


        if (!selectAll) {
            return;
        }


        selectAll.checked =
            false;

        selectAll.indeterminate =
            false;
    }


    /*
    |--------------------------------------------------------------------------
    | RESTORE VISIBLE SELECTIONS
    |--------------------------------------------------------------------------
    */

    function restoreVisibleSelections() {

        getCustomerCheckboxes()
            .forEach(
                function (checkbox) {

                    const id =
                        String(
                            checkbox.value || ""
                        ).trim();


                    checkbox.checked =
                        id !== "" &&
                        selectedCustomerIds.has(
                            id
                        );
                }
            );


        updateSelectAllState();
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


        showLoading();


        const toggle =
            document.getElementById(
                "bulkFloatingToggle"
            );


        if (toggle) {

            toggle.classList.remove(
                "active"
            );

            toggle.style.display =
                "none";
        }


        const panel =
            document.getElementById(
                "bulkFloatingPanel"
            );


        if (panel) {

            panel.classList.remove(
                "show"
            );
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


            customerAdvancedFilters(params);

            const response =
                await fetch(
                    "/api/customers?" +
                    params.toString(),
                    {
                        credentials:
                            "same-origin",

                        headers: {
                            "X-Requested-With":
                                "XMLHttpRequest"
                        }
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
                    "Failed to load customers."
                );
            }


            const customers =
                Array.isArray(
                    result.data
                )
                    ? result.data
                    : Array.isArray(
                        result.customers
                    )
                        ? result.customers
                        : [];


            const tbody =
                getTableBody();


            if (!tbody) {

                throw new Error(
                    "Customer table body not found."
                );
            }


            if (!customers.length) {

                showEmpty();

            } else {

                tbody.innerHTML =
                    customers
                        .map(
                            renderCustomerRow
                        )
                        .join("");
            }


            const pagination =
                result.pagination ||
                {};


            updateShowing(
                pagination
            );


            renderPagination(
                pagination
            );


            try {

                await loadSummary();

            } catch (error) {

                console.warn(
                    "CUSTOMER SUMMARY:",
                    error
                );
            }


            /*
            |------------------------------------------------------------------
            | RESTORE SELECTION AFTER TABLE RENDER
            |------------------------------------------------------------------
            */

            restoreVisibleSelections();

            updateSelectedCount();

        } catch (error) {

            console.error(
                "CUSTOMER LIST:",
                error
            );


            showError(
                error.message ||
                "Failed to load customers."
            );


            updateSelectedCount();

        } finally {

            loadingCustomers =
                false;
        }
    }


    /*
    |--------------------------------------------------------------------------
    | MODAL HELPERS
    |--------------------------------------------------------------------------
    */

    function getActionModalElement() {

        return document.getElementById(
            "customerActionModal"
        );
    }


    function getActionModalBody() {

        return document.getElementById(
            "customerActionModalBody"
        );
    }


    function getActionModalTitle() {

        return document.getElementById(
            "customerActionModalLabel"
        );
    }


    function showActionModal(
        html,
        title
    ) {

        const modalElement =
            getActionModalElement();

        const body =
            getActionModalBody();

        const titleElement =
            getActionModalTitle();


        if (
            !modalElement ||
            !body
        ) {

            throw new Error(
                "Customer action modal not found."
            );
        }


        if (titleElement) {

            titleElement.textContent =
                title ||
                "Customer Action";
        }


        body.innerHTML =
            html;


        if (
            window.bootstrap &&
            window.bootstrap.Modal
        ) {

            const modal =
                window.bootstrap.Modal.getOrCreateInstance(
                    modalElement
                );

            modal.show();

            return modal;
        }


        modalElement.classList.add(
            "show"
        );

        modalElement.style.display =
            "block";

        modalElement.removeAttribute(
            "aria-hidden"
        );

        return null;
    }


    function closeActionModal() {

        const modalElement =
            getActionModalElement();


        if (!modalElement) {
            return;
        }


        if (
            window.bootstrap &&
            window.bootstrap.Modal
        ) {

            const modal =
                window.bootstrap.Modal.getInstance(
                    modalElement
                );

            if (modal) {
                modal.hide();
            }

            return;
        }


        modalElement.classList.remove(
            "show"
        );

        modalElement.style.display =
            "none";
    }


    /*
    |--------------------------------------------------------------------------
    | LOAD ACTION HTML
    |--------------------------------------------------------------------------
    */

    async function loadActionHtml(
        url,
        title
    ) {

        if (!url) {

            throw new Error(
                "Action URL is missing."
            );
        }


        const response =
            await fetch(
                url,
                {
                    method: "GET",

                    credentials:
                        "same-origin",

                    headers: {
                        "X-Requested-With":
                            "XMLHttpRequest",

                        "Accept":
                            "text/html"
                    }
                }
            );


        const html =
            await response.text();


        if (!response.ok) {

            throw new Error(
                html ||
                "Failed to load action form."
            );
        }


        showActionModal(
            html,
            title
        );
    }


    /*
    |--------------------------------------------------------------------------
    | SINGLE ACTION POPUP
    |--------------------------------------------------------------------------
    */

    async function handleSingleActionPopup(
        element
    ) {

        const url =
            element.getAttribute(
                "data-url"
            ) ||
            element.getAttribute(
                "href"
            );


        if (
            !url ||
            url === "#"
        ) {

            return;
        }


        try {

            await loadActionHtml(
                url,
                element.getAttribute(
                    "data-title"
                ) ||
                element.getAttribute(
                    "data-action-title"
                ) ||
                "Customer Action"
            );

        } catch (error) {

            console.error(
                "ACTION POPUP:",
                error
            );


            if (
                window.Swal
            ) {

                Swal.fire(
                    "Error",
                    error.message ||
                    "Failed to load action.",
                    "error"
                );
            }
        }
    }


    /*
    |--------------------------------------------------------------------------
    | BULK ACTION POPUP
    |--------------------------------------------------------------------------
    */

    async function handleBulkActionPopup(
        element
    ) {

        const selectedIds =
            getSelectedCustomerIds();


        if (!selectedIds.length) {

            if (window.Swal) {

                Swal.fire(
                    "No Customer Selected",
                    "Please select at least one customer.",
                    "warning"
                );
            }

            return;
        }


        let url =
            element.getAttribute(
                "data-url"
            );


        if (
            !url ||
            url === "#"
        ) {

            const href =
                element.getAttribute(
                    "href"
                );


            if (
                href &&
                href !== "#"
            ) {

                url =
                    href;
            }
        }


        if (
            !url ||
            url === "#"
        ) {

            throw new Error(
                "Bulk action URL is missing."
            );
        }


        const urlObject =
            new URL(
                url,
                window.location.origin
            );


        urlObject.searchParams.set(
            "ids",
            selectedIds.join(",")
        );


        await loadActionHtml(
            urlObject.toString(),
            element.getAttribute(
                "data-title"
            ) ||
            element.getAttribute(
                "data-action-title"
            ) ||
            "Bulk Action"
        );
    }


    /*
    |--------------------------------------------------------------------------
    | BULK FORM SUBMIT
    |--------------------------------------------------------------------------
    */

    async function submitBulkForm(
        form
    ) {

        const selectedIds =
            getSelectedCustomerIds();


        if (!selectedIds.length) {

            if (window.Swal) {

                Swal.fire(
                    "No Customer Selected",
                    "Please select at least one customer.",
                    "warning"
                );

            }

            return;
        }


        const formData =
            new FormData(form);


        selectedIds.forEach(
            function (id) {

                formData.append(
                    "customer_ids[]",
                    String(id)
                );
            }
        );



const csrfResponse = await fetch(
    "/api/csrf-token",
    {
        method: "GET",
        credentials: "same-origin",
        headers: {
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest"
        }
    }
);

let csrfData = {};

try {
    csrfData = await csrfResponse.json();
} catch (error) {
    throw new Error(
        "Unable to read CSRF token response. Please refresh the page."
    );
}

const csrfToken = String(
    csrfData?.csrf_token || ""
).trim();

if (!csrfResponse.ok || !csrfToken) {
    throw new Error(
        csrfData?.message ||
        "Unable to load CSRF token. Please refresh the page."
    );
}

const csrfInput = document.getElementById(
    "csrfTokenInput"
);

if (csrfInput) {
    csrfInput.value = csrfToken;
}

// Replace any stale or empty token in FormData.
formData.set("csrf_token", csrfToken);



        let url =
            form.getAttribute(
                "action"
            );


        if (!url) {

            url =
                window.location.href;
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
                    url,
                    {
                        method: "POST",

                        body: formData,

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


            let result;


            if (
                contentType.includes(
                    "application/json"
                )
            ) {

                result =
                    await response.json();

            } else {

                const text =
                    await response.text();


                result = {
                    success:
                        response.ok,

                    message:
                        text ||
                        (
                            response.ok
                                ? "Action completed."
                                : "Action failed."
                        )
                };
            }


            if (
                !response.ok ||
                !result.success
            ) {

                throw new Error(
                    result.message ||
                    "Bulk action failed."
                );
            }


            closeActionModal();


            const panel =
                document.getElementById(
                    "bulkFloatingPanel"
                );


            if (panel) {

                panel.classList.remove(
                    "show"
                );
            }


            if (window.Swal) {

                await Swal.fire(
                    "Success",
                    result.message ||
                    "Bulk action completed successfully.",
                    "success"
                );

            } else {

                alert(
                    result.message ||
                    "Bulk action completed successfully."
                );
            }


            /*
            |------------------------------------------------------------------
            | Successful bulk action clears selected customers.
            |------------------------------------------------------------------
            */

            selectedCustomerIds.clear();

            await loadCustomers();

        } catch (error) {

            console.error(
                "BULK FORM:",
                error
            );


            if (window.Swal) {

                Swal.fire(
                    "Error",
                    error.message ||
                    "Bulk action failed.",
                    "error"
                );

            } else {

                alert(
                    error.message ||
                    "Bulk action failed."
                );
            }

        } finally {

            if (submitButton) {

                submitButton.disabled =
                    false;
            }
        }
    }


    /*
    |--------------------------------------------------------------------------
    | EVENT INITIALIZATION
    |--------------------------------------------------------------------------
    */


// ============================================================
// CUSTOMER FILTER DROPDOWN DATA LOADER
// ============================================================

/*
|--------------------------------------------------------------------------
| ADVANCED FILTERS  (every select/input with data-cf in the filter bar)
|--------------------------------------------------------------------------
*/
function customerAdvancedFilters(params) {
    document.querySelectorAll("[data-cf]").forEach(function (el) {
        const key = String(el.getAttribute("data-cf") || "").trim();
        const value = String(el.value || "").trim();

        if (key && value !== "") {
            params.set(key, value);
        }
    });
}

async function customerFilterFetch(url, listKey) {
    const response = await fetch(url, {
        credentials: "same-origin",
        headers: {
            "X-Requested-With": "XMLHttpRequest"
        }
    });

    const result = await response.json();

    if (!response.ok || result.success === false) {
        throw new Error(result.message || "Filter data load failed");
    }

    const rows = result[listKey] || result.data || [];

    if (!Array.isArray(rows)) {
        throw new Error("Invalid filter response: " + url);
    }

    return rows;
}

function customerFillFilter(select, rows, labelCallback) {
    if (!select) return;

    const placeholder = select.options[0]
        ? select.options[0].cloneNode(true)
        : new Option("-- Select --", "");

    select.innerHTML = "";
    select.appendChild(placeholder);

    rows.forEach(row => {
        const id = Number(row.id || 0);
        const label = String(labelCallback(row) || "").trim();

        if (id <= 0 || !label) return;

        select.add(new Option(label, String(id)));
    });
}

async function loadCustomerRouterFilter() {
    const select = document.querySelector('[data-cf="router_id"]');
    if (!select) return;

    select.disabled = true;

    try {
        const rows = await customerFilterFetch(
            "/api/router",
            "routers"
        );

        customerFillFilter(select, rows, row => row.name);
    } catch (error) {
        console.error("Customer router filter:", error);
    } finally {
        select.disabled = false;
    }
}

async function loadCustomerPackageFilter(routerId) {
    const select = document.querySelector('[data-cf="package_id"]');
    if (!select) return;

    customerFillFilter(select, [], () => "");
    select.disabled = true;

    if (!routerId) {
        select.disabled = false;
        return;
    }

    try {
        const rows = await customerFilterFetch(
            "/api/router/" + encodeURIComponent(routerId) + "/packages",
            "packages"
        );

        customerFillFilter(
            select,
            rows,
            row => row.alias_name || row.package_name
        );
    } catch (error) {
        console.error("Customer package filter:", error);
    } finally {
        select.disabled = false;
    }
}

async function loadCustomerAreaFilter() {
    const select = document.querySelector('[data-cf="area_id"]');
    if (!select) return;

    select.disabled = true;

    try {
        const rows = await customerFilterFetch(
            "/areas/data",
            "data"
        );

        customerFillFilter(select, rows, row => row.name);
    } catch (error) {
        console.error("Customer area filter:", error);
    } finally {
        select.disabled = false;
    }
}

async function loadCustomerSubAreaFilter(areaId) {
    const select = document.querySelector('[data-cf="sub_area_id"]');
    if (!select) return;

    customerFillFilter(select, [], () => "");
    select.disabled = true;

    if (!areaId) {
        select.disabled = false;
        return;
    }

    try {
        const rows = await customerFilterFetch(
            "/areas/sub-areas?area_id=" + encodeURIComponent(areaId),
            "data"
        );

        customerFillFilter(select, rows, row => row.name);
    } catch (error) {
        console.error("Customer sub-area filter:", error);
    } finally {
        select.disabled = false;
    }
}

async function initCustomerFilterOptions() {
    const routerSelect = document.querySelector('[data-cf="router_id"]');
    const areaSelect = document.querySelector('[data-cf="area_id"]');

    if (routerSelect) {
        routerSelect.addEventListener("change", function () {
            loadCustomerPackageFilter(this.value);
        });
    }

    if (areaSelect) {
        areaSelect.addEventListener("change", function () {
            loadCustomerSubAreaFilter(this.value);
        });
    }

    await Promise.all([
        loadCustomerRouterFilter(),
        loadCustomerAreaFilter()
    ]);
}

    function initEvents() {

        if (initialized) {
            return;
        }


        initialized =
            true;


        /*
        |--------------------------------------------------------------------------
        | SELECT ALL / CUSTOMER CHECKBOX
        |--------------------------------------------------------------------------
        */

        document.addEventListener(
            "change",
            function (event) {

                const target =
                    event.target;


                /*
                |------------------------------------------------------------------
                | SELECT ALL
                |------------------------------------------------------------------
                */

                if (
                    target.matches(
                        "#selectAll"
                    )
                ) {

                    getCustomerCheckboxes()
                        .forEach(
                            function (checkbox) {

                                const id =
                                    String(
                                        checkbox.value || ""
                                    ).trim();


                                checkbox.checked =
                                    target.checked;


                                if (!id) {
                                    return;
                                }


                                if (target.checked) {

                                    selectedCustomerIds.add(
                                        id
                                    );

                                } else {

                                    selectedCustomerIds.delete(
                                        id
                                    );
                                }
                            }
                        );


                    updateSelectAllState();
                    updateSelectedCount();

                    return;
                }


                /*
                |------------------------------------------------------------------
                | INDIVIDUAL CUSTOMER CHECKBOX
                |------------------------------------------------------------------
                */

                if (
                    target.matches(
                        "#customerTableBody .customer-checkbox, " +
                        "#customerTableBody input[name='customer_ids[]'], " +
                        "#customerTable .customer-checkbox, " +
                        "#customerTable input[name='customer_ids[]'], " +
                        ".cm-table .customer-checkbox, " +
                        ".cm-table input[name='customer_ids[]']"
                    )
                ) {

                    const id =
                        String(
                            target.value || ""
                        ).trim();


                    if (id) {

                        if (target.checked) {

                            selectedCustomerIds.add(
                                id
                            );

                        } else {

                            selectedCustomerIds.delete(
                                id
                            );
                        }
                    }


                    updateSelectAllState();
                    updateSelectedCount();
                }
            }
        );


        /*
        |--------------------------------------------------------------------------
        | SEARCH
        |--------------------------------------------------------------------------
        */

        const searchInput =
            document.getElementById(
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
                            function () {

                                currentSearch =
                                    searchInput.value.trim();

                                currentPage =
                                    1;

                                loadCustomers();

                            },
                            350
                        );
                }
            );
        }


        /*
        |--------------------------------------------------------------------------
        | CLEAR SEARCH
        |--------------------------------------------------------------------------
        */

        const clearSearch =
            document.getElementById(
                "clearSearchBtn"
            );


        if (clearSearch) {

            clearSearch.addEventListener(
                "click",
                function (event) {

                    event.preventDefault();


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
        | STATUS FILTER
        |--------------------------------------------------------------------------
        */

        const statusSelect =
            document.getElementById(
                "customerStatus"
            );


        if (statusSelect) {

            statusSelect.addEventListener(
                "change",
                function () {

                    currentStatus =
                        statusSelect.value.trim();

                    currentPage =
                        1;


                    loadCustomers();
                }
            );
        }


        /*
        |--------------------------------------------------------------------------
        | LIMIT
        |--------------------------------------------------------------------------
        */

        const limitSelect =
            document.getElementById(
                "customerLimit"
            );


        if (limitSelect) {

            currentLimit =
                normalizeCustomerLimit(
                    limitSelect.value
                );


            limitSelect.addEventListener(
                "change",
                function () {

                    currentLimit =
                        normalizeCustomerLimit(
                            limitSelect.value
                        );

                    currentPage =
                        1;


                    loadCustomers();
                }
            );
        }


        /*
        |--------------------------------------------------------------------------
        | APPLY FILTER
        |--------------------------------------------------------------------------
        */

        const applyFilter =
            document.getElementById(
                "applyCustomerFilter"
            );


        if (applyFilter) {

            applyFilter.addEventListener(
                "click",
                function (event) {

                    event.preventDefault();


                    currentSearch =
                        searchInput
                            ? searchInput.value.trim()
                            : "";


                    currentStatus =
                        statusSelect
                            ? statusSelect.value.trim()
                            : "";


                    currentLimit =
                        normalizeCustomerLimit(
                            limitSelect
                                ? limitSelect.value
                                : 100
                        );


                    currentPage =
                        1;


                    loadCustomers();
                }
            );
        }


        /*
        |--------------------------------------------------------------------------
        | RESET FILTER
        |--------------------------------------------------------------------------
        */

        const resetFilter =
            document.getElementById(
                "resetCustomerFilter"
            );

        if (resetFilter) {

            resetFilter.addEventListener(
                "click",
                function (event) {

                    event.preventDefault();

                    document
                        .querySelectorAll("[data-cf]")
                        .forEach(function (el) {

                            el.value = "";

                            if (
                                el.classList.contains("cl-date")
                            ) {
                                el.type = "text";
                            }
                        });

                    loadCustomerPackageFilter("");
                    loadCustomerSubAreaFilter("");

                    if (statusSelect) {
                        statusSelect.value = "";
                    }

                    currentStatus = "";
                    currentPage = 1;

                    loadCustomers();
                }
            );
        }


        /*
        |--------------------------------------------------------------------------
        | REFRESH
        |--------------------------------------------------------------------------
        */

        document.addEventListener(
            "click",
            function (event) {

                const button =
                    event.target.closest(
                        "#refreshCustomersBtn, " +
                        "#refreshCustomerBtn, " +
                        ".customer-refresh-btn"
                    );


                if (!button) {
                    return;
                }


                event.preventDefault();


                loadCustomers();
            }
        );


        /*
        |--------------------------------------------------------------------------
        | BULK GEAR
        |--------------------------------------------------------------------------
        */

        document.addEventListener(
            "click",
            function (event) {

                const toggle =
                    event.target.closest(
                        "#bulkFloatingToggle, " +
                        ".bulk-floating-toggle"
                    );


                const panel =
                    document.getElementById(
                        "bulkFloatingPanel"
                    );


                if (toggle) {

                    event.preventDefault();
                    event.stopPropagation();


                    const selectedIds =
                        getSelectedCustomerIds();


                    if (!selectedIds.length) {

                        if (panel) {

                            panel.classList.remove(
                                "show"
                            );
                        }

                        return;
                    }


                    if (panel) {

                        panel.classList.toggle(
                            "show"
                        );
                    }


                    return;
                }


                if (
                    panel &&
                    !event.target.closest(
                        "#bulkFloatingPanel"
                    )
                ) {

                    panel.classList.remove(
                        "show"
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
            function (event) {

                const button =
                    event.target.closest(
                        "#bulkRechargeBtn, .bulk-recharge-btn"
                    );


                if (!button) {
                    return;
                }


                event.preventDefault();
                event.stopPropagation();


                const selectedIds =
                    getSelectedCustomerIds();


                if (!selectedIds.length) {

                    if (window.Swal) {

                        Swal.fire(
                            "No Customer Selected",
                            "Please select at least one customer.",
                            "warning"
                        );

                    } else {

                        alert(
                            "Please select at least one customer."
                        );
                    }


                    return;
                }


                if (
                    typeof window.openBulkRecharge !==
                    "function"
                ) {

                    console.error(
                        "BULK RECHARGE: openBulkRecharge() not found."
                    );


                    if (window.Swal) {

                        Swal.fire(
                            "Error",
                            "Bulk Recharge module is not loaded.",
                            "error"
                        );

                    } else {

                        alert(
                            "Bulk Recharge module is not loaded."
                        );
                    }


                    return;
                }


                try {

                    window.openBulkRecharge(
                        selectedIds
                    );

                } catch (error) {

                    console.error(
                        "BULK RECHARGE:",
                        error
                    );


                    if (window.Swal) {

                        Swal.fire(
                            "Error",
                            error.message ||
                            "Failed to open Bulk Recharge.",
                            "error"
                        );

                    } else {

                        alert(
                            error.message ||
                            "Failed to open Bulk Recharge."
                        );
                    }
                }
            }
        );


        /*
        |--------------------------------------------------------------------------
        | BULK ACTION BUTTONS
        |--------------------------------------------------------------------------
        */

        document.addEventListener(
            "click",
            async function (event) {

                const button =
                    event.target.closest(
                        ".bulk-action-popup"
                    );


                if (!button) {
                    return;
                }


                event.preventDefault();
                event.stopPropagation();


                try {

                    await handleBulkActionPopup(
                        button
                    );

                } catch (error) {

                    console.error(
                        "BULK ACTION:",
                        error
                    );


                    if (window.Swal) {

                        Swal.fire(
                            "Error",
                            error.message ||
                            "Failed to load bulk action.",
                            "error"
                        );
                    }
                }
            }
        );


        /*
        |--------------------------------------------------------------------------
        | BULK DELETE
        |--------------------------------------------------------------------------
        */

        document.addEventListener(
            "click",
            async function (event) {

                const button =
                    event.target.closest(
                        ".bulk-delete-btn"
                    );


                if (!button) {
                    return;
                }


                event.preventDefault();
                event.stopPropagation();


                try {

                    let url =
                        button.getAttribute(
                            "data-url"
                        );


                    if (!url) {

                        url =
                            button.getAttribute(
                                "href"
                            );
                    }


                    if (
                        !url ||
                        url === "#"
                    ) {

                        url =
                            "/api/customers/bulk/delete";
                    }


                    const selectedIds =
                        getSelectedCustomerIds();


                    if (!selectedIds.length) {

                        if (window.Swal) {

                            Swal.fire(
                                "No Customer Selected",
                                "Please select at least one customer.",
                                "warning"
                            );
                        }

                        return;
                    }


                    const urlObject =
                        new URL(
                            url,
                            window.location.origin
                        );


                    urlObject.searchParams.set(
                        "ids",
                        selectedIds.join(",")
                    );


                    await loadActionHtml(
                        urlObject.toString(),
                        selectedIds.length + " Customer Delete"
                    );

                } catch (error) {

                    console.error(
                        "BULK DELETE:",
                        error
                    );


                    if (window.Swal) {

                        Swal.fire(
                            "Error",
                            error.message ||
                            "Failed to load bulk delete.",
                            "error"
                        );
                    }
                }
            }
        );


        /*
        |--------------------------------------------------------------------------
        | UNIVERSAL ACTION POPUP
        |--------------------------------------------------------------------------
        */

        document.addEventListener(
            "click",
            async function (event) {

                const button =
                    event.target.closest(
                        ".action-popup"
                    );


                if (!button) {
                    return;
                }


                if (
                    button.closest(
                        ".dropdown-menu"
                    )
                ) {

                    return;
                }


                event.preventDefault();


                try {

                    await handleSingleActionPopup(
                        button
                    );

                } catch (error) {

                    console.error(
                        "ACTION POPUP:",
                        error
                    );


                    if (window.Swal) {

                        Swal.fire(
                            "Error",
                            error.message ||
                            "Failed to load action.",
                            "error"
                        );
                    }
                }
            }
        );


        /*
        |--------------------------------------------------------------------------
        | BULK FORM SUBMIT
        |--------------------------------------------------------------------------
        */

        document.addEventListener(
            "submit",
            async function (event) {

                const form =
                    event.target.closest(
                        "#customerActionModalBody form.customer-bulk-form, " +
                        "#customerActionModalBody form.bulk-action-form"
                    );


                if (!form) {
                    return;
                }


                event.preventDefault();


                await submitBulkForm(
                    form
                );
            }
        );


        /*
        |--------------------------------------------------------------------------
        | MODAL CLEANUP
        |--------------------------------------------------------------------------
        */

        const modalElement =
            document.getElementById(
                "customerActionModal"
            );


        if (modalElement) {

            modalElement.addEventListener(
                "hidden.bs.modal",
                function () {

                    const body =
                        getActionModalBody();


                    if (body) {

                        body.innerHTML =
                            "";
                    }
                }
            );
        }


        /*
        |--------------------------------------------------------------------------
        | INITIAL STATE
        |--------------------------------------------------------------------------
        */

        updateSelectedCount();
    }


    /*
    |--------------------------------------------------------------------------
    | INITIAL LOAD
    |--------------------------------------------------------------------------
    */

    function init() {

        initCustomerFilterOptions();

        initEvents();

        updateSelectedCount();

        loadCustomers();
    }


    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            init
        );

    } else {

        init();
    }


    /*
    |--------------------------------------------------------------------------
    | PUBLIC API
    |--------------------------------------------------------------------------
    */

    window.CustomerList = {

        load:
            loadCustomers,

        refresh:
            loadCustomers,

        search:
            function (value) {

                currentSearch =
                    String(
                        value || ""
                    ).trim();


                currentPage =
                    1;


                loadCustomers();
            },

        selectedIds:
            getSelectedCustomerIds,

        updateSelectedCount:
            updateSelectedCount
    };

})();





document.addEventListener("DOMContentLoaded",function(){const b=document.getElementById("exportCustomersBtn");if(!b)return;b.addEventListener("click",async function(){const old=b.innerHTML;b.disabled=true;b.innerHTML="Exporting...";try{const p=new URLSearchParams({page:"1",limit:"all"});const r=await fetch("/api/customers?"+p.toString(),{credentials:"same-origin",headers:{"X-Requested-With":"XMLHttpRequest"}});const j=await r.json();if(!r.ok||!j.success)throw Error(j.message||"CSV export failed");const rows=Array.isArray(j.data)?j.data:Array.isArray(j.customers)?j.customers:[];if(!rows.length){alert("No customer data to export");return}const cols=[["Customer ID","customer_id"],["Name","name"],["PPPoE","pppoe_username"],["Mobile","phone"],["Address","address"],["Package","display_package"],["Bill","display_bill"],["Balance","balance"],["Promise Date","promise_date"],["Day Left","day_left"],["Status","status"]];const q=String.fromCharCode(34),cell=v=>q+String(v==null?"":v).replace(/"/g,q+q)+q;const csv=[cols.map(c=>cell(c[0])).join(","),...rows.map(row=>cols.map(c=>cell(row[c[1]])).join(","))].join("\r\n");const url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="customers.csv";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){console.error(e);alert(e.message||"CSV export failed")}finally{b.disabled=false;b.innerHTML=old}})});
