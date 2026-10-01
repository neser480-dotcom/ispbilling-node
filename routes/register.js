const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const db = require("../config/database");

const router = express.Router();

const TRIAL_HOURS = 3;

function cleanText(value) {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
}

function money(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
}

function getCsrf(req) {

    if (!req.session.csrf_token) {

        req.session.csrf_token =
            crypto.randomBytes(32).toString("hex");
    }

    return req.session.csrf_token;
}

function rotateCsrf(req) {

    req.session.csrf_token =
        crypto.randomBytes(32).toString("hex");

    return req.session.csrf_token;
}


/* =========================================================
   GET CSRF
========================================================= */

router.get("/csrf", (req, res) => {

    res.json({
        success: true,
        csrf_token: getCsrf(req)
    });

});


/* =========================================================
   REGISTER DATA
========================================================= */

router.get("/data", async (req, res) => {

    try {

        const sessionUserId =
            Number(req.session.user_id || 0);

        const sessionCompanyId =
            Number(req.session.company_id || 0);

        const currentRole =
            String(req.session.role || "")
                .trim()
                .toLowerCase();

        const isLoggedIn =
            sessionUserId > 0;

        const isSuperAdmin =
            currentRole === "super_admin";

        const useExistingTenant =
            isLoggedIn && !isSuperAdmin;

        const existingTenantId =
            useExistingTenant
                ? sessionCompanyId
                : 0;

        let companyMessage = "";

        if (
            useExistingTenant &&
            existingTenantId <= 0
        ) {

            companyMessage =
                "Company information is missing for this account.";
        }

        const canApplyDiscount =
            currentRole === "super_admin" ||
            currentRole === "admin";


        const [packages] =
            await db.execute(`
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
            `);


        res.json({

            success: true,

            csrf_token:
                getCsrf(req),

            trial_hours:
                TRIAL_HOURS,

            can_apply_discount:
                canApplyDiscount,

            company_message:
                companyMessage,

            use_existing_tenant:
                useExistingTenant,

            existing_tenant_id:
                existingTenantId,

            packages

        });

    } catch (error) {

        console.error(
            "REGISTER DATA ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "Unable to load registration data."

        });

    }

});


/* =========================================================
   REGISTER
========================================================= */

router.post("/", async (req, res) => {

    let connection = null;

    try {

        /* =================================================
           CSRF
        ================================================= */

        if (
            !req.body.csrf_token ||
            !req.session.csrf_token ||
            !crypto.timingSafeEqual(
                Buffer.from(
                    String(req.session.csrf_token)
                ),
                Buffer.from(
                    String(req.body.csrf_token)
                )
            )
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid request. Please refresh the page and try again.",

                csrf_token:
                    getCsrf(req)

            });
        }


        /* =================================================
           SESSION / TENANT
        ================================================= */

        const sessionUserId =
            Number(req.session.user_id || 0);

        const sessionCompanyId =
            Number(req.session.company_id || 0);

        const currentRole =
            String(req.session.role || "")
                .trim()
                .toLowerCase();

        const isLoggedIn =
            sessionUserId > 0;

        const isSuperAdmin =
            currentRole === "super_admin";

        const useExistingTenant =
            isLoggedIn && !isSuperAdmin;

        const existingTenantId =
            sessionCompanyId;


        if (
            useExistingTenant &&
            existingTenantId <= 0
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Company information is missing for this account.",

                csrf_token:
                    getCsrf(req)

            });
        }


        /* =================================================
           INPUT
        ================================================= */

        const name =
            cleanText(req.body.name);

        const companyName =
            cleanText(req.body.company_name);

        const mobile =
            cleanText(req.body.mobile);

        const email =
            cleanText(req.body.email)
                .toLowerCase();

        const username =
            cleanText(req.body.username);

        const rawPassword =
            String(req.body.password || "");

        const address =
            cleanText(req.body.address);

        const nid =
            cleanText(req.body.nid);

        const packageId =
            Number(req.body.package_id || 0);

        const clientType =
            cleanText(req.body.customer_type);

        const referenceName =
            cleanText(req.body.reference_name);

        const referenceMobile =
            cleanText(req.body.reference_mobile);

        /*

        These are intentionally received.

        Same as PHP version, they are currently
        not inserted into users because there are
        no confirmed dedicated reference columns.

        */

        void referenceName;
        void referenceMobile;


        /* =================================================
           DISCOUNT
        ================================================= */

        const canApplyDiscount =
            currentRole === "super_admin" ||
            currentRole === "admin";

        let discountType =
            cleanText(
                req.body.discount_type ||
                "percent"
            ).toLowerCase();

        let discountValueRaw =
            cleanText(
                req.body.discount_value || "0"
            );


        if (!canApplyDiscount) {

            discountType =
                "percent";

            discountValueRaw =
                "0";
        }


        let discountValue =
            Number(discountValueRaw);

        if (!Number.isFinite(discountValue)) {

            discountValue = -1;
        }


        /* =================================================
           VALIDATION
        ================================================= */

        if (!name) {

            return res.status(400).json({
                success: false,
                message: "Please enter your name.",
                csrf_token: getCsrf(req)
            });
        }

        if (!companyName) {

            return res.status(400).json({
                success: false,
                message:
                    "Please enter your institution/company name.",
                csrf_token: getCsrf(req)
            });
        }

        if (!mobile) {

            return res.status(400).json({
                success: false,
                message:
                    "Please enter your mobile number.",
                csrf_token: getCsrf(req)
            });
        }

        if (!address) {

            return res.status(400).json({
                success: false,
                message:
                    "Please enter your area/address.",
                csrf_token: getCsrf(req)
            });
        }

        const emailValid =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/
                .test(email);

        if (!emailValid) {

            return res.status(400).json({
                success: false,
                message:
                    "Please enter a valid email address.",
                csrf_token: getCsrf(req)
            });
        }

        if (!/^\+?[0-9]{7,15}$/.test(mobile)) {

            return res.status(400).json({
                success: false,
                message:
                    "Please enter a valid mobile number.",
                csrf_token: getCsrf(req)
            });
        }

        if (
            username.length < 3 ||
            !/^[a-zA-Z0-9_.]+$/.test(username)
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Username must be at least 3 characters (letters, numbers, dot, underscore only).",
                csrf_token: getCsrf(req)
            });
        }

        if (rawPassword.length < 8) {

            return res.status(400).json({
                success: false,
                message:
                    "Password must be at least 8 characters long.",
                csrf_token: getCsrf(req)
            });
        }

        if (packageId <= 0) {

            return res.status(400).json({
                success: false,
                message:
                    "Please choose a valid package.",
                csrf_token: getCsrf(req)
            });
        }

        if (
            ![
                "PPPoE",
                "Static",
                "Hotspot"
            ].includes(clientType)
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Please choose a valid connection type.",
                csrf_token: getCsrf(req)
            });
        }

        if (
            ![
                "percent",
                "fixed"
            ].includes(discountType)
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Invalid discount type.",
                csrf_token: getCsrf(req)
            });
        }

        if (discountValue < 0) {

            return res.status(400).json({
                success: false,
                message:
                    "Discount cannot be negative.",
                csrf_token: getCsrf(req)
            });
        }


        /* =================================================
           DUPLICATE CHECK
        ================================================= */

        let duplicateRows;

        if (useExistingTenant) {

            [
                duplicateRows
            ] = await db.execute(`

                SELECT
                    id,
                    name,
                    company_name,
                    mobile,
                    address,
                    username,
                    email

                FROM users

                WHERE company_id = ?

                AND (
                       mobile = ?
                    OR company_name = ?
                    OR address = ?
                    OR username = ?
                    OR email = ?
                )

                LIMIT 1

            `, [
                existingTenantId,
                mobile,
                companyName,
                address,
                username,
                email
            ]);

        } else {

            [
                duplicateRows
            ] = await db.execute(`

                SELECT
                    id,
                    name,
                    company_name,
                    mobile,
                    address,
                    username,
                    email

                FROM users

                WHERE
                       mobile = ?
                    OR company_name = ?
                    OR address = ?
                    OR username = ?
                    OR email = ?

                LIMIT 1

            `, [
                mobile,
                companyName,
                address,
                username,
                email
            ]);
        }


        if (duplicateRows.length > 0) {

            const duplicate =
                duplicateRows[0];

            if (
                String(duplicate.mobile) ===
                mobile
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "This mobile number is already registered.",
                    csrf_token: getCsrf(req)
                });
            }

            if (
                cleanText(
                    duplicate.company_name
                ) === companyName
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "This institution/company is already registered.",
                    csrf_token: getCsrf(req)
                });
            }

            if (
                cleanText(
                    duplicate.address
                ) === address
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "This area/address is already registered.",
                    csrf_token: getCsrf(req)
                });
            }

            if (
                String(duplicate.username)
                    .toLowerCase() ===
                username.toLowerCase()
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "This username is already registered.",
                    csrf_token: getCsrf(req)
                });
            }

            if (
                String(duplicate.email)
                    .toLowerCase() ===
                email.toLowerCase()
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "This email address is already registered.",
                    csrf_token: getCsrf(req)
                });
            }

            return res.status(400).json({
                success: false,
                message:
                    "Duplicate registration information found.",
                csrf_token: getCsrf(req)
            });
        }


        /* =================================================
           PACKAGE
        ================================================= */

        const [
            packageRows
        ] = await db.execute(`

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

        `, [
            packageId
        ]);


        if (packageRows.length !== 1) {

            return res.status(400).json({
                success: false,
                message:
                    "Selected package is not available.",
                csrf_token: getCsrf(req)
            });
        }


        const selectedPackage =
            packageRows[0];

        const userPackageId =
            Number(selectedPackage.id);

        const packageCode =
            String(selectedPackage.package_code);

        const signupFee =
            Math.max(
                0,
                money(selectedPackage.signup_fee)
            );

        const monthlyFee =
            Math.max(
                0,
                money(selectedPackage.monthly_fee)
            );

        const customerLimit =
            Number(
                selectedPackage.customer_limit || 0
            );


        void monthlyFee;
        void customerLimit;


        /* =================================================
           DISCOUNT CALCULATION
        ================================================= */

        let discountAmount = 0;

        if (canApplyDiscount) {

            if (discountType === "percent") {

                if (discountValue > 100) {
                    discountValue = 100;
                }

                discountAmount =
                    signupFee *
                    (
                        discountValue / 100
                    );

            } else {

                if (discountValue > signupFee) {
                    discountValue = signupFee;
                }

                discountAmount =
                    discountValue;
            }
        }


        discountAmount =
            Math.min(
                signupFee,
                Math.max(
                    0,
                    discountAmount
                )
            );

        const finalSignupFee =
            Math.max(
                0,
                signupFee - discountAmount
            );


        /* =================================================
           PASSWORD
        ================================================= */

        const password =
            await bcrypt.hash(
                rawPassword,
                10
            );


        /* =================================================
           CONNECTION
        ================================================= */

        connection =
            await db.getConnection();

        await connection.beginTransaction();


        /* =================================================
           TENANT
        ================================================= */

        let companyId =
            useExistingTenant
                ? existingTenantId
                : 0;


        /* =================================================
           TIME
        ================================================= */

        const registeredAt =
            new Date();

        const trialExpiresAt =
            new Date(
                registeredAt.getTime() +
                TRIAL_HOURS * 60 * 60 * 1000
            );


        function mysqlDate(date) {

            const pad =
                n =>
                String(n).padStart(2, "0");

            return (
                date.getFullYear() +
                "-" +
                pad(date.getMonth() + 1) +
                "-" +
                pad(date.getDate()) +
                " " +
                pad(date.getHours()) +
                ":" +
                pad(date.getMinutes()) +
                ":" +
                pad(date.getSeconds())
            );
        }


        const registeredAtSql =
            mysqlDate(registeredAt);

        const trialExpiresAtSql =
            mysqlDate(trialExpiresAt);


        /* =================================================
           SETTINGS JSON
        ================================================= */

        const settingsData = {

            trial: {

                enabled: true,

                trial_hours:
                    TRIAL_HOURS,

                registered_at:
                    registeredAtSql,

                expires_at:
                    trialExpiresAtSql

            },

            registration_payment: {

                status:
                    "unpaid",

                base_amount:
                    signupFee,

                discount_type:
                    discountType,

                discount_value:
                    discountValue,

                discount_amount:
                    discountAmount,

                final_amount:
                    finalSignupFee

            },

            tenant: {

                type:
                    useExistingTenant
                        ? "existing"
                        : "new"

            }

        };


        const settingsJson =
            JSON.stringify(
                settingsData
            );


        /* =================================================
           INSERT USER
        ================================================= */

        const [
            userResult
        ] = await connection.execute(`

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
                NULL,
                ?
            )

        `, [

            companyId,
            username,
            password,
            name,
            email,
            mobile,
            userPackageId,
            clientType,
            settingsJson,
            companyName,
            name,
            mobile,
            address,
            nid,
            name

        ]);


        const userId =
            Number(userResult.insertId);


        if (userId <= 0) {

            throw new Error(
                "Registration failed: invalid user ID."
            );
        }


        /* =================================================
           NEW TENANT
        ================================================= */

        if (!useExistingTenant) {

            companyId =
                userId;

            await connection.execute(`

                UPDATE users

                SET company_id = ?

                WHERE id = ?

                LIMIT 1

            `, [
                companyId,
                userId
            ]);
        }


        /* =================================================
           CUSTOMER ID
        ================================================= */

        const customerId =
            "ISP-" +
            (
                10000 +
                userId
            );


        const [
            customerUpdate
        ] = await connection.execute(`

            UPDATE users

            SET customer_id = ?

            WHERE id = ?

            AND company_id = ?

            LIMIT 1

        `, [
            customerId,
            userId,
            companyId
        ]);


        if (
            customerUpdate.affectedRows !== 1
        ) {

            throw new Error(
                "Customer ID update failed."
            );
        }


        /* =================================================
           SOFTWARE BILLING
        ================================================= */

        const [
            billingResult
        ] = await connection.execute(`

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
                ?,
                ?,
                ?,
                NULL,
                NULL,
                ?,
                'unpaid',
                NOW()
            )

        `, [

            companyId,
            userId,
            "registration",
            userPackageId,
            packageCode,
            finalSignupFee

        ]);


        const registrationBillId =
            Number(
                billingResult.insertId
            );


        if (registrationBillId <= 0) {

            throw new Error(
                "Registration bill ID was not generated."
            );
        }


        /* =================================================
           INVOICE
        ================================================= */

        const [
            invoiceResult
        ] = await connection.execute(`

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
                ?,
                ?,
                ?,
                'unpaid',
                NOW(),
                NOW()
            )

        `, [

            companyId,
            userId,
            "registration",
            "registration_fee",
            finalSignupFee

        ]);


        const registrationInvoiceId =
            Number(
                invoiceResult.insertId
            );


        if (registrationInvoiceId <= 0) {

            throw new Error(
                "Registration invoice ID was not generated."
            );
        }


        /* =================================================
           FINAL TENANT CHECK
        ================================================= */

        const [
            verifyRows
        ] = await connection.execute(`

            SELECT
                id,
                company_id

            FROM users

            WHERE id = ?

            AND company_id = ?

            LIMIT 1

        `, [
            userId,
            companyId
        ]);


        if (verifyRows.length !== 1) {

            throw new Error(
                "Tenant verification failed."
            );
        }


        /* =================================================
           COMMIT
        ================================================= */

        await connection.commit();


        /* =================================================
           NEW CSRF
        ================================================= */

        const newCsrf =
            rotateCsrf(req);


        /* =================================================
           SUCCESS
        ================================================= */

        return res.json({

            success: true,

            message:
                `Registration successful. Your ID: ${customerId}`,

            customer_id:
                customerId,

            user_id:
                userId,

            company_id:
                companyId,

            csrf_token:
                newCsrf

        });


    } catch (error) {

        if (connection) {

            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    "REGISTER ROLLBACK ERROR:",
                    rollbackError
                );
            }
        }


        console.error(
            "REGISTER ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Registration failed: " +
                error.message,

            csrf_token:
                getCsrf(req)

        });


    } finally {

        if (connection) {
            connection.release();
        }
    }

});


module.exports = router;