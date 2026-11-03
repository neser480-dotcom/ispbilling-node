"use strict";

(() => {
    const api = "/api/staff";

    /* ⋯ মেনুর "Salary" যে পেজ খুলবে (সেই পেজ ?id= নেয়) */
    const salaryUrl = (id) => `/staff/salary?id=${encodeURIComponent(id)}`;

    const $ = (id) => document.getElementById(id);
    let csrfToken = "";
    let timer = null;
    let rows = [];
    let sortKey = "id";
    let sortDir = -1;

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

    async function loadCsrf() {
        const r = await fetch("/api/csrf-token", { credentials: "same-origin" });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.csrf_token) throw new Error(d.message || "CSRF token পাওয়া যায়নি।");
        csrfToken = d.csrf_token;
        $("csrfTokenInput").value = csrfToken;
    }

    async function request(url, options = {}) {
        const method = (options.method || "GET").toUpperCase();
        const headers = { Accept: "application/json" };
        if (method !== "GET") {
            if (!csrfToken) await loadCsrf();
            headers["X-CSRF-Token"] = csrfToken;
            headers["Content-Type"] = "application/json";
        }
        const r = await fetch(url, {
            method, headers, credentials: "same-origin",
            body: options.body ? JSON.stringify(options.body) : undefined
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.success === false || d.status === false) {
            throw new Error(d.message || "অনুরোধটি সম্পন্ন হয়নি।");
        }
        return d;
    }

    const badge = (s) => {
        const v = String(s || "").toLowerCase();
        return `<span class="staff-badge ${v === "active" ? "active" : "inactive"}">${esc(v)}</span>`;
    };

    function render() {
        const sorted = [...rows].sort((a, b) =>
            sortDir * String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""), undefined, { numeric: true }));
        $("totalData").textContent = sorted.length;
        $("staffTableBody").innerHTML = sorted.length
            ? sorted.map((s, i) => `
            <tr>
                <td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(s.mobile)}</td>
                <td>${badge(s.status)}</td><td>${esc(s.salary)}</td><td>${esc(s.due)}</td>
                <td>
                    <div class="dropdown">
                        <button class="staff-dots" data-bs-toggle="dropdown" aria-expanded="false"><i class="fa-solid fa-ellipsis"></i></button>
                        <ul class="dropdown-menu dropdown-menu-end staff-menu">
                            <li><a class="dropdown-item" href="#" data-act="edit" data-id="${s.id}"><i class="fa-solid fa-pen"></i>Edit</a></li>
                            <li><a class="dropdown-item" href="${salaryUrl(s.id)}"><i class="fa-solid fa-dollar-sign"></i>Salary</a></li>
                            <li><a class="dropdown-item" href="#" data-act="message" data-id="${s.id}" data-name="${esc(s.name)}"><i class="fa-regular fa-comment"></i>Message</a></li>
                            <li><a class="dropdown-item" href="#" data-act="delete" data-id="${s.id}"><i class="fa-solid fa-trash"></i>Delete</a></li>
                        </ul>
                    </div>
                </td>
            </tr>`).join("")
            : `<tr><td colspan="7">No data found</td></tr>`;
    }

    async function loadList() {
        const q = encodeURIComponent($("staffSearch").value.trim());
        try {
            const d = await request(`${api}/data?search=${q}`);
            rows = d.staff || d.data || [];
            render();
        } catch (e) { notify(e.message, "error"); }
    }

    /* ---------- Add ---------- */
    const REF = ["ref_name", "ref_mobile", "ref_email", "ref_nid", "ref_address", "ref_relation"];

    function formBody(p) {
        const body = {
            name: $(`${p}_name`).value, mobile: $(`${p}_mobile`).value,
            nid_no: $(`${p}_nid`).value, address: $(`${p}_address`).value,
            email: $(`${p}_email`).value, parent_name: $(`${p}_parent`).value,
            salary: $(`${p}_salary`).value
        };
        REF.forEach((k) => { body[k] = $(`${p}_${k}`).value; });
        return body;
    }

    $("addBtn").addEventListener("click", () => {
        $("addForm").reset();
        bootstrap.Modal.getOrCreateInstance($("addModal")).show();
    });

    $("addForm").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        try {
            const d = await request(api, { method: "POST", body: formBody("ad") });
            bootstrap.Modal.getInstance($("addModal"))?.hide();
            notify(d.message || "Staff added successfully.");
            loadList();
        } catch (e) { notify(e.message, "error"); }
    });

    /* ---------- Update ---------- */
    function openEdit(id) {
        const s = rows.find((r) => String(r.id) === String(id));
        if (!s) return;
        $("ed_id").value = s.id;
        $("ed_name").value = s.name || "";
        $("ed_mobile").value = s.mobile || "";
        $("ed_nid").value = s.nid_no || "";
        $("ed_address").value = s.address || "";
        $("ed_email").value = s.email || "";
        $("ed_parent").value = s.parent_name || "";
        $("ed_salary").value = s.salary ?? 0;
        $("ed_due").value = s.due ?? 0;
        REF.forEach((k) => { $(`ed_${k}`).value = s[k] || ""; });
        const st = String(s.status || "active").toLowerCase();
        ($(`edSt_${st}`) || $("edSt_active")).checked = true;
        bootstrap.Modal.getOrCreateInstance($("editModal")).show();
    }

    $("editForm").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        try {
            const body = formBody("ed");
            body.status = document.querySelector('input[name="ed_status"]:checked').value;
            const d = await request(`${api}/${$("ed_id").value}`, { method: "PUT", body });
            bootstrap.Modal.getInstance($("editModal"))?.hide();
            notify(d.message || "Staff updated successfully.");
            loadList();
        } catch (e) { notify(e.message, "error"); }
    });

    /* ---------- Message ---------- */
    function countSms() {
        const t = $("sms_text").value;
        const unicode = /[^\x00-\x7F]/.test(t);
        const single = unicode ? 70 : 160;
        const multi = unicode ? 67 : 153;
        $("sms_letters").textContent = t.length;
        $("sms_count").textContent = !t.length ? 0 : t.length <= single ? 1 : Math.ceil(t.length / multi);
    }

    function openMessage(id, name) {
        $("sms_id").value = id;
        $("sms_name").textContent = name || "";
        $("sms_text").value = "";
        countSms();
        bootstrap.Modal.getOrCreateInstance($("smsModal")).show();
    }

    $("sms_text").addEventListener("input", countSms);

    $("smsForm").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        try {
            const d = await request(`${api}/sms`, {
                method: "POST",
                body: {
                    staff_id: $("sms_id").value, message: $("sms_text").value,
                    sms_type: document.querySelector('input[name="sms_type"]:checked').value
                }
            });
            bootstrap.Modal.getInstance($("smsModal"))?.hide();
            notify(d.message || "SMS gateway যুক্ত করা নেই। মেসেজ পাঠানো হয়নি।", d.sent ? "success" : "error");
        } catch (e) { notify(e.message, "error"); }
    });

    /* ---------- Delete ---------- */
    function openDelete(id) {
        $("del_id").value = id;
        bootstrap.Modal.getOrCreateInstance($("deleteModal")).show();
    }

    $("del_confirm").addEventListener("click", async () => {
        try {
            const d = await request(`${api}/${$("del_id").value}`, { method: "DELETE" });
            bootstrap.Modal.getInstance($("deleteModal"))?.hide();
            notify(d.message || "Staff deleted successfully.");
            loadList();
        } catch (e) { notify(e.message, "error"); }
    });

    /* ---------- Table actions / header ---------- */
    document.addEventListener("click", (ev) => {
        const el = ev.target.closest("[data-act]");
        if (!el) return;
        ev.preventDefault();
        if (el.dataset.act === "edit") openEdit(el.dataset.id);
        if (el.dataset.act === "message") openMessage(el.dataset.id, el.dataset.name);
        if (el.dataset.act === "delete") openDelete(el.dataset.id);
    });

    $("refreshBtn").addEventListener("click", async () => {
        const btn = $("refreshBtn");
        const icon = btn.querySelector("i");
        btn.disabled = true;
        icon.classList.add("fa-spin");
        try {
            $("staffSearch").value = "";
            await loadCsrf().catch(() => {});
            await loadList();
            notify("তালিকা রিফ্রেশ হয়েছে।");
        } finally {
            icon.classList.remove("fa-spin");
            btn.disabled = false;
        }
    });
    $("printBtn").addEventListener("click", () => window.print());

    document.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => {
        sortDir = sortKey === th.dataset.sort ? -sortDir : 1;
        sortKey = th.dataset.sort;
        render();
    }));

    $("staffSearch").addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(loadList, 300);
    });

    loadCsrf().catch((e) => notify(e.message, "error"));
    loadList();
})();
