"use strict";

(() => {
    const API = "/reports/api/collector-deposit";
    const $ = (id) => document.getElementById(id);

    let tab = "deposit";            /* deposit | pending */
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
    const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    function fmtDate(v) {
        const d = v ? new Date(v) : null;
        if (!d || Number.isNaN(d.getTime())) return "";
        let h = d.getHours();
        const ap = h >= 12 ? "PM" : "AM";
        h = h % 12 || 12;
        return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(h)}:${pad(d.getMinutes())} ${ap}`;
    }

    /* ---------- তারিখ: ডিফল্ট = এই মাসের ১ তারিখ থেকে আজ ---------- */

    function setDefaultRange() {
        const n = new Date();
        $("fMonth").value = `${n.getFullYear()}-${pad(n.getMonth() + 1)}`;
        $("fromDate").value = ymd(new Date(n.getFullYear(), n.getMonth(), 1));
        $("toDate").value = ymd(n);
    }

    $("fMonth").addEventListener("change", () => {
        const v = $("fMonth").value;
        if (!v) return;
        const [y, m] = v.split("-").map(Number);
        $("fromDate").value = ymd(new Date(y, m - 1, 1));
        $("toDate").value = ymd(new Date(y, m, 0));
    });

    /* ---------- কালেক্টরের তালিকা ---------- */

    async function loadCollectors() {
        try {
            const r = await fetch(`${API}/collectors`, { credentials: "same-origin", headers: { Accept: "application/json" } });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.status) return;
            const el = $("fCollector");
            const cur = el.value;
            el.innerHTML = `<option value="">Collectors</option>` +
                (d.collectors || []).map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
            if (cur) el.value = cur;
        } catch (e) { console.error("Collector loading error:", e); }
    }

    /* ---------- টেবিলের মাথা (ট্যাব অনুযায়ী) ---------- */

    const COLS = [
        ["id", "#"], ["by", "Deposit By"], ["total", "Total"], ["received", "Received By"],
        ["status", "Status"], ["note", "Note"], ["date", "Date"]
    ];

    function renderHead() {
        const sortable = COLS.map(([k, label]) =>
            `<th data-sort="${k}">${label} <span class="sort-icon">↓↑</span></th>`).join("");
        /* Pending Deposit এ দুটো Action কলাম (স্ক্রিনশট অনুযায়ী) */
        $("headRow").innerHTML = sortable + (tab === "pending" ? "<th>Action</th><th>Action</th>" : "<th>Action</th>");
        $("headRow").querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => {
            sortDir = sortKey === th.dataset.sort ? -sortDir : 1;
            sortKey = th.dataset.sort;
            render();
        }));
    }

    const colspan = () => (tab === "pending" ? 9 : 8);

    /* ---------- ডাটা লোড ---------- */

    function query() {
        const p = new URLSearchParams();
        const set = (k, v) => { if (v) p.set(k, v); };
        p.set("tab", tab);
        set("search", $("search").value.trim());
        if (tab === "deposit") {
            set("collector_id", $("fCollector").value);
            set("from_date", $("fromDate").value);
            set("to_date", $("toDate").value);
        }
        p.set("page", String(page));
        p.set("limit", $("limit").value);
        return p;
    }

    async function load() {
        try {
            const r = await fetch(`${API}?${query()}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.status) throw new Error(d.message || "ডিপোজিট রিপোর্ট লোড করা যায়নি।");

            const notice = $("reportNotice");
            notice.classList.toggle("d-none", d.available !== false);
            notice.textContent = d.available === false ? (d.message || "ডিপোজিট টেবিল পাওয়া যায়নি।") : "";

            rows = d.deposits || [];
            totalPages = Math.max(1, Number(d.pagination?.totalPages || 1));
            const total = Number(d.summary?.total_data || 0);
            $("totalData").textContent = total;
            $("totalAmount").textContent = taka(d.summary?.total_amount);
            $("totalWrap").classList.toggle("d-none", total === 0);
            render();
            renderPager();
        } catch (e) {
            $("reportBody").innerHTML = `<tr><td colspan="${colspan()}">${esc(e.message)}</td></tr>`;
            notify(e.message, "error");
        }
    }

    /* ---------- টেবিল ---------- */

    const sortValue = {
        id: (c) => Number(c.id || 0),
        by: (c) => c.deposit_by,
        total: (c) => Number(c.amount || 0),
        received: (c) => c.received_by,
        status: (c) => c.status,
        note: (c) => c.note,
        date: (c) => new Date(c.deposit_date).getTime() || 0
    };

    function statusBadge(s) {
        const v = String(s || "").trim();
        if (!v) return "";
        const wait = v.toLowerCase() === "pending";
        return `<span class="rp-badge ${wait ? "wait" : "done"}">${esc(v)}</span>`;
    }

    function render() {
        const list = [...rows];
        if (sortKey && sortValue[sortKey]) {
            list.sort((a, b) => sortDir * String(sortValue[sortKey](a) ?? "")
                .localeCompare(String(sortValue[sortKey](b) ?? ""), undefined, { numeric: true }));
        }

        const offset = (page - 1) * Number($("limit").value);
        $("reportBody").innerHTML = list.length ? list.map((c, i) => `
            <tr>
                <td>${offset + i + 1}</td>
                <td>${esc(c.deposit_by)}</td>
                <td class="rp-bold">${taka(c.amount)}</td>
                <td>${esc(c.received_by)}</td>
                <td>${statusBadge(c.status)}</td>
                <td>${esc(c.note)}</td>
                <td>${esc(fmtDate(c.deposit_date))}</td>
                <td></td>${tab === "pending" ? "<td></td>" : ""}
            </tr>`).join("") : `<tr><td colspan="${colspan()}">No Data Found !</td></tr>`;
    }

    function renderPager() {
        $("pageInfo").textContent = `Page ${page} of ${totalPages}`;
        $("prevBtn").disabled = page <= 1;
        $("nextBtn").disabled = page >= totalPages;
    }

    /* ---------- ট্যাব ---------- */

    function setTab(next) {
        if (tab === next) return;
        tab = next;
        page = 1;
        sortKey = "";
        $("tabDeposit").classList.toggle("active", tab === "deposit");
        $("tabPending").classList.toggle("active", tab === "pending");
        $("filterRow").classList.toggle("d-none", tab !== "deposit");
        renderHead();
        $("reportBody").innerHTML = `<tr><td colspan="${colspan()}">Loading...</td></tr>`;
        load();
    }

    $("tabDeposit").addEventListener("click", () => setTab("deposit"));
    $("tabPending").addEventListener("click", () => setTab("pending"));

    /* ---------- ইভেন্ট ---------- */

    $("filterToggle").addEventListener("click", () => {
        if (tab === "deposit") $("filterRow").classList.toggle("d-none");
    });

    $("filterBtn").addEventListener("click", () => { page = 1; load(); });

    $("refreshBtn").addEventListener("click", async () => {
        const btn = $("refreshBtn");
        const icon = btn.querySelector("i");
        btn.disabled = true;
        icon.classList.add("fa-spin");
        try {
            await Promise.all([loadCollectors(), load()]);
        } finally {
            icon.classList.remove("fa-spin");
            btn.disabled = false;
        }
    });

    $("printBtn").addEventListener("click", () => window.print());

    $("search").addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => { page = 1; load(); }, 400);
    });

    $("limit").addEventListener("change", () => { page = 1; load(); });
    $("prevBtn").addEventListener("click", () => { if (page > 1) { page -= 1; load(); } });
    $("nextBtn").addEventListener("click", () => { if (page < totalPages) { page += 1; load(); } });

    /* ---------- শুরু ---------- */

    setDefaultRange();
    renderHead();
    loadCollectors();
    load();
})();
