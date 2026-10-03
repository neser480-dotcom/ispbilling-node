"use strict";

const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| DATABASE
|--------------------------------------------------------------------------
*/

const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "ispbilling",

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4"
});


/*
|--------------------------------------------------------------------------
| AUTH
|--------------------------------------------------------------------------
*/

function isLoggedIn(req) {
    return !!(
        req.session &&
        req.session.user_id
    );
}


function requireLoginPage(req, res, next) {

    if (!isLoggedIn(req)) {
        return res.redirect("/");
    }

    next();
}


function requireLoginApi(req, res, next) {

    if (!isLoggedIn(req)) {
        return res.status(401).json({
            status: false,
            message: "Authentication required."
        });
    }

    next();
}


/*
|--------------------------------------------------------------------------
| COMPANY SCOPE
|--------------------------------------------------------------------------
*/

function getCompanyScope(req, alias) {

    const role =
        String(
            req.session?.role || ""
        )
        .trim()
        .toLowerCase();

    const companyId =
        Number(
            req.session?.company_id || 0
        );

    if (role === "super_admin") {

        return {
            sql: "1=1",
            params: []
        };
    }

    if (companyId <= 0) {

        return {
            sql: "1=0",
            params: []
        };
    }

    return {
        sql: `${alias}.company_id = ?`,
        params: [companyId]
    };
}


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function clean(value) {

    return String(
        value === undefined ||
        value === null
            ? ""
            : value
    ).trim();
}


function number(value, fallback = 0) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
}


function escapeCsv(value) {

    let text = "";

    if (
        value !== undefined &&
        value !== null
    ) {
        text = String(value);
    }

    return `"${text.replace(/"/g, '""')}"`;
}


/*
|--------------------------------------------------------------------------
| PAGE ROUTES
|--------------------------------------------------------------------------
*/

router.get(
    "/collection",
    requireLoginPage,
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "..",
                "views",
                "report-collection.html"
            )
        );
    }
);


router.get(
    "/reseller-collection",
    requireLoginPage,
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "..",
                "views",
                "report-reseller-collection.html"
            )
        );
    }
);


router.get(
    "/deposit",
    requireLoginPage,
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "..",
                "views",
                "report-deposit.html"
            )
        );
    }
);

/*
|--------------------------------------------------------------------------
| COLLECTION REPORT API
|--------------------------------------------------------------------------
*/

router.get(
    "/api/collection",
    requireLoginApi,
    async (req, res) => {

        try {

            const search =
                clean(req.query.search);

            let fromDate =
                clean(req.query.from_date);

            let toDate =
                clean(req.query.to_date);


            /*
            |--------------------------------------------------------------------------
            | DEFAULT = CURRENT MONTH
            |--------------------------------------------------------------------------
            */

            if (
                fromDate === "" &&
                toDate === ""
            ) {

                const now =
                    new Date();

                const year =
                    now.getFullYear();

                const month =
                    String(
                        now.getMonth() + 1
                    ).padStart(2, "0");

                fromDate =
                    `${year}-${month}-01`;

                const lastDay =
                    new Date(
                        year,
                        now.getMonth() + 1,
                        0
                    ).getDate();

                toDate =
                    `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
            }


            /*
            |--------------------------------------------------------------------------
            | IF ONLY FROM DATE IS GIVEN
            |--------------------------------------------------------------------------
            */

            if (
                fromDate !== "" &&
                toDate === ""
            ) {

                toDate =
                    fromDate;
            }


            /*
            |--------------------------------------------------------------------------
            | IF ONLY TO DATE IS GIVEN
            |--------------------------------------------------------------------------
            */

            if (
                fromDate === "" &&
                toDate !== ""
            ) {

                fromDate =
                    toDate;
            }


            const page =
                Math.max(
                    1,
                    Math.floor(
                        number(
                            req.query.page,
                            1
                        )
                    )
                );


            const limit =
                Math.min(
                    100000,
                    Math.max(
                        10,
                        Math.floor(
                            number(
                                req.query.limit,
                                100
                            )
                        )
                    )
                );


            const offset =
                (page - 1) * limit;


            /*
            |--------------------------------------------------------------------------
            | COMPANY SCOPE
            |--------------------------------------------------------------------------
            */

            const scope =
                getCompanyScope(
                    req,
                    "b"
                );


            let where = [
                scope.sql
            ];

            let params = [
                ...scope.params
            ];


            /*
            |--------------------------------------------------------------------------
            | ONLY ACTUAL COLLECTIONS
            |--------------------------------------------------------------------------
            |
            | bill_reports.payment_id -> payments.id
            |
            | This prevents normal/unpaid bill rows from appearing.
            |
            */

            where.push(`
                b.payment_id IS NOT NULL
            `);

            where.push(`
                b.collected_amount > 0
            `);

            where.push(`
                p.id IS NOT NULL
            `);

            where.push(`
                p.deleted_at IS NULL
            `);


            /*
            |--------------------------------------------------------------------------
            | SEARCH
            |--------------------------------------------------------------------------
            */

            if (search !== "") {

                where.push(`
                    (
                        CAST(b.user_id AS CHAR) LIKE ?
                        OR b.customer_name LIKE ?
                        OR b.pppoe_username LIKE ?
                        OR b.note LIKE ?
                        OR b.collected_by LIKE ?
                        OR b.package_name LIKE ?
                        OR b.area_name LIKE ?
                        OR b.medium LIKE ?
                        OR b.bill_type LIKE ?
                    )
                `);

                const q =
                    `%${search}%`;

                params.push(
                    q,
                    q,
                    q,
                    q,
                    q,
                    q,
                    q,
                    q,
                    q
                );
            }


            /*
            |--------------------------------------------------------------------------
            | DATE FILTER
            |--------------------------------------------------------------------------
            */

            if (fromDate !== "") {

                where.push(
                    "DATE(b.created_at) >= ?"
                );

                params.push(
                    fromDate
                );
            }


            if (toDate !== "") {

                where.push(
                    "DATE(b.created_at) <= ?"
                );

                params.push(
                    toDate
                );
            }


            const whereSql =
                where.join(" AND ");


            /*
            |--------------------------------------------------------------------------
            | SUMMARY
            |--------------------------------------------------------------------------
            */

            const [[summary]] =
                await pool.query(
                    `
                    SELECT

                        COUNT(b.id) AS total_data,

                        COALESCE(
                            SUM(b.collected_amount),
                            0
                        ) AS total_bill

                    FROM bill_reports b

                    INNER JOIN payments p
                        ON p.id = b.payment_id

                    WHERE ${whereSql}
                    `,
                    params
                );


            /*
            |--------------------------------------------------------------------------
            | COUNT
            |--------------------------------------------------------------------------
            */

            const [[countRow]] =
                await pool.query(
                    `
                    SELECT
                        COUNT(b.id) AS total

                    FROM bill_reports b

                    INNER JOIN payments p
                        ON p.id = b.payment_id

                    WHERE ${whereSql}
                    `,
                    params
                );


            /*
            |--------------------------------------------------------------------------
            | DATA
            |--------------------------------------------------------------------------
            */

            const [rows] =
                await pool.query(
                    `
                    SELECT

                        b.id,
                        b.company_id,
                        b.user_id,
                        b.connection_type,
                        b.customer_name,
                        b.area_name,
                        b.pppoe_username,
                        b.package_name,
                        b.bill_amount,
                        b.discount,
                        b.due_amount,
                        b.collected_amount,
                        b.medium,
                        b.bill_type,
                        b.collected_by,
                        b.collector_role,
                        b.note,
                        b.created_at,
                        b.payment_id

                    FROM bill_reports b

                    INNER JOIN payments p
                        ON p.id = b.payment_id

                    WHERE ${whereSql}

                    ORDER BY b.id DESC

                    LIMIT ${limit}
                    OFFSET ${offset}
                    `,
                    params
                );


            const total =
                Number(
                    countRow.total || 0
                );


            return res.json({

                status: true,

                summary: {

                    total_data:
                        Number(
                            summary.total_data || 0
                        ),

                    total_bill:
                        Number(
                            summary.total_bill || 0
                        )
                },

                pagination: {

                    page,

                    limit,

                    total,

                    totalPages:
                        Math.ceil(
                            total / limit
                        )
                },

                filters: {

                    from_date:
                        fromDate,

                    to_date:
                        toDate
                },

                collections:
                    rows

            });

        } catch (error) {

            console.error(
                "Collection report error:",
                error
            );

            return res.status(500).json({

                status: false,

                message:
                    "Unable to load collection report.",

                error:
                    process.env.NODE_ENV === "development"
                        ? error.message
                        : undefined
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| RESELLER LIST
|--------------------------------------------------------------------------
*/

router.get(
    "/api/resellers",
    requireLoginApi,
    async (req, res) => {

        try {

            const scope =
                getCompanyScope(
                    req,
                    "c"
                );


            const [rows] =
                await pool.query(
                    `
                    SELECT
                        c.reseller_id,
                        MAX(c.name) AS reseller_name
                    FROM customers c
                    WHERE
                        ${scope.sql}
                        AND c.reseller_id IS NOT NULL
                        AND c.reseller_id > 0
                    GROUP BY c.reseller_id
                    ORDER BY reseller_name ASC
                    `,
                    scope.params
                );


            return res.json({
                status: true,
                resellers: rows
            });

        } catch (error) {

            console.error(
                "Reseller list error:",
                error
            );

            return res.status(500).json({
                status: false,
                message:
                    "Unable to load resellers."
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| RESELLER COLLECTION REPORT
|--------------------------------------------------------------------------
*/

router.get(
    "/api/reseller-collection",
    requireLoginApi,
    async (req, res) => {

        try {

            const search =
                clean(req.query.search);

            const fromDate =
                clean(req.query.from_date);

            const toDate =
                clean(req.query.to_date);

            const resellerId =
                number(
                    req.query.reseller_id,
                    0
                );

            const page =
                Math.max(
                    1,
                    number(req.query.page, 1)
                );

            const limit =
                Math.min(
                    100000,
                    Math.max(
                        10,
                        number(
                            req.query.limit,
                            100
                        )
                    )
                );

            const offset =
                (page - 1) * limit;


            const scope =
                getCompanyScope(
                    req,
                    "c"
                );


            let where = [
                scope.sql
            ];

            let params = [
                ...scope.params
            ];


            if (resellerId > 0) {

                where.push(
                    "c.reseller_id = ?"
                );

                params.push(resellerId);
            }


            if (search !== "") {

                where.push(`
                    (
                        CAST(c.customer_id AS CHAR) LIKE ?
                        OR c.name LIKE ?
                        OR c.phone LIKE ?
                        OR c.pppoe_username LIKE ?
                        OR c.package_name LIKE ?
                        OR br.note LIKE ?
                        OR br.collected_by LIKE ?
                        OR br.medium LIKE ?
                        OR br.bill_type LIKE ?
                    )
                `);

                const q =
                    `%${search}%`;

                params.push(
                    q,
                    q,
                    q,
                    q,
                    q,
                    q,
                    q,
                    q,
                    q
                );
            }


            if (fromDate !== "") {

                where.push(
                    "DATE(br.created_at) >= ?"
                );

                params.push(fromDate);
            }


            if (toDate !== "") {

                where.push(
                    "DATE(br.created_at) <= ?"
                );

                params.push(toDate);
            }


            const whereSql =
                where.join(" AND ");


            const [[summary]] =
                await pool.query(
                    `
                    SELECT
                        COUNT(br.id) AS total_data,
                        COALESCE(
                            SUM(br.collected_amount),
                            0
                        ) AS total_bill
                    FROM bill_reports br

                    INNER JOIN payments p
                        ON p.id = br.payment_id

                    INNER JOIN customers c
                        ON c.id = p.customer_id

                    WHERE ${whereSql}
                    `,
                    params
                );


            const [[countRow]] =
                await pool.query(
                    `
                    SELECT COUNT(*) AS total
                    FROM bill_reports br

                    INNER JOIN payments p
                        ON p.id = br.payment_id

                    INNER JOIN customers c
                        ON c.id = p.customer_id

                    WHERE ${whereSql}
                    `,
                    params
                );


            const [rows] =
                await pool.query(
                    `
                    SELECT

                        br.id,
                        br.payment_id,

                        br.company_id,

                        br.connection_type,

                        br.area_name,

                        br.package_name,

                        br.bill_amount,
                        br.discount,
                        br.due_amount,
                        br.collected_amount,

                        br.medium,
                        br.bill_type,

                        br.collected_by,
                        br.collector_role,

                        br.note,
                        br.created_at,

                        c.id AS database_customer_id,
                        c.customer_id AS software_customer_id,
                        c.name AS customer_real_name,
                        c.phone AS customer_phone,
                        c.address AS customer_address,
                        c.pppoe_username,
                        c.reseller_id

                    FROM bill_reports br

                    INNER JOIN payments p
                        ON p.id = br.payment_id

                    INNER JOIN customers c
                        ON c.id = p.customer_id

                    WHERE ${whereSql}

                    ORDER BY br.id DESC

                    LIMIT ? OFFSET ?
                    `,
                    [
                        ...params,
                        limit,
                        offset
                    ]
                );


            const collections =
                rows.map(row => ({

                    id:
                        row.id,

                    payment_id:
                        row.payment_id,

                    customer_id:
                        row.software_customer_id,

                    database_customer_id:
                        row.database_customer_id,

                    name_info: {

                        name:
                            row.customer_real_name,

                        pppoe:
                            row.pppoe_username || "",

                        phone:
                            row.customer_phone || "",

                        address:
                            row.customer_address || "",

                        area:
                            row.area_name || ""
                    },

                    package_bill: {

                        package:
                            row.package_name || "",

                        bill:
                            Number(
                                row.bill_amount || 0
                            )
                    },

                    discount:
                        Number(
                            row.discount || 0
                        ),

                    due:
                        Number(
                            row.due_amount || 0
                        ),

                    medium_type: {

                        medium:
                            row.medium || "",

                        type:
                            row.bill_type || ""
                    },

                    collected:
                        Number(
                            row.collected_amount || 0
                        ),

                    commission: 0,

                    collected_by:
                        row.collected_by || "",

                    collector_role:
                        row.collector_role || "",

                    note:
                        row.note || "",

                    date:
                        row.created_at
                }));


            const total =
                Number(countRow.total || 0);


            return res.json({

                status: true,

                summary: {

                    total_data:
                        Number(
                            summary.total_data || 0
                        ),

                    total_bill:
                        Number(
                            summary.total_bill || 0
                        )
                },

                pagination: {

                    page,
                    limit,
                    total,

                    totalPages:
                        Math.ceil(
                            total / limit
                        )
                },

                collections

            });

        } catch (error) {

            console.error(
                "Reseller collection error:",
                error
            );

            return res.status(500).json({

                status: false,

                message:
                    "Unable to load reseller collection report.",

                error:
                    process.env.NODE_ENV === "development"
                        ? error.message
                        : undefined
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| DEPOSIT TABLE DETECTION
|--------------------------------------------------------------------------
|
| Deposit module is newly created because the old Deposit.php/schema
| was not available.
|
*/

const DEPOSIT_TABLES = [
    "deposits",
    "deposit",
    "account_deposits",
    "reseller_deposits",
    "collector_deposits"
];


async function detectDepositTable() {

    const placeholders =
        DEPOSIT_TABLES
            .map(() => "?")
            .join(",");


    const [tables] =
        await pool.query(
            `
            SELECT TABLE_NAME
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = ?
            AND TABLE_NAME IN (${placeholders})
            ORDER BY FIELD(
                TABLE_NAME,
                ${DEPOSIT_TABLES.map(() => "?").join(",")}
            )
            LIMIT 1
            `,
            [
                process.env.DB_NAME || "ispbilling",
                ...DEPOSIT_TABLES,
                ...DEPOSIT_TABLES
            ]
        );


    if (!tables.length) {
        return null;
    }


    return tables[0].TABLE_NAME;
}


async function getColumns(table) {

    const [rows] =
        await pool.query(
            `SHOW COLUMNS FROM \`${table}\``
        );

    return rows.map(
        row => row.Field
    );
}


function firstExisting(
    columns,
    candidates
) {

    for (const name of candidates) {

        if (columns.includes(name)) {
            return name;
        }
    }

    return null;
}


/*
|--------------------------------------------------------------------------
| DEPOSIT REPORT API
|--------------------------------------------------------------------------
*/

router.get(
    "/api/deposit",
    requireLoginApi,
    async (req, res) => {

        try {

            const table =
                await detectDepositTable();


            if (!table) {

                return res.json({

                    status: true,

                    available: false,

                    message:
                        "No deposit table was found in the current database.",

                    summary: {
                        total_data: 0,
                        total_amount: 0
                    },

                    pagination: {
                        page: 1,
                        limit: 100,
                        total: 0,
                        totalPages: 0
                    },

                    deposits: []
                });
            }


            const columns =
                await getColumns(table);


            const idColumn =
                firstExisting(
                    columns,
                    [
                        "id",
                        "deposit_id"
                    ]
                );


            const amountColumn =
                firstExisting(
                    columns,
                    [
                        "amount",
                        "deposit_amount",
                        "total_amount",
                        "deposit"
                    ]
                );


            const dateColumn =
                firstExisting(
                    columns,
                    [
                        "deposit_date",
                        "payment_date",
                        "created_at",
                        "date"
                    ]
                );


            if (!amountColumn || !dateColumn) {

                return res.json({

                    status: true,

                    available: false,

                    message:
                        `Deposit table "${table}" does not contain a usable amount/date structure.`,

                    summary: {
                        total_data: 0,
                        total_amount: 0
                    },

                    pagination: {
                        page: 1,
                        limit: 100,
                        total: 0,
                        totalPages: 0
                    },

                    deposits: []
                });
            }


            const companyColumn =
                firstExisting(
                    columns,
                    [
                        "company_id"
                    ]
                );


            const methodColumn =
                firstExisting(
                    columns,
                    [
                        "payment_method",
                        "method",
                        "medium"
                    ]
                );


            const noteColumn =
                firstExisting(
                    columns,
                    [
                        "note",
                        "comments",
                        "description"
                    ]
                );


            const userColumn =
                firstExisting(
                    columns,
                    [
                        "created_by",
                        "user_id",
                        "collected_by"
                    ]
                );


            const search =
                clean(req.query.search);

            const fromDate =
                clean(req.query.from_date);

            const toDate =
                clean(req.query.to_date);

            const page =
                Math.max(
                    1,
                    number(req.query.page, 1)
                );

            const limit =
                Math.min(
                    100000,
                    Math.max(
                        10,
                        number(
                            req.query.limit,
                            100
                        )
                    )
                );

            const offset =
                (page - 1) * limit;


            let where = [];
            let params = [];


            if (companyColumn) {

                const scope =
                    getCompanyScope(
                        req,
                        "d"
                    );

                where.push(
                    scope.sql
                );

                params.push(
                    ...scope.params
                );

            } else {

                const role =
                    String(
                        req.session?.role || ""
                    )
                    .trim()
                    .toLowerCase();

                if (role !== "super_admin") {

                    const companyId =
                        Number(
                            req.session?.company_id || 0
                        );

                    if (companyId <= 0) {

                        where.push("1=0");

                    } else {

                        return res.json({

                            status: true,
                            available: false,

                            message:
                                "Deposit table has no company_id column, so tenant isolation cannot be guaranteed.",

                            summary: {
                                total_data: 0,
                                total_amount: 0
                            },

                            pagination: {
                                page,
                                limit,
                                total: 0,
                                totalPages: 0
                            },

                            deposits: []
                        });
                    }
                }
            }


            if (search !== "") {

                const searchParts = [];


                if (methodColumn) {

                    searchParts.push(
                        `d.\`${methodColumn}\` LIKE ?`
                    );

                    params.push(
                        `%${search}%`
                    );
                }


                if (noteColumn) {

                    searchParts.push(
                        `d.\`${noteColumn}\` LIKE ?`
                    );

                    params.push(
                        `%${search}%`
                    );
                }


                if (userColumn) {

                    searchParts.push(
                        `CAST(d.\`${userColumn}\` AS CHAR) LIKE ?`
                    );

                    params.push(
                        `%${search}%`
                    );
                }


                if (searchParts.length) {

                    where.push(
                        `(${searchParts.join(" OR ")})`
                    );
                }
            }


            if (fromDate) {

                where.push(
                    `DATE(d.\`${dateColumn}\`) >= ?`
                );

                params.push(fromDate);
            }


            if (toDate) {

                where.push(
                    `DATE(d.\`${dateColumn}\`) <= ?`
                );

                params.push(toDate);
            }


            if (!where.length) {

                where.push("1=1");
            }


            const whereSql =
                where.join(" AND ");


            const [[summary]] =
                await pool.query(
                    `
                    SELECT
                        COUNT(*) AS total_data,
                        COALESCE(
                            SUM(d.\`${amountColumn}\`),
                            0
                        ) AS total_amount
                    FROM \`${table}\` d
                    WHERE ${whereSql}
                    `,
                    params
                );


            const [[countRow]] =
                await pool.query(
                    `
                    SELECT COUNT(*) AS total
                    FROM \`${table}\` d
                    WHERE ${whereSql}
                    `,
                    params
                );


            const selectColumns = [

                idColumn
                    ? `d.\`${idColumn}\` AS id`
                    : "NULL AS id",

                `d.\`${amountColumn}\` AS amount`,

                `d.\`${dateColumn}\` AS deposit_date`,

                methodColumn
                    ? `d.\`${methodColumn}\` AS payment_method`
                    : "'' AS payment_method",

                noteColumn
                    ? `d.\`${noteColumn}\` AS note`
                    : "'' AS note",

                userColumn
                    ? `d.\`${userColumn}\` AS created_by`
                    : "NULL AS created_by"
            ];


            const [rows] =
                await pool.query(
                    `
                    SELECT
                        ${selectColumns.join(",\n")}
                    FROM \`${table}\` d
                    WHERE ${whereSql}
                    ORDER BY
                        d.\`${dateColumn}\` DESC
                    LIMIT ? OFFSET ?
                    `,
                    [
                        ...params,
                        limit,
                        offset
                    ]
                );


            const total =
                Number(countRow.total || 0);


            return res.json({

                status: true,

                available: true,

                table,

                summary: {

                    total_data:
                        Number(
                            summary.total_data || 0
                        ),

                    total_amount:
                        Number(
                            summary.total_amount || 0
                        )
                },

                pagination: {

                    page,
                    limit,
                    total,

                    totalPages:
                        Math.ceil(
                            total / limit
                        )
                },

                deposits: rows

            });

        } catch (error) {

            console.error(
                "Deposit report error:",
                error
            );

            return res.status(500).json({

                status: false,

                message:
                    "Unable to load deposit report.",

                error:
                    process.env.NODE_ENV === "development"
                        ? error.message
                        : undefined
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| CSV EXPORT
|--------------------------------------------------------------------------
*/

router.get(
    "/api/collection/csv",
    requireLoginApi,
    async (req, res) => {

        try {

            const search =
                clean(req.query.search);

            const fromDate =
                clean(req.query.from_date);

            const toDate =
                clean(req.query.to_date);


            const scope =
                getCompanyScope(
                    req,
                    "b"
                );


            let where = [
                scope.sql
            ];

            let params = [
                ...scope.params
            ];


            if (search) {

                where.push(`
                    (
                        CAST(b.user_id AS CHAR) LIKE ?
                        OR b.customer_name LIKE ?
                        OR b.pppoe_username LIKE ?
                        OR b.note LIKE ?
                        OR b.collected_by LIKE ?
                        OR b.package_name LIKE ?
                        OR b.area_name LIKE ?
                        OR b.medium LIKE ?
                        OR b.bill_type LIKE ?
                    )
                `);

                const q =
                    `%${search}%`;

                params.push(
                    q,q,q,q,q,q,q,q,q
                );
            }


            if (fromDate) {

                where.push(
                    "DATE(b.created_at) >= ?"
                );

                params.push(fromDate);
            }


            if (toDate) {

                where.push(
                    "DATE(b.created_at) <= ?"
                );

                params.push(toDate);
            }


            const [rows] =
                await pool.query(
                    `
                    SELECT
                        b.id,
                        b.connection_type,
                        b.customer_name,
                        b.area_name,
                        b.pppoe_username,
                        b.package_name,
                        b.bill_amount,
                        b.discount,
                        b.due_amount,
                        b.medium,
                        b.bill_type,
                        b.collected_amount,
                        b.collected_by,
                        b.collector_role,
                        b.note,
                        b.created_at
                    FROM bill_reports b
                    WHERE ${where.join(" AND ")}
                    ORDER BY b.id DESC
                    `,
                    params
                );


            const headers = [
                "ID",
                "Connection Type",
                "Customer",
                "Area",
                "PPPoE",
                "Package",
                "Bill",
                "Discount",
                "Due",
                "Medium",
                "Bill Type",
                "Collected",
                "Collected By",
                "Collector Role",
                "Note",
                "Date"
            ];


            const lines = [
                headers.map(escapeCsv).join(",")
            ];


            for (const row of rows) {

                lines.push(
                    [
                        row.id,
                        row.connection_type,
                        row.customer_name,
                        row.area_name,
                        row.pppoe_username,
                        row.package_name,
                        row.bill_amount,
                        row.discount,
                        row.due_amount,
                        row.medium,
                        row.bill_type,
                        row.collected_amount,
                        row.collected_by,
                        row.collector_role,
                        row.note,
                        row.created_at
                    ]
                    .map(escapeCsv)
                    .join(",")
                );
            }


            res.setHeader(
                "Content-Type",
                "text/csv; charset=utf-8"
            );

            res.setHeader(
                "Content-Disposition",
                "attachment; filename=collection_report.csv"
            );


            return res.send(
                "\uFEFF" +
                lines.join("\r\n")
            );

        } catch (error) {

            console.error(
                "Collection CSV error:",
                error
            );

            return res.status(500).send(
                "Unable to export collection report."
            );
        }
    }
);


module.exports = router;