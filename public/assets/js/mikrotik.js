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
                                        ${price.toFixed(2)}
                                    </td>

                                    <td>
                                        ${escapeHtml(
                                            item.alias_name
                                        )}
                                    </td>

                                    <td
                                        class="text-center"
                                    >

                                        <button
                                            type="button"
                                            class="btn btn-primary btn-sm package-edit"
                                            data-id="${packageId}"
                                            title="Edit"
                                        >

                                            <i class="fa fa-edit"></i>

                                        </button>


                                        <button
                                            type="button"
                                            class="btn btn-danger btn-sm package-delete"
                                            data-id="${packageId}"
                                            title="Delete"
                                        >

                                            <i class="fa fa-trash"></i>

                                        </button>

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


            packageSelect.innerHTML = `

                <option value="">
                    Select Package
                </option>

            `;


            packages.forEach(
                item => {

                    const option =
                        document.createElement(
                            "option"
                        );


                    option.value =
                        Number(
                            item.id || 0
                        );


                    option.textContent =
                        item.package_name || "";


                    packageSelect.appendChild(
                        option
                    );

                }
            );

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
        | MANUAL CUSTOMER SYNC
        |--------------------------------------------------------------------------
        | Automatic নয়।
        |
        | Button click করলে:
        |
        | POST /api/router/:id/customers/sync
        |
        | Success হলে একই page-এ থাকবে।
        | Customers page-এ redirect করবে না।
        |--------------------------------------------------------------------------
        */

        if (syncCustomerButton) {

            syncCustomerButton.addEventListener(
                "click",
                async () => {

                    const confirm =
                        await Swal.fire({

                            icon:
                                "question",

                            title:
                                "Sync Customers?",

                            text:
                                "MikroTik থেকে customer data sync করা হবে।",

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
                                `${API}/${routerId}/customers/sync`,
                                {
                                    method:
                                        "POST"
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
                                "success",

                            title:
                                "Customer Sync Complete",

                            text:
                                data.message ||
                                "Customers synchronized successfully.",

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


                    Swal.fire({

                        title:
                            "Checking Router...",

                        text:
                            "MikroTik-এর সাথে connection করা হচ্ছে।",

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

                        Swal.fire({

                            icon:
                                "success",

                            title:
                                "Router Online",

                            html: `

                                <div class="text-start">

                                    <div class="mb-1">

                                        <strong>
                                            Identity:
                                        </strong>

                                        ${escapeHtml(
                                            data.identity || "-"
                                        )}

                                    </div>


                                    <div class="mb-1">

                                        <strong>
                                            PPPoE:
                                        </strong>

                                        ${Number(
                                            data.pppoe_total || 0
                                        )}

                                    </div>


                                    <div class="mb-1">

                                        <strong>
                                            Active:
                                        </strong>

                                        ${Number(
                                            data.active_total || 0
                                        )}

                                    </div>


                                    <div>

                                        <strong>
                                            Profiles:
                                        </strong>

                                        ${Number(
                                            data.profile_total || 0
                                        )}

                                    </div>

                                </div>

                            `

                        });


                    } catch (error) {

                        console.error(
                            "Router check error:",
                            error
                        );


                        Swal.fire(
                            "Router Offline",
                            error.message,
                            "error"
                        );


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

                    window.location.href =
                        `/mikrotik?id=${routerId}&edit=1`;

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