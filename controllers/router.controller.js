"use strict";


const db =
    require("../config/database");

const mt =
    require("../services/mikrotik.service");


/*
|--------------------------------------------------------------------------
| AUTH USER
|--------------------------------------------------------------------------
*/

function getAuthUser(req) {

    const session =
        req.session || {};

    const user =
        req.user || {};


    const role =
        String(
            user.role ||
            session.role ||
            ""
        )
        .trim()
        .toLowerCase();


    const companyId =
        Number(
            user.company_id ??
            session.company_id ??
            0
        );


    const userId =
        Number(
            user.id ??
            user.user_id ??
            session.user_id ??
            0
        );


    return {

        id: userId,

        user_id: userId,

        username:
            user.username ||
            session.username ||
            "",

        fullname:
            user.fullname ||
            session.fullname ||
            "",

        email:
            user.email ||
            session.email ||
            "",

        mobile:
            user.mobile ||
            session.mobile ||
            "",

        role,

        company_id:
            companyId,

        is_super_admin:
            role === "super_admin",

        company_scope:
            session.company_scope ??
            companyId

    };
}


/*
|--------------------------------------------------------------------------
| QUERY HELPER
|--------------------------------------------------------------------------
*/

async function query(
    sql,
    params = []
) {

    const [
        rows
    ] =
        await db.execute(
            sql,
            params
        );

    return rows;
}


/*
|--------------------------------------------------------------------------
| GET ROUTER
|--------------------------------------------------------------------------
*/

async function getRouter(
    req,
    id
) {

    const user =
        getAuthUser(req);


    let sql = `
        SELECT
            id,
            company_id,
            name,
            ip,
            username,
            password,
            port,
            use_ssl,
            timeout
        FROM mikrotik_servers
        WHERE id = ?
    `;


    const params = [
        id
    ];


    if (
        !user.is_super_admin
    ) {

        sql += `
            AND company_id = ?
        `;

        params.push(
            user.company_id
        );
    }


    sql += `
        LIMIT 1
    `;


    const rows =
        await query(
            sql,
            params
        );


    return rows[0] || null;
}


/*
|--------------------------------------------------------------------------
| LIST
|--------------------------------------------------------------------------
*/

async function list(
    req,
    res
) {

    try {

        const user =
            getAuthUser(req);


        let sql = `
            SELECT
                id,
                company_id,
                name,
                ip,
                username,
                port,
                use_ssl,
                timeout
            FROM mikrotik_servers
        `;


        const params = [];


        if (
            !user.is_super_admin
        ) {

            if (
                user.company_id <= 0
            ) {

                return res.status(403).json({

                    status: false,

                    success: false,

                    message:
                        "Company access is not configured for this account."

                });
            }


            sql += `
                WHERE company_id = ?
            `;

            params.push(
                user.company_id
            );
        }


        sql += `
            ORDER BY id DESC
        `;


        const rows =
            await query(
                sql,
                params
            );


        return res.json({

            status: true,

            success: true,

            routers: rows,

            total:
                rows.length

        });

    } catch (error) {

        console.error(
            "Router list error:",
            error
        );


        return res.status(500).json({

            status: false,

            success: false,

            message:
                "Failed to load routers."

        });
    }
}


/*
|--------------------------------------------------------------------------
| CREATE
|--------------------------------------------------------------------------
*/

async function create(
    req,
    res
) {

    try {

        const user =
            getAuthUser(req);


        if (
            ![
                "super_admin",
                "admin",
                "manager"
            ].includes(user.role)
        ) {

            return res.status(403).json({

                status: false,

                success: false,

                message:
                    "You do not have permission to add routers."

            });
        }


        const {

            name = "",

            ip = "",

            username = "",

            password = "",

            port = 8728,

            use_ssl = 0,

            timeout = 3

        } =
            req.body || {};


        if (
            !String(name).trim() ||
            !String(ip).trim() ||
            !String(username).trim() ||
            !String(password)
        ) {

            return res.status(400).json({

                status: false,

                success: false,

                message:
                    "Router name, IP, username and password are required."

            });
        }


        const companyId =
            user.is_super_admin
                ? Number(
                    req.body.company_id ||
                    0
                )
                : user.company_id;


        if (
            !user.is_super_admin &&
            companyId <= 0
        ) {

            return res.status(403).json({

                status: false,

                success: false,

                message:
                    "Company access is not configured."

            });
        }


        if (
            user.is_super_admin &&
            companyId <= 0
        ) {

            return res.status(400).json({

                status: false,

                success: false,

                message:
                    "Company ID is required for Super Admin."

            });
        }


        const result =
            await query(
                `
                INSERT INTO mikrotik_servers
                (
                    company_id,
                    name,
                    ip,
                    username,
                    password,
                    port,
                    use_ssl,
                    timeout
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [

                    companyId,

                    String(name).trim(),

                    String(ip).trim(),

                    String(username).trim(),

                    String(password),

                    Number(port || 8728),

                    Number(use_ssl || 0),

                    Number(timeout || 3)

                ]
            );


        return res.json({

            status: true,

            success: true,

            message:
                "Router added successfully.",

            id:
                result.insertId

        });

    } catch (error) {

        console.error(
            "Router create error:",
            error
        );


        return res.status(500).json({

            status: false,

            success: false,

            message:
                "Failed to add router."

        });
    }
}


/*
|--------------------------------------------------------------------------
| UPDATE
|--------------------------------------------------------------------------
*/

async function update(
    req,
    res
) {

    try {

        const user =
            getAuthUser(req);


        if (
            ![
                "super_admin",
                "admin",
                "manager"
            ].includes(user.role)
        ) {

            return res.status(403).json({

                status: false,

                success: false,

                message:
                    "You do not have permission to edit routers."

            });
        }


        const id =
            Number(req.params.id);


        if (
            !Number.isInteger(id) ||
            id <= 0
        ) {

            return res.status(400).json({

                status: false,

                success: false,

                message:
                    "Invalid router ID."

            });
        }


        const router =
            await getRouter(
                req,
                id
            );


        if (!router) {

            return res.status(404).json({

                status: false,

                success: false,

                message:
                    "Router not found or access denied."

            });
        }


        const {

            name = "",

            ip = "",

            username = "",

            password = "",

            port = 8728,

            use_ssl = 0,

            timeout = 3

        } =
            req.body || {};


        if (
            !String(name).trim() ||
            !String(ip).trim() ||
            !String(username).trim()
        ) {

            return res.status(400).json({

                status: false,

                success: false,

                message:
                    "Router name, IP and username are required."

            });
        }


        if (
            String(password).length > 0
        ) {

            await query(
                `
                UPDATE mikrotik_servers
                SET
                    name = ?,
                    ip = ?,
                    username = ?,
                    password = ?,
                    port = ?,
                    use_ssl = ?,
                    timeout = ?
                WHERE id = ?
                `,
                [

                    String(name).trim(),

                    String(ip).trim(),

                    String(username).trim(),

                    String(password),

                    Number(port || 8728),

                    Number(use_ssl || 0),

                    Number(timeout || 3),

                    id

                ]
            );

        } else {

            await query(
                `
                UPDATE mikrotik_servers
                SET
                    name = ?,
                    ip = ?,
                    username = ?,
                    port = ?,
                    use_ssl = ?,
                    timeout = ?
                WHERE id = ?
                `,
                [

                    String(name).trim(),

                    String(ip).trim(),

                    String(username).trim(),

                    Number(port || 8728),

                    Number(use_ssl || 0),

                    Number(timeout || 3),

                    id

                ]
            );
        }


        return res.json({

            status: true,

            success: true,

            message:
                "Router updated successfully."

        });

    } catch (error) {

        console.error(
            "Router update error:",
            error
        );


        return res.status(500).json({

            status: false,

            success: false,

            message:
                "Failed to update router."

        });
    }
}


/*
|--------------------------------------------------------------------------
| DELETE
|--------------------------------------------------------------------------
*/

async function remove(
    req,
    res
) {

    try {

        const user =
            getAuthUser(req);


        if (
            ![
                "super_admin",
                "admin"
            ].includes(user.role)
        ) {

            return res.status(403).json({

                status: false,

                success: false,

                message:
                    "You do not have permission to delete routers."

            });
        }


        const id =
            Number(req.params.id);


        if (
            !Number.isInteger(id) ||
            id <= 0
        ) {

            return res.status(400).json({

                status: false,

                success: false,

                message:
                    "Invalid router ID."

            });
        }


        const router =
            await getRouter(
                req,
                id
            );


        if (!router) {

            return res.status(404).json({

                status: false,

                success: false,

                message:
                    "Router not found or access denied."

            });
        }


        await query(
            `
            DELETE FROM mikrotik_servers
            WHERE id = ?
            `,
            [id]
        );


        return res.json({

            status: true,

            success: true,

            message:
                "Router deleted successfully."

        });

    } catch (error) {

        console.error(
            "Router delete error:",
            error
        );


        return res.status(500).json({

            status: false,

            success: false,

            message:
                "Failed to delete router."

        });
    }
}


/*
|--------------------------------------------------------------------------
| CHECK CONNECTION
|--------------------------------------------------------------------------
*/

async function check(
    req,
    res
) {

    try {

        const id =
            Number(req.params.id);


        if (
            !Number.isInteger(id) ||
            id <= 0
        ) {

            return res.status(400).json({

                status: false,

                success: false,

                message:
                    "Invalid router ID."

            });
        }


        const router =
            await getRouter(
                req,
                id
            );


        if (!router) {

            return res.status(404).json({

                status: false,

                success: false,

                message:
                    "Router not found or access denied."

            });
        }


        const result =
            await mt.status(
                router
            );


        return res.json({

            status: true,

            success: true,

            router: {

                id:
                    router.id,

                name:
                    router.name,

                ip:
                    router.ip,

                username:
                    router.username,

                port:
                    router.port

            },

            identity:
                result.identity,

            resource:
                result.resource,

            pppoe_total:
                result.pppoe_total,

            active_total:
                result.active_total,

            profile_total:
                result.profile_total,

            checked_at:
                new Date().toISOString()

        });

    } catch (error) {

        console.error(
            "Router check error:",
            error
        );


        return res.json({

            status: false,

            success: false,

            message:
                error.message ||
                "MikroTik connection failed."

        });
    }
}


/*
|--------------------------------------------------------------------------
| HISTORY
|--------------------------------------------------------------------------
*/

async function history(
    req,
    res
) {

    try {

        const id =
            Number(req.params.id);


        const router =
            await getRouter(
                req,
                id
            );


        if (!router) {

            return res.status(404).json({

                status: false,

                success: false,

                message:
                    "Router not found or access denied."

            });
        }


        const result =
            await mt.status(
                router
            );


        const resource =
            result.resource || {};


        return res.json({

            status: true,

            success: true,

            router: {

                id:
                    router.id,

                name:
                    router.name,

                ip:
                    router.ip,

                username:
                    router.username,

                port:
                    router.port

            },

            identity:
                result.identity,

            resource,

            checked_at:
                new Date().toISOString()

        });

    } catch (error) {

        console.error(
            "Router history error:",
            error
        );


        return res.status(500).json({

            status: false,

            success: false,

            message:
                error.message ||
                "Unable to load router details."

        });
    }
}


/*
|--------------------------------------------------------------------------
| PACKAGES
|--------------------------------------------------------------------------
*/

async function packages(
    req,
    res
) {

    try {

        const id =
            Number(req.params.id);


        if (
            !Number.isInteger(id) ||
            id <= 0
        ) {

            return res.status(400).json({

                status: false,

                success: false,

                message:
                    "Invalid router ID."

            });
        }


        const router =
            await getRouter(
                req,
                id
            );


        if (!router) {

            return res.status(404).json({

                status: false,

                success: false,

                message:
                    "Router not found."

            });
        }


        /*
        |--------------------------------------------------------------------------
        | IMPORTANT
        |--------------------------------------------------------------------------
        | mikrotik_packages table DOES NOT have mikrotik_id.
        |
        | Existing schema:
        |
        | id
        | company_id
        | router_id
        | profile_id
        | package_name
        | price
        | alias_name
        | created_at
        | updated_at
        |
        */

        const rows =
            await query(
                `
                SELECT
                    id,
                    company_id,
                    router_id,
                    profile_id,
                    package_name,
                    alias_name,
                    price
                FROM mikrotik_packages
                WHERE router_id = ?
                AND company_id = ?
                ORDER BY id DESC
                `,
                [
                    id,
                    router.company_id
                ]
            );


        return res.json({

            status: true,

            success: true,

            packages: rows,

            total:
                rows.length

        });

    } catch (error) {

        console.error(
            "Router packages error:",
            error
        );


        return res.status(500).json({

            status: false,

            success: false,

            message:
                "Failed to load packages."

        });
    }
}


/*
|--------------------------------------------------------------------------
| PACKAGE SYNC
|--------------------------------------------------------------------------
|
| MikroTik PPP Profile
|          ↓
| profile_id
|          ↓
| mikrotik_packages
|
| IMPORTANT:
| - No mikrotik_id column
| - MikroTik profile/rate-limit is NOT changed
| - Existing DB price is preserved
| - New package price = 0
|
|--------------------------------------------------------------------------
*/

async function packageSync(
    req,
    res
) {

    try {

        const id =
            Number(req.params.id);


        if (
            !Number.isInteger(id) ||
            id <= 0
        ) {

            return res.status(400).json({

                status: false,

                success: false,

                message:
                    "Invalid router ID."

            });
        }


        const router =
            await getRouter(
                req,
                id
            );


        if (!router) {

            return res.status(404).json({

                status: false,

                success: false,

                message:
                    "Router not found."

            });
        }


        const profiles =
            await mt.profiles(
                router
            );


        if (
            !Array.isArray(profiles)
        ) {

            return res.status(500).json({

                status: false,

                success: false,

                message:
                    "MikroTik did not return valid PPP profiles."

            });
        }


        let synced = 0;

        let created = 0;

        let updated = 0;


        for (
            const profile of profiles
        ) {

            /*
            |--------------------------------------------------------------------------
            | MikroTik profile ID
            |--------------------------------------------------------------------------
            |
            | RouterOS normally returns:
            | .id = *C / *9 / *A etc.
            |
            */

            const profileId =
                String(
                    profile[".id"] ||
                    ""
                ).trim();


            const packageName =
                String(
                    profile.name ||
                    ""
                ).trim();


            if (!profileId) {
                continue;
            }


            if (!packageName) {
                continue;
            }


            /*
            |--------------------------------------------------------------------------
            | Find existing package
            |--------------------------------------------------------------------------
            |
            | Since mikrotik_id does not exist,
            | profile_id is the MikroTik identity.
            |
            */

            const existing =
                await query(
                    `
                    SELECT
                        id,
                        price,
                        alias_name
                    FROM mikrotik_packages
                    WHERE router_id = ?
                    AND company_id = ?
                    AND profile_id = ?
                    LIMIT 1
                    `,
                    [
                        id,
                        router.company_id,
                        profileId
                    ]
                );


            if (
                existing.length
            ) {

                /*
                |--------------------------------------------------------------------------
                | UPDATE ONLY MIKROTIK DATA
                |--------------------------------------------------------------------------
                |
                | package_name/profile_id come from MikroTik.
                |
                | price is deliberately NOT updated.
                | alias_name is deliberately NOT updated.
                |
                */

                await query(
                    `
                    UPDATE mikrotik_packages
                    SET
                        profile_id = ?,
                        package_name = ?
                    WHERE id = ?
                    AND router_id = ?
                    AND company_id = ?
                    `,
                    [

                        profileId,

                        packageName,

                        existing[0].id,

                        id,

                        router.company_id

                    ]
                );


                updated++;

            } else {

                /*
                |--------------------------------------------------------------------------
                | CREATE NEW PACKAGE
                |--------------------------------------------------------------------------
                |
                | New MikroTik profile gets price 0.
                |
                | No mikrotik_id.
                |
                */

                await query(
                    `
                    INSERT INTO mikrotik_packages
                    (
                        company_id,
                        router_id,
                        profile_id,
                        package_name,
                        alias_name,
                        price
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    `,
                    [

                        router.company_id,

                        id,

                        profileId,

                        packageName,

                        packageName,

                        0

                    ]
                );


                created++;
            }


            synced++;
        }


        return res.json({

            status: true,

            success: true,

            message:
                "Package sync completed.",

            synced,

            created,

            updated

        });

    } catch (error) {

        console.error(
            "Package sync error:",
            error
        );


        return res.status(500).json({

            status: false,

            success: false,

            message:
                error.message ||
                "Package sync failed."

        });
    }
}


/*
|--------------------------------------------------------------------------
| PACKAGE UPDATE
|--------------------------------------------------------------------------
*/

async function packageUpdate(
    req,
    res
) {

    try {

        const user =
            getAuthUser(req);


        const id =
            Number(req.params.id);


        if (
            !Number.isInteger(id) ||
            id <= 0
        ) {

            return res.status(400).json({

                status: false,

                success: false,

                message:
                    "Invalid package ID."

            });
        }


        /*
        |--------------------------------------------------------------------------
        | Permission
        |--------------------------------------------------------------------------
        */

        if (
            ![
                "super_admin",
                "admin",
                "manager"
            ].includes(user.role)
        ) {

            return res.status(403).json({

                status: false,

                success: false,

                message:
                    "You do not have permission to edit packages."

            });
        }


        const {

            package_name,

            alias_name,

            price

        } =
            req.body || {};


        if (
            !String(
                package_name || ""
            ).trim()
        ) {

            return res.status(400).json({

                status: false,

                success: false,

                message:
                    "Package name is required."

            });
        }


        /*
        |--------------------------------------------------------------------------
        | Find package with company scope
        |--------------------------------------------------------------------------
        */

        let findSql = `
            SELECT
                id,
                company_id,
                router_id,
                profile_id,
                package_name,
                alias_name,
                price
            FROM mikrotik_packages
            WHERE id = ?
        `;


        const findParams = [
            id
        ];


        if (
            !user.is_super_admin
        ) {

            findSql += `
                AND company_id = ?
            `;

            findParams.push(
                user.company_id
            );
        }


        findSql += `
            LIMIT 1
        `;


        const packageRows =
            await query(
                findSql,
                findParams
            );


        if (
            !packageRows.length
        ) {

            return res.status(404).json({

                status: false,

                success: false,

                message:
                    "Package not found or access denied."

            });
        }


        const packageRow =
            packageRows[0];


        /*
        |--------------------------------------------------------------------------
        | DB ONLY
        |--------------------------------------------------------------------------
        |
        | This changes ISP Billing package information only.
        |
        | It does NOT modify MikroTik PPP Profile.
        |
        */

        await query(
            `
            UPDATE mikrotik_packages
            SET
                package_name = ?,
                alias_name = ?,
                price = ?
            WHERE id = ?
            `,
            [

                String(
                    package_name
                ).trim(),

                String(
                    alias_name || ""
                ).trim(),

                Number(
                    price || 0
                ),

                packageRow.id

            ]
        );


        return res.json({

            status: true,

            success: true,

            message:
                "Package updated successfully."

        });

    } catch (error) {

        console.error(
            "Package update error:",
            error
        );


        return res.status(500).json({

            status: false,

            success: false,

            message:
                "Failed to update package."

        });
    }
}


/*
|--------------------------------------------------------------------------
| PACKAGE DELETE
|--------------------------------------------------------------------------
*/

async function packageDelete(
    req,
    res
) {

    try {

        const user =
            getAuthUser(req);


        const id =
            Number(req.params.id);


        if (
            !Number.isInteger(id) ||
            id <= 0
        ) {

            return res.status(400).json({

                status: false,

                success: false,

                message:
                    "Invalid package ID."

            });
        }


        if (
            ![
                "super_admin",
                "admin"
            ].includes(user.role)
        ) {

            return res.status(403).json({

                status: false,

                success: false,

                message:
                    "You do not have permission to delete packages."

            });
        }


        /*
        |--------------------------------------------------------------------------
        | Company scoped delete
        |--------------------------------------------------------------------------
        */

        let sql = `
            DELETE FROM mikrotik_packages
            WHERE id = ?
        `;


        const params = [
            id
        ];


        if (
            !user.is_super_admin
        ) {

            sql += `
                AND company_id = ?
            `;

            params.push(
                user.company_id
            );
        }


        const result =
            await query(
                sql,
                params
            );


        if (
            !result.affectedRows
        ) {

            return res.status(404).json({

                status: false,

                success: false,

                message:
                    "Package not found or access denied."

            });
        }


        return res.json({

            status: true,

            success: true,

            message:
                "Package deleted successfully."

        });

    } catch (error) {

        console.error(
            "Package delete error:",
            error
        );


        return res.status(500).json({

            status: false,

            success: false,

            message:
                "Failed to delete package."

        });
    }
}


/*
|--------------------------------------------------------------------------
| CUSTOMER SYNC
|--------------------------------------------------------------------------
*/

async function customerSync(
    req,
    res
) {

    try {

        const id =
            Number(req.params.id);


        if (
            !Number.isInteger(id) ||
            id <= 0
        ) {

            return res.status(400).json({

                status: false,

                success: false,

                message:
                    "Invalid router ID."

            });
        }


        const router =
            await getRouter(
                req,
                id
            );


        if (!router) {

            return res.status(404).json({

                status: false,

                success: false,

                message:
                    "Router not found."

            });
        }


        /*
        |--------------------------------------------------------------------------
        | Customer sync implementation will be connected here.
        |--------------------------------------------------------------------------
        |
        | Endpoint intentionally stays on the same Config page.
        |
        */

        return res.json({

            status: true,

            success: true,

            message:
                "Customer sync endpoint is ready.",

            router_id:
                router.id,

            company_id:
                router.company_id

        });

    } catch (error) {

        console.error(
            "Customer sync error:",
            error
        );


        return res.status(500).json({

            status: false,

            success: false,

            message:
                "Customer sync failed."

        });
    }
}


/*
|--------------------------------------------------------------------------
| ACTIVE CUSTOMERS
|--------------------------------------------------------------------------
*/

async function activeCustomers(
    req,
    res
) {

    try {

        const id =
            Number(req.params.id);


        const router =
            await getRouter(
                req,
                id
            );


        if (!router) {

            return res.status(404).json({

                status: false,

                success: false,

                message:
                    "Router not found."

            });
        }


        const active =
            await mt.active(
                router
            );


        return res.json({

            status: true,

            success: true,

            customers:
                active

        });

    } catch (error) {

        console.error(
            "Active customers error:",
            error
        );


        return res.status(500).json({

            status: false,

            success: false,

            message:
                error.message ||
                "Failed to load active customers."

        });
    }
}


/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports = {

    list,

    create,

    update,

    remove,

    check,

    history,

    packages,

    packageSync,

    packageUpdate,

    packageDelete,

    customerSync,

    activeCustomers

};