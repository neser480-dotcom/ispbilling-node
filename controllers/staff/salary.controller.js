
"use strict";

const service = require("../../services/staff/salary.service");

function verifyCsrf(req, res) {
    const sessionToken = String(
        req.session?.csrf_token || ""
    ).trim();

    const suppliedToken = String(
        req.get("X-CSRF-Token") ||
        req.body?.csrf_token ||
        req.body?._csrf ||
        ""
    ).trim();

    if (
        !sessionToken ||
        !suppliedToken ||
        sessionToken !== suppliedToken
    ) {
        res.status(403).json({
            success: false,
            message: "Invalid CSRF token."
        });

        return false;
    }

    return true;
}


function handleError(res, error) {
    const dbCode = error?.code;
    let status = Number(error?.httpCode || error?.statusCode) || 500;
    let code = "SALARY_ERROR";
    let message = "Salary সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।";

    if (dbCode === "ER_DUP_ENTRY") {
        status = 409;
        code = "DUPLICATE_SALARY";
        message =
            "এই Salary রেকর্ডটি আগে থেকেই আছে। কর্মী ও মাসের তথ্য যাচাই করুন।";
    } else if (
        dbCode === "ER_NO_REFERENCED_ROW_2" ||
        dbCode === "ER_ROW_IS_REFERENCED_2"
    ) {
        status = 409;
        code = "DATABASE_RELATION_ERROR";
        message =
            "এই রেকর্ডের সঙ্গে সম্পর্কিত অন্য তথ্য রয়েছে। কর্মী ও Salary রেকর্ড যাচাই করুন।";
    } else if (
        dbCode === "ER_BAD_NULL_ERROR" ||
        dbCode === "ER_DATA_TOO_LONG" ||
        dbCode === "ER_TRUNCATED_WRONG_VALUE" ||
        dbCode === "ER_WARN_DATA_OUT_OF_RANGE"
    ) {
        status = 400;
        code = "INVALID_SALARY_DATA";
        message =
            "Salary-এর কোনো তথ্য খালি, ভুল ফরম্যাটে, অথবা অনুমোদিত সীমার বাইরে।";
    } else if (
        dbCode === "ECONNREFUSED" ||
        dbCode === "PROTOCOL_CONNECTION_LOST" ||
        dbCode === "ETIMEDOUT"
    ) {
        status = 503;
        code = "DATABASE_CONNECTION_ERROR";
        message =
            "ডাটাবেজে সংযোগ করা যাচ্ছে না। সার্ভার সংযোগ যাচাই করুন।";
    } else if (status === 401) {
        code = "AUTHENTICATION_REQUIRED";
        message = "আপনার সেশন শেষ হয়েছে। আবার লগইন করুন।";
    } else if (status === 403) {
        code = "FORBIDDEN";
        message = "অনুমতি বা CSRF যাচাই ব্যর্থ হয়েছে। পেজ রিফ্রেশ করে আবার চেষ্টা করুন।";
    } else if (status >= 500) {
        code = "INTERNAL_SERVER_ERROR";
    } else if (status >= 400) {
        code = "REQUEST_ERROR";
        message = error?.message || "অনুরোধের তথ্য যাচাই করুন।";
    }

    console.error("SALARY MODULE ERROR:", {
        code,
        status,
        databaseCode: dbCode || null,
        message: error?.message || "Unknown error"
    });

    return res.status(status).json({
        success: false,
        code,
        message
    });
}


async function getData(req, res) {
    try {
        const data = await service.getSalaryData(
            req,
            req.query || {}
        );

        return res.json({
            success: true,
            ...data
        });
    } catch (error) {
        return handleError(res, error);
    }
}

async function pay(req, res) {
    if (!verifyCsrf(req, res)) return;

    try {
        const result = await service.paySalary(
            req,
            {
                ...(req.body || {}),
                id: req.params.id
            }
        );

        return res.status(201).json({
            success: true,
            message: "Salary payment saved successfully.",
            ...result
        });
    } catch (error) {
        return handleError(res, error);
    }
}

async function remove(req, res) {
    if (!verifyCsrf(req, res)) return;

    try {
        const result = await service.deleteSalary(
            req,
            req.body || {}
        );

        return res.json({
            success: true,
            message: "Salary record deleted successfully.",
            ...result
        });
    } catch (error) {
        return handleError(res, error);
    }
}

module.exports = {
    getData,
    pay,
    remove
};
