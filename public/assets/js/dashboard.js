/* ================= DASHBOARD JS ================= */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        "use strict";


        let currentRouterId =
            null;


        let collectionChart =
            null;


        /*
        |--------------------------------------------------------------------------
        | HELPERS
        |--------------------------------------------------------------------------
        */

        function getElement(id) {

            return document.getElementById(id);

        }


        function number(value) {

            const n =
                Number(value);

            return Number.isFinite(n)
                ? n
                : 0;

        }


        function money(value) {

            return "৳" +
                number(value).toLocaleString(
                    "en-US",
                    {
                        maximumFractionDigits: 2
                    }
                );

        }


        function setText(
            id,
            value
        ) {

            const element =
                getElement(id);


            if (element) {

                element.textContent =
                    value;

            }

        }


        /*
        |--------------------------------------------------------------------------
        | COLLECTION CHART
        |--------------------------------------------------------------------------
        */

        function initializeChart() {

            const chartBox =
                getElement(
                    "collectionChart"
                );


            if (
                !chartBox ||
                typeof Chart ===
                    "undefined"
            ) {

                return;

            }


            collectionChart =
                new Chart(
                    chartBox,
                    {

                        type: "bar",

                        data: {

                            labels: [

                                "Jan",
                                "Feb",
                                "Mar",
                                "Apr",
                                "May",
                                "Jun"

                            ],

                            datasets: [{

                                label:
                                    "Collection",

                                data: [

                                    12000,
                                    19000,
                                    15000,
                                    22000,
                                    25000,
                                    28000

                                ]

                            }]

                        },


                        options: {

                            responsive:
                                true,

                            maintainAspectRatio:
                                false,


                            plugins: {

                                legend: {

                                    display:
                                        true

                                }

                            }

                        }

                    }
                );

        }


        /*
        |--------------------------------------------------------------------------
        | LOAD DASHBOARD
        |--------------------------------------------------------------------------
        */

        async function loadDashboard() {

            try {

                const response =
                    await fetch(
                        "/api/dashboard/data",
                        {

                            method:
                                "GET",

                            credentials:
                                "same-origin",

                            headers: {

                                Accept:
                                    "application/json"

                            }

                        }
                    );


                const data =
                    await response.json();


                if (
                    !response.ok ||
                    !data.success
                ) {

                    console.error(
                        data.message ||
                        "Dashboard API Error"
                    );

                    return;

                }


                /*
                |--------------------------------------------------------------------------
                | SUPER ADMIN
                |--------------------------------------------------------------------------
                */

                if (
                    data.type ===
                    "super_admin"
                ) {

                    const companyDashboard =
                        getElement(
                            "companyDashboard"
                        );


                    const superAdminDashboard =
                        getElement(
                            "superAdminDashboard"
                        );


                    if (
                        companyDashboard
                    ) {

                        companyDashboard.style.display =
                            "none";

                    }


                    if (
                        superAdminDashboard
                    ) {

                        superAdminDashboard.style.display =
                            "block";

                    }


                    setText(
                        "dashboardTitle",
                        "Super Admin Dashboard"
                    );


                    setText(
                        "dashboardSubtitle",
                        "Software এবং Company Management"
                    );


                    setText(
                        "roleBadge",
                        "Super Admin"
                    );


                    const d =
                        data.data || {};


                    setText(
                        "registeredUsers",
                        number(
                            d.registered_users
                        ).toLocaleString()
                    );


                    setText(
                        "activeUsers",
                        number(
                            d.active_users
                        ).toLocaleString()
                    );


                    setText(
                        "registrationInvoices",
                        number(
                            d.registration_invoices
                        ).toLocaleString()
                    );


                    setText(
                        "registrationCollection",
                        money(
                            d.registration_collection
                        )
                    );


                    setText(
                        "paidRegistration",
                        number(
                            d.paid_registration
                        ).toLocaleString()
                    );


                    setText(
                        "unpaidRegistration",
                        number(
                            d.unpaid_registration
                        ).toLocaleString()
                    );


                    setText(
                        "softwarePayments",
                        number(
                            d.software_payments
                        ).toLocaleString()
                    );


                    currentRouterId =
                        d.mikrotik_router_id ||
                        null;


                    return;

                }


                /*
                |--------------------------------------------------------------------------
                | COMPANY
                |--------------------------------------------------------------------------
                */

                const companyDashboard =
                    getElement(
                        "companyDashboard"
                    );


                const superAdminDashboard =
                    getElement(
                        "superAdminDashboard"
                    );


                if (
                    companyDashboard
                ) {

                    companyDashboard.style.display =
                        "block";

                }


                if (
                    superAdminDashboard
                ) {

                    superAdminDashboard.style.display =
                        "none";

                }


                const d =
                    data.data || {};


                setText(
                    "dashboardTitle",
                    "Dashboard"
                );


                setText(
                    "dashboardSubtitle",
                    "ISP Billing Management"
                );


                setText(
                    "roleBadge",
                    data.user?.role ||
                    "Staff"
                );


                /*
                |--------------------------------------------------------------------------
                | ROUTER ID
                |--------------------------------------------------------------------------
                */

                currentRouterId =
                    d.mikrotik_router_id ||
                    null;


                /*
                |--------------------------------------------------------------------------
                | COLLECTION
                |--------------------------------------------------------------------------
                */

                setText(
                    "totalCollection",
                    money(
                        d.total_collection
                    )
                );


                setText(
                    "totalBill",
                    money(
                        d.total_bill
                    )
                );


                setText(
                    "totalBill2",
                    money(
                        d.total_bill
                    )
                );


                setText(
                    "totalCollection2",
                    money(
                        d.total_collection
                    )
                );


                /*
                |--------------------------------------------------------------------------
                | CUSTOMERS
                |--------------------------------------------------------------------------
                */

                setText(
                    "totalCustomer",
                    number(
                        d.total_customer
                    ).toLocaleString()
                );


                setText(
                    "activeCustomer",
                    number(
                        d.active_customer
                    ).toLocaleString()
                );


                setText(
                    "inactiveCustomer",
                    number(
                        d.inactive_customer
                    ).toLocaleString()
                );


                setText(
                    "expiredCustomer",
                    number(
                        d.expired_customer
                    ).toLocaleString()
                );


                setText(
                    "paidCustomer",
                    number(
                        d.paid_customer
                    ).toLocaleString()
                );


                setText(
                    "unpaidCustomer",
                    number(
                        d.unpaid_customer
                    ).toLocaleString()
                );


                setText(
                    "freeCustomer",
                    number(
                        d.free_customer
                    ).toLocaleString()
                );


                /*
                |--------------------------------------------------------------------------
                | FINANCE
                |--------------------------------------------------------------------------
                */

                setText(
                    "todayCollection",
                    money(
                        d.today_collection
                    )
                );


                setText(
                    "connectionFee",
                    money(
                        d.connection_fee
                    )
                );


                setText(
                    "discount",
                    money(
                        d.discount
                    )
                );


                setText(
                    "expenditure",
                    money(
                        d.expenditure
                    )
                );


                setText(
                    "salary",
                    money(
                        d.salary
                    )
                );


                setText(
                    "businessBalance",
                    money(
                        d.business_balance
                    )
                );


                /*
                |--------------------------------------------------------------------------
                | MIKROTIK CUSTOMER SUMMARY
                |--------------------------------------------------------------------------
                */

                setText(
                    "mikrotikTotal",
                    number(
                        d.total_pppoe
                    ).toLocaleString()
                );


                setText(
                    "onlineUser",
                    number(
                        d.online_user
                    ).toLocaleString()
                );


                setText(
                    "offlineUser",
                    number(
                        d.offline_user
                    ).toLocaleString()
                );


                /*
                |--------------------------------------------------------------------------
                | PENDING BILLING
                |--------------------------------------------------------------------------
                */

                const billingBox =
                    getElement(
                        "pendingBilling"
                    );


                const billing =
                    data.pendingBilling;


                if (
                    billingBox &&
                    billing
                ) {

                    billingBox.style.display =
                        "block";


                    const details =
                        getElement(
                            "billingDetails"
                        );


                    if (details) {

                        const amount =
                            money(
                                billing.amount
                            );


                        const type =
                            billing.billing_type ||
                            "Registration";


                        const packageCode =
                            billing.package_code ||
                            "-";


                        const dueDate =
                            billing.due_date ||
                            "-";


                        details.textContent =
                            `Invoice #${billing.id} • ` +
                            `${type} • ` +
                            `Package: ${packageCode} • ` +
                            `Amount: ${amount} • ` +
                            `Due: ${dueDate}`;

                    }


                    const payButton =
                        getElement(
                            "payNowButton"
                        );


                    if (payButton) {

                        payButton.href =
                            `/billing/pay?id=${encodeURIComponent(
                                billing.id
                            )}`;

                    }

                }
                else if (
                    billingBox
                ) {

                    billingBox.style.display =
                        "none";

                }

            }
            catch (error) {

                console.error(
                    "Dashboard Load Error:",
                    error
                );

            }

        }


        /*
        |--------------------------------------------------------------------------
        | REAL MIKROTIK STATUS
        |--------------------------------------------------------------------------
        */

        async function loadMikrotik() {

            if (
                !currentRouterId
            ) {

                setText(
                    "routerName",
                    "-"
                );

                setText(
                    "cpu",
                    "-"
                );

                setText(
                    "ram",
                    "-"
                );

                setText(
                    "uptime",
                    "-"
                );

                setText(
                    "traffic",
                    "-"
                );

                setText(
                    "status",
                    "No Router"
                );

                return;

            }


            try {

                const response =
                    await fetch(
                        `/api/mikrotik/status?id=${encodeURIComponent(
                            currentRouterId
                        )}`,
                        {

                            method:
                                "GET",

                            credentials:
                                "same-origin",

                            headers: {

                                Accept:
                                    "application/json"

                            }

                        }
                    );


                const data =
                    await response.json();


                if (
                    data.online !== true
                ) {

                    setText(
                        "routerName",
                        data.router?.name ||
                        "-"
                    );


                    setText(
                        "cpu",
                        "-"
                    );


                    setText(
                        "ram",
                        "-"
                    );


                    setText(
                        "uptime",
                        "-"
                    );


                    setText(
                        "traffic",
                        "-"
                    );


                    setText(
                        "status",
                        data.message ||
                        "Offline"
                    );


                    return;

                }


                const resource =
                    data.resource ||
                    {};


                /*
                |--------------------------------------------------------------------------
                | ROUTER NAME
                |--------------------------------------------------------------------------
                */

                setText(
                    "routerName",
                    data.identity ||
                    data.router?.name ||
                    "-"
                );


                /*
                |--------------------------------------------------------------------------
                | CPU
                |--------------------------------------------------------------------------
                */

                const cpu =
                    resource["cpu-load"];


                setText(
                    "cpu",
                    cpu !== undefined
                        ? `${cpu}%`
                        : "-"
                );


                /*
                |--------------------------------------------------------------------------
                | RAM
                |--------------------------------------------------------------------------
                */

                let ramText =
                    "-";


                const totalMemory =
                    Number(
                        resource["total-memory"]
                    );


                const freeMemory =
                    Number(
                        resource["free-memory"]
                    );


                if (
                    Number.isFinite(
                        totalMemory
                    ) &&
                    Number.isFinite(
                        freeMemory
                    ) &&
                    totalMemory > 0
                ) {

                    const used =
                        totalMemory -
                        freeMemory;


                    const ram =
                        (
                            used /
                            totalMemory
                        ) * 100;


                    ramText =
                        `${ram.toFixed(1)}%`;

                }


                setText(
                    "ram",
                    ramText
                );


                /*
                |--------------------------------------------------------------------------
                | UPTIME
                |--------------------------------------------------------------------------
                */

                setText(
                    "uptime",
                    resource.uptime ||
                    "-"
                );


                /*
                |--------------------------------------------------------------------------
                | TRAFFIC
                |--------------------------------------------------------------------------
                |
                | Original PHP status API does not return traffic.
                | So we do not invent a value.
                |
                */

                setText(
                    "traffic",
                    "-"
                );


                /*
                |--------------------------------------------------------------------------
                | STATUS
                |--------------------------------------------------------------------------
                */

                setText(
                    "status",
                    "Online"
                );

            }
            catch (error) {

                console.log(
                    "MikroTik API Error"
                );


                setText(
                    "status",
                    "Offline"
                );

            }

        }


        /*
        |--------------------------------------------------------------------------
        | START
        |--------------------------------------------------------------------------
        */

        initializeChart();


        loadDashboard();


        /*
        |--------------------------------------------------------------------------
        | DASHBOARD REFRESH
        |--------------------------------------------------------------------------
        */

        setInterval(
            loadDashboard,
            30000
        );


        /*
        |--------------------------------------------------------------------------
        | MIKROTIK REFRESH
        |--------------------------------------------------------------------------
        */

        setTimeout(
            loadMikrotik,
            1000
        );


        setInterval(
            loadMikrotik,
            5000
        );

    }
);