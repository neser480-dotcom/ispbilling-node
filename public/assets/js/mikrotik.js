/* ---- Auto CSRF header for same-origin POST/PUT/PATCH/DELETE ---- */
(function () {
    if (window.__csrfFetchPatched) { return; }
    window.__csrfFetchPatched = true;

    const nativeFetch = window.fetch.bind(window);
    let cachedToken = "";

    async function getToken() {
        if (cachedToken) { return cachedToken; }
        const r = await nativeFetch("/api/csrf-token", {
            credentials: "same-origin",
            cache: "no-store"
        });
        const d = await r.json().catch(function () { return {}; });
        cachedToken = d.csrf_token || "";
        return cachedToken;
    }

    window.fetch = async function (input, init) {
        init = init || {};
        const method = String(
            init.method || (input && input.method) || "GET"
        ).toUpperCase();

        const url = typeof input === "string" ? input : (input && input.url) || "";
        const sameOrigin = url.startsWith("/") || url.startsWith(location.origin);

        if (sameOrigin && method !== "GET" && method !== "HEAD") {
            const token = await getToken();
            if (token) {
                const headers = new Headers(init.headers || {});
                if (!headers.has("X-CSRF-Token")) {
                    headers.set("X-CSRF-Token", token);
                }
                init.headers = headers;
            }
            if (!init.credentials) { init.credentials = "same-origin"; }
        }
        return nativeFetch(input, init);
    };
})();
"use strict";


document.addEventListener(
    "DOMContentLoaded",
    () => {


        /*
        |--------------------------------------------------------------------------
        | API
        |--------------------------------------------------------------------------
        */

        const API = "/api/router";


        /*
        |--------------------------------------------------------------------------
        | ROUTER ID
        |--------------------------------------------------------------------------
        */

        const params =
            new URLSearchParams(
                window.location.search
            );


        const routerId =
            Number(
                params.get("id") || 0
            );


        /*
        |--------------------------------------------------------------------------
        | ROUTER ID CHECK
        |--------------------------------------------------------------------------
        */

        if (
            !Number.isInteger(routerId) ||
            routerId <= 0
        ) {

            document.body.innerHTML = `

                <div class="container mt-5">

                    <div class="alert alert-danger">

                        Router ID Missing

                    </div>

                </div>

            `;

            return;
        }


        /*
        |--------------------------------------------------------------------------
        | ELEMENTS
        |--------------------------------------------------------------------------
        */

        const routerTitle =
            document.getElementById(
                "routerTitle"
            );


        const routerName =
            document.getElementById(
                "routerName"
            );


        const routerIp =
            document.getElementById(
                "routerIp"
            );


        const routerUsername =
            document.getElementById(
                "routerUsername"
            );


        const routerPort =
            document.getElementById(
                "routerPort"
            );


        const packageTable =
            document.getElementById(
                "packageTable"
            );


        const packageSearch =
            document.getElementById(
                "packageSearch"
            );


        const totalPackageCount =
            document.getElementById(
                "totalPackageCount"
            );


        const packageSelect =
            document.getElementById(
                "packageSelect"
            );


        const modalRoot =
            document.getElementById(
                "modalRoot"
            );


        const syncPackageButton =
            document.getElementById(
                "syncPackage"
            );


        const syncCustomerButton =
            document.getElementById(
                "syncCustomer"
            );


        const checkRouterButton =
            document.getElementById(
                "checkRouter"
            );


        const editRouterButton =
            document.getElementById(
                "editRouter"
            );


        /*
        |--------------------------------------------------------------------------
        | DATA
        |--------------------------------------------------------------------------
        */

        let packages = [];


        /*
        |--------------------------------------------------------------------------
        | REQUEST HELPER
        |--------------------------------------------------------------------------
        */

        async function request(
            url,
            options = {}
        ) {

            const response =
                await fetch(
                    url,
                    {
                        credentials:
                            "same-origin",

                        ...options,

                        headers: {

                            ...(options.body
                                ? {
                                    "Content-Type":
                                        "application/json"
                                }
                                : {}),

                            ...(options.headers || {})

                        }

                    }
                );


            let data;


            try {

                data =
                    await response.json();

            } catch (_) {

                throw new Error(
                    "Invalid server response."
                );

            }


            if (
                !response.ok ||
                data.status === false ||
                data.success === false
            ) {

                throw new Error(
                    data.message ||
                    "Request failed."
                );

            }


            return data;

        }


        /*
        |--------------------------------------------------------------------------
        | ESCAPE HTML
        |--------------------------------------------------------------------------
        */

        function escapeHtml(
            value
        ) {

            return String(
                value ?? ""
            )
            .replaceAll(
                "&",
                "&amp;"
            )
            .replaceAll(
                "<",
                "&lt;"
            )
            .replaceAll(
                ">",
                "&gt;"
            )
            .replaceAll(
                '"',
                "&quot;"
            )
            .replaceAll(
                "'",
                "&#039;"
            );

        }


        /*
        |--------------------------------------------------------------------------
        | LOAD ROUTER
        |--------------------------------------------------------------------------
        | IMPORTANT:
        |
        | Page load-এর সময় MikroTik connection হবে না।
        | Router information DB API থেকে নেওয়া হবে।
        |--------------------------------------------------------------------------
        */

        async function loadRouter() {

            try {

                const data =
                    await request(
                        API
                    );


                const routers =
                    Array.isArray(
                        data.routers
                    )
                        ? data.routers
                        : [];


                const router =
                    routers.find(
                        item => {

                            const id =
                                Number(
                                    item.id ||
                                    item.router_id ||
                                    item.ID ||
                                    0
                                );


                            return id === routerId;

                        }
                    );


                if (!router) {

                    throw new Error(
                        "Router not found."
                    );

                }


                /*
                |--------------------------------------------------------------
                | ROUTER TITLE
                |--------------------------------------------------------------
                */

                if (routerTitle) {

                    routerTitle.textContent =
                        `${router.name || "MikroTik"} Configuration`;

                }


                /*
                |--------------------------------------------------------------
                | ROUTER NAME
                |--------------------------------------------------------------
                */

                if (routerName) {

                    routerName.textContent =
                        router.name || "-";

                }


                /*
                |--------------------------------------------------------------
                | ROUTER IP
                |--------------------------------------------------------------
                */

                if (routerIp) {

                    routerIp.textContent =
                        router.ip || "-";

                }


                /*
                |--------------------------------------------------------------
                | USERNAME
                |--------------------------------------------------------------
                */

                if (routerUsername) {

                    routerUsername.textContent =
                        router.username || "-";

                }


                /*
                |--------------------------------------------------------------
                | PORT
                |--------------------------------------------------------------
                */

                if (routerPort) {

                    routerPort.textContent =
                        router.port || "-";

                }


            } catch (error) {

                console.error(
                    "Router loading error:",
                    error
                );


                if (routerTitle) {

                    routerTitle.textContent =
                        "MikroTik Configuration";

                }


                if (routerName) {

                    routerName.textContent =
                        "-";

                }


                if (routerIp) {

                    routerIp.textContent =
                        "-";

                }


                if (routerUsername) {

                    routerUsername.textContent =
                        "-";

                }


                if (routerPort) {

                    routerPort.textContent =
                        "-";

                }

            }

        }


        /*
        |--------------------------------------------------------------------------
        | LOAD PACKAGES
        |--------------------------------------------------------------------------
        | শুধু DB/API থেকে package list load করবে।
        |
        | এখানে কোনো MikroTik sync হবে না।
        |--------------------------------------------------------------------------
        */

        async function loadPackages() {

            if (!packageTable) {
                return;
            }


            packageTable.innerHTML = `

                <tr>

                    <td
                        colspan="5"
                        class="text-center text-muted"
                    >

                        <i class="fa fa-spinner fa-spin"></i>

                        Loading packages...

                    </td>

                </tr>

            `;


            try {

                const data =
                    await request(
                        `${API}/${routerId}/packages`
                    );


                packages =
                    Array.isArray(
                        data.packages
                    )
                        ? data.packages
                        : [];


                renderPackages();

                loadPackageSelect();


            } catch (error) {

                console.error(
                    "Package loading error:",
                    error
                );


                packageTable.innerHTML = `

                    <tr>

                        <td
                            colspan="5"
                            class="text-center text-danger"
                        >

                            ${escapeHtml(
                                error.message
                            )}

                        </td>

                    </tr>

                `;

            }

        }


        /*
        |--------------------------------------------------------------------------
        | RENDER PACKAGES
        |--------------------------------------------------------------------------
        */

        function renderPackages(
            list = packages
        ) {

            if (!packageTable) {
                return;
            }


            if (totalPackageCount) {

                totalPackageCount.textContent =
                    list.length;

            }


            if (!list.length) {

                packageTable.innerHTML = `

                    <tr>

                        <td
                            colspan="5"
                            class="text-center text-muted"
                        >

                            No Package Found

                        </td>

                    </tr>

                `;

                return;

            }


            packageTable.innerHTML =
                list
                    .map(
                        (
                            item,
                            index
                        ) => {

                            const packageId =
                                Number(
                                    item.id || 0
                                );


                            const price =
                                Number(
                                    item.price || 0
                                );


                            return `

                                <tr>

                                    <td>
                                        ${index + 1}
                                    </td>

                                    <td>
                                        ${escapeHtml(
                                            item.package_name
                                        )}
                                    </td>

                                    <td>
                                        ${Number.isInteger(price) ? price : price.toFixed(2)}
                                    </td>

                                    <td>
                                        ${escapeHtml(
                                            item.alias_name
                                        )}
                                    </td>

                                    <td
                                        class="text-center"
                                    >

                                        <div class="dropdown">
                                            <button type="button" class="cfg-dots dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" title="Action">
                                                <i class="fa fa-ellipsis"></i>
                                            </button>
                                            <ul class="dropdown-menu dropdown-menu-end cfg-menu">
                                                <li><a href="#" class="dropdown-item package-edit" data-id="${packageId}"><i class="fa fa-edit me-2 text-primary"></i>Edit</a></li>
                                                <li><a href="#" class="dropdown-item package-delete" data-id="${packageId}"><i class="fa fa-trash me-2 text-danger"></i>Delete</a></li>
                                            </ul>
                                        </div>

                                    </td>

                                </tr>

                            `;

                        }
                    )
                    .join("");

        }


        /*
        |--------------------------------------------------------------------------
        | PACKAGE SELECT
        |--------------------------------------------------------------------------
        */

        function loadPackageSelect() {

            if (!packageSelect) {
                return;
            }

            packageSelect.innerHTML =
                '<option value="package">Package</option>';

        }


        /*
        |--------------------------------------------------------------------------
        | PACKAGE SEARCH
        |--------------------------------------------------------------------------
        */

        if (packageSearch) {

            packageSearch.addEventListener(
                "input",
                () => {

                    const keyword =
                        packageSearch.value
                            .trim()
                            .toLowerCase();


                    if (!keyword) {

                        renderPackages();

                        return;

                    }


                    const filtered =
                        packages.filter(
                            item => {

                                return [

                                    item.package_name,

                                    item.alias_name,

                                    item.price

                                ]
                                .join(" ")
                                .toLowerCase()
                                .includes(
                                    keyword
                                );

                            }
                        );


                    renderPackages(
                        filtered
                    );

                }
            );

        }


        /*
        |--------------------------------------------------------------------------
        | MANUAL PACKAGE SYNC
        |--------------------------------------------------------------------------
        | Automatic নয়।
        | Button click করলেই শুধু sync হবে।
        |--------------------------------------------------------------------------
        */

        if (syncPackageButton) {

            syncPackageButton.addEventListener(
                "click",
                async () => {

                    const confirm =
                        await Swal.fire({

                            icon:
                                "question",

                            title:
                                "Sync Packages?",

                            text:
                                "MikroTik থেকে package data sync করা হবে।",

                            showCancelButton:
                                true,

                            confirmButtonText:
                                "Yes, Sync",

                            cancelButtonText:
                                "Cancel"

                        });


                    if (
                        !confirm.isConfirmed
                    ) {

                        return;

                    }


                    syncPackageButton.disabled =
                        true;


                    Swal.fire({

                        title:
                            "Syncing Packages...",

                        text:
                            "MikroTik package data synchronize করা হচ্ছে।",

                        allowOutsideClick:
                            false,

                        allowEscapeKey:
                            false,

                        didOpen:
                            () => {

                                Swal.showLoading();

                            }

                    });


                    try {

                        const data =
                            await request(
                                `${API}/${routerId}/packages/sync`,
                                {
                                    method:
                                        "POST"
                                }
                            );


                        /*
                        |------------------------------------------------------
                        | Reload DB package list
                        |------------------------------------------------------
                        */

                        await loadPackages();


                        Swal.fire({

                            icon:
                                "success",

                            title:
                                "Package Sync Complete",

                            text:
                                data.message ||
                                "Packages synchronized successfully.",

                            timer:
                                1800,

                            showConfirmButton:
                                false

                        });


                    } catch (error) {

                        console.error(
                            "Package sync error:",
                            error
                        );


                        Swal.fire(
                            "Package Sync Failed",
                            error.message,
                            "error"
                        );


                    } finally {

                        syncPackageButton.disabled =
                            false;

                    }

                }
            );

        }


        /*
        |--------------------------------------------------------------------------
        | MANUAL CUSTOMER SYNC (MikroTik list থেকে বেছে নিয়ে)
        |--------------------------------------------------------------------------
        | Automatic নয়।
        |
        | "Customer Sync" চাপলে:
        |
        | GET  /api/router/:id/customers/sync-preview
        |      → MikroTik-এর যে PPPoE user NetFee-তে নেই তাদের তালিকা
        |
        | বাছাই করে "Sync" চাপলে:
        |
        | POST /api/router/:id/customers/sync-selected
        |
        | Success হলে একই page-এ থাকবে।
        | Customers page-এ redirect করবে না।
        |--------------------------------------------------------------------------
        */

        function formatBillDate(value) {

            const m =
                /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(
                    String(value || "")
                );

            if (!m) {
                return "-";
            }

            const date =
                new Date(
                    Number(m[1]),
                    Number(m[2]) - 1,
                    Number(m[3]),
                    Number(m[4]),
                    Number(m[5])
                );

            return date
                .toLocaleString(
                    "en-US",
                    {
                        month: "short",
                        day: "2-digit",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit"
                    }
                )
                .replace(/,/g, "");

        }


        function askIncludeInactive() {

            return new Promise(resolve => {

                if (!modalRoot) {
                    resolve({ confirmed: false, includeInactive: false });
                    return;
                }

                modalRoot.innerHTML = `
                    <div class="modal fade" id="inactiveAskModal" tabindex="-1" aria-hidden="true">
                        <div class="modal-dialog modal-dialog-centered">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title">PPPoE Customer Sync</h5>
                                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                </div>
                                <div class="modal-body">
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" id="includeInactive">
                                        <label class="form-check-label" for="includeInactive">
                                            Do you want to sync with Inactive customer ?
                                        </label>
                                    </div>
                                </div>
                                <div class="modal-footer">
                                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                    <button type="button" class="btn btn-success" id="inactiveAskConfirm">Sync</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                const el = document.getElementById("inactiveAskModal");
                const modal = bootstrap.Modal.getOrCreateInstance(el);

                let result = { confirmed: false, includeInactive: false };

                el.querySelector("#inactiveAskConfirm").addEventListener("click", () => {

                    result = {
                        confirmed: true,
                        includeInactive: el.querySelector("#includeInactive").checked
                    };

                    modal.hide();

                });

                el.addEventListener(
                    "hidden.bs.modal",
                    () => resolve(result),
                    { once: true }
                );

                modal.show();

            });

        }


        function askCustomerSync(includeInactive = false) {

            return new Promise(resolve => {

                if (!modalRoot) {
                    resolve({ confirmed: false, usernames: [] });
                    return;
                }

                modalRoot.innerHTML = `
                    <div class="modal fade" id="customerSyncModal" tabindex="-1" aria-hidden="true">
                        <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title">PPPoE Customer Sync</h5>
                                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                </div>
                                <div class="modal-body" id="customerSyncBody">
                                    <div class="text-center text-muted py-4">
                                        <i class="fa fa-spinner fa-spin"></i>
                                        Loading MikroTik customers...
                                    </div>
                                </div>
                                <div class="modal-footer">
                                    <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
                                    <button type="button" class="btn btn-success btn-sm" id="customerSyncConfirm" disabled>Sync</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

const el = document.getElementById("customerSyncModal");

// Keep modal outside page/sidebar stacking contexts.
document.body.appendChild(el);
el.style.zIndex = "20000";

const body = el.querySelector("#customerSyncBody");
                const confirmButton = el.querySelector("#customerSyncConfirm");
                const modal = bootstrap.Modal.getOrCreateInstance(el);

                let result = { confirmed: false, usernames: [] };
                let rows = [];
                let keyword = "";
                let sortKey = "";
                let sortDir = 1;

                const selected = new Set();

                const collator =
                    new Intl.Collator(
                        undefined,
                        { numeric: true, sensitivity: "base" }
                    );


                function visibleRows() {

                    let list = rows;

                    if (keyword) {

                        list = list.filter(item =>
                            [
                                item.name,
                                item.pppoe_username,
                                item.mobile,
                                item.status,
                                item.package,
                                item.monthly
                            ]
                                .join(" ")
                                .toLowerCase()
                                .includes(keyword)
                        );

                    }

                    if (sortKey) {

                        list = [...list].sort(
                            (a, b) =>
                                collator.compare(
                                    String(a[sortKey] ?? ""),
                                    String(b[sortKey] ?? "")
                                ) * sortDir
                        );

                    }

                    return list;

                }


                function updateFooter() {

                    confirmButton.disabled = selected.size === 0;

                    confirmButton.textContent =
                        selected.size
                            ? `Sync (${selected.size})`
                            : "Sync";

                }


                function renderRows() {

                    const list = visibleRows();

                    const tbody = body.querySelector("#customerSyncRows");
                    const total = body.querySelector("#customerSyncTotal");
                    const all = body.querySelector("#customerSyncAll");

                    total.textContent = list.length;

                    if (!list.length) {

                        tbody.innerHTML = `
                            <tr>
                                <td colspan="8" class="text-center text-muted py-4">
                                    No Customer Found
                                </td>
                            </tr>
                        `;

                    } else {

                        tbody.innerHTML = list.map(item => {

                            const active = item.status === "active";

                            return `
                                <tr>
                                    <td style="width:40px;">
                                        <input
                                            type="checkbox"
                                            class="form-check-input cs-check"
                                            data-user="${escapeHtml(item.pppoe_username)}"
                                            ${selected.has(item.pppoe_username) ? "checked" : ""}
                                        >
                                    </td>
                                    <td>${escapeHtml(item.name)}</td>
                                    <td>${escapeHtml(item.pppoe_username)}</td>
                                    <td>${escapeHtml(item.mobile)}</td>
                                    <td>
                                        <span class="badge ${active ? "bg-primary" : "bg-secondary"}">
                                            ${escapeHtml(item.status)}
                                        </span>
                                    </td>
                                    <td>${escapeHtml(item.package)}</td>
                                    <td>${Number(item.monthly || 0)}</td>
                                    <td>${escapeHtml(formatBillDate(item.bill_date))}</td>
                                </tr>
                            `;

                        }).join("");

                    }

                    const checked =
                        list.filter(item => selected.has(item.pppoe_username)).length;

                    all.checked = list.length > 0 && checked === list.length;
                    all.indeterminate = checked > 0 && checked < list.length;

                    updateFooter();

                }


                function renderTable() {

                    const heads = [
                        ["name", "Name"],
                        ["pppoe_username", "PPPoE"],
                        ["mobile", "Mobile"],
                        ["status", "Status"],
                        ["package", "Package"],
                        ["monthly", "Monthly"],
                        ["bill_date", "Bill Date"]
                    ];

                    body.innerHTML = `
                        <div class="mk-strip">
                            <div class="mk-total">
                                <i class="fa fa-gear me-2"></i>
                                Total Data:
                                <span class="mk-count-pill" id="customerSyncTotal">0</span>
                            </div>
                            <div class="mk-search-wrap">
                                <input type="search" id="customerSyncSearch" class="form-control" placeholder="Search" autocomplete="off">
                            </div>
                        </div>

                        <div class="table-responsive">
                            <table class="table mk-table align-middle mb-0">
                                <thead>
                                    <tr>
                                        <th style="width:40px;">
                                            <input type="checkbox" class="form-check-input" id="customerSyncAll">
                                        </th>
                                        ${heads.map(([key, label]) => `
                                            <th data-sort-key="${key}" style="cursor:pointer;">
                                                ${label} <span class="sort-icon">⇵</span>
                                            </th>
                                        `).join("")}
                                    </tr>
                                </thead>
                                <tbody id="customerSyncRows"></tbody>
                            </table>
                        </div>
                    `;

                    body.querySelector("#customerSyncSearch")
                        .addEventListener("input", event => {

                            keyword =
                                event.target.value.trim().toLowerCase();

                            renderRows();

                        });

                    body.querySelector("#customerSyncAll")
                        .addEventListener("change", event => {

                            visibleRows().forEach(item => {

                                if (event.target.checked) {
                                    selected.add(item.pppoe_username);
                                } else {
                                    selected.delete(item.pppoe_username);
                                }

                            });

                            renderRows();

                        });

                    body.querySelector("#customerSyncRows")
                        .addEventListener("change", event => {

                            const box = event.target.closest(".cs-check");

                            if (!box) {
                                return;
                            }

                            if (box.checked) {
                                selected.add(box.dataset.user);
                            } else {
                                selected.delete(box.dataset.user);
                            }

                            renderRows();

                        });

                    body.querySelectorAll("th[data-sort-key]")
                        .forEach(th => {

                            th.addEventListener("click", () => {

                                const key = th.dataset.sortKey;

                                if (sortKey === key) {
                                    sortDir = -sortDir;
                                } else {
                                    sortKey = key;
                                    sortDir = 1;
                                }

                                body.querySelectorAll("th[data-sort-key]")
                                    .forEach(other => {

                                        const icon =
                                            other.querySelector(".sort-icon");

                                        icon.classList.toggle("active", other.dataset.sortKey === sortKey);

                                    });

                                renderRows();

                            });

                        });

                    renderRows();

                }


                confirmButton.addEventListener("click", () => {

                    result = {
                        confirmed: true,
                        usernames: [...selected]
                    };

                    modal.hide();

                });

                el.addEventListener(
                    "hidden.bs.modal",
                    () => resolve(result),
                    { once: true }
                );

modal.show();

requestAnimationFrame(() => {
    const backdrops = document.querySelectorAll(".modal-backdrop");
    const backdrop = backdrops[backdrops.length - 1];

    if (backdrop) {
        backdrop.style.setProperty("z-index", "1000000", "important");
    }

    el.style.setProperty("z-index", "1000001", "important");
});

                request(`${API}/${routerId}/customers/sync-preview`)
                    .then(data => {

                        rows =
                            Array.isArray(data.customers)
                                ? data.customers
                                : [];

                        if (!includeInactive) {
                            rows = rows.filter(item => item.status === "active");
                        }

                        renderTable();

                    })
                    .catch(error => {

                        console.error(
                            "Customer sync preview error:",
                            error
                        );

                        body.innerHTML = `
                            <div class="text-center text-danger py-4">
                                ${escapeHtml(error.message)}
                            </div>
                        `;

                    });

            });

        }


        if (syncCustomerButton) {

            syncCustomerButton.addEventListener(
                "click",
                async () => {

                    const step1 = await askIncludeInactive();

                    if (!step1.confirmed) {
                        return;
                    }

                    const choice = await askCustomerSync(step1.includeInactive);

                    if (
                        !choice.confirmed ||
                        !choice.usernames.length
                    ) {
                        return;
                    }


                    syncCustomerButton.disabled =
                        true;


                    Swal.fire({

                        title:
                            "Syncing Customers...",

                        text:
                            "MikroTik customer data synchronize করা হচ্ছে।",

                        allowOutsideClick:
                            false,

                        allowEscapeKey:
                            false,

                        didOpen:
                            () => {

                                Swal.showLoading();

                            }

                    });


                    try {

                        const data =
                            await request(
                                `${API}/${routerId}/customers/sync-selected`,
                                {
                                    method:
                                        "POST",

                                    body: JSON.stringify({
                                        usernames: choice.usernames
                                    })
                                }
                            );


                        /*
                        |------------------------------------------------------
                        | NO REDIRECT
                        |------------------------------------------------------
                        |
                        | Customer Sync সফল হলে একই Config page-এ থাকবে।
                        |
                        */

                        Swal.fire({

                            icon:
                                Number(data.failed || 0) > 0
                                    ? "warning"
                                    : "success",

                            title:
                                "Customer Sync Complete",

                            html: `
                                <div class="text-start">
                                    <div>Added: <strong>${Number(data.inserted || 0)}</strong></div>
                                    <div>Restored: <strong>${Number(data.restored || 0)}</strong></div>
                                    <div>Skipped: <strong>${Number(data.skipped || 0)}</strong></div>
                                    <div>Failed: <strong>${Number(data.failed || 0)}</strong></div>
                                </div>
                            `,

                            confirmButtonText:
                                "OK"

                        });


                    } catch (error) {

                        console.error(
                            "Customer sync error:",
                            error
                        );


                        Swal.fire(
                            "Customer Sync Failed",
                            error.message,
                            "error"
                        );


                    } finally {

                        syncCustomerButton.disabled =
                            false;

                    }

                }
            );

        }


        /*
        |--------------------------------------------------------------------------
        | CHECK ROUTER CONNECTION
        |--------------------------------------------------------------------------
        | MikroTik connection শুধুমাত্র button click করলে হবে।
        |--------------------------------------------------------------------------
        */

        if (checkRouterButton) {

            checkRouterButton.addEventListener(
                "click",
                async () => {

                    checkRouterButton.disabled =
                        true;


                    


                    try {

                        const data =
                            await request(
                                `${API}/${routerId}/check`
                            );


                        /*
                        |------------------------------------------------------
                        | ROUTER DATA
                        |------------------------------------------------------
                        */

                        const router =
                            data.router || {};


                        if (
                            router.name &&
                            routerName
                        ) {

                            routerName.textContent =
                                router.name;

                        }


                        if (
                            router.ip &&
                            routerIp
                        ) {

                            routerIp.textContent =
                                router.ip;

                        }


                        if (
                            router.username &&
                            routerUsername
                        ) {

                            routerUsername.textContent =
                                router.username;

                        }


                        if (
                            router.port &&
                            routerPort
                        ) {

                            routerPort.textContent =
                                router.port;

                        }


                        if (
                            router.name &&
                            routerTitle
                        ) {

                            routerTitle.textContent =
                                `${router.name} Configuration`;

                        }


                        /*
                        |------------------------------------------------------
                        | SUCCESS
                        |------------------------------------------------------
                        */

                        MkToast.success(`${(routerName && routerName.textContent) || "Mikrotik"} এর কানেকশন ঠিক আছে`);


                    } catch (error) {

                        console.error(
                            "Router check error:",
                            error
                        );


                        MkToast.error(error.message);


                    } finally {

                        checkRouterButton.disabled =
                            false;

                    }

                }
            );

        }


        /*
        |--------------------------------------------------------------------------
        | EDIT ROUTER
        |--------------------------------------------------------------------------
        */

        if (editRouterButton) {

            editRouterButton.addEventListener(
                "click",
                () => {

                    window.dispatchEvent(new CustomEvent("mk:edit-router", { detail: { id: routerId } }));

                }
            );

        }


        /*
        |--------------------------------------------------------------------------
        | PACKAGE TABLE ACTIONS
        |--------------------------------------------------------------------------
        */

        if (packageTable) {

            packageTable.addEventListener(
                "click",
                event => {

                    if (event.target.closest(".dropdown-item")) {
                        event.preventDefault();
                    }


                    const editButton =
                        event.target.closest(
                            ".package-edit"
                        );


                    if (editButton) {

                        editPackage(
                            Number(
                                editButton.dataset.id
                            )
                        );

                        return;

                    }


                    const deleteButton =
                        event.target.closest(
                            ".package-delete"
                        );


                    if (deleteButton) {

                        deletePackage(
                            Number(
                                deleteButton.dataset.id
                            )
                        );

                    }

                }
            );

        }


        /*
        |--------------------------------------------------------------------------
        | EDIT PACKAGE
        |--------------------------------------------------------------------------
        */

        function editPackage(
            id
        ) {

            if (!modalRoot) {
                return;
            }


            const item =
                packages.find(
                    p =>
                        Number(
                            p.id
                        ) === id
                );


            if (!item) {

                Swal.fire(
                    "Error",
                    "Package not found.",
                    "error"
                );

                return;

            }


            modalRoot.innerHTML = `

                <div
                    class="modal fade"
                    id="packageModal"
                    tabindex="-1"
                    aria-hidden="true"
                >

                    <div
                        class="modal-dialog modal-dialog-centered"
                    >

                        <div class="modal-content">


                            <div
                                class="modal-header bg-primary text-white"
                            >

                                <h5 class="modal-title">

                                    Edit Package

                                </h5>


                                <button
                                    type="button"
                                    class="btn-close btn-close-white"
                                    data-bs-dismiss="modal"
                                    aria-label="Close"
                                ></button>

                            </div>


                            <form id="packageForm">

                                <div class="modal-body">


                                    <div class="mb-3">

                                        <label
                                            class="form-label"
                                        >
                                            Package Name
                                        </label>


                                        <input
                                            type="text"
                                            name="package_name"
                                            class="form-control"
                                            value="${escapeHtml(
                                                item.package_name
                                            )}"
                                            required
                                        >

                                    </div>


                                    <div class="mb-3">

                                        <label
                                            class="form-label"
                                        >
                                            Price
                                        </label>


                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            name="price"
                                            class="form-control"
                                            value="${Number(
                                                item.price || 0
                                            )}"
                                        >

                                    </div>


                                    <div class="mb-3">

                                        <label
                                            class="form-label"
                                        >
                                            Alias Name
                                        </label>


                                        <input
                                            type="text"
                                            name="alias_name"
                                            class="form-control"
                                            value="${escapeHtml(
                                                item.alias_name
                                            )}"
                                        >

                                    </div>

                                </div>


                                <div class="modal-footer">


                                    <button
                                        type="button"
                                        class="btn btn-secondary"
                                        data-bs-dismiss="modal"
                                    >

                                        Cancel

                                    </button>


                                    <button
                                        type="submit"
                                        class="btn btn-success"
                                    >

                                        <i class="fa fa-save"></i>

                                        Save

                                    </button>

                                </div>

                            </form>

                        </div>

                    </div>

                </div>

            `;


            const modalElement =
                document.getElementById(
                    "packageModal"
                );


            const packageForm =
                document.getElementById(
                    "packageForm"
                );


            if (
                !modalElement ||
                !packageForm
            ) {

                return;

            }


            const modal =
                bootstrap.Modal.getOrCreateInstance(
                    modalElement
                );


            modal.show();


            packageForm.addEventListener(
                "submit",
                async event => {

                    event.preventDefault();


                    const submitButton =
                        packageForm.querySelector(
                            'button[type="submit"]'
                        );


                    const formData =
                        Object.fromEntries(
                            new FormData(
                                packageForm
                            )
                        );


                    if (submitButton) {

                        submitButton.disabled =
                            true;

                    }


                    try {

                        await request(
                            `${API}/packages/${id}`,
                            {

                                method:
                                    "PUT",

                                body:
                                    JSON.stringify(
                                        formData
                                    )

                            }
                        );


                        modal.hide();


                        await loadPackages();


                        Swal.fire({

                            icon:
                                "success",

                            title:
                                "Package Updated",

                            timer:
                                1400,

                            showConfirmButton:
                                false

                        });


                    } catch (error) {

                        console.error(
                            "Package update error:",
                            error
                        );


                        Swal.fire(
                            "Update Failed",
                            error.message,
                            "error"
                        );


                    } finally {

                        if (submitButton) {

                            submitButton.disabled =
                                false;

                        }

                    }

                }
            );

        }


        /*
        |--------------------------------------------------------------------------
        | DELETE PACKAGE
        |--------------------------------------------------------------------------
        */

        async function deletePackage(
            id
        ) {

            const confirm =
                await Swal.fire({

                    icon:
                        "warning",

                    title:
                        "Delete Package?",

                    text:
                        "This action cannot be undone.",

                    showCancelButton:
                        true,

                    confirmButtonText:
                        "Delete",

                    cancelButtonText:
                        "Cancel"

                });


            if (
                !confirm.isConfirmed
            ) {

                return;

            }


            try {

                await request(
                    `${API}/packages/${id}`,
                    {
                        method:
                            "DELETE"
                    }
                );


                await loadPackages();


                Swal.fire({

                    icon:
                        "success",

                    title:
                        "Package Deleted",

                    timer:
                        1300,

                    showConfirmButton:
                        false

                });


            } catch (error) {

                console.error(
                    "Package delete error:",
                    error
                );


                Swal.fire(
                    "Delete Failed",
                    error.message,
                    "error"
                );

            }

        }


        /*
        |--------------------------------------------------------------------------
        | INITIAL PAGE LOAD
        |--------------------------------------------------------------------------
        |
        | এখানে শুধুমাত্র:
        |
        | 1. Router info load
        | 2. Existing package list load
        |
        | কোনো sync নেই।
        |
        |--------------------------------------------------------------------------
        */

        Promise.allSettled([
            loadRouter(),
            loadPackages()
        ]);

    }
);