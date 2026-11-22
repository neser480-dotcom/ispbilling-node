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
        return Number.isFinite(n) ? "৳ " + Math.round(n).toLocaleString("en-IN") : "—";
    }

    function takaShort(v) {
        const n = Number(v);
        return Number.isFinite(n) ? "৳" + Math.round(n).toLocaleString("en-IN") : "";
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

        if (String(currentBilling.billing_type || "").toLowerCase() === "monthly") {
            const d = new Date(billingExpiresAt);
            const p2 = n => String(n).padStart(2, "0");
            const h12 = d.getHours() % 12 || 12;
            const dueText = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(h12)}:${p2(d.getMinutes())} ${d.getHours() >= 12 ? "PM" : "AM"}`;

            const daysLeft = (billingExpiresAt - Date.now()) / 86400000;
            const level = daysLeft < 3 ? "danger" : "warn";   /* yellow, then red in the last 3 days */

            box.innerHTML = `
                <div class="mf-notice mf-${level}">
                    <i class="fa-solid fa-triangle-exclamation mf-ico"></i>
                    <div class="mf-text">
                        Amader billing
                        <span class="mf-chip">${esc(taka(currentBilling.amount || 0))} Tk</span>.
                        Please make payment before
                        <span class="mf-chip">${esc(dueText)}</span>
                    </div>
                    <span id="billingCountdown" style="display:none"></span>
                    <a class="btn btn-primary btn-sm mf-pay" href="/software-billing">Pay Now</a>
                </div>`;

            updateBillingCountdown();
            return;
        }

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

        if (String(currentBilling?.billing_type || "").toLowerCase() === "monthly") {
            const days = Math.floor(remaining / 86400000);
            el.textContent = `${days}d ${formatCountdown(remaining % 86400000)}`;
            return;
        }

        el.textContent = formatCountdown(remaining);
    }

    function setBilling(billing, extra) {
        if (!billing || typeof billing !== "object") return;

        if (String(billing.status || "").toLowerCase() === "paid") {
            currentBilling = null;
            billingExpiresAt = null;
            billingLoaded = true;
            hideBillingNotice();
            return;
        }

        currentBilling = billing;

        if (String(billing.billing_type || "").toLowerCase() === "monthly") {
            const due = new Date(billing.due_date || "").getTime();

            if (Number.isNaN(due)) { hideBillingNotice(); billingLoaded = true; return; }

            billingExpiresAt = due;
            billingLoaded = true;

            /* shown only inside the 7-day window (server decides: monthly_notice) */
            if (extra && extra.monthly_notice === false) { hideBillingNotice(); return; }

            if (Date.now() >= due) { window.location.href = "/software-billing"; return; }

            showBillingNotice();
            return;
        }

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

            if (billing) { setBilling(billing, data); return; }

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


    /* ------------------------------------------------- super admin notices */

    let noticeItems = [];
    let noticeLoadedAt = 0;

    function renderNotices() {
        const wrap = $("noticeFloat");
        if (!wrap) return;

        const now = Date.now();
        const live = noticeItems.filter(n => n.type === "maintenance" && n._expiresAt > now);
        const key = live.map(n => n.id + ":" + n.title + ":" + n.message).join("|");

        if (wrap.dataset.key === key) return;          /* nothing changed: keep animation running */
        wrap.dataset.key = key;

        const item = n => `
            <span class="nf-item">
                <strong>${esc(n.title)}</strong>
                <span>${esc(String(n.message || "").replace(/\s*\n+\s*/g, "  •  "))}</span>
                <em>(until ${esc(n.ends_at)})</em>
            </span>`;

        wrap.innerHTML = live.map(n => `
            <div class="nf-bar" data-id="${esc(n.id)}">
                <span class="nf-label"><i class="fa-solid fa-screwdriver-wrench"></i> Notice</span>
                <div class="nf-viewport">
                    <div class="nf-track">${item(n)}${item(n)}</div>
                </div>
            </div>`).join("");

        document.body.classList.toggle("has-nf", live.length > 0);

        /* seamless loop: repeat the text until one half is wider than the screen */
        wrap.querySelectorAll(".nf-bar").forEach((bar, i) => {
            const track = bar.querySelector(".nf-track");
            const view = bar.querySelector(".nf-viewport");
            const one = track.firstElementChild.offsetWidth || 1;
            const per = Math.max(1, Math.ceil(view.offsetWidth / one));

            if (per > 1) track.innerHTML = item(live[i]).repeat(per * 2);

            /* about 70px per second, whatever the screen or text length */
            track.style.animationDuration = Math.max(8, (track.scrollWidth / 2) / 70) + "s";
        });
    }

    async function loadNotices() {
        try {
            const r = await fetch("/api/notices/active", { credentials: "same-origin", headers: { Accept: "application/json" } });
            const d = await r.json();
            const t = Date.now();

            noticeItems = [];

            ["invoice", "maintenance"].forEach(type => {
                (d[type] || []).forEach(n => noticeItems.push({
                    ...n,
                    type,
                    _expiresAt: t + Number(n.remaining_seconds || 0) * 1000
                }));
            });

            renderNotices();
        } catch (e) {
            /* notices are optional; dashboard works without them */
        }
    }

    /* ------------------------------------------- customer list popup */

    /* card number element id -> list type */
    const LIST_LINKS = {
        v_total: "total", v_active: "active", v_paid: "paid", v_unpaid: "unpaid",
        v_expired: "expired", v_inactive: "inactive", v_free: "free", v_discount: "discount",
        v_collnew: "paid"
    };

    let listItems = [];
    let listType = "total";
    let listSort = { key: "id", dir: 1 };
    let listModal = null;

    const COLS = [
        { key: "id", label: "ID", sort: true },
        { key: "name", label: "Name & PP/IP/Hp", sort: true },
        { key: "mobile", label: "Mobile/Address", sort: true },
        { key: "package", label: "Package", sort: true },
        { key: "bill", label: "Bill/Balance", sort: true },
        { key: "discount", label: "Discount", sort: true, only: "discount" },
        { key: "expire_date", label: "Bill/Promise Date", sort: true },
        { key: "day_left", label: "Day Left", sort: true },
        { key: "status", label: "Status", sort: true }
    ];

    function fmtDate(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "";
        const p = n => String(n).padStart(2, "0");
        const h12 = d.getHours() % 12 || 12;
        return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(h12)}:${p(d.getMinutes())} ${d.getHours() >= 12 ? "PM" : "AM"}`;
    }

    function listColumns() {
        return COLS.filter(c => !c.only || c.only === listType);
    }

    function renderListHead() {
        $("custListHead").innerHTML = "<tr>" + listColumns().map(c => {
            const arrow = c.sort ? ` <i class="fa-solid fa-arrow-down-up-across-line cl-sort${listSort.key === c.key ? " on" : ""}"></i>` : "";
            return `<th data-key="${c.key}"${c.sort ? ' class="cl-th"' : ""}>${esc(c.label)}${arrow}</th>`;
        }).join("") + "<th>Action</th></tr>";
    }

    function listRowHtml(i) {
        const colspanDiscount = listType === "discount" ? `<td>${esc(taka(i.discount))}</td>` : "";

        let dayCell = "";
        if (i.day_left !== null) {
            dayCell = i.day_left < 0
                ? `<span class="cl-day neg">${i.day_left}</span>`
                : `<span class="cl-day pos">${i.day_left}</span>`;
        }

        const promiseLine = i.promise_date
            ? `<div class="${new Date(i.promise_date) < new Date() ? "cl-red" : "cl-amber"}">${esc(fmtDate(i.promise_date))}</div>`
            : `<div>${esc(fmtDate(i.expire_date))}</div>`;

        const dateCell = i.promise_date
            ? `<div>${esc(fmtDate(i.expire_date))}</div>${promiseLine}`
            : `<div>${esc(fmtDate(i.expire_date))}</div>${promiseLine}`;

        return `
            <tr>
                <td class="cl-id">${esc(i.customer_id || i.id)}<span class="cl-badge">${esc(i.conn_type)}</span></td>
                <td><div>${esc(i.name)}${i.sub ? " / " + esc(i.sub) : ""}</div><div>${esc(i.username)}</div></td>
                <td>
                    <div><i class="fa-solid fa-mobile-screen cl-ico"></i> <b>${esc(i.mobile || "N/A")}</b></div>
                    <div><i class="fa-solid fa-location-dot cl-ico2"></i> ${esc(i.address || "N/A")}</div>
                </td>
                <td>${esc(i.package)}</td>
                <td><div><b>${esc(takaShort(i.bill))}</b></div><div class="cl-green">${esc(takaShort(i.balance))}</div></td>
                ${colspanDiscount}
                <td>${dateCell}</td>
                <td>${dayCell}</td>
                <td>
                    <span class="cl-tag ${i.paid ? "paid" : "unpaid"}">${i.paid ? "paid" : "unpaid"}</span>
                    <span class="cl-tag ${esc(i.status)}">${esc(i.status)}</span>
                </td>
                <td><button type="button" class="cl-act customer-profile-btn" data-id="${esc(i.id)}" title="Profile"><i class="fa-regular fa-user"></i></button></td>
            </tr>`;
    }

    function renderListBody() {
        const q = ($("custListSearch").value || "").trim().toLowerCase();
        const { key, dir } = listSort;

        const rows = listItems
            .filter(i => !q || [i.customer_id, i.id, i.name, i.sub, i.username, i.mobile, i.address, i.package]
                .some(v => String(v ?? "").toLowerCase().includes(q)))
            .sort((a, b) => {
                const x = a[key] ?? "", y = b[key] ?? "";
                if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
                return String(x).localeCompare(String(y), undefined, { numeric: true }) * dir;
            });

        const cols = listColumns().length + 1;

        $("custListBody").innerHTML = rows.length
            ? rows.map(listRowHtml).join("")
            : `<tr><td colspan="${cols}" class="cl-empty">No Data Found !</td></tr>`;
    }

    async function openCustomerList(type) {
        const modalEl = $("custListModal");
        if (!modalEl || typeof bootstrap === "undefined") return;

        listType = type;
        listSort = { key: "id", dir: 1 };
        listItems = [];

        $("custListSearch").value = "";
        $("custListTitle").textContent = "Loading...";
        $("custListCount").textContent = "0";
        $("custListSummary").textContent = "";
        renderListHead();
        $("custListBody").innerHTML = `<tr><td colspan="${listColumns().length + 1}" class="cl-empty">Loading...</td></tr>`;

        listModal = listModal || new bootstrap.Modal(modalEl);
        listModal.show();

        try {
            const month = $("monthFilter")?.value || "";
            const params = new URLSearchParams({ type });
            if (month) params.set("month", month);

            const d = await getJson(`/api/dashboard/customers?${params}`);

            listItems = d.items || [];

            $("custListTitle").textContent = d.title || "Customers";
            $("custListCount").textContent = num(d.count);

            const bits = [];
            if (type !== "free") bits.push(`Total Bill: ${taka(d.total_bill)}`);
            if (type === "active") bits.push(`Total Balance: ${taka(d.total_balance)}`);
            if (type === "discount") bits.push(`Total Discount: ${taka(d.total_discount)}`);
            $("custListSummary").textContent = bits.join("   ");

            renderListHead();
            renderListBody();
        } catch (e) {
            $("custListTitle").textContent = "Customers";
            $("custListBody").innerHTML = `<tr><td colspan="${listColumns().length + 1}" class="cl-empty">${esc(e.message)}</td></tr>`;
        }
    }

    function printCustomerList() {
        const w = window.open("", "_blank");
        if (!w) return;

        const head = listColumns().map(c => `<th>${esc(c.label)}</th>`).join("");
        const body = listItems.map(i => `<tr>
            <td>${esc(i.customer_id || i.id)}</td>
            <td>${esc(i.name)}${i.sub ? " / " + esc(i.sub) : ""}<br>${esc(i.username)}</td>
            <td>${esc(i.mobile || "N/A")}<br>${esc(i.address || "N/A")}</td>
            <td>${esc(i.package)}</td>
            <td>${esc(takaShort(i.bill))}<br>${esc(takaShort(i.balance))}</td>
            ${listType === "discount" ? `<td>${esc(takaShort(i.discount))}</td>` : ""}
            <td>${esc(fmtDate(i.expire_date))}<br>${esc(fmtDate(i.promise_date))}</td>
            <td>${i.day_left ?? ""}</td>
            <td>${i.paid ? "paid" : "unpaid"} / ${esc(i.status)}</td></tr>`).join("");

        w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc($("custListTitle").textContent)}</title>
            <style>body{font-family:Arial,sans-serif;font-size:12px}table{width:100%;border-collapse:collapse}
            th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee}</style></head>
            <body><h3>${esc($("custListTitle").textContent)} (${listItems.length})</h3>
            <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`);
        w.document.close();
        w.focus();
        w.print();
    }

    /* make the card numbers clickable (elements removed by permissions are skipped) */
    Object.entries(LIST_LINKS).forEach(([id, type]) => {
        const el = $(id);
        if (!el) return;

        el.classList.add("dc-link");
        el.title = "Click to view list";
        el.addEventListener("click", () => openCustomerList(type));
    });

    /* move focus out before Bootstrap sets aria-hidden (removes the console warning) */
    document.addEventListener("hide.bs.modal", () => {
        if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    });

    $("custListSearch")?.addEventListener("input", renderListBody);
    $("custListPrint")?.addEventListener("click", printCustomerList);

    $("custListHead")?.addEventListener("click", e => {
        const th = e.target.closest("th[data-key]");
        if (!th || !th.classList.contains("cl-th")) return;

        const key = th.dataset.key;
        listSort = { key, dir: listSort.key === key ? -listSort.dir : 1 };
        renderListHead();
        renderListBody();
    });

    /* ---------------------------------------------------------------- init */

    loadDashboard();
    loadSoftwareBilling();
    loadNotices();

    billingTimer = setInterval(updateBillingCountdown, 1000);
    setInterval(loadDashboard, 30000);
    setInterval(loadSoftwareBilling, 30000);
    setInterval(renderNotices, 15000);
    setInterval(loadNotices, 60000);
    setInterval(() => { if (currentRouterId) loadMikrotik(currentRouterId); }, 5000);

    window.addEventListener("beforeunload", () => { if (billingTimer) clearInterval(billingTimer); });
});
