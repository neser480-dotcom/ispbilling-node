
"use strict";

(function () {
    if (window.CustomerEditInitialized) return;
    window.CustomerEditInitialized = true;

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

    async function getCsrfToken() {
        const response = await fetch("/api/csrf-token", {
            method: "GET",
            credentials: "same-origin",
            headers: { "Accept": "application/json" }
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error("CSRF token পাওয়া যায়নি।");
        }

        const token =
            result.csrf_token ||
            result.csrfToken ||
            result.token;

        if (!token) {
            throw new Error("CSRF token response-এ নেই।");
        }

        return token;
    }

    document.addEventListener("submit", async function (event) {
        const form = event.target.closest(
            "#customerActionModalBody form.customer-edit-form"
        );

        if (!form) return;

        event.preventDefault();

        if (form.dataset.submitting === "1") return;

        const submit = form.querySelector('[type="submit"]');

        try {
            form.dataset.submitting = "1";

            if (submit) submit.disabled = true;

            const token = await getCsrfToken();
            const data = new FormData(form);

            data.set("csrf_token", token);

            const response = await fetch(
                form.action || "/api/customers/update",
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "X-Requested-With": "XMLHttpRequest",
                        "Accept": "application/json"
                    },
                    body: data
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || "Customer update ব্যর্থ হয়েছে।"
                );
            }

            notify("success", result.message || "Customer updated.");

            const modalElement =
                document.getElementById("customerActionModal");

            if (modalElement && window.bootstrap) {
                window.bootstrap.Modal
                    .getOrCreateInstance(modalElement)
                    .hide();
            }

            if (
                window.CustomerList &&
                typeof window.CustomerList.refresh === "function"
            ) {
                window.CustomerList.refresh();
            } else {
                window.location.reload();
            }

        } catch (error) {
            notify("error", error.message || "Customer update ব্যর্থ হয়েছে।");
        } finally {
            delete form.dataset.submitting;
            if (submit) submit.disabled = false;
        }
    });
})();
