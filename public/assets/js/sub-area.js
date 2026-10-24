
(function () {

    "use strict";


    /*
    |--------------------------------------------------------------------------
    | HTML ESCAPE
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


    /*
    |--------------------------------------------------------------------------
    | API REQUEST
    |--------------------------------------------------------------------------
    */

    async function request(url, options = {}) {

        const response = await fetch(
            url,
            {
                credentials: "same-origin",

                ...options,

                headers: {
                    "Accept": "application/json",
                    ...(options.headers || {})
                }
            }
        );


        const data =
            await response
                .json()
                .catch(function () {

                    return {
                        success: false,
                        message: "Invalid server response."
                    };

                });


        if (!response.ok) {

            throw new Error(
                data.message ||
                `HTTP ${response.status}`
            );

        }


        /*
        |--------------------------------------------------------------------------
        | IMPORTANT
        |--------------------------------------------------------------------------
        | HTTP 200 হলেও success:false হলে error ধরতে হবে।
        */

        if (!data.success) {

            throw new Error(
                data.message ||
                "Request failed."
            );

        }


        return data;

    }


    /*
    |--------------------------------------------------------------------------
    | NOTIFY
    |--------------------------------------------------------------------------
    */

    function notify(
        message,
        success = true
    ) {

        if (
            typeof Swal !== "undefined"
        ) {

            Swal.fire({

                icon:
                    success
                        ? "success"
                        : "error",

                text:
                    message,

                timer: 1800,

                showConfirmButton: false

            });

            return;

        }


        window.alert(message);

    }


    /*
    |--------------------------------------------------------------------------
    | GET AREA ID
    |--------------------------------------------------------------------------
    */

    function getAreaId() {

        /*
        |--------------------------------------------------------------------------
        | FIXED
        |--------------------------------------------------------------------------
        | Correct Node route:
        |
        | /areas/sub/:id
        |--------------------------------------------------------------------------
        */

        const match =
            window.location.pathname.match(
                /\/areas\/sub\/(\d+)/
            );


        return match
            ? Number(match[1])
            : 0;

    }


    /*
    |--------------------------------------------------------------------------
    | LOAD SUB AREAS
    |--------------------------------------------------------------------------
    */

    async function loadSubAreas() {

        const areaId =
            getAreaId();


        const body =
            document.getElementById(
                "subAreaTableBody"
            );


        if (
            !areaId ||
            !body
        ) {

            if (body) {

                body.innerHTML = `
                    <tr>
                        <td
                            colspan="4"
                            class="text-center py-5 text-danger">

                            <i class="fa fa-triangle-exclamation me-1"></i>

                            Invalid Area ID.

                        </td>
                    </tr>
                `;

            }

            return;

        }


        try {

            /*
            |--------------------------------------------------------------------------
            | FIXED
            |--------------------------------------------------------------------------
            | Correct Node route:
            |
            | /areas/sub-data/:id
            |--------------------------------------------------------------------------
            */

            const result =
                await request(
                    `/areas/sub-data/${areaId}`
                );


            /*
            |--------------------------------------------------------------------------
            | AREA NAME
            |--------------------------------------------------------------------------
            */

            const areaName =
                result.area &&
                result.area.name
                    ? result.area.name
                    : "";


            const mainAreaName =
                document.getElementById(
                    "mainAreaName"
                );


            if (mainAreaName) {

                mainAreaName.textContent =
                    areaName;

            }


            const mainAreaBadge =
                document.getElementById(
                    "mainAreaBadge"
                );


            if (mainAreaBadge) {

                mainAreaBadge.textContent =
                    areaName;

            }


            const subMainAreaReadonly =
                document.getElementById(
                    "subMainAreaReadonly"
                );


            if (subMainAreaReadonly) {

                subMainAreaReadonly.value =
                    areaName;

            }


            /*
            |--------------------------------------------------------------------------
            | DATA
            |--------------------------------------------------------------------------
            */

            const rows =
                Array.isArray(result.data)
                    ? result.data
                    : [];


            const totalSubAreaCount =
                document.getElementById(
                    "totalSubAreaCount"
                );


            if (totalSubAreaCount) {

                totalSubAreaCount.textContent =
                    rows.length;

            }


            /*
            |--------------------------------------------------------------------------
            | EMPTY
            |--------------------------------------------------------------------------
            */

            if (!rows.length) {

                body.innerHTML = `

                    <tr>

                        <td
                            colspan="4"
                            class="text-center py-5 text-muted">

                            <i
                                class="fa fa-map-marker fa-2x mb-2 d-block text-secondary">
                            </i>

                            No Sub Area Found

                        </td>

                    </tr>

                `;

                return;

            }


            /*
            |--------------------------------------------------------------------------
            | ROWS
            |--------------------------------------------------------------------------
            */

            body.innerHTML =
                rows
                    .map(
                        function (row, index) {

                            return `

                                <tr>

                                    <td>
                                        ${index + 1}
                                    </td>


                                    <td
                                        class="sub-area-name">

                                        <i
                                            class="fa fa-map-marker text-success me-2">
                                        </i>

                                        ${esc(row.name)}

                                    </td>


                                    <td>

                                        ${esc(row.remarks)}

                                    </td>


                                    <td
                                        class="text-muted small">

                                        ${esc(row.created_at)}

                                    </td>

                                </tr>

                            `;

                        }
                    )
                    .join("");


        } catch (error) {

            console.error(
                "Sub Area Load Error:",
                error
            );


            body.innerHTML = `

                <tr>

                    <td
                        colspan="4"
                        class="text-center py-5 text-danger">

                        <i
                            class="fa fa-triangle-exclamation me-1">
                        </i>

                        ${esc(
                            error.message ||
                            "Failed to load Sub Area."
                        )}

                    </td>

                </tr>

            `;


            const totalSubAreaCount =
                document.getElementById(
                    "totalSubAreaCount"
                );


            if (totalSubAreaCount) {

                totalSubAreaCount.textContent =
                    "0";

            }

        }

    }


    /*
    |--------------------------------------------------------------------------
    | ADD SUB AREA
    |--------------------------------------------------------------------------
    */

    function initAddSubArea() {

        const form =
            document.getElementById(
                "addSubAreaForm"
            );


        if (!form) {
            return;
        }


        form.addEventListener(
            "submit",
            async function (event) {

                event.preventDefault();


                const areaId =
                    getAreaId();


                if (!areaId) {

                    notify(
                        "Invalid Area.",
                        false
                    );

                    return;

                }


                const submitButton =
                    form.querySelector(
                        'button[type="submit"]'
                    );


                const oldButtonHtml =
                    submitButton
                        ? submitButton.innerHTML
                        : "";


                if (submitButton) {

                    submitButton.disabled =
                        true;

                    submitButton.innerHTML = `

                        <i
                            class="fa fa-spinner fa-spin me-1">
                        </i>

                        Saving...

                    `;

                }


                try {

                    const body =
                        new URLSearchParams(
                            new FormData(form)
                        );


                    body.set(
                        "area_id",
                        String(areaId)
                    );


                    /*
                    |--------------------------------------------------------------------------
                    | FIXED
                    |--------------------------------------------------------------------------
                    | Correct Node route:
                    |
                    | /areas/sub-add
                    |--------------------------------------------------------------------------
                    */

                    const result =
                        await request(
                            "/areas/sub-add",
                            {
                                method: "POST",

                                headers: {
                                    "Content-Type":
                                        "application/x-www-form-urlencoded;charset=UTF-8"
                                },

                                body:
                                    body.toString()
                            }
                        );


                    /*
                    |--------------------------------------------------------------------------
                    | SUCCESS
                    |--------------------------------------------------------------------------
                    */

                    notify(
                        result.message ||
                        "Sub Area Added Successfully",
                        true
                    );


                    const modalElement =
                        document.getElementById(
                            "addSubAreaModal"
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


                    /*
                    |--------------------------------------------------------------------------
                    | RESET ONLY FORM INPUTS
                    |--------------------------------------------------------------------------
                    */

                    form.reset();


                    /*
                    |--------------------------------------------------------------------------
                    | KEEP MAIN AREA FIELD
                    |--------------------------------------------------------------------------
                    */

                    const mainAreaName =
                        document.getElementById(
                            "mainAreaName"
                        );


                    const subMainAreaReadonly =
                        document.getElementById(
                            "subMainAreaReadonly"
                        );


                    if (
                        mainAreaName &&
                        subMainAreaReadonly
                    ) {

                        subMainAreaReadonly.value =
                            mainAreaName.textContent.trim();

                    }


                    /*
                    |--------------------------------------------------------------------------
                    | RELOAD
                    |--------------------------------------------------------------------------
                    */

                    await loadSubAreas();


                } catch (error) {

                    console.error(
                        "Add Sub Area Error:",
                        error
                    );


                    notify(
                        error.message ||
                        "Failed to add Sub Area.",
                        false
                    );


                } finally {

                    if (submitButton) {

                        submitButton.disabled =
                            false;

                        submitButton.innerHTML =
                            oldButtonHtml;

                    }

                }

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | INITIALIZE
    |--------------------------------------------------------------------------
    */

    function init() {

        initAddSubArea();

        loadSubAreas();

    }


    /*
    |--------------------------------------------------------------------------
    | DOM READY
    |--------------------------------------------------------------------------
    */

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            init,
            {
                once: true
            }
        );

    } else {

        init();

    }

})();
