document.addEventListener("DOMContentLoaded", function () {

    "use strict";


    /*
    |--------------------------------------------------------------------------
    | ELEMENTS
    |--------------------------------------------------------------------------
    */

    const areaTableBody =
        document.getElementById("areaTableBody");

    const areaSearch =
        document.getElementById("areaSearch");

    const totalAreaCount =
        document.getElementById("totalAreaCount");

    const reloadArea =
        document.getElementById("reloadArea");

    const addAreaForm =
        document.getElementById("addAreaForm");

    const areaCompany =
        document.getElementById("areaCompany");

    const companyFieldWrap =
        document.getElementById("companyFieldWrap");

    const areaModals =
        document.getElementById("areaModals");


    if (!areaTableBody) {
        return;
    }


    /*
    |--------------------------------------------------------------------------
    | API
    |--------------------------------------------------------------------------
    */

    const AREA_DATA_URL =
        "/areas/data";

    const AREA_ACTION_URL =
        "/areas/action";


    /*
    |--------------------------------------------------------------------------
    | STATE
    |--------------------------------------------------------------------------
    */

    let isSuperAdmin = false;

    let companies = [];


    /*
    |--------------------------------------------------------------------------
    | HTML ESCAPE
    |--------------------------------------------------------------------------
    */

    function escapeHtml(value) {

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

    }


    /*
    |--------------------------------------------------------------------------
    | SHOW MESSAGE
    |--------------------------------------------------------------------------
    */

    function showMessage(message, type = "info") {

        if (
            typeof Swal !== "undefined"
        ) {

            Swal.fire({
                icon: type,
                text: message,
                confirmButtonText: "OK"
            });

            return;
        }


        window.alert(message);

    }


    /*
    |--------------------------------------------------------------------------
    | CONFIRM
    |--------------------------------------------------------------------------
    */

    async function confirmAction(
        title,
        text
    ) {

        if (
            typeof Swal !== "undefined"
        ) {

            const result =
                await Swal.fire({

                    icon: "warning",

                    title: title,

                    text: text,

                    showCancelButton: true,

                    confirmButtonText: "Yes",

                    cancelButtonText: "Cancel"

                });

            return result.isConfirmed;
        }


        return window.confirm(
            text || title
        );

    }


    /*
    |--------------------------------------------------------------------------
    | PARSE RESPONSE
    |--------------------------------------------------------------------------
    */

    async function parseResponse(response) {

        const text =
            await response.text();


        let result;

        try {

            result =
                JSON.parse(text);

        } catch (error) {

            console.error(
                "Area API invalid JSON:",
                text
            );

            throw new Error(
                "Invalid server response."
            );

        }


        if (
            !response.ok ||
            !result.success
        ) {

            throw new Error(
                result.message ||
                "Request failed."
            );

        }


        return result;

    }


    /*
    |--------------------------------------------------------------------------
    | LOAD AREA
    |--------------------------------------------------------------------------
    */

    async function loadArea(search = "") {

        areaTableBody.innerHTML = `
            <tr>
                <td
                    colspan="${isSuperAdmin ? 7 : 6}"
                    class="text-center py-5 text-muted"
                >
                    <i
                        class="fa fa-spinner fa-spin fa-2x mb-2 d-block"
                    ></i>

                    Loading...
                </td>
            </tr>
        `;


        try {

            const url =
                AREA_DATA_URL +
                "?search=" +
                encodeURIComponent(search);


            const response =
                await fetch(
                    url,
                    {
                        method: "GET",
                        credentials: "same-origin",
                        cache: "no-store"
                    }
                );


            const result =
                await parseResponse(
                    response
                );


            /*
            |--------------------------------------------------------------------------
            | SUPER ADMIN
            |--------------------------------------------------------------------------
            */

            if (
                typeof result.isSuperAdmin !==
                "undefined"
            ) {

                isSuperAdmin =
                    Boolean(
                        result.isSuperAdmin
                    );

            }


            companies =
                Array.isArray(
                    result.companies
                )
                    ? result.companies
                    : [];


            updateCompanyField();


            renderAreas(
                Array.isArray(
                    result.data
                )
                    ? result.data
                    : []
            );


        } catch (error) {

            console.error(
                "Area Load Error:",
                error
            );


            areaTableBody.innerHTML = `
                <tr>
                    <td
                        colspan="${isSuperAdmin ? 7 : 6}"
                        class="text-center py-5 text-danger"
                    >
                        <i class="fa fa-triangle-exclamation me-2"></i>
                        ${escapeHtml(error.message)}
                    </td>
                </tr>
            `;


            if (totalAreaCount) {

                totalAreaCount.textContent =
                    "0";

            }

        }

    }


    /*
    |--------------------------------------------------------------------------
    | COMPANY FIELD
    |--------------------------------------------------------------------------
    */

    function updateCompanyField() {

        if (
            !companyFieldWrap ||
            !areaCompany
        ) {
            return;
        }


        if (!isSuperAdmin) {

            companyFieldWrap.style.display =
                "none";

            areaCompany.innerHTML =
                '<option value="">Select Company</option>';

            return;
        }


        companyFieldWrap.style.display =
            "";


        let html =
            '<option value="">Select Company</option>';


        companies.forEach(
            function (company) {

                html += `
                    <option value="${Number(company.id)}">
                        ${escapeHtml(company.name)}
                    </option>
                `;

            }
        );


        areaCompany.innerHTML =
            html;

    }


    /*
    |--------------------------------------------------------------------------
    | RENDER AREAS
    |--------------------------------------------------------------------------
    */

    function renderAreas(areas) {

        if (totalAreaCount) {

            totalAreaCount.textContent =
                areas.length;

        }


        if (!areas.length) {

            areaTableBody.innerHTML = `
                <tr>
                    <td
                        colspan="${isSuperAdmin ? 7 : 6}"
                        class="text-center py-5 text-muted"
                    >
                        <i
                            class="fa fa-map-marker-alt fa-2x mb-2 d-block"
                        ></i>

                        No Area Found
                    </td>
                </tr>
            `;

            return;
        }


        let html = "";


        areas.forEach(
            function (area, index) {

                const isMikroTik =
                    area.mikrotik_id !== null &&
                    area.mikrotik_id !== "";


                const rowClass =
                    isMikroTik
                        ? "mikrotik-area"
                        : "manual-area";


                const typeBadge =
                    isMikroTik
                        ? `
                            <span class="badge bg-info text-dark area-type-badge">
                                MikroTik
                            </span>
                        `
                        : `
                            <span class="badge bg-secondary area-type-badge">
                                Manual
                            </span>
                        `;


                let companyHtml = "";


                if (isSuperAdmin) {

                    const company =
                        companies.find(
                            function (item) {

                                return Number(item.id) ===
                                    Number(area.company_id);

                            }
                        );


                    const companyName =
                        company
                            ? company.name
                            : "Company #" +
                              Number(area.company_id);


                    companyHtml = `
                        <td class="company-column">
                            ${escapeHtml(companyName)}
                        </td>
                    `;

                }


                const areaId =
                    Number(area.id);


                const areaName =
                    escapeHtml(area.name);


                const rawName =
                    String(area.name || "");


                const remarks =
                    escapeHtml(
                        area.remarks || ""
                    );


                const subCount =
                    Number(
                        area.sub_area_count || 0
                    );


                let actionHtml = "";


                /*
                |--------------------------------------------------------------------------
                | MIKROTIK AREA
                |--------------------------------------------------------------------------
                */

                if (isMikroTik) {

                    actionHtml = `
                        <span
                            class="badge bg-light text-primary border"
                        >
                            <i class="fa fa-lock me-1"></i>
                            MikroTik Managed
                        </span>
                    `;

                } else {


                    /*
                    |--------------------------------------------------------------------------
                    | MANUAL AREA ACTIONS
                    |--------------------------------------------------------------------------
                    */

                    actionHtml = `
                        <div class="dropdown">

                            <button
                                type="button"
                                class="btn btn-sm btn-link text-primary"
                                data-bs-toggle="dropdown"
                                aria-expanded="false"
                                title="Actions"
                            >
                                <i class="fa fa-ellipsis-v"></i>
                            </button>


                            <ul class="dropdown-menu dropdown-menu-end">

                                <li>

                                    <button
                                        type="button"
                                        class="dropdown-item edit-area-btn"
                                        data-id="${areaId}"
                                        data-name="${escapeHtml(rawName)}"
                                        data-remarks="${escapeHtml(area.remarks || "")}"
                                    >

                                        <i
                                            class="fa fa-edit me-2 text-primary"
                                        ></i>

                                        Edit

                                    </button>

                                </li>


                                <li>

                                    <hr class="dropdown-divider">

                                </li>


                                <li>

                                    <button
                                        type="button"
                                        class="dropdown-item text-danger delete-area-btn"
                                        data-id="${areaId}"
                                        data-name="${escapeHtml(rawName)}"
                                    >

                                        <i
                                            class="fa fa-trash me-2"
                                        ></i>

                                        Delete

                                    </button>

                                </li>


                            </ul>

                        </div>
                    `;

                }


                html += `
                    <tr class="${rowClass}">

                        <td>
                            ${index + 1}
                        </td>


                        <td>

                            <div class="fw-semibold">

                                <i
                                    class="${
                                        isMikroTik
                                            ? "fa fa-server"
                                            : "fa fa-map-marker-alt"
                                    } me-2 text-primary"
                                ></i>

                                ${areaName}

                            </div>

                        </td>


                        ${companyHtml}


                        <td>
                            ${typeBadge}
                        </td>


                        <td>

                            <a
                                href="/areas/sub/${areaId}"
                                class="btn btn-sm btn-outline-primary"
                            >

                                <i
                                    class="fa fa-location-dot me-1"
                                ></i>

                                Sub Area ${subCount}

                            </a>

                        </td>


                        <td>
                            ${remarks}
                        </td>


                        <td class="text-end pe-4">

                            ${actionHtml}

                        </td>


                    </tr>
                `;

            }
        );


        areaTableBody.innerHTML =
            html;

    }


    /*
    |--------------------------------------------------------------------------
    | EDIT MODAL
    |--------------------------------------------------------------------------
    */

    function openEditModal(
        id,
        name,
        remarks
    ) {

        if (!areaModals) {

            console.error(
                "areaModals container not found."
            );

            return;

        }


        const modalId =
            "editAreaModal";


        areaModals.innerHTML = `

            <div
                class="modal fade"
                id="${modalId}"
                tabindex="-1"
                aria-hidden="true"
            >

                <div
                    class="modal-dialog modal-dialog-centered"
                >

                    <div
                        class="modal-content border-0 shadow"
                    >

                        <form id="editAreaForm">

                            <div
                                class="modal-header bg-primary text-white"
                            >

                                <h5
                                    class="modal-title fw-bold"
                                >

                                    <i
                                        class="fa fa-edit me-2"
                                    ></i>

                                    Edit Area

                                </h5>


                                <button
                                    type="button"
                                    class="btn-close btn-close-white"
                                    data-bs-dismiss="modal"
                                ></button>

                            </div>


                            <div class="modal-body">

                                <input
                                    type="hidden"
                                    name="id"
                                    id="editAreaId"
                                    value="${Number(id)}"
                                >


                                <div class="mb-3">

                                    <label
                                        class="form-label fw-semibold"
                                    >

                                        Area Name

                                        <span class="text-danger">
                                            *
                                        </span>

                                    </label>


                                    <input
                                        type="text"
                                        name="name"
                                        id="editAreaName"
                                        class="form-control"
                                        value="${escapeHtml(name)}"
                                        required
                                        autocomplete="off"
                                    >

                                </div>


                                <div class="mb-3">

                                    <label
                                        class="form-label fw-semibold"
                                    >

                                        Remarks

                                    </label>


                                    <textarea
                                        name="remarks"
                                        id="editAreaRemarks"
                                        rows="4"
                                        class="form-control"
                                    >${escapeHtml(remarks)}</textarea>

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
                                    class="btn btn-primary"
                                >

                                    <i
                                        class="fa fa-save me-1"
                                    ></i>

                                    Update Area

                                </button>

                            </div>


                        </form>

                    </div>

                </div>

            </div>

        `;


        const modalElement =
            document.getElementById(
                modalId
            );


        if (
            !modalElement ||
            typeof bootstrap ===
                "undefined"
        ) {

            console.error(
                "Bootstrap modal unavailable."
            );

            return;

        }


        const modal =
            bootstrap.Modal.getOrCreateInstance(
                modalElement
            );


        modal.show();


        const form =
            document.getElementById(
                "editAreaForm"
            );


        if (!form) {
            return;
        }


        form.addEventListener(
            "submit",
            async function (event) {

                event.preventDefault();


                const submitButton =
                    form.querySelector(
                        'button[type="submit"]'
                    );


                if (submitButton) {

                    submitButton.disabled =
                        true;

                    submitButton.innerHTML =
                        `
                            <i class="fa fa-spinner fa-spin me-1"></i>
                            Updating...
                        `;

                }


                /*
                |--------------------------------------------------------------------------
                | URL ENCODED DATA
                |--------------------------------------------------------------------------
                |
                | express.urlencoded() in app.js can parse this.
                |
                */

                const formData =
                    new URLSearchParams(
                        new FormData(form)
                    );


                formData.set(
                    "action",
                    "update"
                );


                try {

                    const response =
                        await fetch(
                            AREA_ACTION_URL,
                            {
                                method: "POST",
                                credentials: "same-origin",
                                headers: {
                                    "Content-Type":
                                        "application/x-www-form-urlencoded; charset=UTF-8"
                                },
                                body: formData.toString()
                            }
                        );


                    const result =
                        await parseResponse(
                            response
                        );


                    modal.hide();


                    showMessage(
                        result.message ||
                        "Area Updated Successfully",
                        "success"
                    );


                    await loadArea(
                        areaSearch
                            ? areaSearch.value
                            : ""
                    );


                } catch (error) {

                    console.error(
                        "Update Area Error:",
                        error
                    );


                    showMessage(
                        error.message ||
                        "Area update failed.",
                        "error"
                    );


                } finally {

                    if (submitButton) {

                        submitButton.disabled =
                            false;

                        submitButton.innerHTML =
                            `
                                <i class="fa fa-save me-1"></i>
                                Update Area
                            `;

                    }

                }

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | EDIT AREA CLICK
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "click",
        function (event) {

            const button =
                event.target.closest(
                    ".edit-area-btn"
                );


            if (!button) {
                return;
            }


            event.preventDefault();


            const id =
                Number(
                    button.dataset.id || 0
                );


            const name =
                button.dataset.name || "";


            const remarks =
                button.dataset.remarks || "";


            if (id <= 0) {

                showMessage(
                    "Invalid Area ID.",
                    "error"
                );

                return;

            }


            openEditModal(
                id,
                name,
                remarks
            );

        }
    );


    /*
    |--------------------------------------------------------------------------
    | DELETE AREA
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        "click",
        async function (event) {

            const button =
                event.target.closest(
                    ".delete-area-btn"
                );


            if (!button) {
                return;
            }


            event.preventDefault();


            const id =
                Number(
                    button.dataset.id || 0
                );


            const name =
                button.dataset.name || "";


            if (id <= 0) {

                showMessage(
                    "Invalid Area ID.",
                    "error"
                );

                return;

            }


            const confirmed =
                await confirmAction(
                    "Delete Area?",
                    `Are you sure you want to delete "${name}"?`
                );


            if (!confirmed) {
                return;
            }


            button.disabled =
                true;


            const oldHtml =
                button.innerHTML;


            button.innerHTML =
                `
                    <i class="fa fa-spinner fa-spin me-2"></i>
                    Deleting...
                `;


            /*
            |--------------------------------------------------------------------------
            | URL ENCODED DELETE DATA
            |--------------------------------------------------------------------------
            */

            const formData =
                new URLSearchParams();


            formData.append(
                "action",
                "delete"
            );


            formData.append(
                "id",
                String(id)
            );


            try {

                const response =
                    await fetch(
                        AREA_ACTION_URL,
                        {
                            method: "POST",
                            credentials: "same-origin",
                            headers: {
                                "Content-Type":
                                    "application/x-www-form-urlencoded; charset=UTF-8"
                            },
                            body: formData.toString()
                        }
                    );


                const result =
                    await parseResponse(
                        response
                    );


                showMessage(
                    result.message ||
                    "Area Deleted Successfully",
                    "success"
                );


                await loadArea(
                    areaSearch
                        ? areaSearch.value
                        : ""
                );


            } catch (error) {

                console.error(
                    "Delete Area Error:",
                    error
                );


                showMessage(
                    error.message ||
                    "Area delete failed.",
                    "error"
                );


                button.disabled =
                    false;

                button.innerHTML =
                    oldHtml;

            }

        }
    );


    /*
    |--------------------------------------------------------------------------
    | ADD AREA
    |--------------------------------------------------------------------------
    */

    if (addAreaForm) {

        addAreaForm.addEventListener(
            "submit",
            async function (event) {

                event.preventDefault();


                const submitButton =
                    addAreaForm.querySelector(
                        'button[type="submit"]'
                    );


                if (submitButton) {

                    submitButton.disabled =
                        true;

                    submitButton.innerHTML =
                        `
                            <i class="fa fa-spinner fa-spin me-1"></i>
                            Saving...
                        `;

                }


                /*
                |--------------------------------------------------------------------------
                | URL ENCODED ADD DATA
                |--------------------------------------------------------------------------
                |
                | Convert the existing form fields directly.
                | No hard-coded input IDs required.
                |
                */

                const formData =
                    new URLSearchParams(
                        new FormData(addAreaForm)
                    );


                formData.set(
                    "action",
                    "add"
                );


                try {

                    const response =
                        await fetch(
                            AREA_ACTION_URL,
                            {
                                method: "POST",
                                credentials: "same-origin",
                                headers: {
                                    "Content-Type":
                                        "application/x-www-form-urlencoded; charset=UTF-8"
                                },
                                body: formData.toString()
                            }
                        );


                    const result =
                        await parseResponse(
                            response
                        );


                    const modalElement =
                        document.getElementById(
                            "addAreaModal"
                        );


                    if (
                        modalElement &&
                        typeof bootstrap !==
                            "undefined"
                    ) {

                        const modal =
                            bootstrap.Modal
                                .getOrCreateInstance(
                                    modalElement
                                );

                        modal.hide();

                    }


                    addAreaForm.reset();


                    showMessage(
                        result.message ||
                        "Area Added Successfully",
                        "success"
                    );


                    await loadArea(
                        areaSearch
                            ? areaSearch.value
                            : ""
                    );


                } catch (error) {

                    console.error(
                        "Add Area Error:",
                        error
                    );


                    showMessage(
                        error.message ||
                        "Area add failed.",
                        "error"
                    );


                } finally {

                    if (submitButton) {

                        submitButton.disabled =
                            false;

                        submitButton.innerHTML =
                            `
                                <i class="fa fa-save me-1"></i>
                                Save Area
                            `;

                    }

                }

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | SEARCH
    |--------------------------------------------------------------------------
    */

    if (areaSearch) {

        let searchTimer =
            null;


        areaSearch.addEventListener(
            "input",
            function () {

                clearTimeout(
                    searchTimer
                );


                const value =
                    this.value.trim();


                searchTimer =
                    setTimeout(
                        function () {

                            loadArea(
                                value
                            );

                        },
                        200
                    );

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | RELOAD
    |--------------------------------------------------------------------------
    */

    if (reloadArea) {

        reloadArea.addEventListener(
            "click",
            function () {

                loadArea(
                    areaSearch
                        ? areaSearch.value
                        : ""
                );

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | LOCATION BUTTON
    |--------------------------------------------------------------------------
    */

    const locationArea =
        document.getElementById(
            "locationArea"
        );


    if (locationArea) {

        locationArea.addEventListener(
            "click",
            function () {

                window.location.href =
                    "/areas";

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | TUTORIAL BUTTON
    |--------------------------------------------------------------------------
    */

    const tutorialArea =
        document.getElementById(
            "tutorialArea"
        );


    if (tutorialArea) {

        tutorialArea.addEventListener(
            "click",
            function () {

                showMessage(
                    "Area Tutorial",
                    "info"
                );

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | INITIAL LOAD
    |--------------------------------------------------------------------------
    */

    loadArea();

});