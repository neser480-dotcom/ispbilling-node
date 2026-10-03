"use strict";

document.addEventListener("DOMContentLoaded", () => {


const searchInput =
    document.getElementById("search");

const fromDateInput =
    document.getElementById("fromDate");

const toDateInput =
    document.getElementById("toDate");

const limitInput =
    document.getElementById("limit");

const filterBtn =
    document.getElementById("filterBtn");

const refreshBtn =
    document.getElementById("refreshBtn");

const csvBtn =
    document.getElementById("csvBtn");

const printBtn =
    document.getElementById("printBtn");

const reportBody =
    document.getElementById("reportBody");

const pagination =
    document.getElementById("pagination");

const totalData =
    document.getElementById("totalData");

const totalBill =
    document.getElementById("totalBill");


let currentPage = 1;


/*
|--------------------------------------------------------------------------
| DATE HELPERS
|--------------------------------------------------------------------------
*/

function pad(value) {

    return String(value).padStart(2, "0");

}


function formatDateInput(date) {

    return (
        date.getFullYear() +
        "-" +
        pad(date.getMonth() + 1) +
        "-" +
        pad(date.getDate())
    );

}


function setCurrentMonth() {

    const now = new Date();

    const firstDay =
        new Date(
            now.getFullYear(),
            now.getMonth(),
            1
        );

    const lastDay =
        new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            0
        );

    if (fromDateInput) {

        fromDateInput.value =
            formatDateInput(firstDay);

    }

    if (toDateInput) {

        toDateInput.value =
            formatDateInput(lastDay);

    }

}


/*
|--------------------------------------------------------------------------
| NUMBER
|--------------------------------------------------------------------------
*/

function number(value) {

    const n =
        Number(value || 0);

    return n.toLocaleString(
        "en-US",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    );

}


/*
|--------------------------------------------------------------------------
| HTML ESCAPE
|--------------------------------------------------------------------------
*/

function escapeHtml(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


/*
|--------------------------------------------------------------------------
| DATE FORMAT
|--------------------------------------------------------------------------
*/

function formatDate(value) {

    if (!value) {
        return "";
    }

    const date =
        new Date(value);

    if (Number.isNaN(date.getTime())) {
        return escapeHtml(value);
    }

    return (
        pad(date.getDate()) +
        "-" +
        pad(date.getMonth() + 1) +
        "-" +
        date.getFullYear()
    );

}


/*
|--------------------------------------------------------------------------
| LOAD REPORT
|--------------------------------------------------------------------------
*/

async function loadReport(page = 1) {

    currentPage = page;

    if (!reportBody) {
        return;
    }

    reportBody.innerHTML = `
        <tr>
            <td colspan="9"
                class="text-center py-4">
                Loading...
            </td>
        </tr>
    `;

    try {

        const params =
            new URLSearchParams();

        const search =
            searchInput?.value.trim() || "";

        const fromDate =
            fromDateInput?.value || "";

        const toDate =
            toDateInput?.value || "";

        const limit =
            limitInput?.value || 100;


        if (search) {

            params.set(
                "search",
                search
            );

        }


        if (fromDate) {

            params.set(
                "from_date",
                fromDate
            );

        }


        if (toDate) {

            params.set(
                "to_date",
                toDate
            );

        }


        params.set(
            "page",
            page
        );


        params.set(
            "limit",
            limit
        );


        const response =
            await fetch(
                `/reports/api/collection?${params.toString()}`,
                {
                    method: "GET",
                    credentials: "same-origin",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );


        /*
        |--------------------------------------------------------------------------
        | RESPONSE JSON
        |--------------------------------------------------------------------------
        */

        let result;

        try {

            result =
                await response.json();

        } catch (jsonError) {

            throw new Error(
                `Server returned invalid JSON (${response.status}).`
            );

        }


        /*
        |--------------------------------------------------------------------------
        | NODE API USES status, NOT success
        |--------------------------------------------------------------------------
        */

        if (
            !response.ok ||
            result.status !== true
        ) {

            throw new Error(
                result.message ||
                `Failed to load report. HTTP ${response.status}`
            );

        }


        /*
        |--------------------------------------------------------------------------
        | SUMMARY
        |--------------------------------------------------------------------------
        */

        if (totalData) {

            totalData.textContent =
                Number(
                    result.summary?.total_data || 0
                ).toLocaleString();

        }


        if (totalBill) {

            totalBill.textContent =
                number(
                    result.summary?.total_bill || 0
                );

        }


        /*
        |--------------------------------------------------------------------------
        | TABLE
        |--------------------------------------------------------------------------
        */

        renderRows(
            result.collections || []
        );


        /*
        |--------------------------------------------------------------------------
        | PAGINATION
        |--------------------------------------------------------------------------
        */

        renderPagination(
            result.pagination
        );


    } catch (error) {

        console.error(
            "Collection report:",
            error
        );

        reportBody.innerHTML = `
            <tr>
                <td colspan="9"
                    class="text-center text-danger py-4">
                    ${escapeHtml(error.message)}
                </td>
            </tr>
        `;

    }

}


/*
|--------------------------------------------------------------------------
| RENDER ROWS
|--------------------------------------------------------------------------
*/

function renderRows(rows) {

    if (!rows || !rows.length) {

        reportBody.innerHTML = `
            <tr>
                <td colspan="9"
                    class="text-center text-muted py-4">
                    No collection found for this period.
                </td>
            </tr>
        `;

        return;
    }


    reportBody.innerHTML =
        rows.map(row => {

            const name =
                escapeHtml(
                    row.customer_name
                );

            const pppoe =
                escapeHtml(
                    row.pppoe_username
                );

            const packageName =
                escapeHtml(
                    row.package_name
                );

            const medium =
                escapeHtml(
                    row.medium
                );

            const billType =
                escapeHtml(
                    row.bill_type
                );

            const collector =
                escapeHtml(
                    row.collected_by
                );

            const note =
                escapeHtml(
                    row.note
                );


            return `
                <tr>

                    <td>
                        ${escapeHtml(row.id)}
                    </td>

                    <td>
                        <div class="fw-semibold">
                            ${name}
                        </div>

                        <div class="text-muted small">
                            ${pppoe}
                        </div>
                    </td>

                    <td>
                        <div>
                            ${packageName}
                        </div>

                        <div class="text-muted small">
                            Bill:
                            ${number(row.bill_amount)}
                        </div>
                    </td>

                    <td>
                        ${number(row.discount)}
                    </td>

                    <td>
                        ${number(row.due_amount)}
                    </td>

                    <td>
                        <div>
                            ${medium}
                        </div>

                        <div class="text-muted small">
                            ${billType}
                        </div>
                    </td>

                    <td class="fw-semibold">
                        ${number(row.collected_amount)}
                    </td>

                    <td>
                        <div>
                            ${note}
                        </div>

                        ${
                            collector
                                ? `
                                <div class="text-muted small">
                                    ${collector}
                                </div>
                                `
                                : ""
                        }
                    </td>

                    <td>
                        ${formatDate(row.created_at)}
                    </td>

                </tr>
            `;

        }).join("");

}


/*
|--------------------------------------------------------------------------
| PAGINATION
|--------------------------------------------------------------------------
*/

function renderPagination(info) {

    if (!pagination) {
        return;
    }

    pagination.innerHTML = "";

    if (!info) {
        return;
    }


    const page =
        Number(
            info.page || 1
        );


    /*
    | API returns totalPages
    | Also support total_pages for compatibility.
    */

    const totalPages =
        Number(
            info.totalPages ||
            info.total_pages ||
            1
        );


    if (totalPages <= 1) {
        return;
    }


    function addButton(
        label,
        targetPage,
        disabled = false
    ) {

        const li =
            document.createElement("li");

        li.className =
            `page-item ${
                disabled
                    ? "disabled"
                    : ""
            }`;


        const button =
            document.createElement("button");

        button.className =
            "page-link";

        button.type =
            "button";

        button.textContent =
            label;


        if (!disabled) {

            button.addEventListener(
                "click",
                () => loadReport(targetPage)
            );

        }


        li.appendChild(button);

        pagination.appendChild(li);

    }


    /*
    | Previous
    */

    addButton(
        "Previous",
        page - 1,
        page <= 1
    );


    /*
    | Page numbers
    */

    let start =
        Math.max(
            1,
            page - 2
        );


    let end =
        Math.min(
            totalPages,
            page + 2
        );


    for (
        let i = start;
        i <= end;
        i++
    ) {

        const li =
            document.createElement("li");

        li.className =
            `page-item ${
                i === page
                    ? "active"
                    : ""
            }`;


        const button =
            document.createElement("button");

        button.type =
            "button";

        button.className =
            "page-link";

        button.textContent =
            i;


        button.addEventListener(
            "click",
            () => loadReport(i)
        );


        li.appendChild(button);

        pagination.appendChild(li);

    }


    /*
    | Next
    */

    addButton(
        "Next",
        page + 1,
        page >= totalPages
    );

}


/*
|--------------------------------------------------------------------------
| FILTER
|--------------------------------------------------------------------------
*/

filterBtn?.addEventListener(
    "click",
    () => {

        currentPage = 1;

        loadReport(1);

    }
);


/*
|--------------------------------------------------------------------------
| REFRESH
|--------------------------------------------------------------------------
*/

refreshBtn?.addEventListener(
    "click",
    () => {

        loadReport(
            currentPage
        );

    }
);


/*
|--------------------------------------------------------------------------
| ENTER SEARCH
|--------------------------------------------------------------------------
*/

searchInput?.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Enter"
        ) {

            loadReport(1);

        }

    }
);


/*
|--------------------------------------------------------------------------
| CSV
|--------------------------------------------------------------------------
*/

csvBtn?.addEventListener(
    "click",
    () => {

        const params =
            new URLSearchParams();


        const search =
            searchInput?.value.trim() || "";


        const fromDate =
            fromDateInput?.value || "";


        const toDate =
            toDateInput?.value || "";


        if (search) {

            params.set(
                "search",
                search
            );

        }


        if (fromDate) {

            params.set(
                "from_date",
                fromDate
            );

        }


        if (toDate) {

            params.set(
                "to_date",
                toDate
            );

        }


        window.location.href =
            `/reports/api/collection/csv?${params.toString()}`;

    }
);


/*
|--------------------------------------------------------------------------
| PRINT
|--------------------------------------------------------------------------
*/

printBtn?.addEventListener(
    "click",
    () => {

        window.print();

    }
);


/*
|--------------------------------------------------------------------------
| INITIAL LOAD
|--------------------------------------------------------------------------
*/

setCurrentMonth();

loadReport(1);

});
