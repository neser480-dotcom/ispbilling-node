"use strict";

const db = require("../config/database");
const mikrotik = require("./mikrotik.service");


/*
|--------------------------------------------------------------------------
| BASIC HELPERS
|--------------------------------------------------------------------------
*/

async function query(sql, params = []) {
    const [rows] = await db.query(sql, params);
    return rows;
}


function isSuperAdmin(user) {
    return user && user.role === "super_admin";
}


function getCompanyId(user) {
    return Number(user?.company_id || 0);
}


function buildCompanyScope(user, alias = "c") {

    if (isSuperAdmin(user)) {
        return {
            sql: "",
            params: []
        };
    }

    const companyId = getCompanyId(user);

    if (!companyId) {
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


function normalizeIds(value) {

    if (value === undefined || value === null) {
        return [];
    }

    let values = [];

    if (Array.isArray(value)) {
        values = value;
    } else {
        values = String(value)
            .split(",")
            .map(v => v.trim())
            .filter(Boolean);
    }

    return [
        ...new Set(
            values
                .map(v => Number(v))
                .filter(v => Number.isInteger(v) && v > 0)
        )
    ];
}


function normalizeDate(value) {

    if (!value) {
        return null;
    }

    let text = String(value).trim();

    if (!text) {
        return null;
    }

    text = text.replace("T", " ");

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return `${text} 00:00:00`;
    }

    if (
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)
    ) {
        return `${text}:00`;
    }

    if (
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
    ) {
        return text;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    const pad = n => String(n).padStart(2, "0");

    return [
        date.getFullYear(),
        "-",
        pad(date.getMonth() + 1),
        "-",
        pad(date.getDate()),
        " ",
        pad(date.getHours()),
        ":",
        pad(date.getMinutes()),
        ":",
        pad(date.getSeconds())
    ].join("");
}


function formatDateTimeLocal(value) {

    if (!value) {
        return "";
    }

    const text = String(value)
        .replace("T", " ");

    return text.substring(0, 16);
}


function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function sqlPlaceholders(count) {
    return new Array(count).fill("?").join(",");
}


function calculateDayLeft(value) {

    if (!value) {
        return null;
    }

    const target = new Date(
        String(value).replace(" ", "T")
    );

    if (Number.isNaN(target.getTime())) {
        return null;
    }

    const now = new Date();

    const a = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );

    const b = new Date(
        target.getFullYear(),
        target.getMonth(),
        target.getDate()
    );

    return Math.ceil(
        (b - a) / 86400000
    );
}


/*
|--------------------------------------------------------------------------
| CUSTOMER NORMALIZE
|--------------------------------------------------------------------------
*/

function normalizeCustomer(row) {

    const bill = Number(
        row.display_bill ??
        row.monthly_bill ??
        0
    );

    const balance = Number(
        row.balance || 0
    );

    const dayLeft = calculateDayLeft(
        row.billing_cycle ||
        row.promise_date
    );

    return {
        ...row,

        id: Number(row.id),

        monthly_bill: bill,

        display_bill: bill,

        balance,

        day_left: dayLeft,

        display_package:
            row.display_package ||
            row.package_name ||
            "",

        status:
            row.status ||
            "Active",

        payment_status:
            row.payment_status ||
            "unpaid"
    };
}


/*
|--------------------------------------------------------------------------
| GET CUSTOMERS
|--------------------------------------------------------------------------
*/

async function getCustomers(user, options = {}) {

    const page =
        Math.max(
            Number(options.page || 1),
            1
        );

    const requestedLimit =
        Number(options.limit || 100);

    const allowedLimits = [
        100,
        200,
        500,
        5000,
        0
    ];

    const limit =
        allowedLimits.includes(requestedLimit)
            ? requestedLimit
            : 100;

    const search =
        String(options.search || "").trim();

    const status =
        String(options.status || "").trim();

    const scope =
        buildCompanyScope(user, "c");

    let where = `
        WHERE c.deleted_at IS NULL
        ${scope.sql}
    `;

    const params = [
        ...scope.params
    ];

    if (search) {

        where += `
            AND (
                c.customer_id LIKE ?
                OR c.name LIKE ?
                OR c.phone LIKE ?
                OR c.pppoe_username LIKE ?
                OR c.address LIKE ?
            )
        `;

        const q = `%${search}%`;

        params.push(
            q,
            q,
            q,
            q,
            q
        );
    }

    if (status) {

        where += `
            AND LOWER(c.status) = LOWER(?)
        `;

        params.push(status);
    }

    const countRows = await query(
        `
        SELECT COUNT(*) AS total
        FROM customers c
        ${where}
        `,
        params
    );

    const total =
        Number(countRows[0]?.total || 0);

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

            mp.profile_id,
            mp.router_id,
            mp.alias_name,

            a.name AS area_name,
            sa.name AS sub_area_name

        FROM customers c

        LEFT JOIN mikrotik_packages mp
            ON mp.id = c.package_id
            AND (
                mp.company_id = c.company_id
                OR mp.company_id = 0
            )

        LEFT JOIN areas a
            ON a.id = c.area_id
            AND (
                a.company_id = c.company_id
                OR a.company_id = 0
            )

        LEFT JOIN sub_areas sa
            ON sa.id = c.sub_area_id
            AND (
                sa.company_id = c.company_id
                OR sa.company_id = 0
            )

        ${where}

        ORDER BY c.id DESC
    `;

    if (limit > 0) {

        const offset =
            (page - 1) * limit;

        sql += `
            LIMIT ${limit}
            OFFSET ${offset}
        `;
    }

    const rows =
        await query(sql, params);

    return {
        data: rows.map(normalizeCustomer),

        pagination: {
            page,
            limit,
            total,
            totalPages:
                limit > 0
                    ? Math.ceil(total / limit)
                    : 1
        }
    };
}


/*
|--------------------------------------------------------------------------
| SUMMARY
|--------------------------------------------------------------------------
*/

async function getSummary(user, options = {}) {

    const scope =
        buildCompanyScope(user, "c");

    const params =
        [...scope.params];

    let where = `
        WHERE c.deleted_at IS NULL
        ${scope.sql}
    `;

    if (options.search) {

        where += `
            AND (
                c.customer_id LIKE ?
                OR c.name LIKE ?
                OR c.phone LIKE ?
                OR c.pppoe_username LIKE ?
            )
        `;

        const q =
            `%${String(options.search).trim()}%`;

        params.push(
            q,
            q,
            q,
            q
        );
    }

    const rows = await query(
        `
        SELECT

            COUNT(*) AS total,

            SUM(
                LOWER(c.status) = 'active'
            ) AS active,

            SUM(
                LOWER(c.status) = 'expired'
            ) AS expired,

            SUM(
                LOWER(c.status) = 'inactive'
            ) AS inactive,

            SUM(
                LOWER(c.status) = 'suspended'
            ) AS suspended,

            SUM(
                LOWER(c.status) = 'disabled'
            ) AS disabled,

            SUM(
                LOWER(c.status) = 'pending'
            ) AS pending,

            COALESCE(
                SUM(c.balance),
                0
            ) AS balance

        FROM customers c

        ${where}
        `,
        params
    );

    return rows[0] || {};
}


/*
|--------------------------------------------------------------------------
| SINGLE CUSTOMER
|--------------------------------------------------------------------------
*/

async function getCustomerById(user, id) {

    const scope =
        buildCompanyScope(user, "c");

    const rows =
        await query(
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

                mp.profile_id,
                mp.router_id,
                mp.alias_name,

                ms.name AS mikrotik_name,

                a.name AS area_name,
                sa.name AS sub_area_name

            FROM customers c

            LEFT JOIN mikrotik_packages mp
                ON mp.id = c.package_id
                AND (
                    mp.company_id = c.company_id
                    OR mp.company_id = 0
                )

            LEFT JOIN mikrotik_servers ms
                ON ms.id = c.mikrotik_id
                AND (
                    ms.company_id = c.company_id
                    OR ms.company_id = 0
                )

            LEFT JOIN areas a
                ON a.id = c.area_id

            LEFT JOIN sub_areas sa
                ON sa.id = c.sub_area_id

            WHERE c.id = ?
              AND c.deleted_at IS NULL
              ${scope.sql}

            LIMIT 1
            `,
            [
                Number(id),
                ...scope.params
            ]
        );

    return rows.length
        ? normalizeCustomer(rows[0])
        : null;
}


/*
|--------------------------------------------------------------------------
| SELECT CUSTOMERS WITH TENANT PROTECTION
|--------------------------------------------------------------------------
*/

async function getSelectedCustomers(
    user,
    ids,
    connection = null,
    forUpdate = false
) {

    ids =
        normalizeIds(ids);

    if (!ids.length) {
        return [];
    }

    const placeholders =
        sqlPlaceholders(ids.length);

    const scope =
        buildCompanyScope(user, "c");

    const sql = `
        SELECT
            c.*,

            mp.profile_id AS package_profile_id,
            mp.router_id AS package_router_id,
            mp.package_name AS package_package_name,
            mp.price AS package_price,
            mp.alias_name AS package_alias_name

        FROM customers c

        LEFT JOIN mikrotik_packages mp
            ON mp.id = c.package_id
            AND (
                mp.company_id = c.company_id
                OR mp.company_id = 0
            )

        WHERE c.id IN (${placeholders})
          AND c.deleted_at IS NULL
          ${scope.sql}

        ${forUpdate ? "FOR UPDATE" : ""}
    `;

    const params = [
        ...ids,
        ...scope.params
    ];

    if (connection) {

        const [rows] =
            await connection.query(
                sql,
                params
            );

        return rows;
    }

    return query(
        sql,
        params
    );
}


/*
|--------------------------------------------------------------------------
| ROUTER
|--------------------------------------------------------------------------
*/

async function getRouter(
    user,
    routerId
) {

    const id =
        Number(routerId || 0);

    if (!id) {
        throw new Error(
            "MikroTik router is required."
        );
    }

    const scope =
        buildCompanyScope(user, "m");

    const rows =
        await query(
            `
            SELECT *
            FROM mikrotik_servers m
            WHERE m.id = ?
              AND (
                    m.deleted_at IS NULL
                    OR m.deleted_at IS NULL
                  )
              ${scope.sql}
            LIMIT 1
            `,
            [
                id,
                ...scope.params
            ]
        );

    if (!rows.length) {
        throw new Error(
            "MikroTik router not found."
        );
    }

    return rows[0];
}


/*
|--------------------------------------------------------------------------
| FIND CUSTOMER ROUTER
|--------------------------------------------------------------------------
*/

async function resolveCustomerRouter(
    user,
    customer
) {

    if (customer.mikrotik_id) {

        try {

            return await getRouter(
                user,
                customer.mikrotik_id
            );

        } catch (_) {}
    }

    if (customer.package_router_id) {

        try {

            return await getRouter(
                user,
                customer.package_router_id
            );

        } catch (_) {}
    }

    const scope =
        buildCompanyScope(user, "m");

    const rows =
        await query(
            `
            SELECT *
            FROM mikrotik_servers m
            WHERE m.deleted_at IS NULL
            ${scope.sql}
            ORDER BY m.id ASC
            `,
            scope.params
        );

    if (rows.length === 1) {
        return rows[0];
    }

    /*
    |--------------------------------------------------------------------------
    | Multiple routers:
    | search PPP secret
    |--------------------------------------------------------------------------
    */

    if (
        customer.pppoe_username &&
        rows.length
    ) {

        for (const router of rows) {

            try {

                const secret =
                    await mikrotik.findSecret(
                        router,
                        customer.pppoe_username
                    );

                if (
                    secret &&
                    secret[".id"]
                ) {

                    return router;
                }

            } catch (_) {}
        }
    }

    return null;
}


/*
|--------------------------------------------------------------------------
| PPP PROFILE
|--------------------------------------------------------------------------
*/

async function resolvePackageProfile(
    user,
    customer,
    packageId = null,
    routerId = null
) {

    const selectedPackageId =
        Number(
            packageId ||
            customer.package_id ||
            0
        );

    if (selectedPackageId) {

        const scope =
            buildCompanyScope(user, "mp");

        const rows =
            await query(
                `
                SELECT *
                FROM mikrotik_packages mp
                WHERE mp.id = ?
                  AND (
                        mp.company_id = ?
                        OR mp.company_id = 0
                        OR ? = 1
                      )
                  ${
                      routerId
                          ? " AND mp.router_id = ? "
                          : ""
                  }
                LIMIT 1
                `,
                [
                    selectedPackageId,
                    getCompanyId(user),
                    isSuperAdmin(user) ? 1 : 0,
                    ...(routerId
                        ? [Number(routerId)]
                        : [])
                ]
            );

        if (rows.length) {

            return rows[0];
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Existing customer package
    |--------------------------------------------------------------------------
    */

    if (
        customer.package_profile_id
    ) {

        return {
            profile_id:
                customer.package_profile_id,

            package_name:
                customer.package_package_name ||
                customer.package_name ||
                "",

            price:
                customer.package_price ||
                customer.monthly_bill ||
                0
        };
    }

    return null;
}


/*
|--------------------------------------------------------------------------
| PPP ACTIVE SESSION KICK
|--------------------------------------------------------------------------
*/

async function kickCustomer(
    router,
    username
) {

    if (!router || !username) {
        return {
            success: false,
            skipped: true
        };
    }

    return mikrotik.withRouter(
        router,
        async api => {

            const active =
                await api.write(
                    "/ppp/active/print",
                    [
                        `?name=${username}`
                    ]
                );

            if (
                !Array.isArray(active) ||
                !active.length
            ) {

                return {
                    success: true,
                    kicked: false
                };
            }

            let kicked = 0;

            for (const item of active) {

                if (!item[".id"]) {
                    continue;
                }

                await api.write(
                    "/ppp/active/remove",
                    [
                        `=.id=${item[".id"]}`
                    ]
                );

                kicked++;
            }

            return {
                success: true,
                kicked
            };
        }
    );
}


/*
|--------------------------------------------------------------------------
| SET PPP SECRET
|--------------------------------------------------------------------------
*/

async function setSecret(
    router,
    secret,
    values
) {

    if (!secret || !secret[".id"]) {
        throw new Error(
            "PPPoE secret was not found on MikroTik."
        );
    }

    return mikrotik.withRouter(
        router,
        api => {

            const command = [
                "/ppp/secret/set",
                `=.id=${secret[".id"]}`
            ];

            if (
                values.profile !== undefined &&
                values.profile !== null
            ) {
                command.push(
                    `=profile=${values.profile}`
                );
            }

            if (
                values.disabled !== undefined
            ) {
                command.push(
                    `=disabled=${values.disabled ? "yes" : "no"}`
                );
            }

            if (
                values.password !== undefined &&
                values.password !== ""
            ) {
                command.push(
                    `=password=${values.password}`
                );
            }

            if (
                values.name !== undefined &&
                values.name !== ""
            ) {
                command.push(
                    `=name=${values.name}`
                );
            }

            if (
                values.comment !== undefined
            ) {
                command.push(
                    `=comment=${values.comment || ""}`
                );
            }

            return api.write(command);
        }
    );
}


/*
|--------------------------------------------------------------------------
| BLOCK CUSTOMER
|--------------------------------------------------------------------------
*/

async function blockCustomer(
    user,
    customer
) {

    if (!customer.pppoe_username) {

        throw new Error(
            "PPPoE username is missing."
        );
    }

    const router =
        await resolveCustomerRouter(
            user,
            customer
        );

    if (!router) {

        throw new Error(
            "MikroTik router could not be resolved."
        );
    }

    const secret =
        await mikrotik.findSecret(
            router,
            customer.pppoe_username
        );

    if (
        !secret ||
        !secret[".id"]
    ) {

        throw new Error(
            `PPPoE user "${customer.pppoe_username}" was not found on MikroTik.`
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Save existing profile
    |--------------------------------------------------------------------------
    */

    const currentProfile =
        secret.profile ||
        "";

    if (
        currentProfile &&
        currentProfile !== "Block"
    ) {

        try {

            await query(
                `
                INSERT INTO ppp_profile_backup
                (
                    customer_id,
                    profile_name,
                    created_at
                )
                VALUES (?, ?, NOW())
                `,
                [
                    customer.id,
                    currentProfile
                ]
            );

        } catch (_) {

            /*
            | Table may not exist.
            | Blocking should still work.
            */
        }
    }

    await setSecret(
        router,
        secret,
        {
            profile: "Block",
            disabled: false
        }
    );

    await kickCustomer(
        router,
        customer.pppoe_username
    );

    return {
        success: true,
        router_id: router.id
    };
}


/*
|--------------------------------------------------------------------------
| RESTORE CUSTOMER
|--------------------------------------------------------------------------
*/

async function restoreCustomer(
    user,
    customer
) {

    if (!customer.pppoe_username) {

        throw new Error(
            "PPPoE username is missing."
        );
    }

    const router =
        await resolveCustomerRouter(
            user,
            customer
        );

    if (!router) {

        throw new Error(
            "MikroTik router could not be resolved."
        );
    }

    const secret =
        await mikrotik.findSecret(
            router,
            customer.pppoe_username
        );

    if (
        !secret ||
        !secret[".id"]
    ) {

        throw new Error(
            `PPPoE user "${customer.pppoe_username}" was not found on MikroTik.`
        );
    }

    let profile = "";

    /*
    |--------------------------------------------------------------------------
    | Package profile
    |--------------------------------------------------------------------------
    */

    const packageRow =
        await resolvePackageProfile(
            user,
            customer,
            customer.package_id,
            router.id
        );

    if (
        packageRow &&
        packageRow.profile_id
    ) {

        profile =
            packageRow.profile_id;
    }

    /*
    |--------------------------------------------------------------------------
    | Backup profile
    |--------------------------------------------------------------------------
    */

    if (!profile) {

        try {

            const backups =
                await query(
                    `
                    SELECT profile_name
                    FROM ppp_profile_backup
                    WHERE customer_id = ?
                    ORDER BY id DESC
                    LIMIT 1
                    `,
                    [customer.id]
                );

            if (
                backups.length &&
                backups[0].profile_name
            ) {

                profile =
                    backups[0].profile_name;
            }

        } catch (_) {}
    }

    if (
        !profile ||
        profile === "Block"
    ) {

        throw new Error(
            "Customer package/profile could not be resolved."
        );
    }

    await setSecret(
        router,
        secret,
        {
            profile,
            disabled: false
        }
    );

    await kickCustomer(
        router,
        customer.pppoe_username
    );

    try {

        await query(
            `
            DELETE FROM ppp_profile_backup
            WHERE customer_id = ?
            `,
            [customer.id]
        );

    } catch (_) {}

    return {
        success: true,
        router_id: router.id,
        profile
    };
}


/*
|--------------------------------------------------------------------------
| BULK MESSAGE
|--------------------------------------------------------------------------
*/

async function bulkMessage(
    user,
    ids,
    message
) {

    ids =
        normalizeIds(ids);

    if (!ids.length) {
        throw new Error(
            "No customers selected."
        );
    }

    if (!String(message || "").trim()) {
        throw new Error(
            "Message is required."
        );
    }

    const customers =
        await getSelectedCustomers(
            user,
            ids
        );

    if (!customers.length) {
        throw new Error(
            "No valid customers found."
        );
    }

    /*
    |--------------------------------------------------------------------------
    | PHP source currently treats this as a placeholder.
    | Do NOT pretend WhatsApp/SMS was sent.
    |--------------------------------------------------------------------------
    */

    return {
        success: true,
        updated: customers.length,
        message:
            "Bulk message processed successfully."
    };
}


/*
|--------------------------------------------------------------------------
| BULK PROMISE DATE
|--------------------------------------------------------------------------
*/

async function bulkPromiseDate(
    user,
    ids,
    promiseDate
) {

    ids =
        normalizeIds(ids);

    if (!ids.length) {
        throw new Error(
            "No customers selected."
        );
    }

    const date =
        normalizeDate(promiseDate);

    if (!date) {
        throw new Error(
            "Valid promise date is required."
        );
    }

    const scope =
        buildCompanyScope(user, "c");

    const [result] =
        await db.query(
            `
            UPDATE customers c
            SET c.promise_date = ?
            WHERE c.id IN (${sqlPlaceholders(ids.length)})
              AND c.deleted_at IS NULL
              ${scope.sql}
            `,
            [
                date,
                ...ids,
                ...scope.params
            ]
        );

    return {
        success: true,
        affected:
            result.affectedRows
    };
}


/*
|--------------------------------------------------------------------------
| BULK BILLING CYCLE
|--------------------------------------------------------------------------
*/

async function bulkBillingCycle(
    user,
    ids,
    billingCycle
) {

    ids =
        normalizeIds(ids);

    if (!ids.length) {
        throw new Error(
            "No customers selected."
        );
    }

    const date =
        normalizeDate(billingCycle);

    if (!date) {
        throw new Error(
            "Valid billing cycle is required."
        );
    }

    const scope =
        buildCompanyScope(user, "c");

    const [result] =
        await db.query(
            `
            UPDATE customers c
            SET c.billing_cycle = ?
            WHERE c.id IN (${sqlPlaceholders(ids.length)})
              AND c.deleted_at IS NULL
              ${scope.sql}
            `,
            [
                date,
                ...ids,
                ...scope.params
            ]
        );

    return {
        success: true,
        affected:
            result.affectedRows
    };
}


/*
|--------------------------------------------------------------------------
| BULK PAYMENT STATUS
|--------------------------------------------------------------------------
*/

async function bulkPaymentStatus(
    user,
    ids,
    status
) {

    ids =
        normalizeIds(ids);

    const value =
        String(status || "")
            .toLowerCase()
            .trim();

    if (!ids.length) {
        throw new Error(
            "No customers selected."
        );
    }

    if (
        ![
            "paid",
            "unpaid"
        ].includes(value)
    ) {

        throw new Error(
            "Invalid payment status."
        );
    }

    const scope =
        buildCompanyScope(user, "c");

    const [result] =
        await db.query(
            `
            UPDATE customers c
            SET c.payment_status = ?
            WHERE c.id IN (${sqlPlaceholders(ids.length)})
              AND c.deleted_at IS NULL
              ${scope.sql}
            `,
            [
                value,
                ...ids,
                ...scope.params
            ]
        );

    return {
        success: true,
        affected:
            result.affectedRows
    };
}


/*
|--------------------------------------------------------------------------
| BULK BALANCE
|--------------------------------------------------------------------------
*/

async function bulkBalance(
    user,
    ids,
    balance
) {

    ids =
        normalizeIds(ids);

    if (!ids.length) {
        throw new Error(
            "No customers selected."
        );
    }

    const amount =
        Number(balance);

    if (!Number.isFinite(amount)) {
        throw new Error(
            "Valid balance is required."
        );
    }

    const scope =
        buildCompanyScope(user, "c");

    const [result] =
        await db.query(
            `
            UPDATE customers c
            SET c.balance = ?
            WHERE c.id IN (${sqlPlaceholders(ids.length)})
              AND c.deleted_at IS NULL
              ${scope.sql}
            `,
            [
                amount,
                ...ids,
                ...scope.params
            ]
        );

    return {
        success: true,
        affected:
            result.affectedRows
    };
}


/*
|--------------------------------------------------------------------------
| BULK AREA
|--------------------------------------------------------------------------
*/

async function bulkArea(
    user,
    ids,
    areaId,
    subAreaId = 0
) {

    ids =
        normalizeIds(ids);

    const area =
        Number(areaId || 0);

    const subArea =
        Number(subAreaId || 0);

    if (!ids.length) {
        throw new Error(
            "No customers selected."
        );
    }

    if (!area) {
        throw new Error(
            "Area is required."
        );
    }

    const companyId =
        getCompanyId(user);

    if (isSuperAdmin(user)) {

        const areas =
            await query(
                `
                SELECT *
                FROM areas
                WHERE id = ?
                LIMIT 1
                `,
                [area]
            );

        if (!areas.length) {
            throw new Error(
                "Area not found."
            );
        }

    } else {

        const areas =
            await query(
                `
                SELECT *
                FROM areas
                WHERE id = ?
                  AND company_id = ?
                LIMIT 1
                `,
                [
                    area,
                    companyId
                ]
            );

        if (!areas.length) {
            throw new Error(
                "Invalid area."
            );
        }
    }

    if (subArea) {

        const subScope =
            isSuperAdmin()
                ? ""
                : "AND company_id = ?";

        const subParams =
            isSuperAdmin()
                ? [subArea, area]
                : [
                    subArea,
                    area,
                    companyId
                ];

        const subAreas =
            await query(
                `
                SELECT *
                FROM sub_areas
                WHERE id = ?
                  AND area_id = ?
                  ${subScope}
                LIMIT 1
                `,
                subParams
            );

        if (!subAreas.length) {
            throw new Error(
                "Invalid sub-area."
            );
        }
    }

    const scope =
        buildCompanyScope(user, "c");

    const [result] =
        await db.query(
            `
            UPDATE customers c
            SET
                c.area_id = ?,
                c.sub_area_id = ?

            WHERE c.id IN (${sqlPlaceholders(ids.length)})
              AND c.deleted_at IS NULL
              ${scope.sql}
            `,
            [
                area,
                subArea || null,
                ...ids,
                ...scope.params
            ]
        );

    return {
        success: true,
        affected:
            result.affectedRows,
        area_id: area,
        sub_area_id:
            subArea || null
    };
}


/*
|--------------------------------------------------------------------------
| BULK CONNECTION OFF
|--------------------------------------------------------------------------
*/

async function bulkConnectionOff(
    user,
    ids
) {

    ids =
        normalizeIds(ids);

    if (!ids.length) {
        throw new Error(
            "No customers selected."
        );
    }

    const scope =
        buildCompanyScope(user, "c");

    const [result] =
        await db.query(
            `
            UPDATE customers c
            SET c.auto_connection = 0
            WHERE c.id IN (${sqlPlaceholders(ids.length)})
              AND c.deleted_at IS NULL
              ${scope.sql}
            `,
            [
                ...ids,
                ...scope.params
            ]
        );

    return {
        success: true,
        affected:
            result.affectedRows
    };
}


/*
|--------------------------------------------------------------------------
| BULK CONNECTION ON
|--------------------------------------------------------------------------
*/

async function bulkConnectionOn(
    user,
    ids,
    autoStatus = 1,
    nextMonthStatus = 1
) {

    ids =
        normalizeIds(ids);

    if (!ids.length) {
        throw new Error(
            "No customers selected."
        );
    }

    const auto =
        Number(autoStatus) ? 1 : 0;

    const nextMonth =
        Number(nextMonthStatus) ? 1 : 0;

    const scope =
        buildCompanyScope(user, "c");

    /*
    |--------------------------------------------------------------------------
    | Current schema:
    | auto_connection
    | continue_next_month
    |--------------------------------------------------------------------------
    */

    const [result] =
        await db.query(
            `
            UPDATE customers c
            SET
                c.auto_connection = ?,
                c.continue_next_month = ?

            WHERE c.id IN (${sqlPlaceholders(ids.length)})
              AND c.deleted_at IS NULL
              ${scope.sql}
            `,
            [
                auto,
                nextMonth,
                ...ids,
                ...scope.params
            ]
        );

    return {
        success: true,
        affected:
            result.affectedRows
    };
}


/*
|--------------------------------------------------------------------------
| BULK MIKROTIK
|--------------------------------------------------------------------------
*/

async function bulkMikrotik(
    user,
    ids,
    routerId
) {

    ids =
        normalizeIds(ids);

    const id =
        Number(routerId || 0);

    if (!ids.length) {
        throw new Error(
            "No customers selected."
        );
    }

    const router =
        await getRouter(
            user,
            id
        );

    const scope =
        buildCompanyScope(user, "c");

    const [result] =
        await db.query(
            `
            UPDATE customers c
            SET c.mikrotik_id = ?
            WHERE c.id IN (${sqlPlaceholders(ids.length)})
              AND c.deleted_at IS NULL
              ${scope.sql}
            `,
            [
                router.id,
                ...ids,
                ...scope.params
            ]
        );

    return {
        success: true,
        affected:
            result.affectedRows,
        router_id:
            router.id
    };
}


/*
|--------------------------------------------------------------------------
| BULK PACKAGE
|--------------------------------------------------------------------------
*/

async function bulkPackage(
    user,
    ids,
    routerId,
    packageId
) {

    ids =
        normalizeIds(ids);

    const router =
        await getRouter(
            user,
            routerId
        );

    const packageIdNumber =
        Number(packageId || 0);

    if (!packageIdNumber) {
        throw new Error(
            "Package is required."
        );
    }

    const companyId =
        getCompanyId(user);

    const packageRows =
        await query(
            `
            SELECT *
            FROM mikrotik_packages
            WHERE id = ?
              AND router_id = ?
              AND (
                    company_id = ?
                    OR company_id = 0
                    OR ? = 1
                  )
            LIMIT 1
            `,
            [
                packageIdNumber,
                router.id,
                companyId,
                isSuperAdmin(user) ? 1 : 0
            ]
        );

    if (!packageRows.length) {
        throw new Error(
            "Selected package is not valid for this MikroTik router."
        );
    }

    const pkg =
        packageRows[0];

    if (!pkg.profile_id) {
        throw new Error(
            "Selected package has no MikroTik profile."
        );
    }

    const customers =
        await getSelectedCustomers(
            user,
            ids
        );

    if (!customers.length) {
        throw new Error(
            "No valid customers found."
        );
    }

    let success = 0;
    let failed = 0;

    const results = [];

    for (const customer of customers) {

        try {

            if (!customer.pppoe_username) {

                throw new Error(
                    "PPPoE username is missing."
                );
            }

            const secret =
                await mikrotik.findSecret(
                    router,
                    customer.pppoe_username
                );

            if (
                !secret ||
                !secret[".id"]
            ) {

                throw new Error(
                    "PPPoE secret was not found on MikroTik."
                );
            }

            await setSecret(
                router,
                secret,
                {
                    profile:
                        pkg.profile_id
                }
            );

            const scope =
                buildCompanyScope(
                    user,
                    "c"
                );

            const [result] =
                await db.query(
                    `
                    UPDATE customers c
                    SET
                        c.mikrotik_id = ?,
                        c.package_id = ?,
                        c.package_name = ?,
                        c.monthly_bill = ?

                    WHERE c.id = ?
                      AND c.deleted_at IS NULL
                      ${scope.sql}
                    `,
                    [
                        router.id,
                        pkg.id,
                        pkg.package_name ||
                            pkg.alias_name ||
                            pkg.profile_id,
                        Number(pkg.price || 0),
                        customer.id,
                        ...scope.params
                    ]
                );

            if (!result.affectedRows) {

                throw new Error(
                    "Customer database update failed."
                );
            }

            success++;

            results.push({
                id: customer.id,
                success: true
            });

        } catch (error) {

            failed++;

            results.push({
                id: customer.id,
                success: false,
                error: error.message
            });
        }
    }

    return {
        success: true,
        updated: success,
        failed,
        results
    };
}


/*
|--------------------------------------------------------------------------
| BULK STATUS
|--------------------------------------------------------------------------
*/

async function bulkStatus(
    user,
    ids,
    status
) {

    ids =
        normalizeIds(ids);

    const newStatus =
        String(status || "")
            .trim();

    const allowed = [
        "Active",
        "Expired",
        "Inactive",
        "Suspended",
        "Disabled",
        "Pending"
    ];

    if (!allowed.includes(newStatus)) {

        throw new Error(
            "Invalid customer status."
        );
    }

    const customers =
        await getSelectedCustomers(
            user,
            ids
        );

    if (!customers.length) {
        throw new Error(
            "No valid customers found."
        );
    }

    let success = 0;
    let failed = 0;

    const results = [];

    for (const customer of customers) {

        try {

            /*
            |--------------------------------------------------------------------------
            | Active / Expired MUST complete MikroTik operation first.
            |--------------------------------------------------------------------------
            */

            if (newStatus === "Expired") {

                await blockCustomer(
                    user,
                    customer
                );
            }

            if (newStatus === "Active") {

                await restoreCustomer(
                    user,
                    customer
                );
            }

            const scope =
                buildCompanyScope(
                    user,
                    "c"
                );

            const [result] =
                await db.query(
                    `
                    UPDATE customers c
                    SET c.status = ?
                    WHERE c.id = ?
                      AND c.deleted_at IS NULL
                      ${scope.sql}
                    `,
                    [
                        newStatus,
                        customer.id,
                        ...scope.params
                    ]
                );

            if (!result.affectedRows) {

                throw new Error(
                    "Customer status database update failed."
                );
            }

            success++;

            results.push({
                id: customer.id,
                success: true,
                status: newStatus
            });

        } catch (error) {

            failed++;

            results.push({
                id: customer.id,
                success: false,
                error: error.message
            });
        }
    }

    return {
        success: true,
        updated: success,
        failed,
        results
    };
}


/*
|--------------------------------------------------------------------------
| BULK DELETE
|--------------------------------------------------------------------------
*/

async function bulkDelete(
    user,
    ids,
    deleteMikrotik = false
) {

    ids =
        normalizeIds(ids);

    if (!ids.length) {
        throw new Error(
            "No customers selected."
        );
    }

    const customers =
        await getSelectedCustomers(
            user,
            ids
        );

    if (!customers.length) {
        throw new Error(
            "No valid customers found."
        );
    }

    let deleted = 0;
    let failed = 0;

    const results = [];

    for (const customer of customers) {

        try {

            /*
            |--------------------------------------------------------------------------
            | PHP source:
            | MikroTik deletion FIRST.
            | If MikroTik deletion fails, DB customer stays.
            |--------------------------------------------------------------------------
            */

            if (deleteMikrotik) {

                if (
                    customer.pppoe_username
                ) {

                    const router =
                        await resolveCustomerRouter(
                            user,
                            customer
                        );

                    if (!router) {

                        throw new Error(
                            "MikroTik router could not be resolved."
                        );
                    }

                    await mikrotik.deleteSecret(
                        router,
                        {
                            username:
                                customer.pppoe_username
                        }
                    );
                }
            }

            const scope =
                buildCompanyScope(
                    user,
                    "c"
                );

            const [result] =
                await db.query(
                    `
                    DELETE FROM customers
                    WHERE id = ?
                      AND deleted_at IS NULL
                      ${
                          isSuperAdmin(user)
                              ? ""
                              : " AND company_id = ? "
                      }
                    `,
                    isSuperAdmin(user)
                        ? [customer.id]
                        : [
                            customer.id,
                            getCompanyId(user)
                        ]
                );

            if (!result.affectedRows) {

                throw new Error(
                    "Customer database deletion failed."
                );
            }

            deleted++;

            results.push({
                id: customer.id,
                success: true
            });

        } catch (error) {

            failed++;

            results.push({
                id: customer.id,
                success: false,
                error: error.message
            });
        }
    }

    return {
        success: true,
        deleted,
        failed,
        results
    };
}


/*
|--------------------------------------------------------------------------
| BULK RESELLER
|--------------------------------------------------------------------------
*/

async function getResellers(user) {

    const companyId =
        getCompanyId(user);

    let sql = `
        SELECT
            id,
            username,
            fullname,
            name,
            company_id

        FROM users

        WHERE role = 'reseller'
          AND status = 'active'
    `;

    const params = [];

    if (!isSuperAdmin(user)) {

        sql += `
            AND company_id = ?
        `;

        params.push(companyId);
    }

    sql += `
        ORDER BY
            COALESCE(
                NULLIF(name, ''),
                fullname,
                username
            )
    `;

    try {

        return await query(
            sql,
            params
        );

    } catch (_) {

        /*
        |--------------------------------------------------------------------------
        | Current DB enum does not contain reseller.
        |--------------------------------------------------------------------------
        */

        return [];
    }
}


async function bulkReseller(
    user,
    ids,
    resellerId,
    subAreaId = 0
) {

    ids =
        normalizeIds(ids);

    const reseller =
        Number(resellerId || 0);

    if (!ids.length) {
        throw new Error(
            "No customers selected."
        );
    }

    if (!reseller) {
        throw new Error(
            "Reseller is required."
        );
    }

    const resellers =
        await getResellers(user);

    const exists =
        resellers.some(
            row =>
                Number(row.id) === reseller
        );

    if (!exists) {
        throw new Error(
            "Invalid reseller."
        );
    }

    const scope =
        buildCompanyScope(
            user,
            "c"
        );

    /*
    |--------------------------------------------------------------------------
    | Current schema has reseller_id.
    |--------------------------------------------------------------------------
    */

    const [result] =
        await db.query(
            `
            UPDATE customers c
            SET c.reseller_id = ?
            WHERE c.id IN (${sqlPlaceholders(ids.length)})
              AND c.deleted_at IS NULL
              ${scope.sql}
            `,
            [
                reseller,
                ...ids,
                ...scope.params
            ]
        );

    return {
        success: true,
        affected:
            result.affectedRows
    };
}


/*
|--------------------------------------------------------------------------
| BULK RECHARGE
|--------------------------------------------------------------------------
|
| IMPORTANT:
| This follows PHP bulk recharge.
| It does NOT call MikroTik.
|--------------------------------------------------------------------------
*/

function addMonths(date, months) {

    const d =
        new Date(date);

    const day =
        d.getDate();

    d.setDate(1);

    d.setMonth(
        d.getMonth() + months
    );

    const lastDay =
        new Date(
            d.getFullYear(),
            d.getMonth() + 1,
            0
        ).getDate();

    d.setDate(
        Math.min(
            day,
            lastDay
        )
    );

    return d;
}


function formatDateOnly(date) {

    const pad =
        n => String(n).padStart(2, "0");

    return [
        date.getFullYear(),
        "-",
        pad(date.getMonth() + 1),
        "-",
        pad(date.getDate())
    ].join("-");
}


async function bulkRecharge(
    user,
    payload
) {

    let items =
        Array.isArray(payload.items)
            ? payload.items
            : [];

    /*
    |--------------------------------------------------------------------------
    | Fallback:
    | customer_ids[] + amount[id]
    |--------------------------------------------------------------------------
    */

    if (!items.length) {

        const ids =
            normalizeIds(
                payload.customer_ids ||
                payload.ids
            );

        const amounts =
            payload.amount || {};

        items =
            ids.map(id => ({
                customer_id: id,
                amount:
                    Array.isArray(amounts)
                        ? amounts[id]
                        : amounts[id] ??
                          payload.amount
            }));
    }

    if (!items.length) {
        throw new Error(
            "No customers selected."
        );
    }

    if (items.length > 50000) {
        throw new Error(
            "Maximum 50,000 customers can be processed at once."
        );
    }

    const billingType =
        String(
            payload.billing_type ||
            "monthly"
        ).toLowerCase();

    if (
        ![
            "monthly",
            "yearly"
        ].includes(billingType)
    ) {
        throw new Error(
            "Invalid billing type."
        );
    }

    const monthsPaid =
        billingType === "yearly"
            ? 12
            : 1;

    const mediumMap = {
        hand_cash: "Hand Cash",
        bkash: "bKash",
        nagad: "Nagad",
        bank: "Bank Transfer"
    };

    const medium =
        mediumMap[
            String(
                payload.medium ||
                payload.payment_method ||
                "hand_cash"
            ).toLowerCase()
        ] ||
        String(
            payload.medium ||
            payload.payment_method ||
            "Hand Cash"
        );

    const comment =
        String(
            payload.comment ||
            "Bulk recharge"
        );

    const today =
        new Date();

    const paymentDate =
        formatDateOnly(today);

    const resultRows = [];

    let total = 0;
    let ok = 0;
    let failed = 0;
    let totalAmount = 0;

    for (const item of items) {

        const customerId =
            Number(
                item.customer_id ||
                item.id ||
                0
            );

        const amount =
            Number(
                item.amount || 0
            );

        if (!customerId) {

            failed++;

            resultRows.push({
                customer_id:
                    customerId,
                success: false,
                error:
                    "Invalid customer ID."
            });

            continue;
        }

        if (
            !Number.isFinite(amount) ||
            amount <= 0
        ) {

            failed++;

            resultRows.push({
                customer_id:
                    customerId,
                success: false,
                error:
                    "Invalid recharge amount."
            });

            continue;
        }

        const connection =
            await db.getConnection();

        try {

            await connection.beginTransaction();

            const scope =
                buildCompanyScope(
                    user,
                    "c"
                );

            const [rows] =
                await connection.query(
                    `
                    SELECT
                        c.id,
                        c.customer_id,
                        c.name,
                        c.phone,
                        c.monthly_bill,
                        c.balance,
                        c.status,
                        c.payment_status,
                        c.promise_date,
                        c.billing_cycle,
                        c.pppoe_username,
                        c.pppoe_password,
                        c.mikrotik_id,
                        c.company_id

                    FROM customers c

                    WHERE c.id = ?
                      AND c.deleted_at IS NULL
                      ${scope.sql}

                    FOR UPDATE
                    `,
                    [
                        customerId,
                        ...scope.params
                    ]
                );

            if (!rows.length) {

                throw new Error(
                    "Customer not found."
                );
            }

            const customer =
                rows[0];

            const currentBalance =
                Number(
                    customer.balance || 0
                );

            /*
            |--------------------------------------------------------------------------
            | Old promise date today/future => continue from it.
            |--------------------------------------------------------------------------
            */

            let baseDate =
                new Date();

            if (
                customer.promise_date
            ) {

                const old =
                    new Date(
                        String(
                            customer.promise_date
                        ).replace(
                            " ",
                            "T"
                        )
                    );

                if (
                    !Number.isNaN(
                        old.getTime()
                    ) &&
                    old >= baseDate
                ) {

                    baseDate = old;
                }
            }

            const newPromise =
                addMonths(
                    baseDate,
                    monthsPaid
                );

            const newPromiseDate =
                formatDateOnly(
                    newPromise
                );

            const newBalance =
                currentBalance + amount;

            const billingMonth =
                newPromise.getMonth() + 1;

            const billingYear =
                newPromise.getFullYear();

            /*
            |--------------------------------------------------------------------------
            | Payment
            |--------------------------------------------------------------------------
            */

            const [paymentResult] =
                await connection.query(
                    `
                    INSERT INTO payments
                    (
                        company_id,
                        customer_id,
                        amount,
                        payment_method,
                        payment_date,
                        billing_month,
                        billing_year,
                        months_paid,
                        is_advance,
                        comments,
                        created_by
                    )

                    VALUES
                    (
                        ?, ?, ?, ?, ?,
                        ?, ?, ?, 0, ?, ?
                    )
                    `,
                    [
                        customer.company_id,
                        customer.id,
                        amount,
                        medium,
                        paymentDate,
                        billingMonth,
                        billingYear,
                        monthsPaid,
                        comment,
                        user.id
                    ]
                );

            /*
            |--------------------------------------------------------------------------
            | Customer
            |--------------------------------------------------------------------------
            */

            await connection.query(
                `
                UPDATE customers
                SET
                    balance = ?,
                    status = 'Active',
                    payment_status = 'paid',
                    promise_date = ?,
                    billing_cycle = ?

                WHERE id = ?
                `,
                [
                    newBalance,
                    newPromiseDate,
                    newPromiseDate,
                    customer.id
                ]
            );

            await connection.commit();

            ok++;
            totalAmount += amount;

            resultRows.push({
                customer_id:
                    customer.customer_id,

                database_customer_id:
                    customer.id,

                success: true,

                payment_id:
                    paymentResult.insertId,

                amount,

                balance:
                    newBalance,

                promise_date:
                    newPromiseDate,

                billing_cycle:
                    newPromiseDate
            });

        } catch (error) {

            try {
                await connection.rollback();
            } catch (_) {}

            failed++;

            resultRows.push({
                customer_id:
                    customerId,

                success: false,

                error:
                    error.message
            });

        } finally {

            connection.release();
        }

        total++;
    }

    return {
        success: true,
        total,
        ok,
        failed,
        total_amount:
            totalAmount,
        billing_type:
            billingType,
        medium,
        months_paid:
            monthsPaid,
        results:
            resultRows
    };
}


/*
|--------------------------------------------------------------------------
| RENDER BULK FORMS
|--------------------------------------------------------------------------
*/

function renderModal(
    title,
    body
) {

    return `
        <div class="modal-header">
            <h5 class="modal-title">
                ${escapeHtml(title)}
            </h5>

            <button
                type="button"
                class="btn-close"
                data-bs-dismiss="modal">
            </button>
        </div>

        <div class="modal-body">
            ${body}
        </div>
    `;
}


function hiddenIds(ids) {

    return normalizeIds(ids)
        .map(
            id =>
                `<input
                    type="hidden"
                    name="customer_ids[]"
                    value="${id}"
                >`
        )
        .join("");
}


async function bulkMessageForm(
    user,
    ids
) {

    return renderModal(
        "Bulk Message",
        `
        <form
            method="POST"
            action="/api/customers/bulk/message">

            ${hiddenIds(ids)}

            <div class="mb-3">
                <label class="form-label">
                    Message
                </label>

                <textarea
                    class="form-control"
                    name="message"
                    rows="5"
                    required></textarea>
            </div>

            <button
                type="submit"
                class="btn btn-primary">
                Process
            </button>
        </form>
        `
    );
}


async function bulkPromiseDateForm(
    user,
    ids
) {

    const value =
        formatDateTimeLocal(
            new Date()
        );

    return renderModal(
        "Bulk Promise Date",
        `
        <form
            method="POST"
            action="/api/customers/bulk/promise_date">

            ${hiddenIds(ids)}

            <div class="mb-3">
                <label class="form-label">
                    Promise Date
                </label>

                <input
                    type="datetime-local"
                    class="form-control"
                    name="promise_date"
                    value="${escapeHtml(value)}"
                    required>
            </div>

            <button
                type="submit"
                class="btn btn-primary">
                Update
            </button>
        </form>
        `
    );
}


async function bulkBillingCycleForm(
    user,
    ids
) {

    const now =
        new Date();

    const pad =
        n => String(n).padStart(2, "0");

    const value =
        `${now.getFullYear()}-${pad(
            now.getMonth() + 1
        )}-${pad(
            now.getDate()
        )}T${pad(
            now.getHours()
        )}:${pad(
            now.getMinutes()
        )}`;

    return renderModal(
        "Bulk Billing Cycle",
        `
        <form
            method="POST"
            action="/api/customers/bulk/billing_cycle">

            ${hiddenIds(ids)}

            <div class="mb-3">
                <label class="form-label">
                    Billing Date
                </label>

                <input
                    type="datetime-local"
                    class="form-control"
                    name="billing_cycle"
                    value="${value}"
                    required>
            </div>

            <button
                type="submit"
                class="btn btn-primary">
                Update
            </button>
        </form>
        `
    );
}


async function bulkPaymentStatusForm(
    user,
    ids
) {

    return renderModal(
        "Bulk Payment Status",
        `
        <form
            method="POST"
            action="/api/customers/bulk/payment_status">

            ${hiddenIds(ids)}

            <div class="mb-3">
                <label class="form-label">
                    Payment Status
                </label>

                <select
                    name="payment_status"
                    class="form-select"
                    required>

                    <option value="paid">
                        Paid
                    </option>

                    <option value="unpaid">
                        Unpaid
                    </option>

                </select>
            </div>

            <button
                type="submit"
                class="btn btn-primary">
                Update
            </button>
        </form>
        `
    );
}


async function bulkBalanceForm(
    user,
    ids
) {

    return renderModal(
        "Bulk Balance",
        `
        <form
            method="POST"
            action="/api/customers/bulk/balance">

            ${hiddenIds(ids)}

            <div class="mb-3">
                <label class="form-label">
                    Balance
                </label>

                <input
                    type="number"
                    step="0.01"
                    class="form-control"
                    name="balance"
                    value="0"
                    required>
            </div>

            <button
                type="submit"
                class="btn btn-primary">
                Update
            </button>
        </form>
        `
    );
}


async function bulkStatusForm(
    user,
    ids
) {

    return renderModal(
        "Bulk Status",
        `
        <form
            method="POST"
            action="/api/customers/bulk/status">

            ${hiddenIds(ids)}

            <div class="mb-3">

                <label class="form-label">
                    Status
                </label>

                <select
                    class="form-select"
                    name="status"
                    required>

                    <option value="Active">
                        Active
                    </option>

                    <option value="Expired">
                        Expired
                    </option>

                    <option value="Inactive">
                        Inactive
                    </option>

                    <option value="Suspended">
                        Suspended
                    </option>

                    <option value="Disabled">
                        Disabled
                    </option>

                    <option value="Pending">
                        Pending
                    </option>

                </select>

            </div>

            <button
                type="submit"
                class="btn btn-primary">
                Update
            </button>

        </form>
        `
    );
}


/*
|--------------------------------------------------------------------------
| AREAS
|--------------------------------------------------------------------------
*/

async function getAreas(user) {

    const scope =
        buildCompanyScope(
            user,
            "a"
        );

    return query(
        `
        SELECT *
        FROM areas a
        WHERE 1=1
        ${scope.sql}
        ORDER BY a.name ASC
        `,
        scope.params
    );
}


async function bulkAreaForm(
    user,
    ids
) {

    const areas =
        await getAreas(user);

    return renderModal(
        "Bulk Area",
        `
        <form
            method="POST"
            action="/api/customers/bulk/area">

            ${hiddenIds(ids)}

            <div class="mb-3">

                <label class="form-label">
                    Area
                </label>

                <select
                    class="form-select"
                    name="area_id"
                    required>

                    <option value="">
                        Select Area
                    </option>

                    ${areas.map(
                        area =>
                            `
                            <option
                                value="${area.id}">
                                ${escapeHtml(area.name)}
                            </option>
                            `
                    ).join("")}

                </select>

            </div>

            <div class="mb-3">

                <label class="form-label">
                    Sub Area
                </label>

                <select
                    class="form-select"
                    name="sub_area_id">

                    <option value="">
                        None
                    </option>

                </select>

            </div>

            <button
                type="submit"
                class="btn btn-primary">
                Update
            </button>

        </form>
        `
    );
}


/*
|--------------------------------------------------------------------------
| MIKROTIK FORM
|--------------------------------------------------------------------------
*/

async function getRouters(user) {

    const scope =
        buildCompanyScope(
            user,
            "m"
        );

    return query(
        `
        SELECT
            id,
            name,
            ip,
            port

        FROM mikrotik_servers m

        WHERE m.deleted_at IS NULL
        ${scope.sql}

        ORDER BY m.name ASC
        `,
        scope.params
    );
}


async function bulkMikrotikForm(
    user,
    ids
) {

    const routers =
        await getRouters(user);

    return renderModal(
        "Bulk MikroTik",
        `
        <form
            method="POST"
            action="/api/customers/bulk/mikrotik">

            ${hiddenIds(ids)}

            <div class="mb-3">

                <label class="form-label">
                    MikroTik
                </label>

                <select
                    class="form-select"
                    name="mikrotik_id"
                    required>

                    <option value="">
                        Select Router
                    </option>

                    ${routers.map(
                        router =>
                            `
                            <option
                                value="${router.id}">
                                ${escapeHtml(
                                    router.name ||
                                    router.ip
                                )}
                            </option>
                            `
                    ).join("")}

                </select>

            </div>

            <button
                type="submit"
                class="btn btn-primary">
                Update
            </button>

        </form>
        `
    );
}


/*
|--------------------------------------------------------------------------
| PACKAGE FORM
|--------------------------------------------------------------------------
*/

async function bulkPackageForm(
    user,
    ids
) {

    const routers =
        await getRouters(user);

    return renderModal(
        "Bulk Package",
        `
        <form
            method="POST"
            action="/api/customers/bulk/package">

            ${hiddenIds(ids)}

            <div class="mb-3">

                <label class="form-label">
                    MikroTik
                </label>

                <select
                    class="form-select"
                    name="mikrotik_id"
                    id="bulkPackageRouter"
                    required>

                    <option value="">
                        Select Router
                    </option>

                    ${routers.map(
                        router =>
                            `
                            <option
                                value="${router.id}">
                                ${escapeHtml(
                                    router.name ||
                                    router.ip
                                )}
                            </option>
                            `
                    ).join("")}

                </select>

            </div>

            <div class="mb-3">

                <label class="form-label">
                    Package
                </label>

                <select
                    class="form-select"
                    name="package_id"
                    id="bulkPackageSelect"
                    required>

                    <option value="">
                        Select Router First
                    </option>

                </select>

            </div>

            <button
                type="submit"
                class="btn btn-primary">
                Update Package
            </button>

        </form>

        <script>
        (function(){

            const router =
                document.getElementById(
                    "bulkPackageRouter"
                );

            const pkg =
                document.getElementById(
                    "bulkPackageSelect"
                );

            if (!router || !pkg) {
                return;
            }

            router.addEventListener(
                "change",
                async function(){

                    pkg.innerHTML =
                        '<option value="">Loading...</option>';

                    if (!this.value) {
                        pkg.innerHTML =
                            '<option value="">Select Router First</option>';
                        return;
                    }

                    try {

                        const response =
                            await fetch(
                                "/api/customers/packages?router_id=" +
                                encodeURIComponent(
                                    this.value
                                ),
                                {
                                    credentials:
                                        "same-origin"
                                }
                            );

                        const data =
                            await response.json();

                        const rows =
                            Array.isArray(data)
                                ? data
                                : (
                                    Array.isArray(
                                        data.data
                                    )
                                        ? data.data
                                        : []
                                );

                        pkg.innerHTML =
                            '<option value="">Select Package</option>';

                        rows.forEach(
                            row => {

                                const option =
                                    document.createElement(
                                        "option"
                                    );

                                option.value =
                                    row.id;

                                option.textContent =
                                    row.package_name ||
                                    row.alias_name ||
                                    row.profile_id;

                                pkg.appendChild(
                                    option
                                );
                            }
                        );

                    } catch (_) {

                        pkg.innerHTML =
                            '<option value="">Failed to load packages</option>';
                    }
                }
            );

        })();
        </script>
        `
    );
}


/*
|--------------------------------------------------------------------------
| DELETE FORM
|--------------------------------------------------------------------------
*/

async function bulkDeleteForm(
    user,
    ids
) {

    return renderModal(
        "Delete Customers",
        `
        <form
            method="POST"
            action="/api/customers/bulk/delete">

            ${hiddenIds(ids)}

            <div class="alert alert-danger">

                Selected customers will be deleted.

            </div>

            <div class="form-check mb-3">

                <input
                    class="form-check-input"
                    type="checkbox"
                    value="1"
                    name="delete_mikrotik"
                    id="bulkDeleteMikrotik">

                <label
                    class="form-check-label"
                    for="bulkDeleteMikrotik">

                    Do you want to delete MikroTik PPP secret?

                </label>

            </div>

            <button
                type="submit"
                class="btn btn-danger">

                Delete

            </button>

        </form>
        `
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

    getCustomerById,

    bulkMessage,
    bulkMessageForm,

    bulkPromiseDate,
    bulkPromiseDateForm,

    bulkBillingCycle,
    bulkBillingCycleForm,

    bulkPaymentStatus,
    bulkPaymentStatusForm,

    bulkArea,
    bulkAreaForm,

    bulkStatus,
    bulkStatusForm,

    bulkBalance,
    bulkBalanceForm,

    bulkRecharge,

    bulkReseller,

    bulkConnectionOn,
    bulkConnectionOff,

    bulkMikrotik,
    bulkMikrotikForm,

    bulkPackage,
    bulkPackageForm,

    bulkDelete,
    bulkDeleteForm,

    getResellers,
    getRouters
};