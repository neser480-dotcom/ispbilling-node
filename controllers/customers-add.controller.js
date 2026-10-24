'use strict';

const pool =
    require('../config/database');

const {
    findSecret,
    addPppoeSecret
} = require('../services/routeros.service');

const {
    getDivisions,
    getDistricts,
    getUpazilas,
    resolveLocation
} = require('../services/bangladesh.service');


/*
|--------------------------------------------------------------------------
| RESPONSE HELPER
|--------------------------------------------------------------------------
*/

function sendError(
    res,
    status,
    message
) {

    return res
        .status(status)
        .json({
            success: false,
            message,
            data: []
        });
}


/*
|--------------------------------------------------------------------------
| SESSION
|--------------------------------------------------------------------------
*/

function getSession(req) {

    const session =
        req.session || {};

    return {

        userId:
            Number(
                session.user_id || 0
            ),

        companyId:
            Number(
                session.company_id || 0
            ),

        role:
            String(
                session.role || ''
            ),

        isSuperAdmin:
            String(
                session.role || ''
            ) === 'super_admin'

    };
}


/*
|--------------------------------------------------------------------------
| REQUIRE LOGIN
|--------------------------------------------------------------------------
*/

function requireLogin(
    req,
    res
) {

    const session =
        getSession(req);

    if (!session.userId) {

        sendError(
            res,
            401,
            'Unauthorized'
        );

        return null;
    }

    return session;
}


/*
|--------------------------------------------------------------------------
| ENSURE CSRF
|--------------------------------------------------------------------------
*/

function ensureCsrf(req) {

    if (!req.session) {
        return '';
    }

    if (!req.session.csrf_token) {

        const crypto =
            require('crypto');

        req.session.csrf_token =
            crypto.randomBytes(
                32
            ).toString('hex');
    }

    return req.session.csrf_token;
}


/*
|--------------------------------------------------------------------------
| POST VALUE
|--------------------------------------------------------------------------
*/

function postValue(
    body,
    key
) {

    const value =
        body?.[key];

    if (Array.isArray(value)) {

        return String(
            value[0] ?? ''
        ).trim();
    }

    return String(
        value ?? ''
    ).trim();
}


/*
|--------------------------------------------------------------------------
| NULLABLE
|--------------------------------------------------------------------------
*/

function nullable(
    value
) {

    const v =
        String(
            value ?? ''
        ).trim();

    return v === ''
        ? null
        : v;
}


/*
|--------------------------------------------------------------------------
| STATUS
|--------------------------------------------------------------------------
*/

function normalizeStatus(
    value
) {

    const allowed = [
        'Active',
        'Inactive',
        'Expired'
    ];

    return allowed.includes(value)
        ? value
        : 'Active';
}


/*
|--------------------------------------------------------------------------
| BILLING TYPE
|--------------------------------------------------------------------------
*/

function normalizeBillingType(
    value
) {

    return value === 'Postpaid'
        ? 'Postpaid'
        : 'Prepaid';
}


/*
|--------------------------------------------------------------------------
| LOAD MIKROTIK SERVERS
|--------------------------------------------------------------------------
*/

async function loadRouters(
    req,
    res
) {

    const session =
        requireLogin(
            req,
            res
        );

    if (!session) {
        return;
    }

    if (session.companyId <= 0) {

        return sendError(
            res,
            403,
            'Company is required.'
        );
    }

    try {

        let sql = `
            SELECT
                id,
                company_id,
                name,
                ip
            FROM mikrotik_servers
        `;

        const params = [];

        if (!session.isSuperAdmin) {

            sql += `
                WHERE company_id = ?
            `;

            params.push(
                session.companyId
            );
        }

        sql += `
            ORDER BY name ASC
        `;

        const [rows] =
            await pool.query(
                sql,
                params
            );

        return res.json({

            success: true,

            data:
                rows.map(
                    (row) => ({

                        id:
                            Number(
                                row.id
                            ),

                        company_id:
                            Number(
                                row.company_id
                            ),

                        name:
                            row.name,

                        ip:
                            row.ip

                    })
                )

        });

    } catch (error) {

        console.error(
            'customers-add routers:',
            error
        );

        return sendError(
            res,
            500,
            'Unable to load MikroTik servers.'
        );
    }
}


/*
|--------------------------------------------------------------------------
| LOAD AREAS
|--------------------------------------------------------------------------
|
| Accept:
|
| 1. Selected MikroTik Areas
| 2. Same company manual Areas
|    mikrotik_id IS NULL
|
|--------------------------------------------------------------------------
*/

async function loadAreas(
    req,
    res
) {

    const session =
        requireLogin(
            req,
            res
        );

    if (!session) {
        return;
    }

    const mikrotikId =
        Number(
            req.query.mikrotik_id || 0
        );

    if (mikrotikId <= 0) {

        return res.json({

            success: true,

            data: []

        });
    }

    try {

        let sql = `
            SELECT
                id,
                name,
                mikrotik_id,
                company_id,
                remarks
            FROM areas
            WHERE
                (
                    mikrotik_id = ?
                    OR mikrotik_id IS NULL
                )
        `;

        const params = [
            mikrotikId
        ];

        if (!session.isSuperAdmin) {

            sql += `
                AND company_id = ?
            `;

            params.push(
                session.companyId
            );
        }

        sql += `
            ORDER BY
                CASE
                    WHEN mikrotik_id IS NULL
                    THEN 1
                    ELSE 0
                END,
                name ASC
        `;

        const [rows] =
            await pool.query(
                sql,
                params
            );

        return res.json({

            success: true,

            data:
                rows.map(
                    (row) => ({

                        id:
                            Number(
                                row.id
                            ),

                        name:
                            String(
                                row.name || ''
                            ),

                        mikrotik_id:
                            row.mikrotik_id === null
                                ? null
                                : Number(
                                    row.mikrotik_id
                                ),

                        company_id:
                            Number(
                                row.company_id
                            ),

                        remarks:
                            String(
                                row.remarks || ''
                            )

                    })
                )

        });

    } catch (error) {

        console.error(
            'customers-add areas:',
            error
        );

        return sendError(
            res,
            500,
            'Unable to load areas.'
        );
    }
}


/*
|--------------------------------------------------------------------------
| LOAD PACKAGES
|--------------------------------------------------------------------------
*/

async function loadPackages(
    req,
    res
) {

    const session =
        requireLogin(
            req,
            res
        );

    if (!session) {
        return;
    }

    const routerId =
        Number(
            req.query.router_id || 0
        );

    if (routerId <= 0) {

        return res.json({

            success: true,

            packages: []

        });
    }

    try {

        const [rows] =
            await pool.query(
                `
                SELECT
                    id,
                    profile_id,
                    package_name,
                    price,
                    alias_name
                FROM mikrotik_packages
                WHERE router_id = ?
                  AND company_id = ?
                ORDER BY package_name ASC
                `,
                [
                    routerId,
                    session.companyId
                ]
            );

        return res.json({

            success: true,

            packages:
                rows.map(
                    (row) => ({

                        id:
                            Number(
                                row.id
                            ),

                        profile_id:
                            row.profile_id,

                        package_name:
                            row.package_name,

                        price:
                            Number(
                                row.price || 0
                            ),

                        alias_name:
                            row.alias_name || ''

                    })
                )

        });

    } catch (error) {

        console.error(
            'customers-add packages:',
            error
        );

        return sendError(
            res,
            500,
            'Unable to load packages.'
        );
    }
}


/*
|--------------------------------------------------------------------------
| LOAD SUB AREAS
|--------------------------------------------------------------------------
*/

async function loadSubAreas(
    req,
    res
) {

    const session =
        requireLogin(
            req,
            res
        );

    if (!session) {
        return;
    }

    const areaId =
        Number(
            req.query.area_id || 0
        );

    if (areaId <= 0) {

        return res.json({

            success: true,

            data: [],

            message:
                'No Area selected'

        });
    }

    try {

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

        if (!session.isSuperAdmin) {

            sql += `
                AND sa.company_id = ?
                AND a.company_id = ?
            `;

            params.push(
                session.companyId,
                session.companyId
            );
        }

        sql += `
            ORDER BY sa.name ASC
        `;

        const [rows] =
            await pool.query(
                sql,
                params
            );

        return res.json({

            success: true,

            data:
                rows.map(
                    (row) => ({

                        id:
                            Number(
                                row.id
                            ),

                        name:
                            String(
                                row.name || ''
                            )

                    })
                ),

            message:
                rows.length
                    ? 'Sub areas loaded successfully'
                    : 'No sub areas found'

        });

    } catch (error) {

        console.error(
            'customers-add sub areas:',
            error
        );

        return sendError(
            res,
            500,
            'Unable to load sub areas.'
        );
    }
}


/*
|--------------------------------------------------------------------------
| DIVISIONS
|--------------------------------------------------------------------------
*/

async function divisions(
    req,
    res
) {

    if (
        !requireLogin(
            req,
            res
        )
    ) {
        return;
    }

    try {

        return res.json({

            success: true,

            data:
                await getDivisions()

        });

    } catch (error) {

        console.error(
            'customers-add divisions:',
            error
        );

        return sendError(
            res,
            500,
            'Unable to load divisions.'
        );
    }
}


/*
|--------------------------------------------------------------------------
| DISTRICTS
|--------------------------------------------------------------------------
*/

async function districts(
    req,
    res
) {

    if (
        !requireLogin(
            req,
            res
        )
    ) {
        return;
    }

    const divisionId =
        String(
            req.query.division_id || ''
        ).trim();

    if (!divisionId) {

        return res.json({

            success: true,

            data: []

        });
    }

    try {

        return res.json({

            success: true,

            data:
                await getDistricts(
                    divisionId
                )

        });

    } catch (error) {

        console.error(
            'customers-add districts:',
            error
        );

        return sendError(
            res,
            500,
            'Unable to load districts.'
        );
    }
}


/*
|--------------------------------------------------------------------------
| UPAZILAS
|--------------------------------------------------------------------------
*/

async function upazilas(
    req,
    res
) {

    if (
        !requireLogin(
            req,
            res
        )
    ) {
        return;
    }

    const districtId =
        String(
            req.query.district_id || ''
        ).trim();

    if (!districtId) {

        return res.json({

            success: true,

            data: []

        });
    }

    try {

        return res.json({

            success: true,

            data:
                await getUpazilas(
                    districtId
                )

        });

    } catch (error) {

        console.error(
            'customers-add upazilas:',
            error
        );

        return sendError(
            res,
            500,
            'Unable to load upazilas.'
        );
    }
}


/*
|--------------------------------------------------------------------------
| META
|--------------------------------------------------------------------------
*/

async function meta(
    req,
    res
) {

    const session =
        requireLogin(
            req,
            res
        );

    if (!session) {
        return;
    }

    ensureCsrf(req);

    console.log(
        '[CUSTOMER ADD META CSRF]',
        'sessionID=',
        req.sessionID,
        'tokenLength=',
        String(
            req.session?.csrf_token || ''
        ).length
    );

    if (session.companyId <= 0) {

        return sendError(
            res,
            403,
            'Company is required.'
        );
    }

    try {

        let sql = `
            SELECT
                id,
                company_id,
                name,
                ip
            FROM mikrotik_servers
        `;

        const params = [];

        if (!session.isSuperAdmin) {

            sql += `
                WHERE company_id = ?
            `;

            params.push(
                session.companyId
            );
        }

        sql += `
            ORDER BY name ASC
        `;

        const [routers] =
            await pool.query(
                sql,
                params
            );

        return res.json({

            success: true,

            csrf_token:
                req.session.csrf_token,

            mikrotiks:
                routers.map(
                    (row) => ({

                        id:
                            Number(
                                row.id
                            ),

                        company_id:
                            Number(
                                row.company_id
                            ),

                        name:
                            row.name,

                        ip:
                            row.ip

                    })
                )

        });

    } catch (error) {

        console.error(
            'customers-add meta:',
            error
        );

        return sendError(
            res,
            500,
            'Unable to load Add Customer data.'
        );
    }
}


/*
|--------------------------------------------------------------------------
| SAVE CUSTOMER
|--------------------------------------------------------------------------
*/

async function save(
    req,
    res
) {

    const session =
        requireLogin(
            req,
            res
        );

    if (!session) {
        return;
    }

    if (session.companyId <= 0) {

        return sendError(
            res,
            403,
            'Company is required.'
        );
    }


    /*
    |--------------------------------------------------------------------------
    | CSRF
    |--------------------------------------------------------------------------
    */

    const submittedCsrf =
        postValue(
            req.body,
            'csrf_token'
        );

    const sessionCsrf =
        String(
            req.session?.csrf_token || ''
        );


    console.log(
        '[CUSTOMER ADD SAVE CSRF]',
        'sessionID=',
        req.sessionID,
        'sessionTokenLength=',
        sessionCsrf.length,
        'submittedTokenLength=',
        submittedCsrf.length,
        'match=',
        Boolean(
            submittedCsrf &&
            sessionCsrf &&
            submittedCsrf === sessionCsrf
        )
    );


    if (
        !submittedCsrf ||
        !sessionCsrf ||
        submittedCsrf !== sessionCsrf
    ) {

        return sendError(
            res,
            419,
            'Invalid request. Please refresh the page and try again.'
        );
    }


    /*
    |--------------------------------------------------------------------------
    | BODY
    |--------------------------------------------------------------------------
    */

    const body =
        req.body || {};


    /*
    |--------------------------------------------------------------------------
    | BASIC VALUES
    |--------------------------------------------------------------------------
    */

    const customerId =
        postValue(
            body,
            'customer_id'
        );

    const mikrotikId =
        Number(
            postValue(
                body,
                'mikrotik_id'
            ) || 0
        );

    const packageId =
        Number(
            postValue(
                body,
                'package_id'
            ) || 0
        );

    const pppoeName =
        postValue(
            body,
            'pppoe_name'
        );

    const pppoePassword =
        postValue(
            body,
            'password'
        );

    const areaId =
        Number(
            postValue(
                body,
                'area_id'
            ) || 0
        );

    const subAreaId =
        Number(
            postValue(
                body,
                'sub_area_id'
            ) || 0
        );

    const name =
        postValue(
            body,
            'name'
        );


    /*
    |--------------------------------------------------------------------------
    | REQUIRED VALIDATION
    |--------------------------------------------------------------------------
    */

    if (!customerId) {

        return sendError(
            res,
            422,
            'Customer ID is required.'
        );
    }

    if (mikrotikId <= 0) {

        return sendError(
            res,
            422,
            'MikroTik is required.'
        );
    }

    if (packageId <= 0) {

        return sendError(
            res,
            422,
            'Package is required.'
        );
    }

    if (!pppoeName) {

        return sendError(
            res,
            422,
            'PPPoE username is required.'
        );
    }

    if (!pppoePassword) {

        return sendError(
            res,
            422,
            'PPPoE password is required.'
        );
    }

    if (areaId <= 0) {

        return sendError(
            res,
            422,
            'Area is required.'
        );
    }

    if (subAreaId <= 0) {

        return sendError(
            res,
            422,
            'Sub-Area is required.'
        );
    }

    if (!name) {

        return sendError(
            res,
            422,
            'Customer name is required.'
        );
    }


    /*
    |--------------------------------------------------------------------------
    | STATUS / BILLING
    |--------------------------------------------------------------------------
    */

    const status =
        normalizeStatus(
            postValue(
                body,
                'status'
            )
        );

    const billingType =
        normalizeBillingType(
            postValue(
                body,
                'billing_type'
            )
        );

    const autoConnection =
        postValue(
            body,
            'auto_connection'
        ) || 'Will continue';


    /*
    |--------------------------------------------------------------------------
    | OPTIONAL BANGLADESH LOCATION
    |--------------------------------------------------------------------------
    |
    | Division / District / Upazila সব optional.
    |
    | কোনো location না দিলেও Customer Add হবে।
    |
    | তিনটিই দিলে full location validation হবে।
    |
    | Partial location-ও এখন reject হবে না।
    |
    |--------------------------------------------------------------------------
    */

    const divisionId =
        postValue(
            body,
            'division_id'
        );

    const districtId =
        postValue(
            body,
            'district_id'
        );

    const upazilaId =
        postValue(
            body,
            'upazila_id'
        );


    console.log(
        '[CUSTOMER ADD LOCATION]',
        {
            divisionId,
            districtId,
            upazilaId
        }
    );


    let location = {

        division: null,

        district: null,

        upazila: null

    };


    /*
    |--------------------------------------------------------------------------
    | FULL LOCATION VALIDATION
    |--------------------------------------------------------------------------
    |
    | শুধু তিনটি field-ই দেওয়া থাকলে
    | Bangladesh location service দিয়ে validate হবে।
    |
    | Empty অথবা partial হলে customer save চলবে।
    |
    |--------------------------------------------------------------------------
    */

    if (
        divisionId &&
        districtId &&
        upazilaId
    ) {

        try {

            location =
                await resolveLocation(
                    divisionId,
                    districtId,
                    upazilaId
                );

        } catch (locationError) {

            console.error(
                'customers-add location:',
                locationError
            );

            return sendError(
                res,
                422,
                locationError.message ||
                'Invalid Bangladesh location selected.'
            );
        }
    }


    try {

        /*
        |--------------------------------------------------------------------------
        | ROUTER
        |--------------------------------------------------------------------------
        */

        const [routerRows] =
            await pool.query(
                `
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
                  AND company_id = ?
                LIMIT 1
                `,
                [
                    mikrotikId,
                    session.companyId
                ]
            );


        if (!routerRows.length) {

            return sendError(
                res,
                422,
                'Selected MikroTik server is invalid.'
            );
        }


        const router =
            routerRows[0];


        /*
        |--------------------------------------------------------------------------
        | PACKAGE
        |--------------------------------------------------------------------------
        */

        const [packageRows] =
            await pool.query(
                `
                SELECT
                    id,
                    company_id,
                    router_id,
                    package_name,
                    profile_id,
                    price,
                    alias_name
                FROM mikrotik_packages
                WHERE id = ?
                  AND company_id = ?
                  AND router_id = ?
                LIMIT 1
                `,
                [
                    packageId,
                    session.companyId,
                    mikrotikId
                ]
            );


        if (!packageRows.length) {

            return sendError(
                res,
                422,
                'Selected package is invalid for this MikroTik.'
            );
        }


        const selectedPackage =
            packageRows[0];


        const monthlyFee =
            Number(
                selectedPackage.price || 0
            );


        if (
            !selectedPackage.package_name
        ) {

            return sendError(
                res,
                422,
                'Selected package has no package name.'
            );
        }


        /*
        |--------------------------------------------------------------------------
        | AREA
        |--------------------------------------------------------------------------
        |
        | Accept:
        |
        | 1. Selected MikroTik Area
        | 2. Manual Area
        |    mikrotik_id IS NULL
        |
        |--------------------------------------------------------------------------
        */

        const [areaRows] =
            await pool.query(
                `
                SELECT
                    id,
                    company_id,
                    mikrotik_id,
                    name
                FROM areas
                WHERE id = ?
                  AND company_id = ?
                  AND (
                      mikrotik_id = ?
                      OR mikrotik_id IS NULL
                  )
                LIMIT 1
                `,
                [
                    areaId,
                    session.companyId,
                    mikrotikId
                ]
            );


        if (!areaRows.length) {

            return sendError(
                res,
                422,
                'Selected area is invalid for this MikroTik/company.'
            );
        }


        const area =
            areaRows[0];


        /*
        |--------------------------------------------------------------------------
        | SUB AREA
        |--------------------------------------------------------------------------
        */

        const [subAreaRows] =
            await pool.query(
                `
                SELECT
                    id,
                    company_id,
                    area_id,
                    name
                FROM sub_areas
                WHERE id = ?
                  AND area_id = ?
                  AND company_id = ?
                LIMIT 1
                `,
                [
                    subAreaId,
                    areaId,
                    session.companyId
                ]
            );


        if (!subAreaRows.length) {

            return sendError(
                res,
                422,
                'Selected sub-area is invalid.'
            );
        }


        const subArea =
            subAreaRows[0];


        /*
        |--------------------------------------------------------------------------
        | CUSTOMER ID DUPLICATE
        |--------------------------------------------------------------------------
        */

        const [customerDuplicate] =
            await pool.query(
                `
                SELECT
                    id
                FROM customers
                WHERE company_id = ?
                  AND customer_id = ?
                  AND deleted_at IS NULL
                LIMIT 1
                `,
                [
                    session.companyId,
                    customerId
                ]
            );


        if (customerDuplicate.length) {

            return sendError(
                res,
                409,
                'Customer ID already exists.'
            );
        }


        /*
        |--------------------------------------------------------------------------
        | PPPOE DUPLICATE
        |--------------------------------------------------------------------------
        */

        const [pppoeDuplicate] =
            await pool.query(
                `
                SELECT
                    id
                FROM customers
                WHERE company_id = ?
                  AND pppoe_username = ?
                  AND deleted_at IS NULL
                LIMIT 1
                `,
                [
                    session.companyId,
                    pppoeName
                ]
            );


        if (pppoeDuplicate.length) {

            return sendError(
                res,
                409,
                'PPPoE username already exists.'
            );
        }


        /*
        |--------------------------------------------------------------------------
        | MIKROTIK DUPLICATE
        |--------------------------------------------------------------------------
        */

        try {

            const existingSecrets =
                await findSecret(
                    router,
                    pppoeName
                );


            if (
                existingSecrets.length > 0
            ) {

                return sendError(
                    res,
                    409,
                    'PPPoE username already exists on MikroTik.'
                );
            }

        } catch (routerError) {

            console.error(
                'customers-add MikroTik duplicate check:',
                routerError
            );

            return sendError(
                res,
                502,
                'Unable to connect to the selected MikroTik server.'
            );
        }


        /*
        |--------------------------------------------------------------------------
        | DATABASE TRANSACTION
        |--------------------------------------------------------------------------
        */

        const conn =
            await pool.getConnection();


        try {

            await conn.beginTransaction();


            /*
            |--------------------------------------------------------------------------
            | INSERT CUSTOMER
            |--------------------------------------------------------------------------
            */

            const insertSql = `
                INSERT INTO customers (
                    created_by,
                    company_id,
                    customer_id,
                    mikrotik_id,
                    package_id,
                    monthly_bill,
                    balance,
                    pppoe_username,
                    pppoe_password,
                    area_id,
                    sub_area_id,
                    name,
                    phone,
                    nid_no,
                    birth_date,
                    address,
                    email,
                    billing_cycle,
                    connection_date,
                    connection_fee,
                    billing_type,
                    division,
                    district,
                    upazila,
                    comments,
                    status,
                    reference_name,
                    reference_mobile,
                    auto_connection,
                    payment_status
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
            `;


            const values = [

                session.userId,

                session.companyId,

                customerId,

                mikrotikId,

                packageId,

                monthlyFee,

                Number(
                    postValue(
                        body,
                        'balance'
                    ) || 0
                ),

                pppoeName,

                pppoePassword,

                areaId,

                subAreaId,

                name,

                postValue(
                    body,
                    'mobile'
                ),

                postValue(
                    body,
                    'nid'
                ),

                nullable(
                    postValue(
                        body,
                        'birth_date'
                    )
                ),

                postValue(
                    body,
                    'address'
                ),

                postValue(
                    body,
                    'email'
                ),

                nullable(
                    postValue(
                        body,
                        'billing_cycle'
                    )
                ),

                nullable(
                    postValue(
                        body,
                        'connection_date'
                    )
                ),

                Number(
                    postValue(
                        body,
                        'connection_fee'
                    ) || 0
                ),

                billingType,

                location.division,

                location.district,

                location.upazila,

                postValue(
                    body,
                    'comment'
                ),

                status,

                postValue(
                    body,
                    'reference_name'
                ),

                postValue(
                    body,
                    'reference_mobile'
                ),

                autoConnection,

                'unpaid'

            ];


            const [insertResult] =
                await conn.query(
                    insertSql,
                    values
                );


            const newCustomerId =
                Number(
                    insertResult.insertId
                );


            /*
            |--------------------------------------------------------------------------
            | MIKROTIK PPPoE SECRET
            |--------------------------------------------------------------------------
            */

            try {

                await addPppoeSecret(
                    router,
                    {
                        username:
                            pppoeName,

                        password:
                            pppoePassword,

                        comment:
                            postValue(
                                body,
                                'comment'
                            ),

                        /*
                        |--------------------------------------------------------------------------
                        | SELECTED PACKAGE PROFILE
                        |--------------------------------------------------------------------------
                        |
                        | এখন profile_id পাওয়া যাচ্ছে।
                        | routeros.service.js যদি profile support করে,
                        | selected package profile apply করতে পারবে।
                        |
                        |--------------------------------------------------------------------------
                        */

                        profile:
                            selectedPackage.profile_id ||
                            null

                    }
                );

            } catch (routerError) {

                console.error(
                    'customers-add MikroTik create:',
                    routerError
                );

                throw new Error(
                    'MIKROTIK_CREATE_FAILED:' +
                    (
                        routerError.message ||
                        'Unable to create PPPoE secret.'
                    )
                );
            }


            /*
            |--------------------------------------------------------------------------
            | COMMIT
            |--------------------------------------------------------------------------
            */

            await conn.commit();


            /*
            |--------------------------------------------------------------------------
            | SUCCESS
            |--------------------------------------------------------------------------
            */

            return res.json({

                success: true,

                message:
                    'Customer added successfully.',

                customer_id:
                    newCustomerId

            });


        } catch (error) {

            try {

                await conn.rollback();

            } catch (rollbackError) {

                console.error(
                    'customers-add rollback:',
                    rollbackError
                );
            }

            throw error;


        } finally {

            conn.release();

        }


    } catch (error) {

        console.error(
            'customers-add save:',
            error
        );


        /*
        |--------------------------------------------------------------------------
        | MIKROTIK ERROR
        |--------------------------------------------------------------------------
        */

        if (
            error.message?.startsWith(
                'MIKROTIK_CREATE_FAILED:'
            )
        ) {

            return sendError(
                res,
                502,
                error.message.replace(
                    'MIKROTIK_CREATE_FAILED:',
                    ''
                ).trim() ||
                'Unable to create PPPoE user on MikroTik.'
            );
        }


        /*
        |--------------------------------------------------------------------------
        | DATABASE / OTHER ERROR
        |--------------------------------------------------------------------------
        */

        return sendError(
            res,
            500,
            'Customer could not be saved.'
        );
    }
}


/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {

    meta,

    routers:
        loadRouters,

    areas:
        loadAreas,

    packages:
        loadPackages,

    subAreas:
        loadSubAreas,

    divisions,

    districts,

    upazilas,

    save

};