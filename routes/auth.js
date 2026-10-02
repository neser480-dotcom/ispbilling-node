"use strict";

const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const db = require("../config/database");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 300;

const REMEMBER_ME_SECRET =
    process.env.REMEMBER_ME_SECRET ||
    "CHANGE-THIS-TO-A-LONG-RANDOM-SECRET-CHANGE-ME";

const ALLOWED_ROLES = [
    "super_admin",
    "admin",
    "manager",
    "collector",
    "staff",
    "reseller"
];


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function createCsrfToken() {
    return crypto.randomBytes(32).toString("hex");
}


function verifyCsrf(sessionToken, postedToken) {

    if (
        typeof sessionToken !== "string" ||
        typeof postedToken !== "string" ||
        sessionToken.length === 0 ||
        postedToken.length === 0 ||
        sessionToken.length !== postedToken.length
    ) {
        return false;
    }

    return crypto.timingSafeEqual(
        Buffer.from(sessionToken),
        Buffer.from(postedToken)
    );
}


function isHttps(req) {

    if (req.secure) {
        return true;
    }

    if (
        req.headers &&
        req.headers["x-forwarded-proto"] === "https"
    ) {
        return true;
    }

    return false;
}


/*
|--------------------------------------------------------------------------
| CSRF
|--------------------------------------------------------------------------
| Login page uses this endpoint to obtain the current session CSRF token.
|--------------------------------------------------------------------------
*/

router.get("/csrf", (req, res) => {

    if (!req.session.csrf_token) {
        req.session.csrf_token =
            createCsrfToken();
    }

    res.json({
        success: true,
        csrf_token:
            req.session.csrf_token
    });
});


/*
|--------------------------------------------------------------------------
| REMEMBERED LOGIN DATA
|--------------------------------------------------------------------------
| Browser cannot read HttpOnly cookies.
| Therefore frontend asks the server for the remembered username.
|--------------------------------------------------------------------------
*/

router.get("/remembered", (req, res) => {

    const username =
        req.cookies?.remember_username || "";

    res.json({
        success: true,
        username
    });
});


/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

router.post("/login", async (req, res) => {

    try {

        /*
        |--------------------------------------------------------------------------
        | SESSION DEFAULTS
        |--------------------------------------------------------------------------
        */

        if (
            typeof req.session.login_attempts !== "number"
        ) {
            req.session.login_attempts = 0;
        }

        if (
            typeof req.session.lockout_until !== "number"
        ) {
            req.session.lockout_until = 0;
        }

        if (!req.session.csrf_token) {
            req.session.csrf_token =
                createCsrfToken();
        }


        /*
        |--------------------------------------------------------------------------
        | CSRF
        |--------------------------------------------------------------------------
        */

        const postedCsrf =
            typeof req.body.csrf_token === "string"
                ? req.body.csrf_token
                : "";

        if (
            !verifyCsrf(
                req.session.csrf_token,
                postedCsrf
            )
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "Invalid request. Please refresh the page and try again.",

                csrf_token:
                    req.session.csrf_token
            });
        }


        /*
        |--------------------------------------------------------------------------
        | LOCKOUT
        |--------------------------------------------------------------------------
        */

        const now =
            Math.floor(Date.now() / 1000);

        const lockoutUntil =
            Number(
                req.session.lockout_until || 0
            );

        if (now < lockoutUntil) {

            const wait = Math.max(
                1,
                Math.ceil(
                    (lockoutUntil - now) / 60
                )
            );

            return res.status(429).json({

                success: false,

                message:
                    `Too many failed attempts. Please try again in ${wait} minute(s).`,

                locked: true,

                lockout_until:
                    lockoutUntil,

                csrf_token:
                    req.session.csrf_token
            });
        }


        /*
        |--------------------------------------------------------------------------
        | INPUT
        |--------------------------------------------------------------------------
        */

        const username =
            String(
                req.body.username || ""
            ).trim();

        const password =
            typeof req.body.password === "string"
                ? req.body.password
                : "";


        /*
        |--------------------------------------------------------------------------
        | BASIC VALIDATION
        |--------------------------------------------------------------------------
        */

        if (
            username === "" ||
            password === ""
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Please enter username and password.",

                csrf_token:
                    req.session.csrf_token
            });
        }


        /*
        |--------------------------------------------------------------------------
        | FIND ALL USERS WITH SAME USERNAME
        |--------------------------------------------------------------------------
        |
        | Same username may exist in different companies.
        |--------------------------------------------------------------------------
        */

        const [rows] =
            await db.execute(
                `
                SELECT
                    id,
                    company_id,
                    username,
                    password,
                    fullname,
                    email,
                    mobile,
                    role,
                    status,
                    customer_id,
                    package_id,
                    client_type
                FROM users
                WHERE username = ?
                ORDER BY id ASC
                `,
                [
                    username
                ]
            );


        /*
        |--------------------------------------------------------------------------
        | FIND PASSWORD MATCH
        |--------------------------------------------------------------------------
        */

        let user = null;

        for (const row of rows) {

            if (
                row.password &&
                await verifyPassword(
                    password,
                    row.password
                )
            ) {

                user = row;

                break;
            }
        }


        /*
        |--------------------------------------------------------------------------
        | LOGIN SUCCESS CANDIDATE
        |--------------------------------------------------------------------------
        */

        if (user) {

            /*
            |--------------------------------------------------------------------------
            | STATUS CHECK
            |--------------------------------------------------------------------------
            */

            const userStatus =
                String(
                    user.status || ""
                )
                    .trim()
                    .toLowerCase();

            if (userStatus !== "active") {

                return res.status(403).json({

                    success: false,

                    message:
                        "Your account is inactive. Please contact administrator.",

                    csrf_token:
                        req.session.csrf_token
                });
            }


            /*
            |--------------------------------------------------------------------------
            | ROLE VALIDATION
            |--------------------------------------------------------------------------
            */

            const role =
                String(
                    user.role || ""
                )
                    .trim()
                    .toLowerCase();

            if (
                !ALLOWED_ROLES.includes(role)
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "Your account role is not configured correctly.",

                    csrf_token:
                        req.session.csrf_token
                });
            }


            /*
            |--------------------------------------------------------------------------
            | COMPANY VALIDATION
            |--------------------------------------------------------------------------
            */

            let sessionCompanyId = 0;

            if (role === "super_admin") {

                /*
                | Super admin works across all companies.
                */

                sessionCompanyId = 0;

            } else {

                sessionCompanyId =
                    Number(
                        user.company_id || 0
                    );

                if (
                    sessionCompanyId <= 0
                ) {

                    return res.status(403).json({

                        success: false,

                        message:
                            "Your account is not assigned to a company. Please contact administrator.",

                        csrf_token:
                            req.session.csrf_token
                    });
                }
            }


            /*
            |--------------------------------------------------------------------------
            | RESET LOGIN ATTEMPTS
            |--------------------------------------------------------------------------
            */

            req.session.login_attempts = 0;
            req.session.lockout_until = 0;


            /*
            |--------------------------------------------------------------------------
            | SESSION FIXATION PROTECTION
            |--------------------------------------------------------------------------
            */

            await regenerateSession(req);


            /*
            |--------------------------------------------------------------------------
            | USER SESSION
            |--------------------------------------------------------------------------
            */

            req.session.user_id =
                Number(user.id);

            req.session.username =
                user.username || "";

            req.session.fullname =
                user.fullname || "";

            req.session.email =
                user.email || "";

            req.session.mobile =
                user.mobile || "";

            req.session.role =
                role;


            /*
            |--------------------------------------------------------------------------
            | COMPANY SESSION
            |--------------------------------------------------------------------------
            */

            req.session.company_id =
                sessionCompanyId;


            if (
                role === "super_admin"
            ) {

                req.session.company_scope =
                    "ALL";

                req.session.is_super_admin =
                    true;

            } else {

                req.session.company_scope =
                    sessionCompanyId;

                req.session.is_super_admin =
                    false;
            }


            /*
            |--------------------------------------------------------------------------
            | CUSTOMER / PACKAGE DATA
            |--------------------------------------------------------------------------
            */

            req.session.customer_id =
                user.customer_id || "";

            req.session.package_id =
                Number(
                    user.package_id || 0
                );

            req.session.client_type =
                user.client_type || "";


            /*
            |--------------------------------------------------------------------------
            | PASSWORD REHASH
            |--------------------------------------------------------------------------
            */

            try {

                if (
                    user.password &&
                    isBcryptHash(
                        user.password
                    ) &&
                    await bcrypt.compare(
                        password,
                        normalizeBcryptHash(
                            user.password
                        )
                    )
                ) {

                    const needsRehash =
                        bcrypt.getRounds(
                            normalizeBcryptHash(
                                user.password
                            )
                        ) < 12;

                    if (needsRehash) {

                        const newHash =
                            await bcrypt.hash(
                                password,
                                12
                            );

                        await db.execute(
                            `
                            UPDATE users
                            SET password = ?
                            WHERE id = ?
                            LIMIT 1
                            `,
                            [
                                newHash,
                                user.id
                            ]
                        );
                    }
                }

            } catch (rehashError) {

                console.error(
                    "Password rehash error:",
                    rehashError
                );
            }


            /*
            |--------------------------------------------------------------------------
            | LAST LOGIN
            |--------------------------------------------------------------------------
            */

            try {

                await db.execute(
                    `
                    UPDATE users
                    SET last_login = NOW()
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [
                        user.id
                    ]
                );

            } catch (lastLoginError) {

                console.error(
                    "Last login update error:",
                    lastLoginError
                );
            }


            /*
            |--------------------------------------------------------------------------
            | REMEMBER ME
            |--------------------------------------------------------------------------
            */

            const isRemember =
                String(
                    req.body.remember || ""
                ) === "1";

            const secureCookie =
                isHttps(req);


            /*
            |--------------------------------------------------------------------------
            | USERNAME ALWAYS REMEMBERED
            |--------------------------------------------------------------------------
            */

            res.cookie(
                "remember_username",
                String(
                    user.username || ""
                ),
                {
                    maxAge:
                        365 *
                        24 *
                        60 *
                        60 *
                        1000,

                    httpOnly: true,

                    secure:
                        secureCookie,

                    sameSite: "lax",

                    path: "/"
                }
            );


            /*
            |--------------------------------------------------------------------------
            | REMEMBER PASSWORD
            |--------------------------------------------------------------------------
            */

            if (isRemember) {

                const encrypted =
                    encryptRememberPassword(
                        password
                    );

                if (encrypted) {

                    res.cookie(
                        "remember_password",
                        encrypted,
                        {
                            maxAge:
                                365 *
                                24 *
                                60 *
                                60 *
                                1000,

                            httpOnly: true,

                            secure:
                                secureCookie,

                            sameSite: "lax",

                            path: "/"
                        }
                    );
                }

            } else {

                res.clearCookie(
                    "remember_password",
                    {
                        httpOnly: true,

                        secure:
                            secureCookie,

                        sameSite: "lax",

                        path: "/"
                    }
                );
            }


            /*
            |--------------------------------------------------------------------------
            | REMOVE OLD REMEMBER COOKIE
            |--------------------------------------------------------------------------
            */

            res.clearCookie(
                "remember_user",
                {
                    httpOnly: true,

                    secure:
                        secureCookie,

                    sameSite: "lax",

                    path: "/"
                }
            );


            /*
            |--------------------------------------------------------------------------
            | NEW CSRF TOKEN
            |--------------------------------------------------------------------------
            */

            req.session.csrf_token =
                createCsrfToken();


            /*
            |--------------------------------------------------------------------------
            | SAVE SESSION
            |--------------------------------------------------------------------------
            */

            await saveSession(req);


            /*
            |--------------------------------------------------------------------------
            | LOGIN REDIRECT
            |--------------------------------------------------------------------------
            |
            | IMPORTANT:
            |
            | Login always enters Dashboard.
            |
            | Software billing trial/expiry is handled by
            | middleware/softwareBilling.js.
            |
            | This prevents unpaid billing from bypassing
            | the 3-hour registration trial.
            |--------------------------------------------------------------------------
            */

            const loginRedirect =
                "/dashboard";

            const billingRequired =
                false;


            /*
            |--------------------------------------------------------------------------
            | SUCCESS
            |--------------------------------------------------------------------------
            */

            return res.json({

                success: true,

                message:
                    "Login successful.",

                redirect:
                    loginRedirect,

                billing_required:
                    billingRequired,

                csrf_token:
                    req.session.csrf_token
            });
        }


        /*
        |--------------------------------------------------------------------------
        | LOGIN FAILED
        |--------------------------------------------------------------------------
        */

        req.session.login_attempts =
            Number(
                req.session.login_attempts || 0
            ) + 1;


        /*
        |--------------------------------------------------------------------------
        | LOCKOUT
        |--------------------------------------------------------------------------
        */

        if (
            req.session.login_attempts >=
            MAX_ATTEMPTS
        ) {

            req.session.lockout_until =
                Math.floor(
                    Date.now() / 1000
                ) +
                LOCKOUT_SECONDS;

            req.session.login_attempts = 0;


            await saveSession(req);


            return res.status(429).json({

                success: false,

                message:
                    "Too many failed attempts. Please try again in 5 minute(s).",

                locked: true,

                lockout_until:
                    req.session.lockout_until,

                csrf_token:
                    req.session.csrf_token
            });
        }


        /*
        |--------------------------------------------------------------------------
        | NORMAL FAILED LOGIN
        |--------------------------------------------------------------------------
        */

        await saveSession(req);


        return res.status(401).json({

            success: false,

            message:
                "Invalid username or password.",

            csrf_token:
                req.session.csrf_token
        });

    } catch (error) {

        console.error(
            "Login error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to process login. Please try again later.",

            csrf_token:
                req.session?.csrf_token || ""
        });
    }
});


/*
|--------------------------------------------------------------------------
| LOGOUT
|--------------------------------------------------------------------------
*/

router.post("/logout", async (req, res) => {

    req.session.destroy((error) => {

        if (error) {

            console.error(
                "Logout error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to logout."
            });
        }

        res.clearCookie(
            "connect.sid"
        );

        res.clearCookie(
            "remember_password",
            {
                path: "/"
            }
        );

        res.json({

            success: true,

            message:
                "Logged out successfully.",

            redirect:
                "/"
        });
    });
});


/*
|--------------------------------------------------------------------------
| PASSWORD HELPERS
|--------------------------------------------------------------------------
*/

function isBcryptHash(hash) {

    return (
        typeof hash === "string" &&
        (
            hash.startsWith("$2a$") ||
            hash.startsWith("$2b$") ||
            hash.startsWith("$2y$")
        )
    );
}


function normalizeBcryptHash(hash) {

    if (
        typeof hash !== "string"
    ) {
        return hash;
    }

    /*
    | PHP password_hash() commonly creates $2y$.
    | Node bcrypt accepts $2b$.
    */

    if (
        hash.startsWith("$2y$")
    ) {

        return "$2b$" +
            hash.slice(4);
    }

    return hash;
}


async function verifyPassword(
    plainPassword,
    storedHash
) {

    if (
        !isBcryptHash(storedHash)
    ) {
        return false;
    }

    return bcrypt.compare(
        plainPassword,
        normalizeBcryptHash(
            storedHash
        )
    );
}


/*
|--------------------------------------------------------------------------
| REMEMBER PASSWORD ENCRYPTION
|--------------------------------------------------------------------------
| AES-256-GCM
|
| Stored value:
| IV + TAG + ENCRYPTED PASSWORD
|--------------------------------------------------------------------------
*/

function encryptRememberPassword(
    password
) {

    try {

        const key =
            crypto
                .createHash("sha256")
                .update(
                    REMEMBER_ME_SECRET
                )
                .digest();

        const iv =
            crypto.randomBytes(12);

        const cipher =
            crypto.createCipheriv(
                "aes-256-gcm",
                key,
                iv
            );

        const encrypted =
            Buffer.concat([
                cipher.update(
                    password,
                    "utf8"
                ),
                cipher.final()
            ]);

        const tag =
            cipher.getAuthTag();

        return Buffer.concat([
            iv,
            tag,
            encrypted
        ]).toString("base64");

    } catch (error) {

        console.error(
            "Remember password encryption error:",
            error
        );

        return null;
    }
}


/*
|--------------------------------------------------------------------------
| SESSION HELPERS
|--------------------------------------------------------------------------
*/

function regenerateSession(req) {

    return new Promise(
        (resolve, reject) => {

            req.session.regenerate(
                (error) => {

                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                }
            );
        }
    );
}


function saveSession(req) {

    return new Promise(
        (resolve, reject) => {

            req.session.save(
                (error) => {

                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                }
            );
        }
    );
}


module.exports = router;