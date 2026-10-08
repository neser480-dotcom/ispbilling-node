
"use strict";

const db = require("../config/database");

/*
|--------------------------------------------------------------------------
| CUSTOMER SERVICE
|--------------------------------------------------------------------------
| Source of truth:
| PHP customers/list.php
|
| Handles:
| - Customer list
| - Search
| - Status filter
| - Company isolation
| - Pagination
| - All customers
| - Summary
| - Single customer
|--------------------------------------------------------------------------
*/


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
| ROLE
|--------------------------------------------------------------------------
*/

function isSuperAdmin(user) {

    const role = String(
        user?.role ||
        ""
    )
        .toLowerCase()
        .replace(/[\s_-]/g, "");

    return role === "superadmin";
}


/*
|--------------------------------------------------------------------------
| COMPANY SCOPE
|--------------------------------------------------------------------------
*/

function buildCompanyScope(user, alias = "c") {

    /*
     * PHP behavior:
     *
     * super_admin:
     *     WHERE 1=1
     *
     * normal user:
     *     company_id required
     *
     * missing company_id:
     *     WHERE 1=0
     */

    if (isSuperAdmin(user)) {

        return {
            sql: "",
            params: []
        };

    }

    const companyId = Number(
        user?.company_id ??
        user?.companyId ??
        0
    );

    if (!Number.isInteger(companyId) || companyId <= 0) {

        return {
            sql: " AND 1=0 ",
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

    return `
        AND (
            ${alias}.deleted_at IS NULL
            OR ${alias}.deleted_at = ''
            OR ${alias}.deleted_at = '0000-00-00 00:00:00'
        )
    `;

}


/*
|--------------------------------------------------------------------------
| SEARCH SCOPE
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
| STATUS SCOPE
|--------------------------------------------------------------------------
*/

function buildStatusScope(status, alias = "c") {

    const value = String(status || "").trim();

    if (!value) {

        return {
            sql: "",
            params: []
        };

    }

    return {
        sql: ` AND LOWER(${alias}.status) = LOWER(?) `,
        params: [value]
    };

}


/*
|--------------------------------------------------------------------------
| LIMIT
|--------------------------------------------------------------------------
|
| PHP supports:
| 100
| 200
| 500
| 5000
| all
|
| Node also accepts 0 and 100000 for compatibility.
|--------------------------------------------------------------------------
*/

function normalizeLimit(value) {

    const raw = String(
        value ?? ""
    )
        .trim()
        .toLowerCase();

    if (
        raw === "all" ||
        raw === "0" ||
        raw === "100000"
    ) {
        return 0;
    }

    const number = Number(raw);

    if (
        number === 100 ||
        number === 200 ||
        number === 500 ||
        number === 5000
    ) {
        return number;
    }

    return 100;
}


/*
|--------------------------------------------------------------------------
| PAGE
|--------------------------------------------------------------------------
*/

function normalizePage(value) {

    const page = Number(value);

    if (!Number.isInteger(page) || page < 1) {
        return 1;
    }

    return page;
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
        value === ""
    ) {
        return null;
    }

    if (value instanceof Date) {
        return value;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;

}


/*
|--------------------------------------------------------------------------
| DAY LEFT
|--------------------------------------------------------------------------
|
| PHP list.php calculates day left from billing_cycle.
|--------------------------------------------------------------------------
*/

function calculateDayLeft(billingCycle) {

    if (
        billingCycle === null ||
        billingCycle === undefined ||
        billingCycle === ""
    ) {
        return null;
    }

    const date = normalizeDate(billingCycle);

    if (!date) {
        return null;
    }

    const now = new Date();

    const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );

    const end = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
    );

    const difference =
        end.getTime() -
        start.getTime();

    return Math.ceil(
        difference /
        (1000 * 60 * 60 * 24)
    );

}


/*
|--------------------------------------------------------------------------
| CUSTOMER NORMALIZER
|--------------------------------------------------------------------------
*/

function normalizeCustomer(row) {

    /*
     * Keep every column from c.*
     * This is important because PHP uses SELECT c.*
     */

    const customer = {
        ...row
    };


    /*
     * Display fields
     */

    customer.display_bill =
        Number(row.display_bill || 0);

    customer.display_package =
        row.display_package ||
        row.package_name ||
        "";


    /*
     * Balance
     */

    customer.balance =
        Number(row.balance || 0);


    /*
     * Day left
     */

    customer.day_left =
        calculateDayLeft(
            row.billing_cycle
        );


    /*
     * Frontend-friendly aliases
     */

    customer.customerId =
        row.customer_id;

    customer.customer_id =
        row.customer_id;

    customer.name =
        row.name || "";

    customer.phone =
        row.phone || "";

    customer.address =
        row.address || "";

    customer.pppoe_username =
        row.pppoe_username || "";

    customer.pppoe_password =
        row.pppoe_password || "";

    customer.package_name =
        row.package_name ||
        row.display_package ||
        "";

    customer.monthly_bill =
        Number(row.monthly_bill || 0);

    customer.status =
        row.status || "";

    customer.payment_status =
        row.payment_status || "";

    return customer;
}


/*
|--------------------------------------------------------------------------
| BASE QUERY
|--------------------------------------------------------------------------
*/

function baseFrom() {

    return `
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
    `;

}


/*
|--------------------------------------------------------------------------
| CUSTOMER LIST
|--------------------------------------------------------------------------
*/

async function getCustomers({
    user,
    page = 1,
    limit = 100,
    search = "",
    status = ""
}) {

    const currentPage =
        normalizePage(page);

    const currentLimit =
        normalizeLimit(limit);


    const company =
        buildCompanyScope(user, "c");

    const deleted =
        buildDeletedScope("c");

    const searchScope =
        buildSearchScope(search, "c");

    const statusScope =
        buildStatusScope(status, "c");


    const whereSql =
        company.sql +
        deleted +
        searchScope.sql +
        statusScope.sql;


    const whereParams = [
        ...company.params,
        ...searchScope.params,
        ...statusScope.params
    ];


    /*
     |--------------------------------------------------------------------------
     | COUNT
     |--------------------------------------------------------------------------
     */

    const countSql = `
        SELECT COUNT(*) AS total
        ${baseFrom()}
        WHERE 1=1
        ${whereSql}
    `;


    const countRows =
        await query(
            countSql,
            whereParams
        );


    const total =
        Number(
            countRows?.[0]?.total || 0
        );


    /*
     |--------------------------------------------------------------------------
     | PAGINATION
     |--------------------------------------------------------------------------
     */

    let totalPages = 1;
    let offset = 0;

    if (currentLimit > 0) {

        totalPages =
            Math.max(
                1,
                Math.ceil(
                    total / currentLimit
                )
            );

        const safePage =
            Math.min(
                currentPage,
                totalPages
            );

        offset =
            (safePage - 1) *
            currentLimit;

    }


    /*
     |--------------------------------------------------------------------------
     | DATA
     |--------------------------------------------------------------------------
     |
     | IMPORTANT:
     | PHP uses c.*
     |
     */

    let dataSql = `
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
            ) AS display_package

        ${baseFrom()}

        WHERE 1=1
        ${whereSql}

        GROUP BY c.id

        ORDER BY c.id ASC
    `;


    const dataParams = [
        ...whereParams
    ];


    if (currentLimit > 0) {

        dataSql += `
            LIMIT ? OFFSET ?
        `;

        dataParams.push(
            currentLimit,
            offset
        );

    }


    const rows =
        await query(
            dataSql,
            dataParams
        );


    const customers =
        rows.map(
            normalizeCustomer
        );


    return {

        customers,

        pagination: {

            page:
                currentLimit > 0
                    ? currentPage
                    : 1,

            limit:
                currentLimit,

            total,

            totalPages,

            pages:
                totalPages,

            offset,

            hasNext:
                currentLimit > 0 &&
                currentPage < totalPages,

            hasPrev:
                currentLimit > 0 &&
                currentPage > 1
        }

    };

}


/*
|--------------------------------------------------------------------------
| SUMMARY
|--------------------------------------------------------------------------
*/

async function getSummary({
    user,
    search = "",
    status = ""
}) {

    const company =
        buildCompanyScope(user, "c");

    const deleted =
        buildDeletedScope("c");

    const searchScope =
        buildSearchScope(search, "c");

    const statusScope =
        buildStatusScope(status, "c");


    const whereSql =
        company.sql +
        deleted +
        searchScope.sql +
        statusScope.sql;


    const params = [
        ...company.params,
        ...searchScope.params,
        ...statusScope.params
    ];


    const sql = `
        SELECT

            COUNT(DISTINCT c.id)
                AS total_customer,

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
                SUM(c.balance),
                0
            ) AS total_balance

        ${baseFrom()}

        WHERE 1=1
        ${whereSql}
    `;


    const rows =
        await query(
            sql,
            params
        );


    const row =
        rows?.[0] || {};


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
            ),

        /*
         * Compatibility aliases
         */

        total_customers:
            Number(
                row.total_customer || 0
            ),

        bill:
            Number(
                row.total_bill || 0
            ),

        balance:
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
        !Number.isInteger(customerId) ||
        customerId <= 0
    ) {
        return null;
    }


    const company =
        buildCompanyScope(user, "c");

    const deleted =
        buildDeletedScope("c");


    const sql = `
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
            ) AS display_package

        ${baseFrom()}

        WHERE c.id = ?
        ${company.sql}
        ${deleted}

        LIMIT 1
    `;


    const params = [
        customerId,
        ...company.params
    ];


    const rows =
        await query(
            sql,
            params
        );


    if (!rows.length) {
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
