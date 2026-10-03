"use strict";

document.addEventListener("DOMContentLoaded", () => {

    const body =
        document.getElementById("reportBody");

    const search =
        document.getElementById("search");

    const fromDate =
        document.getElementById("fromDate");

    const toDate =
        document.getElementById("toDate");

    const limit =
        document.getElementById("limit");

    const totalData =
        document.getElementById("totalData");

    const totalAmount =
        document.getElementById("totalAmount");

    const pagination =
        document.getElementById("pagination");

    const notice =
        document.getElementById("reportNotice");


    let currentPage = 1;


    function esc(value) {

        return String(
            value ?? ""
        )
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }


    function money(value) {

        return Number(
            value || 0
        ).toLocaleString(
            "en-US",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        );
    }


    function formatDate(value) {

        if (!value) {
            return "";
        }

        const d =
            new Date(value);

        if (
            Number.isNaN(
                d.getTime()
            )
        ) {
            return esc(value);
        }

        return d.toLocaleDateString(
            "en-GB"
        ) + " " +
        d.toLocaleTimeString(
            "en-US",
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );
    }


    async function load(page = 1) {

        currentPage = page;

        notice.style.display =
            "none";

        body.innerHTML = `
            <tr>
                <td colspan="6" class="loading">
                    Loading...
                </td>
            </tr>
        `;


        const params =
            new URLSearchParams();


        params.set(
            "page",
            page
        );

        params.set(
            "limit",
            limit.value
        );


        if (search.value.trim()) {

            params.set(
                "search",
                search.value.trim()
            );
        }


        if (fromDate.value) {

            params.set(
                "from_date",
                fromDate.value
            );
        }


        if (toDate.value) {

            params.set(
                "to_date",
                toDate.value
            );
        }


        try {

            const response =
                await fetch(
                    `/reports/api/deposit?${params.toString()}`,
                    {
                        credentials:
                            "same-origin"
                    }
                );


            const data =
                await response.json();


            if (!response.ok || !data.status) {

                throw new Error(
                    data.message ||
                    "Unable to load deposit report."
                );
            }


            totalData.textContent =
                Number(
                    data.summary?.total_data || 0
                ).toLocaleString();


            totalAmount.textContent =
                money(
                    data.summary?.total_amount
                );


            if (
                data.available === false
            ) {

                notice.textContent =
                    data.message ||
                    "Deposit table was not found.";

                notice.style.display =
                    "block";
            }


            const rows =
                data.deposits || [];


            if (!rows.length) {

                body.innerHTML = `
                    <tr>
                        <td colspan="6" class="empty">
                            No deposit data found.
                        </td>
                    </tr>
                `;

                renderPagination(
                    data.pagination
                );

                return;
            }


            body.innerHTML =
                rows.map(row => {

                    return `
                        <tr>

                            <td>
                                <strong>
                                    ${esc(
                                        row.id || "-"
                                    )}
                                </strong>
                            </td>

                            <td class="amount">
                                ${money(
                                    row.amount
                                )}
                            </td>

                            <td>

                                ${
                                    row.payment_method
                                    ? `
                                        <span class="badge">
                                            ${esc(
                                                row.payment_method
                                            )}
                                        </span>
                                    `
                                    : "-"
                                }

                            </td>

                            <td>
                                ${esc(
                                    row.created_by || "-"
                                )}
                            </td>

                            <td class="note">
                                ${esc(
                                    row.note || ""
                                )}
                            </td>

                            <td>
                                ${formatDate(
                                    row.deposit_date
                                )}
                            </td>

                        </tr>
                    `;

                }).join("");


            renderPagination(
                data.pagination
            );

        } catch (error) {

            console.error(error);

            body.innerHTML = `
                <tr>
                    <td colspan="6" class="error">
                        ${esc(error.message)}
                    </td>
                </tr>
            `;
        }
    }


    function renderPagination(info) {

        pagination.innerHTML = "";

        if (!info || info.totalPages <= 1) {
            return;
        }


        const totalPages =
            Number(info.totalPages);


        const start =
            Math.max(
                1,
                currentPage - 2
            );

        const end =
            Math.min(
                totalPages,
                currentPage + 2
            );


        if (currentPage > 1) {

            addButton(
                "‹",
                currentPage - 1
            );
        }


        for (
            let i = start;
            i <= end;
            i++
        ) {

            addButton(
                String(i),
                i,
                i === currentPage
            );
        }


        if (
            currentPage <
            totalPages
        ) {

            addButton(
                "›",
                currentPage + 1
            );
        }
    }


    function addButton(
        text,
        page,
        active = false
    ) {

        const button =
            document.createElement(
                "button"
            );

        button.type =
            "button";

        button.className =
            "page-btn" +
            (
                active
                    ? " active"
                    : ""
            );

        button.textContent =
            text;

        button.addEventListener(
            "click",
            () => load(page)
        );

        pagination.appendChild(
            button
        );
    }


    document
        .getElementById("filterBtn")
        .addEventListener(
            "click",
            () => load(1)
        );


    document
        .getElementById("refreshBtn")
        .addEventListener(
            "click",
            () => {

                search.value = "";
                fromDate.value = "";
                toDate.value = "";

                load(1);
            }
        );


    document
        .getElementById("printBtn")
        .addEventListener(
            "click",
            () => window.print()
        );


    let searchTimer;

    search.addEventListener(
        "input",
        () => {

            clearTimeout(
                searchTimer
            );

            searchTimer =
                setTimeout(
                    () => load(1),
                    600
                );
        }
    );


    load(1);

});