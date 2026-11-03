"use strict";

(() => {
    const API = "/reports/api/collection";
    const $ = (id) => document.getElementById(id);

    /* অন্য পেইজ (যেমন কাস্টমার) থেকে ?customer_id=.. দিয়ে এলে শুধু ওই কাস্টমারের বিল */
    const rawCustomerId = new URLSearchParams(location.search).get("customer_id");
    const customerId = rawCustomerId && /^\d+$/.test(rawCustomerId) ? rawCustomerId : "";

    /* কাস্টমারের রিপোর্ট হলে হেডারের নাম বদলায় */
    if (customerId) {
        const title = document.querySelector(".staff-header-card h1");
        if (title) title.textContent = "Customer Bill Report";
        document.title = "Customer Bill Report";
    }

    let rows = [];
    let page = 1;
    let totalPages = 1;
    let sortKey = "";
    let sortDir = 1;
    let timer = null;

    const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);

    const notify = (msg, type = "success") => {
        if (window.AppToast?.[type]) return window.AppToast[type](msg);
        const box = $("pageAlert");
        box.className = `alert alert-${type === "error" ? "danger" : "success"}`;
        box.textContent = msg;
        clearTimeout(box._t);
        box._t = setTimeout(() => box.classList.add("d-none"), 4000);
    };

    const pad = (n) => String(n).padStart(2, "0");
    const taka = (n) => "৳" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
    const CONN = { pppoe: "PPPoE", static: "Static", hotspot: "Hotspot" };

    function fmtDate(v) {
        const d = v ? new Date(v) : null;
        if (!d || Number.isNaN(d.getTime())) return "";
        let h = d.getHours();
        const ap = h >= 12 ? "PM" : "AM";
        h = h % 12 || 12;
        return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(h)}:${pad(d.getMinutes())} ${ap}`;
    }

    /* ---------- তারিখ: ডিফল্ট = এই মাসের ১ তারিখ থেকে আজ রাত ১১:৫৯ ---------- */

    const toInput = (d) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    function setDefaultRange() {
        const n = new Date();
        $("fMonth").value = `${n.getFullYear()}-${pad(n.getMonth() + 1)}`;
        $("fromDt").value = toInput(new Date(n.getFullYear(), n.getMonth(), 1, 0, 0));
        $("toDt").value = toInput(new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59));
    }

    $("fMonth").addEventListener("change", () => {
        const v = $("fMonth").value;
        if (!v) return;
        const [y, m] = v.split("-").map(Number);
        $("fromDt").value = toInput(new Date(y, m - 1, 1, 0, 0));
        $("toDt").value = toInput(new Date(y, m, 0, 23, 59));
    });

    /* ---------- ফিল্টারের তালিকা ---------- */

    function fillSelect(id, label, values) {
        const el = $(id);
        const cur = el.value;
        el.innerHTML = `<option value="">${esc(label)}</option>` +
            (values || []).map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
        if (cur && (values || []).includes(cur)) el.value = cur;
    }

    /* items = [{ value, label }]; তালিকা না থাকলে বা কলাম না মিললে বন্ধ থাকে */
    function fillPairs(id, label, items, available, reason) {
        const el = $(id);
        const cur = el.value;
        el.innerHTML = `<option value="">${esc(label)}</option>` +
            (items || []).map((i) => `<option value="${esc(i.value)}">${esc(i.label)}</option>`).join("");
        if (cur && (items || []).some((i) => String(i.value) === cur)) el.value = cur;
        const on = !!available && (items || []).length > 0;
        el.disabled = !on;
        el.title = on ? "" : reason;
    }

    async function loadFilters() {
        try {
            const r = await fetch(`${API}/filters`, { credentials: "same-origin", headers: { Accept: "application/json" } });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.status) throw new Error(d.message || "ফিল্টার লোড করা যায়নি।");
            fillSelect("fPackage", "Package", d.packages);
            fillSelect("fArea", "All Area", d.areas);
            fillSelect("fCollector", "Collected By", d.collectors);
            fillSelect("fBillType", "Bill Type", d.bill_types);
            fillSelect("fMedium", "Medium", d.mediums);

            const av = d.available || {};
            fillPairs("fMikrotik", "Mikrotik",
                (d.mikrotiks || []).map((m) => ({ value: m.id, label: m.name })),
                av.mikrotik, "Mikrotik তালিকা বা customers এর router কলাম পাওয়া যায়নি");
            fillPairs("fSubArea", "Sub Area",
                (d.sub_areas || []).map((s) => ({ value: s.id, label: s.name })),
                av.sub_area, "Sub Area তালিকা বা customers এর sub_area কলাম পাওয়া যায়নি");
            fillPairs("fBillingType", "Billing Type",
                (d.billing_types || []).map((b) => ({ value: b, label: b })),
                av.billing_type, "customers টেবিলে billing_type কলাম পাওয়া যায়নি");
        } catch (e) { notify(e.message, "error"); }
    }

    /* ---------- ডাটা লোড ---------- */

    function query(extra = {}) {
        const p = new URLSearchParams();
        const set = (k, v) => { if (v) p.set(k, v); };
        set("search", $("search").value.trim());
        set("from_dt", $("fromDt").value);
        set("to_dt", $("toDt").value);
        set("package", $("fPackage").value);
        set("area", $("fArea").value);
        set("collected_by", $("fCollector").value);
        set("bill_type", $("fBillType").value);
        set("medium", $("fMedium").value);
        set("mikrotik", $("fMikrotik").value);
        set("sub_area", $("fSubArea").value);
        set("billing_type", $("fBillingType").value);
        set("customer_id", customerId);
        Object.entries(extra).forEach(([k, v]) => p.set(k, v));
        return p;
    }

    async function load() {
        try {
            const r = await fetch(`${API}?${query({ page, limit: $("limit").value })}`, {
                credentials: "same-origin", headers: { Accept: "application/json" }
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.status) throw new Error(d.message || "রিপোর্ট লোড করা যায়নি।");
            rows = d.collections || [];
            totalPages = Math.max(1, Number(d.pagination?.totalPages || 1));
            $("totalData").textContent = Number(d.summary?.total_data || 0);
            $("totalBill").textContent = taka(d.summary?.total_bill);
            render();
            renderPager();
        } catch (e) {
            $("reportBody").innerHTML = `<tr><td colspan="10">${esc(e.message)}</td></tr>`;
            notify(e.message, "error");
        }
    }

    /* ---------- টেবিল ---------- */

    const sortValue = {
        id: (c) => c.id,
        name: (c) => c.customer_name,
        bill: (c) => Number(c.bill_amount || 0),
        discount: (c) => Number(c.discount || 0),
        due: (c) => Number(c.due_amount || 0),
        medium: (c) => c.medium,
        collected_by: (c) => c.collected_by,
        note: (c) => c.note,
        date: (c) => new Date(c.created_at).getTime() || 0
    };

    function render() {
        let list = [...rows];
        if (sortKey && sortValue[sortKey]) {
            list.sort((a, b) => sortDir * String(sortValue[sortKey](a) ?? "")
                .localeCompare(String(sortValue[sortKey](b) ?? ""), undefined, { numeric: true }));
        }

        $("reportBody").innerHTML = list.length ? list.map((c) => {
            const conn = CONN[String(c.connection_type || "").toLowerCase()] || c.connection_type || "";
            const nameLine = [c.customer_name, c.area_name].filter(Boolean).map(esc).join(" / ");
            return `
            <tr>
                <td class="rp-id">${esc(c.id)}${conn ? `<br><span class="rp-badge">${esc(conn)}</span>` : ""}</td>
                <td class="rp-name">${nameLine}<span class="rp-sub">${esc(c.pppoe_username)}</span></td>
                <td>${esc(c.package_name)}<span class="rp-bold d-block">${taka(c.bill_amount)}</span></td>
                <td>${esc(c.discount ?? 0)}</td>
                <td>${esc(c.due_amount ?? 0)}</td>
                <td>${esc(c.medium)}${c.bill_type ? `<br><span class="rp-badge">${esc(c.bill_type)}</span>` : ""}</td>
                <td>${esc(c.collected_by)}${c.collector_role ? `<br><span class="rp-badge">${esc(c.collector_role)}</span>` : ""}</td>
                <td>${esc(c.note)}</td>
                <td>${esc(fmtDate(c.created_at))}</td>
                <td>
                    <div class="dropdown">
                        <button class="staff-dots" data-bs-toggle="dropdown" aria-expanded="false"><i class="fa-solid fa-ellipsis"></i></button>
                        <ul class="dropdown-menu dropdown-menu-end staff-menu">
                            <li><a class="dropdown-item" href="#" data-act="edit" data-id="${esc(c.bill_report_id)}"><i class="fa-solid fa-pen"></i>Edit</a></li>
                        </ul>
                    </div>
                </td>
            </tr>`;
        }).join("") : `<tr><td colspan="10">No Data Found !</td></tr>`;
    }

    function renderPager() {
        $("pageInfo").textContent = `Page ${page} of ${totalPages}`;
        $("prevBtn").disabled = page <= 1;
        $("nextBtn").disabled = page >= totalPages;
    }

    /* ---------- ইভেন্ট ---------- */

    document.addEventListener("click", (ev) => {
        const el = ev.target.closest("[data-act]");
        if (!el) return;
        ev.preventDefault();
        if (el.dataset.act === "edit") notify("Edit ফিচার এখনো যুক্ত করা হয়নি।", "error");
    });

    document.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => {
        sortDir = sortKey === th.dataset.sort ? -sortDir : 1;
        sortKey = th.dataset.sort;
        render();
    }));

    $("filterToggle").addEventListener("click", () => $("filterPanel").classList.toggle("d-none"));

    $("filterBtn").addEventListener("click", () => { page = 1; load(); });

    $("resetBtn").addEventListener("click", () => {
        setDefaultRange();
        ["fPackage", "fArea", "fCollector", "fBillType", "fMedium", "fMikrotik", "fSubArea", "fBillingType"].forEach((id) => { $(id).value = ""; });
        $("search").value = "";
        page = 1;
        load();
    });

    $("csvBtn").addEventListener("click", () => {
        location.href = `${API}/csv?${query()}`;
    });

    $("refreshBtn").addEventListener("click", async () => {
        const btn = $("refreshBtn");
        const icon = btn.querySelector("i");
        btn.disabled = true;
        icon.classList.add("fa-spin");
        try {
            await Promise.all([loadFilters(), load()]);
        } finally {
            icon.classList.remove("fa-spin");
            btn.disabled = false;
        }
    });

    $("backBtn").addEventListener("click", () => {
        if (history.length > 1) history.back();
        else location.href = "/dashboard";
    });

    $("search").addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => { page = 1; load(); }, 300);
    });

    $("limit").addEventListener("change", () => { page = 1; load(); });
    $("prevBtn").addEventListener("click", () => { if (page > 1) { page -= 1; load(); } });
    $("nextBtn").addEventListener("click", () => { if (page < totalPages) { page += 1; load(); } });

    /* ---------- শুরু ---------- */

    setDefaultRange();
    loadFilters();
    load();
})();
