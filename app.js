"use strict";

const express = require("express");
const session = require("express-session");
const MySQLStore =
    require("express-mysql-session")(session);
const cookieParser = require("cookie-parser");
const path = require("path");

require("dotenv").config();


/*
|--------------------------------------------------------------------------
| ADMIN ROUTES
|--------------------------------------------------------------------------
*/

const adminUsersRoutes =
    require("./routes/admin/users");

const adminProfileRoutes =
    require("./routes/admin/profile");

const adminPermissionsRoutes =
    require("./routes/admin/permissions");

const billingManualRoutes =
    require("./routes/billingManual");

const billingRoutes =
    require("./routes/billing");


/*
|--------------------------------------------------------------------------
| AUTH / REGISTER
|--------------------------------------------------------------------------
*/

const authRoutes =
    require("./routes/auth");

const registerRoutes =
    require("./routes/register");


/*
|--------------------------------------------------------------------------
| COMMON ROUTES
|--------------------------------------------------------------------------
*/

const sidebarRoutes =
    require("./routes/sidebar");

const areaRoutes =
    require("./routes/area");

const routerRoutes =
    require("./routes/router");


/*
|--------------------------------------------------------------------------
| CUSTOMER ROUTES
|--------------------------------------------------------------------------
*/

const customerRoutes =
    require("./routes/customers");

const customerAddRoutes =
    require("./routes/customers-add");

const activeCustomerRoutes =
    require("./routes/activeCustomerRoutes");


/*
|--------------------------------------------------------------------------
| MONITORING ROUTES
|--------------------------------------------------------------------------
*/

const monitoringRoutes =
    require("./routes/monitoring");

const interfaceMonitorRoutes =
    require("./routes/interfaceMonitor");

const customerTrafficRoutes =
    require("./routes/customerTraffic");


/*
|--------------------------------------------------------------------------
| SOFTWARE BILLING
|--------------------------------------------------------------------------
*/

const softwareBillingRoutes =
    require("./routes/softwareBilling");

const {
    requireSoftwareBilling
} = require("./middleware/softwareBilling");

const paymentGatewayRoutes =
    require("./routes/paymentGateway");
/*
|--------------------------------------------------------------------------
| EXPRESS APP
|--------------------------------------------------------------------------
*/

const app =
    express();


/*
|--------------------------------------------------------------------------
| BODY PARSER
|--------------------------------------------------------------------------
*/

app.use(
    express.json()
);

app.use(
    express.urlencoded({
        extended: true
    })
);


/*
|--------------------------------------------------------------------------
| COOKIE PARSER
|--------------------------------------------------------------------------
*/

app.use(
    cookieParser()
);


/*
|--------------------------------------------------------------------------
| MYSQL SESSION STORE
|--------------------------------------------------------------------------
*/

const sessionStore =
    new MySQLStore({

        host:
            process.env.DB_HOST ||
            "localhost",

        port:
            Number(
                process.env.DB_PORT ||
                3306
            ),

        user:
            process.env.DB_USER ||
            "root",

        password:
            process.env.DB_PASSWORD ||
            "",

        database:
            process.env.DB_NAME ||
            "ispbilling",

        createDatabaseTable:
            true,

        clearExpired:
            true,

        checkExpirationInterval:
            15 * 60 * 1000,

        expiration:
            24 * 60 * 60 * 1000

    });


/*
|--------------------------------------------------------------------------
| SESSION
|--------------------------------------------------------------------------
*/

app.use(
    session({

        name:
            "ispbilling.sid",

        secret:
            process.env.SESSION_SECRET ||
            "ispbilling_node_test_secret",

        store:
            sessionStore,

        resave:
            false,

        saveUninitialized:
            false,

        rolling:
            true,

        cookie: {

            httpOnly:
                true,

            maxAge:
                24 * 60 * 60 * 1000,

            sameSite:
                "lax",

            secure:
                false,

            path:
                "/"

        }

    })
);


/*
|--------------------------------------------------------------------------
| STATIC FILES
|--------------------------------------------------------------------------
*/

app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);


/*
|--------------------------------------------------------------------------
| AUTH API
|--------------------------------------------------------------------------
|
| Billing gate-এর বাইরে।
|
| unpaid user-ও login/logout করতে পারবে।
|
|--------------------------------------------------------------------------
*/

app.use(
    "/api/auth",
    authRoutes
);


/*
|--------------------------------------------------------------------------
| REGISTER API
|--------------------------------------------------------------------------
|
| Billing gate-এর বাইরে।
|
| registration-এর সময় billing record তৈরি হবে।
|
|--------------------------------------------------------------------------
*/

app.use(
    "/api/register",
    registerRoutes
);


/*
|--------------------------------------------------------------------------
| SOFTWARE BILLING API
|--------------------------------------------------------------------------
|
| Billing gate-এর বাইরে।
|
| unpaid user billing page ব্যবহার করতে পারবে।
|
|--------------------------------------------------------------------------
*/

app.use(
    "/api/software-billing",
    softwareBillingRoutes
);


/*
|--------------------------------------------------------------------------
| BILLING
|--------------------------------------------------------------------------
|
| /billing
| /billing/invoice/:id
| /billing/data
| /billing/data/:id
| /billing/pay
|
| সব routes:
|
| routes/billing.js
|
|--------------------------------------------------------------------------
*/

app.use(
    "/billing",
    billingRoutes
);
app.use(
    "/api/payment-gateway",
    paymentGatewayRoutes
);

/*
|--------------------------------------------------------------------------
| SUPER ADMIN MANUAL PAYMENT
|--------------------------------------------------------------------------
|
| /billing/manual
| /billing/manual/data
| /billing/manual/mark-paid
|
| সব routes:
|
| routes/billingManual.js
|
|--------------------------------------------------------------------------
*/

app.use(
    "/billing/manual",
    billingManualRoutes
);


/*
|--------------------------------------------------------------------------
| SIDEBAR API
|--------------------------------------------------------------------------
|
| Billing gate-এর বাইরে রাখা হয়েছে।
|
| Billing page-এ sidebar প্রয়োজন হতে পারে।
|
|--------------------------------------------------------------------------
*/

app.use(
    "/api/sidebar",
    sidebarRoutes
);


/*
|--------------------------------------------------------------------------
| ADMIN USER ROUTES
|--------------------------------------------------------------------------
|
| Software billing required.
|
|--------------------------------------------------------------------------
*/

app.use(
    "/admin/users",
    requireSoftwareBilling,
    adminUsersRoutes
);

app.use(
    "/super-admin/users",
    requireSoftwareBilling,
    adminUsersRoutes
);


/*
|--------------------------------------------------------------------------
| ADMIN PROFILE
|--------------------------------------------------------------------------
*/

app.use(
    "/admin/profile",
    requireSoftwareBilling,
    adminProfileRoutes
);


/*
|--------------------------------------------------------------------------
| ADMIN PERMISSIONS
|--------------------------------------------------------------------------
*/

app.use(
    "/admin/permissions",
    requireSoftwareBilling,
    adminPermissionsRoutes
);

app.use(
    "/super-admin/permissions",
    requireSoftwareBilling,
    adminPermissionsRoutes
);


/*
|--------------------------------------------------------------------------
| AREA API
|--------------------------------------------------------------------------
*/

app.use(
    "/areas",
    requireSoftwareBilling,
    areaRoutes
);


/*
|--------------------------------------------------------------------------
| MIKROTIK ROUTER API
|--------------------------------------------------------------------------
*/

app.use(
    "/api/router",
    requireSoftwareBilling,
    routerRoutes
);


/*
|--------------------------------------------------------------------------
| CUSTOMER APIs
|--------------------------------------------------------------------------
*/

app.use(
    "/api/customers",
    requireSoftwareBilling,
    customerRoutes
);

app.use(
    "/api/customers/add",
    requireSoftwareBilling,
    customerAddRoutes
);


/*
|--------------------------------------------------------------------------
| ACTIVE CUSTOMER
|--------------------------------------------------------------------------
*/

app.use(
    "/customers/active-pppoe",
    requireSoftwareBilling,
    activeCustomerRoutes
);


/*
|--------------------------------------------------------------------------
| INTERFACE MONITORING
|--------------------------------------------------------------------------
*/

app.use(
    "/monitoring/interface",
    requireSoftwareBilling,
    interfaceMonitorRoutes
);


/*
|--------------------------------------------------------------------------
| CUSTOMER TRAFFIC MONITORING
|--------------------------------------------------------------------------
*/

app.use(
    "/monitoring/customer-traffic",
    requireSoftwareBilling,
    customerTrafficRoutes
);

app.use(
    "/api/monitoring/customer-traffic",
    requireSoftwareBilling,
    customerTrafficRoutes
);


/*
|--------------------------------------------------------------------------
| NETWORK FAULT MONITORING
|--------------------------------------------------------------------------
*/

app.use(
    "/monitoring",
    requireSoftwareBilling,
    monitoringRoutes
);

app.use(
    "/api/monitoring",
    requireSoftwareBilling,
    monitoringRoutes
);


/*
|--------------------------------------------------------------------------
| LOGIN PAGE
|--------------------------------------------------------------------------
*/

app.get(
    "/",
    (req, res) => {

        return res.sendFile(
            path.join(
                __dirname,
                "views",
                "login.html"
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| REGISTER PAGE
|--------------------------------------------------------------------------
*/

app.get(
    "/register",
    (req, res) => {

        return res.sendFile(
            path.join(
                __dirname,
                "views",
                "register.html"
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| SOFTWARE BILLING PAGE
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| এই page-এ billing gate থাকবে না।
|
| unpaid user-এর এই page-এই ঢুকতে হবে।
|
|--------------------------------------------------------------------------
*/

app.get(
    "/software-billing",
    (req, res) => {

        if (
            !req.session ||
            !req.session.user_id
        ) {

            return res.redirect("/");

        }

        return res.sendFile(
            path.join(
                __dirname,
                "views",
                "software-billing.html"
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| SOFTWARE BILLING RECEIPT PAGE
|--------------------------------------------------------------------------
|
| Payment সফল হওয়ার পরে receipt দেখাবে।
|
| API:
| /api/software-billing/receipt
|
| Page:
| /software-billing/receipt
|
|--------------------------------------------------------------------------
*/

app.get(
    "/software-billing/receipt",
    (req, res) => {

        if (
            !req.session ||
            !req.session.user_id
        ) {

            return res.redirect("/");

        }

        return res.sendFile(
            path.join(
                __dirname,
                "views",
                "software-billing-receipt.html"
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| DASHBOARD
|--------------------------------------------------------------------------
|
| Paid:
|     Dashboard allowed
|
| Unpaid:
|     /software-billing
|
|--------------------------------------------------------------------------
*/

app.get(
    "/dashboard",
    requireSoftwareBilling,
    (req, res) => {

        return res.sendFile(
            path.join(
                __dirname,
                "views",
                "dashboard.html"
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| MIKROTIK ROUTER MANAGER
|--------------------------------------------------------------------------
|
| /mikrotik
|     -> Router List
|
| /mikrotik?id=31
|     -> Specific Router Configuration
|
|--------------------------------------------------------------------------
*/

app.get(
    "/mikrotik",
    requireSoftwareBilling,
    (req, res) => {

        const routerId =
            Number(
                req.query.id || 0
            );


        /*
        |--------------------------------------------------------------------------
        | SPECIFIC ROUTER CONFIGURATION
        |--------------------------------------------------------------------------
        */

        if (
            Number.isInteger(routerId) &&
            routerId > 0
        ) {

            return res.sendFile(
                path.join(
                    __dirname,
                    "views",
                    "mikrotik-config.html"
                )
            );

        }


        /*
        |--------------------------------------------------------------------------
        | ROUTER LIST
        |--------------------------------------------------------------------------
        */

        return res.sendFile(
            path.join(
                __dirname,
                "views",
                "router-index.html"
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| CUSTOMERS PAGE
|--------------------------------------------------------------------------
*/

app.get(
    "/customers",
    requireSoftwareBilling,
    (req, res) => {

        return res.sendFile(
            path.join(
                __dirname,
                "views",
                "customers.html"
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| CUSTOMER ADD PAGE
|--------------------------------------------------------------------------
*/

app.get(
    "/customers/add",
    requireSoftwareBilling,
    (req, res) => {

        return res.sendFile(
            path.join(
                __dirname,
                "views",
                "customer-add.html"
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| SIDEBAR PAGE ROUTES
|--------------------------------------------------------------------------
|
| Sidebar-এর সব navigation URL এখানে register করা হলো।
|
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| SUPER ADMIN - SOFTWARE BILLING
|--------------------------------------------------------------------------
|
| /billing
|     -> routes/billing.js
|
| /billing/pay
|     -> routes/billing.js
|
| /billing/manual
|     -> routes/billingManual.js
|
| এখানে duplicate billing route রাখা হয়নি।
|
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| SUPER ADMIN - NOTICE / UPDATE
|--------------------------------------------------------------------------
*/

app.get(
    "/super-admin/notices",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Notice Board module is not implemented yet."
        );

    }
);

app.get(
    "/super-admin/notices/add",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "New Notice module is not implemented yet."
        );

    }
);

app.get(
    "/super-admin/updates",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Software Updates module is not implemented yet."
        );

    }
);

app.get(
    "/super-admin/upgrade",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Software Upgrade module is not implemented yet."
        );

    }
);


/*
|--------------------------------------------------------------------------
| SUPPORT
|--------------------------------------------------------------------------
*/

app.get(
    "/support",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "ISP Support module is not implemented yet."
        );

    }
);

app.get(
    "/support/tickets",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Support Tickets module is not implemented yet."
        );

    }
);


/*
|--------------------------------------------------------------------------
| OLT
|--------------------------------------------------------------------------
*/

app.get(
    "/olt",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "OLT List module is not implemented yet."
        );

    }
);

app.get(
    "/olt/onu",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "ONU List module is not implemented yet."
        );

    }
);


/*
|--------------------------------------------------------------------------
| AREA
|--------------------------------------------------------------------------
*/

app.get(
    "/areas",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Area module page is not implemented yet."
        );

    }
);


/*
|--------------------------------------------------------------------------
| ACTIVE PPPoE
|--------------------------------------------------------------------------
*/

app.get(
    "/customers/active-pppoe",
    requireSoftwareBilling,
    (req, res) => {

        return res.sendFile(
            path.join(
                __dirname,
                "views",
                "customers.html"
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| OTHER CUSTOMERS
|--------------------------------------------------------------------------
*/

app.get(
    "/customers/other",
    requireSoftwareBilling,
    (req, res) => {

        return res.sendFile(
            path.join(
                __dirname,
                "views",
                "customers.html"
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| REPORTS
|--------------------------------------------------------------------------
*/

app.get(
    "/reports/collection",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Collection Report module is not implemented yet."
        );

    }
);

app.get(
    "/reports/reseller-collection",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Reseller Collection Report module is not implemented yet."
        );

    }
);

app.get(
    "/reports/deposit",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Deposit Report module is not implemented yet."
        );

    }
);


/*
|--------------------------------------------------------------------------
| STAFF
|--------------------------------------------------------------------------
*/

app.get(
    "/staff/manager",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Manager module is not implemented yet."
        );

    }
);

app.get(
    "/staff/collector",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Collector module is not implemented yet."
        );

    }
);

app.get(
    "/staff/employee",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Employee module is not implemented yet."
        );

    }
);


/*
|--------------------------------------------------------------------------
| RESELLER
|--------------------------------------------------------------------------
*/

app.get(
    "/reseller",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Reseller module is not implemented yet."
        );

    }
);

app.get(
    "/reseller/recharge",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Reseller Recharge module is not implemented yet."
        );

    }
);

app.get(
    "/reseller/sms",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Reseller SMS module is not implemented yet."
        );

    }
);

app.get(
    "/reseller/withdrawal",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Reseller Withdrawal module is not implemented yet."
        );

    }
);


/*
|--------------------------------------------------------------------------
| BANDWIDTH
|--------------------------------------------------------------------------
*/

app.get(
    "/bandwidth",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Bandwidth module is not implemented yet."
        );

    }
);

app.get(
    "/bandwidth/reseller",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Bandwidth Reseller module is not implemented yet."
        );

    }
);

app.get(
    "/bandwidth/collection",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Bandwidth Collection module is not implemented yet."
        );

    }
);


/*
|--------------------------------------------------------------------------
| MESSAGE
|--------------------------------------------------------------------------
*/

app.get(
    "/message/send",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Bulk Message module is not implemented yet."
        );

    }
);

app.get(
    "/message/template",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "SMS Template module is not implemented yet."
        );

    }
);

app.get(
    "/message/log",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Message Log module is not implemented yet."
        );

    }
);


/*
|--------------------------------------------------------------------------
| ACCOUNTS
|--------------------------------------------------------------------------
*/

app.get(
    "/accounts/expenditure",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Expenditure module is not implemented yet."
        );

    }
);


/*
|--------------------------------------------------------------------------
| ACCOUNTS → INVOICES
|--------------------------------------------------------------------------
|
| একই invoices table ব্যবহার করবে।
|
| নতুন invoice তৈরি করবে না।
|
|--------------------------------------------------------------------------
*/

app.get(
    "/accounts/invoices",
    requireSoftwareBilling,
    (req, res) => {

        return res.sendFile(
            path.join(
                __dirname,
                "views",
                "billing-invoices.html"
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| ACTIVITY LOG
|--------------------------------------------------------------------------
*/

app.get(
    "/activity",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Activity Log module is not implemented yet."
        );

    }
);


/*
|--------------------------------------------------------------------------
| TUTORIAL
|--------------------------------------------------------------------------
*/

app.get(
    "/tutorial",
    requireSoftwareBilling,
    (req, res) => {

        return res.status(501).send(
            "Tutorial module is not implemented yet."
        );

    }
);


/*
|--------------------------------------------------------------------------
| 404
|--------------------------------------------------------------------------
*/

app.use(
    (req, res) => {

        return res.status(404).json({

            success:
                false,

            message:
                "Route not found."

        });

    }
);


/*
|--------------------------------------------------------------------------
| SERVER
|--------------------------------------------------------------------------
*/

const PORT =
    process.env.PORT ||
    3000;


app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "================================"
        );

        console.log(
            "ISP Billing Node.js Server"
        );

        console.log(
            `http://localhost:${PORT}`
        );

        console.log(
            "MySQL Session Store: ENABLED"
        );

        console.log(
            "Software Billing Gate: ENABLED"
        );

        console.log(
            "================================"
        );

    }
);