
"use strict";

const service = require("../../services/billing/expenditure.service");

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
    const status = Number(error?.httpCode) || 500;

    if (status >= 500) {
        console.error(
            "EXPENDITURE MODULE ERROR:",
            error
        );
    }

    return res.status(status).json({
        success: false,
        message: status >= 500
            ? "An unexpected server error occurred."
            : error.message
    });
}

async function getPageData(req, res) {
    try {
        const data = await service.getPageData(
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

async function addExpenditure(req, res) {
    if (!verifyCsrf(req, res)) return;

    try {
        const result = await service.addExpenditure(
            req,
            req.body || {}
        );

        return res.status(201).json({
            success: true,
            message: "Expenditure added successfully.",
            ...result
        });
    } catch (error) {
        return handleError(res, error);
    }
}

async function updateExpenditure(req, res) {
    if (!verifyCsrf(req, res)) return;

    try {
        const result = await service.updateExpenditure(
            req,
            req.params.id,
            req.body || {}
        );

        return res.json({
            success: true,
            message: "Expenditure updated successfully.",
            ...result
        });
    } catch (error) {
        return handleError(res, error);
    }
}

async function deleteExpenditure(req, res) {
    if (!verifyCsrf(req, res)) return;

    try {
        await service.deleteExpenditure(
            req,
            req.params.id
        );

        return res.json({
            success: true,
            message: "Expenditure deleted successfully."
        });
    } catch (error) {
        return handleError(res, error);
    }
}

async function addType(req, res) {
    if (!verifyCsrf(req, res)) return;

    try {
        const result = await service.addType(
            req,
            req.body || {}
        );

        return res.status(201).json({
            success: true,
            message: "Expenditure type added successfully.",
            ...result
        });
    } catch (error) {
        return handleError(res, error);
    }
}

async function updateType(req, res) {
    if (!verifyCsrf(req, res)) return;

    try {
        const result = await service.updateType(
            req,
            req.params.id,
            req.body || {}
        );

        return res.json({
            success: true,
            message: "Expenditure type updated successfully.",
            ...result
        });
    } catch (error) {
        return handleError(res, error);
    }
}

async function deleteType(req, res) {
    if (!verifyCsrf(req, res)) return;

    try {
        await service.deleteType(
            req,
            req.params.id
        );

        return res.json({
            success: true,
            message: "Expenditure type deleted successfully."
        });
    } catch (error) {
        return handleError(res, error);
    }
}

module.exports = {
    getPageData,
    addExpenditure,
    updateExpenditure,
    deleteExpenditure,
    addType,
    updateType,
    deleteType
};
