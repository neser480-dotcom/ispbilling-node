(function () {
    "use strict";

    const API = "/api/message";
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];
    const page = document.body.dataset.page;
    let csrf = "";

    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    function toast(box, text, ok) {
        const el = typeof box === "string" ? $(box) : box;
        if (!el) return;
        el.className = "alert " + (ok === false ? "alert-danger" : "alert-success");
        el.textContent = text;
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.add("d-none"), 6000);
    }

    async function loadCsrf() {
        const r = await fetch("/api/csrf-token", { credentials: "same-origin" });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.csrf_token) throw new Error(d.message || "CSRF token পাওয়া যায়নি।");
        csrf = d.csrf_token;
    }

    async function api(path, opt = {}) {
        const method = (opt.method || "GET").toUpperCase();
        const headers = { Accept: "application/json" };
        if (method !== "GET") {
            if (!csrf) await loadCsrf();
            headers["X-CSRF-Token"] = csrf;
            headers["Content-Type"] = "application/json";
        }
        const r = await fetch(API + path, {
            method, headers, credentials: "same-origin",
            body: opt.body ? JSON.stringify(opt.body) : undefined,
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.success === false) throw new Error(d.message || "Request failed");
        return d;
    }

    /* ---------- SMS count (same rule as server) ---------- */
    function count(t) {
        const L = [...t].length, u = /[^\x00-\x7F]/.test(t), s = u ? 70 : 160, m = u ? 67 : 153;
        return { L, sms: !L ? 1 : L <= s ? 1 : Math.ceil(L / m) };
    }
    const radio = (n) => (($(`input[name=${n}]:checked`) || {}).value);
    const setRadio = (n, v) => { const e = $(`input[name=${n}][value="${v}"]`); if (e) e.checked = true; };
    const full = (a, b) => [a.value, b.value].filter(Boolean).join("\n");

    function bindCount(a, b, out) {
        const f = () => { const c = count(full(a, b)); out.textContent = `Letter :${c.L} SMS:${c.sms}`; };
        a.addEventListener("input", f); b.addEventListener("input", f);
        return f;
    }

    function mountVars(box, list, auto, onChange) {
        box.innerHTML = '<input class="form-control form-control-sm mb-2 vt" placeholder="Title">' +
            list.map(([l, v], i) => `<label><input type="checkbox" data-i="${i}"> ${l}: ${v}</label>`).join("");
        const build = () => {
            const t = box.querySelector(".vt").value.trim();
            const lines = [...box.querySelectorAll("[data-i]")].filter((c) => c.checked).map((c) => `${list[c.dataset.i][0]}: ${list[c.dataset.i][1]}`);
            auto.value = (t ? t + "\n" : "") + lines.join("\n");
            onChange();
        };
        box.addEventListener("change", build);
        box.querySelector(".vt").addEventListener("input", build);
    }

    /* ---------- Buy SMS modal ---------- */
    function initBuy() {
        const modal = $("#buyModal");
        if (!modal) return;
        $$(".buy-open").forEach((b) => (b.onclick = () => modal.classList.add("on")));
        ["#buyX", "#buyCancel"].forEach((s) => ($(s).onclick = () => modal.classList.remove("on")));
        const upd = async () => {
            const c = Number($("#buyCount").value);
            if (!c) return ($("#buyPrice").textContent = "0");
            try { $("#buyPrice").textContent = (await api(`/purchase/price?type=${$("#buyType").value}&count=${c}`)).amount; } catch (e) { /* ignore */ }
        };
        $("#buyCount").oninput = upd; $("#buyType").onchange = upd;
        $("#buyGo").onclick = async () => {
            try {
                const r = await api("/purchase", { method: "POST", body: { type: $("#buyType").value, count: Number($("#buyCount").value) } });
                toast("#buyMsg", `অর্ডার #${r.data.id} তৈরি হয়েছে: ৳${r.data.amount}। পেমেন্ট নিশ্চিত হলে SMS যোগ হবে।`, true);
            } catch (e) { toast("#buyMsg", e.message, false); }
        };
    }

    /* ---------- Bulk page ---------- */
    const BULK_VARS = [["USER", "USERNAME"], ["ID", "CUSTOMER_ID"], ["NAME", "CUSTOMER_NAME"], ["BILL", "AMOUNT Tk"], ["LAST DATE", "BILL_DATE"], ["BILL DUE", "BILL_DUE"]];

    async function loadBal() {
        const d = (await api("/balance")).data;
        for (const k in d) { const e = $("#b-" + k); if (e) e.textContent = d[k]; }
    }

    async function loadAreas() {
        const rows = (await api("/areas")).data;
        $("#areas").innerHTML = rows.map((a) =>
            `<div><label class="p"><input type="checkbox" class="ap" value="${a.id}"> ${esc(a.name)}</label>` +
            a.subs.map((s) => `<label><input type="checkbox" class="ac" value="${s.id}"> ${esc(s.name)}</label>`).join("") + "</div>").join("") ||
            '<span class="text-muted">কোনো Area নেই</span>';
        $("#areas").onchange = (e) => {
            if (e.target.classList.contains("ap")) e.target.closest("div").querySelectorAll(".ac").forEach((c) => (c.checked = e.target.checked));
        };
    }

    function initBulk() {
        const refresh = bindCount($("#bulkAuto"), $("#bulkText"), $("#bulkCnt"));
        mountVars($("#bulkVars"), BULK_VARS, $("#bulkAuto"), refresh);
        $("#allArea").onchange = (e) => $$("#areas input").forEach((c) => (c.checked = e.target.checked));
        $("#refreshBal").onclick = () => loadBal().catch((e) => toast("#bulkMsg", e.message, false));

        $("#bulkSend").onclick = async () => {
            const all = $("#allArea").checked;
            const body = {
                messageType: radio("mt"), sendType: radio("st"), message: full($("#bulkAuto"), $("#bulkText")),
                filters: {
                    areaIds: all ? [] : $$("#areas .ap:checked").map((c) => +c.value),
                    subAreaIds: all ? [] : $$("#areas .ac:checked").map((c) => +c.value),
                    status: radio("fs"), days: $("#days").value, date: $("#billDate").value,
                },
            };
            const btn = $("#bulkSend");
            try {
                btn.disabled = true;
                const p = (await api("/bulk/preview", { method: "POST", body })).data;
                if (!p.recipients) return toast("#bulkMsg", "কোনো কাস্টমার পাওয়া যায়নি", false);
                if (!p.enough) return toast("#bulkMsg", `ব্যালেন্স কম: দরকার ${p.totalSms} SMS, আছে ${p.balance}`, false);
                if (!confirm(`${p.recipients} জন কাস্টমারকে (${p.totalSms} SMS) পাঠাবেন?`)) return;
                const r = (await api("/bulk/send", { method: "POST", body })).data;
                toast("#bulkMsg", `সফল ${r.sent}, ব্যর্থ ${r.failed}, কাটা হয়েছে ${r.charged} SMS`, true);
                loadBal();
            } catch (e) { toast("#bulkMsg", e.message, false); }
            finally { btn.disabled = false; }
        };
        loadBal().catch(() => {}); loadAreas().catch((e) => toast("#bulkMsg", e.message, false));
    }

    /* ---------- Template page ---------- */
    const TPL = { bill_confirmation: "Bill Confirmation", connection_fee: "Connection Fee", alert: "Alert", calendar_alert: "Calender Alert", new_customer: "New Customer", expired_customer: "Expired Customer", salary: "Salary", reseller_recharge: "Reseller Recharge", customer_ticket: "Customer Ticket", customer_notify: "Customer Notify", assign_ticket: "Assign Ticket", manual_active_inactive: "Manual Active/Inactive" };
    const TPL_VARS = [["USER", "USERNAME"], ["ID", "CUSTOMER_ID"], ["NAME", "CUSTOMER_NAME"], ["BILL", "AMOUNT"], ["DUE", "BILL_DUE"], ["NOTE", "BILL_NOTE"], ["MONTH", "BILL_MONTH"], ["DATE", "BILL_NOTE_DATE"], ["PAID AT", "PAID_AT"]];
    let tpls = [], cur = "bill_confirmation", tplRefresh;

    function showTpl() {
        const t = tpls.find((x) => x.event_key === cur);
        $("#tplLabel").textContent = TPL[cur] + " SMS Template";
        setRadio("tmt", t.message_type); setRadio("tst", t.send_type); setRadio("ten", String(t.enabled));
        $("#tplAuto").value = ""; $("#tplText").value = t.body;
        $$("#tplVars [data-i]").forEach((c) => (c.checked = false));
        tplRefresh();
    }
    function drawTabs() {
        $("#tplTabs").innerHTML = tpls.map((t) => `<button data-k="${t.event_key}" class="${t.event_key === cur ? "on" : ""}">${TPL[t.event_key]}</button>`).join("");
        $$("#tplTabs button").forEach((b) => (b.onclick = () => { cur = b.dataset.k; drawTabs(); showTpl(); }));
    }
    async function loadTpl() { tpls = (await api("/templates")).data; drawTabs(); showTpl(); }

    function initTpl() {
        tplRefresh = bindCount($("#tplAuto"), $("#tplText"), $("#tplCnt"));
        mountVars($("#tplVars"), TPL_VARS, $("#tplAuto"), tplRefresh);
        $("#tplSave").onclick = async () => {
            try {
                await api("/templates/" + cur, { method: "PUT", body: {
                    enabled: Number(radio("ten")), message_type: radio("tmt"), send_type: radio("tst"),
                    title: "", body: full($("#tplAuto"), $("#tplText")),
                } });
                toast("#tplMsg", "সেভ হয়েছে", true); loadTpl();
            } catch (e) { toast("#tplMsg", e.message, false); }
        };
        loadTpl().catch((e) => toast("#tplMsg", e.message, false));
    }

    /* ---------- Log page ---------- */
    let ch = "non_masking", pg = 1;
    async function loadLog() {
        const q = new URLSearchParams({ channel: ch, page: pg, kind: $("#fKind").value, status: $("#fStatus").value, from: $("#fFrom").value, to: $("#fTo").value, q: $("#fQ").value });
        [...q.keys()].forEach((k) => !q.get(k) && q.delete(k));
        const d = await api("/log?" + q);
        const voice = ch === "voice";
        $("#logTotal").textContent = `Total Data: ${d.total}` + (voice ? "" : ` Count: ${d.count}`);
        $("#logHead").innerHTML = "<tr><th>#</th><th>Mobile</th>" + (voice
            ? "<th>Type</th><th>Attempt</th><th>Status</th><th>Duration</th><th>Created At</th>"
            : "<th>Status</th><th>Type</th><th>Count</th><th>Created At</th><th>Message</th>") + "</tr>";
        $("#logBody").innerHTML = d.rows.length ? d.rows.map((r, i) => {
            const n = (pg - 1) * d.size + i + 1, when = esc(new Date(r.created_at).toLocaleString());
            const st = `<span class="sms-tag ${esc(r.status)}">${esc(r.status)}</span>`;
            const ty = `<span class="sms-tag ${r.kind === "bulk" ? "bulk" : "other"}">${esc(r.kind)}</span>`;
            return voice
                ? `<tr><td>${n}</td><td>${esc(r.mobile)}</td><td>${ty}</td><td>${r.attempt}</td><td>${st}</td><td>${esc(r.duration ?? "")}</td><td>${when}</td></tr>`
                : `<tr><td>${n}</td><td>${esc(r.mobile)}</td><td>${st}</td><td>${ty}</td><td>${r.sms_count}</td><td>${when}</td><td>${esc(r.message)}</td></tr>`;
        }).join("") : '<tr><td colspan="7" class="text-center py-4">No Data Found !</td></tr>';
        $("#pgNo").textContent = pg;
        $("#next").disabled = pg * d.size >= d.total; $("#prev").disabled = pg <= 1;
    }
    function initLog() {
        $$("#logTabs button").forEach((b) => (b.onclick = () => {
            ch = b.dataset.ch; pg = 1;
            $$("#logTabs button").forEach((x) => x.classList.toggle("on", x === b));
            loadLog().catch(() => {});
        }));
        $("#fGo").onclick = () => { pg = 1; loadLog().catch(() => {}); };
        $("#fQ").oninput = () => { clearTimeout(window._smsT); window._smsT = setTimeout(() => { pg = 1; loadLog().catch(() => {}); }, 350); };
        $("#prev").onclick = () => { pg--; loadLog(); };
        $("#next").onclick = () => { pg++; loadLog(); };
        loadLog().catch((e) => toast("#pageAlert", e.message, false));
    }

    document.addEventListener("DOMContentLoaded", () => {
        initBuy();
        if (page === "send") initBulk();
        if (page === "tpl") initTpl();
        if (page === "log") initLog();
    });
})();
