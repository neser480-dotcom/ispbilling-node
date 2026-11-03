"use strict";

document.addEventListener("DOMContentLoaded", () => {

    const $ = (id) => document.getElementById(id);

    const searchInput = $("search");
    const fromDateInput = $("fromDate");
    const toDateInput = $("toDate");
    const limitInput = $("limit");
    const createdBySel = $("createdBy");
    const actionSel = $("actionFilter");
    const filterBtn = $("filterBtn");
    const resetBtn = $("resetBtn");
    const toggleFilterBtn = $("toggleFilterBtn");
    const filterCard = $("filterCard");
    const refreshBtn = $("refreshBtn");
    const csvBtn = $("csvBtn");
    const printBtn = $("printBtn");
    const activityBody = $("activityBody");
    const pagination = $("pagination");
    const pageInfo = $("pageInfo");
    const totalData = $("totalData");
    const companyBadge = $("companyBadge");

    let currentPage = 1;
    let currentLogs = [];
    let currentIsSuperAdmin = false;
    let sortKey = null;
    let sortDir = "asc";
    let searchTimer = null;

    /* ---------- helpers ---------- */

    const pad = (v) => String(v).padStart(2, "0");

    function escapeHtml(v) {
        if (v === null || v === undefined) return "";
        return String(v)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function safeValue(v, fallback = "N/A") {
        if (v === null || v === undefined || String(v).trim() === "") return fallback;
        return String(v);
    }

    function formatDate(value) {
        if (!value) return "N/A";
        let date = (typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value))
            ? new Date(value.replace(" ", "T"))
            : new Date(value);
        if (Number.isNaN(date.getTime())) return escapeHtml(value);

        let h = date.getHours();
        const ampm = h >= 12 ? "PM" : "AM";
        h = h % 12 || 12;

        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
               `${pad(h)}:${pad(date.getMinutes())} ${ampm}`;
    }

    /* ---------- badges ---------- */

    function moduleBadge(module) {
        const m = String(module || "").toLowerCase();
        let cls = "al-b-grey";
        if (m.includes("report")) cls = "al-b-green";
        else if (m.includes("customer")) cls = "al-b-cyan";
        else if (m.includes("invoice")) cls = "al-b-green";
        else if (m.includes("collector")) cls = "al-b-cyan";
        else if (m.includes("payment") || m.includes("recharge") || m.includes("bill")) cls = "al-b-purple";
        else if (m.includes("staff") || m.includes("user")) cls = "al-b-blue";
        return `<span class="al-badge ${cls}">${escapeHtml(safeValue(module))}</span>`;
    }

    function actionBadge(action, type) {
        const a = String(action || "").toLowerCase();
        const t = String(type || "").toLowerCase();
        let cls = "al-b-blue";

        if (t === "danger" || a.includes("delete") || a.includes("remove")) cls = "al-b-red";
        else if (t === "success" || a.includes("create") || a.includes("add") ||
                 a.includes("recharge") || a.includes("payment") || a.includes("paid")) cls = "al-b-green";
        else if (t === "warning" || a.includes("update") || a.includes("edit")) cls = "al-b-orange";

        return `<span class="al-badge ${cls}">${escapeHtml(safeValue(action, "UNKNOWN").toUpperCase())}</span>`;
    }

    /* ---------- states ---------- */

    function showLoading() {
        activityBody.innerHTML =
            `<tr><td colspan="8" class="text-center py-5">
                <i class="fas fa-spinner fa-spin me-1"></i> Loading...
            </td></tr>`;
    }

    function showError(message) {
        activityBody.innerHTML =
            `<tr><td colspan="8" class="text-center text-danger py-5">
                <i class="fas fa-circle-exclamation me-1"></i> ${escapeHtml(message)}
            </td></tr>`;
        pagination.innerHTML = "";
        pageInfo.textContent = "";
    }

    /* ---------- sorting (current page) ---------- */

    function sortedLogs() {
        if (!sortKey) return currentLogs;

        const rows = [...currentLogs];
        rows.sort((a, b) => {
            let x = a[sortKey], y = b[sortKey];
            if (sortKey === "serial" || sortKey === "id") {
                x = Number(x || 0); y = Number(y || 0);
            } else if (sortKey === "created_at") {
                x = new Date(String(x).replace(" ", "T")).getTime() || 0;
                y = new Date(String(y).replace(" ", "T")).getTime() || 0;
            } else {
                x = String(x || "").toLowerCase();
                y = String(y || "").toLowerCase();
            }
            if (x < y) return sortDir === "asc" ? -1 : 1;
            if (x > y) return sortDir === "asc" ? 1 : -1;
            return 0;
        });
        return rows;
    }

    function updateSortHeaders() {
        document.querySelectorAll("th.sortable").forEach((th) => {
            th.classList.remove("sort-asc", "sort-desc");
            if (th.dataset.sort === sortKey) {
                th.classList.add(sortDir === "asc" ? "sort-asc" : "sort-desc");
            }
        });
    }

    document.querySelectorAll("th.sortable").forEach((th) => {
        th.addEventListener("click", () => {
            const key = th.dataset.sort;
            if (sortKey === key) {
                sortDir = sortDir === "asc" ? "desc" : "asc";
            } else {
                sortKey = key;
                sortDir = "asc";
            }
            updateSortHeaders();
            renderRows(sortedLogs());
        });
    });

    /* ---------- render rows ---------- */

    function renderRows(rows) {
        if (!Array.isArray(rows) || rows.length === 0) {
            activityBody.innerHTML =
                `<tr><td colspan="8" class="text-center py-5 text-muted">
                    <i class="fas fa-info-circle me-1"></i> No activity log found.
                </td></tr>`;
            return;
        }

        activityBody.innerHTML = rows.map((row) => `
            <tr>
                <td class="fw-bold">${escapeHtml(safeValue(row.serial, row.id || "-"))}</td>

                <td class="activity-description">${escapeHtml(safeValue(row.description))}</td>

                <td class="activity-module">${moduleBadge(row.module)}</td>

                <td class="activity-ip">${escapeHtml(safeValue(row.ip_address))}</td>

                <td class="activity-user">
                    <div class="al-user">${escapeHtml(safeValue(row.user_name))}</div>
                    <span class="al-badge al-b-blue">${escapeHtml(safeValue(row.role_name))}</span>
                    ${currentIsSuperAdmin && Number(row.company_id || 0) > 0
                        ? `<div class="al-user mt-1">Company #${escapeHtml(row.company_id)}</div>` : ""}
                </td>

                <td class="activity-action">${actionBadge(row.action, row.action_type)}</td>

                <td class="activity-date">${formatDate(row.created_at)}</td>

                <td class="text-center">
                    <button type="button" class="al-view-btn" data-log-id="${Number(row.id || 0)}" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `).join("");

        activityBody.querySelectorAll("[data-log-id]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = Number(btn.dataset.logId);
                const row = currentLogs.find((r) => Number(r.id) === id);
                if (row) viewActivityLog(row);
            });
        });
    }

    /* ---------- pagination ---------- */

    function renderPagination(info) {
        pagination.innerHTML = "";
        pageInfo.textContent = "";
        if (!info) return;

        const page = Number(info.page || 1);
        const total = Number(info.total || 0);
        const totalPages = Number(info.totalPages || info.total_pages || 1);
        const limit = Number(info.limit || 100);

        if (total > 0) {
            const start = (page - 1) * limit + 1;
            const end = Math.min(page * limit, total);
            pageInfo.textContent = `Showing ${start}-${end} of ${total}`;
        }

        if (totalPages <= 1) return;

        function addButton(label, target, disabled, active = false) {
            const li = document.createElement("li");
            li.className = "page-item" + (disabled ? " disabled" : "") + (active ? " active" : "");
            const b = document.createElement("button");
            b.type = "button";
            b.className = "page-link";
            b.textContent = label;
            if (!disabled) b.addEventListener("click", () => loadLogs(target));
            li.appendChild(b);
            pagination.appendChild(li);
        }

        function dots() {
            const li = document.createElement("li");
            li.className = "page-item disabled";
            li.innerHTML = `<span class="page-link">...</span>`;
            pagination.appendChild(li);
        }

        addButton("Previous", page - 1, page <= 1);

        const startPage = Math.max(1, page - 2);
        const endPage = Math.min(totalPages, page + 2);

        if (startPage > 1) {
            addButton("1", 1, false, page === 1);
            if (startPage > 2) dots();
        }
        for (let i = startPage; i <= endPage; i++) addButton(String(i), i, false, i === page);
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) dots();
            addButton(String(totalPages), totalPages, false, page === totalPages);
        }

        addButton("Next", page + 1, page >= totalPages);
    }

    /* ---------- view modal ---------- */

    function parseState(value) {
        if (value === null || value === undefined || value === "") return null;
        if (typeof value === "object") return value;
        try {
            const parsed = JSON.parse(value);
            return (parsed && typeof parsed === "object") ? parsed : { value: parsed };
        } catch (e) {
            return { value: String(value) };
        }
    }

    function renderState(targetId, value) {
        const el = $(targetId);
        const data = parseState(value);

        if (!data || Object.keys(data).length === 0) {
            el.innerHTML = `<span class="text-muted">-</span>`;
            return;
        }

        el.innerHTML = Object.entries(data).map(([k, v]) => `
            <div class="al-state-row">
                <div class="al-state-key">${escapeHtml(k)}</div>
                <div class="al-state-val">${escapeHtml(
                    v !== null && typeof v === "object" ? JSON.stringify(v) : v
                )}</div>
            </div>
        `).join("");
    }

    function viewActivityLog(row) {
        const modalEl = $("activityViewModal");
        if (!modalEl || typeof bootstrap === "undefined" || !bootstrap.Modal) {
            console.error("Bootstrap JS is not loaded.");
            return;
        }

        const action = safeValue(row.action, "UNKNOWN");
        const moduleName = safeValue(row.module);

        $("viewModule").textContent = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
        $("viewActionBadge").innerHTML = actionBadge(row.action, row.action_type);
        $("viewByLabel").textContent =
            action.charAt(0).toUpperCase() + action.slice(1).toLowerCase() + " by";
        $("viewRoleBadge").innerHTML =
            `<span class="al-badge al-b-blue">${escapeHtml(safeValue(row.role_name))}</span>`;

        $("viewIp").textContent = safeValue(row.ip_address);
        $("viewDate").textContent = formatDate(row.created_at);

        $("viewDescription").value = safeValue(row.description, "");

        const hasState = parseState(row.old_data) || parseState(row.new_data);
        $("stateRow").style.display = hasState ? "" : "none";
        renderState("viewOldState", row.old_data);
        renderState("viewNewState", row.new_data);

        $("viewUserAgent").textContent = safeValue(row.user_agent, "-");

        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }

    /* ---------- filter dropdown options ---------- */

    async function loadFilterOptions() {
        try {
            const res = await fetch("/activity/api/filters", {
                credentials: "same-origin",
                headers: { Accept: "application/json" }
            });
            const data = await res.json();
            if (!res.ok || data.status !== true) return;

            (data.users || []).forEach((u) => {
                const o = document.createElement("option");
                o.value = u.key;
                o.textContent = u.name;
                createdBySel.appendChild(o);
            });
        } catch (e) {
            console.error("Filter options error:", e);
        }
    }

    /* ---------- build query ---------- */

    function buildParams(page) {
        const p = new URLSearchParams();
        p.set("page", String(page));
        p.set("limit", String(limitInput.value || "100"));

        const search = searchInput.value.trim();
        if (search) p.set("search", search);
        if (fromDateInput.value) p.set("from_date", fromDateInput.value);
        if (toDateInput.value) p.set("to_date", toDateInput.value);
        if (createdBySel.value) p.set("created_by", createdBySel.value);
        if (actionSel.value) p.set("action", actionSel.value);

        return p;
    }

    /* ---------- load logs ---------- */

    async function loadLogs(page = 1) {
        currentPage = Number(page) || 1;
        showLoading();

        try {
            const response = await fetch(`/activity/api?${buildParams(currentPage).toString()}`, {
                method: "GET",
                credentials: "same-origin",
                headers: { Accept: "application/json" }
            });

            let result;
            try {
                result = await response.json();
            } catch (e) {
                throw new Error(`Server returned invalid JSON (HTTP ${response.status}).`);
            }

            if (!response.ok || result.status !== true) {
                throw new Error(result.message || `Failed to load activity log. HTTP ${response.status}`);
            }

            const summary = result.summary || {};
            const pg = result.pagination || {};
            const total = Number(summary.total_data ?? pg.total ?? 0);
            totalData.textContent = total.toLocaleString();

            currentIsSuperAdmin = Boolean(result.is_super_admin);
            companyBadge.textContent = currentIsSuperAdmin ? "Super Admin" : "";

            currentLogs = Array.isArray(result.logs) ? result.logs : [];
            renderRows(sortedLogs());
            renderPagination(pg);

        } catch (error) {
            console.error("Activity Log Error:", error);
            showError(error.message || "Failed to load activity log.");
        }
    }

    /* ---------- events ---------- */

    toggleFilterBtn.addEventListener("click", () => {
        filterCard.classList.toggle("al-hidden");
    });

    filterBtn.addEventListener("click", () => loadLogs(1));

    resetBtn.addEventListener("click", () => {
        createdBySel.value = "";
        actionSel.value = "";
        fromDateInput.value = "";
        toDateInput.value = "";
        searchInput.value = "";
        sortKey = null;
        updateSortHeaders();
        loadLogs(1);
    });

    refreshBtn.addEventListener("click", () => loadLogs(currentPage));

    searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => loadLogs(1), 400);
    });

    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            clearTimeout(searchTimer);
            loadLogs(1);
        }
    });

    limitInput.addEventListener("change", () => loadLogs(1));
    createdBySel.addEventListener("change", () => loadLogs(1));
    actionSel.addEventListener("change", () => loadLogs(1));

    /* ---------- CSV ---------- */

    function csvEscape(v) {
        const t = v === null || v === undefined ? "" : String(v);
        return `"${t.replace(/"/g, '""')}"`;
    }

    function exportCsv(rows) {
        if (!Array.isArray(rows) || rows.length === 0) {
            alert("No activity data to export.");
            return;
        }

        const headers = ["#", "Company", "User ID", "User", "Description", "Module",
                         "IP Address", "Role", "Action", "Date"];
        const lines = [headers.map(csvEscape).join(",")];

        rows.forEach((r) => {
            lines.push([
                r.serial, r.company_id, r.user_id, r.user_name, r.description,
                r.module, r.ip_address, r.role_name, r.action, formatDate(r.created_at)
            ].map(csvEscape).join(","));
        });

        const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "activity_log.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    csvBtn.addEventListener("click", () => exportCsv(currentLogs));
    printBtn.addEventListener("click", () => window.print());

    filterCard.classList.add("al-hidden");

    /* ---------- init ---------- */

    loadFilterOptions();
    loadLogs(1);
});
