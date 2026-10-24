
/*
|--------------------------------------------------------------------------
| CUSTOMER ACTIONS
|--------------------------------------------------------------------------
| Handles:
| - Profile popup
| - Edit popup
| - Update customer
| - Delete customer
| - Single recharge popup
| - CSV template
| - CSV import
|--------------------------------------------------------------------------
|
| Bulk actions are NOT handled here.
|--------------------------------------------------------------------------
*/

(function () {

    "use strict";


    /*
    |--------------------------------------------------------------------------
    | HELPERS
    |--------------------------------------------------------------------------
    */

    function notify(type, message) {

        if (window.Swal) {

            window.Swal.fire({
                toast: true,
                position: "top-end",
                icon: type,
                title: message,
                showConfirmButton: false,
                timer: 3500
            });

        } else {

            alert(message);
        }
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


    function getCsrfToken() {

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

        if (input && input.value) {
            return input.value;
        }


        return "";
    }


    function getActionModal() {

        const modalEl =
            document.getElementById(
                "customerActionModal"
            );

        if (
            !modalEl ||
            !window.bootstrap
        ) {
            return null;
        }


        return {
            element: modalEl,

            modal:
                window.bootstrap.Modal
                    .getOrCreateInstance(
                        modalEl
                    ),

            title:
                document.getElementById(
                    "customerActionModalLabel"
                ),

            body:
                document.getElementById(
                    "customerActionModalBody"
                )
        };
    }


    function showActionLoading(title) {

        const modal =
            getActionModal();

        if (!modal) {
            return null;
        }


        if (modal.title) {
            modal.title.textContent =
                title || "Customer Action";
        }


        if (modal.body) {

            modal.body.innerHTML = `
                <div class="text-center py-5">
                    <div
                        class="spinner-border text-primary"
                        role="status"
                    ></div>

                    <div class="mt-3 text-muted">
                        Loading...
                    </div>
                </div>
            `;
        }


        modal.modal.show();

        return modal;
    }


    async function loadActionFragment(
        url,
        title
    ) {

        const modal =
            showActionLoading(title);

        if (!modal) {
            return;
        }


        try {

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
                    stripHtml(html) ||
                    "Failed to load customer action."
                );
            }


            if (modal.body) {
                modal.body.innerHTML =
                    html;
            }


        } catch (error) {

            if (modal.body) {

                modal.body.innerHTML = `
                    <div class="alert alert-danger">
                        ${escapeHtml(
                            error.message ||
                            "Failed to load."
                        )}
                    </div>
                `;
            }
        }
    }


    function stripHtml(html) {

        const div =
            document.createElement(
                "div"
            );

        div.innerHTML =
            String(html || "");

        return (
            div.textContent ||
            div.innerText ||
            ""
        ).trim();
    }


    /*
    |--------------------------------------------------------------------------
    | URL FLASH
    |--------------------------------------------------------------------------
    */

    (function flashFromUrl() {

        const params =
            new URLSearchParams(
                window.location.search
            );


        const msg =
            params.get("msg");

        const err =
            params.get("error");


        if (!msg && !err) {
            return;
        }


        window.addEventListener(
            "load",
            function () {

                notify(
                    err
                        ? "error"
                        : "success",

                    err || msg
                );
            }
        );


        params.delete("msg");
        params.delete("error");


        const qs =
            params.toString();


        window.history.replaceState(
            {},
            "",
            window.location.pathname +
            (
                qs
                    ? "?" + qs
                    : ""
            )
        );

    })();


    /*
    |--------------------------------------------------------------------------
    | PROFILE
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "click",
        function (event) {

            const button =
                event.target.closest(
                    ".customer-profile-btn"
                );


            if (!button) {
                return;
            }


            event.preventDefault();


            const id =
                Number(button.dataset.id);


            if (!id) {

                notify(
                    "error",
                    "Invalid customer ID."
                );

                return;
            }


            loadActionFragment(
                "/api/customers/profile?id=" +
                encodeURIComponent(id),

                "Customer Profile"
            );
        }
    );


    /*
    |--------------------------------------------------------------------------
    | EDIT
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "click",
        function (event) {

            const button =
                event.target.closest(
                    ".customer-edit-btn"
                );


            if (!button) {
                return;
            }


            event.preventDefault();


            const id =
                Number(button.dataset.id);


            if (!id) {

                notify(
                    "error",
                    "Invalid customer ID."
                );

                return;
            }


            loadActionFragment(
                "/api/customers/edit?id=" +
                encodeURIComponent(id),

                "Edit Customer"
            );
        }
    );


    


    /*
    |--------------------------------------------------------------------------
    | DELETE CUSTOMER
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "click",
        async function (event) {

            const button =
                event.target.closest(
                    ".delete-customer-btn"
                );


            if (!button) {
                return;
            }


            event.preventDefault();


            const id =
                Number(button.dataset.id);


            const name =
                button.dataset.name ||
                "this customer";


            if (!id) {

                notify(
                    "error",
                    "Invalid customer ID."
                );

                return;
            }


            let confirmed = false;


            if (window.Swal) {

                const result =
                    await window.Swal.fire({

                        title:
                            "Delete Customer?",

                        html:
                            `
                                <div class="text-center">
                                    <div class="mb-2">
                                        Are you sure you want to delete
                                        <strong>
                                            ${escapeHtml(name)}
                                        </strong>?
                                    </div>

                                    <div class="small text-danger">
                                        This action cannot be undone.
                                    </div>
                                </div>
                            `,

                        icon: "warning",

                        showCancelButton: true,

                        confirmButtonText:
                            "Yes, Delete",

                        cancelButtonText:
                            "Cancel",

                        reverseButtons: true
                    });


                confirmed =
                    result.isConfirmed;

            } else {

                confirmed =
                    window.confirm(
                        "Delete " +
                        name +
                        "?"
                    );
            }


            if (!confirmed) {
                return;
            }


            button.disabled = true;


            try {

                const formData =
                    new FormData();


                formData.append(
                    "id",
                    String(id)
                );


                const csrf =
                    getCsrfToken();


                if (csrf) {

                    formData.append(
                        "csrf_token",
                        csrf
                    );
                }


                const response =
                    await fetch(
                        "/api/customers/delete",
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


                const result =
                    await response.json();


                if (
                    !response.ok ||
                    !result.success
                ) {

                    throw new Error(
                        result.message ||
                        "Failed to delete customer."
                    );
                }


                notify(
                    "success",
                    result.message ||
                    "Customer deleted successfully."
                );


                if (
                    window.CustomerList &&
                    typeof window.CustomerList.refresh ===
                        "function"
                ) {

                    setTimeout(
                        function () {
                            window.CustomerList.refresh();
                        },
                        500
                    );

                } else {

                    setTimeout(
                        function () {
                            window.location.reload();
                        },
                        700
                    );
                }


            } catch (error) {

                notify(
                    "error",
                    error.message ||
                    "Failed to delete customer."
                );


                button.disabled = false;
            }
        }
    );


    /*
    |--------------------------------------------------------------------------
    | SINGLE RECHARGE
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "click",
        async function (event) {

            const button =
                event.target.closest(
                    ".recharge-single-btn"
                );


            if (!button) {
                return;
            }


            event.preventDefault();


            const modalEl =
                document.getElementById(
                    "rechargeModal"
                );


            const body =
                document.getElementById(
                    "rechargeModalBody"
                );


            if (
                !modalEl ||
                !body ||
                !window.bootstrap
            ) {
                return;
            }


            const modal =
                window.bootstrap.Modal
                    .getOrCreateInstance(
                        modalEl
                    );


            body.innerHTML =
                `
                    <div class="text-center py-4">
                        <div
                            class="spinner-border spinner-border-sm"
                        ></div>

                        <div class="mt-2 text-muted">
                            Loading...
                        </div>
                    </div>
                `;


            modal.show();


            try {

                const response =
                    await fetch(
                        "/api/customers/recharge?id=" +
                        encodeURIComponent(
                            button.dataset.id
                        ),
                        {
                            credentials:
                                "same-origin",

                            headers: {
                                "X-Requested-With":
                                    "XMLHttpRequest"
                            }
                        }
                    );


                const html =
                    await response.text();


                if (!response.ok) {

                    throw new Error(
                        stripHtml(html) ||
                        "Failed to load recharge form."
                    );
                }


                body.innerHTML =
                    html;


            } catch (error) {

                body.innerHTML =
                    `
                        <div class="alert alert-danger">
                            ${escapeHtml(
                                error.message ||
                                "Failed to load recharge form."
                            )}
                        </div>
                    `;
            }
        }
    );


    /*
    |--------------------------------------------------------------------------
    | RECHARGE SUBMIT
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "submit",
        async function (event) {

            const form =
                event.target.closest(
                    "#rechargeModalBody form"
                );


            if (!form) {
                return;
            }


            event.preventDefault();


            const submit =
                form.querySelector(
                    '[type="submit"]'
                );


            if (submit) {
                submit.disabled = true;
            }


            try {

                const formData =
                    new FormData(form);


                const csrf =
                    getCsrfToken();


                if (
                    csrf &&
                    !formData.has("csrf_token")
                ) {

                    formData.append(
                        "csrf_token",
                        csrf
                    );
                }


                const response =
                    await fetch(
                        form.action,
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


                const result =
                    await response.json();


                if (
                    !response.ok ||
                    !result.success
                ) {

                    throw new Error(
                        result.message ||
                        "Recharge failed."
                    );
                }


                notify(
                    result.mikrotik_ok === false
                        ? "warning"
                        : "success",

                    result.message ||
                    "Recharge successful."
                );


                const modalEl =
                    document.getElementById(
                        "rechargeModal"
                    );


                if (
                    modalEl &&
                    window.bootstrap
                ) {

                    window.bootstrap.Modal
                        .getOrCreateInstance(
                            modalEl
                        )
                        .hide();
                }


                if (
                    window.CustomerList &&
                    typeof window.CustomerList.refresh ===
                        "function"
                ) {

                    setTimeout(
                        function () {
                            window.CustomerList.refresh();
                        },
                        900
                    );

                } else {

                    setTimeout(
                        function () {
                            window.location.reload();
                        },
                        900
                    );
                }


            } catch (error) {

                notify(
                    "error",
                    error.message ||
                    "Recharge failed."
                );


                if (submit) {
                    submit.disabled = false;
                }
            }
        }
    );


    /*
    |--------------------------------------------------------------------------
    | CSV TEMPLATE
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "click",
        function (event) {

            if (
                event.target.closest(
                    "#csvTemplateModalBtn"
                )
            ) {

                window.location.href =
                    "/api/customers/csv/template";
            }
        }
    );


    /*
    |--------------------------------------------------------------------------
    | CSV IMPORT
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "submit",
        async function (event) {

            const form =
                event.target.closest(
                    "#csvImportForm"
                );


            if (!form) {
                return;
            }


            event.preventDefault();


            const box =
                document.getElementById(
                    "csvImportMessage"
                );


            const submit =
                document.getElementById(
                    "csvImportSubmit"
                );


            if (submit) {
                submit.disabled = true;
            }


            if (box) {

                box.innerHTML =
                    `
                        <div class="text-muted">
                            Importing...
                        </div>
                    `;
            }


            try {

                const formData =
                    new FormData(form);


                const csrf =
                    getCsrfToken();


                if (
                    csrf &&
                    !formData.has("csrf_token")
                ) {

                    formData.append(
                        "csrf_token",
                        csrf
                    );
                }


                const response =
                    await fetch(
                        "/api/customers/csv/import",
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


                const result =
                    await response.json();


                if (
                    !response.ok &&
                    !result.report
                ) {

                    throw new Error(
                        result.message ||
                        "Import failed."
                    );
                }


                const lines =
                    (
                        result.report &&
                        result.report.messages
                            ? result.report.messages
                            : []
                    )
                    .filter(
                        message =>
                            !/imported successfully/i
                                .test(message)
                    )
                    .slice(0, 20);


                if (box) {

                    box.innerHTML =
                        `
                            <div class="alert alert-${
                                result.success
                                    ? "success"
                                    : "danger"
                            } py-2 mb-2">
                                ${escapeHtml(
                                    result.message ||
                                    "Import completed."
                                )}
                            </div>
                        ` +

                        (
                            lines.length
                                ? `
                                    <ul class="small mb-0">
                                        ${
                                            lines
                                                .map(
                                                    line =>
                                                        `<li>${escapeHtml(line)}</li>`
                                                )
                                                .join("")
                                        }
                                    </ul>
                                  `
                                : ""
                        );
                }


                if (
                    result.report &&
                    result.report.inserted > 0
                ) {

                    setTimeout(
                        function () {

                            if (
                                window.CustomerList &&
                                typeof window.CustomerList.refresh ===
                                    "function"
                            ) {

                                window.CustomerList.refresh();

                            } else {

                                window.location.reload();
                            }

                        },
                        1200
                    );
                }


            } catch (error) {

                if (box) {

                    box.innerHTML =
                        `
                            <div class="alert alert-danger py-2">
                                ${escapeHtml(
                                    error.message ||
                                    "Import failed."
                                )}
                            </div>
                        `;
                }

            } finally {

                if (submit) {
                    submit.disabled = false;
                }
            }
        }
    );


    /*
    |--------------------------------------------------------------------------
    | MODAL CLEANUP
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "hidden.bs.modal",
        function (event) {

            if (
                event.target.id !==
                "customerActionModal"
            ) {
                return;
            }


            const title =
                document.getElementById(
                    "customerActionModalLabel"
                );


            const body =
                document.getElementById(
                    "customerActionModalBody"
                );


            if (title) {
                title.textContent =
                    "Customer Action";
            }


            if (body) {
                body.innerHTML = "";
            }
        }
    );

/*
|--------------------------------------------------------------------------
| CUSTOMER BILL HISTORY POPUP
|--------------------------------------------------------------------------
*/

document.addEventListener("click", function (event) {

    const link = event.target.closest(
        ".customer-bill-report-btn"
    );

    if (!link) {
        return;
    }

    event.preventDefault();

    const customerId = Number(link.dataset.id);

    if (!customerId) {
        notify("error", "Invalid customer ID.");
        return;
    }

    // Use the API exposed by customer-bill-history.js
    if (
        window.CustomerBillHistory &&
        typeof window.CustomerBillHistory.open === "function"
    ) {
        window.CustomerBillHistory.open(customerId);
        return;
    }

    console.error(
        "CustomerBillHistory.open is unavailable.",
        window.CustomerBillHistory
    );

    notify(
        "error",
        "Bill History popup function পাওয়া যাচ্ছে না।"
    );

});
})();