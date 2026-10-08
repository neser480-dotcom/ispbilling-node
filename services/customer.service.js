"use strict";

const db = require("../config/database");

/*
|--------------------------------------------------------------------------
| DATABASE HELPER
|--------------------------------------------------------------------------
*/

async function query(sql, params = []) {
    const [rows] = await db.query(sql, params);
    return rows;
}

/*
|--------------------------------------------------------------------------
| COMPANY SCOPE
|--------------------------------------------------------------------------
*/

function buildCompanyScope(user, alias = "c") {
    const role =
        String(
            user?.role || ""
        ).toLowerCase();

    const companyId =
        Number(
            user?.company_id || 0
        );

    if (role === "super_admin") {
        return {
            sql: "",
            params: []
        };
    }

    if (companyId <= 0) {
        return {
            sql: " AND 1=0",
            params: []
        };
    }

    return {
        sql:
            ` AND ${alias}.company_id = ?`,
        params: [
            companyId
        ]
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
                OR ${alias}.deleted_at = ''
                OR ${alias}.deleted_at = '0000-00-00 00:00:00'
            )
        `,
        params: []
    };
}

/*
|--------------------------------------------------------------------------
| SEARCH SCOPE
|--------------------------------------------------------------------------
*/

function buildSearchScope(
    search,
    alias = "c"
) {
    search =
        String(
            search || ""
        ).trim();

    if (!search) {
        return {
            sql: "",
            params: []
        };
    }

    const like =
        `%${search}%`;

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
| STATUS SCOPE
|--------------------------------------------------------------------------
*/

function buildStatusScope(
    status,
    alias = "c"
) {
    status =
        String(
            status || ""
        ).trim();

    if (
        !status ||
        status.toLowerCase() === "all"
    ) {
        return {
            sql: "",
            params: []
        };
    }

    return {
        sql:
            ` AND LOWER(${alias}.status) = LOWER(?)`,
        params: [
            status
        ]
    };
}

/*
|--------------------------------------------------------------------------
| DATE NORMALIZER
|--------------------------------------------------------------------------
*/

function normalizeDate(value) {
    if (
        value === null ||
        value === undefined ||
        value === "" ||
        value === "0000-00-00 00:00:00"
    ) {
        return null;
    }

    return value;
}

/*
|--------------------------------------------------------------------------
| DAY LEFT
|--------------------------------------------------------------------------
| Same logic as original PHP list.php:
| Day Left is calculated from billing_cycle.
|--------------------------------------------------------------------------
*/

function calculateDayLeft(
    billingCycle
) {
    if (!billingCycle) {
        return null;
    }

    const target =
        new Date(
            String(
                billingCycle
            ).replace(
                " ",
                "T"
            )
        );

    if (
        Number.isNaN(
            target.getTime()
        )
    ) {
        return null;
    }

    const now =
        new Date();

    return Math.ceil(
        (
            target.getTime() -
            now.getTime()
        ) /
        (
            1000 *
            60 *
            60 *
            24
        )
    );
}

/*
|--------------------------------------------------------------------------
| NORMALIZE CUSTOMER
|--------------------------------------------------------------------------
*/

function normalizeCustomer(row) {

    const billingCycle =
        normalizeDate(
            row.billing_cycle
        );

    const promiseDate =
        normalizeDate(
            row.promise_date
        );

    const dayLeft =
        calculateDayLeft(
            billingCycle
        );

    return {
        ...row,

        id:
            Number(
                row.id
            ),

        company_id:
            row.company_id === null
                ? null
                : Number(
                    row.company_id
                ),

        customer_id:
            row.customer_id ?? "",

        name:
            row.name ?? "",

        phone:
            row.phone ?? "",

        address:
            row.address ?? "",

        pppoe_username:
            row.pppoe_username ?? "",

        pppoe_password:
            row.pppoe_password ?? "",

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

        router_id:
            row.router_id === null
                ? null
                : Number(
                    row.router_id
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

        display_package:
            row.display_package ?? "",

        billing_cycle:
            billingCycle,

        promise_date:
            promiseDate,

        day_left:
            dayLeft,

        payment_status:
            String(
                row.payment_status ||
                "paid"
            ).toLowerCase(),

        status:
            String(
                row.status ||
                "inactive"
            ).toLowerCase(),

        area_name:
            row.area_name ?? "",

        sub_area_name:
            row.sub_area_name ?? "",

        package_price:
            row.package_price === null
                ? null
                : Number(
                    row.package_price
                ),

        package_profile:
            row.package_profile ?? ""
    };
}

/*
|--------------------------------------------------------------------------
| GET CUSTOMERS
|--------------------------------------------------------------------------
*/

async function getCustomers({
    user,
    page = 1,
    limit = 100,
    search = "",
    status = ""
}) {

    page =
        Math.max(
            1,
            Number(page) || 1
        );

    limit =
        Number(limit);

    const allowedLimits = [
        100,
        200,
        500,
        5000,
        0
    ];

    if (
        !allowedLimits.includes(
            limit
        )
    ) {
        limit = 100;
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

    /*
    |--------------------------------------------------------------------------
    | COUNT
    |--------------------------------------------------------------------------
    */

    const countSql = `
        SELECT
            COUNT(*) AS total

        FROM customers c

        WHERE 1=1

        ${companyScope.sql}
        ${deletedScope.sql}
        ${searchScope.sql}
        ${statusScope.sql}
    `;

    const countRows =
        await query(
            countSql,
            [
                ...companyScope.params,
                ...deletedScope.params,
                ...searchScope.params,
                ...statusScope.params
            ]
        );

    const total =
        Number(
            countRows[0]?.total || 0
        );

    /*
    |--------------------------------------------------------------------------
    | PAGINATION
    |--------------------------------------------------------------------------
    */

    let totalPages = 1;
    let offset = 0;

    if (limit > 0) {

        totalPages =
            Math.max(
                1,
                Math.ceil(
                    total / limit
                )
            );

        if (
            page > totalPages
        ) {
            page =
                totalPages;
        }

        offset =
            (page - 1) *
            limit;

    } else {

        page = 1;
        totalPages = 1;
        offset = 0;
    }

    /*
    |--------------------------------------------------------------------------
    | PAGINATION SQL
    |--------------------------------------------------------------------------
    */

    let paginationSql = "";

    if (limit > 0) {

        paginationSql = `
            LIMIT ${Number(limit)}
            OFFSET ${Number(offset)}
        `;
    }

    /*
    |--------------------------------------------------------------------------
    | CUSTOMER QUERY
    |--------------------------------------------------------------------------
    */

    const customerSql = `
        SELECT

            c.*,

            COALESCE(
                NULLIF(
                    c.monthly_bill,
                    0
                ),
                mp.price,
                0
            ) AS display_bill,

            COALESCE(
                NULLIF(
                    c.package_name,
                    ''
                ),
                mp.package_name,
                ''
            ) AS display_package,

            mp.price AS package_price,

           

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

        WHERE 1=1

        ${companyScope.sql}
        ${deletedScope.sql}
        ${searchScope.sql}
        ${statusScope.sql}

        ORDER BY c.id ASC

        ${paginationSql}
    `;

    const rows =
        await query(
            customerSql,
            [
                ...companyScope.params,
                ...deletedScope.params,
                ...searchScope.params,
                ...statusScope.params
            ]
        );

    const customers =
        rows.map(
            normalizeCustomer
        );

    /*
    |--------------------------------------------------------------------------
    | RESULT
    |--------------------------------------------------------------------------
    */

    return {
        customers,

        pagination: {
            page,
            limit,
            total,
            totalPages,
            offset,

            from:
                total === 0
                    ? 0
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

    const sql = `
        SELECT

            COUNT(*) AS total_customer,

            COALESCE(
                SUM(
                    COALESCE(
                        NULLIF(
                            c.monthly_bill,
                            0
                        ),
                        mp.price,
                        0
                    )
                ),
                0
            ) AS total_bill,

            COALESCE(
                SUM(
                    c.balance
                ),
                0
            ) AS total_balance

        FROM customers c

        LEFT JOIN mikrotik_packages mp
            ON mp.id = c.package_id
            AND mp.company_id = c.company_id

        WHERE 1=1

        ${companyScope.sql}
        ${deletedScope.sql}
        ${searchScope.sql}
        ${statusScope.sql}
    `;

    const rows =
        await query(
            sql,
            [
                ...companyScope.params,
                ...deletedScope.params,
                ...searchScope.params,
                ...statusScope.params
            ]
        );

    const row =
        rows[0] || {};

    return {
        total_customer:
            Number(
                row.total_customer || 0
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
| GET CUSTOMER BY ID
|--------------------------------------------------------------------------
*/

async function getCustomerById({
    user,
    id
}) {

    id =
        Number(id);

    if (
        !Number.isInteger(id) ||
        id <= 0
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

    const sql = `
        SELECT

            c.*,

            COALESCE(
                NULLIF(
                    c.monthly_bill,
                    0
                ),
                mp.price,
                0
            ) AS display_bill,

            COALESCE(
                NULLIF(
                    c.package_name,
                    ''
                ),
                mp.package_name,
                ''
            ) AS display_package,

            mp.price AS package_price,

           

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
    `;

    const rows =
        await query(
            sql,
            [
                id,
                ...companyScope.params,
                ...deletedScope.params
            ]
        );

    if (
        !rows.length
    ) {
        return null;
    }

    return normalizeCustomer(
        rows[0]
    );
}

/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports = {
    getCustomers,
    getSummary,
    getCustomerById
};