"use strict";

document.addEventListener("DOMContentLoaded", function () {

    const loading =
        document.getElementById("receiptLoading");

    const errorBox =
        document.getElementById("receiptError");

    const content =
        document.getElementById("receiptContent");


    function get(id) {
        return document.getElementById(id);
    }


    function text(value, fallback = "-") {

        if (
            value === null ||
            value === undefined ||
            String(value).trim() === ""
        ) {
            return fallback;
        }

        return String(value);
    }


    function money(value) {

        const number = Number(value);

        if (!Number.isFinite(number)) {
            return "-";
        }

        return "৳" +
            number.toLocaleString(
                "en-BD",
                {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }
            );
    }


    function formatDate(value) {

        if (!value) {
            return "-";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return text(value);
        }

        return date.toLocaleString(
            "en-BD",
            {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }
        );
    }


    function showError(message) {

        if (loading) {
            loading.style.display = "none";
        }

        if (content) {
            content.style.display = "none";
        }

        if (errorBox) {

            errorBox.textContent =
                message ||
                "Unable to load payment receipt.";

            errorBox.style.display = "block";
        }
    }


    const params =
        new URLSearchParams(
            window.location.search
        );


    const billingId =
        params.get("billing_id");

    const paymentId =
        params.get("payment_id");


    if (
        !billingId ||
        !paymentId
    ) {

        showError(
            "Invalid receipt information."
        );

        return;
    }


    const url =
        "/api/software-billing/receipt" +
        "?billing_id=" +
        encodeURIComponent(billingId) +
        "&payment_id=" +
        encodeURIComponent(paymentId);


    fetch(
        url,
        {
            method: "GET",

            credentials:
                "same-origin",

            headers: {
                "Accept":
                    "application/json"
            },

            cache:
                "no-store"
        }
    )

    .then(async function (response) {

        let data;

        try {

            data =
                await response.json();

        } catch (error) {

            throw new Error(
                "Invalid server response."
            );
        }


        if (
            !response.ok ||
            !data ||
            !data.success
        ) {

            throw new Error(
                data?.message ||
                "Unable to load payment receipt."
            );
        }


        return data;

    })

    .then(function (data) {

        /*
        |--------------------------------------------------------------------------
        | ACTUAL API RESPONSE
        |--------------------------------------------------------------------------
        |
        | {
        |     success: true,
        |     receipt: {...}
        | }
        |
        */

        const payment =
            data.receipt;


        if (!payment) {

            throw new Error(
                "Receipt data was not returned by the server."
            );
        }


        get(
            "receiptPaymentId"
        ).textContent =
            "#" +
            text(payment.id);


        get(
            "receiptBillingId"
        ).textContent =
            "#" +
            text(payment.billing_id);


        get(
            "receiptUser"
        ).textContent =
            text(
                payment.name ||
                payment.fullname ||
                payment.username ||
                payment.user_id
            );


        get(
            "receiptCompany"
        ).textContent =
            text(
                payment.company_id
            );


        get(
            "receiptBillingType"
        ).textContent =
            text(
                payment.billing_type
            );


        get(
            "receiptPackage"
        ).textContent =
            text(
                payment.package_code
            );


        get(
            "receiptMethod"
        ).textContent =
            text(
                payment.payment_mode
            );


        get(
            "receiptReference"
        ).textContent =
            text(
                payment.reference_no
            );


        get(
            "receiptAmount"
        ).textContent =
            money(
                payment.amount
            );


        get(
            "receiptCurrency"
        ).textContent =
            text(
                payment.currency,
                "BDT"
            );


        get(
            "receiptStatus"
        ).textContent =
            text(
                payment.status,
                "paid"
            ).toUpperCase();


        get(
            "receiptPaidAt"
        ).textContent =
            formatDate(
                payment.paid_at
            );


        get(
            "receiptNote"
        ).textContent =
            text(
                payment.payment_note
            );


        if (loading) {
            loading.style.display =
                "none";
        }


        if (errorBox) {
            errorBox.style.display =
                "none";
        }


        if (content) {
            content.style.display =
                "block";
        }

    })

    .catch(function (error) {

        console.error(
            "RECEIPT LOAD ERROR:",
            error
        );

        showError(
            error.message ||
            "Unable to load payment receipt."
        );

    });


    const printButton =
        get("printReceipt");


    if (printButton) {

        printButton.addEventListener(
            "click",
            function () {

                window.print();

            }
        );
    }

});