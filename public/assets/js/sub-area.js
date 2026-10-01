(function () {

    "use strict";


    function esc(value) {

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    async function request(
        url,
        options = {}
    ) {

        const response =
            await fetch(
                url,
                {
                    credentials: "same-origin",

                    ...options,

                    headers: {
                        "Accept":
                            "application/json",

                        ...(options.headers || {})
                    }
                }
            );


        const data =
            await response
                .json()
                .catch(
                    () => ({
                        success: false,
                        message:
                            "Invalid server response."
                    })
                );


        if (!response.ok) {

            throw new Error(
                data.message ||
                `HTTP ${response.status}`
            );
        }


        return data;
    }


    function notify(
        message,
        success = true
    ) {

        if (
            typeof Swal !==
            "undefined"
        ) {

            Swal.fire({

                icon:
                    success
                        ? "success"
                        : "error",

                text:
                    message,

                timer: 1800,

                showConfirmButton:
                    false

            });

            return;
        }


        alert(message);
    }


    /*
    |--------------------------------------------------------------------------
    | GET AREA ID
    |--------------------------------------------------------------------------
    */

    function getAreaId() {

        const match =
            window.location.pathname.match(
                /\/area\/sub\/(\d+)/
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
            return;
        }


        try {

            const result =
                await request(
                    `/area/sub-data/${areaId}`
                );


            document.getElementById(
                "mainAreaName"
            ).textContent =
                result.area.name;


            document.getElementById(
                "mainAreaBadge"
            ).textContent =
                result.area.name;


            document.getElementById(
                "subMainAreaReadonly"
            ).value =
                result.area.name;


            document.getElementById(
                "totalSubAreaCount"
            ).textContent =
                result.data.length;


            /*
            |--------------------------------------------------------------------------
            | EMPTY
            |--------------------------------------------------------------------------
            */

            if (
                result.data.length === 0
            ) {

                body.innerHTML = `

                    <tr>

                        <td
                            colspan="4"
                            class="text-center py-5 text-muted">

                            <i
                                class="fa fa-map-marker fa-2x mb-2 d-block text-light">
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
                result.data
                    .map(
                        (row, index) => `

                            <tr>


                                <td>
                                    ${index + 1}
                                </td>


                                <td
                                    class="sub-area-name">


                                    <i
                                        class="fa fa-map-marker text-success me-2">
                                    </i>


                                    ${esc(
                                        row.name
                                    )}

                                </td>


                                <td>

                                    ${esc(
                                        row.remarks
                                    )}

                                </td>


                                <td
                                    class="text-muted small">

                                    ${esc(
                                        row.created_at
                                    )}

                                </td>


                            </tr>

                        `
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
        }
    }


    /*
    |--------------------------------------------------------------------------
    | INIT
    |--------------------------------------------------------------------------
    */

    function init() {

        const form =
            document.getElementById(
                "addSubAreaForm"
            );


        if (form) {

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


                    try {

                        const body =
                            new URLSearchParams(
                                new FormData(form)
                            );


                        body.set(
                            "area_id",
                            areaId
                        );


                        const result =
                            await request(
                                "/area/sub-add",
                                {
                                    method:
                                        "POST",

                                    headers: {
                                        "Content-Type":
                                            "application/x-www-form-urlencoded;charset=UTF-8"
                                    },

                                    body:
                                        body
                                }
                            );


                        notify(
                            result.message,
                            true
                        );


                        const modalElement =
                            document.getElementById(
                                "addSubAreaModal"
                            );


                        const modal =
                            bootstrap.Modal
                                .getInstance(
                                    modalElement
                                );


                        if (modal) {
                            modal.hide();
                        }


                        form.reset();


                        await loadSubAreas();

                    } catch (error) {

                        notify(
                            error.message,
                            false
                        );
                    }

                }
            );
        }


        loadSubAreas();
    }


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