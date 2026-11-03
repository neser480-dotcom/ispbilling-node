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

/*
|--------------------------------------------------------------------------
| MANAGER LOG FILTER
|--------------------------------------------------------------------------
| Manager শুধু Collector ও Staff এর লগ দেখতে পাবে।
| Admin ও Manager এর লগ দেখা যাবে না।
*/

function isManager(req) {

    return String(
        req.session?.role || ""
    )
    .trim()
    .toLowerCase() === "manager";

}


function managerLogFilter(req) {

    if (!isManager(req)) {

        return {
            sql: "",
            params: []
        };

    }

    return {
        sql: `(
            user_id IN (
                SELECT id FROM users
                WHERE company_id = ?
                  AND LOWER(role) IN ('collector', 'staff')
            )
            OR LOWER(COALESCE(role_name, '')) IN ('collector', 'staff')
        )`,
        params: [
            Number(req.session?.company_id || 0)
        ]
    };

}


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
            path.join(__dirname, "..", "..", "views", "activity", "activity-log.html")
        );

    }
);


/*
|--------------------------------------------------------------------------
| ACTIVITY LOG API
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| OPTIONAL COLUMNS (user agent / previous state / current state)
|--------------------------------------------------------------------------
| Detects which of these columns exist in activity_logs,
| so the page works with or without them.
*/

let optionalColumnsCache = null;

async function getOptionalColumns() {
    if (optionalColumnsCache) return optionalColumnsCache;

    const [cols] = await pool.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activity_logs'`
    );
    const names = cols.map((c) => c.COLUMN_NAME);

    const pick = (list) => list.find((n) => names.includes(n)) || null;

    optionalColumnsCache = {
        userAgent: pick(["user_agent", "useragent", "agent"]),
        oldData: pick(["old_data", "old_values", "previous_state", "before_data", "old_value", "previous_data"]),
        newData: pick(["new_data", "new_values", "current_state", "after_data", "new_value", "current_data"])
    };

    return optionalColumnsCache;
}


router.get(
    "/api/filters",
    requireLoginApi,
    async (req, res) => {
        try {
            const scope = getCompanyScope(req);

            /*
            | Created By = staff under this admin's company
            | (staff.user_id is the login user id used in activity_logs.user_id)
            */
            const mgr = managerLogFilter(req);

            const staffOnly = isManager(req)
                ? "AND LOWER(COALESCE(role, '')) IN ('collector', 'staff')"
                : "";

            const [users] = await pool.query(
                `SELECT id, user_id, name, role
                 FROM staff
                 WHERE ${scope.sql}
                   AND name IS NOT NULL AND name <> ''
                   ${staffOnly}
                 ORDER BY name ASC`,
                scope.params
            );

            /*
            | Everyone who has activity logs (admin, staff, manager,
            | collector ...) + all staff of this company. Matched by name.
            */
            const [logUsers] = await pool.query(
                `SELECT DISTINCT user_name
                 FROM activity_logs
                 WHERE ${scope.sql}
                   AND user_name IS NOT NULL AND user_name <> ''
                   ${mgr.sql ? "AND " + mgr.sql : ""}`,
                [...scope.params, ...mgr.params]
            );

            const seen = new Set();
            const names = [];

            [
                ...logUsers.map((r) => r.user_name),
                ...users.map((r) => r.name)
            ].forEach((name) => {
                const clean = String(name || "").trim();
                const key = clean.toLowerCase();

                if (clean !== "" && !seen.has(key)) {
                    seen.add(key);
                    names.push(clean);
                }
            });

            names.sort((x, y) => x.localeCompare(y));

            return res.json({
                status: true,
                users: names.map((name) => ({
                    key: `name:${name}`,
                    id: 0,
                    name,
                    role: ""
                }))
            });
        } catch (error) {
            console.error("Activity filters error:", error);
            return res.status(500).json({
                status: false,
                message: "Unable to load filters."
            });
        }
    }
);


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


            /* Manager হলে শুধু Collector ও Staff এর লগ */
            const mgr = managerLogFilter(req);

            if (mgr.sql) {

                where.push(mgr.sql);

                params.push(...mgr.params);

            }


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
            | CREATED BY / ACTION FILTER
            |--------------------------------------------------------------------------
            */

            const createdBy = clean(req.query.created_by);
            const actionFilter = clean(req.query.action);

            if (createdBy.startsWith("id:")) {
                where.push("user_id = ?");
                params.push(Number(createdBy.slice(3)) || 0);
            } else if (createdBy.startsWith("name:")) {
                where.push("user_name = ?");
                params.push(createdBy.slice(5));
            }

            const allowedActions = ["create", "update", "delete", "recharge"];

            if (allowedActions.includes(actionFilter.toLowerCase())) {
                where.push("LOWER(action) LIKE ?");
                params.push(`%${actionFilter.toLowerCase()}%`);
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

            const opt = await getOptionalColumns();

            const extraSelect = [
                opt.userAgent ? `\`${opt.userAgent}\` AS user_agent` : "NULL AS user_agent",
                opt.oldData ? `\`${opt.oldData}\` AS old_data` : "NULL AS old_data",
                opt.newData ? `\`${opt.newData}\` AS new_data` : "NULL AS new_data"
            ].join(", ");

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
                        created_at,
                        ${extraSelect}

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
                                row.created_at,
                            user_agent:
                                row.user_agent || "",
                            old_data:
                                row.old_data || null,
                            new_data:
                                row.new_data || null

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