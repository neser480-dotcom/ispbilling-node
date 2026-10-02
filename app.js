const express = require("express");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const cookieParser = require("cookie-parser");
const path = require("path");

require("dotenv").config();

const authRoutes = require("./routes/auth");
const registerRoutes = require("./routes/register");
const sidebarRoutes = require("./routes/sidebar");
const areaRoutes = require("./routes/area");
const routerRoutes = require("./routes/router");
const customerRoutes = require("./routes/customers");
const customerAddRoutes =
    require("./routes/customers-add");
const monitoringRoutes =
    require("./routes/monitoring");
const interfaceMonitorRoutes =
    require("./routes/interfaceMonitor");
const customerTrafficRoutes =
    require("./routes/customerTraffic");
const app = express();


/*
|--------------------------------------------------------------------------
| BODY PARSER
|--------------------------------------------------------------------------
*/

app.use(express.json());

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

app.use(cookieParser());


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

        createDatabaseTable: true,

        clearExpired: true,

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

        name: "ispbilling.sid",

        secret:
            process.env.SESSION_SECRET ||
            "ispbilling_node_test_secret",

        store:
            sessionStore,

        resave: false,

        saveUninitialized: false,

        rolling: true,

        cookie: {

            httpOnly: true,

            maxAge:
                24 * 60 * 60 * 1000,

            sameSite: "lax",

            secure: false,

            path: "/"

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
*/

app.use(
    "/api/auth",
    authRoutes
);


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
| SIDEBAR API
|--------------------------------------------------------------------------
*/

app.use(
    "/api/sidebar",
    sidebarRoutes
);


/*
|--------------------------------------------------------------------------
| AREA API
|--------------------------------------------------------------------------
*/

app.use(
    "/areas",
    areaRoutes
);


/*
|--------------------------------------------------------------------------
| MIKROTIK ROUTER API
|--------------------------------------------------------------------------
*/

app.use(
    "/api/router",
    routerRoutes
);
app.use("/api/customers", customerRoutes);
app.use(
    "/api/customers/add",
    customerAddRoutes
);
/*
|--------------------------------------------------------------------------
| CUSTOMER TRAFFIC MONITORING
|--------------------------------------------------------------------------
*/
app.use(
    "/monitoring/interface",
    interfaceMonitorRoutes
);

app.use(
    "/monitoring/customer-traffic",
    customerTrafficRoutes
);


/*
|--------------------------------------------------------------------------
| NETWORK FAULT MONITORING
|--------------------------------------------------------------------------
*/

app.use(
    "/monitoring",
    monitoringRoutes
);

app.use(
    "/api/monitoring",
    monitoringRoutes
);

/*
|--------------------------------------------------------------------------
| LOGIN PAGE
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "views",
            "login.html"
        )
    );

});


/*
|--------------------------------------------------------------------------
| REGISTER PAGE
|--------------------------------------------------------------------------
*/

app.get("/register", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "views",
            "register.html"
        )
    );

});


/*
|--------------------------------------------------------------------------
| DASHBOARD
|--------------------------------------------------------------------------
*/

app.get("/dashboard", (req, res) => {

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
            "dashboard.html"
        )
    );

});


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

app.get("/mikrotik", (req, res) => {

    /*
    |--------------------------------------------------------------------------
    | LOGIN CHECK
    |--------------------------------------------------------------------------
    */

    if (
        !req.session ||
        !req.session.user_id
    ) {

        return res.redirect("/");

    }


    /*
    |--------------------------------------------------------------------------
    | ROUTER ID
    |--------------------------------------------------------------------------
    */

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

});

app.get("/customers", (req, res) => {

    if (!req.session || !req.session.user_id) {
        return res.redirect("/");
    }

    return res.sendFile(
        path.join(
            __dirname,
            "views",
            "customers.html"
        )
    );
});
app.get("/customers/add", (req, res) => {

    if (!req.session || !req.session.user_id) {
        return res.redirect("/");
    }

    return res.sendFile(
        path.join(
            __dirname,
            "views",
            "customer-add.html"
        )
    );
});
/*
|--------------------------------------------------------------------------
| 404
|--------------------------------------------------------------------------
*/

app.use((req, res) => {

    res.status(404).json({

        success: false,

        message:
            "Route not found."

    });

});


/*
|--------------------------------------------------------------------------
| SERVER
|--------------------------------------------------------------------------
*/

const PORT =
    process.env.PORT || 3000;


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
            "================================"
        );

    }
);