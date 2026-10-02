"use strict";

const db = require("../../config/database");

const SYSTEM_PERMISSIONS = {
    customer_id_auto_generate: "Customer ID Auto Generate",
    bulk_area_edit: "Bulk Area Edit",
    bulk_status_edit: "Bulk Status Edit",
    bulk_auto_disable_edit: "Bulk Auto Disable Edit",
    bulk_package_edit: "Bulk Package Edit",
    bulk_customer_delete: "Bulk Customer Delete",
    bulk_customer_mikrotik_update: "Bulk Customer MikroTik Update",
    customer_auto_connection: "Customer Auto Connection",
    bulk_customer_recharge: "Bulk Customer Recharge",
    add_customer_with_mobile: "Add Customer With Mobile",
    inactive_offline_customer_delete: "Inactive / Offline Customer Delete",
    unpaid_customer_bulk_sms: "Unpaid Customer Bulk SMS",
    show_customer_panel_package: "Show Customer Panel Package",
    customer_invoice: "Customer Invoice",
    without_mikrotik_customer_minus_balance:
        "Without MikroTik Customer Minus Balance",
    customer_portal: "Customer Portal",

    mikrotik_add: "MikroTik Add",
    mikrotik_delete: "MikroTik Delete",

    promise_date: "Promise Date",
    report_delete: "Report Delete",
    expenditure_delete: "Expenditure Delete",
    bulk_billing_cycle_edit: "Bulk Billing Cycle Edit",
    bulk_promise_date_edit: "Bulk Promise Date Edit",
    bulk_payment_status_edit: "Bulk Payment Status Edit",
    fixed_billing_cycle_date: "Fixed Billing Cycle Date",
    instant_recharge_bill_print: "Instant Recharge Bill Print",
    daily_recharge_feature: "Daily Recharge Feature",
    deposit_update: "Deposit Update",
    dashboard_probability_amount_with_new_customer:
        "Dashboard Probability Amount With New Customer",

    network_diagram: "Network Diagram",
    network_monitoring: "Network Monitoring",
    traffic_monitoring: "Traffic Monitoring",
    interface_monitor: "Interface Monitor",
    pole_box: "Pole Box",

    olt_add: "OLT Add",
    olt_user_monitoring: "OLT User Monitoring",

    reseller_add: "Reseller Add",
    multiple_manager: "Multiple Manager",
    reseller_customer_bulk_status_edit:
        "Reseller Customer Bulk Status Edit",
    reseller_customer_bulk_promise_date_edit:
        "Reseller Customer Bulk Promise Date Edit",
    reseller_customer_bulk_billing_cycle_edit:
        "Reseller Customer Bulk Billing Cycle Edit",
    reseller_minus_balance: "Reseller Minus Balance",
    reseller_customer_bulk_auto_connection_edit:
        "Reseller Customer Bulk Auto Connection Edit",
    reseller_customer_bulk_area_edit:
        "Reseller Customer Bulk Area Edit",
    reseller_customer_bulk_payment_status_edit:
        "Reseller Customer Bulk Payment Status Edit",
    bulk_transfer_to_reseller:
        "Bulk Transfer To Reseller",
    bandwidth_reseller:
        "Bandwidth Reseller"
};

const PERMISSION_KEYS =
    Object.keys(SYSTEM_PERMISSIONS);


function normalizeRole(role) {
    return String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
}


function isSuperAdmin(req) {
    return (
        normalizeRole(
            req.session?.role
        ) === "superadmin"
    );
}


function checkCsrf(req) {

    const bodyToken =
        String(
            req.body?.csrf_token || ""
        );

    const sessionToken =
        String(
            req.session?.csrf_token || ""
        );

    return (
        bodyToken &&
        sessionToken &&
        bodyToken === sessionToken
    );
}


async function getUser(userId) {

    const [rows] =
        await db.query(
            `
            SELECT
                id,
                company_id,
                username,
                fullname,
                name,
                role,
                status
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
| GET PERMISSIONS
|--------------------------------------------------------------------------
*/

exports.data = async (req, res) => {

    try {

        if (!req.session?.user_id) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const userId =
            Number(req.params.userId);

        if (
            !Number.isInteger(userId) ||
            userId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID."
            });
        }

        const target =
            await getUser(userId);

        if (!target) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const currentId =
            Number(req.session.user_id);

        /*
        | Super Admin can inspect another user.
        | Own permissions are always read-only.
        */

        if (
            userId !== currentId &&
            !isSuperAdmin(req)
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Permission access denied."
            });
        }

        const [rows] =
            await db.query(
                `
                SELECT
                    permission_key,
                    allowed
                FROM user_permissions
                WHERE user_id = ?
                `,
                [userId]
            );

        const saved = {};

        for (const key of PERMISSION_KEYS) {
            saved[key] = false;
        }

        for (const row of rows) {

            if (
                Object.prototype.hasOwnProperty.call(
                    saved,
                    row.permission_key
                )
            ) {
                saved[row.permission_key] =
                    Number(row.allowed) === 1;
            }
        }

        return res.json({
            success: true,
            user: target,
            permissions: saved,
            system_permissions:
                SYSTEM_PERMISSIONS,
            permission_keys:
                PERMISSION_KEYS,
            can_edit:
                isSuperAdmin(req) &&
                userId !== currentId &&
                normalizeRole(target.role) !==
                    "superadmin"
        });

    } catch (error) {

        console.error(
            "[Admin Permissions] data:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to load permissions."
        });
    }
};


/*
|--------------------------------------------------------------------------
| UPDATE PERMISSIONS
|--------------------------------------------------------------------------
*/

exports.update = async (req, res) => {

    let connection = null;

    try {

        if (!req.session?.user_id) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        /*
        | ONLY SUPER ADMIN
        */

        if (!isSuperAdmin(req)) {
            return res.status(403).json({
                success: false,
                message:
                    "Only Super Admin can update permissions."
            });
        }

        if (!checkCsrf(req)) {
            return res.status(403).json({
                success: false,
                message: "Invalid CSRF token."
            });
        }

        const currentId =
            Number(req.session.user_id);

        const targetId =
            Number(req.body?.user_id);

        if (
            !Number.isInteger(targetId) ||
            targetId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID."
            });
        }

        /*
        | Super Admin cannot modify own permissions.
        */

        if (targetId === currentId) {
            return res.status(403).json({
                success: false,
                message:
                    "Super Admin permissions cannot be changed."
            });
        }

        const target =
            await getUser(targetId);

        if (!target) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        /*
        | NEVER modify another super admin.
        */

        if (
            normalizeRole(target.role) ===
            "superadmin"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Super Admin permissions cannot be modified."
            });
        }

        /*
        | Permission input
        */

        let permissions =
            req.body?.permissions || [];

        if (!Array.isArray(permissions)) {
            permissions = [permissions];
        }

        const allowedSet =
            new Set();

        for (const key of permissions) {

            const permission =
                String(key || "").trim();

            if (
                PERMISSION_KEYS.includes(
                    permission
                )
            ) {
                allowedSet.add(permission);
            }
        }

        connection =
            await db.getConnection();

        await connection.beginTransaction();

        /*
        | Remove old permissions.
        */

        await connection.query(
            `
            DELETE FROM user_permissions
            WHERE user_id = ?
            `,
            [targetId]
        );

        /*
        | Save all 48 permissions.
        | allowed = 1/0
        */

        for (const key of PERMISSION_KEYS) {

            await connection.query(
                `
                INSERT INTO user_permissions
                (
                    user_id,
                    company_id,
                    permission_key,
                    allowed,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, NOW(), NOW())
                `,
                [
                    targetId,
                    Number(target.company_id || 0),
                    key,
                    allowedSet.has(key) ? 1 : 0
                ]
            );
        }

        await connection.commit();

        return res.json({
            success: true,
            message:
                "Permissions updated successfully."
        });

    } catch (error) {

        if (connection) {
            try {
                await connection.rollback();
            } catch (_) {}
        }

        console.error(
            "[Admin Permissions] update:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to update permissions."
        });

    } finally {

        if (connection) {
            connection.release();
        }
    }
};