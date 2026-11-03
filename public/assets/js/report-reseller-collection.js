"use strict";

(() => {
    const API = "/reports/api/reseller-collection";
    const $ = (id) => document.getElementById(id);

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

    /* ---------- রিসেলারের তালিকা ---------- */

    async function loadResellers() {
        try {
            const r = await fetch("/reports/api/resellers", { credentials: "same-origin", headers: { Accept: "application/json" } });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.status) return;
            const el = $("reseller");
            const cur = el.value;
            el.innerHTML = `<option value="">All Resellers</option>` + (d.resellers || []).map((x) =>
                `<option value="${esc(x.reseller_id)}">${esc(x.reseller_name
                    ? `${x.reseller_name} (#${x.reseller_id})` : `Reseller #${x.reseller_id}`)}</option>`).join("");
            if (cur) el.value = cur;
        } catch (e) { console.error("Reseller loading error:", e); }
    }

    /* ---------- ডাটা লোড ---------- */

    function query() {
        const p = new URLSearchParams();
        const set = (k, v) => { if (v) p.set(k, v); };
        set("search", $("search").value.trim());
        set("reseller_id", $("reseller").value);
        set("from_date", $("fromDate").value);
        set("to_date", $("toDate").value);
        p.set("page", String(page));
        p.set("limit", $("limit").value);
        return p;
    }

    async function load() {
        try {
            const r = await fetch(`${API}?${query()}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.status) throw new Error(d.message || "রিপোর্ট লোড করা যায়নি।");
            rows = d.collections || [];
            totalPages = Math.max(1, Number(d.pagination?.totalPages || 1));
            const total = Number(d.summary?.total_data || 0);
            $("totalData").textContent = total;
            $("totalBill").textContent = taka(d.summary?.total_bill);
            $("totalWrap").classList.toggle("d-none", total === 0);
            render();
            renderPager();
        } catch (e) {
            $("reportBody").innerHTML = `<tr><td colspan="9">${esc(e.message)}</td></tr>`;
            notify(e.message, "error");
        }
    }

    /* ---------- টেবিল ---------- */

    const sortValue = {
        id: (c) => c.customer_id,
        name: (c) => c.name_info?.name,
        bill: (c) => Number(c.package_bill?.bill || 0),
        due: (c) => Number(c.due || 0),
        medium: (c) => c.medium_type?.medium,
        collected: (c) => Number(c.collected || 0),
        commission: (c) => Number(c.commission || 0),
        note: (c) => c.note,
        date: (c) => new Date(c.date).getTime() || 0
    };

    function render() {
        const list = [...rows];
        if (sortKey && sortValue[sortKey]) {
            list.sort((a, b) => sortDir * String(sortValue[sortKey](a) ?? "")
                .localeCompare(String(sortValue[sortKey](b) ?? ""), undefined, { numeric: true }));
        }

        $("reportBody").innerHTML = list.length ? list.map((c) => {
            const info = c.name_info || {};
            const pkg = c.package_bill || {};
            const med = c.medium_type || {};
            const conn = CONN[String(c.connection_type || "").toLowerCase()] || c.connection_type || "";
            const nameLine = [info.name, info.area].filter(Boolean).map(esc).join(" / ");
            return `
            <tr>
                <td class="rp-id">${esc(c.customer_id)}${conn ? `<br><span class="rp-badge">${esc(conn)}</span>` : ""}</td>
                <td class="rp-name">${nameLine}<span class="rp-sub">${esc(info.pppoe)}</span>${info.phone ? `<span class="rp-sub">${esc(info.phone)}</span>` : ""}</td>
                <td>${esc(pkg.package)}<span class="rp-bold d-block">${taka(pkg.bill)}</span></td>
                <td>${esc(c.due ?? 0)}</td>
                <td>${esc(med.medium)}${med.type ? `<br><span class="rp-badge">${esc(med.type)}</span>` : ""}</td>
                <td><span class="rp-bold">${taka(c.collected)}</span>${c.collected_by ? `<span class="rp-sub">${esc(c.collected_by)}</span>` : ""}${c.collector_role ? `<span class="rp-badge">${esc(c.collector_role)}</span>` : ""}</td>
                <td>${esc(c.commission ?? 0)}</td>
                <td>${esc(c.note)}</td>
                <td>${esc(fmtDate(c.date))}</td>
            </tr>`;
        }).join("") : `<tr><td colspan="9">No Data Found !</td></tr>`;
    }

    function renderPager() {
        $("pageInfo").textContent = `Page ${page} of ${totalPages}`;
        $("prevBtn").disabled = page <= 1;
        $("nextBtn").disabled = page >= totalPages;
    }

    /* ---------- ইভেন্ট ---------- */

    document.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => {
        sortDir = sortKey === th.dataset.sort ? -sortDir : 1;
        sortKey = th.dataset.sort;
        render();
    }));

    $("filterToggle").addEventListener("click", () => $("filterPanel").classList.toggle("d-none"));

    $("filterBtn").addEventListener("click", () => { page = 1; load(); });

    $("resetBtn").addEventListener("click", () => {
        $("reseller").value = "";
        $("fromDate").value = "";
        $("toDate").value = "";
        $("search").value = "";
        page = 1;
        load();
    });

    $("refreshBtn").addEventListener("click", async () => {
        const btn = $("refreshBtn");
        const icon = btn.querySelector("i");
        btn.disabled = true;
        icon.classList.add("fa-spin");
        try {
            await Promise.all([loadResellers(), load()]);
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
        timer = setTimeout(() => { page = 1; load(); }, 400);
    });

    $("reseller").addEventListener("change", () => { page = 1; load(); });
    $("limit").addEventListener("change", () => { page = 1; load(); });
    $("prevBtn").addEventListener("click", () => { if (page > 1) { page -= 1; load(); } });
    $("nextBtn").addEventListener("click", () => { if (page < totalPages) { page += 1; load(); } });

    /* ---------- শুরু ---------- */

    loadResellers();
    load();
})();
