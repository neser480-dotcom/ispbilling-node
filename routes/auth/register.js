"use strict";

const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

const db = require("../../config/database");

const router = express.Router();

const TRIAL_HOURS = 3;
const BCRYPT_ROUNDS = 12;

const registrationAttempts = new Map();

const RATE_LIMIT_WINDOW = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 10;


/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function getClientIp(req) {
    return (
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.ip ||
        req.socket?.remoteAddress ||
        "unknown"
    );
}


function cleanupRateLimit() {
    const now = Date.now();

    for (const [key, data] of registrationAttempts.entries()) {
        if (now - data.firstAttempt > RATE_LIMIT_WINDOW) {
            registrationAttempts.delete(key);
        }
    }
}


function checkRateLimit(req) {
    cleanupRateLimit();

    const ip = getClientIp(req);
    const now = Date.now();

    let record = registrationAttempts.get(ip);

    if (!record) {
        record = {
            firstAttempt: now,
            count: 0
        };

        registrationAttempts.set(ip, record);
    }

    if (now - record.firstAttempt > RATE_LIMIT_WINDOW) {
        record.firstAttempt = now;
        record.count = 0;
    }

    record.count++;

    if (record.count > RATE_LIMIT_MAX) {
        return false;
    }

    return true;
}


function generateCsrfToken() {
    return crypto.randomBytes(32).toString("hex");
}


function ensureCsrfToken(req) {
    if (!req.session) {
        return null;
    }

    if (!req.session.register_csrf_token) {
        req.session.register_csrf_token = generateCsrfToken();
    }

    return req.session.register_csrf_token;
}


function verifyCsrfToken(req, token) {
    const sessionToken = req.session?.register_csrf_token;

    if (!sessionToken || !token) {
        return false;
    }

    if (
        typeof sessionToken !== "string" ||
        typeof token !== "string"
    ) {
        return false;
    }

    if (sessionToken.length !== token.length) {
        return false;
    }

    try {
        return crypto.timingSafeEqual(
            Buffer.from(sessionToken),
            Buffer.from(token)
        );
    } catch (error) {
        return false;
    }
}


function cleanString(value) {
    if (value === undefined || value === null) {
        return "";
    }

    return String(value).trim();
}


function cleanEmail(value) {
    const email = cleanString(value).toLowerCase();

    return email || null;
}


function cleanNullable(value) {
    const valueString = cleanString(value);

    return valueString || null;
}


function parseMoney(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
        return 0;
    }

    return Number(number.toFixed(2));
}


function calculateDiscount(
    signupFee,
    discountType,
    discountValue
) {
    let discount = 0;

    if (discountType === "percent") {
        discount = signupFee * (discountValue / 100);
    } else if (discountType === "fixed") {
        discount = discountValue;
    }

    if (discount < 0) {
        discount = 0;
    }

    if (discount > signupFee) {
        discount = signupFee;
    }

    return Number(discount.toFixed(2));
}


/*
|--------------------------------------------------------------------------
| GET registration data
|--------------------------------------------------------------------------
*/

router.get("/data", async (req, res) => {
    try {
        const csrfToken = ensureCsrfToken(req);

        const [packages] = await db.execute(
            `
            SELECT
                id,
                package_code,
                package_name,
                customer_limit,
                signup_fee,
                monthly_fee
            FROM software_packages
            WHERE status = 'active'
            ORDER BY id ASC
            `
        );

        let canApplyDiscount = false;

        if (req.session?.user_id) {
            canApplyDiscount =
                req.session.role === "admin" ||
                req.session.role === "super_admin";
        }

        res.json({
            success: true,
            csrf_token: csrfToken,
            can_apply_discount: canApplyDiscount,
            packages: packages.map((pkg) => ({
                id: pkg.id,
                package_code: pkg.package_code,
                package_name: pkg.package_name,
                customer_limit: Number(pkg.customer_limit || 0),
                signup_fee: Number(pkg.signup_fee || 0),
                monthly_fee: Number(pkg.monthly_fee || 0)
            })),
            company_message: ""
        });
    } catch (error) {
        console.error("Register data error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to load registration data."
        });
    }
});


/*
|--------------------------------------------------------------------------
| POST registration
|--------------------------------------------------------------------------
*/

router.post("/", async (req, res) => {
    let connection = null;

    try {
        /*
        |--------------------------------------------------------------------------
        | Logged-in user restriction
        |--------------------------------------------------------------------------
        */

        if (
            req.session?.user_id &&
            req.session.role !== "super_admin"
        ) {
            return res.status(403).json({
                success: false,
                message: "You are not allowed to create a new ISP account."
            });
        }


        /*
        |--------------------------------------------------------------------------
        | Rate limit
        |--------------------------------------------------------------------------
        */

        if (!checkRateLimit(req)) {
            return res.status(429).json({
                success: false,
                message: "Too many registration attempts. Please try again later."
            });
        }


        /*
        |--------------------------------------------------------------------------
        | CSRF
        |--------------------------------------------------------------------------
        */

        const csrfToken = cleanString(req.body.csrf_token);

        if (!verifyCsrfToken(req, csrfToken)) {
            return res.status(403).json({
                success: false,
                message: "Invalid or expired security token."
            });
        }


        /*
        |--------------------------------------------------------------------------
        | Read input
        |--------------------------------------------------------------------------
        */

        const name = cleanString(req.body.name);
        const companyName = cleanString(req.body.company_name);
        const mobile = cleanString(req.body.mobile);
        const email = cleanEmail(req.body.email);
        const username = cleanString(req.body.username);
        const password = cleanString(req.body.password);

        const packageId = Number(req.body.package_id || 0);

        const customerType =
            cleanString(req.body.customer_type) || "PPPoE";

        const address = cleanNullable(req.body.address);
        const nid = cleanNullable(req.body.nid);

        const referenceName =
            cleanNullable(req.body.reference_name);

        const referenceMobile =
            cleanNullable(req.body.reference_mobile);

        const discountType =
            cleanString(req.body.discount_type).toLowerCase();

        const discountValue =
            parseMoney(req.body.discount_value);


        /*
        |--------------------------------------------------------------------------
        | Validation
        |--------------------------------------------------------------------------
        */

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Name is required."
            });
        }

        if (!companyName) {
            return res.status(400).json({
                success: false,
                message: "Company name is required."
            });
        }

        if (!mobile) {
            return res.status(400).json({
                success: false,
                message: "Mobile number is required."
            });
        }

        if (!username) {
            return res.status(400).json({
                success: false,
                message: "Username is required."
            });
        }

        if (!/^[a-zA-Z0-9._-]{3,50}$/.test(username)) {
            return res.status(400).json({
                success: false,
                message:
                    "Username must be 3 to 50 characters and may contain letters, numbers, dot, underscore and hyphen."
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters."
            });
        }

        if (!Number.isInteger(packageId) || packageId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Please select a valid package."
            });
        }

        const allowedCustomerTypes = [
            "PPPoE",
            "Static",
            "Hotspot"
        ];

        if (!allowedCustomerTypes.includes(customerType)) {
            return res.status(400).json({
                success: false,
                message: "Invalid customer type."
            });
        }


        /*
        |--------------------------------------------------------------------------
        | Duplicate username
        |--------------------------------------------------------------------------
        */

        const [existingUsers] = await db.execute(
            `
            SELECT id
            FROM users
            WHERE username = ?
            LIMIT 1
            `,
            [username]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({
                success: false,
                message: "This username is already in use."
            });
        }


        /*
        |--------------------------------------------------------------------------
        | Package
        |--------------------------------------------------------------------------
        */

        const [packageRows] = await db.execute(
            `
            SELECT
                id,
                package_code,
                package_name,
                customer_limit,
                signup_fee,
                monthly_fee
            FROM software_packages
            WHERE id = ?
              AND status = 'active'
            LIMIT 1
            `,
            [packageId]
        );

        if (packageRows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Selected package is not available."
            });
        }

        const selectedPackage = packageRows[0];

        const signupFee = parseMoney(
            selectedPackage.signup_fee
        );

        const monthlyFee = parseMoney(
            selectedPackage.monthly_fee
        );


        /*
        |--------------------------------------------------------------------------
        | Discount
        |--------------------------------------------------------------------------
        */

        let finalDiscount = 0;

        const loggedInRole = req.session?.role || null;

        const canApplyDiscount =
            loggedInRole === "admin" ||
            loggedInRole === "super_admin";

        if (canApplyDiscount && discountValue > 0) {
            if (
                discountType === "percent" ||
                discountType === "fixed"
            ) {
                finalDiscount = calculateDiscount(
                    signupFee,
                    discountType,
                    discountValue
                );
            }
        }

        const finalSignupFee = Number(
            (signupFee - finalDiscount).toFixed(2)
        );


        /*
        |--------------------------------------------------------------------------
        | Password
        |--------------------------------------------------------------------------
        */

        const passwordHash = await bcrypt.hash(
            password,
            BCRYPT_ROUNDS
        );


        /*
        |--------------------------------------------------------------------------
        | Registration settings
        |--------------------------------------------------------------------------
        */

        const trialStartedAt = new Date();

        const trialExpiresAt = new Date(
            trialStartedAt.getTime() +
            TRIAL_HOURS * 60 * 60 * 1000
        );

        const registrationSettings = {
            trial_hours: TRIAL_HOURS,
            trial_started_at: trialStartedAt.toISOString(),
            trial_expires_at: trialExpiresAt.toISOString(),
            registration_payment: "unpaid",
            registration_fee: signupFee,
            registration_discount: finalDiscount,
            registration_amount: finalSignupFee,
            monthly_fee: monthlyFee,
            reference_name: referenceName,
            reference_mobile: referenceMobile
        };


        /*
        |--------------------------------------------------------------------------
        | Company / creator
        |--------------------------------------------------------------------------
        */

        let companyId = 0;
        let createdBy = null;

        if (
            req.session?.user_id &&
            req.session.role === "super_admin"
        ) {
            companyId = Number(
                req.session.company_id || 0
            );

            createdBy = Number(
                req.session.user_id
            );
        }


        /*
        |--------------------------------------------------------------------------
        | Transaction
        |--------------------------------------------------------------------------
        */

        connection = await db.getConnection();

        await connection.beginTransaction();


        /*
        |--------------------------------------------------------------------------
        | Create ISP owner/admin
        |--------------------------------------------------------------------------
        */

        const [userResult] = await connection.execute(
            `
            INSERT INTO users
            (
                company_id,
                username,
                password,
                fullname,
                email,
                mobile,
                role,
                status,
                package_id,
                client_type,
                customer_id,
                settings,
                company_name,
                owner_name,
                phone,
                address,
                nid,
                add_staff,
                created_by,
                name
            )
            VALUES
            (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                'admin',
                'active',
                ?,
                ?,
                NULL,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                0,
                ?,
                ?
            )
            `,
            [
                companyId,
                username,
                passwordHash,
                name,
                email,
                mobile,
                packageId,
                customerType,
                JSON.stringify(registrationSettings),
                companyName,
                name,
                mobile,
                address,
                nid,
                createdBy,
                name
            ]
        );

        const userId = userResult.insertId;


        /*
        |--------------------------------------------------------------------------
        | Public registration company_id
        |--------------------------------------------------------------------------
        |
        | This application stores the ISP/company owner in users itself.
        | Therefore a newly registered ISP becomes its own company.
        |
        */

        if (!req.session?.user_id) {
            await connection.execute(
                `
                UPDATE users
                SET company_id = ?
                WHERE id = ?
                `,
                [userId, userId]
            );

            companyId = userId;
        }


        /*
        |--------------------------------------------------------------------------
        | Generate ISP customer ID
        |--------------------------------------------------------------------------
        */

        const generatedCustomerId =
            `ISP-${10000 + Number(userId)}`;

        await connection.execute(
            `
            UPDATE users
            SET customer_id = ?
            WHERE id = ?
            `,
            [
                generatedCustomerId,
                userId
            ]
        );


        /*
        |--------------------------------------------------------------------------
        | Registration billing notification
        |--------------------------------------------------------------------------
        */

        await connection.execute(
            `
            INSERT INTO software_billing_notifications
            (
                company_id,
                user_id,
                billing_type,
                package_id,
                package_code,
                user_count,
                rate_per_user,
                amount,
                status,
                due_date
            )
            VALUES
            (
                ?,
                ?,
                'registration',
                ?,
                ?,
                1,
                ?,
                ?,
                'unpaid',
                DATE_ADD(NOW(), INTERVAL ? HOUR)
            )
            `,
            [
                companyId,
                userId,
                selectedPackage.id,
                selectedPackage.package_code,
                finalSignupFee,
                finalSignupFee,
                TRIAL_HOURS
            ]
        );


        /*
        |--------------------------------------------------------------------------
        | Registration invoice
        |--------------------------------------------------------------------------
        */

        await connection.execute(
            `
            INSERT INTO invoices
            (
                company_id,
                user_id,
                type,
                message_type,
                amount,
                status,
                invoice_date,
                due_date
            )
            VALUES
            (
                ?,
                ?,
                'registration',
                'registration_fee',
                ?,
                'unpaid',
                NOW(),
                DATE_ADD(NOW(), INTERVAL ? HOUR)
            )
            `,
            [
                companyId,
                userId,
                finalSignupFee,
                TRIAL_HOURS
            ]
        );


        /*
        |--------------------------------------------------------------------------
        | Commit
        |--------------------------------------------------------------------------
        */

        await connection.commit();


        /*
        |--------------------------------------------------------------------------
        | Rotate registration CSRF token
        |--------------------------------------------------------------------------
        */

        if (req.session) {
            req.session.register_csrf_token =
                generateCsrfToken();
        }


        /*
        |--------------------------------------------------------------------------
        | Success
        |--------------------------------------------------------------------------
        */

        return res.status(201).json({
            success: true,
            message:
                "Registration completed successfully.",
            customer_id: generatedCustomerId,
            user_id: userId,
            package: {
                id: Number(selectedPackage.id),
                code: selectedPackage.package_code,
                name: selectedPackage.package_name,
                customer_limit:
                    Number(selectedPackage.customer_limit || 0),
                signup_fee: signupFee,
                discount: finalDiscount,
                registration_amount: finalSignupFee,
                monthly_fee: monthlyFee
            },
            trial_hours: TRIAL_HOURS,
            csrf_token:
                req.session?.register_csrf_token || null
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    "Registration rollback error:",
                    rollbackError
                );
            }
        }

        console.error(
            "Registration error:",
            error
        );

        if (error && error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                message:
                    "Username or another unique registration value already exists."
            });
        }

        return res.status(500).json({
            success: false,
            message:
                "Registration failed. Please try again."
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});


module.exports = router;