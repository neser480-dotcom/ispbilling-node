"use strict";

const db = require("../config/database");
const mikrotik = require("./mikrotik.service");


/*
|--------------------------------------------------------------------------
| QUERY
|--------------------------------------------------------------------------
*/

async function query(sql, params = []) {
    const [rows] = await db.query(sql, params);
    return rows;
}


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

    const connection = await db.getConnection();

    let mikrotikCreated = false;

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
            String(data.customer_id || "").trim();

        const name =
            String(data.name || "").trim();

        const phone =
            String(data.phone || "").trim();

        const address =
            String(data.address || "").trim();

        const username =
            String(data.pppoe_name || "").trim();

        const password =
            String(data.password || "");

        const email =
            String(data.email || "").trim();

        const comment =
            String(data.comment || "").trim();

        const status =
            ["Active", "Inactive", "Expired"].includes(
                data.status
            )
                ? data.status
                : "Active";

        const billingType =
            ["Prepaid", "Postpaid"].includes(
                data.billing_type
            )
                ? data.billing_type
                : "Prepaid";


        /*
        |--------------------------------------------------------------------------
        | VALIDATION
        |--------------------------------------------------------------------------
        */

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

        const routerRows =
            await connection.query(
                routerSql,
                routerParams
            );

        const router =
            routerRows[0][0] || null;

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

        const packageRows =
            packageResult[0];

        const pkg =
            packageRows[0] || null;

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
        | AREA
        |--------------------------------------------------------------------------
        */

        let areaName = "";
        let subAreaName = "";

        if (areaId > 0) {

            let areaSql = `
                SELECT
                    id,
                    name
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

            const areaRows =
                areaResult[0];

            if (!areaRows.length) {
                throw new Error(
                    "Selected area was not found."
                );
            }

            areaName =
                areaRows[0].name || "";
        }


        /*
        |--------------------------------------------------------------------------
        | SUB AREA
        |--------------------------------------------------------------------------
        */

        if (subAreaId > 0) {

            let subAreaSql = `
                SELECT
                    id,
                    name
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

            const subAreaRows =
                subAreaResult[0];

            if (!subAreaRows.length) {
                throw new Error(
                    "Selected sub-area was not found."
                );
            }

            subAreaName =
                subAreaRows[0].name || "";
        }


        /*
        |--------------------------------------------------------------------------
        | DUPLICATE CUSTOMER ID
        |--------------------------------------------------------------------------
        */

        let duplicateCustomerSql = `
            SELECT id
            FROM customers
            WHERE customer_id = ?
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

        if (duplicateCustomerResult[0].length) {

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
            SELECT id
            FROM customers
            WHERE pppoe_username = ?
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

        if (duplicatePPPoEResult[0].length) {

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
        | MIKROTIK CREATE
        |--------------------------------------------------------------------------
        */

        await mikrotik.createSecret(
            router,
            {
                username,
                password,
                profile: mikrotikProfile,
                service: "pppoe",
                comment:
                    comment ||
                    `${customerId} - ${name}`
            }
        );

        mikrotikCreated = true;


        /*
        |--------------------------------------------------------------------------
        | CUSTOMER INSERT
        |--------------------------------------------------------------------------
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
                area_name,
                sub_area_name,
                status,
                billing_type,
                payment_status,
                balance,
                comment,
                sync_status,
                created_by,
                created_at
            )
            VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW()
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
            areaName,
            subAreaName,
            status,
            billingType,
            "unpaid",
            0,
            comment,
            1,
            userId
        ];

        await connection.query(
            insertSql,
            insertParams
        );


        /*
        |--------------------------------------------------------------------------
        | COMMIT
        |--------------------------------------------------------------------------
        */

        await connection.commit();

        return {
            success: true,
            customer_id: customerId,
            pppoe_username: username,
            mikrotik_id: routerId
        };

    } catch (error) {

        await connection.rollback();

        /*
        |--------------------------------------------------------------------------
        | MIKROTIK COMPENSATION NOTICE
        |--------------------------------------------------------------------------
        */

        if (mikrotikCreated) {

            error.message =
                `${error.message} MikroTik PPP secret may have been created; please verify it on the router.`;
        }

        throw error;

    } finally {

        connection.release();
    }
}


module.exports = {
    addCustomer
};