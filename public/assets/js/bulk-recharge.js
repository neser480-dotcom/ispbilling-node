
"use strict";

(function () {

    /*
    |--------------------------------------------------------------------------
    | CONFIG
    |--------------------------------------------------------------------------
    */

    const CSRF_URL =
        "/api/csrf-token";

    const RECHARGE_URL =
        "/api/customers/bulk-recharge";


    let selectedCustomerIds = [];

        let customerRows = [];
    let bulkSort = { key: "", dir: 1 };


    /*
    |--------------------------------------------------------------------------
    | CSRF TOKEN
    |--------------------------------------------------------------------------
    */

    async function getCsrfToken() {

        const meta =
            document.querySelector(
                'meta[name="csrf-token"]'
            );


        if (
            meta &&
            meta.content &&
            meta.content.trim()
        ) {

            return meta.content.trim();

        }


        const input =
            document.querySelector(
                'input[name="csrf_token"]'
            );


        if (
            input &&
            input.value &&
            input.value.trim()
        ) {

            return input.value.trim();

        }


        if (
            window.csrfToken &&
            String(window.csrfToken).trim()
        ) {

            return String(
                window.csrfToken
            ).trim();

        }


        try {

            const response =
                await fetch(
                    CSRF_URL,
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


            const result =
                await response.json();


            if (
                !response.ok ||
                !result.success ||
                !result.csrf_token
            ) {

                throw new Error(
                    result.message ||
                    "Unable to get CSRF token."
                );

            }


            window.csrfToken =
                result.csrf_token;


            if (meta) {

                meta.content =
                    result.csrf_token;

            }


            if (input) {

                input.value =
                    result.csrf_token;

            }


            return result.csrf_token;

        } catch (error) {

            console.error(
                "CSRF TOKEN ERROR:",
                error
            );

            throw error;

        }

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


    function money(value) {

        const number =
            Number(value || 0);


        return Number.isFinite(number)
            ? number.toFixed(2)
            : "0.00";

    }


        function bulkSortRows(rows) {

        if (!bulkSort.key) {
            return rows;
        }

        const value = function (customer) {

            if (bulkSort.key === "amount") {
                return Number(customer.amount || customer.monthly || 0);
            }

            if (bulkSort.key === "package") {
                return String(customer.package || "").toLowerCase();
            }

            return String(customer.name || customer.pppoe || "").toLowerCase();
        };

        return rows.sort(function (a, b) {

            const x = value(a);
            const y = value(b);

            return (x < y ? -1 : x > y ? 1 : 0) * bulkSort.dir;
        });
    }

    function normalizeIds(ids) {

        if (!Array.isArray(ids)) {

            return [];

        }


        return Array.from(
            new Set(
                ids
                    .map(function (id) {

                        return Number(id);

                    })
                    .filter(function (id) {

                        return (
                            Number.isInteger(id) &&
                            id > 0
                        );

                    })
            )
        );

    }


    /*
    |--------------------------------------------------------------------------
    | GET CURRENT CUSTOMER SELECTION
    |--------------------------------------------------------------------------
    */

    function getCurrentSelectedIds(passedIds) {

        let ids =
            normalizeIds(
                passedIds
            );


        /*
        |--------------------------------------------------------------------------
        | 1. IDs passed from customer.js
        |--------------------------------------------------------------------------
        */

        if (ids.length) {

            return ids;

        }


        /*
        |--------------------------------------------------------------------------
        | 2. CustomerList selection
        |--------------------------------------------------------------------------
        */

        try {

            if (
                window.CustomerList &&
                typeof window.CustomerList.selectedIds ===
                "function"
            ) {

                ids =
                    normalizeIds(
                        window.CustomerList.selectedIds()
                    );


                if (ids.length) {

                    return ids;

                }

            }

        } catch (error) {

            console.warn(
                "CustomerList selection read failed:",
                error
            );

        }


        /*
        |--------------------------------------------------------------------------
        | 3. DOM selection
        |--------------------------------------------------------------------------
        */

        const checkboxes =
            getCheckedCustomerCheckboxes();


        ids = [];


        checkboxes.forEach(
            function (checkbox) {

                const rawId =
                    checkbox.value ||
                    checkbox.dataset.customerId ||
                    checkbox.dataset.id ||
                    checkbox.getAttribute(
                        "data-customer-id"
                    ) ||
                    checkbox.getAttribute(
                        "data-id"
                    ) ||
                    "";


                const id =
                    Number(rawId);


                if (
                    Number.isInteger(id) &&
                    id > 0
                ) {

                    ids.push(id);

                }

            }
        );


        return normalizeIds(ids);

    }


    /*
    |--------------------------------------------------------------------------
    | GET MODAL
    |--------------------------------------------------------------------------
    */

    function getModal() {

        const modalElement =
            document.getElementById(
                "bulkRechargeModal"
            );


        if (!modalElement) {

            return null;

        }


        if (
            typeof bootstrap ===
            "undefined"
        ) {

            return null;

        }


        return bootstrap.Modal.getOrCreateInstance(
            modalElement
        );

    }


    /*
    |--------------------------------------------------------------------------
    | GET CHECKED CUSTOMER CHECKBOXES
    |--------------------------------------------------------------------------
    */

    function getCheckedCustomerCheckboxes() {

        const selectors = [

            "#customerTableBody .customer-checkbox:checked",

            "#customerTableBody input[name='customer_ids[]']:checked",

            "#customerTableBody input[type='checkbox']:checked",

            "#customerTable .customer-checkbox:checked",

            "#customerTable input[name='customer_ids[]']:checked",

            "#customerTable tbody input[type='checkbox']:checked",

            ".cm-table tbody .customer-checkbox:checked",

            ".cm-table tbody input[type='checkbox']:checked"

        ];


        const result = [];

        const seen =
            new Set();


        selectors.forEach(
            function (selector) {

                document
                    .querySelectorAll(selector)
                    .forEach(
                        function (checkbox) {

                            if (
                                seen.has(
                                    checkbox
                                )
                            ) {

                                return;

                            }


                            if (
                                checkbox.id ===
                                "selectAll"
                            ) {

                                return;

                            }


                            seen.add(
                                checkbox
                            );


                            result.push(
                                checkbox
                            );

                        }
                    );

            }
        );


        return result;

    }


    /*
    |--------------------------------------------------------------------------
    | CREATE BULK RECHARGE TABLE
    |--------------------------------------------------------------------------
    */

    function ensureBulkRechargeTable() {

        const content =
            document.getElementById(
                "bulkRechargeContent"
            );


        if (!content) {

            return false;

        }


        let tableBody =
            document.getElementById(
                "bulkRechargeTableBody"
            );


        if (tableBody) {

            return true;

        }


        /*
        | Modal look: medium dialog, plain title (no icon).
        */
        const dialog = document.querySelector("#bulkRechargeModal .modal-dialog");

        if (dialog) {
            dialog.classList.remove("modal-xl");
            dialog.classList.add("modal-lg");
        }

        const titleIcon = document.querySelector("#bulkRechargeModal .modal-title i");

        if (titleIcon) {
            titleIcon.remove();
        }

        const arrows = '<span style="color:#2f86e4;font-size:12px;margin-left:4px;">&darr;&uarr;</span>';

        content.innerHTML = `

            <div class="row g-2 mb-3">

                <div class="col-md-6">

                    <label class="form-label" for="bulkRechargeBillingType">
                        Billing Type <span class="text-danger">*</span>
                    </label>

                    <select id="bulkRechargeBillingType" class="form-select">
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                    </select>

                </div>

                <div class="col-md-6">

                    <label class="form-label" for="bulkRechargeMedium">
                        Medium <span class="text-danger">*</span>
                    </label>

                    <select id="bulkRechargeMedium" class="form-select">
                        <option value="hand_cash">Hand Cash</option>
                        <option value="bkash">bKash</option>
                        <option value="nagad">Nagad</option>
                        <option value="bank">Bank Transfer</option>
                    </select>

                </div>

            </div>

            <div class="px-3">

                <div class="cm-summary cl-toolbar">

                    <i class="fa fa-gear cl-toolbar-ico"></i>

                    <span class="cl-tb-text">Total Data:</span>
                    <span class="cl-pill" id="bulkRechargeSelectedBadge">0</span>

                    <div class="cl-search">
                        <input
                            type="text"
                            id="bulkRechargeSearch"
                            placeholder="Search"
                            autocomplete="off"
                        >
                    </div>

                </div>

                <div class="table-responsive">

                    <table class="table table-striped align-middle mb-0">

                        <thead>
                            <tr>
                                <th data-bulk-sort="name" style="cursor:pointer;">Name/PPPoE ${arrows}</th>
                                <th data-bulk-sort="package" style="cursor:pointer;">Package &amp; Bill ${arrows}</th>
                                <th data-bulk-sort="amount" style="cursor:pointer;">Amount ${arrows}</th>
                                <th class="text-center">Action</th>
                            </tr>
                        </thead>

                        <tbody id="bulkRechargeTableBody"></tbody>

                    </table>

                </div>

                <div
                    id="bulkRechargeEmpty"
                    class="text-center py-4 text-muted"
                    style="display:none;"
                >
                    No selected customers found.
                </div>

            </div>

            <div class="d-flex justify-content-end gap-2 mt-4">

                <button
                    type="button"
                    class="btn btn-secondary"
                    data-bs-dismiss="modal"
                >
                    Cancel
                </button>

                <button
                    type="button"
                    id="bulkRechargeSubmit"
                    class="btn btn-success"
                >
                    Recharge
                </button>

            </div>

        `;


        tableBody =
            document.getElementById(
                "bulkRechargeTableBody"
            );


        return !!tableBody;

    }


    /*
    |--------------------------------------------------------------------------
    | READ SELECTED CUSTOMER DATA
    |--------------------------------------------------------------------------
    */

    function collectSelectedCustomers(ids) {

        const checkboxes =
            getCheckedCustomerCheckboxes();


        const map =
            new Map();


        /*
        |--------------------------------------------------------------------------
        | Read data from DOM
        |--------------------------------------------------------------------------
        */

        checkboxes.forEach(
            function (checkbox) {

                const rawId =
                    checkbox.value ||
                    checkbox.dataset.customerId ||
                    checkbox.dataset.id ||
                    checkbox.getAttribute(
                        "data-customer-id"
                    ) ||
                    checkbox.getAttribute(
                        "data-id"
                    ) ||
                    "";


                const id =
                    Number(rawId);


                if (
                    !Number.isInteger(id) ||
                    id <= 0
                ) {

                    return;

                }


                map.set(
                    id,
                    {

                        id:
                            id,

                        name:
                            checkbox.dataset.name ||
                            "",

                        pppoe:
                            checkbox.dataset.pppoe ||
                            "",

                        package:
                            checkbox.dataset.package ||
                            "",

                        monthly:
                            Number(
                                checkbox.dataset.monthly ||
                                0
                            )

                    }
                );

            }
        );


        /*
        |--------------------------------------------------------------------------
        | Always preserve passed selected IDs
        |--------------------------------------------------------------------------
        */

        (
            Array.isArray(ids)
                ? ids
                : []
        ).forEach(
            function (id) {

                const numericId =
                    Number(id);


                if (
                    !Number.isInteger(
                        numericId
                    ) ||
                    numericId <= 0
                ) {

                    return;

                }


                if (
                    !map.has(
                        numericId
                    )
                ) {

                    map.set(
                        numericId,
                        {

                            id:
                                numericId,

                            name:
                                "",

                            pppoe:
                                "",

                            package:
                                "",

                            monthly:
                                0

                        }
                    );

                }

            }
        );


        return Array.from(
            map.values()
        );

    }


    /*
    |--------------------------------------------------------------------------
    | RENDER CUSTOMERS
    |--------------------------------------------------------------------------
    */

    function renderCustomers() {

        const tbody =
            document.getElementById(
                "bulkRechargeTableBody"
            );


        const empty =
            document.getElementById(
                "bulkRechargeEmpty"
            );


        if (!tbody) {

            return;

        }


        const searchInput =
            document.getElementById(
                "bulkRechargeSearch"
            );


        const search =
            String(
                searchInput?.value || ""
            )
                .trim()
                .toLowerCase();


        const rows =
            customerRows.filter(
                function (customer) {

                    if (!search) {

                        return true;

                    }


                    return (

                        String(
                            customer.id
                        )
                            .toLowerCase()
                            .includes(search)

                        ||

                        String(
                            customer.name
                        )
                            .toLowerCase()
                            .includes(search)

                        ||

                        String(
                            customer.pppoe
                        )
                            .toLowerCase()
                            .includes(search)

                        ||

                        String(
                            customer.package
                        )
                            .toLowerCase()
                            .includes(search)

                    );

                }
            );


                bulkSortRows(rows);

        tbody.innerHTML =
            "";


        if (!rows.length) {

            if (empty) {

                empty.style.display =
                    "block";

            }


            updateTotal();

            return;

        }


        if (empty) {

            empty.style.display =
                "none";

        }


        rows.forEach(
            function (customer, index) {

                const tr =
                    document.createElement(
                        "tr"
                    );


                tr.innerHTML = `
                    <td>
                        <div>${escapeHtml(customer.name)}</div>
                        <div>${escapeHtml(customer.pppoe)}</div>
                    </td>
                    <td>
                        <div>${escapeHtml(customer.package)}</div>
                        <div class="fw-bold">\u09f3${escapeHtml(String(Number(customer.monthly || 0)))}</div>
                    </td>
                    <td>
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            class="form-control-plaintext bulk-recharge-amount"
                            style="width:90px;padding:0;"
                            data-id="${escapeHtml(customer.id)}"
                            value="${escapeHtml(String(Number(customer.amount || customer.monthly || 0)))}"
                        >
                    </td>
                    <td class="text-center">
                        <button
                            type="button"
                            class="btn btn-link text-danger p-0 bulk-recharge-remove"
                            data-id="${escapeHtml(customer.id)}"
                            title="Remove"
                            aria-label="Remove"
                        >
                            <i class="fa-regular fa-trash-can"></i>
                        </button>
                    </td>
                `;


                tbody.appendChild(
                    tr
                );

            }
        );


        updateTotal();

    }


    /*
    |--------------------------------------------------------------------------
    | UPDATE TOTAL
    |--------------------------------------------------------------------------
    */

    function updateTotal() {

        const inputs =
            document.querySelectorAll(
                "#bulkRechargeTableBody .bulk-recharge-amount"
            );


        let total =
            0;


        inputs.forEach(
            function (input) {

                const value =
                    Number(
                        input.value || 0
                    );


                if (
                    Number.isFinite(value) &&
                    value > 0
                ) {

                    total +=
                        value;

                }

            }
        );


        const submitButton =
            document.getElementById(
                "bulkRechargeSubmit"
            );

        if (submitButton) {
            submitButton.title =
                `Total ${money(total)}`;
        }

    }


    /*
    |--------------------------------------------------------------------------
    | UPDATE SELECTED BADGE
    |--------------------------------------------------------------------------
    */

    function updateSelectedBadge() {

        const badge =
            document.getElementById(
                "bulkRechargeSelectedBadge"
            );


        if (badge) {

            badge.textContent =
                String(customerRows.length);

        }

    }


    /*
    |--------------------------------------------------------------------------
    | OPEN BULK RECHARGE
    |--------------------------------------------------------------------------
    */

    window.openBulkRecharge =
        async function (selectedIds) {

            try {

                selectedCustomerIds =
                    getCurrentSelectedIds(
                        selectedIds
                    );


                console.log(
                    "Bulk Recharge selected IDs:",
                    selectedCustomerIds
                );


                if (
                    !selectedCustomerIds.length
                ) {

                    if (
                        typeof Swal !==
                        "undefined"
                    ) {

                        await Swal.fire({

                            icon:
                                "warning",

                            title:
                                "No Customer Selected",

                            text:
                                "Please select at least one customer."

                        });

                    }

                    return;

                }


                const modal =
                    getModal();


                if (!modal) {

                    throw new Error(
                        "Bulk Recharge modal not found."
                    );

                }


                if (
                    !ensureBulkRechargeTable()
                ) {

                    throw new Error(
                        "Bulk Recharge content not found."
                    );

                }


                customerRows =
                    collectSelectedCustomers(
                        selectedCustomerIds
                    );


                if (
                    !customerRows.length
                ) {

                    throw new Error(
                        "Selected customer data could not be loaded."
                    );

                }


                                bulkSort = { key: "", dir: 1 };

                const searchBox =
                    document.getElementById("bulkRechargeSearch");

                if (searchBox) {
                    searchBox.value = "";
                }

                const submitBtn =
                    document.getElementById("bulkRechargeSubmit");

                if (submitBtn) {
                    submitBtn.disabled = false;
                }

                renderCustomers();
                updateSelectedBadge();
                modal.show();

            } catch (error) {

                console.error(
                    "OPEN BULK RECHARGE ERROR:",
                    error
                );


                if (
                    typeof Swal !==
                    "undefined"
                ) {

                    Swal.fire({

                        icon:
                            "error",

                        title:
                            "Error",

                        text:
                            error.message ||
                            "Unable to open Bulk Recharge."

                    });

                }

            }

        };


    /*
    |--------------------------------------------------------------------------
    | SUBMIT BULK RECHARGE
    |--------------------------------------------------------------------------
    */

    async function processBulkRecharge() {

        const button =
            document.getElementById(
                "bulkRechargeSubmit"
            );


        /*
        |--------------------------------------------------------------------------
        | Restore selection if necessary
        |--------------------------------------------------------------------------
        */

        if (
            !Array.isArray(selectedCustomerIds) ||
            !selectedCustomerIds.length
        ) {

            selectedCustomerIds =
                getCurrentSelectedIds(
                    selectedCustomerIds
                );

        }


        if (
            !Array.isArray(customerRows) ||
            !customerRows.length
        ) {

            customerRows =
                collectSelectedCustomers(
                    selectedCustomerIds
                );

        }


        if (
            !customerRows.length
        ) {

            throw new Error(
                "No valid customers selected."
            );

        }


        /*
        |--------------------------------------------------------------------------
        | CSRF
        |--------------------------------------------------------------------------
        */

        const csrfToken =
            await getCsrfToken();


        if (!csrfToken) {

            throw new Error(
                "CSRF token not found."
            );

        }


        /*
        |--------------------------------------------------------------------------
        | Billing type
        |--------------------------------------------------------------------------
        */

        const billingType =
            document.getElementById(
                "bulkRechargeBillingType"
            )?.value ||
            "monthly";


        /*
        |--------------------------------------------------------------------------
        | Payment medium
        |--------------------------------------------------------------------------
        */

        const medium =
            document.getElementById(
                "bulkRechargeMedium"
            )?.value ||
            "hand_cash";


        /*
        |--------------------------------------------------------------------------
        | Read amount inputs
        |--------------------------------------------------------------------------
        */

        const inputs =
            document.querySelectorAll(
                "#bulkRechargeTableBody .bulk-recharge-amount"
            );


        const amountMap =
            new Map();


        inputs.forEach(
            function (input) {

                const id =
                    Number(
                        input.dataset.id
                    );


                const amount =
                    Number(
                        input.value
                    );


                if (
                    Number.isInteger(id) &&
                    id > 0 &&
                    Number.isFinite(amount) &&
                    amount > 0
                ) {

                    amountMap.set(
                        id,
                        amount
                    );

                }

            }
        );


        /*
        |--------------------------------------------------------------------------
        | Build final items
        |--------------------------------------------------------------------------
        */

        const items =
            [];


        customerRows.forEach(
            function (customer) {

                const id =
                    Number(
                        customer.id
                    );


                if (
                    !Number.isInteger(id) ||
                    id <= 0
                ) {

                    return;

                }


                let amount =
                    amountMap.get(
                        id
                    );


                /*
                |--------------------------------------------------------------------------
                | Fallback to monthly amount
                |--------------------------------------------------------------------------
                */

                if (
                    !Number.isFinite(amount) ||
                    amount <= 0
                ) {

                    amount =
                        Number(
                            customer.amount ||
                            customer.monthly ||
                            0
                        );

                }


                if (
                    Number.isFinite(amount) &&
                    amount > 0
                ) {

                    items.push({

                        customer_id:
                            id,

                        amount:
                            amount

                    });

                }

            }
        );


        /*
        |--------------------------------------------------------------------------
        | Final validation
        |--------------------------------------------------------------------------
        */

        if (!items.length) {

            throw new Error(
                "No valid recharge amount found for the selected customers."
            );

        }


        /*
        |--------------------------------------------------------------------------
        | Debug
        |--------------------------------------------------------------------------
        */

        console.log(
            "Bulk Recharge submitting:",
            {

                selectedCustomerIds:
                    selectedCustomerIds,

                customerRows:
                    customerRows,

                items:
                    items,

                billingType:
                    billingType,

                medium:
                    medium

            }
        );


        /*
        |--------------------------------------------------------------------------
        | Disable button
        |--------------------------------------------------------------------------
        */

        const originalText =
            button
                ? button.innerHTML
                : "";


        if (button) {

            button.disabled =
                true;


            button.innerHTML = `

                <span
                    class="spinner-border spinner-border-sm me-1"
                ></span>

                Processing...

            `;

        }


        try {

            /*
            |--------------------------------------------------------------------------
            | POST REQUEST
            |--------------------------------------------------------------------------
            */

            const response =
                await fetch(
                    RECHARGE_URL,
                    {

                        method:
                            "POST",

                        credentials:
                            "same-origin",

                        headers: {

                            "Content-Type":
                                "application/json",

                            "Accept":
                                "application/json",

                            "X-CSRF-Token":
                                csrfToken

                        },

                        body:
                            JSON.stringify({

                                csrf_token:
                                    csrfToken,

                                billing_type:
                                    billingType,

                                medium:
                                    medium,

                                comment:
                                    "Bulk recharge",

                                items:
                                    items

                            })

                    }
                );


            /*
            |--------------------------------------------------------------------------
            | Read response
            |--------------------------------------------------------------------------
            */

            let result =
                null;


            try {

                result =
                    await response.json();

            } catch (jsonError) {

                throw new Error(
                    "Invalid server response."
                );

            }


            console.log(
                "Bulk Recharge server response:",
                {

                    status:
                        response.status,

                    ok:
                        response.ok,

                    result:
                        result

                }
            );


            /*
            |--------------------------------------------------------------------------
            | Server error
            |--------------------------------------------------------------------------
            */

            if (
                !response.ok ||
                !result.success
            ) {

                throw new Error(
                    result.message ||
                    "Bulk Recharge failed."
                );

            }


            /*
            |--------------------------------------------------------------------------
            | Success
            |--------------------------------------------------------------------------
            */

            if (
                typeof Swal !==
                "undefined"
            ) {

                await Swal.fire({

                    icon:
                        Number(
                            result.failed || 0
                        ) > 0
                            ? "warning"
                            : "success",

                    title:
                        "Bulk Recharge Completed",

                    html: `

                        <div>
                            Successful:
                            <strong>
                                ${Number(
                                    result.ok || 0
                                )}
                            </strong>
                        </div>

                        <div>
                            Failed:
                            <strong>
                                ${Number(
                                    result.failed || 0
                                )}
                            </strong>
                        </div>

                        <div>
                            Total Amount:
                            <strong>
                                ${money(
                                    result.total_amount || 0
                                )}
                            </strong>
                        </div>

                    `

                });

            }


            /*
            |--------------------------------------------------------------------------
            | Close modal
            |--------------------------------------------------------------------------
            */

            const modal =
                getModal();


            if (modal) {

                modal.hide();

            }


            /*
            |--------------------------------------------------------------------------
            | Clear local selection
            |--------------------------------------------------------------------------
            */

            selectedCustomerIds =
                [];


            customerRows =
                [];


            /*
            |--------------------------------------------------------------------------
            | Refresh Customer List
            |--------------------------------------------------------------------------
            */

            if (
                window.CustomerList &&
                typeof window.CustomerList.refresh ===
                "function"
            ) {

                await window.CustomerList.refresh();

            } else if (
                typeof window.loadCustomers ===
                "function"
            ) {

                await window.loadCustomers();

            } else {

                window.location.reload();

            }

        } finally {

            if (button) {

                button.disabled =
                    false;


                button.innerHTML =
                    originalText;

            }

        }

    }


    /*
    |--------------------------------------------------------------------------
    | EVENTS
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "click",
        async function (event) {

            const button =
                event.target.closest(
                    "#bulkRechargeSubmit"
                );


            if (!button) {

                return;

            }


            try {

                await processBulkRecharge();

            } catch (error) {

                console.error(
                    "BULK RECHARGE ERROR:",
                    error
                );


                if (
                    typeof Swal !==
                    "undefined"
                ) {

                    Swal.fire({

                        icon:
                            "error",

                        title:
                            "Bulk Recharge Failed",

                        text:
                            error.message ||
                            "Something went wrong."

                    });

                }

            }

        }
    );


    /*
    |--------------------------------------------------------------------------
    | SEARCH / AMOUNT INPUT
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "input",
        function (event) {

            if (
                event.target.matches(
                    "#bulkRechargeSearch"
                )
            ) {

                renderCustomers();

                return;

            }


            if (
                event.target.matches(
                    ".bulk-recharge-amount"
                )
            ) {

                updateTotal();

            }

        }
    );


        /*
    |--------------------------------------------------------------------------
    | REMOVE ROW / SORT / KEEP EDITED AMOUNT
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "click",
        function (event) {

            const remove =
                event.target.closest(
                    ".bulk-recharge-remove"
                );

            if (remove) {

                const id =
                    Number(remove.dataset.id);

                customerRows =
                    customerRows.filter(
                        function (customer) {
                            return Number(customer.id) !== id;
                        }
                    );

                selectedCustomerIds =
                    (selectedCustomerIds || []).filter(
                        function (value) {
                            return Number(value) !== id;
                        }
                    );

                renderCustomers();
                updateSelectedBadge();

                if (!customerRows.length) {

                    const submitBtn =
                        document.getElementById(
                            "bulkRechargeSubmit"
                        );

                    if (submitBtn) {
                        submitBtn.disabled = true;
                    }
                }

                return;
            }

            const th =
                event.target.closest(
                    "th[data-bulk-sort]"
                );

            if (th) {

                const key =
                    th.dataset.bulkSort;

                bulkSort.dir =
                    bulkSort.key === key
                        ? -bulkSort.dir
                        : 1;

                bulkSort.key =
                    key;

                renderCustomers();
            }
        }
    );

    document.addEventListener(
        "input",
        function (event) {

            if (
                !event.target.matches(
                    ".bulk-recharge-amount"
                )
            ) {
                return;
            }

            const id =
                Number(event.target.dataset.id);

            const customer =
                customerRows.find(
                    function (row) {
                        return Number(row.id) === id;
                    }
                );

            if (customer) {
                customer.amount =
                    Number(event.target.value);
            }
        }
    );

    /*
    |--------------------------------------------------------------------------
    | LOAD MESSAGE
    |--------------------------------------------------------------------------
    */

    console.log(
        "Bulk Recharge JS loaded - CLEAN"
    );

})();
