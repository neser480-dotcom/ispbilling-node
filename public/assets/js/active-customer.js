"use strict";

document.addEventListener("DOMContentLoaded", () => {

    const API_BASE = "/customers/active-pppoe/api";
    const LOOKUP = "/api/customers/add";

    const $ = id => document.getElementById(id);

    const page = $("activePage");
    const tableBody = $("userTableBody");
    const routerFilter = $("routerFilter");
    const packageFilter = $("packageFilter");
    const areaFilter = $("areaFilter");
    const subAreaFilter = $("subAreaFilter");
    const statusFilter = $("connectionStatusFilter");
    const totalData = $("activeTotalData");
    const activeCount = $("activeCount");
    const offlineCount = $("offlineCount");
    const searchInput = $("searchInput");
    const selectAll = $("selectAllActive");
    const filterPanel = $("activeFilterPanel");
    const extraTools = $("activeExtraTools");
    const toggleBtn = $("activeToggleTools");

    if (!page || !tableBody) {
        console.error("Active Customer: required HTML elements are missing.");
        return;
    }

    let allRows = [];
    let currentRouterId = "";
    let sortKey = "";
    let sortDir = 1;

    /* ------------------------------------------------------------ helpers */

    function esc(value) {
        const div = document.createElement("div");
        div.textContent = value === null || value === undefined ? "" : String(value);
        return div.innerHTML;
    }

    function uptimeSeconds(text) {
        const t = String(text || "");
        const g = re => Number((t.match(re) || [0, 0])[1]) || 0;
        return g(/(\d+)w/i) * 604800 + g(/(\d+)d/i) * 86400 +
               g(/(\d+)h/i) * 3600 + g(/(\d+)m/i) * 60 + g(/(\d+)s/i);
    }

    function rowsFrom(result) {
        if (Array.isArray(result)) return result;
        for (const k of ["data", "items", "rows", "areas", "subAreas", "packages"]) {
            if (Array.isArray(result?.[k])) return result[k];
        }
        return [];
    }

    async function getJson(url, options) {
        const response = await fetch(url, {
            credentials: "same-origin",
            cache: "no-store",
            ...options
        });
        let result = {};
        try { result = await response.json(); } catch (e) { /* not json */ }
        if (!response.ok || result.success === false) {
            throw new Error(result.message || `HTTP ${response.status}`);
        }
        return result;
    }

    function postJson(url, body) {
        return getJson(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
    }

    function fillSelect(select, rows, placeholder, valueKey, nameKey) {
        const keep = select.value;
        select.replaceChildren(new Option(placeholder, ""));
        rows.forEach(r => {
            const value = String(r[valueKey] ?? r.id ?? r.value ?? "");
            const name = String(r[nameKey] ?? r.name ?? r.title ?? value);
            if (value) select.appendChild(new Option(name, value));
        });
        if (keep && Array.from(select.options).some(o => o.value === keep)) {
            select.value = keep;
        }
    }

    function getQuery() {
        const p = new URLSearchParams();
        if (routerFilter.value) p.set("router_id", routerFilter.value);
        if (packageFilter.value) p.set("package", packageFilter.value);
        if (areaFilter.value) p.set("area", areaFilter.value);
        if (subAreaFilter.value) p.set("sub_area", subAreaFilter.value);
        p.set("connection_status", statusFilter.value || "all");
        return p.toString();
    }

    /* ------------------------------------------------------------ routers */

    async function loadRouters() {
        routerFilter.innerHTML = `<option value="">Loading...</option>`;
        try {
            const result = await getJson(`${API_BASE}/routers`);
            const list = Array.isArray(result.data) ? result.data : [];

            if (!list.length) {
                routerFilter.innerHTML = `<option value="">No MikroTik</option>`;
                return;
            }

            routerFilter.replaceChildren();
            list.forEach(r => routerFilter.appendChild(
                new Option(r.name || `Router #${r.id}`, String(r.id))
            ));
            routerFilter.value = String(list[0].id);
        } catch (error) {
            console.error("Router loading error:", error);
            routerFilter.innerHTML = `<option value="">Router load failed</option>`;
        }
    }

    /* ------------------------------------------------- area / sub area lists */

    async function loadAreas() {
        try {
            const result = await getJson(
                `${LOOKUP}/areas?mikrotik_id=${encodeURIComponent(routerFilter.value || "")}`
            );
            fillSelect(areaFilter, rowsFrom(result), "All Area", "id", "name");
        } catch (e) {
            fillSelect(areaFilter, [], "All Area", "id", "name");
        }
        fillSelect(subAreaFilter, [], "Sub Area", "id", "name");
    }

    async function loadSubAreas() {
        if (!areaFilter.value) {
            fillSelect(subAreaFilter, [], "Sub Area", "id", "name");
            return;
        }
        try {
            const result = await getJson(
                `${LOOKUP}/sub-areas?area_id=${encodeURIComponent(areaFilter.value)}`
            );
            fillSelect(subAreaFilter, rowsFrom(result), "Sub Area", "id", "name");
        } catch (e) {
            fillSelect(subAreaFilter, [], "Sub Area", "id", "name");
        }
    }

    function fillPackagesFromRows(rows) {
        const names = [...new Set(rows.map(r => r.package).filter(Boolean))].sort();
        const keep = packageFilter.value;
        packageFilter.replaceChildren(new Option("Package", ""));
        names.forEach(n => packageFilter.appendChild(new Option(n, n)));
        if (keep && names.includes(keep)) packageFilter.value = keep;
    }

    /* ------------------------------------------------------------ load data */

    async function loadData() {
        tableBody.innerHTML = `
            <tr><td colspan="11" class="loading-row">
                <i class="fa-solid fa-spinner fa-spin"></i>&nbsp; Loading Customers...
            </td></tr>`;

        try {
            const result = await getJson(`${API_BASE}/data?${getQuery()}`);

            allRows = (Array.isArray(result.data) ? result.data : []).map(r => ({
                ...r,
                uptime_sec: uptimeSeconds(r.uptime)
            }));

            currentRouterId = String(result.router?.id || routerFilter.value || "");

            activeCount.textContent = result.active ?? 0;
            offlineCount.textContent = result.offline ?? 0;

            if (!packageFilter.value) fillPackagesFromRows(allRows);

            renderRows();
        } catch (error) {
            console.error("Active Customer error:", error);
            allRows = [];
            totalData.textContent = "0";
            activeCount.textContent = "0";
            offlineCount.textContent = "0";
            tableBody.innerHTML = `
                <tr><td colspan="11" class="error-row">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    ${esc(error.message || "Unable to load customers.")}
                </td></tr>`;
        }

        updateSelectAll();
    }

    /* ------------------------------------------------------------- render */

    function sortedRows() {
        if (!sortKey) return allRows;

        const rows = [...allRows];
        rows.sort((a, b) => {
            const x = a[sortKey], y = b[sortKey];
            if (typeof x === "number" && typeof y === "number") return (x - y) * sortDir;
            return String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true }) * sortDir;
        });
        return rows;
    }

    function renderRows() {
        const rows = sortedRows();

        if (!rows.length) {
            tableBody.innerHTML = `
                <tr><td colspan="11" class="empty-row">
                    <i class="fa-solid fa-user-slash"></i>&nbsp; No customer found.
                </td></tr>`;
            totalData.textContent = "0";
            return;
        }

        tableBody.innerHTML = rows.map(rowHtml).join("");

        tableBody.querySelectorAll('[data-bs-toggle="dropdown"]').forEach(btn => {
            new bootstrap.Dropdown(btn, { popperConfig: { strategy: "fixed" } });
        });

        tableBody.querySelectorAll(".active-user-check").forEach(c =>
            c.addEventListener("change", updateSelectAll)
        );

        applySearch();
    }

    function rowHtml(row) {
        const isActive = String(row.status).toLowerCase() === "active";

        const wifi = isActive
            ? `<i class="fa-solid fa-wifi wifi-on"></i>`
            : `<i class="fa-solid fa-wifi wifi-off"></i>`;

        const badge = isActive
            ? `<span class="status-badge status-active">active</span>`
            : `<span class="status-badge status-offline">offline</span>`;

        const ip = esc(row.address || "—");
        const mac = esc(row.caller_id || "—");

        const removeItem = isActive ? `
            <li><button type="button" class="dropdown-item" data-act="remove"
                data-active-id="${esc(row[".id"] || "")}" data-user="${esc(row.username)}">
                <i class="fa-solid fa-shuffle"></i> Remove Connection</button></li>` : "";

        return `
        <tr data-status="${esc(row.status)}">
            <td class="col-check"><input type="checkbox" class="active-user-check" value="${esc(row.username)}"></td>
            <td class="col-wifi">${wifi}</td>
            <td>${esc(row.id ?? "—")}</td>
            <td>
                <div class="c-name">${esc(row.customer_name || "—")}</div>
                <div class="c-sub">${esc(row.username || "—")}</div>
            </td>
            <td><div>${ip}</div><div>${mac}</div></td>
            <td>${esc(row.package || "PPPoE")}</td>
            <td><span class="t-up">${esc(row.upload_display || "0 MB")}</span>
                <span class="t-down">${esc(row.download_display || "0 MB")}</span></td>
            <td>${esc(row.uptime || "—")}</td>
            <td><div>${esc(row.login_time || "—")}</div><div>${esc(row.logout_time && row.logout_time !== "—" ? row.logout_time : "")}</div></td>
            <td>${badge}</td>
            <td class="col-action">
                <div class="dropdown">
                    <button class="btn btn-link action-button dropdown-toggle" type="button"
                        data-bs-toggle="dropdown" aria-expanded="false">
                        <i class="fa-solid fa-ellipsis"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end">
                        <li><button type="button" class="dropdown-item" data-act="ping"
                            data-ip="${esc(row.address || "")}">
                            <i class="fa-solid fa-route"></i> Ping</button></li>
                        <li><button type="button" class="dropdown-item" data-act="bandwidth"
                            data-user="${esc(row.username)}">
                            <i class="fa-solid fa-database"></i> Bandwidth</button></li>
                        <li><button type="button" class="dropdown-item" data-act="mac"
                            data-mac="${esc(row.caller_id || "")}">
                            <i class="fa-solid fa-network-wired"></i> MAC-Binding</button></li>
                        ${removeItem}
                    </ul>
                </div>
            </td>
        </tr>`;
    }

    /* ------------------------------------------------------------- search */

    function applySearch() {
        const keyword = String(searchInput.value || "").trim().toLowerCase();
        let visible = 0;

        tableBody.querySelectorAll("tr").forEach(tr => {
            if (!tr.querySelector(".active-user-check")) return;
            const show = !keyword || tr.textContent.toLowerCase().includes(keyword);
            tr.style.display = show ? "" : "none";
            if (show) visible++;
        });

        totalData.textContent = keyword ? visible : allRows.length;
        updateSelectAll();
    }

    /* ---------------------------------------------------------- checkboxes */

    function visibleChecks() {
        return Array.from(document.querySelectorAll(".active-user-check"))
            .filter(c => c.closest("tr")?.style.display !== "none");
    }

    function updateSelectAll() {
        if (!selectAll) return;
        const all = visibleChecks();
        const checked = all.filter(c => c.checked);
        selectAll.checked = all.length > 0 && checked.length === all.length;
        selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
    }

    selectAll?.addEventListener("change", () => {
        visibleChecks().forEach(c => { c.checked = selectAll.checked; });
    });

    /* --------------------------------------------------------------- sort */

    document.querySelectorAll("#activeCustomerTable th.sortable").forEach(th => {
        th.addEventListener("click", () => {
            const key = th.dataset.sort;
            if (sortKey === key) sortDir = -sortDir; else { sortKey = key; sortDir = 1; }
            renderRows();
        });
    });

    /* ------------------------------------------------------- row actions */

    const infoModalEl = $("activeInfoModal");
    const infoModal = infoModalEl ? new bootstrap.Modal(infoModalEl) : null;

    function showInfo(title, html) {
        if (!infoModal) { alert(title); return; }
        $("activeInfoTitle").textContent = title;
        $("activeInfoBody").innerHTML = html;
        infoModal.show();
    }

    tableBody.addEventListener("click", async event => {
        const btn = event.target.closest("[data-act]");
        if (!btn) return;

        const act = btn.dataset.act;

        if (act === "ping") {
            const ip = btn.dataset.ip;
            if (!ip) { showInfo("Ping", "<p class='mb-0'>No IP address.</p>"); return; }

            showInfo(`Ping ${ip}`, `<i class="fa-solid fa-spinner fa-spin"></i> Pinging...`);

            try {
                const r = await postJson(`${API_BASE}/ping`, {
                    router_id: currentRouterId, address: ip
                });
                const lines = (r.replies || []).map((x, i) =>
                    `#${i + 1}  ${x.host || ip}  ${x.time ? "time=" + x.time : (x.status || "timeout")}${x.ttl ? "  ttl=" + x.ttl : ""}`
                );
                showInfo(`Ping ${ip}`,
                    `<pre class="ping-out">${esc(lines.join("\n"))}\n\nSent: ${r.sent}  Received: ${r.received}</pre>`);
            } catch (e) {
                showInfo(`Ping ${ip}`, `<div class="text-danger">${esc(e.message)}</div>`);
            }
            return;
        }

        if (act === "remove") {
            if (!confirm(`Remove connection of ${btn.dataset.user}?`)) return;

            try {
                await postJson(`${API_BASE}/remove`, {
                    router_id: currentRouterId, active_id: btn.dataset.activeId
                });
                loadData();
            } catch (e) {
                alert(e.message);
            }
            return;
        }

        if (act === "bandwidth") {
            showInfo("Bandwidth", "<p class='mb-0'>Bandwidth report is not connected yet.</p>");
            return;
        }

        if (act === "mac") {
            showInfo("MAC-Binding", "<p class='mb-0'>MAC-Binding is not connected yet.</p>");
        }
    });

    /* ------------------------------------------------------------ header */

    $("activeFilterBtn")?.addEventListener("click", () => {
        filterPanel.hidden = !filterPanel.hidden;
    });

    $("activeRefreshBtn")?.addEventListener("click", loadData);
    $("applyFilterBtn")?.addEventListener("click", loadData);

    $("resetFilterBtn")?.addEventListener("click", () => {
        packageFilter.value = "";
        areaFilter.value = "";
        fillSelect(subAreaFilter, [], "Sub Area", "id", "name");
        statusFilter.value = "all";
        loadData();
    });

    routerFilter.addEventListener("change", async () => {
        packageFilter.value = "";
        await loadAreas();
        loadData();
    });

    areaFilter.addEventListener("change", loadSubAreas);

    toggleBtn?.addEventListener("click", () => {
        extraTools.hidden = !extraTools.hidden;
        toggleBtn.classList.toggle("open", !extraTools.hidden);
    });

    $("activePrintBtn")?.addEventListener("click", () => window.print());

    $("activeExportBtn")?.addEventListener("click", () => {
        const head = ["ID", "Name", "PPPoE", "IP", "MAC", "Package", "Up", "Down", "Uptime", "Login", "Status"];
        const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const lines = [head.map(q).join(",")];

        sortedRows().forEach(r => lines.push([
            r.id, r.customer_name, r.username, r.address, r.caller_id, r.package,
            r.upload_display, r.download_display, r.uptime, r.login_time, r.status
        ].map(q).join(",")));

        const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "active-customers.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
    });

    searchInput?.addEventListener("input", applySearch);

    /* -------------------------------------------------------------- init */

    (async () => {
        await loadRouters();
        await loadAreas();
        await loadData();
    })();
});
