"use strict";

(function () {
    /*
    |--------------------------------------------------------------------------
    | CUSTOMER BILL HISTORY
    |--------------------------------------------------------------------------
    */

    if (window.CustomerBillHistoryInitialized) {
        return;
    }

    window.CustomerBillHistoryInitialized = true;

    let activeCustomerId = 0;
    let modal = null;
    let historyRequestId = 0;

    const $ = (selector, root = document) =>
        root.querySelector(selector);

    /*
    |--------------------------------------------------------------------------
    | HELPERS
    |--------------------------------------------------------------------------
    */

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function money(value) {
        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return "—";
        }

        const amount = Number(value);

        return "৳" +
            (Number.isFinite(amount) ? amount.toFixed(2) : "0.00");
    }

    function formatDate(value) {
        if (!value) {
            return "—";
        }

        const parsed = new Date(value);

        if (Number.isNaN(parsed.getTime())) {
            return escapeHtml(value);
        }

        return escapeHtml(parsed.toLocaleString());
    }

    /*
    |--------------------------------------------------------------------------
    | CSRF TOKEN
    |--------------------------------------------------------------------------
    | Fetch a fresh token from the working API endpoint.
    */

    async function getCsrfToken() {
        const response = await fetch("/api/csrf-token", {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
            headers: {
                Accept: "application/json"
            }
        });

        const text = await response.text();

        let result;

        try {
            result = JSON.parse(text);
        } catch {
            throw new Error(
                "CSRF API থেকে valid JSON পাওয়া যায়নি। HTTP " +
                response.status
            );
        }

        if (
            !response.ok ||
            !result.success ||
            !result.csrf_token
        ) {
            throw new Error(
                result.message || "CSRF token পাওয়া যায়নি।"
            );
        }

        return result.csrf_token;
    }

    /*
    |--------------------------------------------------------------------------
    | JSON RESPONSE
    |--------------------------------------------------------------------------
    */

    async function readJson(response) {
        const text = await response.text();

        let result;

        try {
            result = JSON.parse(text);
        } catch {
            throw new Error(
                "Server থেকে valid JSON পাওয়া যায়নি। HTTP " +
                response.status
            );
        }

        if (!response.ok || result.success === false) {
            throw new Error(
                result.message ||
                "Request failed. HTTP " + response.status
            );
        }

        return result;
    }

    /*
    |--------------------------------------------------------------------------
    | CREATE MODAL
    |--------------------------------------------------------------------------
    */

    function ensureModal() {
        const existing = $("#customerBillHistoryModal");

        if (existing) {
            modal = existing;
            bindModalEvents();
            return;
        }

        document.body.insertAdjacentHTML("beforeend", `
            <div
                class="cbh-overlay"
                id="customerBillHistoryModal"
                aria-hidden="true"
            >
                <section
                    class="cbh-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="cbhTitle"
                    tabindex="-1"
                >
                    <header class="cbh-header">
                        <div>
                            <h2 id="cbhTitle">
                                Customer Bill History
                            </h2>

                            <div id="cbhCustomerInfo">
                                Loading customer...
                            </div>
                        </div>

                        <button
                            type="button"
                            class="cbh-close"
                            id="cbhClose"
                            aria-label="Close"
                        >×</button>
                    </header>

                    <div class="cbh-summary">
                        <div>
                            <span>Total Records</span>
                            <strong id="cbhCount">0</strong>
                        </div>

                        <div>
                            <span>Total Collected</span>
                            <strong id="cbhTotal">৳0.00</strong>
                        </div>
                    </div>

                    <div class="cbh-body" id="cbhBody">
                        <div class="cbh-message">
                            Payment history will appear here.
                        </div>
                    </div>

                    <footer class="cbh-footer">
                        <button
                            type="button"
                            class="cbh-button"
                            id="cbhCloseBottom"
                        >
                            Close
                        </button>
                    </footer>
                </section>
            </div>
        `);

        modal = $("#customerBillHistoryModal");

        bindModalEvents();
    }

    /*
    |--------------------------------------------------------------------------
    | MODAL EVENTS
    |--------------------------------------------------------------------------
    */

    function bindModalEvents() {
        if (!modal || modal.dataset.cbhEventsBound === "1") {
            return;
        }

        modal.dataset.cbhEventsBound = "1";

        $("#cbhClose", modal)?.addEventListener("click", close);

        $("#cbhCloseBottom", modal)?.addEventListener("click", close);

        modal.addEventListener("click", (event) => {
            if (event.target === modal) {
                close();
            }
        });

        modal.addEventListener("click", (event) => {
            const target = event.target;

            if (!(target instanceof Element)) {
                return;
            }

            const button = target.closest(".cbh-delete");

            if (!button || !modal.contains(button)) {
                return;
            }

            cancelPayment(button.dataset.paymentId, button);
        });

        modal.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                close();
            }
        });
    }

    /*
    |--------------------------------------------------------------------------
    | OPEN MODAL
    |--------------------------------------------------------------------------
    */

    function open(customerId) {
        const id = Number(customerId);

        if (!Number.isSafeInteger(id) || id <= 0) {
            alert("Invalid customer ID.");
            return;
        }

        activeCustomerId = id;

        ensureModal();

        if (!modal) {
            console.error(
                "Customer Bill History modal unavailable."
            );
            return;
        }

        historyRequestId++;

        modal.style.removeProperty("display");
        modal.style.removeProperty("visibility");
        modal.style.removeProperty("opacity");
        modal.style.removeProperty("z-index");

        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");

        document.body.classList.add("cbh-modal-open");

        $("#cbhCustomerInfo", modal).textContent =
            "Customer ID: " + id;

        $("#cbhCount", modal).textContent = "…";
        $("#cbhTotal", modal).textContent = "…";

        $("#cbhBody", modal).innerHTML = `
            <div class="cbh-message">
                Loading payment history...
            </div>
        `;

        $("#cbhClose", modal)?.focus({
            preventScroll: true
        });

        loadHistory();
    }

    /*
    |--------------------------------------------------------------------------
    | CLOSE MODAL
    |--------------------------------------------------------------------------
    */

    function close() {
        if (!modal) {
            return;
        }

        historyRequestId++;

        const focusedElement = document.activeElement;

        if (focusedElement && modal.contains(focusedElement)) {
            focusedElement.blur();
        }

        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");

        document.body.classList.remove("cbh-modal-open");
    }

    /*
    |--------------------------------------------------------------------------
    | LOAD CUSTOMER PAYMENT HISTORY
    |--------------------------------------------------------------------------
    */

    async function loadHistory() {
        if (!modal || !activeCustomerId) {
            return;
        }

        const customerId = activeCustomerId;
        const requestId = historyRequestId;
        const body = $("#cbhBody", modal);

        if (!body) {
            return;
        }

        try {
            const response = await fetch(
                "/reports/api/customer-bill-history/" +
                encodeURIComponent(customerId),
                {
                    method: "GET",
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: {
                        Accept: "application/json"
                    }
                }
            );

            const result = await readJson(response);

            if (
                requestId !== historyRequestId ||
                customerId !== activeCustomerId ||
                !modal.classList.contains("open")
            ) {
                return;
            }

            const rows = Array.isArray(result.rows)
                ? result.rows
                : [];

            const customerName = result.customer?.name;

            $("#cbhCustomerInfo", modal).textContent =
                (customerName ? customerName + " · " : "") +
                "Customer ID: " + customerId;

            $("#cbhCount", modal).textContent = String(rows.length);

            const total = rows.reduce((sum, row) => {
                const amount = Number(row.amount);

                return sum + (
                    Number.isFinite(amount) ? amount : 0
                );
            }, 0);

            $("#cbhTotal", modal).textContent = money(total);

            if (!rows.length) {
                body.innerHTML = `
                    <div class="cbh-message">
                        No payment history found.
                    </div>
                `;
                return;
            }

            body.innerHTML = `
                <div class="cbh-table-wrap">
                    <table class="cbh-table">
                        <thead>
                            <tr>
                                <th>Payment</th>
                                <th>Bill / Package</th>
                                <th>Discount</th>
                                <th>Previous Balance</th>
                                <th>Current Balance</th>
                                <th>Medium / Type</th>
                                <th>Collected By</th>
                                <th>Payment Date</th>
                                <th>Bill Date</th>
                                <th>Promise Date</th>
                                <th>Note</th>
                                <th>Action</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${rows.map((row) => `
                                <tr>
                                    <td>
                                        <strong>
                                            #${escapeHtml(row.id)}
                                        </strong>

                                        <div class="cbh-muted">
                                            ${formatDate(
                                                row.created_at ||
                                                row.payment_date
                                            )}
                                        </div>
                                    </td>

                                    <td>
                                        <strong>
                                            ${money(row.amount)}
                                        </strong>

                                        <div class="cbh-muted">
                                            ${escapeHtml(
                                                row.package_name || "—"
                                            )}
                                        </div>
                                    </td>

                                    <td>${money(row.discount)}</td>

                                    <td>
                                        ${money(row.balance_before)}
                                    </td>

                                    <td>
                                        ${money(row.balance_after)}
                                    </td>

                                    <td>
                                        ${escapeHtml(
                                            row.payment_method || "—"
                                        )}

                                        <div class="cbh-muted">
                                            ${escapeHtml(
                                                row.bill_type || "bill"
                                            )}
                                        </div>
                                    </td>

                                    <td>
                                        ${escapeHtml(
                                            row.collected_by || "—"
                                        )}
                                    </td>

                                    <td>
                                        ${formatDate(row.payment_date)}
                                    </td>

                                    <td>
                                        ${escapeHtml(row.bill_date || "—")}
                                    </td>

                                    <td>
                                        ${escapeHtml(
                                            row.promise_date || "—"
                                        )}
                                    </td>

                                    <td class="cbh-note">
                                        ${escapeHtml(
                                            row.comments ||
                                            row.note ||
                                            "—"
                                        )}
                                    </td>

                                    <td>
                                        <button
                                            type="button"
                                            class="cbh-delete"
                                            data-payment-id="${escapeHtml(
                                                row.id
                                            )}"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (error) {
            if (
                requestId !== historyRequestId ||
                customerId !== activeCustomerId ||
                !modal.classList.contains("open")
            ) {
                return;
            }

            console.error(
                "Customer Bill History error:",
                error
            );

            body.innerHTML = `
                <div class="cbh-message cbh-error">
                    ${escapeHtml(
                        error.message || "Failed to load history."
                    )}
                </div>
            `;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | CANCEL / DELETE PAYMENT
    |--------------------------------------------------------------------------
    */

    async function cancelPayment(paymentId, button) {
        const id = Number(paymentId);

        if (!Number.isSafeInteger(id) || id <= 0) {
            alert("Invalid payment ID.");
            return;
        }

        if (!window.confirm(
            "এই পেমেন্টটি বাতিল করতে চান?\n" +
            "বাতিল হলে এটি সাধারণ Collection Report থেকেও বাদ যাবে।"
        )) {
            return;
        }

        /*
         * Obtain a fresh CSRF token before sending the POST request.
         */

        let csrf;

        try {
            csrf = await getCsrfToken();
        } catch (error) {
            console.error("CSRF token error:", error);

            alert(
                error.message ||
                "CSRF token পাওয়া যায়নি।"
            );

            return;
        }

        if (!csrf) {
            alert("CSRF token খালি।");
            return;
        }

        const originalText = button.textContent;

        button.disabled = true;
        button.textContent = "Processing...";

        try {
            const response = await fetch(
                "/reports/api/customer-bill-history/" +
                encodeURIComponent(id) +
                "/cancel",
                {
                    method: "POST",
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json",
                        "X-CSRF-Token": csrf
                    },
                    body: JSON.stringify({
                        csrf_token: csrf
                    })
                }
            );

            const result = await readJson(response);

            alert(
                result.message ||
                "Payment cancelled successfully."
            );

            await loadHistory();
        } catch (error) {
            console.error(
                "Payment cancellation error:",
                error
            );

            alert(
                error.message ||
                "Payment cancellation failed."
            );
        } finally {
            if (button.isConnected) {
                button.disabled = false;
                button.textContent = originalText;
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | CUSTOMER BILL HISTORY BUTTON
    |--------------------------------------------------------------------------
    */

    document.addEventListener("click", (event) => {
        const target = event.target;

        if (!(target instanceof Element)) {
            return;
        }

        const link = target.closest(".customer-bill-report-btn");

        if (!link) {
            return;
        }

        event.preventDefault();

        const customerId =
            link.dataset.id ||
            new URL(
                link.href || window.location.href,
                window.location.origin
            ).searchParams.get("customer_id");

        open(customerId);
    });

    /*
    |--------------------------------------------------------------------------
    | PUBLIC API
    |--------------------------------------------------------------------------
    */

    window.CustomerBillHistory = {
        open,
        close,
        reload: loadHistory
    };

})();
