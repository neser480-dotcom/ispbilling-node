"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const body = document.getElementById("faultTableBody");
    const refresh = document.getElementById("refreshFaults");
    const search = document.getElementById("faultSearch");
    const severity = document.getElementById("severityFilter");
    const perPage = document.getElementById("faultPerPage");
    const clear = document.getElementById("clearFaultFilter");
    const pagination = document.getElementById("faultPagination");

    if (!body) return;

    let page = 1;
    let rows = [];
    let totalPages = 1;
    let requestTimer = null;
    let requestSequence = 0;

    const escapeHtml = value => String(value ?? "")
        .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    const number = value => {
        if (value === null || value === undefined || value === "") return "-";
        const n = Number(value);
        return Number.isFinite(n) ? n.toFixed(2) : escapeHtml(value);
    };

    const date = value => {
        if (!value) return "-";
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? escapeHtml(value) : escapeHtml(d.toLocaleString());
    };

    const rxClass = value => {
        const n = Number(value);
        if (!Number.isFinite(n)) return "text-muted";
        if (n <= -30) return "text-danger fw-bold";
        if (n <= -27) return "text-warning fw-bold";
        return "text-success";
    };

    function ensureModal() {
        if (document.getElementById("liveFaultModal")) return;
        document.body.insertAdjacentHTML("beforeend", `
            <div id="liveFaultModal" class="live-fault-modal" aria-hidden="true">
                <div class="live-fault-modal-backdrop" data-modal-close></div>
                <section class="live-fault-modal-card" role="dialog" aria-modal="true" aria-labelledby="liveFaultModalTitle">
                    <header>
                        <strong id="liveFaultModalTitle">ONU Fault Details</strong>
                        <button type="button" class="live-fault-modal-close" data-modal-close aria-label="Close">&times;</button>
                    </header>
                    <div id="liveFaultModalBody"></div>
                </section>
            </div>
        `);
        document.querySelectorAll("[data-modal-close]").forEach(el =>
            el.addEventListener("click", closeModal)
        );
        document.addEventListener("keydown", event => {
            if (event.key === "Escape") closeModal();
        });
    }

    function closeModal() {
        const modal = document.getElementById("liveFaultModal");
        if (modal) {
            modal.classList.remove("show");
            modal.setAttribute("aria-hidden", "true");
        }
    }

    function openModal(index) {
        const row = rows[index];
        if (!row) return;
        ensureModal();

        const modalBody = document.getElementById("liveFaultModalBody");
        modalBody.innerHTML = `
            <div class="live-fault-detail-grid">
                <div><small>Fault Reason</small><strong>${escapeHtml(row.fault_reason)}</strong></div>
                <div><small>Fault Type</small><strong>${escapeHtml(row.fault_type)}</strong></div>
                <div><small>OLT / PON</small><strong>${escapeHtml(row.olt_name)} / ${escapeHtml(row.pon)}</strong></div>
                <div><small>ONU Status</small><strong>${escapeHtml(row.status)}</strong></div>
                <div><small>Display ID</small><strong>${escapeHtml(row.customer_code || "Not mapped")}</strong></div>
                <div><small>Customer</small><strong>${escapeHtml(row.customer_name || "Not mapped")}</strong></div>
                <div><small>MAC</small><strong>${escapeHtml(row.onu_mac || "-")}</strong></div>
                <div><small>Serial</small><strong>${escapeHtml(row.onu_sn || "-")}</strong></div>
                <div><small>PPPoE</small><strong>${escapeHtml(row.pppoe_username || "-")}</strong></div>
                <div><small>RX</small><strong>${number(row.rx_power)} dBm</strong></div>
                <div><small>TX</small><strong>${number(row.tx_power)} dBm</strong></div>
                <div><small>Distance</small><strong>${escapeHtml(row.distance || "-")}</strong></div>
                <div><small>Detected</small><strong>${date(row.detected_at)}</strong></div>
                <div><small>Last Update</small><strong>${date(row.last_update)}</strong></div>
            </div>
            <div class="live-fault-description">
                <small>Fault Description</small>
                <p>${escapeHtml(row.fault_description || "Network condition detected.")}</p>
            </div>
        `;

        const modal = document.getElementById("liveFaultModal");
        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
    }

    function renderRows() {
        if (!rows.length) {
            body.innerHTML = `<tr><td colspan="8" class="text-center py-5 text-muted">No affected ONU found.</td></tr>`;
            return;
        }

        body.innerHTML = rows.map((row, index) => `
            <tr>
                <td>
                    <strong>${escapeHtml(row.customer_code || "—")}</strong>
                    <div class="small text-muted">${escapeHtml(row.olt_name)} / ${escapeHtml(row.pon)}</div>
                </td>
                <td>
                    ${escapeHtml(row.customer_name || "Not mapped")}
                    <div class="small text-muted">${escapeHtml(row.pppoe_username || "")}</div>
                </td>
                <td class="${rxClass(row.rx_power)}">${number(row.rx_power)}${row.rx_power !== null && row.rx_power !== "" ? " dBm" : ""}</td>
                <td>${number(row.tx_power)}${row.tx_power !== null && row.tx_power !== "" ? " dBm" : ""}</td>
                <td>${escapeHtml(row.distance || "-")}</td>
                <td class="text-nowrap">${date(row.detected_at)}</td>
                <td><span class="badge ${row.severity === "critical" ? "bg-danger" : "bg-warning text-dark"}">${escapeHtml(row.fault_reason)}</span></td>
                <td class="text-center">
                    <button type="button" class="btn btn-sm btn-light border" data-view-row="${index}" title="View details">
                        <i class="fa fa-eye"></i> View
                    </button>
                </td>
            </tr>
        `).join("");
    }

    function renderPagination(info) {
        if (!pagination) return;
        const total = Number(info.total || 0);
        totalPages = Math.max(1, Number(info.totalPages || 1));
        page = Number(info.page || 1);

        if (totalPages <= 1) {
            pagination.innerHTML = `<span class="small text-muted">${total} affected ONU</span>`;
            return;
        }

        let html = `<div class="small text-muted me-3">Showing page ${page} of ${totalPages} · ${total} affected ONU</div><nav><ul class="pagination mb-0">`;
        html += `<li class="page-item ${page <= 1 ? "disabled" : ""}"><button class="page-link" data-page="${page - 1}">Previous</button></li>`;

        const start = Math.max(1, Math.min(page - 3, totalPages - 6));
        const end = Math.min(totalPages, start + 6);
        for (let i = start; i <= end; i++) {
            html += `<li class="page-item ${i === page ? "active" : ""}"><button class="page-link" data-page="${i}">${i}</button></li>`;
        }

        html += `<li class="page-item ${page >= totalPages ? "disabled" : ""}"><button class="page-link" data-page="${page + 1}">Next</button></li></ul></nav>`;
        pagination.innerHTML = html;
    }

    function updateSummary(summary) {
        const values = {
            totalCount: summary.total || 0,
            criticalCount: summary.critical || 0,
            warningCount: summary.warning || 0,
            recoveredCount: summary.recovered || 0
        };
        Object.entries(values).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });
    }

    async function loadFaults(resetPage = false) {
        if (resetPage) page = 1;
        const sequence = ++requestSequence;
        if (refresh) {
            refresh.disabled = true;
            refresh.classList.add("loading");
        }

        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: String([25, 50, 100, 200].includes(Number(perPage?.value)) ? Number(perPage.value) : 25),
                search: search?.value?.trim() || "",
                severity: severity?.value || ""
            });

            const response = await fetch(`/api/monitoring/faults?${params}`, {
                method: "GET",
                headers: { Accept: "application/json" },
                credentials: "same-origin",
                cache: "no-store"
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || `Request failed (${response.status})`);
            }
            if (sequence !== requestSequence) return;

            rows = Array.isArray(data.rows) ? data.rows : [];
            renderRows();
            renderPagination(data.pagination || {});
            updateSummary(data.summary || {});

            const updated = document.getElementById("faultLastUpdate");
            if (updated) updated.textContent = `Updated: ${date(data.updated_at)}`;
        } catch (error) {
            console.error("Live Fault:", error);
            body.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-5">${escapeHtml(error.message)}</td></tr>`;
        } finally {
            if (sequence === requestSequence && refresh) {
                refresh.disabled = false;
                refresh.classList.remove("loading");
            }
        }
    }

    body.addEventListener("click", event => {
        const button = event.target.closest("[data-view-row]");
        if (button) openModal(Number(button.dataset.viewRow));
    });

    pagination?.addEventListener("click", event => {
        const button = event.target.closest("[data-page]");
        if (!button) return;
        const target = Number(button.dataset.page);
        if (target < 1 || target > totalPages || target === page) return;
        page = target;
        loadFaults();
    });

    refresh?.addEventListener("click", () => loadFaults());
    search?.addEventListener("input", () => {
        clearTimeout(requestTimer);
        requestTimer = setTimeout(() => loadFaults(true), 350);
    });
    severity?.addEventListener("change", () => loadFaults(true));
    perPage?.addEventListener("change", () => loadFaults(true));

    clear?.addEventListener("click", () => {
        if (search) search.value = "";
        if (severity) severity.value = "";
        if (perPage) perPage.value = "25";
        loadFaults(true);
    });

    ensureModal();
    loadFaults();

    const refreshInterval = Number(window.NETFEE_MONITORING?.refreshInterval ?? 30000);
    if (refreshInterval > 0) {
        setInterval(() => loadFaults(), refreshInterval);
    }
});