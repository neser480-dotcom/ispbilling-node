"use strict";

document.addEventListener("DOMContentLoaded", () => {

    const body =
        document.getElementById("reportBody");

    const search =
        document.getElementById("search");

    const reseller =
        document.getElementById("reseller");

    const fromDate =
        document.getElementById("fromDate");

    const toDate =
        document.getElementById("toDate");

    const limit =
        document.getElementById("limit");

    const totalData =
        document.getElementById("totalData");

    const totalBill =
        document.getElementById("totalBill");

    const pagination =
        document.getElementById("pagination");


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


    async function loadResellers() {

        try {

            const response =
                await fetch(
                    "/reports/api/resellers",
                    {
                        credentials:
                            "same-origin"
                    }
                );


            const data =
                await response.json();


            if (!data.status) {
                return;
            }


            reseller.innerHTML = `
                <option value="">
                    All Resellers
                </option>
            `;


            (
                data.resellers || []
            ).forEach(item => {

                const option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    item.reseller_id;

                option.textContent =
                    item.reseller_name
                        ? `${item.reseller_name} (#${item.reseller_id})`
                        : `Reseller #${item.reseller_id}`;

                reseller.appendChild(
                    option
                );
            });

        } catch (error) {

            console.error(
                "Reseller loading error:",
                error
            );
        }
    }


    async function load(page = 1) {

        currentPage = page;

        body.innerHTML = `
            <tr>
                <td colspan="10" class="loading">
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


        if (reseller.value) {

            params.set(
                "reseller_id",
                reseller.value
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
                    `/reports/api/reseller-collection?${params.toString()}`,
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
                    "Unable to load report."
                );
            }


            totalData.textContent =
                Number(
                    data.summary?.total_data || 0
                ).toLocaleString();


            totalBill.textContent =
                money(
                    data.summary?.total_bill
                );


            const rows =
                data.collections || [];


            if (!rows.length) {

                body.innerHTML = `
                    <tr>
                        <td colspan="10" class="empty">
                            No reseller collection data found.
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

                    const info =
                        row.name_info || {};

                    const pkg =
                        row.package_bill || {};

                    const medium =
                        row.medium_type || {};


                    return `
                        <tr>

                            <td>

                                <strong>
                                    ${esc(row.id)}
                                </strong>

                                <br>

                                <span class="badge">
                                    Customer #${esc(
                                        row.customer_id
                                    )}
                                </span>

                            </td>

                            <td>

                                <div class="customer-name">
                                    ${esc(
                                        info.name
                                    )}
                                </div>

                                <div class="customer-meta">
                                    ${esc(
                                        info.pppoe || ""
                                    )}
                                </div>

                                <div class="customer-meta">
                                    ${esc(
                                        info.phone || ""
                                    )}
                                </div>

                                <div class="customer-meta">
                                    ${esc(
                                        info.area || ""
                                    )}
                                </div>

                            </td>

                            <td>

                                <div class="customer-name">
                                    ${esc(
                                        pkg.package || "-"
                                    )}
                                </div>

                                <div class="customer-meta">
                                    Bill:
                                    ${money(pkg.bill)}
                                </div>

                            </td>

                            <td>
                                ${money(row.discount)}
                            </td>

                            <td class="amount">
                                ${money(row.due)}
                            </td>

                            <td>

                                <span class="badge">
                                    ${esc(
                                        medium.medium || "-"
                                    )}
                                </span>

                                <br>

                                <span class="customer-meta">
                                    ${esc(
                                        medium.type || ""
                                    )}
                                </span>

                            </td>

                            <td class="amount">
                                ${money(
                                    row.collected
                                )}
                            </td>

                            <td>

                                <div>
                                    ${esc(
                                        row.collected_by || ""
                                    )}
                                </div>

                                ${
                                    row.collector_role
                                    ? `
                                        <span class="badge green">
                                            ${esc(
                                                row.collector_role
                                            )}
                                        </span>
                                    `
                                    : ""
                                }

                            </td>

                            <td class="note">
                                ${esc(
                                    row.note || ""
                                )}
                            </td>

                            <td>
                                ${formatDate(
                                    row.date
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
                    <td colspan="10" class="error">
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
                reseller.value = "";
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


    reseller.addEventListener(
        "change",
        () => load(1)
    );


    loadResellers();

    load(1);

});