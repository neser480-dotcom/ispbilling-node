"use strict";

const db = require("../config/database");

class StaffError extends Error {
    constructor(message, httpCode = 400) {
        super(message);
        this.name = "StaffError";
        this.httpCode = httpCode;
    }
}

function clean(value) {
    return String(value ?? "").trim();
}

function normalizeRole(req) {
    return String(
        req.session?.role ||
        req.session?.user_role ||
        ""
    )
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
}

function isSuperAdmin(req) {
    return normalizeRole(req) === "superadmin";
}

function companyIdOf(req) {
    const id = Number(
        req.session?.company_id ||
        req.session?.companyId ||
        0
    );

    return Number.isInteger(id) && id > 0 ? id : 0;
}

function scope(req, alias = "s") {
    if (isSuperAdmin(req)) {
        return { sql: "1=1", params: [] };
    }

    const companyId = companyIdOf(req);

    if (!companyId) {
        return { sql: "1=0", params: [] };
    }

    return {
        sql: `${alias}.company_id = ?`,
        params: [companyId]
    };
}

function positiveId(value, label = "ID") {
    const id = Number(value);

    if (!Number.isInteger(id) || id <= 0) {
        throw new StaffError(`Invalid ${label}.`);
    }

    return id;
}

function salaryValue(value) {
    const amount = Number(value);

    if (
        !Number.isFinite(amount) ||
        amount < 0 ||
        amount > 999999999.99
    ) {
        throw new StaffError(
            "Salary must be zero or greater."
        );
    }

    return Math.round(amount * 100) / 100;
}

function nullable(value) {
    const result = clean(value);
    return result || null;
}

async function getStaff(req, filters = {}) {
    const staffScope = scope(req, "s");
    const where = [staffScope.sql];
    const params = [...staffScope.params];

    const search = clean(filters.search).slice(0, 150);

    if (search) {
        where.push(
            "(s.name LIKE ? OR s.mobile LIKE ? OR s.email LIKE ?)"
        );

        params.push(
            `%${search}%`,
            `%${search}%`,
            `%${search}%`
        );
    }

    const [staff] = await db.execute(
        `SELECT
            s.id,
            s.company_id,
            s.user_id,
            s.name,
            s.mobile,
            s.nid_no,
            s.address,
            s.assigned_areas,
            s.email,
            s.parent_name,
            s.salary,
            s.due,
            s.role,
            s.status,
            s.ref_name,
            s.ref_mobile,
            s.ref_email,
            s.ref_nid,
            s.ref_address,
            s.ref_relation
         FROM staff AS s
         WHERE ${where.join(" AND ")}
         ORDER BY s.id DESC`,
        params
    );

    return {
        staff,
        totalData: staff.length,
        search
    };
}

async function addStaff(req, body) {
    const companyId = isSuperAdmin(req)
        ? Number(
            body.company_id ||
            req.session?.selected_company_id ||
            req.session?.company_id ||
            req.session?.companyId ||
            0
        )
        : companyIdOf(req);

    const userId = Number(req.session?.user_id || 0);

    if (!Number.isInteger(companyId) || companyId <= 0) {
        throw new StaffError(
            "Company account is not configured.",
            403
        );
    }

    if (!Number.isInteger(userId) || userId <= 0) {
        throw new StaffError(
            "Invalid user session.",
            403
        );
    }

    const name = clean(body.name);
    const mobile = clean(body.mobile);
    const salary = salaryValue(body.salary ?? 0);

    if (!name) {
        throw new StaffError("Name is required.");
    }

    if (!mobile) {
        throw new StaffError("Mobile is required.");
    }

    const values = [
        companyId,
        userId,
        name,
        mobile,
        nullable(body.nid_no),
        nullable(body.address),
        "N/A",
        nullable(body.email),
        nullable(body.parent_name),
        salary,
        0,
        "staff",
        "active",
        nullable(body.ref_name),
        nullable(body.ref_mobile),
        nullable(body.ref_email),
        nullable(body.ref_nid),
        nullable(body.ref_address),
        nullable(body.ref_relation)
    ];

    const [result] = await db.execute(
        `INSERT INTO staff (
            company_id,
            user_id,
            name,
            mobile,
            nid_no,
            address,
            assigned_areas,
            email,
            parent_name,
            salary,
            due,
            role,
            status,
            ref_name,
            ref_mobile,
            ref_email,
            ref_nid,
            ref_address,
            ref_relation
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?
        )`,
        values
    );

    return { id: result.insertId };
}

async function updateStaff(req, rawId, body) {
    const id = positiveId(rawId, "staff ID");
    const staffScope = scope(req, "s");

    const name = clean(body.name);
    const mobile = clean(body.mobile);
    const salary = salaryValue(body.salary);
    const address = nullable(body.address);

    const status = ["active", "inactive"].includes(
        clean(body.status).toLowerCase()
    )
        ? clean(body.status).toLowerCase()
        : "active";

    if (!name || !mobile) {
        throw new StaffError(
            "Name and mobile are required."
        );
    }

    const [result] = await db.execute(
        `UPDATE staff AS s
         SET
            name = ?,
            mobile = ?,
            salary = ?,
            address = ?,
            status = ?
         WHERE s.id = ?
           AND ${staffScope.sql}`,
        [
            name,
            mobile,
            salary,
            address,
            status,
            id,
            ...staffScope.params
        ]
    );

    // MySQL affectedRows can be 0 when submitted values are unchanged.
    if (!result.affectedRows) {
        const [rows] = await db.execute(
            `SELECT s.id
             FROM staff AS s
             WHERE s.id = ?
               AND ${staffScope.sql}
             LIMIT 1`,
            [id, ...staffScope.params]
        );

        if (!rows.length) {
            throw new StaffError(
                "Staff not found or access denied.",
                404
            );
        }
    }

    return {};
}

async function deleteStaff(req, rawId) {
    const id = positiveId(rawId, "staff ID");
    const staffScope = scope(req, "s");

    const [result] = await db.execute(
        `DELETE s
         FROM staff AS s
         WHERE s.id = ?
           AND ${staffScope.sql}`,
        [id, ...staffScope.params]
    );

    if (!result.affectedRows) {
        throw new StaffError(
            "Staff not found or access denied.",
            404
        );
    }
}

async function prepareSms(req, body) {
    const staffId = positiveId(body.staff_id, "staff ID");
    const message = clean(body.message);

    const smsType = [
        "non_masking",
        "masking",
        "fixed_number"
    ].includes(clean(body.sms_type))
        ? clean(body.sms_type)
        : "non_masking";

    if (!message) {
        throw new StaffError("Message is required.");
    }

    const staffScope = scope(req, "s");

    const [rows] = await db.execute(
        `SELECT s.id, s.name, s.mobile
         FROM staff AS s
         WHERE s.id = ?
           AND ${staffScope.sql}
         LIMIT 1`,
        [staffId, ...staffScope.params]
    );

    if (!rows.length) {
        throw new StaffError(
            "Staff not found or access denied.",
            404
        );
    }

    // Original PHP source has no implemented SMS gateway.
    return {
        staff_id: rows[0].id,
        mobile: rows[0].mobile,
        sms_type: smsType,
        message_length: message.length,
        sent: false
    };
}

module.exports = {
    StaffError,
    getStaff,
    addStaff,
    updateStaff,
    deleteStaff,
    prepareSms
};