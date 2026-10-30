
"use strict";

const db = require("../../config/database");

class SalaryError extends Error {
    constructor(message, httpCode = 400) {
        super(message);
        this.name = "SalaryError";
        this.httpCode = httpCode;
    }
}

function clean(value) {
    return String(value ?? "").trim();
}

function positiveId(value, label = "ID") {
    const id = Number(value);

    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new SalaryError(`Invalid ${label}.`);
    }

    return id;
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

    return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function staffScope(req, alias = "s") {
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

function salaryScope(req, alias = "ss") {
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

function validatePeriod(yearValue, monthValue) {
    const year = Number(yearValue);
    const month = Number(monthValue);

    if (
        !Number.isInteger(year) ||
        year < 2000 ||
        year > 2100
    ) {
        throw new SalaryError("Year must be between 2000 and 2100.");
    }

    if (
        !Number.isInteger(month) ||
        month < 1 ||
        month > 12
    ) {
        throw new SalaryError("Month must be between 1 and 12.");
    }

    return { year, month };
}

function validateAmount(value) {
    const amount = Number(value);

    if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 999999999.99
    ) {
        throw new SalaryError("Amount must be greater than zero.");
    }

    return Math.round(amount * 100) / 100;
}

async function getSalaryData(req, filters = {}) {
    const staffId = positiveId(filters.id, "staff ID");
    const scope = staffScope(req, "s");

    const [staffRows] = await db.execute(
        `SELECT
            s.id,
            s.company_id,
            s.name,
            s.address,
            s.mobile,
            s.salary
         FROM staff AS s
         WHERE s.id = ?
           AND ${scope.sql}
         LIMIT 1`,
        [staffId, ...scope.params]
    );

    if (!staffRows.length) {
        throw new SalaryError(
            "Staff not found or access denied.",
            404
        );
    }

    const staff = staffRows[0];
    const salaryFilter = salaryScope(req, "ss");

    const search = clean(filters.search).slice(0, 150);
    const where = [
        "ss.staff_id = ?",
        "ss.company_id = ?",
        salaryFilter.sql
    ];

    const params = [
        staffId,
        Number(staff.company_id),
        ...salaryFilter.params
    ];

    if (search) {
        where.push(
            "(COALESCE(ss.note, '') LIKE ? OR COALESCE(u.fullname, '') LIKE ?)"
        );

        params.push(`%${search}%`, `%${search}%`);
    }

    const [salaryList] = await db.execute(
        `SELECT
            ss.id,
            ss.company_id,
            ss.staff_id,
            ss.amount,
            ss.payment_date,
            ss.year,
            ss.month,
            ss.note AS comment,
            ss.created_at,
            u.fullname AS creator_name
         FROM staff_salary AS ss
         LEFT JOIN users AS u
            ON u.id = ss.created_by
         WHERE ${where.join(" AND ")}
         ORDER BY ss.id DESC`,
        params
    );

    const totalPaid = salaryList.reduce(
        (sum, row) => sum + Number(row.amount || 0),
        0
    );

    return {
        staff,
        salaryList,
        totalPaid: Math.round(totalPaid * 100) / 100,
        totalData: salaryList.length,
        search
    };
}


async function paySalary(req, body = {}) {
    const staffId = positiveId(body.staff_id, "staff ID");
    const urlStaffId = positiveId(body.id, "staff ID");

    if (staffId !== urlStaffId) {
        throw new SalaryError("Staff ID does not match.");
    }

    const { year, month } = validatePeriod(body.year, body.month);
    const amount = validateAmount(body.amount);
    const note = clean(body.comment).slice(0, 2000) || null;

    const userId = positiveId(
        req.session?.user_id,
        "logged-in user ID"
    );

    const scope = staffScope(req, "s");

    const [staffRows] = await db.execute(
        `SELECT s.id, s.company_id, s.name
         FROM staff AS s
         WHERE s.id = ?
           AND ${scope.sql}
         LIMIT 1`,
        [staffId, ...scope.params]
    );

    if (!staffRows.length) {
        throw new SalaryError(
            "Staff not found or access denied.",
            404
        );
    }

    const staff = staffRows[0];
    const companyId = Number(staff.company_id);

    const paymentDate =
        `${String(year).padStart(4, "0")}-` +
        `${String(month).padStart(2, "0")}-01`;

    const periodLabel =
        `${year} সালের ${month} মাসের`;

    const duplicateMessage =
        `এই কর্মীর ${periodLabel} Salary আগে থেকেই দেওয়া আছে। ` +
        `একই মাসে দ্বিতীয়বার Salary দেওয়া যাবে না।`;

    const username = clean(
        req.session?.fullname ||
        req.session?.username ||
        ""
    );

    const roleName = clean(
        req.session?.role ||
        req.session?.user_role ||
        ""
    );

    const ipAddress = clean(
        req.ip ||
        req.socket?.remoteAddress ||
        ""
    ).slice(0, 100);

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // একই কর্মী ও মাসের Salary আগে থেকেই আছে কি না দেখুন।
        const [existingRows] = await connection.execute(
            `SELECT id
             FROM staff_salary
             WHERE company_id = ?
               AND staff_id = ?
               AND year = ?
               AND month = ?
             LIMIT 1
             FOR UPDATE`,
            [companyId, staffId, year, month]
        );

        if (existingRows.length) {
            throw new SalaryError(duplicateMessage, 409);
        }

        const [insertResult] = await connection.execute(
            `INSERT INTO staff_salary (
                company_id,
                staff_id,
                amount,
                payment_date,
                year,
                month,
                note,
                created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                companyId,
                staffId,
                amount,
                paymentDate,
                year,
                month,
                note,
                userId
            ]
        );

        await connection.execute(
            `INSERT INTO activity_logs (
                company_id,
                user_id,
                user_name,
                action,
                description,
                module,
                ip_address,
                role_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                companyId,
                userId,
                username,
                "Salary Payment",
                `Salary paid to ${staff.name}; amount ${amount}; period ${year}-${String(month).padStart(2, "0")}`,
                "Salary",
                ipAddress,
                roleName
            ]
        );

        await connection.commit();

        return {
            id: insertResult.insertId,
            staff_id: staffId,
            company_id: companyId,
            amount,
            payment_date: paymentDate,
            year,
            month
        };
    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error(
                "Salary transaction rollback failed:",
                rollbackError.message
            );
        }

        // Concurrent requests হলেও unique constraint-এর
        // duplicate error-কে পরিষ্কার বার্তায় রূপান্তর করুন।
        if (error?.code === "ER_DUP_ENTRY") {
            throw new SalaryError(duplicateMessage, 409);
        }

        throw error;
    } finally {
        connection.release();
    }
}


async function deleteSalary(req, body = {}) {
    const salaryId = positiveId(body.salary_id, "salary ID");
    const staffId = positiveId(body.staff_id, "staff ID");

    const params = [salaryId, staffId];
    let scopeSql = "1=1";

    if (!isSuperAdmin(req)) {
        const companyId = companyIdOf(req);

        if (!companyId) {
            throw new SalaryError(
                "Company access denied.",
                403
            );
        }

        scopeSql = "company_id = ?";
        params.push(companyId);
    }

    const [result] = await db.execute(
        `DELETE FROM staff_salary
         WHERE id = ?
           AND staff_id = ?
           AND ${scopeSql}`,
        params
    );

    if (!result.affectedRows) {
        throw new SalaryError(
            "Salary record not found or access denied.",
            404
        );
    }

    return { id: salaryId };
}

module.exports = {
    SalaryError,
    getSalaryData,
    paySalary,
    deleteSalary
};
