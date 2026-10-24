"use strict";

document.addEventListener("DOMContentLoaded", function () {

    const billingTableBody =
        document.getElementById("billingTableBody");

    const billingLoading =
        document.getElementById("billingLoading");

    const billingTableWrapper =
        document.getElementById("billingTableWrapper");

    const billingEmpty =
        document.getElementById("billingEmpty");

    const billingMessage =
        document.getElementById("billingMessage");

    const paymentLoading =
        document.getElementById("paymentLoading");

    const paymentContent =
        document.getElementById("paymentContent");

    const paymentMessage =
        document.getElementById("paymentMessage");

    const manualPaymentForm =
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


    function formatMoney(value) {

        const amount =
            Number(value || 0);

        return amount.toLocaleString(
            "en-BD",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        );
    }


    function showMessage(element, message) {

        if (!element) {
            return;
        }

        element.textContent =
            String(
                message ||
                "Something went wrong."
            );

        element.style.display =
            "block";
    }


    function hideElement(element) {

        if (element) {
            element.style.display =
                "none";
        }
    }


    function getBillingId() {

        const params =
            new URLSearchParams(
                window.location.search
            );

        return Number(
            params.get("id") || 0
        );
    }


    /*
    |--------------------------------------------------------------------------
    | CSRF
    |--------------------------------------------------------------------------
    */

    async function getCsrfToken() {

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

        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Unable to get CSRF token."
            );
        }

        return data.csrf_token;
    }


    /*
    |--------------------------------------------------------------------------
    | BILLING LIST API
    |--------------------------------------------------------------------------
    | IMPORTANT:
    | Super Admin manual billing page uses:
    |
    | /billing/manual/data
    |
    */

    async function getBillingList() {

        const response =
            await fetch(
                "/billing/manual/data",
                {
                    method: "GET",
                    credentials: "same-origin",
                    headers: {
                        "Accept":
                            "application/json"
                    },
                    cache: "no-store"
                }
            );

        const data =
            await response.json();

        if (
            response.status === 401 ||
            response.status === 403
        ) {

            throw new Error(
                data.message ||
                "Super Admin access required."
            );
        }

        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Unable to load billing records."
            );
        }

        return data;
    }


    /*
    |--------------------------------------------------------------------------
    | MANUAL BILLING LIST
    |--------------------------------------------------------------------------
    */

    async function loadBillingList() {

        if (!billingTableBody) {
            return;
        }

        try {

            const data =
                await getBillingList();

            const rows =
                Array.isArray(data.rows)
                    ? data.rows
                    : [];

            hideElement(
                billingLoading
            );

            hideElement(
                billingEmpty
            );

            hideElement(
                billingMessage
            );

            if (!rows.length) {

                if (billingTableWrapper) {
                    billingTableWrapper.style.display =
                        "none";
                }

                if (billingEmpty) {
                    billingEmpty.style.display =
                        "block";
                }

                return;
            }


            billingTableBody.innerHTML =
                rows.map(function (row) {

                    const id =
                        Number(
                            row.id || 0
                        );

                    const status =
                        String(
                            row.status || ""
                        )
                        .trim()
                        .toLowerCase();


                    /*
                    |----------------------------------------------------------
                    | STATUS
                    |----------------------------------------------------------
                    */

                    const statusHtml =
                        status === "unpaid"
                            ? `
                                <span class="badge-unpaid">
                                    unpaid
                                </span>
                              `
                            : `
                                <span>
                                    ${escapeHtml(
                                        row.status || ""
                                    )}
                                </span>
                              `;


                    /*
                    |----------------------------------------------------------
                    | ACTION
                    |----------------------------------------------------------
                    */

                    const actionHtml =
                        status === "unpaid"
                            ? `
                                <a
                                    class="manual"
                                    href="/billing/manual/mark-paid?id=${id}"
                                >
                                    Manual Paid
                                </a>
                              `
                            : `
                                <span>
                                    Paid
                                </span>
                              `;


                    /*
                    |----------------------------------------------------------
                    | DUE DATE
                    |----------------------------------------------------------
                    */

                    let dueDate =
                        row.due_date || "";

                    if (dueDate) {

                        try {

                            const date =
                                new Date(
                                    dueDate
                                );

                            if (
                                !Number.isNaN(
                                    date.getTime()
                                )
                            ) {

                                dueDate =
                                    date.toLocaleString(
                                        "en-BD",
                                        {
                                            year: "numeric",
                                            month: "2-digit",
                                            day: "2-digit",
                                            hour: "2-digit",
                                            minute: "2-digit"
                                        }
                                    );
                            }

                        } catch (error) {

                            /*
                             * Keep original date
                             * if parsing fails.
                             */

                        }
                    }


                    return `
                        <tr>

                            <td>
                                #${id}
                            </td>

                            <td>
                                ${escapeHtml(
                                    row.user_name ||
                                    row.name ||
                                    row.username ||
                                    (
                                        "User #" +
                                        (
                                            row.user_id ||
                                            ""
                                        )
                                    )
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    row.company_id ?? ""
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    row.billing_type ?? ""
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    row.package_code ?? ""
                                )}
                            </td>

                            <td>
                                ৳${formatMoney(
                                    row.amount
                                )}
                            </td>

                            <td>
                                ${statusHtml}
                            </td>

                            <td>
                                ${escapeHtml(
                                    dueDate
                                )}
                            </td>

                            <td>
                                ${actionHtml}
                            </td>

                        </tr>
                    `;

                }).join("");


            billingTableWrapper.style.display =
                "block";

        } catch (error) {

            hideElement(
                billingLoading
            );

            if (billingTableWrapper) {
                billingTableWrapper.style.display =
                    "none";
            }

            showMessage(
                billingMessage,
                error.message
            );
        }
    }


    /*
    |--------------------------------------------------------------------------
    | CONFIRM PAYMENT PAGE
    |--------------------------------------------------------------------------
    */

    async function loadPaymentPage() {

        if (!paymentContent) {
            return;
        }

        const billingId =
            getBillingId();


        if (
            !Number.isInteger(
                billingId
            ) ||
            billingId <= 0
        ) {

            hideElement(
                paymentLoading
            );

            showMessage(
                paymentMessage,
                "Invalid billing ID."
            );

            return;
        }


        try {

            const data =
                await getBillingList();

            const rows =
                Array.isArray(data.rows)
                    ? data.rows
                    : [];


            const billing =
                rows.find(
                    function (row) {

                        return Number(
                            row.id
                        ) === billingId;

                    }
                );


            if (!billing) {

                throw new Error(
                    "Billing record not found."
                );
            }


            /*
            |----------------------------------------------------------
            | Already paid
            |----------------------------------------------------------
            */

            if (
                String(
                    billing.status || ""
                )
                    .trim()
                    .toLowerCase() === "paid"
            ) {

                window.location.href =
                    "/billing/manual";

                return;
            }


            const billingIdElement =
                document.getElementById(
                    "billingId"
                );

            const userIdElement =
                document.getElementById(
                    "userId"
                );

            const packageCodeElement =
                document.getElementById(
                    "packageCode"
                );

            const billingAmountElement =
                document.getElementById(
                    "billingAmount"
                );


            if (billingIdElement) {

                billingIdElement.textContent =
                    "#" + billingId;
            }


            if (userIdElement) {

                userIdElement.textContent =
                    "#" +
                    (
                        billing.user_id ??
                        ""
                    );
            }


            if (packageCodeElement) {

                packageCodeElement.textContent =
                    billing.package_code ||
                    "";
            }


            if (billingAmountElement) {

                billingAmountElement.textContent =
                    "৳" +
                    formatMoney(
                        billing.amount
                    );
            }


            hideElement(
                paymentLoading
            );

            paymentContent.style.display =
                "block";

        } catch (error) {

            hideElement(
                paymentLoading
            );

            showMessage(
                paymentMessage,
                error.message
            );
        }
    }


    /*
    |--------------------------------------------------------------------------
    | SUBMIT MANUAL PAYMENT
    |--------------------------------------------------------------------------
    */

    if (manualPaymentForm) {

        manualPaymentForm.addEventListener(
            "submit",
            async function (event) {

                event.preventDefault();


                const billingId =
                    getBillingId();


                if (
                    !Number.isInteger(
                        billingId
                    ) ||
                    billingId <= 0
                ) {

                    showMessage(
                        paymentMessage,
                        "Invalid billing ID."
                    );

                    return;
                }


                const button =
                    document.getElementById(
                        "confirmPaymentButton"
                    );


                const originalText =
                    button
                        ? button.textContent
                        : "Confirm Paid";


                if (button) {

                    button.disabled =
                        true;

                    button.textContent =
                        "Processing...";
                }


                hideElement(
                    paymentMessage
                );


                try {

                    const csrfToken =
                        await getCsrfToken();


                    const methodElement =
                        document.getElementById(
                            "paymentMethod"
                        );

                    const referenceElement =
                        document.getElementById(
                            "paymentReference"
                        );

                    const noteElement =
                        document.getElementById(
                            "paymentNote"
                        );


                    const method =
                        methodElement
                            ? methodElement.value
                            : "Other";


                    const reference =
                        referenceElement
                            ? referenceElement.value.trim()
                            : "";


                    const note =
                        noteElement
                            ? noteElement.value.trim()
                            : "";


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
                                    JSON.stringify({
                                        csrf:
                                            csrfToken,
                                        billing_id:
                                            billingId,
                                        method:
                                            method,
                                        reference:
                                            reference,
                                        note:
                                            note
                                    })
                            }
                        );


                    const data =
                        await response.json();


                    if (
                        response.status === 401 ||
                        response.status === 403
                    ) {

                        throw new Error(
                            data.message ||
                            "Super Admin access required."
                        );
                    }


                    if (
                        !response.ok ||
                        !data.success
                    ) {

                        throw new Error(
                            data.message ||
                            "Payment failed."
                        );
                    }


                    /*
                    |----------------------------------------------------------
                    | PAYMENT SUCCESS
                    |----------------------------------------------------------
                    */

                    if (data.redirect) {

                        window.location.href =
                            data.redirect;

                        return;
                    }


                    window.location.href =
                        "/billing/manual";

                } catch (error) {

                    showMessage(
                        paymentMessage,
                        error.message
                    );


                    if (button) {

                        button.disabled =
                            false;

                        button.textContent =
                            originalText;
                    }
                }

            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | START
    |--------------------------------------------------------------------------
    */

    if (billingTableBody) {

        loadBillingList();
    }


    if (paymentContent) {

        loadPaymentPage();
    }

});