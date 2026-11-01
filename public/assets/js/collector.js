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

    const prettify = (key) => String(key).replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

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

    const soon = ["balance", "message", "reset"];
    const soonText = {
        balance: "Previous Balance", message: "Message",
        reset: "Reset Password"
    };

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
                            <li><a class="dropdown-item" href="#" data-act="balance"><i class="fa-solid fa-dollar-sign"></i>Previous Balance</a></li>
                            <li><a class="dropdown-item" href="#" data-act="message"><i class="fa-regular fa-comment"></i>Message</a></li>
                            <li><a class="dropdown-item" href="#" data-act="delete" data-id="${c.id}" data-name="${esc(c.name)}"><i class="fa-solid fa-box-archive"></i>Delete</a></li>
                            <li><a class="dropdown-item" href="#" data-act="reset"><i class="fa-solid fa-key"></i>Reset Password</a></li>
                            <li><a class="dropdown-item" href="#" data-act="activity"><i class="fa-regular fa-clock"></i>Activity Log</a></li>
                        </ul>
                    </div>
                </td>
            </tr>`).join("")
            : `<tr><td colspan="7">No data found</td></tr>`;
    }

    async function loadList() {
        const q = encodeURIComponent($("collectorSearch").value.trim());
        try {
            rows = (await request(`${api}/data?search=${q}`)).collectors;
            render();
        } catch (e) { notify(e.message, "error"); }
    }

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

    async function openEdit(id) {
        const d = await request(`${api}/${id}/edit-data`);
        const c = d.collector;
        $("ed_id").value = c.id;
        $("ed_title").textContent = c.name || "";
        $("ed_name").value = c.name || "";
        $("ed_mobile").value = c.mobile || "";
        $("ed_email").value = c.email || "";
        $("ed_address").value = c.address || "";
        $("ed_status").value = String(c.status).toLowerCase() === "inactive" ? "inactive" : "active";

        $("areaList").innerHTML = d.areas.map((a) => `
            <div class="staff-area-col"><label class="staff-area-parent">
                <input class="form-check-input area-check" type="checkbox" value="${a.id}"
                    ${d.assigned_area_ids.includes(Number(a.id)) ? "checked" : ""}>
                <span>${esc(a.name)}</span></label></div>`).join("");

        $("noLoginNote").classList.toggle("d-none", d.has_login_user);
        $("permList").innerHTML = `
            <label class="staff-perm-item all"><input class="form-check-input" type="checkbox" id="permAll">All Permission</label>` +
            d.permissions.map((p) => `
            <label class="staff-perm-item"><input class="form-check-input perm-check" type="checkbox" value="${esc(p.permission_key)}"
                ${d.granted_permissions.includes(p.permission_key) ? "checked" : ""}>${esc(prettify(p.permission_key))}</label>`).join("");

        bootstrap.Modal.getOrCreateInstance($("editModal")).show();
    }

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

    document.addEventListener("click", async (ev) => {
        const el = ev.target.closest("[data-act]");
        if (!el) return;
        ev.preventDefault();
        try {
            if (el.dataset.act === "profile") await openProfile(el.dataset.id);
            if (el.dataset.act === "edit") await openEdit(el.dataset.id);
            if (el.dataset.act === "activity") await openActivity(el.dataset.id);
            if (soon.includes(el.dataset.act)) notify(`${soonText[el.dataset.act]} এখনো যুক্ত করা হয়নি।`, "error");
            if (el.dataset.act === "delete" && confirm(`"${el.dataset.name}" কে ডিলিট করবেন?`)) {
                const d = await request(`${api}/${el.dataset.id}`, { method: "DELETE" });
                notify(d.message);
                loadList();
            }
        } catch (e) { notify(e.message, "error"); }
    });

    document.addEventListener("change", (ev) => {
        if (ev.target.id === "permAll") {
            document.querySelectorAll(".perm-check").forEach((x) => { x.checked = ev.target.checked; });
        }
    });

    $("editForm").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        try {
            const d = await request(`${api}/${$("ed_id").value}`, {
                method: "PUT",
                body: {
                    name: $("ed_name").value, mobile: $("ed_mobile").value,
                    email: $("ed_email").value, address: $("ed_address").value,
                    status: $("ed_status").value,
                    area_ids: [...document.querySelectorAll(".area-check:checked")].map((x) => Number(x.value)),
                    permissions: [...document.querySelectorAll(".perm-check:checked")].map((x) => x.value)
                }
            });
            bootstrap.Modal.getInstance($("editModal"))?.hide();
            notify(d.message);
            loadList();
        } catch (e) { notify(e.message, "error"); }
    });

    $("refreshBtn").addEventListener("click", loadList);

    document.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => {
        sortDir = sortKey === th.dataset.sort ? -sortDir : 1;
        sortKey = th.dataset.sort;
        render();
    }));

    $("collectorSearch").addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(loadList, 300);
    });

    loadCsrf().catch((e) => notify(e.message, "error"));
    loadList();
})();
