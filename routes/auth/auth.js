"use strict";

const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const db = require("../../config/database");

const router = express.Router();


/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 300; // 5 minutes

const ALLOWED_ROLES = [
    "super_admin",
    "admin",
    "manager",
    "collector",
    "staff",
    "employee",
    "reseller"
];


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function normalizeLoginUsername(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}


function getClientIp(req) {

    return (
        req.ip ||
        req.socket?.remoteAddress ||
        req.connection?.remoteAddress ||
        ""
    ).toString().slice(0, 100);

}


function isHttps(req) {

    if (req.secure) {
        return true;
    }

    const forwardedProto =
        req.headers["x-forwarded-proto"];

    if (
        typeof forwardedProto === "string" &&
        forwardedProto.split(",")[0].trim().toLowerCase() === "https"
    ) {
        return true;
    }

    return false;
}


function safeTimingEqual(a, b) {

    const aa = Buffer.from(String(a || ""));
    const bb = Buffer.from(String(b || ""));

    if (aa.length !== bb.length) {
        return false;
    }

    return crypto.timingSafeEqual(aa, bb);

}


/*
|--------------------------------------------------------------------------
| CSRF
|--------------------------------------------------------------------------
*/

function generateCsrfToken() {

    return crypto.randomBytes(32).toString("hex");

}


function ensureCsrfToken(req) {

    if (!req.session.csrf_token) {
        req.session.csrf_token =
            generateCsrfToken();
    }

    return req.session.csrf_token;

}


function verifyCsrf(req) {

    const sessionToken =
        req.session?.csrf_token || "";

    const requestToken =
        req.body?.csrf_token ||
        req.headers["x-csrf-token"] ||
        "";

    return safeTimingEqual(
        sessionToken,
        requestToken
    );

}


/*
|--------------------------------------------------------------------------
| DATABASE PERSISTENT LOGIN RATE LIMIT
|--------------------------------------------------------------------------
|
| Username-based protection.
|
| 5 failed attempts
|      ↓
| 5 minute lock
|
| Browser/session/IP change করলেও lock থাকবে।
|
|--------------------------------------------------------------------------
*/


async function getLoginRateLimitStatus(username) {

    const normalizedUsername =
        normalizeLoginUsername(username);

    if (!normalizedUsername) {
        return {
            locked: false,
            remainingSeconds: 0,
            failedAttempts: 0
        };
    }


    const [rows] = await db.execute(
        `
        SELECT
            failed_attempts,
            locked_until
        FROM login_attempts
        WHERE username = ?
        LIMIT 1
        `,
        [normalizedUsername]
    );


    if (!rows.length) {

        return {
            locked: false,
            remainingSeconds: 0,
            failedAttempts: 0
        };

    }


    const row = rows[0];

    if (!row.locked_until) {

        return {
            locked: false,
            remainingSeconds: 0,
            failedAttempts:
                Number(row.failed_attempts || 0)
        };

    }


    const lockedUntil =
        new Date(row.locked_until);

    const now =
        new Date();

    const remainingMs =
        lockedUntil.getTime() -
        now.getTime();


    if (remainingMs <= 0) {

        /*
        |--------------------------------------------------------------------------
        | Lock expired
        |--------------------------------------------------------------------------
        */

        await db.execute(
            `
            UPDATE login_attempts
            SET
                failed_attempts = 0,
                first_failed_at = NULL,
                locked_until = NULL
            WHERE username = ?
            `,
            [normalizedUsername]
        );


        return {
            locked: false,
            remainingSeconds: 0,
            failedAttempts: 0
        };

    }


    return {
        locked: true,
        remainingSeconds:
            Math.ceil(remainingMs / 1000),
        failedAttempts:
            Number(row.failed_attempts || 0)
    };

}


/*
|--------------------------------------------------------------------------
| REGISTER FAILED LOGIN
|--------------------------------------------------------------------------
|
| Transaction + row locking ব্যবহার করা হয়েছে যাতে
| একই সময়ে একাধিক failed request এ counter ভুল না হয়।
|
|--------------------------------------------------------------------------
*/

async function registerFailedLogin(
    username,
    ip
) {

    const normalizedUsername =
        normalizeLoginUsername(username);

    if (!normalizedUsername) {

        return {
            locked: false,
            remainingSeconds: 0,
            failedAttempts: 0
        };

    }


    const connection =
        await db.getConnection();


    try {

        await connection.beginTransaction();


        const [rows] =
            await connection.execute(
                `
                SELECT
                    id,
                    failed_attempts,
                    first_failed_at,
                    locked_until
                FROM login_attempts
                WHERE username = ?
                LIMIT 1
                FOR UPDATE
                `,
                [normalizedUsername]
            );


        const now =
            new Date();


        let failedAttempts = 0;


        /*
        |--------------------------------------------------------------------------
        | Existing row
        |--------------------------------------------------------------------------
        */

        if (rows.length) {

            const row = rows[0];


            /*
            |--------------------------------------------------------------------------
            | Existing lock still active
            |--------------------------------------------------------------------------
            */

            if (row.locked_until) {

                const lockedUntil =
                    new Date(row.locked_until);

                const remainingMs =
                    lockedUntil.getTime() -
                    now.getTime();


                if (remainingMs > 0) {

                    await connection.commit();

                    return {
                        locked: true,
                        remainingSeconds:
                            Math.ceil(
                                remainingMs / 1000
                            ),
                        failedAttempts:
                            Number(
                                row.failed_attempts || 0
                            )
                    };

                }

            }


            /*
            |--------------------------------------------------------------------------
            | Lock expired
            |--------------------------------------------------------------------------
            */

            if (
                row.locked_until &&
                new Date(row.locked_until).getTime() <=
                    now.getTime()
            ) {

                failedAttempts = 0;

            } else {

                failedAttempts =
                    Number(
                        row.failed_attempts || 0
                    );

            }


            failedAttempts += 1;


            /*
            |--------------------------------------------------------------------------
            | Lock after MAX attempts
            |--------------------------------------------------------------------------
            */

            if (
                failedAttempts >=
                MAX_LOGIN_ATTEMPTS
            ) {

                const lockedUntil =
                    new Date(
                        now.getTime() +
                        LOCKOUT_SECONDS * 1000
                    );


                await connection.execute(
                    `
                    UPDATE login_attempts
                    SET
                        failed_attempts = ?,
                        first_failed_at = COALESCE(
                            first_failed_at,
                            ?
                        ),
                        locked_until = ?,
                        last_ip = ?
                    WHERE username = ?
                    `,
                    [
                        failedAttempts,
                        now,
                        lockedUntil,
                        ip,
                        normalizedUsername
                    ]
                );


                await connection.commit();


                return {
                    locked: true,
                    remainingSeconds:
                        LOCKOUT_SECONDS,
                    failedAttempts
                };

            }


            /*
            |--------------------------------------------------------------------------
            | Update failed count
            |--------------------------------------------------------------------------
            */

            await connection.execute(
                `
                UPDATE login_attempts
                SET
                    failed_attempts = ?,
                    first_failed_at = COALESCE(
                        first_failed_at,
                        ?
                    ),
                    locked_until = NULL,
                    last_ip = ?
                WHERE username = ?
                `,
                [
                    failedAttempts,
                    now,
                    ip,
                    normalizedUsername
                ]
            );

        }


        /*
        |--------------------------------------------------------------------------
        | New username
        |--------------------------------------------------------------------------
        */

        else {

            failedAttempts = 1;


            await connection.execute(
                `
                INSERT INTO login_attempts (
                    username,
                    failed_attempts,
                    first_failed_at,
                    locked_until,
                    last_ip
                )
                VALUES (?, ?, ?, NULL, ?)
                `,
                [
                    normalizedUsername,
                    failedAttempts,
                    now,
                    ip
                ]
            );

        }


        await connection.commit();


        return {
            locked: false,
            remainingSeconds: 0,
            failedAttempts
        };


    } catch (error) {

        await connection.rollback();

        throw error;

    } finally {

        connection.release();

    }

}


/*
|--------------------------------------------------------------------------
| CLEAR FAILED LOGINS
|--------------------------------------------------------------------------
*/

async function clearFailedLogins(username) {

    const normalizedUsername =
        normalizeLoginUsername(username);

    if (!normalizedUsername) {
        return;
    }


    await db.execute(
        `
        DELETE FROM login_attempts
        WHERE username = ?
        `,
        [normalizedUsername]
    );

}


/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

router.post("/login", async (req, res) => {

    try {

        /*
        |--------------------------------------------------------------------------
        | CSRF
        |--------------------------------------------------------------------------
        */

        if (!verifyCsrf(req)) {

            return res.status(403).json({
                success: false,
                message:
                    "Invalid security token. Please refresh the page and try again."
            });

        }


        const username =
            normalizeLoginUsername(
                req.body.username
            );

        const password =
            String(
                req.body.password || ""
            );


        if (!username || !password) {

            return res.status(400).json({
                success: false,
                message:
                    "Username and password are required."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | Persistent username lock check
        |--------------------------------------------------------------------------
        */

        const rateLimitStatus =
            await getLoginRateLimitStatus(
                username
            );


        if (rateLimitStatus.locked) {

            return res.status(429).json({
                success: false,
                message:
                    `Too many failed login attempts. Please try again in ${rateLimitStatus.remainingSeconds} seconds.`
            });

        }


        /*
        |--------------------------------------------------------------------------
        | Existing session-level protection
        |--------------------------------------------------------------------------
        */

        const sessionAttempts =
            Number(
                req.session.login_attempts || 0
            );

        const sessionLockedUntil =
            Number(
                req.session.login_locked_until || 0
            );


        if (
            sessionLockedUntil &&
            Date.now() <
            sessionLockedUntil
        ) {

            const remaining =
                Math.ceil(
                    (
                        sessionLockedUntil -
                        Date.now()
                    ) / 1000
                );


            return res.status(429).json({
                success: false,
                message:
                    `Too many failed login attempts. Please try again in ${remaining} seconds.`
            });

        }


        /*
        |--------------------------------------------------------------------------
        | Find users
        |--------------------------------------------------------------------------
        */

        const [users] =
            await db.execute(
                `
                SELECT *
                FROM users
                WHERE LOWER(username) = ?
                `,
                [username]
            );


        let matchedUser = null;


        /*
        |--------------------------------------------------------------------------
        | Password verification
        |--------------------------------------------------------------------------
        */

        for (const user of users) {

            let passwordMatched = false;

            try {

                passwordMatched =
                    await bcrypt.compare(
                        password,
                        user.password
                    );

            } catch (error) {

                passwordMatched = false;

            }


            if (passwordMatched) {

                matchedUser = user;

                break;

            }

        }


        /*
        |--------------------------------------------------------------------------
        | Invalid username/password
        |--------------------------------------------------------------------------
        */

        if (!matchedUser) {

            /*
            |--------------------------------------------------------------------------
            | Session protection
            |--------------------------------------------------------------------------
            */

            req.session.login_attempts =
                sessionAttempts + 1;


            if (
                req.session.login_attempts >=
                MAX_LOGIN_ATTEMPTS
            ) {

                req.session.login_locked_until =
                    Date.now() +
                    LOCKOUT_SECONDS * 1000;

            }


            /*
            |--------------------------------------------------------------------------
            | Persistent DB protection
            |--------------------------------------------------------------------------
            */

            const failedLogin =
                await registerFailedLogin(
                    username,
                    getClientIp(req)
                );


            if (failedLogin.locked) {

                return res.status(429).json({
                    success: false,
                    message:
                        "Too many failed login attempts. Your username has been temporarily locked for 5 minutes."
                });

            }


            /*
            |--------------------------------------------------------------------------
            | Generic error message
            |--------------------------------------------------------------------------
            */

            return res.status(401).json({
                success: false,
                message:
                    "Invalid username or password."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | Account status
        |--------------------------------------------------------------------------
        */

        if (
            matchedUser.status !==
            "active"
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Your account is not active."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | Role validation
        |--------------------------------------------------------------------------
        */

        if (
            !ALLOWED_ROLES.includes(
                matchedUser.role
            )
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Your account role is not allowed to login."
            });

        }


        /*
        |--------------------------------------------------------------------------
        | Company validation
        |--------------------------------------------------------------------------
        */

        if (
            matchedUser.role !==
            "super_admin"
        ) {

            if (
                Number(
                    matchedUser.company_id
                ) <= 0
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Your account is not assigned to a valid company."
                });

            }

        }


        /*
        |--------------------------------------------------------------------------
        | Successful login
        |--------------------------------------------------------------------------
        */

        await clearFailedLogins(
            username
        );


        /*
        |--------------------------------------------------------------------------
        | Reset session login limiter
        |--------------------------------------------------------------------------
        */

        req.session.login_attempts = 0;
        req.session.login_locked_until = 0;


        /*
        |--------------------------------------------------------------------------
        | Password rehash
        |--------------------------------------------------------------------------
        */

        try {

            const rounds =
                bcrypt.getRounds(
                    matchedUser.password
                );


            if (rounds < 12) {

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
                    `,
                    [
                        newHash,
                        matchedUser.id
                    ]
                );

            }

        } catch (error) {

            /*
            |--------------------------------------------------------------------------
            | Rehash failure should not block a valid login.
            |--------------------------------------------------------------------------
            */

            console.error(
                "Password rehash error:",
                error
            );

        }


        /*
        |--------------------------------------------------------------------------
        | Update last login
        |--------------------------------------------------------------------------
        */

        await db.execute(
            `
            UPDATE users
            SET last_login = NOW()
            WHERE id = ?
            `,
            [matchedUser.id]
        );


        /*
        |--------------------------------------------------------------------------
        | Regenerate session
        |--------------------------------------------------------------------------
        */

        await new Promise(
            (resolve, reject) => {

                req.session.regenerate(
                    (error) => {

                        if (error) {
                            reject(error);
                            return;
                        }

                        resolve();

                    }
                );

            }
        );


        /*
        |--------------------------------------------------------------------------
        | Session data
        |--------------------------------------------------------------------------
        */

        req.session.user_id =
            matchedUser.id;

        req.session.username =
            matchedUser.username;

        req.session.fullname =
            matchedUser.fullname;

        req.session.role =
            matchedUser.role;

        req.session.company_id =
            matchedUser.company_id;

        req.session.client_type =
            matchedUser.client_type;

        req.session.customer_id =
            matchedUser.customer_id;


        /*
        |--------------------------------------------------------------------------
        | New CSRF token after session regeneration
        |--------------------------------------------------------------------------
        */

        req.session.csrf_token =
            generateCsrfToken();


        /*
        |--------------------------------------------------------------------------
        | Remember Me
        |--------------------------------------------------------------------------
        */

        const rememberMe =
            req.body.remember_me === true ||
            req.body.remember_me === "true" ||
            req.body.remember_me === "1" ||
            req.body.remember_me === 1 ||
            req.body.remember_me === "on";


        if (rememberMe) {

            const rememberSecret =
                process.env.REMEMBER_ME_SECRET;


            if (!rememberSecret) {

                throw new Error(
                    "REMEMBER_ME_SECRET is not configured."
                );

            }


            const tokenData =
                `${matchedUser.id}:${Date.now()}:${crypto.randomBytes(32).toString("hex")}`;


            const token =
                crypto
                    .createHmac(
                        "sha256",
                        rememberSecret
                    )
                    .update(tokenData)
                    .digest("hex");


            const rememberToken =
                `${Buffer
                    .from(tokenData)
                    .toString("base64url")}.${token}`;


            const tokenHash =
                crypto
                    .createHash("sha256")
                    .update(rememberToken)
                    .digest("hex");


            const expiresAt =
                new Date(
                    Date.now() +
                    30 * 24 * 60 * 60 * 1000
                );


            /*
            |--------------------------------------------------------------------------
            | Remember token table
            |--------------------------------------------------------------------------
            */

            try {

                await db.execute(
                    `
                    INSERT INTO user_remember_tokens (
                        user_id,
                        token_hash,
                        expires_at
                    )
                    VALUES (?, ?, ?)
                    `,
                    [
                        matchedUser.id,
                        tokenHash,
                        expiresAt
                    ]
                );


                res.cookie(
                    "ispbilling_remember",
                    rememberToken,
                    {
                        httpOnly: true,
                        secure: isHttps(req),
                        sameSite: "lax",
                        maxAge:
                            30 *
                            24 *
                            60 *
                            60 *
                            1000,
                        path: "/"
                    }
                );

            } catch (error) {

                console.error(
                    "Remember token error:",
                    error
                );

            }

        }


        /*
        |--------------------------------------------------------------------------
        | Username cookie
        |--------------------------------------------------------------------------
        */

        res.cookie(
            "ispbilling_username",
            matchedUser.username,
            {
                httpOnly: false,
                secure: isHttps(req),
                sameSite: "lax",
                maxAge:
                    30 *
                    24 *
                    60 *
                    60 *
                    1000,
                path: "/"
            }
        );


        /*
        |--------------------------------------------------------------------------
        | Login response
        |--------------------------------------------------------------------------
        */

        return res.json({
            success: true,
            message: "Login successful.",
            csrf_token:
                req.session.csrf_token,
            user: {
                id: matchedUser.id,
                username:
                    matchedUser.username,
                fullname:
                    matchedUser.fullname,
                role:
                    matchedUser.role,
                company_id:
                    matchedUser.company_id,
                client_type:
                    matchedUser.client_type,
                customer_id:
                    matchedUser.customer_id
            }
        });


    } catch (error) {

        console.error(
            "Login error:",
            error
        );


        return res.status(500).json({
            success: false,
            message:
                "An unexpected server error occurred. Please try again later."
        });

    }

});


/*
|--------------------------------------------------------------------------
| CSRF TOKEN
|--------------------------------------------------------------------------
*/

router.get("/csrf", (req, res) => {

    try {

        const token =
            ensureCsrfToken(req);


        return res.json({
            success: true,
            csrf_token: token
        });

    } catch (error) {

        console.error(
            "CSRF error:",
            error
        );


        return res.status(500).json({
            success: false,
            message:
                "Unable to generate security token."
        });

    }

});


/*
|--------------------------------------------------------------------------
| CURRENT USER
|--------------------------------------------------------------------------
*/

router.get("/me", async (req, res) => {

    try {

        if (!req.session.user_id) {

            return res.status(401).json({
                success: false,
                message: "Not authenticated."
            });

        }


        const [rows] =
            await db.execute(
                `
                SELECT
                    id,
                    company_id,
                    username,
                    fullname,
                    email,
                    mobile,
                    role,
                    status,
                    package_id,
                    client_type,
                    customer_id,
                    company_name,
                    owner_name,
                    phone,
                    address
                FROM users
                WHERE id = ?
                LIMIT 1
                `,
                [req.session.user_id]
            );


        if (!rows.length) {

            return res.status(401).json({
                success: false,
                message: "User not found."
            });

        }


        const user = rows[0];


        return res.json({
            success: true,
            user
        });


    } catch (error) {

        console.error(
            "Current user error:",
            error
        );


        return res.status(500).json({
            success: false,
            message:
                "Unable to load current user."
        });

    }

});


/*
|--------------------------------------------------------------------------
| MY PERMISSIONS
|--------------------------------------------------------------------------
*/

router.get("/permissions", async (req, res) => {

    try {

        if (!req.session.user_id) {

            return res.status(401).json({
                success: false,
                message: "Not authenticated."
            });

        }

        const [rows] = await db.execute(
            `
            SELECT permission_key
            FROM user_permissions
            WHERE user_id = ?
              AND allowed = 1
            `,
            [req.session.user_id]
        );

        return res.json({
            success: true,
            role: req.session.role,
            permissions: rows.map((r) => r.permission_key)
        });

    } catch (error) {

        console.error("My permissions error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load permissions."
        });

    }

});


/*
|--------------------------------------------------------------------------
| LOGOUT
|--------------------------------------------------------------------------
*/

router.post("/logout", async (req, res) => {

    try {

        /*
        |--------------------------------------------------------------------------
        | CSRF check
        |--------------------------------------------------------------------------
        */

        if (!verifyCsrf(req)) {

            return res.status(403).json({
                success: false,
                message:
                    "Invalid security token."
            });

        }


        const userId =
            req.session?.user_id;


        /*
        |--------------------------------------------------------------------------
        | Remove remember tokens
        |--------------------------------------------------------------------------
        */

        if (userId) {

            try {

                await db.execute(
                    `
                    DELETE FROM user_remember_tokens
                    WHERE user_id = ?
                    `,
                    [userId]
                );

            } catch (error) {

                console.error(
                    "Remember token cleanup error:",
                    error
                );

            }

        }


        /*
        |--------------------------------------------------------------------------
        | Destroy session
        |--------------------------------------------------------------------------
        */

        await new Promise(
            (resolve) => {

                req.session.destroy(
                    () => resolve()
                );

            }
        );


        /*
        |--------------------------------------------------------------------------
        | Clear cookies
        |--------------------------------------------------------------------------
        */

        res.clearCookie(
            "ispbilling.sid",
            {
                httpOnly: true,
                sameSite: "lax",
                secure: isHttps(req),
                path: "/"
            }
        );


        res.clearCookie(
            "ispbilling_remember",
            {
                httpOnly: true,
                sameSite: "lax",
                secure: isHttps(req),
                path: "/"
            }
        );


        return res.json({
            success: true,
            message: "Logout successful."
        });


    } catch (error) {

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

});


module.exports = router;