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

function getCompanyScope(req) {

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


    /*
    |--------------------------------------------------------------------------
    | SUPER ADMIN
    |--------------------------------------------------------------------------
    */

    if (role === "super_admin") {

        return {
            sql: "1=1",
            params: []
        };

    }


    /*
    |--------------------------------------------------------------------------
    | NORMAL USER WITHOUT COMPANY
    |--------------------------------------------------------------------------
    */

    if (companyId <= 0) {

        return {
            sql: "1=0",
            params: []
        };

    }


    /*
    |--------------------------------------------------------------------------
    | COMPANY USER
    |--------------------------------------------------------------------------
    */

    return {
        sql: "company_id = ?",
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


/*
|--------------------------------------------------------------------------
| PAGE
|--------------------------------------------------------------------------
*/

router.get(
    "/",
    requireLoginPage,
    (req, res) => {

        return res.sendFile(
            path.join(
                __dirname,
                "..",
                "views",
                "activity-log.html"
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| ACTIVITY LOG API
|--------------------------------------------------------------------------
*/

router.get(
    "/api",
    requireLoginApi,
    async (req, res) => {

        try {

            /*
            |--------------------------------------------------------------------------
            | SEARCH
            |--------------------------------------------------------------------------
            */

            const search =
                clean(
                    req.query.search
                );


            /*
            |--------------------------------------------------------------------------
            | DATE FILTER
            |--------------------------------------------------------------------------
            |
            | Supports both:
            |
            | from_date / to_date
            | from / to
            |
            */

            const fromDate =
                clean(
                    req.query.from_date ||
                    req.query.from ||
                    ""
                );


            const toDate =
                clean(
                    req.query.to_date ||
                    req.query.to ||
                    ""
                );


            /*
            |--------------------------------------------------------------------------
            | PAGINATION
            |--------------------------------------------------------------------------
            */

            const page =
                Math.max(
                    1,
                    number(
                        req.query.page,
                        1
                    )
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


            /*
            |--------------------------------------------------------------------------
            | COMPANY SCOPE
            |--------------------------------------------------------------------------
            */

            const scope =
                getCompanyScope(req);


            let where = [
                scope.sql
            ];


            let params = [
                ...scope.params
            ];


            /*
            |--------------------------------------------------------------------------
            | SEARCH FILTER
            |--------------------------------------------------------------------------
            */

            if (search !== "") {

                where.push(`
                    (
                        CAST(user_id AS CHAR) LIKE ?
                        OR user_name LIKE ?
                        OR description LIKE ?
                        OR module LIKE ?
                        OR ip_address LIKE ?
                        OR role_name LIKE ?
                        OR action LIKE ?
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
                    q
                );

            }


            /*
            |--------------------------------------------------------------------------
            | FROM DATE
            |--------------------------------------------------------------------------
            */

            if (fromDate !== "") {

                where.push(
                    "DATE(created_at) >= ?"
                );

                params.push(
                    fromDate
                );

            }


            /*
            |--------------------------------------------------------------------------
            | TO DATE
            |--------------------------------------------------------------------------
            */

            if (toDate !== "") {

                where.push(
                    "DATE(created_at) <= ?"
                );

                params.push(
                    toDate
                );

            }


            /*
            |--------------------------------------------------------------------------
            | FINAL WHERE
            |--------------------------------------------------------------------------
            */

            const whereSql =
                where.join(" AND ");


            /*
            |--------------------------------------------------------------------------
            | TOTAL COUNT
            |--------------------------------------------------------------------------
            |
            | One COUNT query is enough for both:
            |
            | summary.total_data
            | pagination.total
            |
            */

            const [[countRow]] =
                await pool.query(
                    `
                    SELECT
                        COUNT(*) AS total
                    FROM activity_logs
                    WHERE ${whereSql}
                    `,
                    params
                );


            const total =
                Number(
                    countRow.total || 0
                );


            /*
            |--------------------------------------------------------------------------
            | ACTIVITY DATA
            |--------------------------------------------------------------------------
            */

            const [rows] =
                await pool.query(
                    `
                    SELECT
                        id,
                        company_id,
                        user_id,
                        user_name,
                        description,
                        module,
                        ip_address,
                        role_name,
                        action,
                        created_at

                    FROM activity_logs

                    WHERE ${whereSql}

                    ORDER BY id DESC

                    LIMIT ${limit}
                    OFFSET ${offset}
                    `,
                    params
                );


            /*
            |--------------------------------------------------------------------------
            | TRANSFORM DATA
            |--------------------------------------------------------------------------
            */

            const logs =
                rows.map(
                    (row, index) => {

                        let description =
                            clean(
                                row.description
                            );


                        let module =
                            clean(
                                row.module
                            );


                        let ipAddress =
                            clean(
                                row.ip_address
                            );


                        let roleName =
                            clean(
                                row.role_name
                            );


                        let userName =
                            clean(
                                row.user_name
                            );


                        const action =
                            clean(
                                row.action
                            );


                        /*
                        |--------------------------------------------------------------------------
                        | FALLBACK VALUES
                        |--------------------------------------------------------------------------
                        */

                        if (
                            description === ""
                        ) {

                            description =
                                action !== ""
                                    ? action
                                    : "Activity";

                        }


                        if (
                            module === ""
                        ) {

                            module = "N/A";

                        }


                        if (
                            ipAddress === ""
                        ) {

                            ipAddress = "N/A";

                        }


                        if (
                            roleName === ""
                        ) {

                            roleName = "N/A";

                        }


                        if (
                            userName === ""
                        ) {

                            userName = "System";

                        }


                        /*
                        |--------------------------------------------------------------------------
                        | ACTION BADGE TYPE
                        |--------------------------------------------------------------------------
                        */

                        const actionLower =
                            action.toLowerCase();


                        let actionType =
                            "primary";


                        if (
                            actionLower.includes(
                                "delete"
                            )
                        ) {

                            actionType =
                                "danger";

                        } else if (
                            actionLower.includes(
                                "recharge"
                            )
                        ) {

                            actionType =
                                "success";

                        } else if (
                            actionLower.includes(
                                "update"
                            ) ||
                            actionLower.includes(
                                "edit"
                            )
                        ) {

                            actionType =
                                "warning";

                        }


                        /*
                        |--------------------------------------------------------------------------
                        | RETURN
                        |--------------------------------------------------------------------------
                        */

                        return {

                            serial:
                                offset + index + 1,

                            id:
                                Number(
                                    row.id || 0
                                ),

                            company_id:
                                Number(
                                    row.company_id || 0
                                ),

                            user_id:
                                Number(
                                    row.user_id || 0
                                ),

                            user_name:
                                userName,

                            description:
                                description,

                            module:
                                module,

                            ip_address:
                                ipAddress,

                            role_name:
                                roleName,

                            action:
                                action !== ""
                                    ? action
                                    : "UNKNOWN",

                            action_type:
                                actionType,

                            created_at:
                                row.created_at

                        };

                    }
                );


            /*
            |--------------------------------------------------------------------------
            | PAGINATION TOTAL PAGES
            |--------------------------------------------------------------------------
            */

            const totalPages =
                Math.ceil(
                    total / limit
                );


            /*
            |--------------------------------------------------------------------------
            | RESPONSE
            |--------------------------------------------------------------------------
            */

            return res.json({

                status: true,


                is_super_admin:
                    String(
                        req.session?.role || ""
                    )
                    .trim()
                    .toLowerCase()
                    === "super_admin",


                company_id:
                    Number(
                        req.session?.company_id || 0
                    ),


                summary: {

                    total_data:
                        total

                },


                pagination: {

                    page,

                    limit,

                    total,

                    totalPages

                },


                logs

            });

        } catch (error) {

            console.error(
                "Activity Log error:",
                error
            );


            return res.status(500).json({

                status: false,

                message:
                    "Unable to load activity log.",

                error:
                    process.env.NODE_ENV ===
                    "development"
                        ? error.message
                        : undefined

            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports = router;