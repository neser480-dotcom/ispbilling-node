"use strict";

const express = require("express");
const session = require("express-session");
const MySQLStore =
    require("express-mysql-session")(session);
const cookieParser = require("cookie-parser");
const path = require("path");

const security = require("./middleware/security");

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
const adminPricingRoutes =
    require("./routes/admin/pricing");
const billingManualRoutes =
    require("./routes/billing/billingManual");

const billingRoutes =
    require("./routes/billing/billing");


/*
|--------------------------------------------------------------------------
| staff routes|--------------------------------------------------------------------------
*/
   const customerAutoExpireJob = require("./services/customers/customerAutoExpireJob");
const staffRoutes = require("./routes/staff/staff.routes");
const salaryRoutes = require("./routes/staff/salary.routes");
const collectorRoutes = require("./routes/staff/collector/collector.routes");
const managerRoutes = require("./routes/staff/manager/manager.routes");
/*
|--------------------------------------------------------------------------
| AUTH / REGISTER
|--------------------------------------------------------------------------
*/

const authRoutes =
    require("./routes/auth/auth");

const mobileRoutes = require("./routes/mobile");
const registerRoutes =
    require("./routes/auth/register");
const noticeRoutes = require("./routes/notices/notices");

/*
|--------------------------------------------------------------------------
| COMMON ROUTES
|--------------------------------------------------------------------------
*/

const sidebarRoutes =
    require("./routes/common/sidebar");

const areaRoutes =
    require("./routes/area/area");

const routerRoutes =
    require("./routes/mikrotik/router");

const dashboardRoutes =
    require("./routes/dashboard/dashboard.route");

const reportsRoutes =
    require("./routes/reports/reports");

const activityLogRoutes =
    require("./routes/activity/activity-log.server");

const expenditureRoutes = require("./routes/billing/expenditure.routes");

const oltRoutes = require("./routes/olt/olt");
const oltMonitorRoutes = require("./routes/olt/olt-monitor");
/*
|--------------------------------------------------------------------------
| CUSTOMER ROUTES
|--------------------------------------------------------------------------
*/

const customerRoutes =
    require("./routes/customers/customers");

const customerAddRoutes =
    require("./routes/customers/customers-add");

const customerRechargeRoutes =
    require("./routes/customers/customers-recharge");

const customerManageRoutes =
    require("./routes/customers/customers-manage");

const customerBulkRoutes =
    require("./routes/customers/customers-bulk");

/*
|--------------------------------------------------------------------------
| BULK RECHARGE
|--------------------------------------------------------------------------
*/

const customerBulkRechargeRoutes =
    require("./routes/customers/customers-bulk-recharge");

const customerCsvRoutes =
    require("./routes/customers/customers-csv");

const customerExtrasRoutes =
    require("./routes/customers/customers-extras");

const { multipart } =
    require("./middleware/multipart");

const activeCustomerRoutes =
    require("./routes/customers/activeCustomerRoutes");


/*
|--------------------------------------------------------------------------
| MONITORING ROUTES
|--------------------------------------------------------------------------
*/

const monitoringRoutes =
    require("./routes/monitoring/monitoring");

const interfaceMonitorRoutes =
    require("./routes/monitoring/interfaceMonitor");

const customerTrafficRoutes =
    require("./routes/monitoring/customerTraffic");


/*
|--------------------------------------------------------------------------
| SOFTWARE BILLING
|--------------------------------------------------------------------------
*/

const softwareBillingRoutes =
    require("./routes/software-billing/softwareBilling");
const billingExtendRoutes = require("./routes/software-billing/billingExtend");
const monthlyBilling = require("./services/monthlyBilling");

const {
    requireSoftwareBilling
} = require("./middleware/softwareBilling");

const paymentGatewayRoutes =
    require("./routes/billing/paymentGateway");


/*
|--------------------------------------------------------------------------
| EXPRESS APP
|--------------------------------------------------------------------------
*/

const app =
    express();

app.disable("x-powered-by");
app.use(security.headers());
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY));

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
| MULTIPART
|--------------------------------------------------------------------------
*/

app.use(
    multipart()
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
            (() => {
                if (process.env.NODE_ENV === "production") {
                    throw new Error("SESSION_SECRET is required in production");
                }
                return "ispbilling_node_test_secret";
            })(),

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
                process.env.COOKIE_SECURE === "true",

            path:
                "/"

        }

    })
);

app.use(require("./middleware/request-context"));
require("./config/activity-log-patch")(require("./config/database"));


/*
|--------------------------------------------------------------------------
| CSRF TOKEN API
|--------------------------------------------------------------------------
*/

app.get(
    "/api/csrf-token",
    (req, res) => {

        if (
            !req.session ||
            !req.session.user_id
        ) {

            return res.status(401).json({

                success:
                    false,

                message:
                    "Not logged in."

            });

        }


        if (
            !req.session.csrf_token
        ) {

            const crypto =
                require("crypto");

            req.session.csrf_token =
                crypto
                    .randomBytes(32)
                    .toString("hex");

        }


        return res.json({

            success:
                true,

            csrf_token:
                req.session.csrf_token

        });

    }
);


/*
|--------------------------------------------------------------------------
| STATIC FILES
|--------------------------------------------------------------------------
*/

app.use("/api/auth/login", security.authLimiter());
app.use("/api/register", security.authLimiter());
app.use(security.sameOriginGuard);
app.use(security.csrfTokenCheck);

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
*/

app.use(
    "/api/auth",
    authRoutes
);


/*
|--------------------------------------------------------------------------
| MOBILE API (Bearer token; Web session/CSRF থেকে আলাদা)
|--------------------------------------------------------------------------
*/

app.use("/api/mobile", mobileRoutes);

/*
|--------------------------------------------------------------------------
| REGISTER API
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
*/

app.use(
    "/api/software-billing",
    softwareBillingRoutes
);

app.use("/super-admin/billing-extend", requireSoftwareBilling, billingExtendRoutes);
app.use(
    "/api/olt",
    requireSoftwareBilling,
    oltRoutes
);
app.use(
    "/api/olt-monitor",
    requireSoftwareBilling,
    oltMonitorRoutes
);
/*
|--------------------------------------------------------------------------
| BILLING
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
*/

app.use(
    "/billing/manual",
    billingManualRoutes
);


/*
|--------------------------------------------------------------------------
| SIDEBAR API
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

app.use(
    "/super-admin/pricing",
    requireSoftwareBilling,
    adminPricingRoutes
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
| DASHBOARD API
|--------------------------------------------------------------------------
*/

app.use(
    "/api/dashboard",
    requireSoftwareBilling,
    dashboardRoutes
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
|
| IMPORTANT:
|
| Bulk Recharge must be registered BEFORE the generic
| customer bulk routes so that:
|
| POST /api/customers/bulk-recharge
|
| reaches:
|
| routes/customers-bulk-recharge.js
|
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| BULK RECHARGE
|--------------------------------------------------------------------------
*/

app.use(
    "/api/customers",
    requireSoftwareBilling,
    customerBulkRechargeRoutes
);


/*
|--------------------------------------------------------------------------
| CUSTOMER RECHARGE
|--------------------------------------------------------------------------
*/

app.use(
    "/api/customers",
    requireSoftwareBilling,
    customerRechargeRoutes
);


/*
|--------------------------------------------------------------------------
| CUSTOMER MANAGE
|--------------------------------------------------------------------------
*/

app.use(
    "/api/customers",
    requireSoftwareBilling,
    customerManageRoutes
);


/*
|--------------------------------------------------------------------------
| CUSTOMER BULK
|--------------------------------------------------------------------------
*/

app.use(
    "/api/customers",
    requireSoftwareBilling,
    customerBulkRoutes
);


/*
|--------------------------------------------------------------------------
| CUSTOMER CSV
|--------------------------------------------------------------------------
*/

app.use(
    "/api/customers",
    requireSoftwareBilling,
    customerCsvRoutes
);


/*
|--------------------------------------------------------------------------
| CUSTOMER EXTRAS (Note, Activity Log, Reset Password)
|--------------------------------------------------------------------------
| Must be BEFORE customerRoutes, because customerRoutes has "/:id".
|--------------------------------------------------------------------------
*/

app.use(
    "/api/customers",
    requireSoftwareBilling,
    customerExtrasRoutes
);


/*
|--------------------------------------------------------------------------
| CUSTOMER LIST
|--------------------------------------------------------------------------
*/

app.use(
    "/api/customers",
    requireSoftwareBilling,
    customerRoutes
);


/*
|--------------------------------------------------------------------------
| CUSTOMER ADD
|--------------------------------------------------------------------------
*/

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

app.use(
    "/accounts/expenditure",
    requireSoftwareBilling,
    expenditureRoutes
);

/*
|--------------------------------------------------------------------------
| staff page
|--------------------------------------------------------------------------
*/

app.use(
    "/api/staff",
    requireSoftwareBilling,
    staffRoutes
);
app.use(
    "/api/staff/salary",
    requireSoftwareBilling,
    salaryRoutes
);

app.use(
    "/api/collectors",
    requireSoftwareBilling,
    collectorRoutes
);
app.use(
    "/api/managers",
    requireSoftwareBilling,
    managerRoutes
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
                "auth", "login.html"
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
                "auth", "register.html"
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| SOFTWARE BILLING PAGE
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
                "software-billing",
                "software-billing.html"
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| SOFTWARE BILLING RECEIPT PAGE
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
                "software-billing",
                "software-billing-receipt.html"
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| DASHBOARD
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
                "dashboard", "dashboard.html"
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| MIKROTIK ROUTER MANAGER
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


        if (
            Number.isInteger(routerId) &&
            routerId > 0
        ) {

            return res.sendFile(
                path.join(
                    __dirname,
                    "views",
                    "mikrotik",
                    "mikrotik-config.html"
                )
            );

        }


        return res.sendFile(
            path.join(
                __dirname,
                "views",
                "mikrotik",
                "router-index.html"
            )
        );

    }
);


app.get(
    "/mikrotik/cross-customer",
    requireSoftwareBilling,
    (req, res) => {

        return res.sendFile(
            path.join(
                __dirname,
                "views",
                "mikrotik",
                "cross-customer.html"
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
                "customers", "customers.html"
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
                "customers", "customer-add.html"
            )
        );

    }
);
app.get(
    "/customers/add/modal",
    requireSoftwareBilling,
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                "views",
                "customers", "customer-add.html"
            )
        );
    }
);

/*
|--------------------------------------------------------------------------
| SUPER ADMIN - NOTICE / UPDATE
|--------------------------------------------------------------------------
*/

/* Notice Board (Super Admin) */
app.use(
    "/super-admin/notices",
    requireSoftwareBilling,
    noticeRoutes.admin
);

app.use(
    "/api/notices",
    requireSoftwareBilling,
    noticeRoutes.active
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
        return res.sendFile(
            path.join(
                __dirname,
                "views",
                "olt",
                "olt-list.html"
            )
        );
    }
);

app.get(
    "/olt/onu",
    requireSoftwareBilling,
    (req, res) => {
        return res.sendFile(
            path.join(
                __dirname,
                "views",
                "olt",
                "olt-users.html"
            )
        );
    }
);
app.get(
    "/olt_monitoring",
    requireSoftwareBilling,
    (req, res) => {
        res.sendFile(
            require("path").join(
                __dirname,
                "views",
                "olt",
                "olt_monitoring.html"
            )
        );
    }
);

/*
|--------------------------------------------------------------------------
| AREA PAGE
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
                "customers", "customers.html"
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
                "customers", "other-customer.html"
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| REPORTS
|--------------------------------------------------------------------------
*/

app.use(
    "/reports",
    requireSoftwareBilling,
    reportsRoutes
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
        return res.sendFile(
            path.join(
                __dirname,
                "views",
                "staff",
                "manager",
                "manager.html"
            )
        );
    }
);
/*
|--------------------------------------------------------------------------
| STAFF SALARY PAGE
|--------------------------------------------------------------------------
*/

app.get(
    "/staff/salary",
    requireSoftwareBilling,
    (req, res) => {

        return res.sendFile(
            path.join(
                __dirname,
                "views",
                "staff",
                "salary",
                "employee-salary.html"
            )
        );

    }
);
app.get(
    "/staff/collector",
    requireSoftwareBilling,
    (req, res) => {
        return res.sendFile(
            path.join(
                __dirname,
                "views",
                "staff",
                "collector",
                "collector.html"
            )
        );
    }
);

app.get(
    ["/staff/employee", "/staff/employee/employee.html"],
    requireSoftwareBilling,
    (req, res) => {
        return res.sendFile(
            path.join(__dirname, "views", "staff", "employee", "employee.html")
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



/*
|--------------------------------------------------------------------------
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
                "billing",
                "invoices",
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

app.use(
    "/activity",
    requireSoftwareBilling,
    activityLogRoutes
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


// CENTRAL ERROR HANDLER
app.use((err, req, res, next) => {
    console.error("[APP ERROR]", {
        method: req.method,
        path: req.path,
        code: err.code || null,
        message: err.message || "Unknown error"
    });

    if (res.headersSent) return next(err);

    let status = Number(err.status || err.statusCode) || 500;
    let code = "INTERNAL_SERVER_ERROR";
    let message = "সার্ভারে সমস্যা হয়েছে। আবার চেষ্টা করুন।";
    if (err.code === "ER_DUP_ENTRY") {
        status = 409;
        code = "DUPLICATE_ENTRY";
        message = "এই তথ্যটি আগেই রয়েছে।";
    } else if (
        err.code === "ER_NO_REFERENCED_ROW_2" ||
        err.code === "ER_ROW_IS_REFERENCED_2"
    ) {
        status = 409;
        code = "DATABASE_RELATION_ERROR";
        message = "এই তথ্যের সঙ্গে সম্পর্কিত অন্য রেকর্ড আছে।";
    } else if (
        err.code === "ECONNREFUSED" ||
        err.code === "PROTOCOL_CONNECTION_LOST" ||
        err.code === "ETIMEDOUT"
    ) {
        status = 503;
        code = "DATABASE_CONNECTION_ERROR";
        message = "ডাটাবেজে সংযোগ করা যাচ্ছে না।";
    } else if (status === 401) {
        message = "আবার লগইন করুন।";
    } else if (status === 403) {
        message = "এই কাজ করার অনুমতি নেই।";
    } else if (status === 400) {
        message = "আপনার দেওয়া তথ্য যাচাই করুন।";
    }

    if (status < 400 || status > 599) status = 500;

    if (req.path.startsWith("/api/")) {
        return res.status(status).json({
            success: false,
            code,
            message
        });
    }

    return res.status(status).send(message);
});


// 404 HANDLER
app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({
            success: false,
            code: "API_ROUTE_NOT_FOUND",
            message: "API endpoint পাওয়া যায়নি।"
        });
    }

    return res.status(404).send("এই পেজটি পাওয়া যায়নি।");
});

/*
|--------------------------------------------------------------------------
| SERVER
|--------------------------------------------------------------------------
*/

const PORT =
    process.env.PORT ||
    5500;


monthlyBilling.start();
customerAutoExpireJob.start();     // <-- এই লাইনটা নতুন


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

