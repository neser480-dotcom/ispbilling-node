"use strict";

const db = require("../config/database");
const mikrotik = require("../services/mikrotik.service");
const customerAdd =
    require("../services/customer-add.service");


async function query(sql, params = []) {
    const [rows] = await db.query(sql, params);
    return rows;
}


/*
|--------------------------------------------------------------------------
| ADD FORM DATA
|--------------------------------------------------------------------------
*/

async function formData(req, res) {

    try {

        const companyId =
            Number(
                req.session.company_id || 0
            );

        const role =
            String(
                req.session.role || ""
            ).toLowerCase();

        const isSuperAdmin =
            role === "super_admin" ||
            role === "superadmin";


        /*
        |--------------------------------------------------------------------------
        | MIKROTIK
        |--------------------------------------------------------------------------
        */

        let routerSql = `
            SELECT
                id,
                name,
                ip
            FROM mikrotik_servers
            WHERE 1 = 1
        `;

        const routerParams = [];

        if (!isSuperAdmin) {

            if (!companyId) {
                return res.json({
                    success: true,
                    data: {
                        routers: [],
                        areas: []
                    }
                });
            }

            routerSql += `
                AND company_id = ?
            `;

            routerParams.push(
                companyId
            );
        }

        routerSql += `
            ORDER BY name ASC
        `;

        const routers =
            await query(
                routerSql,
                routerParams
            );


        /*
        |--------------------------------------------------------------------------
        | AREAS
        |--------------------------------------------------------------------------
        */

        let areaSql = `
            SELECT
                id,
                name
            FROM areas
            WHERE 1 = 1
        `;

        const areaParams = [];

        if (!isSuperAdmin) {

            areaSql += `
                AND company_id = ?
            `;

            areaParams.push(
                companyId
            );
        }

        areaSql += `
            ORDER BY name ASC
        `;

        const areas =
            await query(
                areaSql,
                areaParams
            );


        return res.json({
            success: true,
            data: {
                routers,
                areas
            }
        });

    } catch (error) {

        console.error(
            "Customer add form error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to load customer form data."
        });
    }
}


/*
|--------------------------------------------------------------------------
| PACKAGES
|--------------------------------------------------------------------------
*/

async function packages(req, res) {

    try {

        const routerId =
            Number(
                req.query.router_id || 0
            );

        if (!routerId) {
            return res.json({
                success: true,
                data: []
            });
        }

        const companyId =
            Number(
                req.session.company_id || 0
            );

        const role =
            String(
                req.session.role || ""
            ).toLowerCase();

        const isSuperAdmin =
            role === "super_admin" ||
            role === "superadmin";

        let sql = `
            SELECT
                id,
                profile_id,
                package_name,
                price,
                alias_name
            FROM mikrotik_packages
            WHERE router_id = ?
        `;

        const params = [
            routerId
        ];

        if (!isSuperAdmin) {

            if (!companyId) {
                return res.json({
                    success: true,
                    data: []
                });
            }

            sql += `
                AND company_id = ?
            `;

            params.push(
                companyId
            );
        }

        sql += `
            ORDER BY package_name ASC
        `;

        const rows =
            await query(
                sql,
                params
            );

        return res.json({
            success: true,
            data: rows
        });

    } catch (error) {

        console.error(
            "Customer packages error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to load packages."
        });
    }
}


/*
|--------------------------------------------------------------------------
| CREATE CUSTOMER
|--------------------------------------------------------------------------
*/

async function create(req, res) {

    try {

        const userId =
            Number(
                req.session.user_id || 0
            );

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized."
            });
        }

        const companyId =
            Number(
                req.session.company_id || 0
            );

        const role =
            String(
                req.session.role || ""
            ).toLowerCase();

        const isSuperAdmin =
            role === "super_admin" ||
            role === "superadmin";


        if (!isSuperAdmin && !companyId) {
            return res.status(403).json({
                success: false,
                message:
                    "Company access is not configured for this account."
            });
        }


        const result =
            await customerAdd.addCustomer({
                companyId,
                isSuperAdmin,
                userId,
                data: req.body || {}
            });


        return res.status(201).json(
            result
        );

    } catch (error) {

        console.error(
            "Create customer error:",
            error
        );

        return res.status(400).json({
            success: false,
            message:
                error.message ||
                "Failed to create customer."
        });
    }
}


module.exports = {
    formData,
    packages,
    create
};