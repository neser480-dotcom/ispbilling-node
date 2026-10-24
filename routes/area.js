"use strict";

const express = require("express");
const path = require("path");

const db = require("../config/database");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function isSuperAdmin(req) {
    return String(req.session?.role || "").toLowerCase() === "super_admin";
}


function getUserId(req) {
    return Number(req.session?.user_id || 0);
}


function getCompanyId(req) {
    return Number(req.session?.company_id || 0);
}


function jsonError(res, statusCode, message) {
    return res.status(statusCode).json({
        success: false,
        status: false,
        message: message
    });
}


/*
|--------------------------------------------------------------------------
| MIKROTIK -> AREA SYNC
|--------------------------------------------------------------------------
|
| Rules:
|
| 1. Only existing mikrotik_servers are valid MikroTik Areas.
| 2. mikrotik_id IS NULL = Manual Area.
| 3. If a MikroTik server is deleted, its old Area is removed.
| 4. Sub Areas belonging to a stale MikroTik Area are removed first.
| 5. Duplicate Areas for the same MikroTik server are cleaned.
| 6. Company isolation is maintained.
|
|--------------------------------------------------------------------------
*/

async function syncMikroTikAreas(req) {

    const superAdmin = isSuperAdmin(req);
    const currentCompanyId = getCompanyId(req);


    /*
    |--------------------------------------------------------------------------
    | GET CURRENT MIKROTIK SERVERS
    |--------------------------------------------------------------------------
    */

    let serverSql = `
        SELECT
            id,
            name,
            company_id
        FROM mikrotik_servers
        WHERE deleted_at IS NULL
    `;

    const serverParams = [];


    /*
    |--------------------------------------------------------------------------
    | COMPANY SCOPE
    |--------------------------------------------------------------------------
    */

    if (!superAdmin) {

        serverSql += `
            AND company_id = ?
        `;

        serverParams.push(currentCompanyId);
    }


    serverSql += `
        ORDER BY id ASC
    `;


    const [servers] =
        await db.execute(
            serverSql,
            serverParams
        );


    /*
    |--------------------------------------------------------------------------
    | BUILD ACTIVE MIKROTIK IDS BY COMPANY
    |--------------------------------------------------------------------------
    */

    const activeServerIdsByCompany = new Map();


    for (const server of servers) {

        const mikrotikId =
            Number(server.id || 0);

        const companyId =
            Number(server.company_id || 0);

        const name =
            String(server.name || "").trim();


        if (
            mikrotikId <= 0 ||
            companyId <= 0 ||
            !name
        ) {
            continue;
        }


        if (
            !activeServerIdsByCompany.has(
                companyId
            )
        ) {

            activeServerIdsByCompany.set(
                companyId,
                new Set()
            );
        }


        activeServerIdsByCompany
            .get(companyId)
            .add(mikrotikId);
    }


    /*
    |--------------------------------------------------------------------------
    | REMOVE STALE MIKROTIK AREAS
    |--------------------------------------------------------------------------
    |
    | Any Area with mikrotik_id that no longer exists in
    | mikrotik_servers is considered stale.
    |
    | Manual Areas:
    |
    |     mikrotik_id IS NULL
    |
    | are NEVER touched here.
    |
    |--------------------------------------------------------------------------
    */

    if (superAdmin) {

        /*
        |--------------------------------------------------------------------------
        | SUPER ADMIN
        |--------------------------------------------------------------------------
        | Check all companies.
        |--------------------------------------------------------------------------
        */

        const [mikrotikAreas] =
            await db.execute(
                `
                SELECT
                    id,
                    mikrotik_id,
                    company_id
                FROM areas
                WHERE mikrotik_id IS NOT NULL
                ORDER BY company_id ASC, id ASC
                `
            );


        for (const area of mikrotikAreas) {

            const areaId =
                Number(area.id || 0);

            const mikrotikId =
                Number(area.mikrotik_id || 0);

            const companyId =
                Number(area.company_id || 0);


            if (
                areaId <= 0 ||
                mikrotikId <= 0 ||
                companyId <= 0
            ) {
                continue;
            }


            const activeIds =
                activeServerIdsByCompany.get(
                    companyId
                );


            const serverStillExists =
                activeIds &&
                activeIds.has(
                    mikrotikId
                );


            if (!serverStillExists) {

                console.warn(
                    `Removing stale MikroTik Area: ` +
                    `area_id=${areaId}, ` +
                    `mikrotik_id=${mikrotikId}, ` +
                    `company_id=${companyId}`
                );


                /*
                |--------------------------------------------------------------------------
                | DELETE SUB AREAS FIRST
                |--------------------------------------------------------------------------
                */

                await db.execute(
                    `
                    DELETE FROM sub_areas
                    WHERE area_id = ?
                      AND company_id = ?
                    `,
                    [
                        areaId,
                        companyId
                    ]
                );


                /*
                |--------------------------------------------------------------------------
                | DELETE STALE AREA
                |--------------------------------------------------------------------------
                */

                await db.execute(
                    `
                    DELETE FROM areas
                    WHERE id = ?
                      AND company_id = ?
                      AND mikrotik_id IS NOT NULL
                    LIMIT 1
                    `,
                    [
                        areaId,
                        companyId
                    ]
                );
            }
        }

    } else {

        /*
        |--------------------------------------------------------------------------
        | NORMAL USER
        |--------------------------------------------------------------------------
        | Only current company is touched.
        |--------------------------------------------------------------------------
        */

        const companyId =
            currentCompanyId;


        if (companyId > 0) {

            const activeIds =
                activeServerIdsByCompany.get(
                    companyId
                ) || new Set();


            const [mikrotikAreas] =
                await db.execute(
                    `
                    SELECT
                        id,
                        mikrotik_id
                    FROM areas
                    WHERE company_id = ?
                      AND mikrotik_id IS NOT NULL
                    ORDER BY id ASC
                    `,
                    [
                        companyId
                    ]
                );


            for (const area of mikrotikAreas) {

                const areaId =
                    Number(area.id || 0);

                const mikrotikId =
                    Number(area.mikrotik_id || 0);


                if (
                    areaId <= 0 ||
                    mikrotikId <= 0
                ) {
                    continue;
                }


                /*
                |--------------------------------------------------------------------------
                | SERVER NO LONGER EXISTS
                |--------------------------------------------------------------------------
                */

                if (
                    !activeIds.has(
                        mikrotikId
                    )
                ) {

                    console.warn(
                        `Removing stale MikroTik Area: ` +
                        `area_id=${areaId}, ` +
                        `mikrotik_id=${mikrotikId}, ` +
                        `company_id=${companyId}`
                    );


                    /*
                    |--------------------------------------------------------------------------
                    | DELETE SUB AREAS
                    |--------------------------------------------------------------------------
                    */

                    await db.execute(
                        `
                        DELETE FROM sub_areas
                        WHERE area_id = ?
                          AND company_id = ?
                        `,
                        [
                            areaId,
                            companyId
                        ]
                    );


                    /*
                    |--------------------------------------------------------------------------
                    | DELETE AREA
                    |--------------------------------------------------------------------------
                    */

                    await db.execute(
                        `
                        DELETE FROM areas
                        WHERE id = ?
                          AND company_id = ?
                          AND mikrotik_id IS NOT NULL
                        LIMIT 1
                        `,
                        [
                            areaId,
                            companyId
                        ]
                    );
                }
            }
        }
    }


    /*
    |--------------------------------------------------------------------------
    | CREATE / UPDATE CURRENT MIKROTIK AREAS
    |--------------------------------------------------------------------------
    */

    for (const server of servers) {

        const mikrotikId =
            Number(server.id || 0);

        const name =
            String(server.name || "").trim();

        const companyId =
            Number(server.company_id || 0);


        if (
            mikrotikId <= 0 ||
            !name ||
            companyId <= 0
        ) {
            continue;
        }


        /*
        |--------------------------------------------------------------------------
        | FIND EXISTING AREAS FOR THIS MIKROTIK
        |--------------------------------------------------------------------------
        */

        const [existingAreas] =
            await db.execute(
                `
                SELECT
                    id,
                    mikrotik_id,
                    name
                FROM areas
                WHERE mikrotik_id = ?
                  AND company_id = ?
                ORDER BY id ASC
                `,
                [
                    mikrotikId,
                    companyId
                ]
            );


        /*
        |--------------------------------------------------------------------------
        | EXISTING MIKROTIK AREA
        |--------------------------------------------------------------------------
        */

        if (existingAreas.length > 0) {

            /*
            |--------------------------------------------------------------------------
            | KEEP FIRST AREA
            |--------------------------------------------------------------------------
            */

            const keepAreaId =
                Number(
                    existingAreas[0].id
                );


            /*
            |--------------------------------------------------------------------------
            | UPDATE NAME FROM MIKROTIK SERVER
            |--------------------------------------------------------------------------
            */

            await db.execute(
                `
                UPDATE areas
                SET
                    name = ?
                WHERE id = ?
                  AND company_id = ?
                  AND mikrotik_id = ?
                LIMIT 1
                `,
                [
                    name,
                    keepAreaId,
                    companyId,
                    mikrotikId
                ]
            );


            /*
            |--------------------------------------------------------------------------
            | REMOVE DUPLICATES
            |--------------------------------------------------------------------------
            */

            if (existingAreas.length > 1) {

                for (
                    let i = 1;
                    i < existingAreas.length;
                    i++
                ) {

                    const duplicateAreaId =
                        Number(
                            existingAreas[i].id
                        );


                    if (
                        duplicateAreaId <= 0 ||
                        duplicateAreaId === keepAreaId
                    ) {
                        continue;
                    }


                    /*
                    |--------------------------------------------------------------------------
                    | MOVE SUB AREAS TO KEPT AREA
                    |--------------------------------------------------------------------------
                    */

                    await db.execute(
                        `
                        UPDATE sub_areas
                        SET
                            area_id = ?
                        WHERE area_id = ?
                          AND company_id = ?
                        `,
                        [
                            keepAreaId,
                            duplicateAreaId,
                            companyId
                        ]
                    );


                    /*
                    |--------------------------------------------------------------------------
                    | DELETE DUPLICATE AREA
                    |--------------------------------------------------------------------------
                    */

                    await db.execute(
                        `
                        DELETE FROM areas
                        WHERE id = ?
                          AND company_id = ?
                          AND mikrotik_id = ?
                        LIMIT 1
                        `,
                        [
                            duplicateAreaId,
                            companyId,
                            mikrotikId
                        ]
                    );
                }
            }


            continue;
        }


        /*
        |--------------------------------------------------------------------------
        | SAME NAME MIKROTIK AREA CHECK
        |--------------------------------------------------------------------------
        */

        const [sameNameMikroTik] =
            await db.execute(
                `
                SELECT
                    id,
                    mikrotik_id
                FROM areas
                WHERE company_id = ?
                  AND name = ?
                  AND mikrotik_id IS NOT NULL
                LIMIT 1
                `,
                [
                    companyId,
                    name
                ]
            );


        if (sameNameMikroTik.length > 0) {

            console.warn(
                `Skipping duplicate MikroTik Area: "${name}" ` +
                `(company_id=${companyId}, ` +
                `mikrotik_id=${mikrotikId})`
            );

            continue;
        }


        /*
        |--------------------------------------------------------------------------
        | SAME NAME MANUAL AREA CHECK
        |--------------------------------------------------------------------------
        |
        | Manual Area থাকলে সেটাকে MikroTik Area বানানো হবে না।
        |
        */

        const [sameNameManual] =
            await db.execute(
                `
                SELECT
                    id
                FROM areas
                WHERE company_id = ?
                  AND name = ?
                  AND mikrotik_id IS NULL
                LIMIT 1
                `,
                [
                    companyId,
                    name
                ]
            );


        if (sameNameManual.length > 0) {

            console.warn(
                `Manual Area already exists with MikroTik name: "${name}" ` +
                `(company_id=${companyId})`
            );

            continue;
        }


        /*
        |--------------------------------------------------------------------------
        | INSERT NEW MIKROTIK AREA
        |--------------------------------------------------------------------------
        */

        await db.execute(
            `
            INSERT INTO areas
            (
                mikrotik_id,
                name,
                remarks,
                company_id,
                created_by
            )
            VALUES
            (
                ?,
                ?,
                'MikroTik Area',
                ?,
                ?
            )
            `,
            [
                mikrotikId,
                name,
                companyId,
                getUserId(req)
            ]
        );
    }
}


/*
|--------------------------------------------------------------------------
| AREA PAGE
|--------------------------------------------------------------------------
*/

router.get(
    "/",
    requireAuth,
    async (req, res) => {

        if (
            !isSuperAdmin(req) &&
            getCompanyId(req) <= 0
        ) {

            return res.status(403).send(
                "Company access is not configured for this account."
            );
        }


        return res.sendFile(
            path.join(
                __dirname,
                "..",
                "views",
                "area.html"
            )
        );
    }
);


/*
|--------------------------------------------------------------------------
| SUB AREA PAGE
|--------------------------------------------------------------------------
*/

router.get(
    "/sub/:id",
    requireAuth,
    async (req, res) => {

        if (
            !isSuperAdmin(req) &&
            getCompanyId(req) <= 0
        ) {

            return res.status(403).send(
                "Company access is not configured for this account."
            );
        }


        return res.sendFile(
            path.join(
                __dirname,
                "..",
                "views",
                "sub-area.html"
            )
        );
    }
);


/*
|--------------------------------------------------------------------------
| LOAD AREAS
|--------------------------------------------------------------------------
*/

router.get(
    "/data",
    requireAuth,
    async (req, res) => {

        try {

            if (
                !isSuperAdmin(req) &&
                getCompanyId(req) <= 0
            ) {

                return jsonError(
                    res,
                    403,
                    "Company access is not configured for this account."
                );
            }


            /*
            |--------------------------------------------------------------------------
            | SYNC / CLEANUP
            |--------------------------------------------------------------------------
            */

            await syncMikroTikAreas(req);


            const search =
                String(
                    req.query.search || ""
                ).trim();

            const superAdmin =
                isSuperAdmin(req);


            /*
            |--------------------------------------------------------------------------
            | AREA QUERY
            |--------------------------------------------------------------------------
            */

            let sql = `
                SELECT
                    a.id,
                    a.mikrotik_id,
                    a.name,
                    a.remarks,
                    a.company_id,

                    (
                        SELECT COUNT(*)
                        FROM sub_areas sa
                        WHERE sa.area_id = a.id
                          AND sa.company_id = a.company_id
                    ) AS sub_area_count

                FROM areas a

                WHERE 1 = 1
            `;

            const params = [];


            /*
            |--------------------------------------------------------------------------
            | COMPANY SECURITY
            |--------------------------------------------------------------------------
            */

            if (!superAdmin) {

                sql += `
                    AND a.company_id = ?
                `;

                params.push(
                    getCompanyId(req)
                );
            }


            /*
            |--------------------------------------------------------------------------
            | SEARCH
            |--------------------------------------------------------------------------
            */

            if (search !== "") {

                sql += `
                    AND (
                        a.name LIKE ?
                        OR a.remarks LIKE ?
                    )
                `;

                const value =
                    `%${search}%`;

                params.push(
                    value,
                    value
                );
            }


            /*
            |--------------------------------------------------------------------------
            | ORDER
            |--------------------------------------------------------------------------
            */

            sql += `
                ORDER BY
                    CASE
                        WHEN a.mikrotik_id IS NOT NULL
                        THEN 0
                        ELSE 1
                    END ASC,
                    a.id DESC
            `;


            const [areas] =
                await db.execute(
                    sql,
                    params
                );


            /*
            |--------------------------------------------------------------------------
            | COMPANIES FOR SUPER ADMIN
            |--------------------------------------------------------------------------
            */

            let companies = [];


            if (superAdmin) {

                const [rows] =
                    await db.execute(
                        `
                        SELECT
                            id,
                            name
                        FROM companies
                        ORDER BY name ASC
                        `
                    );

                companies = rows;
            }


            /*
            |--------------------------------------------------------------------------
            | RESPONSE
            |--------------------------------------------------------------------------
            */

            return res.json({

                success: true,

                status: true,

                isSuperAdmin: superAdmin,

                data:
                    areas.map(
                        row => ({

                            id:
                                Number(
                                    row.id
                                ),

                            mikrotik_id:
                                row.mikrotik_id === null
                                    ? null
                                    : Number(
                                        row.mikrotik_id
                                    ),

                            name:
                                String(
                                    row.name || ""
                                ),

                            remarks:
                                String(
                                    row.remarks || ""
                                ),

                            company_id:
                                Number(
                                    row.company_id || 0
                                ),

                            sub_area_count:
                                Number(
                                    row.sub_area_count || 0
                                )
                        })
                    ),

                companies:
                    companies.map(
                        company => ({

                            id:
                                Number(
                                    company.id
                                ),

                            name:
                                String(
                                    company.name || ""
                                )
                        })
                    )
            });

        } catch (error) {

            console.error(
                "Area Load Error:",
                error
            );

            return jsonError(
                res,
                500,
                error?.sqlMessage ||
                error?.message ||
                "Database Error"
            );
        }
    }
);


/*
|--------------------------------------------------------------------------
| AREA ADD / UPDATE / DELETE
|--------------------------------------------------------------------------
*/

router.post(
    "/action",
    requireAuth,
    async (req, res) => {

        try {

            /*
            |--------------------------------------------------------------------------
            | COMPANY ACCESS
            |--------------------------------------------------------------------------
            */

            if (
                !isSuperAdmin(req) &&
                getCompanyId(req) <= 0
            ) {

                return jsonError(
                    res,
                    403,
                    "Company access is not configured for this account."
                );
            }


            /*
            |--------------------------------------------------------------------------
            | ACTION
            |--------------------------------------------------------------------------
            */

            const action =
                String(
                    req.body?.action || ""
                ).trim();


            /*
            |--------------------------------------------------------------------------
            | ADD
            |--------------------------------------------------------------------------
            */

            if (action === "add") {

                const name =
                    String(
                        req.body?.name || ""
                    ).trim();

                const remarks =
                    String(
                        req.body?.remarks || ""
                    ).trim();


                if (!name) {

                    return jsonError(
                        res,
                        400,
                        "Area Name Required"
                    );
                }


                let targetCompany =
                    getCompanyId(req);


                /*
                |--------------------------------------------------------------------------
                | SUPER ADMIN COMPANY
                |--------------------------------------------------------------------------
                */

                if (isSuperAdmin(req)) {

                    targetCompany =
                        Number(
                            req.body?.company_id || 0
                        );


                    if (targetCompany <= 0) {

                        return jsonError(
                            res,
                            400,
                            "Company Required"
                        );
                    }


                    const [company] =
                        await db.execute(
                            `
                            SELECT
                                id
                            FROM companies
                            WHERE id = ?
                            LIMIT 1
                            `,
                            [
                                targetCompany
                            ]
                        );


                    if (company.length === 0) {

                        return jsonError(
                            res,
                            400,
                            "Invalid Company"
                        );
                    }
                }


                /*
                |--------------------------------------------------------------------------
                | DUPLICATE
                |--------------------------------------------------------------------------
                */

                const [duplicate] =
                    await db.execute(
                        `
                        SELECT
                            id
                        FROM areas
                        WHERE company_id = ?
                          AND name = ?
                        LIMIT 1
                        `,
                        [
                            targetCompany,
                            name
                        ]
                    );


                if (duplicate.length > 0) {

                    return jsonError(
                        res,
                        409,
                        "Area Already Exists"
                    );
                }


                /*
                |--------------------------------------------------------------------------
                | INSERT
                |--------------------------------------------------------------------------
                */

                await db.execute(
                    `
                    INSERT INTO areas
                    (
                        company_id,
                        created_by,
                        mikrotik_id,
                        name,
                        remarks
                    )
                    VALUES
                    (
                        ?,
                        ?,
                        NULL,
                        ?,
                        ?
                    )
                    `,
                    [
                        targetCompany,
                        getUserId(req),
                        name,
                        remarks
                    ]
                );


                return res.json({

                    success: true,

                    status: true,

                    message:
                        "Area Added Successfully"
                });
            }


            /*
            |--------------------------------------------------------------------------
            | UPDATE
            |--------------------------------------------------------------------------
            */

            if (action === "update") {

                const id =
                    Number(
                        req.body?.id || 0
                    );

                const name =
                    String(
                        req.body?.name || ""
                    ).trim();

                const remarks =
                    String(
                        req.body?.remarks || ""
                    ).trim();


                if (id <= 0) {

                    return jsonError(
                        res,
                        400,
                        "Invalid Area ID"
                    );
                }


                if (!name) {

                    return jsonError(
                        res,
                        400,
                        "Area Name Required"
                    );
                }


                /*
                |--------------------------------------------------------------------------
                | VERIFY AREA
                |--------------------------------------------------------------------------
                */

                let verifySql = `
                    SELECT
                        id,
                        mikrotik_id,
                        name,
                        remarks,
                        company_id
                    FROM areas
                    WHERE id = ?
                `;

                const verifyParams = [
                    id
                ];


                if (!isSuperAdmin(req)) {

                    verifySql += `
                        AND company_id = ?
                    `;

                    verifyParams.push(
                        getCompanyId(req)
                    );
                }


                verifySql += `
                    LIMIT 1
                `;


                const [areaRows] =
                    await db.execute(
                        verifySql,
                        verifyParams
                    );


                if (areaRows.length === 0) {

                    return jsonError(
                        res,
                        404,
                        "Area Not Found"
                    );
                }


                const area =
                    areaRows[0];


                /*
                |--------------------------------------------------------------------------
                | MIKROTIK AREA PROTECTION
                |--------------------------------------------------------------------------
                */

                if (
                    area.mikrotik_id !== null &&
                    String(area.mikrotik_id).trim() !== ""
                ) {

                    return jsonError(
                        res,
                        403,
                        "MikroTik Area name is managed automatically"
                    );
                }


                const companyId =
                    Number(
                        area.company_id
                    );


                /*
                |--------------------------------------------------------------------------
                | DUPLICATE NAME
                |--------------------------------------------------------------------------
                */

                const [duplicate] =
                    await db.execute(
                        `
                        SELECT
                            id
                        FROM areas
                        WHERE company_id = ?
                          AND name = ?
                          AND id <> ?
                        LIMIT 1
                        `,
                        [
                            companyId,
                            name,
                            id
                        ]
                    );


                if (duplicate.length > 0) {

                    return jsonError(
                        res,
                        409,
                        "Area Already Exists"
                    );
                }


                /*
                |--------------------------------------------------------------------------
                | UPDATE
                |--------------------------------------------------------------------------
                */

                const [result] =
                    await db.execute(
                        `
                        UPDATE areas
                        SET
                            name = ?,
                            remarks = ?
                        WHERE id = ?
                          AND company_id = ?
                          AND mikrotik_id IS NULL
                        LIMIT 1
                        `,
                        [
                            name,
                            remarks,
                            id,
                            companyId
                        ]
                    );


                if (
                    Number(
                        result.affectedRows || 0
                    ) <= 0
                ) {

                    return jsonError(
                        res,
                        400,
                        "Update Failed"
                    );
                }


                return res.json({

                    success: true,

                    status: true,

                    message:
                        "Area Updated Successfully"
                });
            }


            /*
            |--------------------------------------------------------------------------
            | DELETE
            |--------------------------------------------------------------------------
            */

            if (action === "delete") {

                const id =
                    Number(
                        req.body?.id || 0
                    );


                if (id <= 0) {

                    return jsonError(
                        res,
                        400,
                        "Invalid Area ID"
                    );
                }


                /*
                |--------------------------------------------------------------------------
                | VERIFY AREA
                |--------------------------------------------------------------------------
                */

                let verifySql = `
                    SELECT
                        id,
                        mikrotik_id,
                        company_id
                    FROM areas
                    WHERE id = ?
                `;

                const verifyParams = [
                    id
                ];


                if (!isSuperAdmin(req)) {

                    verifySql += `
                        AND company_id = ?
                    `;

                    verifyParams.push(
                        getCompanyId(req)
                    );
                }


                verifySql += `
                    LIMIT 1
                `;


                const [areaRows] =
                    await db.execute(
                        verifySql,
                        verifyParams
                    );


                if (areaRows.length === 0) {

                    return jsonError(
                        res,
                        404,
                        "Area Not Found"
                    );
                }


                const area =
                    areaRows[0];


                /*
                |--------------------------------------------------------------------------
                | MIKROTIK AREA PROTECTION
                |--------------------------------------------------------------------------
                */

                if (
                    area.mikrotik_id !== null &&
                    String(area.mikrotik_id).trim() !== ""
                ) {

                    return jsonError(
                        res,
                        403,
                        "MikroTik Area cannot be deleted"
                    );
                }


                const companyId =
                    Number(
                        area.company_id
                    );


                /*
                |--------------------------------------------------------------------------
                | DELETE SUB AREAS
                |--------------------------------------------------------------------------
                */

                await db.execute(
                    `
                    DELETE FROM sub_areas
                    WHERE area_id = ?
                      AND company_id = ?
                    `,
                    [
                        id,
                        companyId
                    ]
                );


                /*
                |--------------------------------------------------------------------------
                | DELETE AREA
                |--------------------------------------------------------------------------
                */

                const [result] =
                    await db.execute(
                        `
                        DELETE FROM areas
                        WHERE id = ?
                          AND company_id = ?
                          AND mikrotik_id IS NULL
                        LIMIT 1
                        `,
                        [
                            id,
                            companyId
                        ]
                    );


                if (
                    Number(
                        result.affectedRows || 0
                    ) <= 0
                ) {

                    return jsonError(
                        res,
                        400,
                        "Delete Failed"
                    );
                }


                return res.json({

                    success: true,

                    status: true,

                    message:
                        "Area Deleted Successfully"
                });
            }


            /*
            |--------------------------------------------------------------------------
            | INVALID ACTION
            |--------------------------------------------------------------------------
            */

            return jsonError(
                res,
                400,
                "Invalid Action"
            );


        } catch (error) {

            console.error(
                "========================================"
            );

            console.error(
                "AREA ACTION ERROR"
            );

            console.error(
                "========================================"
            );

            console.error(
                "message:",
                error?.message
            );

            console.error(
                "code:",
                error?.code
            );

            console.error(
                "errno:",
                error?.errno
            );

            console.error(
                "sqlState:",
                error?.sqlState
            );

            console.error(
                "sqlMessage:",
                error?.sqlMessage
            );

            console.error(
                "sql:",
                error?.sql
            );

            console.error(
                "========================================"
            );


            return jsonError(
                res,
                500,
                error?.sqlMessage ||
                error?.message ||
                "Database Error"
            );
        }
    }
);


/*
|--------------------------------------------------------------------------
| LOAD SUB AREAS - AJAX
|--------------------------------------------------------------------------
*/

router.get(
    "/sub-areas",
    requireAuth,
    async (req, res) => {

        try {

            const areaId =
                Number(
                    req.query.area_id || 0
                );


            if (areaId <= 0) {

                return res.json({

                    success: true,

                    data: [],

                    message:
                        "No Area selected"
                });
            }


            let sql = `
                SELECT
                    sa.id,
                    sa.name
                FROM sub_areas sa

                INNER JOIN areas a
                    ON a.id = sa.area_id

                WHERE sa.area_id = ?
            `;

            const params = [
                areaId
            ];


            /*
            |--------------------------------------------------------------------------
            | TENANT SECURITY
            |--------------------------------------------------------------------------
            */

            if (!isSuperAdmin(req)) {

                sql += `
                    AND sa.company_id = ?
                    AND a.company_id = ?
                `;

                params.push(
                    getCompanyId(req),
                    getCompanyId(req)
                );
            }


            sql += `
                ORDER BY sa.name ASC
            `;


            const [rows] =
                await db.execute(
                    sql,
                    params
                );


            return res.json({

                success: true,

                data:
                    rows.map(
                        row => ({

                            id:
                                Number(
                                    row.id
                                ),

                            name:
                                String(
                                    row.name || ""
                                )
                        })
                    ),

                message:
                    rows.length > 0
                        ? "Sub areas loaded successfully"
                        : "No sub areas found"
            });

        } catch (error) {

            console.error(
                "Sub Area Load Error:",
                error
            );

            return jsonError(
                res,
                500,
                error?.sqlMessage ||
                error?.message ||
                "Database Error"
            );
        }
    }
);


/*
|--------------------------------------------------------------------------
| SUB AREA PAGE DATA
|--------------------------------------------------------------------------
*/

router.get(
    "/sub-data/:id",
    requireAuth,
    async (req, res) => {

        try {

            const areaId =
                Number(
                    req.params.id || 0
                );


            if (areaId <= 0) {

                return jsonError(
                    res,
                    400,
                    "Invalid Area."
                );
            }


            let areaSql = `
                SELECT
                    id,
                    name,
                    mikrotik_id,
                    company_id
                FROM areas
                WHERE id = ?
            `;

            const areaParams = [
                areaId
            ];


            if (!isSuperAdmin(req)) {

                areaSql += `
                    AND company_id = ?
                `;

                areaParams.push(
                    getCompanyId(req)
                );
            }


            areaSql += `
                LIMIT 1
            `;


            const [areaRows] =
                await db.execute(
                    areaSql,
                    areaParams
                );


            if (areaRows.length === 0) {

                return jsonError(
                    res,
                    404,
                    "Area Not Found."
                );
            }


            const area =
                areaRows[0];


            const [subRows] =
                await db.execute(
                    `
                    SELECT
                        id,
                        area_id,
                        company_id,
                        created_by,
                        name,
                        remarks,
                        created_at
                    FROM sub_areas
                    WHERE area_id = ?
                      AND company_id = ?
                    ORDER BY id DESC
                    `,
                    [
                        areaId,
                        Number(
                            area.company_id
                        )
                    ]
                );


            return res.json({

                success: true,

                area: {

                    id:
                        Number(
                            area.id
                        ),

                    name:
                        String(
                            area.name || ""
                        ),

                    mikrotik_id:
                        area.mikrotik_id === null
                            ? null
                            : Number(
                                area.mikrotik_id
                            ),

                    company_id:
                        Number(
                            area.company_id
                        )
                },

                data:
                    subRows.map(
                        row => ({

                            id:
                                Number(
                                    row.id
                                ),

                            area_id:
                                Number(
                                    row.area_id
                                ),

                            company_id:
                                Number(
                                    row.company_id
                                ),

                            created_by:
                                Number(
                                    row.created_by || 0
                                ),

                            name:
                                String(
                                    row.name || ""
                                ),

                            remarks:
                                String(
                                    row.remarks || ""
                                ),

                            created_at:
                                row.created_at || ""
                        })
                    )
            });

        } catch (error) {

            console.error(
                "Sub Area Data Error:",
                error
            );

            return jsonError(
                res,
                500,
                error?.sqlMessage ||
                error?.message ||
                "Database Error"
            );
        }
    }
);


/*
|--------------------------------------------------------------------------
| ADD SUB AREA
|--------------------------------------------------------------------------
*/

router.post(
    "/sub-add",
    requireAuth,
    async (req, res) => {

        try {

            const areaId =
                Number(
                    req.body.area_id || 0
                );

            const name =
                String(
                    req.body.name || ""
                ).trim();

            const remarks =
                String(
                    req.body.remarks || ""
                ).trim();


            if (areaId <= 0) {

                return jsonError(
                    res,
                    400,
                    "Invalid Area Access."
                );
            }


            if (!name) {

                return jsonError(
                    res,
                    400,
                    "Sub Area Name Required."
                );
            }


            /*
            |--------------------------------------------------------------------------
            | VERIFY AREA
            |--------------------------------------------------------------------------
            */

            let areaSql = `
                SELECT
                    id,
                    company_id
                FROM areas
                WHERE id = ?
            `;

            const areaParams = [
                areaId
            ];


            if (!isSuperAdmin(req)) {

                areaSql += `
                    AND company_id = ?
                `;

                areaParams.push(
                    getCompanyId(req)
                );
            }


            areaSql += `
                LIMIT 1
            `;


            const [areaRows] =
                await db.execute(
                    areaSql,
                    areaParams
                );


            if (areaRows.length === 0) {

                return jsonError(
                    res,
                    403,
                    "Invalid Area Access."
                );
            }


            const targetCompany =
                Number(
                    areaRows[0].company_id
                );


            /*
            |--------------------------------------------------------------------------
            | DUPLICATE
            |--------------------------------------------------------------------------
            */

            const [duplicate] =
                await db.execute(
                    `
                    SELECT
                        id
                    FROM sub_areas
                    WHERE area_id = ?
                      AND company_id = ?
                      AND name = ?
                    LIMIT 1
                    `,
                    [
                        areaId,
                        targetCompany,
                        name
                    ]
                );


            if (duplicate.length > 0) {

                return jsonError(
                    res,
                    409,
                    "এই Area-এর ভিতরে Sub Area ইতিমধ্যে আছে।"
                );
            }


            /*
            |--------------------------------------------------------------------------
            | INSERT
            |--------------------------------------------------------------------------
            */

            await db.execute(
                `
                INSERT INTO sub_areas
                (
                    area_id,
                    company_id,
                    created_by,
                    name,
                    remarks
                )
                VALUES
                (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?
                )
                `,
                [
                    areaId,
                    targetCompany,
                    getUserId(req),
                    name,
                    remarks
                ]
            );


            return res.json({

                success: true,

                status: true,

                message:
                    "Sub Area Added Successfully."
            });

        } catch (error) {

            console.error(
                "Sub Area Add Error:",
                error
            );

            return jsonError(
                res,
                500,
                error?.sqlMessage ||
                error?.message ||
                "Sub Area Add Failed."
            );
        }
    }
);


module.exports = router;