/* ---- Auto CSRF header for same-origin POST/PUT/PATCH/DELETE ---- */
(function () {
    if (window.__csrfFetchPatched) { return; }
    window.__csrfFetchPatched = true;

    const nativeFetch = window.fetch.bind(window);
    let cachedToken = "";

    async function getToken() {
        if (cachedToken) { return cachedToken; }
        const r = await nativeFetch("/api/csrf-token", {
            credentials: "same-origin",
            cache: "no-store"
        });
        const d = await r.json().catch(function () { return {}; });
        cachedToken = d.csrf_token || "";
        return cachedToken;
    }

    window.fetch = async function (input, init) {
        init = init || {};
        const method = String(
            init.method || (input && input.method) || "GET"
        ).toUpperCase();

        const url = typeof input === "string" ? input : (input && input.url) || "";
        const sameOrigin = url.startsWith("/") || url.startsWith(location.origin);

        if (sameOrigin && method !== "GET" && method !== "HEAD") {
            const token = await getToken();
            if (token) {
                const headers = new Headers(init.headers || {});
                if (!headers.has("X-CSRF-Token")) {
                    headers.set("X-CSRF-Token", token);
                }
                init.headers = headers;
            }
            if (!init.credentials) { init.credentials = "same-origin"; }
        }
        return nativeFetch(input, init);
    };
})();
"use strict";

/*
|--------------------------------------------------------------------------
| MIKROTIK LIST PAGE  (/mikrotik)
|--------------------------------------------------------------------------
| আপনার CSRF fetch-patch (mikrotik.js এর শুরুর অংশ) আগে লোড থাকতে হবে।
| Page load এ MikroTik এ কানেক্ট হয় না; শুধু DB থেকে লিস্ট আসে।
| Check/History বাটন চাপলেই কানেকশন হয়।
|
| GET    /api/router               লিস্ট
| POST   /api/router               নতুন
| PUT    /api/router/:id           এডিট (password খালি = আগেরটাই থাকবে)
| DELETE /api/router/:id           ডিলিট
| GET    /api/router/:id/check     কানেকশন চেক
| GET    /api/router/:id/history   Identity/Version/CPU তথ্য
|--------------------------------------------------------------------------
*/

document.addEventListener("DOMContentLoaded", () => {

    const API = "/api/router";

    const body = document.getElementById("routerTableBody");
    const search = document.getElementById("routerSearch");
    const totalEl = document.getElementById("totalRouter");
    const modalRoot = document.getElementById("modalRoot");

    let routers = [];
    let sortKey = "";
    let sortDir = 1;
    const status = new Map();      // id -> "ok" | "off"

    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });


    /* ---------- helpers ---------- */

    function esc(v) {
        return String(v ?? "")
            .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    async function request(url, options = {}) {

        const res = await fetch(url, {
            credentials: "same-origin",
            ...options,
            headers: {
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...(options.headers || {})
            }
        });

        let data;
        try { data = await res.json(); }
        catch (_) { throw new Error("Invalid server response."); }

        if (!res.ok || data.status === false || data.success === false) {
            throw new Error(data.message || "Request failed.");
        }
        return data;
    }

    function notify(type, message) {

        if (window.MkToast && typeof window.MkToast[type] === "function") {
            window.MkToast[type](message);
            return;
        }

        alert(message);
    }


    /* ---------- render ---------- */

    function visible() {

        const kw = search.value.trim().toLowerCase();

        let list = routers.map((r, i) => ({ ...r, idx: i + 1 }));

        if (kw) {
            list = list.filter(r =>
                [r.name, r.username, r.ip, r.port].join(" ").toLowerCase().includes(kw)
            );
        }

        if (sortKey) {
            list.sort((a, b) =>
                collator.compare(String(a[sortKey] ?? ""), String(b[sortKey] ?? "")) * sortDir
            );
        }

        return list;
    }

    function statusIcon(id) {

        const s = status.get(id);

        if (s === "ok")  { return '<i class="fa fa-plug-circle-check st-ok" title="Online"></i>'; }
        if (s === "off") { return '<i class="fa fa-plug-circle-xmark st-off" title="Offline"></i>'; }

        return '<i class="fa fa-plug-circle-bolt st-unknown" title="Not checked"></i>';
    }


    function setStatus(id, value) {

        status.set(id, value);

        const el = body.querySelector(`.router-status[data-id="${id}"]`);

        if (el) { el.innerHTML = statusIcon(id); }
    }

    /* পেজ লোডে আপনার আগের router-index.js এর মতোই সব রাউটারের স্ট্যাটাস চেক হয় */
    function checkAll() {

        routers.forEach(r => {

            const id = Number(r.id);

            request(`${API}/${id}/check`)
                .then(() => setStatus(id, "ok"))
                .catch(() => setStatus(id, "off"));
        });
    }

    function render() {

        const list = visible();

        totalEl.textContent = list.length;

        if (!list.length) {
            body.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No Mikrotik Found</td></tr>`;
            return;
        }

        body.innerHTML = list.map((r, i) => {

            const id = Number(r.id);

            return `
                <tr>
                    <td>${i + 1}</td>
                    <td class="router-status" data-id="${id}">${statusIcon(id)}</td>
                    <td>${esc(r.name)}</td>
                    <td>${esc(r.username)}</td>
                    <td>${esc(r.ip)}</td>
                    <td>${esc(r.port)}</td>
                    <td class="text-center text-nowrap">
                        <a class="router-action act-cfg" href="/mikrotik?id=${id}">
                            <i class="fa fa-gear"></i> Configure <i class="fa fa-arrow-right-long"></i>
                        </a>
                        <button type="button" class="router-action act-check" data-act="check" data-id="${id}" title="Check Connection">
                            <i class="fa fa-plug"></i>
                        </button>
                        <button type="button" class="router-action act-hist" data-act="history" data-id="${id}" title="History">
                            <i class="fa fa-table-list"></i>
                        </button>
                        <a class="router-action act-cross" href="/mikrotik/cross-customer?id=${id}" title="Cross Customer">
                            <i class="fa fa-user-minus"></i>
                        </a>
                        <button type="button" class="router-action act-del" data-act="delete" data-id="${id}" title="Delete">
                            <i class="fa fa-box-archive"></i>
                        </button>
                    </td>
                </tr>
            `;

        }).join("");
    }

    async function load() {

        try {
            const data = await request(API);
            routers = Array.isArray(data.routers) ? data.routers : [];
            render();
            checkAll();
        } catch (error) {
            body.innerHTML = `<tr><td colspan="7" class="text-center text-danger">${esc(error.message)}</td></tr>`;
            totalEl.textContent = 0;
        }
    }


    /* ---------- add / edit modal ---------- */

    function formModal(router) {

        const edit = !!router;

        modalRoot.innerHTML = `
            <div class="modal fade rt-modal" id="routerModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${edit ? "Edit Mikrotik" : "Add New Mikrotik"}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <form id="routerForm" autocomplete="off">
                            <div class="modal-body">
                                <div class="mb-3">
                                    <label class="form-label">Mikrotik Name</label>
                                    <input type="text" name="name" class="form-control" value="${esc(router?.name)}" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Mikrotik User Name</label>
                                    <input type="text" name="username" class="form-control" value="${esc(router?.username)}" autocomplete="off" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Mikrotik IP</label>
                                    <input type="text" name="ip" class="form-control" value="${esc(router?.ip)}" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Mikrotik Api Port</label>
                                    <input type="number" name="port" class="form-control" value="${esc(router?.port)}" min="1" max="65535" required>
                                </div>
                                <div class="mb-1">
                                    <label class="form-label">Mikrotik User Password</label>
                                    <input type="password" name="password" class="form-control" autocomplete="new-password" ${edit ? "" : "required"}>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                <button type="submit" class="btn btn-success">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;

        const el = document.getElementById("routerModal");
        const form = document.getElementById("routerForm");
        const modal = bootstrap.Modal.getOrCreateInstance(el);

        modal.show();

        form.addEventListener("submit", async event => {

            event.preventDefault();

            const btn = form.querySelector('button[type="submit"]');
            const payload = Object.fromEntries(new FormData(form));

            if (edit && !payload.password) { delete payload.password; }

            btn.disabled = true;

            try {

                await request(edit ? `${API}/${router.id}` : API, {
                    method: edit ? "PUT" : "POST",
                    body: JSON.stringify(payload)
                });

                modal.hide();
                await load();
                notify("success", edit ? "Mikrotik Updated" : "Mikrotik Added");

            } catch (error) {
                notify("error", error.message);
            } finally {
                btn.disabled = false;
            }
        });
    }


    /* ---------- history modal ---------- */

    async function showHistory(id) {

        const router = routers.find(r => Number(r.id) === id);

        Swal.fire({
            title: "Loading...",
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {

            const data = await request(`${API}/${id}/history`);
            const r = data.resource || {};

            const rows = [
                ["Identity", data.identity],
                ["Version", r.version],
                ["CPU", r.cpu],
                ["CPU Count", r["cpu-count"]],
                ["CPU Frequency", r["cpu-frequency"]],
                ["CPU Load", r["cpu-load"]],
                ["Architecture Name", r["architecture-name"]],
                ["Board Name", r["board-name"]],
                ["Platform", r.platform]
            ];

            Swal.close();

            modalRoot.innerHTML = `
                <div class="modal fade rt-modal" id="historyModal" tabindex="-1" aria-hidden="true">
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">${esc(router?.name || "Mikrotik")} Mikrotik History</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                ${rows.map(([k, v]) => `
                                    <div class="rt-history-row">
                                        <span>${k}:</span><span>${esc(v ?? "-")}</span>
                                    </div>`).join("")}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            bootstrap.Modal.getOrCreateInstance(document.getElementById("historyModal")).show();

        } catch (error) {
            Swal.close();
            notify("error", error.message);
        }
    }


    /* ---------- actions ---------- */

    body.addEventListener("click", async event => {

        const btn = event.target.closest("[data-act]");

        if (!btn) { return; }

        const id = Number(btn.dataset.id);
        const router = routers.find(r => Number(r.id) === id);

        if (btn.dataset.act === "history") {
            showHistory(id);
            return;
        }

        if (btn.dataset.act === "check") {

            btn.disabled = true;

            try {
                await request(`${API}/${id}/check`);
                setStatus(id, "ok");
                notify("success", `${router?.name || "Mikrotik"} এর কানেকশন ঠিক আছে`);
            } catch (error) {
                setStatus(id, "off");
                notify("error", error.message);
            } finally {
                btn.disabled = false;
            }
            return;
        }

        if (btn.dataset.act === "delete") {

            const ok = await Swal.fire({
                icon: "warning",
                title: "Delete Mikrotik?",
                text: "This action cannot be undone.",
                showCancelButton: true,
                confirmButtonText: "Delete",
                cancelButtonText: "Cancel"
            });

            if (!ok.isConfirmed) { return; }

            try {
                await request(`${API}/${id}`, { method: "DELETE" });
                await load();
                notify("success", "Mikrotik Deleted");
            } catch (error) {
                notify("error", error.message);
            }
        }
    });

    document.getElementById("addRouter").addEventListener("click", () => formModal(null));
    document.getElementById("refreshRouters").addEventListener("click", load);
    document.getElementById("routerVideo").addEventListener("click", () => {
        notify("warning", "Video link এখনো সেট করা নেই");
    });
    search.addEventListener("input", render);

    document.querySelectorAll("#routerTable thead th[data-sort]").forEach(th => {

        th.addEventListener("click", () => {

            const key = th.dataset.sort;

            if (sortKey === key) { sortDir = -sortDir; }
            else { sortKey = key; sortDir = 1; }

            document.querySelectorAll("#routerTable thead th[data-sort] .router-sort").forEach(icon => {
                const own = icon.closest("th").dataset.sort === sortKey;
                icon.classList.toggle("active", own);
            });

            render();
        });
    });

    load();

    setInterval(() => { if (!document.hidden) { load(); } }, 30000);
});
