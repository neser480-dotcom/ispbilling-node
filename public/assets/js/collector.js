/*
|--------------------------------------------------------------------------
| COLLECTOR PAGE  (views/staff/collector.html)
|--------------------------------------------------------------------------
| ব্যাকএন্ডে যে API লাগবে (সব /api/collectors এর নিচে, cookie/session auth):
|
|   GET    /api/collectors                    -> { success, data:[ collector ] }
|   GET    /api/collectors/area-options       -> { success, data:[ { id, name, children:[{id,name}] } ] }
|   POST   /api/collectors                    -> body: ফর্মের সব ফিল্ড (নিচে দেখুন)
|   PUT    /api/collectors/:id                -> body: ফর্মের সব ফিল্ড + permissions
|   DELETE /api/collectors/:id
|   POST   /api/collectors/:id/reset-password -> { mode:"default"|"mobile"|"manual", password? }
|
| collector = {
|   id, name, mobile, email, address, nid,
|   status: "active" | "inactive",
|   is_staff: 0|1,
|   area_ids: [..], sub_area_ids: [..],
|   permissions: ["customer_list", ...]
| }
|
| UI দেখার জন্য ব্যাকএন্ড ছাড়া:  collector.html?demo=1
| (ডেমো মোডে কিছুই সার্ভারে যায় না — সব মেমরিতে)
|--------------------------------------------------------------------------
*/

document.addEventListener("DOMContentLoaded", function () {

    "use strict";


    /*
    |--------------------------------------------------------------------------
    | CONFIG
    |--------------------------------------------------------------------------
    */

    const API = "/api/collectors";

    // টিউটোরিয়াল ভিডিওর লিংক বসান (খালি থাকলে মেসেজ দেখাবে)
    const TUTORIAL_URL = "";

    const DEMO =
        new URLSearchParams(
            window.location.search
        ).get("demo") === "1";


    // ব্যাকএন্ডের permission key গুলোর সাথে মিলিয়ে নিন
    const PERMISSIONS = [

        { key: "customer_add", label: "Customer Add" },
        { key: "customer_edit", label: "Customer Edit" },
        { key: "customer_activate", label: "Customer Activate" },
        { key: "customer_deactivate", label: "Customer Deactivate" },
        { key: "update_customer_balance", label: "Update Customer Balance" },
        { key: "customer_list", label: "Customer List" },
        { key: "connection_fee", label: "Connection Fee" },
        { key: "billing_cycle_update", label: "Billing Cycle Update" },
        { key: "mobile_number_update", label: "Mobile Number Update" },
        { key: "sms_board", label: "SMS Board" },
        { key: "bill_posting", label: "Bill Posting" },
        { key: "bill_invoice_print", label: "Bill invoice print" },
        { key: "bill_report_delete", label: "Bill Report Delete" },
        { key: "bulk_status_edit", label: "Bulk Status Edit" },
        { key: "dashboard_collection_data", label: "Dashboard Collection Data" },
        { key: "expenditure", label: "Expenditure" },
        { key: "bulk_payment_status_edit", label: "Bulk Payment Status Edit" },
        { key: "customer_package_update", label: "Customer Package Update" },
        { key: "olt_user_monitoring", label: "OLT User Monitoring" },
        { key: "webhook_message_log", label: "Webhook Message Log" },
        { key: "ipn_message_log", label: "IPN Message Log" },
        { key: "daily_recharge_feature", label: "Daily Recharge Feature" },
        { key: "monthly_bill_adjustment_on_recharge", label: "Monthly Bill Adjustment On Recharge" }

    ];


    /*
    |--------------------------------------------------------------------------
    | ELEMENTS
    |--------------------------------------------------------------------------
    */

    const $ = id => document.getElementById(id);

    const tableBody = $("collectorTableBody");
    const totalCount = $("totalCollectorCount");
    const searchInput = $("collectorSearch");
    const reloadButton = $("reloadCollector");
    const addButton = $("addCollectorBtn");
    const tutorialButton = $("tutorialCollector");

    const formModalEl = $("collectorModal");
    const formModalTitle = $("collectorModalTitle");
    const submitButton = $("collectorSubmit");
    const permissionTabItem = $("permissionTabItem");
    const areaGrid = $("areaGrid");
    const permissionGrid = $("permissionGrid");

    const fName = $("fName");
    const fMobile = $("fMobile");
    const fNid = $("fNid");
    const fAddress = $("fAddress");
    const fEmail = $("fEmail");
    const fIsStaff = $("fIsStaff");

    const resetModalEl = $("resetPasswordModal");
    const resetSaveButton = $("resetPasswordSave");
    const resetPasswordInput = $("resetPasswordInput");

    const formModal = bootstrap.Modal.getOrCreateInstance(formModalEl);
    const resetModal = bootstrap.Modal.getOrCreateInstance(resetModalEl);


    /*
    |--------------------------------------------------------------------------
    | STATE
    |--------------------------------------------------------------------------
    */

    let collectors = [];
    let areaOptions = [];
    let formMode = "add";      // add | edit
    let editingId = null;
    let resetTarget = null;
    let sortKey = "";
    let sortDir = 1;


    /*
    |--------------------------------------------------------------------------
    | HELPERS
    |--------------------------------------------------------------------------
    */

    function esc(value) {

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

    }


    function toast(icon, title) {

        if (window.Swal) {

            Swal.fire({
                toast: true,
                position: "top-end",
                icon: icon,
                title: title,
                showConfirmButton: false,
                timer: 2400
            });

        } else {

            console.log(title);

        }

    }


    function info(title, text) {

        if (window.Swal) {

            Swal.fire({ icon: "info", title: title, text: text });

        } else {

            alert(title + "\n" + text);

        }

    }


    async function confirmBox(title, text, confirmText) {

        if (!window.Swal) {

            return window.confirm(title + "\n" + text);

        }

        const result = await Swal.fire({
            icon: "warning",
            title: title,
            text: text,
            showCancelButton: true,
            confirmButtonText: confirmText,
            confirmButtonColor: "#dc3545"
        });

        return result.isConfirmed;

    }


    async function request(url, options = {}) {

        if (DEMO) {

            return demoRequest(url, options);

        }

        const response = await fetch(url, {

            credentials: "same-origin",

            ...options,

            headers: {

                ...(options.body
                    ? { "Content-Type": "application/json" }
                    : {}),

                ...(options.headers || {})

            }

        });

        let data;

        try {

            data = await response.json();

        } catch (_) {

            throw new Error("Invalid server response.");

        }

        if (
            !response.ok ||
            data.status === false ||
            data.success === false
        ) {

            throw new Error(data.message || "Request failed.");

        }

        return data;

    }


    function findCollector(id) {

        return collectors.find(c => Number(c.id) === Number(id));

    }


    /*
    |--------------------------------------------------------------------------
    | LIST  (load / search / sort / render)
    |--------------------------------------------------------------------------
    */

    async function loadCollectors() {

        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-5 text-muted">
                    <i class="fa fa-spinner fa-spin fa-2x mb-2 d-block"></i>
                    Loading...
                </td>
            </tr>
        `;

        try {

            const result = await request(API);

            collectors = Array.isArray(result.data) ? result.data : [];

            renderCollectors();

        } catch (error) {

            totalCount.textContent = "0";

            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-5 text-danger">
                        <i class="fa fa-triangle-exclamation fa-2x mb-2 d-block"></i>
                        ${esc(error.message)}
                    </td>
                </tr>
            `;

        }

    }


    async function loadAreaOptions() {

        try {

            const result = await request(API + "/area-options");

            areaOptions = Array.isArray(result.data) ? result.data : [];

        } catch (error) {

            areaOptions = [];

            toast("error", error.message);

        }

    }


    function visibleRows() {

        const q = searchInput.value.trim().toLowerCase();

        let rows = collectors.filter(function (c) {

            if (!q) {
                return true;
            }

            return [c.name, c.mobile, c.email, c.address, c.status]
                .some(v => String(v || "").toLowerCase().includes(q));

        });

        if (sortKey) {

            const collator = new Intl.Collator(
                undefined,
                { numeric: true, sensitivity: "base" }
            );

            rows = rows.slice().sort(function (a, b) {

                if (sortKey === "id") {

                    return (Number(a.id) - Number(b.id)) * sortDir;

                }

                return collator.compare(
                    String(a[sortKey] || ""),
                    String(b[sortKey] || "")
                ) * sortDir;

            });

        }

        return rows;

    }


    function statusBadge(status) {

        const s = String(status || "").toLowerCase();

        const cls = s === "active" ? "active" : "inactive";

        return `<span class="staff-badge ${cls}">${esc(s || "-")}</span>`;

    }


    function actionMenu(id) {

        const item = (action, icon, label) => `
            <li>
                <button
                    type="button"
                    class="dropdown-item"
                    data-action="${action}"
                    data-id="${Number(id)}"
                >
                    <i class="${icon}"></i>
                    <span>${label}</span>
                </button>
            </li>
        `;

        return `
            <div class="dropdown">

                <button
                    type="button"
                    class="staff-dots"
                    data-bs-toggle="dropdown"
                    data-bs-popper-config='{"strategy":"fixed"}'
                    aria-expanded="false"
                    title="Actions"
                >
                    <i class="fa fa-ellipsis"></i>
                </button>

                <ul class="dropdown-menu dropdown-menu-end staff-menu">
                    ${item("profile", "fa-solid fa-user", "Profile")}
                    ${item("edit", "fa-solid fa-pen", "Edit")}
                    ${item("balance", "fa-solid fa-dollar-sign", "Previous Balance")}
                    ${item("message", "fa-regular fa-comment-dots", "Message")}
                    ${item("delete", "fa-solid fa-box-archive", "Delete")}
                    ${item("reset", "fa-solid fa-key", "Reset Password")}
                    ${item("log", "fa-regular fa-clock", "Activity Log")}
                </ul>

            </div>
        `;

    }


    function updateSortIcons() {

        document
            .querySelectorAll("#collectorTable thead th[data-sort]")
            .forEach(function (th) {

                const icon = th.querySelector(".sort-icon");

                if (!icon) {
                    return;
                }

                icon.textContent =
                    th.dataset.sort === sortKey
                        ? (sortDir === 1 ? "↑" : "↓")
                        : "⇅";

            });

    }


    function renderCollectors() {

        const rows = visibleRows();

        totalCount.textContent = rows.length;

        if (!rows.length) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-5 text-muted">
                        <i class="fa fa-user-slash fa-2x mb-2 d-block"></i>
                        No Collector Found
                    </td>
                </tr>
            `;

            updateSortIcons();

            return;

        }

        tableBody.innerHTML = rows.map(function (c, index) {

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${esc(c.name)}</td>
                    <td>${esc(c.mobile)}</td>
                    <td>${esc(c.email)}</td>
                    <td>${esc(c.address)}</td>
                    <td>${statusBadge(c.status)}</td>
                    <td>${actionMenu(c.id)}</td>
                </tr>
            `;

        }).join("");

        updateSortIcons();

    }


    /*
    |--------------------------------------------------------------------------
    | AREA TAB
    |--------------------------------------------------------------------------
    */

    function renderAreaGrid(selectedAreas, selectedSubs) {

        const areaSet = new Set((selectedAreas || []).map(Number));
        const subSet = new Set((selectedSubs || []).map(Number));

        if (!areaOptions.length) {

            areaGrid.innerHTML =
                '<div class="text-muted">No area found.</div>';

            return;

        }

        areaGrid.innerHTML = areaOptions.map(function (area) {

            const children = Array.isArray(area.children) ? area.children : [];

            const hasChildSelected =
                children.some(ch => subSet.has(Number(ch.id)));

            // শুধু area সিলেক্ট (কোনো sub-area নেই) = পুরো area সিলেক্ট
            const wholeArea =
                areaSet.has(Number(area.id)) && !hasChildSelected;

            const parentChecked =
                wholeArea ||
                (children.length > 0 &&
                    children.every(ch => subSet.has(Number(ch.id))));

            return `
                <div class="staff-area-col" data-area="${Number(area.id)}">

                    <label class="staff-area-parent">
                        <input
                            type="checkbox"
                            class="area-check"
                            value="${Number(area.id)}"
                            ${parentChecked ? "checked" : ""}
                            ${(!parentChecked && hasChildSelected) ? 'data-partial="1"' : ""}
                        >
                        <span>${esc(area.name)}</span>
                    </label>

                    ${children.map(ch => `
                        <label class="staff-area-child">
                            <input
                                type="checkbox"
                                class="sub-check"
                                value="${Number(ch.id)}"
                                ${(subSet.has(Number(ch.id)) || wholeArea) ? "checked" : ""}
                            >
                            <span>${esc(ch.name)}</span>
                        </label>
                    `).join("")}

                </div>
            `;

        }).join("");

        areaGrid
            .querySelectorAll('.area-check[data-partial="1"]')
            .forEach(function (box) {

                box.indeterminate = true;

            });

    }


    function syncParent(col) {

        const parent = col.querySelector(".area-check");
        const subs = Array.from(col.querySelectorAll(".sub-check"));

        if (!parent || !subs.length) {
            return;
        }

        const checked = subs.filter(s => s.checked).length;

        parent.checked = checked === subs.length;
        parent.indeterminate = checked > 0 && checked < subs.length;

    }


    areaGrid.addEventListener("change", function (event) {

        const target = event.target;

        const col = target.closest(".staff-area-col");

        if (!col) {
            return;
        }

        if (target.classList.contains("area-check")) {

            target.indeterminate = false;

            col.querySelectorAll(".sub-check").forEach(function (s) {

                s.checked = target.checked;

            });

        } else if (target.classList.contains("sub-check")) {

            syncParent(col);

        }

    });


    /*
    |--------------------------------------------------------------------------
    | PERMISSIONS TAB
    |--------------------------------------------------------------------------
    */

    function renderPermissions(selected) {

        const set = new Set(selected || []);

        permissionGrid.innerHTML = `
            <label class="staff-perm-item all">
                <input type="checkbox" id="permAll">
                <span>All Permission</span>
            </label>
        ` + PERMISSIONS.map(p => `
            <label class="staff-perm-item">
                <input
                    type="checkbox"
                    class="perm-check"
                    value="${p.key}"
                    ${set.has(p.key) ? "checked" : ""}
                >
                <span>${p.label}</span>
            </label>
        `).join("");

        syncPermAll();

    }


    function syncPermAll() {

        const all = $("permAll");

        if (!all) {
            return;
        }

        const boxes = Array.from(permissionGrid.querySelectorAll(".perm-check"));

        all.checked = boxes.length > 0 && boxes.every(b => b.checked);

    }


    permissionGrid.addEventListener("change", function (event) {

        const target = event.target;

        if (target.id === "permAll") {

            permissionGrid.querySelectorAll(".perm-check").forEach(function (b) {

                b.checked = target.checked;

            });

        } else if (target.classList.contains("perm-check")) {

            syncPermAll();

        }

    });


    /*
    |--------------------------------------------------------------------------
    | ADD / EDIT MODAL
    |--------------------------------------------------------------------------
    */

    function clearInvalid() {

        [fName, fMobile, fNid, fAddress, fEmail].forEach(function (input) {

            input.classList.remove("is-invalid");

        });

    }


    async function openFormModal(mode, collector) {

        formMode = mode;
        editingId = collector ? Number(collector.id) : null;

        await loadAreaOptions();

        const isEdit = mode === "edit";

        formModalTitle.textContent = isEdit
            ? collector.name + " 's Profile Edit"
            : "Add New Collector";

        submitButton.textContent = isEdit ? "Save" : "Submit";

        permissionTabItem.classList.toggle("d-none", !isEdit);

        clearInvalid();

        fName.value = collector ? (collector.name || "") : "";
        fMobile.value = collector ? (collector.mobile || "") : "";
        fNid.value = collector ? (collector.nid || "") : "";
        fAddress.value = collector ? (collector.address || "") : "";
        fEmail.value = collector ? (collector.email || "") : "";
        fIsStaff.checked = collector ? Number(collector.is_staff) === 1 : false;

        const status =
            collector && String(collector.status).toLowerCase() === "inactive"
                ? "inactive"
                : "active";

        document.querySelector(
            'input[name="fStatus"][value="' + status + '"]'
        ).checked = true;

        renderAreaGrid(
            collector ? collector.area_ids : [],
            collector ? collector.sub_area_ids : []
        );

        renderPermissions(
            collector ? collector.permissions : []
        );

        bootstrap.Tab.getOrCreateInstance(
            $("tabProfileBtn")
        ).show();

        formModal.show();

    }


    function collectForm() {

        const subChecks = Array.from(areaGrid.querySelectorAll(".sub-check"));
        const areaChecks = Array.from(areaGrid.querySelectorAll(".area-check"));

        const data = {

            name: fName.value.trim(),
            mobile: fMobile.value.trim(),
            nid: fNid.value.trim(),
            address: fAddress.value.trim(),
            email: fEmail.value.trim(),

            status: document.querySelector(
                'input[name="fStatus"]:checked'
            ).value,

            is_staff: fIsStaff.checked ? 1 : 0,

            // কোনো sub-area সিলেক্ট থাকলে তার area ও যাবে
            area_ids: areaChecks
                .filter(c => c.checked || c.indeterminate)
                .map(c => Number(c.value)),

            sub_area_ids: subChecks
                .filter(c => c.checked)
                .map(c => Number(c.value))

        };

        if (formMode === "edit") {

            data.permissions = Array.from(
                permissionGrid.querySelectorAll(".perm-check")
            )
                .filter(c => c.checked)
                .map(c => c.value);

        }

        return data;

    }


    function validateForm(data) {

        clearInvalid();

        let ok = true;

        [
            [fName, data.name],
            [fMobile, data.mobile],
            [fNid, data.nid],
            [fAddress, data.address],
            [fEmail, data.email]
        ].forEach(function (pair) {

            if (!pair[1]) {

                pair[0].classList.add("is-invalid");

                ok = false;

            }

        });

        if (
            data.mobile &&
            data.mobile.replace(/\D/g, "").length < 10
        ) {

            fMobile.classList.add("is-invalid");

            ok = false;

        }

        if (data.email && !fEmail.checkValidity()) {

            fEmail.classList.add("is-invalid");

            ok = false;

        }

        if (!ok) {

            bootstrap.Tab.getOrCreateInstance($("tabProfileBtn")).show();

            toast("warning", "Please fill all required fields correctly.");

        }

        return ok;

    }


    submitButton.addEventListener("click", async function () {

        const data = collectForm();

        if (!validateForm(data)) {
            return;
        }

        submitButton.disabled = true;

        try {

            const isEdit = formMode === "edit";

            const result = await request(
                isEdit ? `${API}/${editingId}` : API,
                {
                    method: isEdit ? "PUT" : "POST",
                    body: JSON.stringify(data)
                }
            );

            formModal.hide();

            toast(
                "success",
                result.message ||
                (isEdit ? "Collector updated." : "Collector added.")
            );

            await loadCollectors();

        } catch (error) {

            toast("error", error.message);

        } finally {

            submitButton.disabled = false;

        }

    });


    /*
    |--------------------------------------------------------------------------
    | RESET PASSWORD MODAL
    |--------------------------------------------------------------------------
    */

    function openResetModal(collector) {

        resetTarget = collector;

        document.getElementById("resetDefault").checked = true;

        resetPasswordInput.value = "";

        resetPasswordInput.classList.add("d-none");

        resetModal.show();

    }


    document
        .querySelectorAll('input[name="resetMode"]')
        .forEach(function (radio) {

            radio.addEventListener("change", function () {

                const manual =
                    document.getElementById("resetManual").checked;

                resetPasswordInput.classList.toggle("d-none", !manual);

                if (manual) {

                    resetPasswordInput.focus();

                }

            });

        });


    resetSaveButton.addEventListener("click", async function () {

        if (!resetTarget) {
            return;
        }

        const mode = document.querySelector(
            'input[name="resetMode"]:checked'
        ).value;

        const body = { mode: mode };

        if (mode === "manual") {

            const password = resetPasswordInput.value;

            if (password.length < 6) {

                toast("warning", "Password must be at least 6 characters.");

                return;

            }

            body.password = password;

        }

        resetSaveButton.disabled = true;

        try {

            const result = await request(
                `${API}/${Number(resetTarget.id)}/reset-password`,
                {
                    method: "POST",
                    body: JSON.stringify(body)
                }
            );

            resetModal.hide();

            toast("success", result.message || "Password reset.");

        } catch (error) {

            toast("error", error.message);

        } finally {

            resetSaveButton.disabled = false;

        }

    });


    /*
    |--------------------------------------------------------------------------
    | ROW ACTIONS ( ... menu )
    |--------------------------------------------------------------------------
    */

    tableBody.addEventListener("click", async function (event) {

        const button = event.target.closest("[data-action]");

        if (!button) {
            return;
        }

        const collector = findCollector(button.dataset.id);

        if (!collector) {
            return;
        }

        const action = button.dataset.action;

        if (action === "edit") {

            await openFormModal("edit", collector);

        } else if (action === "reset") {

            openResetModal(collector);

        } else if (action === "delete") {

            const ok = await confirmBox(
                "Delete " + collector.name + "?",
                "This collector will be removed.",
                "Yes, delete"
            );

            if (!ok) {
                return;
            }

            try {

                const result = await request(
                    `${API}/${Number(collector.id)}`,
                    { method: "DELETE" }
                );

                toast("success", result.message || "Collector deleted.");

                await loadCollectors();

            } catch (error) {

                toast("error", error.message);

            }

        } else {

            // profile / balance / message / log — এই পপআপগুলোর ডিজাইন এখনো পাওয়া যায়নি
            const labels = {
                profile: "Profile",
                balance: "Previous Balance",
                message: "Message",
                log: "Activity Log"
            };

            info(labels[action] || "Coming soon", "This popup is not added yet.");

        }

    });


    /*
    |--------------------------------------------------------------------------
    | TOP BUTTONS / SEARCH / SORT
    |--------------------------------------------------------------------------
    */

    addButton.addEventListener("click", function () {

        openFormModal("add", null);

    });


    reloadButton.addEventListener("click", async function () {

        await Promise.all([loadCollectors(), loadAreaOptions()]);

        toast("success", "Reloaded.");

    });


    tutorialButton.addEventListener("click", function () {

        if (TUTORIAL_URL) {

            window.open(TUTORIAL_URL, "_blank", "noopener");

        } else {

            info("Tutorial", "Tutorial video is not added yet.");

        }

    });


    searchInput.addEventListener("input", renderCollectors);


    document
        .querySelectorAll("#collectorTable thead th[data-sort]")
        .forEach(function (th) {

            th.addEventListener("click", function () {

                const key = th.dataset.sort;

                if (sortKey === key) {

                    sortDir = -sortDir;

                } else {

                    sortKey = key;
                    sortDir = 1;

                }

                renderCollectors();

            });

        });


    /*
    |--------------------------------------------------------------------------
    | DEMO MODE  (?demo=1)  — শুধু UI দেখার জন্য, সার্ভারে কিছু যায় না
    |--------------------------------------------------------------------------
    */

    const demo = {

        collectors: [
            {
                id: 1, name: "MANEGER", mobile: "01956505040",
                email: "neseru4@gmail.com", address: "modhokandi",
                nid: "0000000000", status: "active", is_staff: 0,
                area_ids: [4, 6], sub_area_ids: [41, 61],
                permissions: [
                    "customer_list",
                    "daily_recharge_feature",
                    "monthly_bill_adjustment_on_recharge"
                ]
            },
            {
                id: 2, name: "MEHEDI", mobile: "01641594220",
                email: "", address: "", nid: "", status: "active",
                is_staff: 0, area_ids: [], sub_area_ids: [], permissions: []
            },
            {
                id: 3, name: "FARUK", mobile: "01956222610",
                email: "", address: "", nid: "", status: "active",
                is_staff: 0, area_ids: [], sub_area_ids: [], permissions: []
            }
        ],

        areas: [
            {
                id: 1, name: "Azhar cable",
                children: [
                    { id: 11, name: "PPPoE" },
                    { id: 12, name: "Static" },
                    { id: 13, name: "মধ্যকান্দি" }
                ]
            },
            { id: 2, name: "কারারকান্দি", children: [{ id: 21, name: "কারারকান্দি" }] },
            {
                id: 3, name: "মিরশীকারি",
                children: [
                    { id: 31, name: "উত্তর পাড়া" },
                    { id: 32, name: "দক্ষিন পাড়া" },
                    { id: 33, name: "পুর্বকান্দি" }
                ]
            },
            { id: 4, name: "ভবানীপুর", children: [{ id: 41, name: "ভবানীপুর" }] },
            { id: 5, name: "কাচারিকান্দি", children: [{ id: 51, name: "কাচারকান্দি" }] },
            { id: 6, name: "মধ্যকান্দি", children: [{ id: 61, name: "মধ্যকান্দি" }] }
        ]

    };


    async function demoRequest(url, options) {

        await new Promise(resolve => setTimeout(resolve, 150));

        const clone = value => JSON.parse(JSON.stringify(value));

        const method = (options.method || "GET").toUpperCase();

        const path = url.replace(API, "");

        const body = options.body ? JSON.parse(options.body) : {};

        if (method === "GET" && path === "") {

            return { success: true, data: clone(demo.collectors) };

        }

        if (method === "GET" && path === "/area-options") {

            return { success: true, data: clone(demo.areas) };

        }

        if (method === "POST" && path === "") {

            demo.collectors.push({ id: Date.now(), permissions: [], ...body });

            return { success: true, message: "Collector added (demo)." };

        }

        const match = path.match(/^\/(\d+)(\/reset-password)?$/);

        if (match) {

            const id = Number(match[1]);

            const index = demo.collectors.findIndex(c => Number(c.id) === id);

            if (index === -1) {

                throw new Error("Collector not found.");

            }

            if (match[2] && method === "POST") {

                return { success: true, message: "Password reset (demo)." };

            }

            if (method === "PUT") {

                demo.collectors[index] = { ...demo.collectors[index], ...body };

                return { success: true, message: "Collector updated (demo)." };

            }

            if (method === "DELETE") {

                demo.collectors.splice(index, 1);

                return { success: true, message: "Collector deleted (demo)." };

            }

        }

        throw new Error("Demo: unsupported request.");

    }


    if (DEMO) {

        document
            .querySelector(".staff-header-card")
            .insertAdjacentHTML(
                "afterend",
                '<div class="alert alert-warning py-2 mb-2">Demo mode — data is fake and nothing is saved to the server.</div>'
            );

    }


    /*
    |--------------------------------------------------------------------------
    | INITIAL LOAD
    |--------------------------------------------------------------------------
    */

    loadCollectors();

});
