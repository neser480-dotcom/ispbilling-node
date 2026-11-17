"use strict";

const path = require("path");
const crypto = require("crypto");

const pricing = require("../../services/billing/pricing.service");

/*
|--------------------------------------------------------------------------
| CSRF (same token as /api/csrf-token : req.session.csrf_token)
|--------------------------------------------------------------------------
*/

function verifyCsrf(req, res) {
    const sessionToken = String(req.session?.csrf_token || "");

    const suppliedToken = String(
        req.get("X-CSRF-Token") ||
        req.body?.csrf_token ||
        req.body?._csrf ||
        ""
    );

    let valid = false;

    if (
        sessionToken &&
        suppliedToken &&
        sessionToken.length === suppliedToken.length
    ) {
        valid = crypto.timingSafeEqual(
            Buffer.from(sessionToken),
            Buffer.from(suppliedToken)
        );
    }

    if (!valid) {
        res.status(403).json({
            success: false,
            message: "Invalid CSRF token. পেজ রিফ্রেশ করে আবার চেষ্টা করুন."
        });

        return false;
    }

    return true;
}

function actorFrom(req) {
    return {
        userId: Number(req.session?.user_id || 0),
        companyId: Number(req.session?.company_id || 0),
        name: req.session?.fullname || req.session?.username || "",
        role: req.session?.role || "",
        ip: req.ip || req.socket?.remoteAddress || null
    };
}

function handleError(res, error) {
    const status = Number(error?.httpCode) || 500;

    if (status >= 500) {
        console.error("PRICING MODULE ERROR:", error);
    }

    return res.status(status).json({
        success: false,
        message: status >= 500
            ? "An unexpected server error occurred."
            : error.message
    });
}

/*
|--------------------------------------------------------------------------
| PAGE
|--------------------------------------------------------------------------
*/

function page(req, res) {
    return res.sendFile(
        path.join(__dirname, "..", "..", "views", "admin", "pricing.html"),
        error => {
            if (error && !res.headersSent) {
                res.status(404).send("Pricing page not found.");
            }
        }
    );
}

/*
|--------------------------------------------------------------------------
| API
|--------------------------------------------------------------------------
*/

async function companies(req, res) {
    try {
        const rows = await pricing.listCompanies(req.query.search);

        return res.json({
            success: true,
            companies: rows
        });
    } catch (error) {
        return handleError(res, error);
    }
}

async function detail(req, res) {
    try {
        const data = await pricing.getCompanyDetail(req.params.companyId);

        return res.json({
            success: true,
            ...data
        });
    } catch (error) {
        return handleError(res, error);
    }
}

async function save(req, res) {
    if (!verifyCsrf(req, res)) return;

    try {
        const body = req.body || {};

        await pricing.saveRule(
            {
                companyId: req.params.companyId,
                feeType: body.fee_type,
                mode: body.mode,
                value: body.value,
                isEnabled: body.is_enabled,
                startsAt: body.starts_at,
                expiresAt: body.expires_at,
                note: body.note
            },
            actorFrom(req)
        );

        const data = await pricing.getCompanyDetail(req.params.companyId);

        return res.json({
            success: true,
            message: "Pricing সংরক্ষণ হয়েছে।",
            ...data
        });
    } catch (error) {
        return handleError(res, error);
    }
}

async function toggle(req, res) {
    if (!verifyCsrf(req, res)) return;

    try {
        const body = req.body || {};

        const result = await pricing.setEnabled(
            {
                companyId: req.params.companyId,
                feeType: req.params.feeType,
                enabled: body.enabled,
                note: body.note
            },
            actorFrom(req)
        );

        const data = await pricing.getCompanyDetail(req.params.companyId);

        return res.json({
            success: true,
            message: result.changed
                ? "Special Price-এর অবস্থা পরিবর্তন হয়েছে।"
                : "কোনো পরিবর্তন হয়নি।",
            ...data
        });
    } catch (error) {
        return handleError(res, error);
    }
}

async function reset(req, res) {
    if (!verifyCsrf(req, res)) return;

    try {
        const body = req.body || {};

        await pricing.resetRule(
            {
                companyId: req.params.companyId,
                feeType: req.params.feeType,
                note: body.note
            },
            actorFrom(req)
        );

        const data = await pricing.getCompanyDetail(req.params.companyId);

        return res.json({
            success: true,
            message: "Default মূল্যে ফিরে যাওয়া হয়েছে।",
            ...data
        });
    } catch (error) {
        return handleError(res, error);
    }
}

module.exports = {
    page,
    companies,
    detail,
    save,
    toggle,
    reset
};
