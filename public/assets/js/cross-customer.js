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
| CROSS CUSTOMER PAGE
|--------------------------------------------------------------------------
| Extra Mikrotik Users : MikroTik এ আছে, NetFee তে নেই
|     GET    /api/router/:id/customers/sync-preview     (আছে)
|     DELETE /api/router/:id/customers/mikrotik/:user   (backend এ বানাতে হবে)
|
| Extra NetFee Users   : NetFee তে আছে, MikroTik এ নেই
|     GET    /api/router/:id/customers/extra-netfee     (backend এ বানাতে হবে)
|     DELETE /api/router/:id/customers/extra-netfee/:customerId (বানাতে হবে)
|
| Page load এ MikroTik এ কানেক্ট হয় না; Tab চাপলে তবেই ডাটা আসে।
|--------------------------------------------------------------------------
*/

document.addEventListener("DOMContentLoaded", () => {

    const API = "/api/router";
    const routerId = Number(new URLSearchParams(location.search).get("id") || 0);

    const head = document.getElementById("ccHead");
    const bodyEl = document.getElementById("ccBody");
    const totalEl = document.getElementById("ccTotal");
    const search = document.getElementById("ccSearch");

    if (!Number.isInteger(routerId) || routerId <= 0) {
        document.body.innerHTML = '<div class="container mt-5"><div class="alert alert-danger">Router ID Missing</div></div>';
        return;
    }

    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

    const TABS = {

        netfee: {
            url: `${API}/${routerId}/customers/extra-netfee`,
            key: "customers",
            check: true,
            cols: [
                ["customer_id", "ID"],
                ["pppoe_username", "PPPoE"],
                ["status", "Status"],
                ["payment_status", "Payment Status"],
                ["package", "Package"],
                ["monthly", "mountly"],
                ["balance", "Balance"],
                ["date", "Date"]
            ]
        },

        mikrotik: {
            url: `${API}/${routerId}/customers/sync-preview`,
            key: "customers",
            check: false,
            cols: [
                ["#", "#"],
                ["name", "Name"],
                ["package", "Package"],
                ["last_logged_out", "Last Logged Out"]
            ]
        }
    };

    let tab = "netfee";
    let rows = [];
    let loaded = false;
    let sortKey = "";
    let sortDir = 1;

    function esc(v) {
        return String(v ?? "")
            .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    async function request(url, options = {}) {

        const res = await fetch(url, { credentials: "same-origin", ...options });

        let data;
        try { data = await res.json(); }
        catch (_) { throw new Error("Invalid server response."); }

        if (!res.ok || data.status === false || data.success === false) {
            throw new Error(data.message || "Request failed.");
        }
        return data;
    }

    function renderHead() {

        const cfg = TABS[tab];

        head.innerHTML = `
            <tr>
                ${cfg.check ? '<th style="width:40px;"><input type="checkbox" class="form-check-input" id="ccAll"></th>' : ""}
                ${cfg.cols.map(([key, label]) => `
                    <th data-key="${key}" style="cursor:pointer;">
                        ${label} <span class="sort-icon ${sortKey === key ? "active" : ""}">⇵</span>
                    </th>`).join("")}
                <th class="text-center">Action</th>
            </tr>
        `;
    }

    function visible() {

        const kw = search.value.trim().toLowerCase();
        let list = rows;

        if (kw) {
            list = list.filter(r => Object.values(r).join(" ").toLowerCase().includes(kw));
        }

        if (sortKey && sortKey !== "#") {
            list = [...list].sort((a, b) =>
                collator.compare(String(a[sortKey] ?? ""), String(b[sortKey] ?? "")) * sortDir);
        } else if (sortKey === "#" && sortDir === -1) {
            list = [...list].reverse();
        }

        return list;
    }

    function render() {

        const cfg = TABS[tab];
        const list = visible();
        const span = cfg.cols.length + 1 + (cfg.check ? 1 : 0);

        totalEl.textContent = list.length;
        renderHead();

        if (!list.length) {
            bodyEl.innerHTML = `<tr><td colspan="${span}" class="mk-nodata">No Data Found !</td></tr>`;
            return;
        }

        bodyEl.innerHTML = list.map((r, i) => {

            const key = tab === "mikrotik" ? r.pppoe_username : r.id ?? r.customer_id;

            const cells = cfg.cols.map(([k]) => {
                if (k === "#") { return `<td>${i + 1}</td>`; }
                return `<td>${esc(r[k])}</td>`;
            }).join("");

            return `
                <tr>
                    ${cfg.check ? `<td><input type="checkbox" class="form-check-input cc-check" data-key="${esc(key)}"></td>` : ""}
                    ${cells}
                    <td class="text-center">
                        <div class="dropdown">
                            <button type="button" class="cfg-dots dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" title="Action">
                                <i class="fa fa-ellipsis"></i>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end cfg-menu">
                                <li><a href="#" class="dropdown-item cc-delete" data-key="${esc(key)}">
                                    <i class="fa fa-box-archive me-2"></i>Delete</a></li>
                            </ul>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }

    async function load() {

        const cfg = TABS[tab];

        rows = [];
        loaded = false;
        totalEl.textContent = 0;

        renderHead();
        bodyEl.innerHTML = `<tr><td colspan="${cfg.cols.length + 2}" class="mk-nodata"><i class="fa fa-spinner fa-spin"></i> Loading...</td></tr>`;

        try {
            const data = await request(cfg.url);
            rows = Array.isArray(data[cfg.key]) ? data[cfg.key] : [];
            loaded = true;
            render();
        } catch (error) {
            bodyEl.innerHTML = `<tr><td colspan="${cfg.cols.length + 2}" class="text-center text-danger">${esc(error.message)}</td></tr>`;
        }
    }

    /* tabs */
    document.getElementById("ccTabs").addEventListener("click", event => {

        const btn = event.target.closest("[data-tab]");

        if (!btn || btn.dataset.tab === tab) { return; }

        document.querySelectorAll("#ccTabs .nav-link").forEach(b => b.classList.toggle("active", b === btn));

        tab = btn.dataset.tab;
        sortKey = "";
        sortDir = 1;
        search.value = "";
        load();
    });

    /* sort + select-all */
    head.addEventListener("click", event => {

        if (event.target.id === "ccAll") {
            bodyEl.querySelectorAll(".cc-check").forEach(c => { c.checked = event.target.checked; });
            return;
        }

        const th = event.target.closest("th[data-key]");

        if (!th || !loaded) { return; }

        const key = th.dataset.key;

        if (sortKey === key) { sortDir = -sortDir; }
        else { sortKey = key; sortDir = 1; }

        render();
    });

    search.addEventListener("input", () => { if (loaded) { render(); } });

    /* delete */
    bodyEl.addEventListener("click", async event => {

        const link = event.target.closest(".cc-delete");

        if (!link) { return; }

        event.preventDefault();

        const key = link.dataset.key;

        const ok = await Swal.fire({
            icon: "warning",
            title: "Delete?",
            text: tab === "mikrotik"
                ? `${key} MikroTik থেকে মুছে যাবে।`
                : "এই গ্রাহক NetFee থেকে মুছে যাবে।",
            showCancelButton: true,
            confirmButtonText: "Delete",
            cancelButtonText: "Cancel"
        });

        if (!ok.isConfirmed) { return; }

        try {

            const url = tab === "mikrotik"
                ? `${API}/${routerId}/customers/mikrotik/${encodeURIComponent(key)}`
                : `${API}/${routerId}/customers/extra-netfee/${encodeURIComponent(key)}`;

            await request(url, { method: "DELETE" });
            await load();

            MkToast.success("Deleted");

        } catch (error) {
            MkToast.error(error.message);
        }
    });

    load();
});
