
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


    let selectedCustomerIds =
        [];

    let customerRows =
        [];


    /*
    |--------------------------------------------------------------------------
    | CSRF TOKEN
    |--------------------------------------------------------------------------
    */

    async function getCsrfToken() {

        /*
        |--------------------------------------------------------------------------
        | 1. META
        |--------------------------------------------------------------------------
        */

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


        /*
        |--------------------------------------------------------------------------
        | 2. HIDDEN INPUT
        |--------------------------------------------------------------------------
        */

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


        /*
        |--------------------------------------------------------------------------
        | 3. GLOBAL VARIABLE
        |--------------------------------------------------------------------------
        */

        if (
            window.csrfToken &&
            String(window.csrfToken).trim()
        ) {

            return String(
                window.csrfToken
            ).trim();

        }


        /*
        |--------------------------------------------------------------------------
        | 4. FETCH FROM SESSION
        |--------------------------------------------------------------------------
        */

        try {

            const response =
                await fetch(
                    CSRF_URL,
                    {

                        method:
                            "GET",

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

        return number.toFixed(2);

    }


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
    | CREATE TABLE
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


        content.innerHTML = `

            <div class="mb-3">

                <div class="row g-2">

                    <div class="col-md-4">

                        <label class="form-label">
                            Billing Type
                        </label>

                        <select
                            id="bulkRechargeBillingType"
                            class="form-select"
                        >

                            <option value="monthly">
                                Monthly
                            </option>

                            <option value="yearly">
                                Yearly
                            </option>

                        </select>

                    </div>


                    <div class="col-md-4">

                        <label class="form-label">
                            Payment Medium
                        </label>

                        <select
                            id="bulkRechargeMedium"
                            class="form-select"
                        >

                            <option value="hand_cash">
                                Hand Cash
                            </option>

                            <option value="bkash">
                                bKash
                            </option>

                            <option value="nagad">
                                Nagad
                            </option>

                            <option value="bank">
                                Bank Transfer
                            </option>

                        </select>

                    </div>


                    <div class="col-md-4">

                        <label class="form-label">
                            Search
                        </label>

                        <input
                            type="text"
                            id="bulkRechargeSearch"
                            class="form-control"
                            placeholder="Search customer..."
                        >

                    </div>

                </div>

            </div>


            <div class="d-flex justify-content-between align-items-center mb-2">

                <span
                    id="bulkRechargeSelectedBadge"
                    class="badge bg-primary"
                >
                    Selected: 0
                </span>

                <span
                    id="bulkRechargeTotalBadge"
                    class="badge bg-success"
                >
                    Total: 0.00
                </span>

            </div>


            <div
                class="table-responsive"
                style="max-height:420px;overflow:auto;"
            >

                <table class="table table-sm table-hover align-middle">

                    <thead>

                        <tr>

                            <th>
                                #
                            </th>

                            <th>
                                ID
                            </th>

                            <th>
                                Customer
                            </th>

                            <th>
                                PPPoE
                            </th>

                            <th>
                                Package
                            </th>

                            <th>
                                Monthly
                            </th>

                            <th>
                                Amount
                            </th>

                        </tr>

                    </thead>


                    <tbody
                        id="bulkRechargeTableBody"
                    ></tbody>

                </table>

            </div>


            <div
                id="bulkRechargeEmpty"
                class="text-center py-4 text-muted"
                style="display:none;"
            >
                No selected customers found.
            </div>


            <div class="mt-3">

                <button
                    type="button"
                    id="bulkRechargeSubmit"
                    class="btn btn-primary w-100"
                >

                    <i class="fa fa-money-bill-wave me-1"></i>

                    Process Bulk Recharge

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
            document.querySelectorAll(
                ".customer-checkbox:checked"
            );


        const map =
            new Map();


        checkboxes.forEach(
            checkbox => {

                const id =
                    Number(
                        checkbox.value
                    );


                if (
                    Number.isInteger(id) &&
                    id > 0
                ) {

                    map.set(
                        id,
                        {

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

            }
        );


        /*
        |--------------------------------------------------------------------------
        | FALLBACK FROM PASSED IDS
        |--------------------------------------------------------------------------
        */

        ids.forEach(
            id => {

                const numericId =
                    Number(id);


                if (
                    !map.has(numericId)
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
    | RENDER TABLE
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


        if (
            !tbody
        ) {

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
                customer => {

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


        tbody.innerHTML =
            "";


        if (!rows.length) {

            if (empty) {

                empty.style.display =
                    "block";

            }

            return;

        }


        if (empty) {

            empty.style.display =
                "none";

        }


        rows.forEach(
            (customer, index) => {

                const tr =
                    document.createElement(
                        "tr"
                    );


                tr.innerHTML = `

                    <td>
                        ${index + 1}
                    </td>

                    <td>
                        ${escapeHtml(customer.id)}
                    </td>

                    <td>
                        ${escapeHtml(customer.name)}
                    </td>

                    <td>
                        ${escapeHtml(customer.pppoe)}
                    </td>

                    <td>
                        ${escapeHtml(customer.package)}
                    </td>

                    <td>
                        ${money(customer.monthly)}
                    </td>

                    <td>

                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            class="form-control form-control-sm bulk-recharge-amount"
                            data-id="${customer.id}"
                            value="${money(customer.monthly)}"
                        >

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
    | TOTAL
    |--------------------------------------------------------------------------
    */

    function updateTotal() {

        const inputs =
            document.querySelectorAll(
                ".bulk-recharge-amount"
            );


        let total =
            0;


        inputs.forEach(
            input => {

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


        const totalBadge =
            document.getElementById(
                "bulkRechargeTotalBadge"
            );


        if (totalBadge) {

            totalBadge.textContent =
                `Total: ${money(total)}`;

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
                `Selected: ${customerRows.length}`;

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

                if (
                    !Array.isArray(
                        selectedIds
                    )
                ) {

                    selectedIds =
                        [];

                }


                selectedCustomerIds =
                    selectedIds
                        .map(
                            id =>
                                Number(id)
                        )
                        .filter(
                            id =>
                                Number.isInteger(id) &&
                                id > 0
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


        if (!customerRows.length) {

            if (
                typeof Swal !==
                "undefined"
            ) {

                Swal.fire({

                    icon:
                        "warning",

                    title:
                        "No Customers",

                    text:
                        "No customers selected."

                });

            }

            return;

        }


        const csrfToken =
            await getCsrfToken();


        if (!csrfToken) {

            throw new Error(
                "CSRF token not found."
            );

        }


        const billingType =
            document.getElementById(
                "bulkRechargeBillingType"
            )?.value ||
            "monthly";


        const medium =
            document.getElementById(
                "bulkRechargeMedium"
            )?.value ||
            "hand_cash";


        const inputs =
            document.querySelectorAll(
                ".bulk-recharge-amount"
            );


        const items =
            [];


        inputs.forEach(
            input => {

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

                    items.push({

                        customer_id:
                            id,

                        amount:
                            amount

                    });

                }

            }
        );


        if (!items.length) {

            throw new Error(
                "Please enter a valid recharge amount."
            );

        }


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


            const result =
                await response.json();


            if (
                !response.ok ||
                !result.success
            ) {

                throw new Error(
                    result.message ||
                    "Bulk Recharge failed."
                );

            }


            if (
                typeof Swal !==
                "undefined"
            ) {

                await Swal.fire({

                    icon:
                        result.failed > 0
                            ? "warning"
                            : "success",

                    title:
                        "Bulk Recharge Completed",

                    html: `

                        <div>
                            Successful:
                            <strong>
                                ${result.ok || 0}
                            </strong>
                        </div>

                        <div>
                            Failed:
                            <strong>
                                ${result.failed || 0}
                            </strong>
                        </div>

                        <div>
                            Total Amount:
                            <strong>
                                ${money(result.total_amount || 0)}
                            </strong>
                        </div>

                    `

                });

            }


            const modal =
                getModal();


            if (modal) {

                modal.hide();

            }


            /*
            |--------------------------------------------------------------------------
            | REFRESH CUSTOMER LIST
            |--------------------------------------------------------------------------
            */

            if (
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
    | LOAD MESSAGE
    |--------------------------------------------------------------------------
    */

    console.log(
        "Bulk Recharge JS loaded"
    );


})();
