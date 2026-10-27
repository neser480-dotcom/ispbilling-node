"use strict";

const service = require("../services/staff.service");

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
        console.error("STAFF MODULE ERROR:", error);
    }

    return res.status(status).json({
        success: false,
        message: status >= 500
            ? "An unexpected server error occurred."
            : error.message
    });
}

async function getStaff(req, res) {
    try {
        const data = await service.getStaff(
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

async function addStaff(req, res) {
    if (!verifyCsrf(req, res)) return;

    try {
        const result = await service.addStaff(
            req,
            req.body || {}
        );

        return res.status(201).json({
            success: true,
            message: "নতুন স্টাফ সফলভাবে যোগ করা হয়েছে!",
            ...result
        });
    } catch (error) {
        return handleError(res, error);
    }
}

async function updateStaff(req, res) {
    if (!verifyCsrf(req, res)) return;

    try {
        const result = await service.updateStaff(
            req,
            req.params.id,
            req.body || {}
        );

        return res.json({
            success: true,
            message: "স্টাফের তথ্য সফলভাবে আপডেট হয়েছে!",
            ...result
        });
    } catch (error) {
        return handleError(res, error);
    }
}

async function deleteStaff(req, res) {
    if (!verifyCsrf(req, res)) return;

    try {
        await service.deleteStaff(
            req,
            req.params.id
        );

        return res.json({
            success: true,
            message: "স্টাফ সফলভাবে ডিলিট হয়েছে!"
        });
    } catch (error) {
        return handleError(res, error);
    }
}

async function sendSms(req, res) {
    if (!verifyCsrf(req, res)) return;

    try {
        const result = await service.prepareSms(
            req,
            req.body || {}
        );

        return res.json({
            success: true,
            message: "SMS gateway যুক্ত করা নেই। মেসেজ পাঠানো হয়নি।",
            ...result
        });
    } catch (error) {
        return handleError(res, error);
    }
}

module.exports = {
    getStaff,
    addStaff,
    updateStaff,
    deleteStaff,
    sendSms
};