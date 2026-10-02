"use strict";

const path = require("path");
const crypto = require("crypto");
const db = require("../../config/database");


/*
|--------------------------------------------------------------------------
| SYSTEM PERMISSIONS
|--------------------------------------------------------------------------
*/

const SYSTEM_PERMISSIONS = {
    customer_id_auto_generate: {
        label: "Customer ID Auto Generate",
        category: "customer"
    },
    bulk_area_edit: {
        label: "Bulk Area Edit",
        category: "customer"
    },
    bulk_status_edit: {
        label: "Bulk Status Edit",
        category: "customer"
    },
    bulk_auto_disable_edit: {
        label: "Bulk Auto Disable Edit",
        category: "customer"
    },
    bulk_package_edit: {
        label: "Bulk Package Edit",
        category: "customer"
    },
    bulk_customer_delete: {
        label: "Bulk Customer Delete",
        category: "customer"
    },
    bulk_customer_mikrotik_update: {
        label: "Bulk Customer MikroTik Update",
        category: "customer"
    },
    customer_auto_connection: {
        label: "Customer Auto Connection",
        category: "customer"
    },
    bulk_customer_recharge: {
        label: "Bulk Customer Recharge",
        category: "customer"
    },
    add_customer_with_mobile: {
        label: "Add Customer With Mobile",
        category: "customer"
    },
    inactive_offline_customer_delete: {
        label: "Inactive / Offline Customer Delete",
        category: "customer"
    },
    unpaid_customer_bulk_sms: {
        label: "Unpaid Customer Bulk SMS",
        category: "customer"
    },
    show_customer_panel_package: {
        label: "Show Customer Panel Package",
        category: "customer"
    },
    customer_invoice: {
        label: "Customer Invoice",
        category: "customer"
    },
    without_mikrotik_customer_minus_balance: {
        label: "Without MikroTik Customer Minus Balance",
        category: "customer"
    },
    customer_portal: {
        label: "Customer Portal",
        category: "customer"
    },

    mikrotik_add: {
        label: "MikroTik Add",
        category: "mikrotik"
    },
    mikrotik_delete: {
        label: "MikroTik Delete",
        category: "mikrotik"
    },

    promise_date: {
        label: "Promise Date",
        category: "billing"
    },
    report_delete: {
        label: "Report Delete",
        category: "billing"
    },
    expenditure_delete: {
        label: "Expenditure Delete",
        category: "billing"
    },
    bulk_billing_cycle_edit: {
        label: "Bulk Billing Cycle Edit",
        category: "billing"
    },
    bulk_promise_date_edit: {
        label: "Bulk Promise Date Edit",
        category: "billing"
    },
    bulk_payment_status_edit: {
        label: "Bulk Payment Status Edit",
        category: "billing"
    },
    fixed_billing_cycle_date: {
        label: "Fixed Billing Cycle Date",
        category: "billing"
    },
    instant_recharge_bill_print: {
        label: "Instant Recharge Bill Print",
        category: "billing"
    },
    daily_recharge_feature: {
        label: "Daily Recharge Feature",
        category: "billing"
    },
    deposit_update: {
        label: "Deposit Update",
        category: "billing"
    },
    dashboard_probability_amount_with_new_customer: {
        label: "Dashboard Probability Amount With New Customer",
        category: "billing"
    },

    network_diagram: {
        label: "Network Diagram",
        category: "network"
    },
    network_monitoring: {
        label: "Network Monitoring",
        category: "network"
    },
    traffic_monitoring: {
        label: "Traffic Monitoring",
        category: "network"
    },
    interface_monitor: {
        label: "Interface Monitor",
        category: "network"
    },
    pole_box: {
        label: "Pole Box",
        category: "network"
    },

    olt_add: {
        label: "OLT Add",
        category: "olt"
    },
    olt_user_monitoring: {
        label: "OLT User Monitoring",
        category: "olt"
    },

    reseller_add: {
        label: "Reseller Add",
        category: "reseller"
    },
    multiple_manager: {
        label: "Multiple Manager",
        category: "reseller"
    },
    reseller_customer_bulk_status_edit: {
        label: "Reseller Customer Bulk Status Edit",
        category: "reseller"
    },
    reseller_customer_bulk_promise_date_edit: {
        label: "Reseller Customer Bulk Promise Date Edit",
        category: "reseller"
    },
    reseller_customer_bulk_billing_cycle_edit: {
        label: "Reseller Customer Bulk Billing Cycle Edit",
        category: "reseller"
    },
    reseller_minus_balance: {
        label: "Reseller Minus Balance",
        category: "reseller"
    },
    reseller_customer_bulk_auto_connection_edit: {
        label: "Reseller Customer Bulk Auto Connection Edit",
        category: "reseller"
    },
    reseller_customer_bulk_area_edit: {
        label: "Reseller Customer Bulk Area Edit",
        category: "reseller"
    },
    reseller_customer_bulk_payment_status_edit: {
        label: "Reseller Customer Bulk Payment Status Edit",
        category: "reseller"
    },
    bulk_transfer_to_reseller: {
        label: "Bulk Transfer To Reseller",
        category: "reseller"
    },
    bandwidth_reseller: {
        label: "Bandwidth Reseller",
        category: "reseller"
    }
};

const PERMISSION_KEYS =
    Object.keys(SYSTEM_PERMISSIONS);


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function clean(value) {
    return String(value ?? "").trim();
}


function normalizeRole(role) {

    return clean(role)
        .toLowerCase()
        .replace(/[\s_-]+/g, "");

}


function isSuperAdmin(req) {

    const sessionRole =
        normalizeRole(
            req.session?.role
        );

    return sessionRole === "superadmin";
}


function currentUserId(req) {

    return Number(
        req.session?.user_id || 0
    );

}


function sessionCompanyId(req) {

    return Number(
        req.session?.company_id || 0
    );

}


async function query(sql, params = []) {

    const [rows] =
        await db.query(
            sql,
            params
        );

    return rows;

}


/*
|--------------------------------------------------------------------------
| CSRF TOKEN
|--------------------------------------------------------------------------
*/

function getCsrfToken(req) {

    if (!req.session) {
        return "";
    }

    if (
        !req.session.csrf_token ||
        typeof req.session.csrf_token !== "string" ||
        req.session.csrf_token.length < 64
    ) {

        req.session.csrf_token =
            crypto.randomBytes(32).toString("hex");

    }

    return req.session.csrf_token;

}


/*
|--------------------------------------------------------------------------
| USER
|--------------------------------------------------------------------------
*/

async function getUser(userId) {

    const rows =
        await query(
            `
            SELECT
                id,
                company_id,
                username,
                fullname,
                name,
                email,
                mobile,
                phone,
                address,
                company_name,
                owner_name,
                role,
                status,
                customer_id,
                client_type,
                created_at
            FROM users
            WHERE id = ?
            LIMIT 1
            `,
            [userId]
        );

    return rows[0] || null;

}


/*
|--------------------------------------------------------------------------
| TARGET ACCESS
|--------------------------------------------------------------------------
*/

async function getTargetUser(
    req,
    targetId
) {

    if (isSuperAdmin(req)) {

        return getUser(targetId);

    }


    const companyId =
        sessionCompanyId(req);


    if (companyId <= 0) {
        return null;
    }


    const rows =
        await query(
            `
            SELECT
                id,
                company_id,
                username,
                fullname,
                name,
                email,
                mobile,
                phone,
                address,
                company_name,
                owner_name,
                role,
                status,
                customer_id,
                client_type,
                created_at
            FROM users
            WHERE id = ?
              AND company_id = ?
            LIMIT 1
            `,
            [
                targetId,
                companyId
            ]
        );


    return rows[0] || null;

}


/*
|--------------------------------------------------------------------------
| CUSTOMER COUNT
|--------------------------------------------------------------------------
*/

async function getCustomerCount(user) {

    if (!user) {
        return 0;
    }


    if (
        Number(user.company_id || 0) <= 0
    ) {
        return 0;
    }


    try {

        const rows =
            await query(
                `
                SELECT COUNT(*) AS total
                FROM customers
                WHERE company_id = ?
                `,
                [
                    Number(
                        user.company_id
                    )
                ]
            );


        return Number(
            rows[0]?.total || 0
        );

    } catch (error) {

        console.error(
            "[Admin Profile] customer count:",
            error
        );

        return 0;

    }

}


/*
|--------------------------------------------------------------------------
| PERMISSIONS
|--------------------------------------------------------------------------
*/

async function getPermissions(userId) {

    const rows =
        await query(
            `
            SELECT
                permission_key,
                allowed
            FROM user_permissions
            WHERE user_id = ?
            `,
            [userId]
        );


    const permissions = {};


    for (
        const key of PERMISSION_KEYS
    ) {

        permissions[key] = false;

    }


    for (const row of rows) {

        if (
            Object.prototype.hasOwnProperty.call(
                permissions,
                row.permission_key
            )
        ) {

            permissions[
                row.permission_key
            ] =
                Number(row.allowed) === 1;

        }

    }


    return permissions;

}


/*
|--------------------------------------------------------------------------
| PAGE
|--------------------------------------------------------------------------
*/

exports.page = async (
    req,
    res
) => {

    if (!req.session?.user_id) {

        return res.status(401).send(
            "Authentication required."
        );

    }


    /*
    |--------------------------------------------------------------------------
    | Make sure CSRF token exists before page is used.
    |--------------------------------------------------------------------------
    */

    getCsrfToken(req);


    return res.sendFile(
        path.join(
            __dirname,
            "../../views/admin/profile.html"
        )
    );

};


/*
|--------------------------------------------------------------------------
| PROFILE DATA
|--------------------------------------------------------------------------
*/

exports.data = async (
    req,
    res
) => {

    try {

        const currentId =
            currentUserId(req);


        if (currentId <= 0) {

            return res.status(401).json({
                success: false,
                message:
                    "Authentication required."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | Always create/get current session CSRF token.
        |--------------------------------------------------------------------------
        */

        const csrfToken =
            getCsrfToken(req);


        let targetId =
            Number(
                req.query.user_id ||
                req.query.id ||
                currentId
            );


        if (
            !Number.isInteger(targetId) ||
            targetId <= 0
        ) {

            targetId = currentId;

        }


        const targetUser =
            await getTargetUser(
                req,
                targetId
            );


        if (!targetUser) {

            return res.status(404).json({
                success: false,
                message:
                    "User not found."
            });

        }


        const superAdmin =
            isSuperAdmin(req);


        const ownProfile =
            targetId === currentId;


        /*
        |--------------------------------------------------------------------------
        | PROFILE EDITING
        |--------------------------------------------------------------------------
        */

        let canEditProfile =
            ownProfile;


        if (
            !ownProfile &&
            superAdmin
        ) {

            canEditProfile = true;

        }


        /*
        |--------------------------------------------------------------------------
        | CUSTOMER COUNT
        |--------------------------------------------------------------------------
        */

        const totalCustomers =
            await getCustomerCount(
                targetUser
            );


        /*
        |--------------------------------------------------------------------------
        | PERMISSIONS
        |--------------------------------------------------------------------------
        */

        const permissions =
            await getPermissions(
                targetId
            );


        /*
        |--------------------------------------------------------------------------
        | DISPLAY VALUES
        |--------------------------------------------------------------------------
        */

        const role =
            clean(targetUser.role);


        const displayName =
            clean(
                targetUser.fullname ||
                targetUser.name ||
                targetUser.owner_name
            );


        const displayCompany =
            clean(
                targetUser.company_name
            );


        const displayMobile =
            clean(
                targetUser.mobile ||
                targetUser.phone
            );


        /*
        |--------------------------------------------------------------------------
        | RESPONSE
        |--------------------------------------------------------------------------
        */

        return res.json({

            success: true,

            /*
            |--------------------------------------------------------------------------
            | CSRF
            |--------------------------------------------------------------------------
            */

            csrf_token:
                csrfToken,


            current_user: {

                id:
                    currentId,

                company_id:
                    sessionCompanyId(req),

                role:
                    clean(
                        req.session?.role
                    )

            },


            target_user: {

                id:
                    Number(
                        targetUser.id
                    ),

                company_id:
                    Number(
                        targetUser.company_id || 0
                    ),

                username:
                    clean(
                        targetUser.username
                    ),

                fullname:
                    clean(
                        targetUser.fullname
                    ),

                name:
                    clean(
                        targetUser.name
                    ),

                display_name:
                    displayName,

                company_name:
                    displayCompany,

                email:
                    clean(
                        targetUser.email
                    ),

                mobile:
                    displayMobile,

                address:
                    clean(
                        targetUser.address
                    ),

                customer_id:
                    clean(
                        targetUser.customer_id
                    ) ||
                    String(
                        targetUser.id
                    ),

                role,

                status:
                    clean(
                        targetUser.status
                    ) ||
                    "Active",

                client_type:
                    clean(
                        targetUser.client_type
                    ),

                created_at:
                    targetUser.created_at

            },


            total_customers:
                totalCustomers,


            permissions,


            system_permissions:
                SYSTEM_PERMISSIONS,


            permission_keys:
                PERMISSION_KEYS,


            is_super_admin:
                superAdmin,


            is_own_profile:
                ownProfile,


            can_edit_profile:
                canEditProfile,


            can_edit_permissions:
                superAdmin &&
                !ownProfile &&
                normalizeRole(role) !==
                    "superadmin"

        });

    } catch (error) {

        console.error(
            "[Admin Profile] data:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to load profile."
        });

    }

};


/*
|--------------------------------------------------------------------------
| EXPORTS FOR OTHER ADMIN CONTROLLERS
|--------------------------------------------------------------------------
*/

exports.SYSTEM_PERMISSIONS =
    SYSTEM_PERMISSIONS;


exports.PERMISSION_KEYS =
    PERMISSION_KEYS;


exports.normalizeRole =
    normalizeRole;


exports.isSuperAdmin =
    isSuperAdmin;


exports.getUser =
    getUser;