/*
|--------------------------------------------------------------------------
| CUSTOMER ACTIONS (recharge popup)
|--------------------------------------------------------------------------
| .recharge-single-btn  -> GET /api/customers/recharge?id=  (HTML fragment)
| form inside the popup -> POST via fetch, JSON {success, message}
|--------------------------------------------------------------------------
*/
(function () {
    "use strict";

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

    /* ?msg= / ?error= after a native-form redirect (e.g. single delete) */
    (function flashFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const msg = params.get("msg");
        const err = params.get("error");

        if (!msg && !err) return;

        window.addEventListener("load", () => notify(err ? "error" : "success", err || msg));

        params.delete("msg");
        params.delete("error");

        const qs = params.toString();
        window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : ""));
    })();

    document.addEventListener("click", async function (event) {

        const button = event.target.closest(".recharge-single-btn");

        if (!button) return;

        event.preventDefault();

        const modalEl = document.getElementById("rechargeModal");
        const body = document.getElementById("rechargeModalBody");

        if (!modalEl || !body || !window.bootstrap) return;

        const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);

        body.innerHTML = '<div class="text-center py-4">Loading...</div>';
        modal.show();

        try {
            const response = await fetch(
                "/api/customers/recharge?id=" +
                encodeURIComponent(button.dataset.id),
                { credentials: "same-origin" }
            );

            body.innerHTML = await response.text();

        } catch (error) {
            body.innerHTML =
                '<div class="alert alert-danger">Failed to load recharge form.</div>';
        }
    });

    document.addEventListener("submit", async function (event) {

        const form = event.target.closest("#rechargeModalBody form");

        if (!form) return;

        event.preventDefault();

        const submit = form.querySelector('[type="submit"]');

        if (submit) submit.disabled = true;

        try {
            const response = await fetch(form.action, {
                method: "POST",
                body: new FormData(form),
                credentials: "same-origin",
                headers: { "X-Requested-With": "XMLHttpRequest" }
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "Recharge failed.");
            }

            notify(result.mikrotik_ok === false ? "warning" : "success", result.message);

            const modalEl = document.getElementById("rechargeModal");

            if (modalEl && window.bootstrap) {
                window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
            }

            setTimeout(() => window.location.reload(), 900);

        } catch (error) {
            notify("error", error.message);
            if (submit) submit.disabled = false;
        }
    });

    /* ---------- CSV template + import ---------- */
    document.addEventListener("click", function (event) {
        if (event.target.closest("#csvTemplateModalBtn")) {
            window.location.href = "/api/customers/csv/template";
        }
    });

    document.addEventListener("submit", async function (event) {

        const form = event.target.closest("#csvImportForm");

        if (!form) return;

        event.preventDefault();

        const box = document.getElementById("csvImportMessage");
        const submit = document.getElementById("csvImportSubmit");

        if (submit) submit.disabled = true;
        if (box) box.innerHTML = '<div class="text-muted">Importing...</div>';

        const esc = v => String(v).replace(/[&<>"']/g, c => (
            { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

        try {
            const response = await fetch("/api/customers/csv/import", {
                method: "POST",
                body: new FormData(form),
                credentials: "same-origin",
                headers: { "X-Requested-With": "XMLHttpRequest" }
            });

            const result = await response.json();

            if (!response.ok && !result.report) throw new Error(result.message || "Import failed.");

            const lines = ((result.report && result.report.messages) || [])
                .filter(m => !/imported successfully/.test(m)).slice(0, 20);

            if (box) {
                box.innerHTML =
                    `<div class="alert alert-${result.success ? "success" : "danger"} py-2 mb-2">${esc(result.message)}</div>` +
                    (lines.length ? `<ul class="small mb-0">${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : "");
            }

            if (result.report && result.report.inserted > 0) {
                setTimeout(() => window.location.reload(), 2500);
            }

        } catch (error) {
            if (box) box.innerHTML = `<div class="alert alert-danger py-2">${esc(error.message)}</div>`;
        } finally {
            if (submit) submit.disabled = false;
        }
    });
})();
