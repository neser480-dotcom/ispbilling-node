"use strict";

document.addEventListener("DOMContentLoaded", () => {

    let collectionChart = null;
    let permissions = new Set();
    let currentRouterId = null;
    let mikrotikBusy = false;

    /* billing notice state */
    let currentBilling = null;
    let billingExpiresAt = null;
    let billingLoaded = false;
    let billingTimer = null;

    const $ = id => document.getElementById(id);

    /* ------------------------------------------------------------ helpers */

    const nf = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

    function num(v) {
        const n = Number(v);
        return Number.isFinite(n) ? nf.format(n) : "0";
    }

    function taka(v) {
        const n = Number(v);
        return Number.isFinite(n) ? "৳ " + nf.format(n) : "—";
    }

    function takaShort(v) {
        const n = Number(v);
        return Number.isFinite(n) ? "৳" + nf.format(n) : "";
    }

    function setText(id, value) {
        const el = $(id);
        if (el) el.textContent = value === null || value === undefined || value === "" ? "—" : value;
    }

    function esc(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }

    async function getJson(url) {
        const response = await fetch(url, {
            credentials: "same-origin",
            cache: "no-store",
            headers: { Accept: "application/json" }
        });

        if (response.status === 402) { window.location.href = "/software-billing"; throw new Error("billing"); }
        if (response.status === 401) { window.location.href = "/"; throw new Error("auth"); }

        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.success === false) {
            throw new Error(data.message || `HTTP ${response.status}`);
        }

        return data;
    }

    /* ---------------------------------------------------------- permissions */

    /* removes every block the logged-in user is not allowed to see */
    function applyPermissions() {
        document.querySelectorAll("[data-perm]").forEach(el => {
            if (!permissions.has(el.dataset.perm)) el.remove();
        });
    }

    /* --------------------------------------------------------------- render */

    function newText(count, amount) {
        return `${num(count)}/ ${takaShort(amount)}`;
    }

    function renderCustomers(c) {
        if (!c) return;

        const k = c.counts, a = c.amounts, nc = c.new_counts, na = c.new_amounts;

        setText("v_total", num(k.total));
        setText("f_total", num(nc.total));

        for (const key of ["active", "paid", "unpaid", "expired", "inactive"]) {
            setText("v_" + key, num(k[key]));
            setText("a_" + key, takaShort(a[key]));
            setText("f_" + key, newText(nc[key], na[key]));
        }

        setText("v_free", num(k.free));
    }

    function renderCollection(c) {
        if (!c) return;

        setText("expectedAmount", taka(c.expected));
        setText("collectionAmount", taka(c.collection));

        const percent = Math.max(0, Math.min(100, Number(c.percent) || 0));

        setText("collectionCirclePercent", `${Math.floor(percent)}%`);

        const bar = $("collectionCircleProgress");

        if (bar) {
            const r = Number(bar.getAttribute("r")) || 74;
            const len = 2 * Math.PI * r;
            bar.style.strokeDasharray = String(len);
            bar.style.strokeDashoffset = String(len - (percent / 100) * len);
        }

        setText("v_collnew", num(c.paid_count));
        setText("a_collnew", takaShort(c.collection));
        setText("f_collnew", newText(c.new_paid_count, c.new_paid_amount));
        setText("v_billfee", num(c.bill_and_fee));
        setText("v_today", num(c.today));
    }

    function renderFinance(f) {
        if (!f) return;

        setText("v_connfee", num(f.connection_fee));
        setText("f_connfee", num(f.today_connection_fee));
        setText("v_discount", num(f.discount));
        setText("f_discount", num(f.today_discount));
        setText("v_expend", num(f.expenditure));
        setText("f_expend", num(f.today_expenditure));
        setText("v_salary", num(f.salary));
        setText("v_balance", num(f.balance));
    }

    function renderAdmin(a) {
        if (!a) return;

        setText("v_adm_collection", num(a.collection));
        setText("f_adm_collection", num(a.today_collection));
        setText("v_adm_connfee", num(a.connection_fee));
        setText("f_adm_connfee", num(a.today_connection_fee));
        setText("v_adm_expend", num(a.expenditure));
        setText("v_adm_discount", num(a.discount));
        setText("f_adm_discount", num(a.today_discount));
        setText("v_adm_salary", num(a.salary));
        setText("v_adm_deposit", num(a.deposit));
        setText("v_adm_balance", num(a.balance));
        setText("m_masking", num(a.messages?.masking));
        setText("m_nonmasking", num(a.messages?.non_masking));
        setText("m_fixed", num(a.messages?.fixed));
    }

    function renderCollector(c) {
        if (!c) return;

        setText("v_col_all", num(c.total));
        setText("a_col_all", "৳0");
        setText("f_col_all", num(c.today_collection));
        setText("v_col_connfee", num(c.connection_fee));
        setText("v_col_deposit", num(c.deposit));
        setText("v_col_expend", num(c.expenditure));
        setText("v_col_balance", num(c.balance));
    }

    function renderSuperAdmin(d) {
        $("companyDashboard").style.display = "none";
        $("superAdminDashboard").style.display = "";
        $("pendingBilling").style.display = "none";

        setText("registeredUsers", num(d.registered_users));
        setText("activeUsers", num(d.active_users));
        setText("registrationInvoices", num(d.registration_invoices));
        setText("registrationCollection", taka(d.registration_collection));
        setText("paidRegistration", num(d.paid_registration));
        setText("unpaidRegistration", num(d.unpaid_registration));
        setText("softwarePayments", taka(d.registration_paid_amount));
    }

    /* --------------------------------------------------------------- chart */

    function drawChart(labels, values, type) {
        const canvas = $("collectionChart");

        if (!canvas || typeof Chart === "undefined") return;

        if (collectionChart) collectionChart.destroy();

        collectionChart = new Chart(canvas, {
            type: "line",
            data: {
                labels,
                datasets: [{
                    label: type === "bill" ? "Bill" : "Amount",
                    data: values,
                    borderColor: "#1a9ad6",
                    backgroundColor: "rgba(120,120,120,.28)",
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: "#1a9ad6",
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } },
                plugins: { legend: { position: "top" } }
            }
        });
    }

    async function loadChart() {
        if (!permissions.has("dashboard.chart") || !$("collectionChart")) return;

        const type = document.querySelector('input[name="chartType"]:checked')?.value || "amount";

        const params = new URLSearchParams({
            year: $("chartYear").value,
            month: $("chartMonth").value
        });

        if ($("chartCollector").value) params.set("collector_id", $("chartCollector").value);

        try {
            const d = await getJson(`/api/dashboard/chart?${params}`);
            drawChart(d.labels, d[type] || [], type);
        } catch (e) {
            console.error("[Dashboard] chart:", e.message);
        }
    }

    function setupChartControls(collectors) {
        if (!$("chartYear")) return;

        const now = new Date();

        if (!$("chartYear").options.length) {
            for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) {
                $("chartYear").appendChild(new Option(String(y), String(y)));
            }
            $("chartMonth").value = String(now.getMonth() + 1);
        }

        const select = $("chartCollector");

        if (select && select.options.length <= 1) {
            (collectors || []).forEach(c => select.appendChild(new Option(c.name || `#${c.id}`, String(c.id))));
        }
    }

    /* ------------------------------------------------------------- mikrotik */

    async function loadMikrotik(routerId) {
        if (!routerId || mikrotikBusy || !$("mkOnline")) return;

        mikrotikBusy = true;

        try {
            const data = await getJson(`/api/router/${encodeURIComponent(routerId)}/check`);

            const total = Number(data.pppoe_total);
            const active = Number(data.active_total);

            if (Number.isFinite(total) && Number.isFinite(active)) {
                setText("mkTotal", num(total));
                setText("mkOnline", num(active));
                setText("mkOffline", num(Math.max(0, total - active)));
            }
        } catch (e) {
            ["mkTotal", "mkOnline", "mkOffline"].forEach(id => setText(id, "—"));
        } finally {
            mikrotikBusy = false;
        }
    }

    /* -------------------------------------------------------- software billing */

    function formatCountdown(ms) {
        if (!Number.isFinite(ms) || ms <= 0) return "00:00:00";

        const t = Math.floor(ms / 1000);

        return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60]
            .map(v => String(v).padStart(2, "0")).join(":");
    }

    function hideBillingNotice() {
        const box = $("pendingBilling");
        if (box) { box.innerHTML = ""; }
    }

    function showBillingNotice() {
        const box = $("pendingBilling");
        if (!box || !currentBilling) return;

        const amount = currentBilling.amount !== undefined ? taka(currentBilling.amount) : "—";
        const type = currentBilling.billing_type || "registration";
        const message = currentBilling.message || "Trial active";

        box.innerHTML = `
            <div class="software-billing-notice">
                <div>
                    <div class="sb-title"><i class="fa-solid fa-triangle-exclamation me-1"></i> Software Billing</div>
                    <div class="sb-details"><strong>Amount:</strong> ${esc(amount)} • ${esc(type)} • ${esc(message)}</div>
                </div>
                <div class="sb-right">
                    <span class="sb-count" id="billingCountdown">TRIAL</span>
                    <a class="btn btn-light btn-sm" href="/software-billing">Pay Now</a>
                </div>
            </div>`;

        updateBillingCountdown();
    }

    function updateBillingCountdown() {
        const el = $("billingCountdown");
        if (!el) return;

        if (!billingExpiresAt) { el.textContent = "TRIAL"; return; }

        const remaining = billingExpiresAt - Date.now();

        if (remaining <= 0) {
            el.textContent = "00:00:00";
            window.location.href = "/software-billing";
            return;
        }

        el.textContent = formatCountdown(remaining);
    }

    function setBilling(billing) {
        if (!billing || typeof billing !== "object") return;

        if (String(billing.status || "").toLowerCase() === "paid") {
            currentBilling = null;
            billingExpiresAt = null;
            billingLoaded = true;
            hideBillingNotice();
            return;
        }

        currentBilling = billing;

        const remaining = Number(
            billing.trial_remaining_seconds ?? billing.remaining_seconds ?? billing.remainingSeconds ?? 0
        );

        if (Number.isFinite(remaining) && remaining > 0) {
            billingExpiresAt = Date.now() + remaining * 1000;
        } else {
            const created = new Date(billing.created_at || billing.invoice_date || billing.due_date || "");
            billingExpiresAt = Number.isNaN(created.getTime())
                ? null
                : created.getTime() + 3 * 60 * 60 * 1000;
        }

        if (billingExpiresAt && Date.now() >= billingExpiresAt) {
            window.location.href = "/software-billing";
            return;
        }

        billingLoaded = true;
        showBillingNotice();
    }

    async function loadSoftwareBilling() {
        try {
            const response = await fetch("/api/software-billing/current", {
                credentials: "same-origin",
                cache: "no-store",
                headers: { Accept: "application/json" }
            });

            if (response.status === 401) return;

            if (response.status === 402 || response.status === 403) {
                window.location.href = "/software-billing";
                return;
            }

            if (!response.ok) return;

            const data = await response.json().catch(() => null);

            if (!data) return;

            if (data.type === "super_admin" || data.is_super_admin === true || data.super_admin === true) {
                billingLoaded = true;
                hideBillingNotice();
                return;
            }

            const billing =
                data.billing || data.data?.billing || data.current || data.data?.current ||
                ((data.data && (data.data.id || data.data.amount)) ? data.data : null) ||
                ((data.id || data.amount) ? data : null);

            if (billing) { setBilling(billing); return; }

            billingLoaded = true;
            hideBillingNotice();
        } catch (e) {
            console.warn("[Dashboard] software billing:", e.message);
        }
    }

    /* ------------------------------------------------------------- loader */

    let firstLoad = true;

    async function loadDashboard() {
        const monthValue = $("monthFilter")?.value || "";

        try {
            const data = await getJson(
                `/api/dashboard/data${monthValue ? `?month=${encodeURIComponent(monthValue)}` : ""}`
            );

            if (data.type === "super_admin") {
                renderSuperAdmin(data);
                return;
            }

            permissions = new Set(data.permissions || []);

            if (firstLoad) {
                applyPermissions();
                setupChartControls(data.collectors);

                if ($("monthFilter") && !$("monthFilter").value) $("monthFilter").value = data.month;

                firstLoad = false;

                loadChart();
            }

            renderCustomers(data.customers);
            renderCollection(data.collection);
            renderFinance(data.finance);
            renderAdmin(data.admin);
            renderCollector(data.collector);

            if (data.mikrotik) {
                setText("mkTotal", num(data.mikrotik.total));
                currentRouterId = data.mikrotik.router_id || null;
                loadMikrotik(currentRouterId);
            }

            if (data.pending_billing && !billingLoaded) setBilling(data.pending_billing);

        } catch (e) {
            console.error("[Dashboard] load failed:", e.message);
        }
    }

    /* -------------------------------------------------------------- events */

    $("dashRefreshBtn")?.addEventListener("click", loadDashboard);
    $("dashFilterBtn")?.addEventListener("click", loadDashboard);
    $("chartFilterBtn")?.addEventListener("click", loadChart);

    document.querySelectorAll('input[name="chartType"]').forEach(r =>
        r.addEventListener("change", loadChart)
    );

    setText("footYear", String(new Date().getFullYear()));

    /* ---------------------------------------------------------------- init */

    loadDashboard();
    loadSoftwareBilling();

    billingTimer = setInterval(updateBillingCountdown, 1000);
    setInterval(loadDashboard, 30000);
    setInterval(loadSoftwareBilling, 30000);
    setInterval(() => { if (currentRouterId) loadMikrotik(currentRouterId); }, 5000);

    window.addEventListener("beforeunload", () => { if (billingTimer) clearInterval(billingTimer); });
});
