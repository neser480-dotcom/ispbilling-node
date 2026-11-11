
"use strict";

const db = require("../../config/database");

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
| ADVANCED CUSTOMER FILTERS
|--------------------------------------------------------------------------
*/

function buildAdvancedFilterScope(filters = {}, alias = "c") {
    const clauses = [];
    const params = [];

    const idFilters = [
        ["router_id", "mikrotik_id"],
        ["package_id", "package_id"],
        ["area_id", "area_id"],
        ["sub_area_id", "sub_area_id"]
    ];

    for (const [key, column] of idFilters) {
        const value = String(filters[key] ?? "").trim();

        if (value !== "") {
            const id = Number(value);

            if (Number.isInteger(id) && id > 0) {
                clauses.push(` AND ${alias}.${column} = ? `);
                params.push(id);
            }
        }
    }

    const payment = String(filters.payment_status ?? "").trim().toLowerCase();

    if (["paid", "unpaid"].includes(payment)) {
        clauses.push(` AND LOWER(COALESCE(${alias}.payment_status, '')) = ? `);
        params.push(payment);
    }

    const customerType = String(filters.customer_type ?? "").trim().toLowerCase();

    if (customerType === "new") {
        clauses.push(` AND ${alias}.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) `);
    } else if (customerType === "expired") {
        clauses.push(` AND LOWER(COALESCE(${alias}.status, '')) = 'expired' `);
    } else if (customerType === "due") {
        clauses.push(` AND (COALESCE(${alias}.balance, 0) < 0 OR LOWER(COALESCE(${alias}.payment_status, '')) = 'unpaid') `);
    }

    const otherCustomerType = String(filters.other_customer_type ?? "").trim().toLowerCase();

    if (otherCustomerType === "new") {
        clauses.push(` AND ${alias}.created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND ${alias}.created_at < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH) `);
    } else if (otherCustomerType === "inactive") {
        clauses.push(` AND LOWER(COALESCE(${alias}.status, '')) = 'inactive' `);
    } else if (otherCustomerType === "due") {
        clauses.push(` AND (COALESCE(${alias}.balance, 0) < 0 OR LOWER(COALESCE(${alias}.payment_status, '')) = 'unpaid') `);
    }

    const billDateLeft = String(filters.bill_date_left ?? "").trim();

    if (billDateLeft !== "") {
        const days = Number(billDateLeft);

        if (Number.isInteger(days) && [0, 1, 2, 3, 5, 7].includes(days)) {
            clauses.push(` AND DATEDIFF(DATE(${alias}.billing_cycle), CURDATE()) = ? `);
            params.push(days);
        }
    }

    const dateFilters = [
        ["billing_start", "billing_cycle", ">="],
        ["billing_end", "billing_cycle", "<="],
        ["promise_start", "promise_date", ">="],
        ["promise_end", "promise_date", "<="]
    ];

    for (const [key, column, operator] of dateFilters) {
        const raw = String(filters[key] ?? "").trim();

        if (!raw) continue;

        const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) continue;

        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const check = new Date(Date.UTC(year, month - 1, day));

        if (
            check.getUTCFullYear() !== year ||
            check.getUTCMonth() + 1 !== month ||
            check.getUTCDate() !== day
        ) continue;

        clauses.push(
            operator === "<="
                ? ` AND DATE(${alias}.${column}) <= ? `
                : ` AND DATE(${alias}.${column}) >= ? `
        );

        params.push(raw);
    }

    return {
        sql: clauses.join(" "),
        params
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
        if (Number.isNaN(value.getTime())) {
            return null;
        }

        return {
            year: value.getFullYear(),
            month: value.getMonth() + 1,
            day: value.getDate()
        };
    }

    const raw = String(value).trim();

    // MySQL: YYYY-MM-DD or YYYY-MM-DD HH:mm:ss
    const match = raw.match(
        /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/
    );

    if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);

        const check = new Date(
            Date.UTC(year, month - 1, day)
        );

        if (
            check.getUTCFullYear() !== year ||
            check.getUTCMonth() + 1 !== month ||
            check.getUTCDate() !== day
        ) {
            return null;
        }

        return { year, month, day };
    }

    // Fallback for other valid date formats
    const date = new Date(raw);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate()
    };
}


/*
|--------------------------------------------------------------------------
| DAY LEFT
|--------------------------------------------------------------------------
| Calendar-day difference; ignores hours and minutes.
|--------------------------------------------------------------------------
*/

function calculateDayLeft(billingCycle) {
    const end = normalizeDate(billingCycle);

    if (!end) {
        return null;
    }

    // Bangladesh calendar date (Asia/Dhaka)
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());

    const today = {};

    for (const part of parts) {
        if (part.type !== "literal") {
            today[part.type] = Number(part.value);
        }
    }

    const startUtc = Date.UTC(
        today.year,
        today.month - 1,
        today.day
    );

    const endUtc = Date.UTC(
        end.year,
        end.month - 1,
        end.day
    );

    return Math.round(
        (endUtc - startUtc) / 86400000
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
    status = "",
    ...filters
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


    const otherScope = filters.other_customer_type ? buildAdvancedFilterScope({ other_customer_type: filters.other_customer_type }, "c") : { sql: "", params: [] };

    const whereSql = company.sql + deleted + searchScope.sql + statusScope.sql + otherScope.sql;

    const whereParams = [
        ...company.params,
        ...searchScope.params,
        ...statusScope.params,
        ...otherScope.params
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
    status = "",
    ...filters
}) {

    const company =
        buildCompanyScope(user, "c");

    const deleted =
        buildDeletedScope("c");

    const searchScope =
        buildSearchScope(search, "c");

    const statusScope =
        buildStatusScope(status, "c");


    const advancedScope =
        buildAdvancedFilterScope(filters, "c");

    const whereSql =
        company.sql +
        deleted +
        searchScope.sql +
        statusScope.sql +
        advancedScope.sql;

    const params = [
        ...company.params,
        ...searchScope.params,
        ...statusScope.params,
        ...advancedScope.params
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


