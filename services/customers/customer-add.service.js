"use strict";

const db = require("../../config/database");
const mikrotik = require("../mikrotik/mikrotik.service");


/*
|--------------------------------------------------------------------------
| ADD CUSTOMER
|--------------------------------------------------------------------------
*/

async function addCustomer({
    companyId,
    isSuperAdmin,
    userId,
    data
}) {

    const connection =
        await db.getConnection();

    /*
    |--------------------------------------------------------------------------
    | MikroTik compensation state
    |--------------------------------------------------------------------------
    */

    let router = null;

    let mikrotikCreated = false;

    let mikrotikCreatedId = "";

    let mikrotikUsername = "";


    try {

        await connection.beginTransaction();


        /*
        |--------------------------------------------------------------------------
        | BASIC VALUES
        |--------------------------------------------------------------------------
        */

        const routerId =
            Number(data.mikrotik_id || 0);

        const packageId =
            Number(data.package_id || 0);

        const areaId =
            Number(data.area_id || 0);

        const subAreaId =
            Number(data.sub_area_id || 0);

        const customerId =
            String(
                data.customer_id || ""
            ).trim();

        const name =
            String(
                data.name || ""
            ).trim();

        const phone =
            String(
                data.phone || ""
            ).trim();

        const address =
            String(
                data.address || ""
            ).trim();

        const username =
            String(
                data.pppoe_name || ""
            ).trim();

        const password =
            String(
                data.password || ""
            );

        const email =
            String(
                data.email || ""
            ).trim();

        const comments =
            String(
                data.comment ??
                data.comments ??
                ""
            ).trim();


        /*
        |--------------------------------------------------------------------------
        | STATUS
        |--------------------------------------------------------------------------
        */

        const requestedStatus =
            String(
                data.status || "Active"
            ).trim();


        const status =
            [
                "Active",
                "Inactive",
                "Expired"
            ].includes(
                requestedStatus
            )
                ? requestedStatus
                : "Active";


        /*
        |--------------------------------------------------------------------------
        | BILLING TYPE
        |--------------------------------------------------------------------------
        |
        | Database ENUM:
        | PREPAID / POSTPAID
        |
        */

        const requestedBillingType =
            String(
                data.billing_type || "POSTPAID"
            )
            .trim()
            .toUpperCase();


        const billingType =
            [
                "PREPAID",
                "POSTPAID"
            ].includes(
                requestedBillingType
            )
                ? requestedBillingType
                : "POSTPAID";


        /*
        |--------------------------------------------------------------------------
        | VALIDATION
        |--------------------------------------------------------------------------
        */

        if (!userId) {

            throw new Error(
                "Authenticated user is required."
            );

        }


        if (!isSuperAdmin && !companyId) {

            throw new Error(
                "Company access is not configured for this account."
            );

        }


        if (!customerId) {

            throw new Error(
                "Customer ID is required."
            );

        }


        if (!name) {

            throw new Error(
                "Customer name is required."
            );

        }


        if (!username) {

            throw new Error(
                "PPPoE username is required."
            );

        }


        if (!password) {

            throw new Error(
                "PPPoE password is required."
            );

        }


        if (!routerId) {

            throw new Error(
                "MikroTik server is required."
            );

        }


        if (!packageId) {

            throw new Error(
                "Package is required."
            );

        }


        /*
        |--------------------------------------------------------------------------
        | ROUTER
        |--------------------------------------------------------------------------
        */

        let routerSql = `
            SELECT
                id,
                company_id,
                name,
                ip,
                username,
                password,
                port,
                use_ssl,
                timeout
            FROM mikrotik_servers
            WHERE id = ?
        `;


        const routerParams = [
            routerId
        ];


        if (!isSuperAdmin) {

            routerSql += `
                AND company_id = ?
            `;

            routerParams.push(
                companyId
            );

        }


        routerSql += `
            LIMIT 1
        `;


        const routerResult =
            await connection.query(
                routerSql,
                routerParams
            );


        router =
            routerResult[0][0] || null;


        if (!router) {

            throw new Error(
                "Selected MikroTik server was not found."
            );

        }


        /*
        |--------------------------------------------------------------------------
        | PACKAGE
        |--------------------------------------------------------------------------
        */

        let packageSql = `
            SELECT
                id,
                company_id,
                router_id,
                profile_id,
                package_name,
                price,
                alias_name
            FROM mikrotik_packages
            WHERE id = ?
              AND router_id = ?
        `;


        const packageParams = [
            packageId,
            routerId
        ];


        if (!isSuperAdmin) {

            packageSql += `
                AND company_id = ?
            `;

            packageParams.push(
                companyId
            );

        }


        packageSql += `
            LIMIT 1
        `;


        const packageResult =
            await connection.query(
                packageSql,
                packageParams
            );


        const pkg =
            packageResult[0][0] || null;


        if (!pkg) {

            throw new Error(
                "Selected package was not found."
            );

        }


        /*
        |--------------------------------------------------------------------------
        | PACKAGE PRICE
        |--------------------------------------------------------------------------
        */

        const monthlyBill =
            Number(
                data.monthly_fee !== undefined &&
                data.monthly_fee !== ""
                    ? data.monthly_fee
                    : pkg.price || 0
            );


        if (
            !Number.isFinite(monthlyBill) ||
            monthlyBill < 0
        ) {

            throw new Error(
                "Invalid monthly bill."
            );

        }


        /*
        |--------------------------------------------------------------------------
        | AREA VALIDATION
        |--------------------------------------------------------------------------
        |
        | customers table stores only area_id.
        |
        */

        if (areaId > 0) {

            let areaSql = `
                SELECT
                    id
                FROM areas
                WHERE id = ?
            `;


            const areaParams = [
                areaId
            ];


            if (!isSuperAdmin) {

                areaSql += `
                    AND company_id = ?
                `;

                areaParams.push(
                    companyId
                );

            }


            areaSql += `
                LIMIT 1
            `;


            const areaResult =
                await connection.query(
                    areaSql,
                    areaParams
                );


            if (
                !areaResult[0].length
            ) {

                throw new Error(
                    "Selected area was not found."
                );

            }

        }


        /*
        |--------------------------------------------------------------------------
        | SUB AREA VALIDATION
        |--------------------------------------------------------------------------
        |
        | customers table stores only sub_area_id.
        |
        */

        if (subAreaId > 0) {

            let subAreaSql = `
                SELECT
                    id
                FROM sub_areas
                WHERE id = ?
            `;


            const subAreaParams = [
                subAreaId
            ];


            if (!isSuperAdmin) {

                subAreaSql += `
                    AND company_id = ?
                `;

                subAreaParams.push(
                    companyId
                );

            }


            subAreaSql += `
                LIMIT 1
            `;


            const subAreaResult =
                await connection.query(
                    subAreaSql,
                    subAreaParams
                );


            if (
                !subAreaResult[0].length
            ) {

                throw new Error(
                    "Selected sub-area was not found."
                );

            }

        }


        /*
        |--------------------------------------------------------------------------
        | DUPLICATE CUSTOMER ID
        |--------------------------------------------------------------------------
        */

        let duplicateCustomerSql = `
            SELECT
                id
            FROM customers
            WHERE customer_id = ?
              AND deleted_at IS NULL
        `;


        const duplicateCustomerParams = [
            customerId
        ];


        if (!isSuperAdmin) {

            duplicateCustomerSql += `
                AND company_id = ?
            `;

            duplicateCustomerParams.push(
                companyId
            );

        }


        duplicateCustomerSql += `
            LIMIT 1
        `;


        const duplicateCustomerResult =
            await connection.query(
                duplicateCustomerSql,
                duplicateCustomerParams
            );


        if (
            duplicateCustomerResult[0].length
        ) {

            throw new Error(
                `Customer ID ${customerId} already exists.`
            );

        }


        /*
        |--------------------------------------------------------------------------
        | DUPLICATE PPPOE
        |--------------------------------------------------------------------------
        */

        let duplicatePPPoESql = `
            SELECT
                id
            FROM customers
            WHERE pppoe_username = ?
              AND deleted_at IS NULL
        `;


        const duplicatePPPoEParams = [
            username
        ];


        if (!isSuperAdmin) {

            duplicatePPPoESql += `
                AND company_id = ?
            `;

            duplicatePPPoEParams.push(
                companyId
            );

        }


        duplicatePPPoESql += `
            LIMIT 1
        `;


        const duplicatePPPoEResult =
            await connection.query(
                duplicatePPPoESql,
                duplicatePPPoEParams
            );


        if (
            duplicatePPPoEResult[0].length
        ) {

            throw new Error(
                `PPPoE username ${username} already exists.`
            );

        }


        /*
        |--------------------------------------------------------------------------
        | MIKROTIK PROFILE
        |--------------------------------------------------------------------------
        */

        let mikrotikProfile =
            String(
                pkg.profile_id || ""
            ).trim();


        if (!mikrotikProfile) {

            mikrotikProfile =
                String(
                    pkg.package_name || ""
                ).trim();

        }


        if (!mikrotikProfile) {

            throw new Error(
                "MikroTik PPP profile is missing from the selected package."
            );

        }


        /*
        |--------------------------------------------------------------------------
        | CHECK MIKROTIK BEFORE CREATE
        |--------------------------------------------------------------------------
        */

        const existingMikrotikSecret =
            await mikrotik.findSecret(
                router,
                username
            );


        if (
            existingMikrotikSecret &&
            existingMikrotikSecret[".id"]
        ) {

            throw new Error(
                `PPPoE username "${username}" already exists on MikroTik.`
            );

        }


        /*
        |--------------------------------------------------------------------------
        | CREATE MIKROTIK PPP SECRET
        |--------------------------------------------------------------------------
        */

        const createdSecret =
            await mikrotik.createSecret(
                router,
                {
                    username,
                    password,
                    profile: mikrotikProfile,
                    service: "pppoe",
                    comment:
                        comments ||
                        `${customerId} - ${name}`
                }
            );


        mikrotikCreated = true;

        mikrotikUsername =
            username;


        mikrotikCreatedId =
            String(
                createdSecret?.id || ""
            ).trim();


        /*
        |--------------------------------------------------------------------------
        | CUSTOMER INSERT
        |--------------------------------------------------------------------------
        |
        | Exact columns from customers table.
        |
        */

        const insertSql = `
            INSERT INTO customers (
                company_id,
                customer_id,
                name,
                phone,
                address,
                email,
                package_id,
                package_name,
                monthly_bill,
                pppoe_username,
                pppoe_password,
                mikrotik_id,
                area_id,
                sub_area_id,
                status,
                billing_type,
                payment_status,
                balance,
                comments,
                sync_status,
                created_by,
                created_at
            )
            VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW()
            )
        `;


        const insertParams = [

            companyId,

            customerId,

            name,

            phone,

            address,

            email,

            packageId,

            pkg.package_name || "",

            monthlyBill,

            username,

            password,

            routerId,

            areaId || null,

            subAreaId || null,

            status,

            billingType,

            "unpaid",

            0,

            comments,

            1,

            userId
        ];


        const insertResult =
            await connection.query(
                insertSql,
                insertParams
            );


        /*
        |--------------------------------------------------------------------------
        | VERIFY INSERT
        |--------------------------------------------------------------------------
        */

        if (
            !insertResult ||
            !insertResult[0] ||
            !insertResult[0].insertId
        ) {

            throw new Error(
                "Customer was not inserted into the database."
            );

        }

        /*
        |--------------------------------------------------------------------------
        | BILLING CYCLE / PROMISE DATE / OTHER FORM FIELDS
        |--------------------------------------------------------------------------
        | The main INSERT above does not carry these. They are saved right after,
        | only into columns that really exist in the customers table.
        | Promise date = billing cycle date (unless a promise date is sent).
        */
        await saveExtraCustomerFields(
            connection,
            insertResult[0].insertId,
            data
        );


        /*
        |--------------------------------------------------------------------------
        | COMMIT
        |--------------------------------------------------------------------------
        */

        await connection.commit();


        return {

            success: true,

            customer_id:
                customerId,

            pppoe_username:
                username,

            mikrotik_id:
                routerId,

            database_id:
                insertResult[0].insertId

        };


    } catch (error) {

        /*
        |--------------------------------------------------------------------------
        | DATABASE ROLLBACK
        |--------------------------------------------------------------------------
        */

        try {

            await connection.rollback();

        } catch (rollbackError) {

            console.error(
                "Customer add database rollback error:",
                rollbackError
            );

        }


        /*
        |--------------------------------------------------------------------------
        | MIKROTIK COMPENSATION
        |--------------------------------------------------------------------------
        |
        | DB failed after MikroTik secret was created.
        | Remove only the secret created by this request.
        |
        */

        if (
            mikrotikCreated &&
            router
        ) {

            try {

                await mikrotik.deleteSecret(
                    router,
                    {
                        id:
                            mikrotikCreatedId,

                        username:
                            mikrotikUsername
                    }
                );


                console.error(
                    "Customer add compensation: MikroTik PPP secret removed.",
                    {
                        username:
                            mikrotikUsername,

                        mikrotikId:
                            mikrotikCreatedId || null
                    }
                );


            } catch (cleanupError) {

                /*
                |--------------------------------------------------------------------------
                | CRITICAL CLEANUP FAILURE
                |--------------------------------------------------------------------------
                */

                console.error(
                    "CRITICAL: Customer DB creation failed and MikroTik cleanup also failed.",
                    {
                        username:
                            mikrotikUsername,

                        mikrotikId:
                            mikrotikCreatedId || null,

                        originalError:
                            error.message,

                        cleanupError:
                            cleanupError.message
                    }
                );


                error.message =
                    `${error.message} MikroTik PPP secret cleanup failed; please verify "${mikrotikUsername}" on the router.`;

            }

        }


        throw error;


    } finally {

        connection.release();

    }

}



/*
|--------------------------------------------------------------------------
| EXTRA FIELDS SAVED AFTER INSERT
|--------------------------------------------------------------------------
*/

function toSqlDateTime(value) {

    const text = String(value || "").trim();

    if (!text) return null;

    const m = text.match(
        /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (!m) return null;

    return `${m[1]}-${m[2]}-${m[3]} ${m[4] || "00"}:${m[5] || "00"}:${m[6] || "00"}`;
}

function toSqlDate(value) {

    const full = toSqlDateTime(value);

    return full ? full.slice(0, 10) : null;
}

async function saveExtraCustomerFields(connection, customerDbId, data) {

    const [cols] = await connection.query("SHOW COLUMNS FROM customers");

    const have = new Set(cols.map(c => c.Field));

    const first = (...names) => names.find(n => have.has(n)) || null;

    const set = {};

    const billing = toSqlDateTime(data.billing_cycle);
    const promise = toSqlDateTime(data.promise_date) || billing;

    if (billing && have.has("billing_cycle")) set.billing_cycle = billing;
    if (promise && have.has("promise_date")) set.promise_date = promise;

    const connectionDate = toSqlDate(data.connection_date);

    if (connectionDate && have.has("connection_date")) {
        set.connection_date = connectionDate;
    }

    const fee = Number(data.connection_fee);

    if (Number.isFinite(fee) && fee > 0 && have.has("connection_fee")) {
        set.connection_fee = fee;
    }

    const balance = Number(data.balance);

    if (Number.isFinite(balance) && balance !== 0 && have.has("balance")) {
        set.balance = balance;
    }

    const nidCol = first("nid", "nid_no");
    const nid = String(data.nid || data.nid_no || "").trim();

    if (nid && nidCol) set[nidCol] = nid;

    const birth = toSqlDate(data.birth_date);

    if (birth && have.has("birth_date")) set.birth_date = birth;

    ["division_id", "district_id", "upazila_id"].forEach(function (key) {
        const value = Number(data[key] || 0);
        if (value > 0 && have.has(key)) set[key] = value;
    });

    ["reference_name", "reference_mobile"].forEach(function (key) {
        const value = String(data[key] || "").trim();
        if (value && have.has(key)) set[key] = value;
    });

    /* Automatic connection: "Will continue" / "Next Month" checkboxes */
    const auto = [].concat(data.auto_connection || []).map(String);

    if (have.has("auto_connection")) {
        set.auto_connection = auto.includes("Will continue") ? 1 : 0;
    }

    const nextCol = first("continue_next_month", "auto_next_month");

    if (nextCol) {
        set[nextCol] = auto.includes("Next Month") ? 1 : 0;
    }

    const keys = Object.keys(set);

    if (!keys.length) return;

    await connection.query(
        `UPDATE customers
         SET ${keys.map(k => `\`${k}\` = ?`).join(", ")}
         WHERE id = ?
         LIMIT 1`,
        keys.map(k => set[k]).concat([customerDbId])
    );
}

module.exports = {
    addCustomer
};