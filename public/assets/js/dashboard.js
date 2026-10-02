"use strict";

document.addEventListener("DOMContentLoaded", () => {

let collectionChart = null;
let dashboardTimer = null;
let mikrotikTimer = null;
let billingTimer = null;
let billingRefreshTimer = null;

let currentBilling = null;
let currentBillingExpiresAt = null;
let billingLoaded = false;


/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function number(value) {

    const n = Number(value);

    if (!Number.isFinite(n)) {
        return "0";
    }

    return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 0
    }).format(n);
}


function money(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "—";
    }

    const n = Number(value);

    if (!Number.isFinite(n)) {
        return "—";
    }

    return "৳ " + new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(n);
}


function setText(id, value) {

    const element =
        document.getElementById(id);

    if (!element) {
        return;
    }

    element.textContent =
        value === null ||
        value === undefined ||
        value === ""
            ? "—"
            : value;
}


function escapeHtml(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function parseDate(value) {

    if (!value) {
        return null;
    }

    const date =
        new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
}


function formatCountdown(milliseconds) {

    if (
        !Number.isFinite(milliseconds) ||
        milliseconds <= 0
    ) {
        return "00:00:00";
    }

    const totalSeconds =
        Math.floor(
            milliseconds / 1000
        );

    const hours =
        Math.floor(
            totalSeconds / 3600
        );

    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );

    const seconds =
        totalSeconds % 60;

    return [
        String(hours).padStart(2, "0"),
        String(minutes).padStart(2, "0"),
        String(seconds).padStart(2, "0")
    ].join(":");
}


/*
|--------------------------------------------------------------------------
| Billing Notice CSS
|--------------------------------------------------------------------------
*/

function installBillingNoticeStyles() {

    if (
        document.getElementById(
            "softwareBillingNoticeStyles"
        )
    ) {
        return;
    }

    const style =
        document.createElement("style");

    style.id =
        "softwareBillingNoticeStyles";

    style.textContent = `
        .software-billing-notice {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            width: 100%;
            padding: 10px 14px;
            border-radius: 8px;
            background: linear-gradient(
                135deg,
                #dc3545,
                #b02a37
            );
            color: #fff;
            box-shadow: 0 3px 10px rgba(0,0,0,.08);
        }

        .software-billing-left {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
        }

        .software-billing-icon {
            width: 34px;
            height: 34px;
            min-width: 34px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255,255,255,.18);
            font-size: 16px;
        }

        .software-billing-title {
            font-size: 14px;
            font-weight: 700;
            line-height: 1.2;
        }

        .software-billing-details {
            margin-top: 2px;
            font-size: 12px;
            opacity: .95;
        }

        .software-billing-right {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-shrink: 0;
        }

        .software-billing-countdown {
            min-width: 76px;
            text-align: center;
            padding: 5px 8px;
            border-radius: 5px;
            background: rgba(0,0,0,.18);
            font-size: 13px;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
        }

        .software-billing-notice .btn {
            white-space: nowrap;
        }

        @media (max-width: 575.98px) {

            .software-billing-notice {
                align-items: flex-start;
                flex-direction: column;
                gap: 10px;
            }

            .software-billing-right {
                width: 100%;
                justify-content: space-between;
            }

            .software-billing-countdown {
                flex: 1;
            }
        }
    `;

    document.head.appendChild(style);
}


/*
|--------------------------------------------------------------------------
| Billing Notice
|--------------------------------------------------------------------------
*/

function hideBillingNotice() {

    const box =
        document.getElementById(
            "pendingBilling"
        );

    if (!box) {
        return;
    }

    box.style.display =
        "none";
}


function showBillingNotice() {

    const box =
        document.getElementById(
            "pendingBilling"
        );

    const details =
        document.getElementById(
            "billingDetails"
        );

    const countdown =
        document.getElementById(
            "billingCountdown"
        );

    const payButton =
        document.getElementById(
            "payNowButton"
        );

    if (!box) {

        console.warn(
            "[Dashboard Billing] #pendingBilling not found."
        );

        return;
    }

    /*
    |--------------------------------------------------------------------------
    | SHOW
    |--------------------------------------------------------------------------
    */

    box.style.display =
        "block";


    /*
    |--------------------------------------------------------------------------
    | DETAILS
    |--------------------------------------------------------------------------
    */

    if (details) {

        const amount =
            currentBilling?.amount !== undefined
                ? money(
                    currentBilling.amount
                )
                : "—";

        const message =
            currentBilling?.message
                ? String(
                    currentBilling.message
                )
                : "";

        const billingType =
            currentBilling?.billing_type
                ? String(
                    currentBilling.billing_type
                )
                : "registration";

        details.innerHTML = `
            <strong>Amount:</strong>
            ${escapeHtml(amount)}

            <span class="mx-1">•</span>

            ${escapeHtml(billingType)}

            ${
                message
                    ? `
                        <span class="mx-1">•</span>
                        ${escapeHtml(message)}
                    `
                    : `
                        <span class="mx-1">•</span>
                        Trial active
                    `
            }
        `;
    }


    /*
    |--------------------------------------------------------------------------
    | PAY BUTTON
    |--------------------------------------------------------------------------
    */

    if (payButton) {

        payButton.href =
            "/software-billing";

        payButton.style.display =
            "";
    }


    /*
    |--------------------------------------------------------------------------
    | COUNTDOWN
    |--------------------------------------------------------------------------
    */

    updateBillingCountdown();
}


/*
|--------------------------------------------------------------------------
| Billing Data Normalizer
|--------------------------------------------------------------------------
*/

function normalizeBillingResponse(data) {

    if (!data) {
        return null;
    }


    /*
    |--------------------------------------------------------------------------
    | Direct billing
    |--------------------------------------------------------------------------
    */

    if (
        data.billing &&
        typeof data.billing === "object"
    ) {

        return data.billing;
    }


    /*
    |--------------------------------------------------------------------------
    | data.billing
    |--------------------------------------------------------------------------
    */

    if (
        data.data?.billing &&
        typeof data.data.billing === "object"
    ) {

        return data.data.billing;
    }


    /*
    |--------------------------------------------------------------------------
    | current
    |--------------------------------------------------------------------------
    */

    if (
        data.current &&
        typeof data.current === "object"
    ) {

        return data.current;
    }


    /*
    |--------------------------------------------------------------------------
    | data.current
    |--------------------------------------------------------------------------
    */

    if (
        data.data?.current &&
        typeof data.data.current === "object"
    ) {

        return data.data.current;
    }


    /*
    |--------------------------------------------------------------------------
    | data.data itself
    |--------------------------------------------------------------------------
    */

    if (
        data.data &&
        typeof data.data === "object" &&
        (
            data.data.id ||
            data.data.amount ||
            data.data.created_at ||
            data.data.billing_type
        )
    ) {

        return data.data;
    }


    /*
    |--------------------------------------------------------------------------
    | Direct object
    |--------------------------------------------------------------------------
    */

    if (
        data.id ||
        data.amount ||
        data.created_at ||
        data.billing_type
    ) {

        return data;
    }


    return null;
}


/*
|--------------------------------------------------------------------------
| Set Billing From Object
|--------------------------------------------------------------------------
*/

function setBillingFromObject(billing) {

    if (
        !billing ||
        typeof billing !== "object"
    ) {
        return false;
    }


    /*
    |--------------------------------------------------------------------------
    | Paid billing
    |--------------------------------------------------------------------------
    */

    if (
        String(
            billing.status || ""
        ).toLowerCase() === "paid"
    ) {

        currentBilling =
            null;

        currentBillingExpiresAt =
            null;

        billingLoaded =
            true;

        hideBillingNotice();

        return true;
    }


    /*
    |--------------------------------------------------------------------------
    | Save billing
    |--------------------------------------------------------------------------
    */

    currentBilling =
        billing;


    /*
    |--------------------------------------------------------------------------
    | Server supplied remaining seconds
    |--------------------------------------------------------------------------
    |
    | Middleware/controller may already provide the exact
    | remaining trial time.
    |
    */

    const serverRemaining =
        Number(
            billing.trial_remaining_seconds ??
            billing.remaining_seconds ??
            billing.remainingSeconds ??
            0
        );


    if (
        Number.isFinite(serverRemaining) &&
        serverRemaining > 0
    ) {

        currentBillingExpiresAt =
            Date.now() +
            (
                serverRemaining *
                1000
            );

    } else {

        /*
        |--------------------------------------------------------------------------
        | Created At
        |--------------------------------------------------------------------------
        */

        const createdAt =
            parseDate(
                billing.created_at ||
                billing.invoice_date ||
                billing.due_date
            );


        if (!createdAt) {

            console.warn(
                "[Dashboard Billing] created_at not found.",
                billing
            );

            currentBillingExpiresAt =
                null;

        } else {

            currentBillingExpiresAt =
                createdAt.getTime() +
                (
                    3 *
                    60 *
                    60 *
                    1000
                );
        }
    }


    /*
    |--------------------------------------------------------------------------
    | Expired
    |--------------------------------------------------------------------------
    */

    if (
        currentBillingExpiresAt &&
        Date.now() >=
        currentBillingExpiresAt
    ) {

        window.location.href =
            "/software-billing";

        return true;
    }


    /*
    |--------------------------------------------------------------------------
    | Billing found
    |--------------------------------------------------------------------------
    */

    billingLoaded =
        true;

    showBillingNotice();

    return true;
}


/*
|--------------------------------------------------------------------------
| Load Software Billing
|--------------------------------------------------------------------------
*/

async function loadSoftwareBilling() {

    try {

        const response =
            await fetch(
                "/api/software-billing/current",
                {
                    method: "GET",

                    credentials:
                        "same-origin",

                    headers: {
                        "Accept":
                            "application/json"
                    },

                    cache:
                        "no-store"
                }
            );


        /*
        |--------------------------------------------------------------------------
        | Authentication
        |--------------------------------------------------------------------------
        */

        if (
            response.status === 401
        ) {

            return;
        }


        /*
        |--------------------------------------------------------------------------
        | Read JSON
        |--------------------------------------------------------------------------
        */

        const data =
            await response.json()
                .catch(() => null);


        console.log(
            "[Dashboard Billing] API:",
            data
        );


        /*
        |--------------------------------------------------------------------------
        | Expired
        |--------------------------------------------------------------------------
        */

        if (
            response.status === 402 ||
            response.status === 403
        ) {

            window.location.href =
                "/software-billing";

            return;
        }


        /*
        |--------------------------------------------------------------------------
        | Other API errors
        |--------------------------------------------------------------------------
        */

        if (!response.ok) {

            console.warn(
                "[Dashboard Billing] HTTP:",
                response.status
            );

            return;
        }


        /*
        |--------------------------------------------------------------------------
        | Invalid response
        |--------------------------------------------------------------------------
        */

        if (!data) {

            console.warn(
                "[Dashboard Billing] Empty response."
            );

            return;
        }


        /*
        |--------------------------------------------------------------------------
        | Super Admin
        |--------------------------------------------------------------------------
        */

        if (
            data.type === "super_admin" ||
            data.is_super_admin === true ||
            data.super_admin === true
        ) {

            billingLoaded =
                true;

            currentBilling =
                null;

            currentBillingExpiresAt =
                null;

            hideBillingNotice();

            return;
        }


        /*
        |--------------------------------------------------------------------------
        | Billing Required / Active
        |--------------------------------------------------------------------------
        */

        const billing =
            normalizeBillingResponse(
                data
            );


        /*
        |--------------------------------------------------------------------------
        | IMPORTANT
        |--------------------------------------------------------------------------
        |
        | Only mark billingLoaded=true when an actual billing
        | record was found.
        |
        | This allows dashboard pending_billing to work as
        | fallback when the endpoint response structure differs.
        |--------------------------------------------------------------------------
        */

        if (billing) {

            setBillingFromObject(
                billing
            );

            return;
        }


        /*
        |--------------------------------------------------------------------------
        | No billing found
        |--------------------------------------------------------------------------
        */

        if (
            data.billing === null ||
            data.data?.billing === null ||
            data.current === null ||
            data.data?.current === null
        ) {

            billingLoaded =
                true;

            currentBilling =
                null;

            currentBillingExpiresAt =
                null;

            hideBillingNotice();

            return;
        }


        /*
        |--------------------------------------------------------------------------
        | Do not block fallback
        |--------------------------------------------------------------------------
        */

        console.warn(
            "[Dashboard Billing] Billing object not found in API response."
        );

    } catch (error) {

        console.warn(
            "[Dashboard] Software billing:",
            error.message
        );
    }
}


/*
|--------------------------------------------------------------------------
| Billing Countdown
|--------------------------------------------------------------------------
*/

function updateBillingCountdown() {

    const countdown =
        document.getElementById(
            "billingCountdown"
        );

    if (!countdown) {
        return;
    }


    /*
    |--------------------------------------------------------------------------
    | No expiry
    |--------------------------------------------------------------------------
    */

    if (!currentBillingExpiresAt) {

        countdown.textContent =
            "TRIAL";

        return;
    }


    /*
    |--------------------------------------------------------------------------
    | Remaining
    |--------------------------------------------------------------------------
    */

    const remaining =
        currentBillingExpiresAt -
        Date.now();


    /*
    |--------------------------------------------------------------------------
    | Expired
    |--------------------------------------------------------------------------
    */

    if (remaining <= 0) {

        countdown.textContent =
            "00:00:00";


        if (billingTimer) {

            clearInterval(
                billingTimer
            );

            billingTimer =
                null;
        }


        window.location.href =
            "/software-billing";

        return;
    }


    /*
    |--------------------------------------------------------------------------
    | Display
    |--------------------------------------------------------------------------
    */

    countdown.textContent =
        formatCountdown(
            remaining
        );
}


/*
|--------------------------------------------------------------------------
| Start Billing Countdown
|--------------------------------------------------------------------------
*/

function startBillingCountdown() {

    if (billingTimer) {

        clearInterval(
            billingTimer
        );
    }

    billingTimer =
        setInterval(
            updateBillingCountdown,
            1000
        );

    updateBillingCountdown();
}


/*
|--------------------------------------------------------------------------
| Chart
|--------------------------------------------------------------------------
*/

function initializeChart(
    labels = [],
    values = []
) {

    const canvas =
        document.getElementById(
            "collectionChart"
        );

    if (
        !canvas ||
        typeof Chart === "undefined"
    ) {
        return;
    }


    if (collectionChart) {

        collectionChart.destroy();

        collectionChart =
            null;
    }


    collectionChart =
        new Chart(canvas, {

            type: "bar",

            data: {

                labels:
                    labels,

                datasets: [{

                    label:
                        "Collection",

                    data:
                        values,

                    borderWidth:
                        1,

                    borderRadius:
                        8,

                    maxBarThickness:
                        45
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
                            false
                    },

                    tooltip: {

                        callbacks: {

                            label(context) {

                                return "৳ " +
                                    new Intl.NumberFormat(
                                        "en-US",
                                        {
                                            minimumFractionDigits: 0,
                                            maximumFractionDigits: 2
                                        }
                                    ).format(
                                        Number(
                                            context.raw ||
                                            0
                                        )
                                    );
                            }
                        }
                    }
                },

                scales: {

                    y: {

                        beginAtZero:
                            true,

                        ticks: {

                            callback(value) {

                                return "৳ " +
                                    number(
                                        value
                                    );
                            }
                        }
                    }
                }
            }
        });
}


/*
|--------------------------------------------------------------------------
| Pending Billing Fallback
|--------------------------------------------------------------------------
*/

function renderPendingBilling(data) {

    /*
    |--------------------------------------------------------------------------
    | Dedicated billing endpoint already supplied billing.
    |--------------------------------------------------------------------------
    */

    if (billingLoaded) {
        return;
    }


    /*
    |--------------------------------------------------------------------------
    | No fallback billing
    |--------------------------------------------------------------------------
    */

    if (
        !data ||
        typeof data !== "object"
    ) {

        return;
    }


    console.log(
        "[Dashboard Billing] Using pending_billing fallback:",
        data
    );


    /*
    |--------------------------------------------------------------------------
    | Use fallback billing
    |--------------------------------------------------------------------------
    */

    setBillingFromObject(
        data
    );
}


/*
|--------------------------------------------------------------------------
| Super Admin
|--------------------------------------------------------------------------
*/

function renderSuperAdmin(data) {

    const company =
        document.getElementById(
            "companyDashboard"
        );

    const superAdmin =
        document.getElementById(
            "superAdminDashboard"
        );


    if (company) {
        company.style.display =
            "none";
    }


    if (superAdmin) {
        superAdmin.style.display =
            "";
    }


    hideBillingNotice();


    setText(
        "dashboardTitle",
        "Super Admin Dashboard"
    );

    setText(
        "dashboardSubtitle",
        "Software & Company Management"
    );

    setText(
        "roleBadge",
        "Super Admin"
    );


    setText(
        "registeredUsers",
        number(
            data.registered_users
        )
    );

    setText(
        "activeUsers",
        number(
            data.active_users
        )
    );

    setText(
        "registrationInvoices",
        number(
            data.registration_invoices
        )
    );

    setText(
        "registrationCollection",
        money(
            data.registration_collection
        )
    );

    setText(
        "paidRegistration",
        number(
            data.paid_registration
        )
    );

    setText(
        "unpaidRegistration",
        number(
            data.unpaid_registration
        )
    );

    setText(
        "softwarePayments",
        money(
            data.registration_paid_amount
        )
    );
}


/*
|--------------------------------------------------------------------------
| Company Dashboard
|--------------------------------------------------------------------------
*/

function renderCompany(data) {

    const company =
        document.getElementById(
            "companyDashboard"
        );

    const superAdmin =
        document.getElementById(
            "superAdminDashboard"
        );


    if (superAdmin) {

        superAdmin.style.display =
            "none";
    }


    if (company) {

        company.style.display =
            "";
    }


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
        data.role || "Admin"
    );


    /*
    |--------------------------------------------------------------------------
    | Financial
    |--------------------------------------------------------------------------
    */

    setText(
        "totalCollection",
        money(
            data.total_collection
        )
    );

    setText(
        "totalBill",
        money(
            data.total_bill
        )
    );

    setText(
        "totalCollection2",
        money(
            data.total_collection
        )
    );

    setText(
        "totalBill2",
        money(
            data.total_bill
        )
    );

    setText(
        "todayCollection",
        money(
            data.today_collection
        )
    );

    setText(
        "connectionFee",
        money(
            data.connection_fee
        )
    );

    setText(
        "discount",
        money(
            data.discount
        )
    );

    setText(
        "expenditure",
        money(
            data.expenditure
        )
    );

    setText(
        "salary",
        money(
            data.salary
        )
    );

    setText(
        "businessBalance",
        money(
            data.business_balance
        )
    );


    /*
    |--------------------------------------------------------------------------
    | Customers
    |--------------------------------------------------------------------------
    */

    setText(
        "totalCustomer",
        number(
            data.total_customer
        )
    );

    setText(
        "activeCustomer",
        number(
            data.active_customer
        )
    );

    setText(
        "inactiveCustomer",
        number(
            data.inactive_customer
        )
    );

    setText(
        "expiredCustomer",
        number(
            data.expired_customer
        )
    );

    setText(
        "paidCustomer",
        number(
            data.paid_customer
        )
    );

    setText(
        "unpaidCustomer",
        number(
            data.unpaid_customer
        )
    );

    setText(
        "freeCustomer",
        number(
            data.free_customer
        )
    );


    /*
    |--------------------------------------------------------------------------
    | MikroTik
    |--------------------------------------------------------------------------
    */

    setText(
        "mikrotikTotal",
        number(
            data.mikrotik_total
        )
    );


    setText(
        "onlineUser",
        "—"
    );

    setText(
        "offlineUser",
        "—"
    );


    /*
    |--------------------------------------------------------------------------
    | Chart
    |--------------------------------------------------------------------------
    */

    if (data.chart) {

        initializeChart(

            Array.isArray(
                data.chart.labels
            )
                ? data.chart.labels
                : [],

            Array.isArray(
                data.chart.values
            )
                ? data.chart.values
                : []
        );
    }


    /*
    |--------------------------------------------------------------------------
    | Pending Software Billing Fallback
    |--------------------------------------------------------------------------
    */

    renderPendingBilling(
        data.pending_billing ||
        null
    );
}


/*
|--------------------------------------------------------------------------
| MikroTik Status
|--------------------------------------------------------------------------
*/

async function loadMikrotik(routerId) {

    if (!routerId) {

        setText(
            "routerName",
            "No Router"
        );

        setText(
            "cpu",
            "—"
        );

        setText(
            "ram",
            "—"
        );

        setText(
            "status",
            "—"
        );

        setText(
            "uptime",
            "—"
        );

        setText(
            "traffic",
            "—"
        );

        return;
    }


    try {

        const response =
            await fetch(
                `/api/mikrotik/status?id=${encodeURIComponent(routerId)}`,
                {
                    method:
                        "GET",

                    credentials:
                        "same-origin",

                    headers: {
                        "Accept":
                            "application/json"
                    },

                    cache:
                        "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );
        }


        const data =
            await response.json();


        if (
            !data ||
            data.success === false
        ) {

            throw new Error(
                data?.message ||
                "MikroTik unavailable"
            );
        }


        setText(
            "routerName",
            data.router?.name ||
            data.identity ||
            "MikroTik"
        );


        const cpuValue =
            data.resource?.["cpu-load"] ??
            data.cpu_load ??
            data.cpu;


        setText(
            "cpu",
            cpuValue !== undefined &&
            cpuValue !== null
                ? `${cpuValue}%`
                : "—"
        );


        const totalMemory =
            Number(
                data.resource?.["total-memory"] ||
                0
            );


        const freeMemory =
            Number(
                data.resource?.["free-memory"] ||
                0
            );


        if (
            totalMemory > 0 &&
            freeMemory >= 0
        ) {

            const used =
                totalMemory -
                freeMemory;

            const ramPercent =
                (
                    used /
                    totalMemory
                ) * 100;


            setText(
                "ram",
                `${ramPercent.toFixed(1)}%`
            );

        } else {

            setText(
                "ram",
                "—"
            );
        }


        setText(
            "uptime",
            data.resource?.uptime ||
            data.uptime ||
            "—"
        );


        setText(
            "traffic",
            data.traffic
                ? data.traffic
                : "—"
        );


        setText(
            "status",
            data.online === true ||
            data.status === "Online"
                ? "Online"
                : "Offline"
        );

    } catch (error) {

        console.warn(
            "[Dashboard] MikroTik status:",
            error.message
        );


        setText(
            "routerName",
            "Unavailable"
        );

        setText(
            "cpu",
            "—"
        );

        setText(
            "ram",
            "—"
        );

        setText(
            "status",
            "Offline"
        );

        setText(
            "uptime",
            "—"
        );

        setText(
            "traffic",
            "—"
        );
    }
}


/*
|--------------------------------------------------------------------------
| Dashboard Loader
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
                        "Accept":
                            "application/json"
                    },

                    cache:
                        "no-store"
                }
            );


        /*
        |--------------------------------------------------------------------------
        | Trial expired / billing gate
        |--------------------------------------------------------------------------
        */

        if (
            response.status === 402
        ) {

            window.location.href =
                "/software-billing";

            return;
        }


        /*
        |--------------------------------------------------------------------------
        | Authentication
        |--------------------------------------------------------------------------
        */

        if (
            response.status === 401
        ) {

            window.location.href =
                "/";

            return;
        }


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );
        }


        const data =
            await response.json();


        if (!data.success) {

            throw new Error(
                data.message ||
                "Dashboard data unavailable"
            );
        }


        /*
        |--------------------------------------------------------------------------
        | Super Admin
        |--------------------------------------------------------------------------
        */

        if (
            data.type ===
            "super_admin"
        ) {

            renderSuperAdmin(
                data
            );


            if (mikrotikTimer) {

                clearInterval(
                    mikrotikTimer
                );

                mikrotikTimer =
                    null;
            }


            return;
        }


        /*
        |--------------------------------------------------------------------------
        | Company
        |--------------------------------------------------------------------------
        */

        renderCompany(
            data
        );


        /*
        |--------------------------------------------------------------------------
        | Router ID
        |--------------------------------------------------------------------------
        */

        const routerId =
            data.mikrotik_router_id ||
            null;


        await loadMikrotik(
            routerId
        );

    } catch (error) {

        console.error(
            "[Dashboard] Load failed:",
            error
        );
    }
}


/*
|--------------------------------------------------------------------------
| Initial Setup
|--------------------------------------------------------------------------
*/

installBillingNoticeStyles();


/*
|--------------------------------------------------------------------------
| Initial Load
|--------------------------------------------------------------------------
*/

loadDashboard();

loadSoftwareBilling();

startBillingCountdown();


/*
|--------------------------------------------------------------------------
| Dashboard Refresh
|--------------------------------------------------------------------------
*/

dashboardTimer =
    setInterval(
        loadDashboard,
        30000
    );


/*
|--------------------------------------------------------------------------
| Billing Refresh
|--------------------------------------------------------------------------
*/

billingRefreshTimer =
    setInterval(
        loadSoftwareBilling,
        30000
    );


/*
|--------------------------------------------------------------------------
| MikroTik Refresh
|--------------------------------------------------------------------------
*/

mikrotikTimer =
    setInterval(
        async () => {

            const companyDashboard =
                document.getElementById(
                    "companyDashboard"
                );


            if (
                !companyDashboard ||
                companyDashboard.style.display ===
                    "none"
            ) {
                return;
            }


            return;

        },
        5000
    );


/*
|--------------------------------------------------------------------------
| Cleanup
|--------------------------------------------------------------------------
*/

window.addEventListener(
    "beforeunload",
    () => {

        if (dashboardTimer) {

            clearInterval(
                dashboardTimer
            );
        }


        if (mikrotikTimer) {

            clearInterval(
                mikrotikTimer
            );
        }


        if (billingTimer) {

            clearInterval(
                billingTimer
            );
        }


        if (billingRefreshTimer) {

            clearInterval(
                billingRefreshTimer
            );
        }
    }
);

});