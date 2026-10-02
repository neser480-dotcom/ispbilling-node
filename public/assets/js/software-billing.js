"use strict";

/*
|--------------------------------------------------------------------------
| SOFTWARE BILLING
|--------------------------------------------------------------------------
| Handles:
| - Current billing
| - CSRF
| - Payment history
| - Manual payment
| - Receipt
|--------------------------------------------------------------------------
*/

document.addEventListener("DOMContentLoaded", () => {

    const loading =
        document.getElementById("billingLoading");

    const content =
        document.getElementById("billingContent");

    const billingId =
        document.getElementById("billingId");

    const csrfInput =
        document.getElementById("csrfToken");

    const amountInput =
        document.getElementById("paymentAmount");

    const packageElement =
        document.getElementById("billingPackage");

    const usersElement =
        document.getElementById("billingUsers");

    const rateElement =
        document.getElementById("billingRate");

    const amountElement =
        document.getElementById("billingAmount");

    const statusElement =
        document.getElementById("billingStatus");

    const noticeElement =
        document.getElementById("billingNotice");

    const historyElement =
        document.getElementById("billingHistory");

    const form =
        document.getElementById("manualPaymentForm");


    /*
    |--------------------------------------------------------------------------
    | HELPERS
    |--------------------------------------------------------------------------
    */

    function escapeHtml(value) {

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    function money(value) {

        const number =
            Number(value || 0);

        return number.toFixed(2);
    }


    function showError(message) {

        if (loading) {

            loading.className =
                "notice error";

            loading.textContent =
                message;

            loading.style.display =
                "block";
        }
    }


    function showNotice(
        message,
        type = ""
    ) {

        if (!noticeElement) {
            return;
        }

        noticeElement.className =
            "notice" +
            (type ? ` ${type}` : "");

        noticeElement.textContent =
            message;
    }


    /*
    |--------------------------------------------------------------------------
    | CSRF
    |--------------------------------------------------------------------------
    */

    async function loadCsrf() {

        const response =
            await fetch(
                "/api/software-billing/csrf",
                {
                    method: "GET",
                    credentials: "same-origin",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        const data =
            await response.json();

        if (!response.ok || !data.success) {

            throw new Error(
                data.message ||
                "Unable to obtain CSRF token."
            );
        }

        if (csrfInput) {

            csrfInput.value =
                data.csrf_token || "";
        }

        return data.csrf_token || "";
    }


    /*
    |--------------------------------------------------------------------------
    | CURRENT BILLING
    |--------------------------------------------------------------------------
    */

    async function loadCurrentBilling() {

        const response =
            await fetch(
                "/api/software-billing/current",
                {
                    method: "GET",
                    credentials: "same-origin",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        const data =
            await response.json();

        if (!response.ok || !data.success) {

            throw new Error(
                data.message ||
                "Unable to load billing information."
            );
        }

        return data;
    }


    /*
    |--------------------------------------------------------------------------
    | HISTORY
    |--------------------------------------------------------------------------
    */

    async function loadHistory() {

        if (!historyElement) {
            return;
        }

        historyElement.innerHTML =
            `<div class="billing-loading">
                Loading payment history...
            </div>`;

        try {

            const response =
                await fetch(
                    "/api/software-billing/history",
                    {
                        method: "GET",
                        credentials: "same-origin",
                        headers: {
                            "Accept":
                                "application/json"
                        }
                    }
                );

            const data =
                await response.json();

            if (!response.ok || !data.success) {

                throw new Error(
                    data.message ||
                    "Unable to load payment history."
                );
            }

            const rows =
                Array.isArray(data.rows)
                    ? data.rows
                    : Array.isArray(data.history)
                        ? data.history
                        : [];

            if (!rows.length) {

                historyElement.innerHTML =
                    `<div class="notice">
                        No payment history found.
                    </div>`;

                return;
            }


            let html = `
                <div class="billing-history-wrapper">
                    <table class="billing-history-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Amount</th>
                                <th>Method</th>
                                <th>Status</th>
                                <th>Date</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
            `;


            for (const row of rows) {

                const status =
                    String(
                        row.status || ""
                    ).toLowerCase();

                const statusClass =
                    status === "paid"
                        ? "status-paid"
                        : "status-unpaid";

                const receiptId =
                    Number(
                        row.id ||
                        row.payment_id ||
                        0
                    );

                const date =
                    row.paid_at ||
                    row.payment_date ||
                    row.created_at ||
                    "-";


                html += `
                    <tr>
                        <td>
                            ${escapeHtml(
                                row.id || "-"
                            )}
                        </td>

                        <td>
                            ${money(
                                row.amount
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                row.payment_method ||
                                row.method ||
                                "-"
                            )}
                        </td>

                        <td class="${statusClass}">
                            ${escapeHtml(
                                row.status ||
                                "-"
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                date
                            )}
                        </td>

                        <td>
                            ${
                                receiptId > 0
                                    ? `
                                    <a
                                        href="/api/software-billing/receipt?id=${encodeURIComponent(receiptId)}"
                                        target="_blank"
                                        class="receipt-btn"
                                    >
                                        Receipt
                                    </a>
                                    `
                                    : "-"
                            }
                        </td>
                    </tr>
                `;
            }


            html += `
                        </tbody>
                    </table>
                </div>
            `;

            historyElement.innerHTML =
                html;

        } catch (error) {

            console.error(
                "Billing history error:",
                error
            );

            historyElement.innerHTML =
                `<div class="notice error">
                    ${escapeHtml(
                        error.message ||
                        "Unable to load payment history."
                    )}
                </div>`;
        }
    }


    /*
    |--------------------------------------------------------------------------
    | DISPLAY CURRENT BILLING
    |--------------------------------------------------------------------------
    */

    function displayBilling(data) {

        const billing =
            data.billing ||
            data.data ||
            data.notification ||
            null;


        if (!billing) {

            showNotice(
                "No unpaid software billing found.",
                "success"
            );

            if (statusElement) {

                statusElement.textContent =
                    "PAID";

                statusElement.className =
                    "badge-paid";
            }

            if (form) {
                form.style.display =
                    "none";
            }

            return;
        }


        const id =
            Number(
                billing.id || 0
            );

        const amount =
            Number(
                billing.amount || 0
            );

        const users =
            Number(
                billing.user_count || 0
            );

        const rate =
            Number(
                billing.rate_per_user || 0
            );


        if (billingId) {

            billingId.value =
                id;
        }


        if (amountInput) {

            amountInput.value =
                amount.toFixed(2);
        }


        if (packageElement) {

            packageElement.textContent =
                billing.package_code ||
                billing.package_name ||
                "-";
        }


        if (usersElement) {

            usersElement.textContent =
                users > 0
                    ? String(users)
                    : "-";
        }


        if (rateElement) {

            rateElement.textContent =
                rate > 0
                    ? money(rate)
                    : "-";
        }


        if (amountElement) {

            amountElement.textContent =
                money(amount);
        }


        if (statusElement) {

            statusElement.textContent =
                String(
                    billing.status ||
                    "UNPAID"
                ).toUpperCase();

            statusElement.className =
                String(
                    billing.status ||
                    "unpaid"
                ).toLowerCase() === "paid"
                    ? "badge-paid"
                    : "badge-unpaid";
        }


        showNotice(
            `Software billing payment of ${money(amount)} is required.`,
            ""
        );
    }


    /*
    |--------------------------------------------------------------------------
    | MANUAL PAYMENT
    |--------------------------------------------------------------------------
    */

    async function submitManualPayment(event) {

        event.preventDefault();

        if (!form) {
            return;
        }


        const formData =
            new FormData(form);

        const payload = {

            billing_id:
                formData.get("billing_id"),

            amount:
                formData.get("amount"),

            payment_method:
                formData.get("payment_method"),

            reference:
                formData.get("reference"),

            note:
                formData.get("note"),

            csrf_token:
                formData.get("csrf_token")
        };


        if (
            !payload.billing_id ||
            !payload.amount ||
            !payload.payment_method
        ) {

            showNotice(
                "Please complete the required payment fields.",
                "error"
            );

            return;
        }


        const submitButton =
            form.querySelector(
                'button[type="submit"]'
            );

        if (submitButton) {

            submitButton.disabled =
                true;

            submitButton.textContent =
                "Submitting...";
        }


        try {

            const response =
                await fetch(
                    "/api/software-billing/admin/manual-pay",
                    {
                        method: "POST",
                        credentials: "same-origin",
                        headers: {
                            "Content-Type":
                                "application/json",

                            "Accept":
                                "application/json"
                        },

                        body:
                            JSON.stringify(
                                payload
                            )
                    }
                );


            const data =
                await response.json();


            if (!response.ok || !data.success) {

                throw new Error(
                    data.message ||
                    "Payment could not be submitted."
                );
            }


            showNotice(
                data.message ||
                "Payment submitted successfully.",
                "success"
            );


            if (form) {
                form.reset();
            }


            await loadCurrentBilling();

            await loadHistory();


            /*
            |--------------------------------------------------------------------------
            | RELOAD
            |--------------------------------------------------------------------------
            | If payment has been completed, the billing gate
            | should allow the dashboard again.
            |--------------------------------------------------------------------------
            */

            setTimeout(() => {

                window.location.href =
                    "/dashboard";

            }, 1200);


        } catch (error) {

            console.error(
                "Manual payment error:",
                error
            );

            showNotice(
                error.message ||
                "Unable to submit payment.",
                "error"
            );

        } finally {

            if (submitButton) {

                submitButton.disabled =
                    false;

                submitButton.textContent =
                    "Submit Payment";
            }
        }
    }


    /*
    |--------------------------------------------------------------------------
    | INITIALIZE
    |--------------------------------------------------------------------------
    */

    async function init() {

        try {

            /*
            | Get CSRF first.
            */
            await loadCsrf();


            /*
            | Load current billing.
            */
            const current =
                await loadCurrentBilling();


            displayBilling(
                current
            );


            /*
            | Load history.
            */
            await loadHistory();


            /*
            | Show content.
            */
            if (loading) {

                loading.style.display =
                    "none";
            }

            if (content) {

                content.style.display =
                    "block";
            }


        } catch (error) {

            console.error(
                "Software billing initialization error:",
                error
            );

            showError(
                error.message ||
                "Unable to load software billing."
            );
        }
    }


    /*
    |--------------------------------------------------------------------------
    | FORM EVENT
    |--------------------------------------------------------------------------
    */

    if (form) {

        form.addEventListener(
            "submit",
            submitManualPayment
        );
    }


    /*
    |--------------------------------------------------------------------------
    | START
    |--------------------------------------------------------------------------
    */

    init();

});
