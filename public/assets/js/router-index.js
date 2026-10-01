"use strict";


document.addEventListener(
    "DOMContentLoaded",
    () => {


        const API =
            "/api/router";


        const tableBody =
            document.getElementById(
                "routerTableBody"
            );


        const search =
            document.getElementById(
                "routerSearch"
            );


        const refresh =
            document.getElementById(
                "refreshRouters"
            );


        const addButton =
            document.getElementById(
                "addRouter"
            );


        const modalRoot =
            document.getElementById(
                "modalRoot"
            );


        const totalRouter =
            document.getElementById(
                "totalRouter"
            );


        const companyInfo =
            document.getElementById(
                "companyInfo"
            );


        let routers = [];


        /*
        |--------------------------------------------------------------------------
        | FETCH JSON
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
                        ...options,

                        headers: {

                            "Content-Type":
                                "application/json",

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
                    "Server returned invalid response."
                );
            }


            if (
                !response.ok ||
                data.status === false
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
        | ROUTER ID
        |--------------------------------------------------------------------------
        */

        function getRouterId(
            router
        ) {

            return Number(
                router.id ||
                router.router_id ||
                router.ID ||
                0
            );
        }


        /*
        |--------------------------------------------------------------------------
        | LOAD
        |--------------------------------------------------------------------------
        */

        async function loadRouters() {

            tableBody.innerHTML = `

                <tr>

                    <td
                        colspan="7"
                        class="text-center text-muted py-4"
                    >

                        <i class="fa fa-spinner fa-spin"></i>

                        Loading...

                    </td>

                </tr>

            `;


            try {

                const data =
                    await request(
                        API
                    );


                routers =
                    Array.isArray(
                        data.routers
                    )
                        ? data.routers
                        : [];


                renderRouters();


            } catch (error) {

                tableBody.innerHTML = `

                    <tr>

                        <td
                            colspan="7"
                            class="text-center text-danger py-4"
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
        | RENDER
        |--------------------------------------------------------------------------
        */

        function renderRouters(
            list = routers
        ) {

            totalRouter.textContent =
                `Total Router: ${list.length}`;


            if (!list.length) {

                tableBody.innerHTML = `

                    <tr>

                        <td
                            colspan="7"
                            class="text-center text-muted py-4"
                        >

                            No Router Found

                        </td>

                    </tr>

                `;

                return;
            }


            tableBody.innerHTML =
                list
                    .map(
                        (
                            router,
                            index
                        ) => {

                            const id =
                                getRouterId(
                                    router
                                );


                            return `

                                <tr>

                                    <td>
                                        ${index + 1}
                                    </td>

                                    <td>
                                        ${escapeHtml(
                                            router.name
                                        )}
                                    </td>

                                    <td>
                                        ${escapeHtml(
                                            router.username
                                        )}
                                    </td>

                                    <td>
                                        ${escapeHtml(
                                            router.ip
                                        )}
                                    </td>

                                    <td>

                                        <span class="badge bg-info">

                                            ${escapeHtml(
                                                router.port
                                            )}

                                        </span>

                                    </td>

                                    <td>

                                        <div
                                            class="router-status"
                                            data-id="${id}"
                                        >

                                            <span class="badge bg-secondary">

                                                Checking...

                                            </span>

                                        </div>

                                    </td>

                                    <td class="text-center">

                                        ${
                                            id > 0
                                                ? `

                                                <a
                                                    href="/mikrotik?id=${encodeURIComponent(id)}"
                                                    class="btn btn-success btn-sm router-action"
                                                    title="Manage Router"
                                                >

                                                    <i class="fa fa-sliders"></i>

                                                </a>

                                                `
                                                : ""
                                        }


                                        <button
                                            type="button"
                                            class="btn btn-primary btn-sm router-action btn-edit-router"
                                            data-id="${id}"
                                            title="Edit Router"
                                        >

                                            <i class="fa fa-edit"></i>

                                        </button>


                                        <button
                                            type="button"
                                            class="btn btn-success btn-sm router-action btn-check-router"
                                            data-id="${id}"
                                            title="Check Connection"
                                        >

                                            <i class="fa fa-plug"></i>

                                        </button>


                                        <button
                                            type="button"
                                            class="btn btn-info btn-sm router-action btn-history-router"
                                            data-id="${id}"
                                            title="Router History"
                                        >

                                            <i class="fa fa-circle-info"></i>

                                        </button>


                                        <button
                                            type="button"
                                            class="btn btn-danger btn-sm router-action btn-delete-router"
                                            data-id="${id}"
                                            title="Delete Router"
                                        >

                                            <i class="fa fa-trash"></i>

                                        </button>

                                    </td>

                                </tr>

                            `;

                        }
                    )
                    .join("");


            checkAllRouters();

        }


        /*
        |--------------------------------------------------------------------------
        | CHECK ALL
        |--------------------------------------------------------------------------
        */

        async function checkAllRouters() {

            const elements =
                tableBody.querySelectorAll(
                    ".router-status"
                );


            for (
                const element
                of elements
            ) {

                checkRouterStatus(
                    Number(
                        element.dataset.id
                    ),
                    element
                );

            }

        }


        /*
        |--------------------------------------------------------------------------
        | CHECK STATUS
        |--------------------------------------------------------------------------
        */

        async function checkRouterStatus(
            id,
            element
        ) {

            if (!id) {
                return;
            }


            try {

                const data =
                    await request(
                        `${API}/${id}/check`
                    );


                element.innerHTML = `

                    <span
                        class="badge bg-success"
                        title="${escapeHtml(
                            data.identity || ""
                        )}"
                    >

                        Online

                    </span>

                `;

            } catch (error) {

                element.innerHTML = `

                    <span
                        class="badge bg-danger"
                        title="${escapeHtml(
                            error.message
                        )}"
                    >

                        Offline

                    </span>

                `;

            }

        }


        /*
        |--------------------------------------------------------------------------
        | SEARCH
        |--------------------------------------------------------------------------
        */

        if (search) {

            search.addEventListener(
                "input",
                () => {

                    const keyword =
                        search.value
                            .trim()
                            .toLowerCase();


                    if (!keyword) {

                        renderRouters();

                        return;
                    }


                    const filtered =
                        routers.filter(
                            router => {

                                return [

                                    router.name,

                                    router.username,

                                    router.ip,

                                    router.port

                                ]
                                .join(" ")
                                .toLowerCase()
                                .includes(
                                    keyword
                                );

                            }
                        );


                    renderRouters(
                        filtered
                    );

                }
            );

        }


        /*
        |--------------------------------------------------------------------------
        | REFRESH
        |--------------------------------------------------------------------------
        */

        if (refresh) {

            refresh.addEventListener(
                "click",
                loadRouters
            );

        }


        /*
        |--------------------------------------------------------------------------
        | ADD MODAL
        |--------------------------------------------------------------------------
        */

        function openAddModal() {

            modalRoot.innerHTML = `

                <div
                    class="modal fade router-modal"
                    id="routerFormModal"
                    tabindex="-1"
                >

                    <div class="modal-dialog modal-lg modal-dialog-centered">

                        <div class="modal-content">

                            <div class="modal-header">

                                <h5 class="modal-title">

                                    <i class="fa fa-plus me-1"></i>

                                    Add MikroTik Router

                                </h5>

                                <button
                                    type="button"
                                    class="btn-close btn-close-white"
                                    data-bs-dismiss="modal"
                                ></button>

                            </div>


                            <form id="routerForm">

                                <div class="modal-body">

                                    <div class="row">

                                        <div class="col-md-6 mb-3">

                                            <label>
                                                Router Name
                                            </label>

                                            <input
                                                type="text"
                                                name="name"
                                                class="form-control"
                                                required
                                            >

                                        </div>


                                        <div class="col-md-6 mb-3">

                                            <label>
                                                IP Address
                                            </label>

                                            <input
                                                type="text"
                                                name="ip"
                                                class="form-control"
                                                required
                                            >

                                        </div>


                                        <div class="col-md-6 mb-3">

                                            <label>
                                                Username
                                            </label>

                                            <input
                                                type="text"
                                                name="username"
                                                class="form-control"
                                                required
                                            >

                                        </div>


                                        <div class="col-md-6 mb-3">

                                            <label>
                                                Password
                                            </label>

                                            <input
                                                type="password"
                                                name="password"
                                                class="form-control"
                                                required
                                            >

                                        </div>


                                        <div class="col-md-4 mb-3">

                                            <label>
                                                API Port
                                            </label>

                                            <input
                                                type="number"
                                                name="port"
                                                class="form-control"
                                                value="8728"
                                            >

                                        </div>


                                        <div class="col-md-4 mb-3">

                                            <label>
                                                Use SSL
                                            </label>

                                            <select
                                                name="use_ssl"
                                                class="form-select"
                                            >

                                                <option value="0">
                                                    Disable
                                                </option>

                                                <option value="1">
                                                    Enable
                                                </option>

                                            </select>

                                        </div>


                                        <div class="col-md-4 mb-3">

                                            <label>
                                                Timeout
                                            </label>

                                            <input
                                                type="number"
                                                name="timeout"
                                                class="form-control"
                                                value="3"
                                            >

                                        </div>

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

                                        Save Router

                                    </button>

                                </div>

                            </form>

                        </div>

                    </div>

                </div>

            `;


            const modal =
                bootstrap.Modal.getOrCreateInstance(
                    document.getElementById(
                        "routerFormModal"
                    )
                );


            modal.show();


            document
                .getElementById(
                    "routerForm"
                )
                .addEventListener(
                    "submit",
                    saveRouter
                );

        }


        /*
        |--------------------------------------------------------------------------
        | SAVE
        |--------------------------------------------------------------------------
        */

        async function saveRouter(
            event
        ) {

            event.preventDefault();


            const form =
                event.currentTarget;


            const data =
                Object.fromEntries(
                    new FormData(form)
                );


            const button =
                form.querySelector(
                    "button[type='submit']"
                );


            button.disabled = true;


            try {

                await request(
                    API,
                    {

                        method: "POST",

                        body:
                            JSON.stringify(
                                data
                            )

                    }
                );


                bootstrap.Modal
                    .getInstance(
                        document.getElementById(
                            "routerFormModal"
                        )
                    )
                    ?.hide();


                await loadRouters();


                Swal.fire({

                    icon: "success",

                    title:
                        "Router Added",

                    text:
                        "Router added successfully.",

                    timer: 1600,

                    showConfirmButton:
                        false

                });

            } catch (error) {

                Swal.fire({

                    icon: "error",

                    title: "Error",

                    text:
                        error.message

                });

            } finally {

                button.disabled = false;

            }

        }


        /*
        |--------------------------------------------------------------------------
        | EDIT MODAL
        |--------------------------------------------------------------------------
        */

        function openEditModal(
            id
        ) {

            const router =
                routers.find(
                    item =>
                        getRouterId(item) === id
                );


            if (!router) {

                Swal.fire(
                    "Error",
                    "Router not found.",
                    "error"
                );

                return;
            }


            modalRoot.innerHTML = `

                <div
                    class="modal fade router-modal"
                    id="routerFormModal"
                    tabindex="-1"
                >

                    <div class="modal-dialog modal-lg modal-dialog-centered">

                        <div class="modal-content">

                            <div class="modal-header">

                                <h5 class="modal-title">

                                    <i class="fa fa-edit me-1"></i>

                                    Edit MikroTik Router

                                </h5>

                                <button
                                    type="button"
                                    class="btn-close btn-close-white"
                                    data-bs-dismiss="modal"
                                ></button>

                            </div>


                            <form id="routerForm">

                                <div class="modal-body">

                                    <div class="row">

                                        <div class="col-md-6 mb-3">

                                            <label>
                                                Router Name
                                            </label>

                                            <input
                                                type="text"
                                                name="name"
                                                class="form-control"
                                                value="${escapeHtml(router.name)}"
                                                required
                                            >

                                        </div>


                                        <div class="col-md-6 mb-3">

                                            <label>
                                                IP Address
                                            </label>

                                            <input
                                                type="text"
                                                name="ip"
                                                class="form-control"
                                                value="${escapeHtml(router.ip)}"
                                                required
                                            >

                                        </div>


                                        <div class="col-md-6 mb-3">

                                            <label>
                                                Username
                                            </label>

                                            <input
                                                type="text"
                                                name="username"
                                                class="form-control"
                                                value="${escapeHtml(router.username)}"
                                                required
                                            >

                                        </div>


                                        <div class="col-md-6 mb-3">

                                            <label>
                                                Password
                                            </label>

                                            <input
                                                type="password"
                                                name="password"
                                                class="form-control"
                                                placeholder="Leave blank to keep current password"
                                            >

                                        </div>


                                        <div class="col-md-4 mb-3">

                                            <label>
                                                API Port
                                            </label>

                                            <input
                                                type="number"
                                                name="port"
                                                class="form-control"
                                                value="${Number(router.port || 8728)}"
                                            >

                                        </div>


                                        <div class="col-md-4 mb-3">

                                            <label>
                                                Use SSL
                                            </label>

                                            <select
                                                name="use_ssl"
                                                class="form-select"
                                            >

                                                <option
                                                    value="0"
                                                    ${Number(router.use_ssl) === 0 ? "selected" : ""}
                                                >
                                                    Disable
                                                </option>

                                                <option
                                                    value="1"
                                                    ${Number(router.use_ssl) === 1 ? "selected" : ""}
                                                >
                                                    Enable
                                                </option>

                                            </select>

                                        </div>


                                        <div class="col-md-4 mb-3">

                                            <label>
                                                Timeout
                                            </label>

                                            <input
                                                type="number"
                                                name="timeout"
                                                class="form-control"
                                                value="${Number(router.timeout || 3)}"
                                            >

                                        </div>

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

                                        Update Router

                                    </button>

                                </div>

                            </form>

                        </div>

                    </div>

                </div>

            `;


            const modal =
                bootstrap.Modal.getOrCreateInstance(
                    document.getElementById(
                        "routerFormModal"
                    )
                );


            modal.show();


            document
                .getElementById(
                    "routerForm"
                )
                .addEventListener(
                    "submit",
                    event =>
                        updateRouter(
                            event,
                            id
                        )
                );

        }


        /*
        |--------------------------------------------------------------------------
        | UPDATE
        |--------------------------------------------------------------------------
        */

        async function updateRouter(
            event,
            id
        ) {

            event.preventDefault();


            const form =
                event.currentTarget;


            const data =
                Object.fromEntries(
                    new FormData(form)
                );


            const button =
                form.querySelector(
                    "button[type='submit']"
                );


            button.disabled = true;


            try {

                await request(
                    `${API}/${id}`,
                    {

                        method: "PUT",

                        body:
                            JSON.stringify(
                                data
                            )

                    }
                );


                bootstrap.Modal
                    .getInstance(
                        document.getElementById(
                            "routerFormModal"
                        )
                    )
                    ?.hide();


                await loadRouters();


                Swal.fire({

                    icon: "success",

                    title:
                        "Updated",

                    text:
                        "Router updated successfully.",

                    timer: 1500,

                    showConfirmButton:
                        false

                });

            } catch (error) {

                Swal.fire(
                    "Error",
                    error.message,
                    "error"
                );

            } finally {

                button.disabled = false;

            }

        }


        /*
        |--------------------------------------------------------------------------
        | CHECK
        |--------------------------------------------------------------------------
        */

        async function checkRouter(
            id
        ) {

            Swal.fire({

                title:
                    "Checking Router...",

                allowOutsideClick:
                    false,

                didOpen: () =>
                    Swal.showLoading()

            });


            try {

                const data =
                    await request(
                        `${API}/${id}/check`
                    );


                const resource =
                    data.resource || {};


                Swal.fire({

                    icon: "success",

                    title:
                        "Router Online",

                    html: `

                        <div class="text-start">

                            <b>Name:</b>
                            ${escapeHtml(
                                data.router?.name
                            )}

                            <br>

                            <b>IP:</b>
                            ${escapeHtml(
                                data.router?.ip
                            )}

                            <br>

                            <b>Identity:</b>
                            ${escapeHtml(
                                data.identity
                            )}

                            <br>

                            <b>PPPoE:</b>
                            ${Number(
                                data.pppoe_total || 0
                            )}

                            <br>

                            <b>Active:</b>
                            ${Number(
                                data.active_total || 0
                            )}

                            <br>

                            <b>Profiles:</b>
                            ${Number(
                                data.profile_total || 0
                            )}

                            <br>

                            <b>CPU:</b>
                            ${escapeHtml(
                                resource["cpu-load"] || "-"
                            )}%

                        </div>

                    `

                });


            } catch (error) {

                Swal.fire({

                    icon: "error",

                    title:
                        "Router Offline",

                    text:
                        error.message

                });

            }

        }


        /*
        |--------------------------------------------------------------------------
        | HISTORY
        |--------------------------------------------------------------------------
        */

        async function routerHistory(
            id
        ) {

            Swal.fire({

                title:
                    "Loading Router Details...",

                allowOutsideClick:
                    false,

                didOpen: () =>
                    Swal.showLoading()

            });


            try {

                const data =
                    await request(
                        `${API}/${id}/history`
                    );


                const resource =
                    data.resource || {};


                Swal.fire({

                    title:
                        "Router Details",

                    width:
                        650,

                    html: `

                        <div class="text-start">

                            <div class="mb-2">

                                <b>Router Name:</b>

                                ${escapeHtml(
                                    data.router?.name
                                )}

                            </div>


                            <div class="mb-2">

                                <b>IP:</b>

                                ${escapeHtml(
                                    data.router?.ip
                                )}

                            </div>


                            <div class="mb-2">

                                <b>Username:</b>

                                ${escapeHtml(
                                    data.router?.username
                                )}

                            </div>


                            <div class="mb-2">

                                <b>API Port:</b>

                                ${escapeHtml(
                                    data.router?.port
                                )}

                            </div>


                            <hr>


                            <div class="mb-2">

                                <b>RouterOS Version:</b>

                                ${escapeHtml(
                                    resource.version || "-"
                                )}

                            </div>


                            <div class="mb-2">

                                <b>Board:</b>

                                ${escapeHtml(
                                    resource["board-name"] || "-"
                                )}

                            </div>


                            <div class="mb-2">

                                <b>Platform:</b>

                                ${escapeHtml(
                                    resource.platform || "-"
                                )}

                            </div>


                            <div class="mb-2">

                                <b>CPU:</b>

                                ${escapeHtml(
                                    resource.cpu || "-"
                                )}

                            </div>


                            <div class="mb-2">

                                <b>CPU Load:</b>

                                ${escapeHtml(
                                    resource["cpu-load"] || "-"
                                )}%

                            </div>


                            <div class="mb-2">

                                <b>Uptime:</b>

                                ${escapeHtml(
                                    resource.uptime || "-"
                                )}

                            </div>


                            <div class="mb-2">

                                <b>Total Memory:</b>

                                ${escapeHtml(
                                    resource["total-memory"] || "-"
                                )}

                            </div>


                            <div class="mb-2">

                                <b>Free Memory:</b>

                                ${escapeHtml(
                                    resource["free-memory"] || "-"
                                )}

                            </div>

                        </div>

                    `

                });


            } catch (error) {

                Swal.fire(
                    "Error",
                    error.message,
                    "error"
                );

            }

        }


        /*
        |--------------------------------------------------------------------------
        | DELETE
        |--------------------------------------------------------------------------
        */

        async function deleteRouter(
            id
        ) {

            const confirm =
                await Swal.fire({

                    icon: "warning",

                    title:
                        "Delete Router?",

                    text:
                        "This router will be permanently removed.",

                    showCancelButton:
                        true,

                    confirmButtonText:
                        "Yes, Delete",

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
                    `${API}/${id}`,
                    {
                        method:
                            "DELETE"
                    }
                );


                await loadRouters();


                Swal.fire({

                    icon: "success",

                    title:
                        "Deleted",

                    text:
                        "Router deleted successfully.",

                    timer:
                        1500,

                    showConfirmButton:
                        false

                });

            } catch (error) {

                Swal.fire(
                    "Error",
                    error.message,
                    "error"
                );

            }

        }


        /*
        |--------------------------------------------------------------------------
        | EVENTS
        |--------------------------------------------------------------------------
        */

        if (addButton) {

            addButton.addEventListener(
                "click",
                openAddModal
            );

        }


        tableBody.addEventListener(
            "click",
            event => {

                const edit =
                    event.target.closest(
                        ".btn-edit-router"
                    );


                if (edit) {

                    openEditModal(
                        Number(
                            edit.dataset.id
                        )
                    );

                    return;
                }


                const check =
                    event.target.closest(
                        ".btn-check-router"
                    );


                if (check) {

                    checkRouter(
                        Number(
                            check.dataset.id
                        )
                    );

                    return;
                }


                const history =
                    event.target.closest(
                        ".btn-history-router"
                    );


                if (history) {

                    routerHistory(
                        Number(
                            history.dataset.id
                        )
                    );

                    return;
                }


                const remove =
                    event.target.closest(
                        ".btn-delete-router"
                    );


                if (remove) {

                    deleteRouter(
                        Number(
                            remove.dataset.id
                        )
                    );

                }

            }
        );


        /*
        |--------------------------------------------------------------------------
        | INITIAL LOAD
        |--------------------------------------------------------------------------
        */

        loadRouters();


        /*
        |--------------------------------------------------------------------------
        | AUTO REFRESH
        |--------------------------------------------------------------------------
        */

        setInterval(
            loadRouters,
            30000
        );

    }
);