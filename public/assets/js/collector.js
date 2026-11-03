"use strict";

(() => {
    const api = "/api/collectors";
    const $ = (id) => document.getElementById(id);
    let csrfToken = "";
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
        if (!r.ok || !d.success) throw new Error(d.message || "অনুরোধটি সম্পন্ন হয়নি।");
        return d;
    }

    const badge = (s) => {
        const v = String(s || "").toLowerCase() === "active" ? "active" : "inactive";
        return `<span class="staff-badge ${v}">${v}</span>`;
    };

    /* ---------- list ---------- */

    let rows = [];
    let sortKey = "id";
    let sortDir = -1;

    function render() {
        const sorted = [...rows].sort((a, b) =>
            sortDir * String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""), undefined, { numeric: true }));
        $("totalData").textContent = sorted.length;
        $("collectorTableBody").innerHTML = sorted.length
            ? sorted.map((c, i) => `
            <tr>
                <td>${i + 1}</td><td>${esc(c.name)}</td><td>${esc(c.mobile)}</td>
                <td>${esc(c.email)}</td><td>${esc(c.address)}</td><td>${badge(c.status)}</td>
                <td>
                    <div class="dropdown">
                        <button class="staff-dots" data-bs-toggle="dropdown" aria-expanded="false"><i class="fa-solid fa-ellipsis"></i></button>
                        <ul class="dropdown-menu dropdown-menu-end staff-menu">
                            <li><a class="dropdown-item" href="#" data-act="profile" data-id="${c.id}"><i class="fa-solid fa-user"></i>Profile</a></li>
                            <li><a class="dropdown-item" href="#" data-act="edit" data-id="${c.id}"><i class="fa-solid fa-pen"></i>Edit</a></li>
                            <li><a class="dropdown-item" href="#" data-act="balance" data-id="${c.id}" data-name="${esc(c.name)}"><i class="fa-solid fa-dollar-sign"></i>Previous Balance</a></li>
                            <li><a class="dropdown-item" href="#" data-act="message" data-id="${c.id}" data-name="${esc(c.name)}"><i class="fa-regular fa-comment"></i>Message</a></li>
                            <li><a class="dropdown-item" href="#" data-act="delete" data-id="${c.id}" data-name="${esc(c.name)}"><i class="fa-solid fa-box-archive"></i>Delete</a></li>
                            <li><a class="dropdown-item" href="#" data-act="reset" data-id="${c.id}" data-name="${esc(c.name)}"><i class="fa-solid fa-key"></i>Reset Password</a></li>
                            <li><a class="dropdown-item" href="#" data-act="activity" data-id="${c.id}"><i class="fa-regular fa-clock"></i>Activity Log</a></li>
                        </ul>
                    </div>
                </td>
            </tr>`).join("")
            : `<tr><td colspan="7">No data found</td></tr>`;
    }

    async function loadList() {
        const q = encodeURIComponent($("collectorSearch").value.trim());
        try {
            rows = (await request(`${api}/data?search=${q}`)).collectors || [];
            render();
        } catch (e) { notify(e.message, "error"); }
    }

    /* ---------- shared pieces: area tree + permission grid ---------- */

    function areaTree(areas, subs, selAreas, selSubs, cls) {
        if (!areas.length) return '<div class="text-muted">কোনো Area পাওয়া যায়নি।</div>';
        return areas.map((a) => {
            const kids = subs.filter((s) => Number(s.area_id) === Number(a.id));
            return `<div class="staff-area-col"><label class="staff-area-parent">
                <input class="form-check-input ${cls}" type="checkbox" value="${a.id}" ${selAreas.includes(Number(a.id)) ? "checked" : ""}>
                <span>${esc(a.name)}</span></label>
                ${kids.map((s) => `<label class="staff-area-child">
                    <input class="form-check-input ${cls}-sub" type="checkbox" value="${s.id}" data-area="${a.id}"
                        ${selSubs.includes(Number(s.id)) ? "checked" : ""}><span>${esc(s.name)}</span></label>`).join("")}
            </div>`;
        }).join("");
    }

    function permGrid(perms, granted, cls) {
        const all = perms.length > 0 && perms.every((p) => granted.includes(p.key));
        return `<label class="staff-perm-item all"><input class="form-check-input perm-all" type="checkbox" ${all ? "checked" : ""}>All Permission</label>` +
            perms.map((p) => `<label class="staff-perm-item"><input class="form-check-input ${cls}" type="checkbox" value="${esc(p.key)}"
                ${granted.includes(p.key) ? "checked" : ""}>${esc(p.label)}</label>`).join("");
    }

    const picked = (sel) => [...document.querySelectorAll(sel + ":checked")].map((x) => Number(x.value));
    const pickedKeys = (sel) => [...document.querySelectorAll(sel + ":checked")].map((x) => x.value);
    const statusOf = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value || "active";

    /* ---------- profile ---------- */

    async function openProfile(id) {
        const { collector: c } = await request(`${api}/${id}/profile`);
        $("pf_title").textContent = $("pf_name").textContent = c.name || "";
        $("pf_mobile").textContent = c.mobile || "—";
        $("pf_address").textContent = c.address || "—";
        $("pf_email").textContent = c.email || "—";
        $("pf_nid").textContent = c.nid_no || "—";
        $("pf_status").textContent = String(c.status || "").toLowerCase();
        bootstrap.Modal.getOrCreateInstance($("profileModal")).show();
    }

    /* ---------- edit ---------- */

    let editHasLogin = false;

    function syncEditNote() {
        $("noLoginNote").classList.toggle("d-none", editHasLogin || $("ed_add_staff").checked);
    }

    async function openEdit(id) {
        const d = await request(`${api}/${id}/edit-data`);
        const c = d.collector;
        $("ed_id").value = c.id;
        $("ed_title").textContent = c.name || "";
        $("ed_name").value = c.name || "";
        $("ed_mobile").value = c.mobile || "";
        $("ed_nid").value = c.nid_no || "";
        $("ed_address").value = c.address || "";
        $("ed_email").value = c.email || "";
        ($(String(c.status).toLowerCase() === "inactive" ? "edSt_inactive" : "edSt_active")).checked = true;

        editHasLogin = !!d.has_login_user;
        $("ed_add_staff").checked = editHasLogin;
        $("ed_add_staff").disabled = editHasLogin;      /* লগইন আগে থেকেই আছে */

        $("areaList").innerHTML = areaTree(d.areas, d.sub_areas || [], d.assigned_area_ids || [],
            d.assigned_sub_area_ids || [], "ed-area");
        $("permList").innerHTML = permGrid(d.permissions || [], d.granted_permissions || [], "ed-perm");
        syncEditNote();

        bootstrap.Tab.getOrCreateInstance(document.querySelector('#editModal [data-bs-target="#tabProfile"]')).show();
        bootstrap.Modal.getOrCreateInstance($("editModal")).show();
    }

    $("editForm").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        try {
            const d = await request(`${api}/${$("ed_id").value}`, {
                method: "PUT",
                body: {
                    name: $("ed_name").value, mobile: $("ed_mobile").value,
                    nid_no: $("ed_nid").value, address: $("ed_address").value,
                    email: $("ed_email").value, status: statusOf("ed_status"),
                    add_staff: $("ed_add_staff").checked && !$("ed_add_staff").disabled,
                    area_ids: picked(".ed-area"), sub_area_ids: picked(".ed-area-sub"),
                    permissions: pickedKeys(".ed-perm")
                }
            });
            bootstrap.Modal.getInstance($("editModal"))?.hide();
            notify(d.message);
            loadList();
        } catch (e) { notify(e.message, "error"); }
    });

    /* ---------- add ---------- */

    async function openAdd() {
        $("addForm").reset();
        const d = await request(`${api}/areas`);
        $("addAreaList").innerHTML = areaTree(d.areas || [], d.sub_areas || [], [], [], "ad-area");
        $("addPermList").innerHTML = permGrid(d.permissions || [], [], "ad-perm");
        $("addNoLoginNote").classList.remove("d-none");
        bootstrap.Tab.getOrCreateInstance(document.querySelector('#addModal [data-bs-target="#addTabProfile"]')).show();
        bootstrap.Modal.getOrCreateInstance($("addModal")).show();
    }

    $("addBtn").addEventListener("click", () => openAdd().catch((e) => notify(e.message, "error")));

    $("addForm").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        try {
            const d = await request(api, {
                method: "POST",
                body: {
                    name: $("ad_name").value, mobile: $("ad_mobile").value,
                    nid_no: $("ad_nid").value, address: $("ad_address").value,
                    email: $("ad_email").value, status: statusOf("ad_status"),
                    add_staff: $("ad_add_staff").checked,
                    area_ids: picked(".ad-area"), sub_area_ids: picked(".ad-area-sub"),
                    permissions: pickedKeys(".ad-perm")
                }
            });
            bootstrap.Modal.getInstance($("addModal"))?.hide();
            notify(d.message);
            loadList();
        } catch (e) { notify(e.message, "error"); }
    });

    /* ---------- checkbox behaviour ---------- */

    document.addEventListener("change", (ev) => {
        const t = ev.target;
        if (t.id === "ed_add_staff") syncEditNote();
        if (t.id === "ad_add_staff") $("addNoLoginNote").classList.toggle("d-none", t.checked);

        /* parent area <-> sub-area */
        if (t.matches(".ed-area-sub, .ad-area-sub") && t.checked) {
            const par = t.closest(".staff-area-col")?.querySelector("input:not([data-area])");
            if (par) par.checked = true;
        }
        if (t.matches(".ed-area, .ad-area") && !t.checked) {
            t.closest(".staff-area-col")?.querySelectorAll("input[data-area]").forEach((x) => { x.checked = false; });
        }

        /* All Permission */
        if (t.classList?.contains("perm-all")) {
            t.closest(".staff-perm-grid")?.querySelectorAll("input:not(.perm-all)")
                .forEach((x) => { x.checked = t.checked; });
        } else if (t.matches(".ed-perm, .ad-perm")) {
            const grid = t.closest(".staff-perm-grid");
            const items = [...grid.querySelectorAll("input:not(.perm-all)")];
            grid.querySelector(".perm-all").checked = items.every((x) => x.checked);
        }
    });

    /* ---------- message ---------- */

    function openMessage(id, name) {
        $("sms_id").value = id;
        $("sms_name").textContent = name || "";
        $("sms_text").value = "";
        countSms();
        bootstrap.Modal.getOrCreateInstance($("smsModal")).show();
    }

    function countSms() {
        const t = $("sms_text").value;
        const unicode = /[^\x00-\x7F]/.test(t);
        const single = unicode ? 70 : 160;
        const multi = unicode ? 67 : 153;
        $("sms_letters").textContent = t.length;
        $("sms_count").textContent = !t.length ? 0 : t.length <= single ? 1 : Math.ceil(t.length / multi);
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
            notify(d.message, d.sent ? "success" : "error");
        } catch (e) { notify(e.message, "error"); }
    });

    /* ---------- delete ---------- */

    function openDelete(id, name) {
        $("del_id").value = id;
        $("del_name").textContent = name ? `(${name})` : "";
        bootstrap.Modal.getOrCreateInstance($("deleteModal")).show();
    }

    $("del_confirm").addEventListener("click", async () => {
        try {
            const d = await request(`${api}/${$("del_id").value}`, { method: "DELETE" });
            bootstrap.Modal.getInstance($("deleteModal"))?.hide();
            notify(d.message);
            loadList();
        } catch (e) { notify(e.message, "error"); }
    });

    /* ---------- reset password ---------- */

    function openReset(id) {
        $("rs_id").value = id;
        $("rsDefault").checked = true;
        $("rs_password").value = "";
        $("rs_manual_box").classList.add("d-none");
        bootstrap.Modal.getOrCreateInstance($("resetModal")).show();
    }

    document.querySelectorAll('input[name="rs_mode"]').forEach((r) => r.addEventListener("change", () => {
        $("rs_manual_box").classList.toggle("d-none", !$("rsManual").checked);
    }));

    $("resetForm").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        try {
            const mode = document.querySelector('input[name="rs_mode"]:checked').value;
            const d = await request(`${api}/${$("rs_id").value}/password`, {
                method: "PUT",
                body: { mode, password: $("rs_password").value }
            });
            $("rs_password").value = "";
            bootstrap.Modal.getInstance($("resetModal"))?.hide();
            notify(`${d.message} Username: ${d.username}`);
        } catch (e) { notify(e.message, "error"); }
    });

    /* ---------- previous balance ---------- */

    let balanceRows = [];
    const balSort = { key: null, dir: 1 };

    function renderBalance() {
        const q = $("bal_search").value.trim().toLowerCase();
        const list = balanceRows.filter((r) =>
            !q || `${r.month} ${r.year} ${r.deposit} ${r.bill_report} ${r.balance}`.toLowerCase().includes(q));
        if (balSort.key && balSort.key !== "idx") {
            list.sort((a, b) => balSort.dir * (Number(a[balSort.key]) - Number(b[balSort.key])));
        } else if (balSort.key === "idx" && balSort.dir === -1) {
            list.reverse();
        }
        $("bal_total").textContent = list.length;
        $("bal_body").innerHTML = list.length
            ? list.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.month)}</td><td>${r.year}</td>
                <td>${r.deposit}</td><td>${r.bill_report}</td><td>${r.balance}</td></tr>`).join("")
            : `<tr><td colspan="6">No data found</td></tr>`;
    }

    async function openBalance(id, name) {
        const d = await request(`${api}/${id}/balance`);
        balanceRows = d.rows || [];
        $("bal_name").textContent = name ? `— ${name}` : "";
        $("bal_search").value = "";
        renderBalance();
        bootstrap.Modal.getOrCreateInstance($("balanceModal")).show();
    }

    $("bal_search").addEventListener("input", renderBalance);

    document.querySelectorAll("#balanceModal th[data-bsort]").forEach((th) => th.addEventListener("click", () => {
        balSort.dir = balSort.key === th.dataset.bsort ? -balSort.dir : 1;
        balSort.key = th.dataset.bsort;
        renderBalance();
    }));

    /* ---------- activity (popup; আলাদা পেজ পরের ধাপে) ---------- */

    async function openActivity(id) {
        const d = await request(`${api}/${id}/activity`);
        $("act_title").textContent = d.collector_name || "";
        $("actNoLogin").classList.toggle("d-none", d.has_login_user);
        $("actBody").innerHTML = d.logs.length
            ? d.logs.map((l, i) => `
            <tr>
                <td>${i + 1}</td><td>${esc(l.action)}</td><td>${esc(l.description)}</td>
                <td>${esc(l.module)}</td><td>${esc(l.ip_address)}</td>
                <td>${esc(l.created_at ? new Date(l.created_at).toLocaleString() : "")}</td>
            </tr>`).join("")
            : `<tr><td colspan="6">No activity found</td></tr>`;
        bootstrap.Modal.getOrCreateInstance($("activityModal")).show();
    }

    /* ---------- action menu ---------- */

    document.addEventListener("click", async (ev) => {
        const el = ev.target.closest("[data-act]");
        if (!el) return;
        ev.preventDefault();
        try {
            const a = el.dataset.act;
            if (a === "profile") await openProfile(el.dataset.id);
            if (a === "edit") await openEdit(el.dataset.id);
            if (a === "balance") await openBalance(el.dataset.id, el.dataset.name);
            if (a === "message") openMessage(el.dataset.id, el.dataset.name);
            if (a === "delete") openDelete(el.dataset.id, el.dataset.name);
            if (a === "reset") openReset(el.dataset.id);
            if (a === "activity") await openActivity(el.dataset.id);
        } catch (e) { notify(e.message, "error"); }
    });

    /* ---------- header + search + sort ---------- */

    $("refreshBtn").addEventListener("click", async () => {
        const btn = $("refreshBtn");
        const icon = btn.querySelector("i");
        btn.disabled = true;
        icon.classList.add("fa-spin");
        try {
            $("collectorSearch").value = "";
            await loadCsrf().catch(() => {});
            await loadList();
            notify("তালিকা রিফ্রেশ হয়েছে।");
        } finally {
            icon.classList.remove("fa-spin");
            btn.disabled = false;
        }
    });

    document.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => {
        sortDir = sortKey === th.dataset.sort ? -sortDir : 1;
        sortKey = th.dataset.sort;
        render();
    }));

    $("collectorSearch").addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(loadList, 300);
    });

    // Popups must sit above the fixed sidebar (z-index 100000) and topbar (99999+),
    // whatever CSS is loaded: set the z-index directly on the popup and its backdrop.
    document.addEventListener("show.bs.modal", (ev) => { ev.target.style.zIndex = "1000010"; });
    new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach((n) => {
        if (n.classList && n.classList.contains("modal-backdrop")) n.style.zIndex = "1000000";
    }))).observe(document.body, { childList: true });

    loadCsrf().catch((e) => notify(e.message, "error"));
    loadList();
})();
