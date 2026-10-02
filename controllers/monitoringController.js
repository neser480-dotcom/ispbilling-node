
"use strict";

const path = require("path");
const db = require("../config/database");

const {
    detectNetworkFaults,
    nfIsOnline,
    nfFaultNumber
} = require("../services/networkFaultService");


/* =========================================================
   USER SCOPE
========================================================= */

function getUserScope(req) {

    const session = req.session || {};

    const userId =
        Number(session.user_id ?? 0);

    const role =
        String(
            session.role ??
            session.user_role ??
            ""
        )
            .trim()
            .toLowerCase();

    const companyId =
        Number(session.company_id ?? 0);

    const isSuperAdmin =
        role === "super_admin";

    return {
        userId,
        role,
        companyId,
        isSuperAdmin
    };
}


/* =========================================================
   PAGE
========================================================= */

exports.index = async (req, res) => {

    const scope =
        getUserScope(req);

    if (!scope.userId) {
        return res.redirect("/");
    }

    if (
        !scope.isSuperAdmin &&
        scope.companyId <= 0
    ) {
        return res.status(403).send(
            "Company access is not configured for this account."
        );
    }

    return res.sendFile(
        path.join(
            __dirname,
            "../views/monitoring/index.html"
        )
    );
};


/* =========================================================
   FAULT API
========================================================= */

exports.faults = async (req, res) => {

    try {

        const scope =
            getUserScope(req);

        if (!scope.userId) {

            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            });
        }

        if (
            !scope.isSuperAdmin &&
            scope.companyId <= 0
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Company access is not configured for this account."
            });
        }

        /*
        |--------------------------------------------------------------------------
        | DATABASE
        |--------------------------------------------------------------------------
        | database.js directly exports the mysql2 promise pool.
        | Do NOT use req.app.locals.db here.
        */

        const result =
            await detectNetworkFaults(
                db,
                scope.companyId,
                scope.isSuperAdmin
            );

        return res.json({
            success: true,
            ...result
        });

    } catch (error) {

        console.error(
            "Monitoring faults error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to load network faults."
        });
    }
};


/* =========================================================
   FAULT DETAILS
========================================================= */

exports.faultDetails = async (req, res) => {

    try {

        const scope =
            getUserScope(req);

        if (!scope.userId) {
            return res.redirect("/");
        }

        if (
            !scope.isSuperAdmin &&
            scope.companyId <= 0
        ) {
            return res.status(403).send(
                "Company access is not configured for this account."
            );
        }

        const oltId =
            Number(
                req.query.olt_id ?? 0
            );

        const pon =
            String(
                req.query.pon ?? ""
            ).trim();

        if (
            oltId <= 0 ||
            !pon
        ) {
            return res.redirect(
                "/monitoring"
            );
        }


        /* =====================================================
           DETECT CURRENT FAULT
        ===================================================== */

        const result =
            await detectNetworkFaults(
                db,
                scope.companyId,
                scope.isSuperAdmin
            );

        const fault =
            result.faults.find(
                item =>
                    Number(item.olt_id) === oltId &&
                    String(item.pon) === pon
            ) || null;


        /* =====================================================
           OLT DETAILS
        ===================================================== */

        let oltSql = `
            SELECT
                id,
                name,
                ip,
                vendor,
                status
            FROM olts
            WHERE id = ?
        `;

        const oltParams = [
            oltId
        ];

        if (!scope.isSuperAdmin) {

            oltSql += `
                AND company_id = ?
            `;

            oltParams.push(
                scope.companyId
            );
        }

        const [oltRows] =
            await db.execute(
                oltSql,
                oltParams
            );

        if (!oltRows.length) {

            return res.status(404).send(
                "OLT not found."
            );
        }

        const olt =
            oltRows[0];


        /* =====================================================
           ONU DETAILS
        ===================================================== */

        let onuSql = `
            SELECT
                o.*,

                ol.name AS olt_name,

                c.customer_id AS customer_code,
                c.name AS customer_name,
                c.phone AS customer_phone,
                c.pppoe_username

            FROM onu o

            LEFT JOIN olts ol
                ON ol.id = o.olt_id

            LEFT JOIN customers c
                ON c.id = o.customer_id

            WHERE o.olt_id = ?
              AND o.pon = ?
        `;

        const onuParams = [
            oltId,
            pon
        ];

        if (!scope.isSuperAdmin) {

            onuSql += `
                AND ol.company_id = ?
            `;

            onuParams.push(
                scope.companyId
            );
        }

        onuSql += `
            ORDER BY
                CASE
                    WHEN LOWER(
                        COALESCE(o.status, '')
                    ) IN (
                        'online',
                        'up',
                        'active',
                        'connected',
                        '1'
                    )
                    THEN 1
                    ELSE 0
                END ASC,

                CASE
                    WHEN o.distance REGEXP
                        '^[0-9]+(\\.[0-9]+)?'
                    THEN CAST(
                        REGEXP_SUBSTR(
                            o.distance,
                            '[0-9]+(\\.[0-9]+)?'
                        )
                        AS DECIMAL(10,3)
                    )
                    ELSE 999999
                END ASC,

                o.id ASC
        `;

        const [onus] =
            await db.execute(
                onuSql,
                onuParams
            );


        /* =====================================================
           SUMMARY
        ===================================================== */

        let online = 0;
        let offline = 0;
        let criticalRx = 0;
        let weakRx = 0;

        for (const onu of onus) {

            if (
                nfIsOnline(
                    onu.status
                )
            ) {
                online++;
            } else {
                offline++;
            }

            const rx =
                nfFaultNumber(
                    onu.rx_power
                );

            if (rx !== null) {

                if (rx <= -30) {

                    criticalRx++;

                } else if (rx <= -27) {

                    weakRx++;
                }
            }
        }


        /*
        |--------------------------------------------------------------------------
        | IMPORTANT
        |--------------------------------------------------------------------------
        | The current fault-details page is served as a static HTML file.
        | The data API can use the same database pool and fault detector.
        |
        | Keep these variables available for future rendering/API use.
        */

        void fault;
        void olt;
        void onus;
        void online;
        void offline;
        void criticalRx;
        void weakRx;


        return res.sendFile(
            path.join(
                __dirname,
                "../views/monitoring/fault-details.html"
            )
        );

    } catch (error) {

        console.error(
            "Fault details error:",
            error
        );

        return res.status(500).send(
            "Unable to load fault details."
        );
    }
};


/* =========================================================
   FAULT DETAILS API
========================================================= */

exports.faultDetailsApi = async (req, res) => {

    try {

        const scope =
            getUserScope(req);

        if (!scope.userId) {

            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            });
        }

        if (
            !scope.isSuperAdmin &&
            scope.companyId <= 0
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Company access is not configured for this account."
            });
        }

        const oltId =
            Number(
                req.query.olt_id ?? 0
            );

        const pon =
            String(
                req.query.pon ?? ""
            ).trim();

        if (
            oltId <= 0 ||
            !pon
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "OLT ID and PON are required."
            });
        }


        /* =====================================================
           CURRENT FAULT
        ===================================================== */

        const result =
            await detectNetworkFaults(
                db,
                scope.companyId,
                scope.isSuperAdmin
            );

        const fault =
            result.faults.find(
                item =>
                    Number(item.olt_id) === oltId &&
                    String(item.pon) === pon
            ) || null;


        /* =====================================================
           OLT
        ===================================================== */

        let oltSql = `
            SELECT
                id,
                name,
                ip,
                vendor,
                status,
                pon_ports,
                cpu,
                memory,
                temperature,
                uptime,
                onu_total,
                onu_online,
                onu_offline,
                last_check
            FROM olts
            WHERE id = ?
        `;

        const oltParams = [
            oltId
        ];

        if (!scope.isSuperAdmin) {

            oltSql += `
                AND company_id = ?
            `;

            oltParams.push(
                scope.companyId
            );
        }

        const [oltRows] =
            await db.execute(
                oltSql,
                oltParams
            );

        if (!oltRows.length) {

            return res.status(404).json({
                success: false,
                message:
                    "OLT not found."
            });
        }

        const olt =
            oltRows[0];


        /* =====================================================
           ONU
        ===================================================== */

        let onuSql = `
            SELECT
                o.*,

                c.customer_id AS customer_code,
                c.name AS customer_name,
                c.phone AS customer_phone,
                c.pppoe_username

            FROM onu o

            LEFT JOIN olts ol
                ON ol.id = o.olt_id

            LEFT JOIN customers c
                ON c.id = o.customer_id

            WHERE o.olt_id = ?
              AND o.pon = ?
        `;

        const onuParams = [
            oltId,
            pon
        ];

        if (!scope.isSuperAdmin) {

            onuSql += `
                AND ol.company_id = ?
            `;

            onuParams.push(
                scope.companyId
            );
        }

        onuSql += `
            ORDER BY
                CASE
                    WHEN LOWER(
                        COALESCE(o.status, '')
                    ) IN (
                        'online',
                        'up',
                        'active',
                        'connected',
                        '1'
                    )
                    THEN 1
                    ELSE 0
                END ASC,

                CASE
                    WHEN o.distance REGEXP
                        '^[0-9]+(\\.[0-9]+)?'
                    THEN CAST(
                        REGEXP_SUBSTR(
                            o.distance,
                            '[0-9]+(\\.[0-9]+)?'
                        )
                        AS DECIMAL(10,3)
                    )
                    ELSE 999999
                END ASC,

                o.id ASC
        `;

        const [onus] =
            await db.execute(
                onuSql,
                onuParams
            );


        /* =====================================================
           ONU SUMMARY
        ===================================================== */

        let online = 0;
        let offline = 0;
        let criticalRx = 0;
        let weakRx = 0;

        for (const onu of onus) {

            if (
                nfIsOnline(
                    onu.status
                )
            ) {
                online++;
            } else {
                offline++;
            }

            const rx =
                nfFaultNumber(
                    onu.rx_power
                );

            if (rx !== null) {

                if (rx <= -30) {

                    criticalRx++;

                } else if (rx <= -27) {

                    weakRx++;
                }
            }
        }


        /* =====================================================
           RESPONSE
        ===================================================== */

        return res.json({
            success: true,

            olt,

            pon,

            fault,

            summary: {
                total: onus.length,
                online,
                offline,
                critical_rx: criticalRx,
                weak_rx: weakRx
            },

            onus
        });

    } catch (error) {

        console.error(
            "Fault details API error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to load fault details."
        });
    }
};
