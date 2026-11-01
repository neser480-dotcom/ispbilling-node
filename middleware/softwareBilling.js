
"use strict";

const db = require("../config/database");

const TRIAL_HOURS = 3;
const TRIAL_SECONDS = TRIAL_HOURS * 60 * 60;
const MONTHLY_NOTICE_DAYS = 7;
const MONTHLY_NOTICE_MS = MONTHLY_NOTICE_DAYS * 24 * 60 * 60 * 1000;

function normalizeRole(role) {
    return String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
}

function isSuperAdmin(req) {
    return normalizeRole(req.session?.role) === "superadmin";
}

async function getCurrentUnpaidBilling(req) {
    if (!req.session || !req.session.user_id || isSuperAdmin(req)) {
        return null;
    }

    const userId = Number(req.session.user_id);
    const companyId = Number(
        req.session.company_id ||
        req.session.companyId ||
        0
    );

    if (
        !Number.isInteger(userId) || userId <= 0 ||
        !Number.isInteger(companyId) || companyId <= 0
    ) {
        return null;
    }

    const [rows] = await db.execute(
        `
        SELECT
            id,
            company_id,
            user_id,
            billing_type,
            package_id,
            package_code,
            user_count,
            rate_per_user,
            amount,
            status,
            due_date,
            paid_at,
            created_at,
            updated_at,
            UNIX_TIMESTAMP(created_at) AS created_at_unix
        FROM software_billing_notifications
        WHERE user_id = ?
          AND company_id = ?
          AND status = 'unpaid'
        ORDER BY
            CASE
                WHEN billing_type = 'registration' THEN 0
                ELSE 1
            END,
            id DESC
        LIMIT 1
        `,
        [userId, companyId]
    );

    return rows.length ? rows[0] : null;
}

function getTrialInfo(billing) {
    if (!billing) {
        return {
            active: false,
            expired: false,
            expiresAt: null,
            remainingSeconds: 0
        };
    }

    if (
        String(billing.billing_type || "").toLowerCase() !== "registration"
    ) {
        return {
            active: false,
            expired: true,
            expiresAt: null,
            remainingSeconds: 0
        };
    }

    let createdTimestamp = Number(billing.created_at_unix);

    if (!Number.isFinite(createdTimestamp) || createdTimestamp <= 0) {
        if (!billing.created_at) {
            return {
                active: false,
                expired: true,
                expiresAt: null,
                remainingSeconds: 0
            };
        }

        const parsed = new Date(billing.created_at).getTime();

        if (!Number.isFinite(parsed)) {
            return {
                active: false,
                expired: true,
                expiresAt: null,
                remainingSeconds: 0
            };
        }

        createdTimestamp = Math.floor(parsed / 1000);
    }

    const expiresTimestamp = createdTimestamp + TRIAL_SECONDS;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const remainingSeconds = Math.max(
        0,
        expiresTimestamp - currentTimestamp
    );

    return {
        active: remainingSeconds > 0,
        expired: remainingSeconds <= 0,
        expiresAt: new Date(expiresTimestamp * 1000).toISOString(),
        remainingSeconds
    };
}

function getMonthlyBillingInfo(billing) {
    if (!billing) {
        return {
            active: false,
            expired: false,
            notice: false,
            required: false,
            dueAt: null,
            daysRemaining: null
        };
    }

    if (
        String(billing.billing_type || "").toLowerCase() !== "monthly"
    ) {
        return {
            active: false,
            expired: false,
            notice: false,
            required: false,
            dueAt: null,
            daysRemaining: null
        };
    }

    if (!billing.due_date) {
        return {
            active: false,
            expired: true,
            notice: true,
            required: true,
            dueAt: null,
            daysRemaining: null
        };
    }

    const dueTimestamp = new Date(billing.due_date).getTime();

    if (!Number.isFinite(dueTimestamp)) {
        return {
            active: false,
            expired: true,
            notice: true,
            required: true,
            dueAt: null,
            daysRemaining: null
        };
    }

    const now = Date.now();
    const remainingMs = dueTimestamp - now;
    const expired = remainingMs <= 0;
    const daysRemaining = Math.ceil(
        remainingMs / (24 * 60 * 60 * 1000)
    );

    return {
        active: !expired,
        expired,
        notice: expired || remainingMs <= MONTHLY_NOTICE_MS,
        required: expired,
        dueAt: new Date(dueTimestamp).toISOString(),
        daysRemaining: Math.max(0, daysRemaining)
    };
}

function createBillingState(billing) {
    if (!billing) {
        return {
            required: false,
            super_admin: false,
            trial: false,
            trial_expired: false,
            trial_expires_at: null,
            trial_remaining_seconds: 0,
            monthly_notice: false,
            monthly_expired: false,
            monthly_days_remaining: null,
            billing: null
        };
    }

    const type = String(billing.billing_type || "").toLowerCase();

    if (type === "registration") {
        const trial = getTrialInfo(billing);

        return {
            required: !trial.active,
            super_admin: false,
            trial: trial.active,
            trial_expired: trial.expired,
            trial_expires_at: trial.expiresAt,
            trial_remaining_seconds: trial.remainingSeconds,
            monthly_notice: false,
            monthly_expired: false,
            monthly_days_remaining: null,
            billing
        };
    }

    if (type === "monthly") {
        const monthly = getMonthlyBillingInfo(billing);

        return {
            required: monthly.required,
            super_admin: false,
            trial: false,
            trial_expired: false,
            trial_expires_at: null,
            trial_remaining_seconds: 0,
            monthly_notice: monthly.notice,
            monthly_expired: monthly.expired,
            monthly_due_at: monthly.dueAt,
            monthly_days_remaining: monthly.daysRemaining,
            billing
        };
    }

    return {
        required: true,
        super_admin: false,
        trial: false,
        trial_expired: false,
        trial_expires_at: null,
        trial_remaining_seconds: 0,
        monthly_notice: false,
        monthly_expired: false,
        monthly_days_remaining: null,
        billing
    };
}

function sendBillingRequired(req, res, state) {
    if (
        req.path.startsWith("/api/") ||
        req.originalUrl.startsWith("/api/")
    ) {
        return res.status(402).json({
            success: false,
            billing_required: true,
            trial_expired: state.trial_expired,
            monthly_expired: state.monthly_expired,
            message: "Software billing payment is required.",
            billing_id: Number(state.billing?.id || 0),
            amount: Number(state.billing?.amount || 0),
            due_date: state.billing?.due_date || null,
            redirect: "/software-billing"
        });
    }

    return res.redirect("/software-billing");
}

async function requireSoftwareBilling(req, res, next) {
    if (!req.session || !req.session.user_id) {
        if (
            req.path.startsWith("/api/") ||
            req.originalUrl.startsWith("/api/")
        ) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        return res.redirect("/");
    }

    if (isSuperAdmin(req)) {
        req.softwareBilling = {
            ...createBillingState(null),
            super_admin: true
        };

        return next();
    }

    try {
        const billing = await getCurrentUnpaidBilling(req);
        const state = createBillingState(billing);

        req.softwareBilling = state;

        if (!state.required) {
            return next();
        }

        return sendBillingRequired(req, res, state);

    } catch (error) {
        console.error("SOFTWARE BILLING GATE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to verify software billing status."
        });
    }
}

async function billingStatus(req, res, next) {
    if (!req.session || !req.session.user_id) {
        return res.status(401).json({
            success: false,
            authenticated: false
        });
    }

    if (isSuperAdmin(req)) {
        req.softwareBilling = {
            ...createBillingState(null),
            super_admin: true
        };

        return next();
    }

    try {
        const billing = await getCurrentUnpaidBilling(req);

        req.softwareBilling = createBillingState(billing);

        return next();

    } catch (error) {
        console.error("SOFTWARE BILLING STATUS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to check software billing."
        });
    }
}

module.exports = {
    TRIAL_HOURS,
    TRIAL_SECONDS,
    MONTHLY_NOTICE_DAYS,
    isSuperAdmin,
    getCurrentUnpaidBilling,
    getTrialInfo,
    getMonthlyBillingInfo,
    createBillingState,
    requireSoftwareBilling,
    billingStatus
};
