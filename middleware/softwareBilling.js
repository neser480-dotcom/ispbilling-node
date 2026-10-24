"use strict";

const db = require("../config/database");

const TRIAL_HOURS = 3;
const TRIAL_SECONDS = TRIAL_HOURS * 60 * 60;

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
    if (!req.session || !req.session.user_id) {
        return null;
    }

    const userId = Number(req.session.user_id);

    if (!Number.isInteger(userId) || userId <= 0) {
        return null;
    }

    if (isSuperAdmin(req)) {
        return null;
    }

    const companyId = Number(
        req.session.company_id ||
        req.session.companyId ||
        0
    );

    if (!Number.isInteger(companyId) || companyId <= 0) {
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
        ORDER BY id DESC
        LIMIT 1
        `,
        [
            userId,
            companyId
        ]
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
        String(billing.billing_type || "").toLowerCase() !==
        "registration"
    ) {
        return {
            active: false,
            expired: true,
            expiresAt: null,
            remainingSeconds: 0
        };
    }

    let createdTimestamp = Number(
        billing.created_at_unix
    );

    if (
        !Number.isFinite(createdTimestamp) ||
        createdTimestamp <= 0
    ) {
        if (!billing.created_at) {
            return {
                active: false,
                expired: true,
                expiresAt: null,
                remainingSeconds: 0
            };
        }

        const parsed = new Date(
            billing.created_at
        ).getTime();

        if (!Number.isFinite(parsed)) {
            return {
                active: false,
                expired: true,
                expiresAt: null,
                remainingSeconds: 0
            };
        }

        createdTimestamp = Math.floor(
            parsed / 1000
        );
    }

    const expiresTimestamp =
        createdTimestamp + TRIAL_SECONDS;

    const currentTimestamp =
        Math.floor(Date.now() / 1000);

    const remainingSeconds = Math.max(
        0,
        expiresTimestamp - currentTimestamp
    );

    return {
        active: remainingSeconds > 0,
        expired: remainingSeconds <= 0,
        expiresAt: new Date(
            expiresTimestamp * 1000
        ).toISOString(),
        remainingSeconds
    };
}

async function requireSoftwareBilling(req, res, next) {
    if (
        !req.session ||
        !req.session.user_id
    ) {
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
            required: false,
            super_admin: true,
            trial: false,
            trial_expired: false,
            trial_expires_at: null,
            trial_remaining_seconds: 0,
            billing: null
        };

        return next();
    }

    try {
        const billing =
            await getCurrentUnpaidBilling(req);

        if (!billing) {
            req.softwareBilling = {
                required: false,
                super_admin: false,
                trial: false,
                trial_expired: false,
                trial_expires_at: null,
                trial_remaining_seconds: 0,
                billing: null
            };

            return next();
        }

        const trial =
            getTrialInfo(billing);

        if (trial.active) {
            req.softwareBilling = {
                required: false,
                super_admin: false,
                trial: true,
                trial_expired: false,
                trial_expires_at:
                    trial.expiresAt,
                trial_remaining_seconds:
                    trial.remainingSeconds,
                billing
            };

            return next();
        }

        req.softwareBilling = {
            required: true,
            super_admin: false,
            trial: false,
            trial_expired: true,
            trial_expires_at:
                trial.expiresAt,
            trial_remaining_seconds: 0,
            billing
        };

        if (
            req.path.startsWith("/api/") ||
            req.originalUrl.startsWith("/api/")
        ) {
            return res.status(402).json({
                success: false,
                billing_required: true,
                trial_expired: true,
                message:
                    "Software billing payment is required.",
                billing_id:
                    Number(billing.id),
                amount:
                    Number(billing.amount || 0),
                redirect:
                    "/software-billing"
            });
        }

        return res.redirect(
            "/software-billing"
        );

    } catch (error) {
        console.error(
            "SOFTWARE BILLING GATE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to verify software billing status."
        });
    }
}

async function billingStatus(req, res, next) {
    if (
        !req.session ||
        !req.session.user_id
    ) {
        return res.status(401).json({
            success: false,
            authenticated: false
        });
    }

    if (isSuperAdmin(req)) {
        req.softwareBilling = {
            required: false,
            super_admin: true,
            trial: false,
            trial_expired: false,
            trial_expires_at: null,
            trial_remaining_seconds: 0,
            billing: null
        };

        return next();
    }

    try {
        const billing =
            await getCurrentUnpaidBilling(req);

        if (!billing) {
            req.softwareBilling = {
                required: false,
                super_admin: false,
                trial: false,
                trial_expired: false,
                trial_expires_at: null,
                trial_remaining_seconds: 0,
                billing: null
            };

            return next();
        }

        const trial =
            getTrialInfo(billing);

        req.softwareBilling = {
            required: !trial.active,
            super_admin: false,
            trial: trial.active,
            trial_expired: trial.expired,
            trial_expires_at:
                trial.expiresAt,
            trial_remaining_seconds:
                trial.remainingSeconds,
            billing
        };

        return next();

    } catch (error) {
        console.error(
            "SOFTWARE BILLING STATUS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to check software billing."
        });
    }
}

module.exports = {
    TRIAL_HOURS,
    TRIAL_SECONDS,
    isSuperAdmin,
    getCurrentUnpaidBilling,
    getTrialInfo,
    requireSoftwareBilling,
    billingStatus
};