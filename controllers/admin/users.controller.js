
"use strict";

const path = require("path");
const db = require("../../config/database");

function rows(result) {
    if (
        Array.isArray(result) &&
        Array.isArray(result[0])
    ) {
        return result[0];
    }

    return Array.isArray(result)
        ? result
        : [];
}

async function query(sql, params = []) {
    const result = await db.query(sql, params);
    return rows(result);
}

function isSuperAdmin(req) {
    return (
        String(
            req.session?.role || ""
        ).trim().toLowerCase() === "super_admin"
    );
}

function requireSuperAdmin(req, res) {
    if (!isSuperAdmin(req)) {
        res.status(403).json({
            success: false,
            message: "Super Admin access required."
        });

        return false;
    }

    return true;
}

function clean(value) {
    return String(value ?? "").trim();
}


/* Users list page */

exports.index = async (req, res) => {

    if (!requireSuperAdmin(req, res)) {
        return;
    }

    return res.sendFile(
        path.join(
            __dirname,
            "../../views/admin/users.html"
        )
    );
};


/* Users data */

exports.data = async (req, res) => {

    if (!requireSuperAdmin(req, res)) {
        return;
    }

    try {

        const search = clean(
            req.query.search
        );

        let sql = `
            SELECT
                id,
                company_id,
                username,
                fullname,
                name,
                company_name,
                owner_name,
                mobile,
                phone,
                email,
                role,
                status,
                customer_id,
                created_at
            FROM users
        `;

        const params = [];
        const where = [];

        if (search !== "") {

            where.push(`
                (
                    company_name LIKE ?
                    OR owner_name LIKE ?
                    OR fullname LIKE ?
                    OR name LIKE ?
                    OR mobile LIKE ?
                    OR phone LIKE ?
                    OR email LIKE ?
                    OR username LIKE ?
                    OR customer_id LIKE ?
                )
            `);

            const value = `%${search}%`;

            params.push(
                value,
                value,
                value,
                value,
                value,
                value,
                value,
                value,
                value
            );
        }

        if (where.length) {

            sql += `
                WHERE
                    ${where.join(" AND ")}
            `;
        }

        sql += `
            ORDER BY id DESC
        `;

        const users = await query(
            sql,
            params
        );

        return res.json({
            success: true,
            users: users,
            data: users
        });

    } catch (error) {

        console.error(
            "[Admin Users] data:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to load users."
        });
    }
};


/* Single user */

exports.getOne = async (req, res) => {

    if (!requireSuperAdmin(req, res)) {
        return;
    }

    const id = Number(
        req.params.id
    );

    if (
        !Number.isInteger(id) ||
        id <= 0
    ) {

        return res.status(400).json({
            success: false,
            message: "Invalid user ID."
        });
    }

    try {

        const result = await query(
            `
                SELECT
                    id,
                    company_id,
                    username,
                    fullname,
                    name,
                    company_name,
                    owner_name,
                    mobile,
                    phone,
                    email,
                    address,
                    role,
                    status,
                    customer_id,
                    client_type,
                    created_at
                FROM users
                WHERE id = ?
                LIMIT 1
            `,
            [id]
        );

        if (!result.length) {

            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        return res.json({
            success: true,
            data: result[0]
        });

    } catch (error) {

        console.error(
            "[Admin Users] getOne:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to load user."
        });
    }
};
