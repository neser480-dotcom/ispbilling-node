"use strict";

const db = require("../../config/database");

class ExpenditureError extends Error {
    constructor(message, httpCode = 400) {
        super(message);
        this.name = "ExpenditureError";
        this.httpCode = httpCode;
    }
}

function clean(value) {
    return String(value ?? "").trim();
}

function positiveId(value, label = "ID") {
    const id = Number(value);

    if (!Number.isInteger(id) || id <= 0) {
        throw new ExpenditureError(`Invalid ${label}.`);
    }

    return id;
}

function amountValue(value) {
    const amount = Number(value);

    if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 99999999.99
    ) {
        throw new ExpenditureError(
            "Amount must be greater than zero."
        );
    }

    return Math.round(amount * 100) / 100;
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

    return Number.isInteger(id) && id > 0
        ? id
        : 0;
}

function scope(req, alias) {
    if (isSuperAdmin(req)) {
        return {
            sql: "1=1",
            params: []
        };
    }

    const companyId = companyIdOf(req);

    if (!companyId) {
        return {
            sql: "1=0",
            params: []
        };
    }

    return {
        sql: `${alias}.company_id = ?`,
        params: [companyId]
    };
}

function saveCompanyId(req) {
    if (isSuperAdmin(req)) {
        const selectedCompany = Number(
            req.body?.company_id ||
            req.session?.selected_company_id ||
            req.session?.company_id ||
            req.session?.companyId ||
            0
        );

        if (
            !Number.isInteger(selectedCompany) ||
            selectedCompany < 0
        ) {
            throw new ExpenditureError(
                "Invalid company."
            );
        }

        return selectedCompany;
    }

    const companyId = companyIdOf(req);

    if (!companyId) {
        throw new ExpenditureError(
            "Company account is not configured.",
            403
        );
    }

    return companyId;
}

async function nextSerial(table, companyId) {
    // Table names are internal constants, never user input.
    const [rows] = await db.execute(
        `SELECT serial_no
         FROM ${table}
         WHERE company_id = ?
         ORDER BY serial_no ASC`,
        [companyId]
    );

    const used = new Set(
        rows
            .map(row => Number(row.serial_no))
            .filter(n => Number.isInteger(n) && n > 0)
    );

    let serial = 1;

    while (used.has(serial)) {
        serial++;
    }

    return serial;
}

function validDate(value) {
    if (!value) return "";

    const date = clean(value);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new ExpenditureError("Invalid date filter.");
    }

    const parsed = new Date(`${date}T00:00:00Z`);

    if (
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== date
    ) {
        throw new ExpenditureError("Invalid date filter.");
    }

    return date;
}

async function getPageData(req, filters = {}) {
    const expScope = scope(req, "e");
    const typeScope = scope(req, "t");

    const where = [expScope.sql];
    const params = [...expScope.params];

    const name = clean(filters.name);
    const type = clean(filters.type);
    const dateFrom = validDate(filters.date_from);
    const dateTo = validDate(filters.date_to);

    if (name) {
        where.push("e.name LIKE ?");
        params.push(`%${name}%`);
    }

    if (type) {
        where.push("e.expenditure_type = ?");
        params.push(type);
    }

    if (String(filters.filter || "") === "1") {
        if (dateFrom) {
            where.push("DATE(e.created_at) >= ?");
            params.push(dateFrom);
        }

        if (dateTo) {
            where.push("DATE(e.created_at) <= ?");
            params.push(dateTo);
        }
    }

    if (dateFrom && dateTo && dateFrom > dateTo) {
        throw new ExpenditureError(
            "From date cannot be after To date."
        );
    }

    const [expenditures] = await db.execute(
        `SELECT
            e.id,
            e.serial_no,
            e.company_id,
            e.expenditure_type,
            e.expense_definition,
            e.name,
            e.user_role,
            e.amount,
            e.created_at
         FROM expenditures e
         WHERE ${where.join(" AND ")}
         ORDER BY e.serial_no ASC, e.id DESC`,
        params
    );

    const [totals] = await db.execute(
        `SELECT
            COUNT(*) AS total_rows,
            COALESCE(SUM(e.amount), 0) AS total_amount
         FROM expenditures e
         WHERE ${where.join(" AND ")}`,
        params
    );

    const [types] = await db.execute(
        `SELECT
            t.id,
            t.serial_no,
            t.company_id,
            t.type_name,
            t.created_at
         FROM expenditure_types t
         WHERE ${typeScope.sql}
         ORDER BY t.serial_no ASC, t.type_name ASC`,
        typeScope.params
    );

    const [names] = await db.execute(
        `SELECT DISTINCT e.name
         FROM expenditures e
         WHERE ${expScope.sql}
           AND TRIM(COALESCE(e.name, '')) <> ''
         ORDER BY e.name ASC`,
        expScope.params
    );

    return {
        expenditures,
        types,
        names: names.map(row => row.name),
        summary: {
            total_rows: Number(totals[0]?.total_rows || 0),
            total_amount: Number(totals[0]?.total_amount || 0)
        },
        filters: {
            name,
            type,
            date_from: dateFrom,
            date_to: dateTo,
            filter: String(filters.filter || "") === "1"
        }
    };
}

async function findTypeName(req, typeId) {
    const company = scope(req, "t");

    const [rows] = await db.execute(
        `SELECT t.id, t.type_name
         FROM expenditure_types t
         WHERE t.id = ?
           AND ${company.sql}
         LIMIT 1`,
        [typeId, ...company.params]
    );

    if (!rows.length) {
        throw new ExpenditureError(
            "Expenditure type not found.",
            404
        );
    }

    return rows[0].type_name;
}

async function addExpenditure(req, body) {
    const companyId = saveCompanyId(req);
    const typeId = positiveId(body.type_id, "type ID");
    const name = clean(body.name);
    const amount = amountValue(body.amount);

    if (!name || name.length > 100) {
        throw new ExpenditureError(
            "Name is required (maximum 100 characters)."
        );
    }

    const typeName = await findTypeName(req, typeId);
    const serial = await nextSerial("expenditures", companyId);

    const [result] = await db.execute(
        `INSERT INTO expenditures
            (serial_no, company_id, expenditure_type,
             name, user_role, amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
            serial,
            companyId,
            typeName,
            name,
            clean(
                req.session?.role ||
                req.session?.user_role ||
                "ispOwner"
            ),
            amount
        ]
    );

    return { id: result.insertId };
}

async function updateExpenditure(req, rawId, body) {
    const id = positiveId(rawId, "expenditure ID");
    const company = scope(req, "e");
    const typeId = positiveId(body.type_id, "type ID");
    const name = clean(body.name);
    const amount = amountValue(body.amount);

    if (!name || name.length > 100) {
        throw new ExpenditureError(
            "Name is required (maximum 100 characters)."
        );
    }

    const typeName = await findTypeName(req, typeId);

    const [result] = await db.execute(
        `UPDATE expenditures AS e
         SET expenditure_type = ?,
             name = ?,
             amount = ?
         WHERE e.id = ?
           AND ${company.sql}`,
        [
            typeName,
            name,
            amount,
            id,
            ...company.params
        ]
    );

    if (!result.affectedRows) {
        throw new ExpenditureError(
            "Expenditure not found or access denied.",
            404
        );
    }

    return {};
}

async function deleteExpenditure(req, rawId) {
    const id = positiveId(rawId, "expenditure ID");
    const company = scope(req, "e");

    const [result] = await db.execute(
        `DELETE e
         FROM expenditures AS e
         WHERE e.id = ?
           AND ${company.sql}`,
        [id, ...company.params]
    );

    if (!result.affectedRows) {
        throw new ExpenditureError(
            "Expenditure not found or access denied.",
            404
        );
    }
}

async function addType(req, body) {
    const companyId = saveCompanyId(req);
    const typeName = clean(body.type_name);

    if (!typeName || typeName.length > 150) {
        throw new ExpenditureError(
            "Type name is required (maximum 150 characters)."
        );
    }

    const company = scope(req, "t");

    const [duplicates] = await db.execute(
        `SELECT t.id
         FROM expenditure_types AS t
         WHERE ${company.sql}
           AND LOWER(TRIM(t.type_name)) = LOWER(TRIM(?))
         LIMIT 1`,
        [...company.params, typeName]
    );

    if (duplicates.length) {
        throw new ExpenditureError(
            "This expenditure type already exists."
        );
    }

    const serial = await nextSerial(
        "expenditure_types",
        companyId
    );

    const [result] = await db.execute(
        `INSERT INTO expenditure_types
            (serial_no, company_id, type_name)
         VALUES (?, ?, ?)`,
        [serial, companyId, typeName]
    );

    return { id: result.insertId };
}

async function updateType(req, rawId, body) {
    const id = positiveId(rawId, "type ID");
    const typeName = clean(body.type_name);

    if (!typeName || typeName.length > 150) {
        throw new ExpenditureError(
            "Type name is required (maximum 150 characters)."
        );
    }

    const typeScope = scope(req, "t");
    const expScope = scope(req, "e");

    const [existing] = await db.execute(
        `SELECT t.type_name
         FROM expenditure_types AS t
         WHERE t.id = ?
           AND ${typeScope.sql}
         LIMIT 1`,
        [id, ...typeScope.params]
    );

    if (!existing.length) {
        throw new ExpenditureError(
            "Expenditure type not found or access denied.",
            404
        );
    }

    const [duplicates] = await db.execute(
        `SELECT t.id
         FROM expenditure_types AS t
         WHERE ${typeScope.sql}
           AND t.id <> ?
           AND LOWER(TRIM(t.type_name)) = LOWER(TRIM(?))
         LIMIT 1`,
        [...typeScope.params, id, typeName]
    );

    if (duplicates.length) {
        throw new ExpenditureError(
            "This expenditure type already exists."
        );
    }

    const oldName = existing[0].type_name;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [updated] = await connection.execute(
            `UPDATE expenditure_types AS t
             SET type_name = ?
             WHERE t.id = ?
               AND ${typeScope.sql}`,
            [typeName, id, ...typeScope.params]
        );

        if (!updated.affectedRows) {
            throw new ExpenditureError(
                "Expenditure type not found.",
                404
            );
        }

        // Rename only expenditure records in this tenant's scope.
        await connection.execute(
            `UPDATE expenditures AS e
             SET expenditure_type = ?
             WHERE e.expenditure_type = ?
               AND ${expScope.sql}`,
            [typeName, oldName, ...expScope.params]
        );

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    return {};
}

async function deleteType(req, rawId) {
    const id = positiveId(rawId, "type ID");
    const typeScope = scope(req, "t");
    const expScope = scope(req, "e");

    const [rows] = await db.execute(
        `SELECT t.type_name
         FROM expenditure_types AS t
         WHERE t.id = ?
           AND ${typeScope.sql}
         LIMIT 1`,
        [id, ...typeScope.params]
    );

    if (!rows.length) {
        throw new ExpenditureError(
            "Expenditure type not found or access denied.",
            404
        );
    }

    const [used] = await db.execute(
        `SELECT e.id
         FROM expenditures AS e
         WHERE e.expenditure_type = ?
           AND ${expScope.sql}
         LIMIT 1`,
        [rows[0].type_name, ...expScope.params]
    );

    if (used.length) {
        throw new ExpenditureError(
            "This type is being used by expenditures and cannot be deleted."
        );
    }

    const [result] = await db.execute(
        `DELETE t
         FROM expenditure_types AS t
         WHERE t.id = ?
           AND ${typeScope.sql}`,
        [id, ...typeScope.params]
    );

    if (!result.affectedRows) {
        throw new ExpenditureError(
            "Expenditure type could not be deleted.",
            404
        );
    }
}

module.exports = {
    ExpenditureError,
    getPageData,
    addExpenditure,
    updateExpenditure,
    deleteExpenditure,
    addType,
    updateType,
    deleteType
};
