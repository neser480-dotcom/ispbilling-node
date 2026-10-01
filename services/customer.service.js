"use strict";

const db = require("../config/database");

/*
|--------------------------------------------------------------------------
| CUSTOMER SERVICE
|--------------------------------------------------------------------------
| Customer list related database operations.
|
| Important:
| - super_admin => all companies
| - normal user => own company only
| - deleted customers excluded when deleted_at exists
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| DB QUERY HELPER
|--------------------------------------------------------------------------
*/

async function query(sql, params = []) {
    /*
     * mysql2 pool normally exposes:
     * db.query(...)
     *
     * If database.js exports a pool, this works directly.
     */
    const [rows] = await db.query(sql, params);
    return rows;
}


/*
|--------------------------------------------------------------------------
| COMPANY SCOPE
|--------------------------------------------------------------------------
*/

function buildCompanyScope(user, alias = "c") {
    const role = String(user?.role || "")
        .trim()
        .toLowerCase();

    const companyId = Number(user?.company_id || 0);

    if (role === "super_admin") {
        return {
            sql: "",
            params: []
        };
    }

    /*
     * Same behavior as old PHP:
     * if normal user has no company_id,
     * return no customers.
     */
    if (!Number.isInteger(companyId) || companyId <= 0) {
        return {
            sql: " AND 1 = 0 ",
            params: []
        };
    }

    return {
        sql: ` AND ${alias}.company_id = ? `,
        params: [companyId]
    };
}


/*
|--------------------------------------------------------------------------
| DELETED SCOPE
|--------------------------------------------------------------------------
*/

function buildDeletedScope(alias = "c") {
    return {
        sql: `
            AND (
                ${alias}.deleted_at IS NULL
                OR ${alias}.deleted_at = '0000-00-00 00:00:00'
            )
        `,
        params: []
    };
}


/*
|--------------------------------------------------------------------------
| SEARCH
|--------------------------------------------------------------------------
*/

function buildSearchScope(search, alias = "c") {
    const value = String(search || "").trim();

    if (!value) {
        return {
            sql: "",
            params: []
        };
    }

    const like = `%${value}%`;

    return {
        sql: `
            AND (
                ${alias}.name LIKE ?
                OR ${alias}.customer_id LIKE ?
                OR ${alias}.phone LIKE ?
                OR ${alias}.pppoe_username LIKE ?
            )
        `,
        params: [
            like,
            like,
            like,
            like
        ]
    };
}


/*
|--------------------------------------------------------------------------
| STATUS FILTER
|--------------------------------------------------------------------------
*/

function buildStatusScope(status, alias = "c") {
    const value = String(status || "")
        .trim();

    if (!value || value.toLowerCase() === "all") {
        return {
            sql: "",
            params: []
        };
    }

    return {
        sql: ` AND ${alias}.status = ? `,
        params: [value]
    };
}


/*
|--------------------------------------------------------------------------
| LIST CUSTOMERS
|--------------------------------------------------------------------------
*/

async function getCustomers({
    user,
    page = 1,
    limit = 100,
    search = "",
    status = ""
}) {
    page = Number(page);
    limit = Number(limit);

    if (!Number.isInteger(page) || page < 1) {
        page = 1;
    }

    /*
     * Allowed values requested for customer list.
     *
     * 0 means ALL.
     */
    const allowedLimits = [
        100,
        200,
        500,
        5000,
        0
    ];

    if (!allowedLimits.includes(limit)) {
        limit = 100;
    }

    const companyScope = buildCompanyScope(user, "c");
    const deletedScope = buildDeletedScope("c");
    const searchScope = buildSearchScope(search, "c");
    const statusScope = buildStatusScope(status, "c");

    const whereSql = `
        WHERE 1 = 1
        ${companyScope.sql}
        ${deletedScope.sql}
        ${searchScope.sql}
        ${statusScope.sql}
    `;

    const whereParams = [
        ...companyScope.params,
        ...deletedScope.params,
        ...searchScope.params,
        ...statusScope.params
    ];

    /*
    |--------------------------------------------------------------------------
    | TOTAL
    |--------------------------------------------------------------------------
    */

    const countRows = await query(
        `
        SELECT COUNT(*) AS total
        FROM customers c
        ${whereSql}
        `,
        whereParams
    );

    const total = Number(
        countRows?.[0]?.total || 0
    );

    /*
    |--------------------------------------------------------------------------
    | PAGINATION
    |--------------------------------------------------------------------------
    */

    let offset = 0;

    if (limit > 0) {
        offset = (page - 1) * limit;

        if (offset < 0) {
            offset = 0;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | CUSTOMER DATA
    |--------------------------------------------------------------------------
    |
    | Same basic logic as PHP:
    |
    | display_bill:
    | customer monthly_bill -> package price -> 0
    |
    | display_package:
    | customer package_name -> package name -> blank
    |--------------------------------------------------------------------------
    */

    let sql = `
        SELECT
            c.*,

            COALESCE(
                NULLIF(c.monthly_bill, 0),
                mp.price,
                0
            ) AS display_bill,

            COALESCE(
                NULLIF(c.package_name, ''),
                mp.package_name,
                ''
            ) AS display_package,

            mp.id AS joined_package_id,
            mp.profile_id AS joined_profile_id,
            mp.price AS joined_package_price,

            a.name AS area_name,
            sa.name AS sub_area_name

        FROM customers c

        LEFT JOIN mikrotik_packages mp
            ON mp.id = c.package_id
            AND mp.company_id = c.company_id

        LEFT JOIN areas a
            ON a.id = c.area_id
            AND a.company_id = c.company_id

        LEFT JOIN sub_areas sa
            ON sa.id = c.sub_area_id
            AND sa.company_id = c.company_id

        ${whereSql}

        ORDER BY c.id ASC
    `;

    const dataParams = [...whereParams];

    if (limit > 0) {
        sql += `
            LIMIT ?
            OFFSET ?
        `;

        dataParams.push(
            limit,
            offset
        );
    }

    const rows = await query(
        sql,
        dataParams
    );

    /*
    |--------------------------------------------------------------------------
    | NORMALIZE RESPONSE
    |--------------------------------------------------------------------------
    */

    const customers = rows.map(row => {
        const promiseDate =
            row.promise_date || null;

        let dayLeft = null;

        if (promiseDate) {
            const today =
                new Date();

            const target =
                new Date(promiseDate);

            if (
                !Number.isNaN(
                    target.getTime()
                )
            ) {
                today.setHours(
                    0,
                    0,
                    0,
                    0
                );

                target.setHours(
                    0,
                    0,
                    0,
                    0
                );

                const diff =
                    target.getTime() -
                    today.getTime();

                dayLeft =
                    Math.ceil(
                        diff /
                        (1000 * 60 * 60 * 24)
                    );
            }
        }

        return {
            ...row,

            id: Number(row.id),

            company_id:
                Number(
                    row.company_id || 0
                ),

            monthly_bill:
                Number(
                    row.monthly_bill || 0
                ),

            balance:
                Number(
                    row.balance || 0
                ),

            display_bill:
                Number(
                    row.display_bill || 0
                ),

            package_id:
                row.package_id === null
                    ? null
                    : Number(
                        row.package_id
                    ),

            mikrotik_id:
                row.mikrotik_id === null
                    ? null
                    : Number(
                        row.mikrotik_id
                    ),

            area_id:
                row.area_id === null
                    ? null
                    : Number(
                        row.area_id
                    ),

            sub_area_id:
                row.sub_area_id === null
                    ? null
                    : Number(
                        row.sub_area_id
                    ),

            day_left: dayLeft
        };
    });

    const totalPages =
        limit > 0
            ? Math.ceil(
                total / limit
            )
            : total > 0
                ? 1
                : 0;

    return {
        customers,

        pagination: {
            page,
            limit,
            total,
            total_pages: totalPages,

            from:
                total === 0
                    ? 0
                    : limit === 0
                        ? 1
                        : offset + 1,

            to:
                total === 0
                    ? 0
                    : limit === 0
                        ? total
                        : Math.min(
                            offset + limit,
                            total
                        )
        }
    };
}


/*
|--------------------------------------------------------------------------
| CUSTOMER SUMMARY
|--------------------------------------------------------------------------
*/

async function getSummary({
    user,
    search = "",
    status = ""
}) {
    const companyScope =
        buildCompanyScope(
            user,
            "c"
        );

    const deletedScope =
        buildDeletedScope(
            "c"
        );

    const searchScope =
        buildSearchScope(
            search,
            "c"
        );

    const statusScope =
        buildStatusScope(
            status,
            "c"
        );

    const whereSql = `
        WHERE 1 = 1
        ${companyScope.sql}
        ${deletedScope.sql}
        ${searchScope.sql}
        ${statusScope.sql}
    `;

    const params = [
        ...companyScope.params,
        ...deletedScope.params,
        ...searchScope.params,
        ...statusScope.params
    ];

    const rows = await query(
        `
        SELECT

            COUNT(*) AS total_customers,

            COALESCE(
                SUM(
                    COALESCE(
                        NULLIF(c.monthly_bill, 0),
                        mp.price,
                        0
                    )
                ),
                0
            ) AS total_bill,

            COALESCE(
                SUM(
                    COALESCE(
                        c.balance,
                        0
                    )
                ),
                0
            ) AS total_balance

        FROM customers c

        LEFT JOIN mikrotik_packages mp
            ON mp.id = c.package_id
            AND mp.company_id = c.company_id

        ${whereSql}
        `,
        params
    );

    const row =
        rows?.[0] || {};

    return {
        total_customers:
            Number(
                row.total_customers || 0
            ),

        total_bill:
            Number(
                row.total_bill || 0
            ),

        total_balance:
            Number(
                row.total_balance || 0
            )
    };
}


/*
|--------------------------------------------------------------------------
| SINGLE CUSTOMER
|--------------------------------------------------------------------------
*/

async function getCustomerById({
    user,
    id
}) {
    const customerId =
        Number(id);

    if (
        !Number.isInteger(
            customerId
        ) ||
        customerId <= 0
    ) {
        return null;
    }

    const companyScope =
        buildCompanyScope(
            user,
            "c"
        );

    const deletedScope =
        buildDeletedScope(
            "c"
        );

    const rows = await query(
        `
        SELECT
            c.*,

            COALESCE(
                NULLIF(c.monthly_bill, 0),
                mp.price,
                0
            ) AS display_bill,

            COALESCE(
                NULLIF(c.package_name, ''),
                mp.package_name,
                ''
            ) AS display_package,

            mp.profile_id AS joined_profile_id,
            mp.price AS joined_package_price,

            a.name AS area_name,
            sa.name AS sub_area_name

        FROM customers c

        LEFT JOIN mikrotik_packages mp
            ON mp.id = c.package_id
            AND mp.company_id = c.company_id

        LEFT JOIN areas a
            ON a.id = c.area_id
            AND a.company_id = c.company_id

        LEFT JOIN sub_areas sa
            ON sa.id = c.sub_area_id
            AND sa.company_id = c.company_id

        WHERE c.id = ?

        ${companyScope.sql}
        ${deletedScope.sql}

        LIMIT 1
        `,
        [
            customerId,
            ...companyScope.params,
            ...deletedScope.params
        ]
    );

    if (!rows.length) {
        return null;
    }

    const row = rows[0];

    return {
        ...row,

        id: Number(row.id),

        company_id:
            Number(
                row.company_id || 0
            ),

        balance:
            Number(
                row.balance || 0
            ),

        monthly_bill:
            Number(
                row.monthly_bill || 0
            ),

        display_bill:
            Number(
                row.display_bill || 0
            )
    };
}


module.exports = {
    getCustomers,
    getSummary,
    getCustomerById
};