
"use strict";

const path = require("path");
const db = require("../../config/database");

const {
    detectNetworkFaults,
    nfIsOnline,
    nfFaultNumber
} = require("../../services/network/networkFaultService");


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
            "../../views/monitoring/index.html"
        )
    );
};


/* =========================================================
   FAULT API
========================================================= */

exports.faults = async (req, res) => {
    try {
        const scope = getUserScope(req);

        if (!scope.userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!scope.isSuperAdmin && scope.companyId <= 0) {
            return res.status(403).json({
                success: false,
                message: "Company access is not configured for this account."
            });
        }

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limitInput = parseInt(req.query.limit, 10) || 25;
        const limit = [25, 50, 100, 200].includes(limitInput) ? limitInput : 25;
        const keyword = String(req.query.search || "").trim().toLowerCase();
        const severityFilter = String(req.query.severity || "").trim().toLowerCase();

        const result = await detectNetworkFaults(db, scope.companyId, scope.isSuperAdmin);
        const faults = Array.isArray(result.faults) ? result.faults : [];
        const rows = [];

        for (const fault of faults) {
            if (severityFilter && String(fault.severity || "").toLowerCase() !== severityFilter) {
                continue;
            }

            const oltId = Number(fault.olt_id || 0);
            const pon = String(fault.pon || "");

            if (!oltId || !pon) continue;

            let sql = `
                SELECT
                    o.id AS onu_id,
                    o.olt_id,
                    o.pon,
                    o.status,
                    o.onu_mac,
                    o.onu_sn,
                    o.distance,
                    o.rx_power,
                    o.tx_power,
                    COALESCE(o.last_update, o.updated_at) AS last_update,
                    ol.name AS olt_name,
                    c.customer_id AS customer_code,
                    c.name AS customer_name,
                    c.phone AS customer_phone,
                    c.pppoe_username
                FROM onu o
                LEFT JOIN olts ol ON ol.id = o.olt_id
                LEFT JOIN onu_user_mapping m
                    ON m.onu_id = o.id
                   AND m.olt_id = o.olt_id
                   AND m.company_id = ol.company_id
                LEFT JOIN customers c
                    ON c.id = COALESCE(m.customer_id, o.customer_id)
                   AND c.company_id = ol.company_id
                WHERE o.olt_id = ?
                  AND o.pon = ?
            `;

            const params = [oltId, pon];

            if (!scope.isSuperAdmin) {
                sql += " AND ol.company_id = ?";
                params.push(scope.companyId);
            }

            const [onus] = await db.execute(sql, params);

            const type = String(fault.fault_type || fault.type || "").toLowerCase();
            const reasonText = String(fault.reason || "").toLowerCase();
            const optical = type.includes("optical") || type.includes("loss");
            const mixed = type.includes("multiple") && /(weak|critical|rx)/i.test(reasonText);
            const staleFault = type.includes("stale");

            for (const onu of onus) {
                const status = String(onu.status || "").trim().toLowerCase();
                const online = ["online", "up", "active", "connected", "1"].includes(status);
                const confirmedOffline = ["offline", "down", "disconnected", "0"].includes(status);
                const rx = nfFaultNumber(onu.rx_power);
                let faultReason = "";

                if (staleFault) {
                    const effectiveUpdate = onu.last_update || onu.updated_at;
                    const lastUpdate = effectiveUpdate ? new Date(effectiveUpdate).getTime() : NaN;
                    const age = Number.isFinite(lastUpdate) ? (Date.now() - lastUpdate) / 1000 : Infinity;
                    if (!Number.isFinite(age) || age > 300) faultReason = "ONU-এর পুরোনো তথ্য";
                } else if (optical) {
                    if (online && rx !== null && rx < -30) {
                        faultReason = "Critical RX";
                    }
                } else if (mixed) {
                    if (confirmedOffline) faultReason = "ONU Offline";
                    else if (online && rx !== null && rx < -30) faultReason = "Critical RX";
                    // RX from -30 dBm upward is not an Optical Fault.
                } else if (confirmedOffline) {
                    faultReason = "ONU Offline";
                }

                if (!faultReason) continue;

                rows.push({
                    onu_id: onu.onu_id,
                    customer_code: onu.customer_code || "",
                    customer_name: onu.customer_name || "",
                    customer_phone: onu.customer_phone || "",
                    pppoe_username: onu.pppoe_username || "",
                    olt_id: oltId,
                    olt_name: onu.olt_name || fault.olt_name || "",
                    pon,
                    status: onu.status || "Unknown",
                    onu_mac: onu.onu_mac || "",
                    onu_sn: onu.onu_sn || "",
                    rx_power: onu.rx_power,
                    tx_power: onu.tx_power,
                    distance: onu.distance,
                    last_update: onu.last_update || onu.updated_at || null,
                    detected_at: fault.detected_at || null,
                    severity: fault.severity || "warning",
                    fault_type: fault.fault_type || fault.type || "Network Fault",
                    fault_reason: faultReason,
                    fault_description: fault.reason || "Network condition detected."
                });
            }
        }

        const filtered = keyword
            ? rows.filter(row => [
                row.customer_code, row.customer_name, row.customer_phone,
                row.pppoe_username, row.olt_name, row.olt_id, row.pon,
                row.onu_mac, row.onu_sn, row.fault_reason, row.fault_type
            ].join(" ").toLowerCase().includes(keyword))
            : rows;

        filtered.sort((a, b) => {
            const rank = value => value === "critical" ? 0 : value === "warning" ? 1 : 2;
            return rank(a.severity) - rank(b.severity) ||
                String(a.olt_name).localeCompare(String(b.olt_name)) ||
                String(a.pon).localeCompare(String(b.pon)) ||
                Number(a.onu_id) - Number(b.onu_id);
        });

        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const safePage = Math.min(page, totalPages);
        const start = (safePage - 1) * limit;

        return res.json({
            success: true,
            rows: filtered.slice(start, start + limit),
            pagination: {
                page: safePage,
                limit,
                total,
                totalPages
            },
            summary: {
                total,
                critical: filtered.filter(x => x.severity === "critical").length,
                warning: filtered.filter(x => x.severity === "warning").length,
                recovered: 0
            },
            updated_at: new Date().toISOString()
        });
    } catch (error) {
        console.error("Monitoring faults error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to load network faults."
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

                if (rx < -30) {

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
                "../../views/monitoring/fault-details.html"
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

            LEFT JOIN onu_user_mapping m
                ON m.onu_id = o.id
               AND m.olt_id = o.olt_id
               AND m.company_id = ol.company_id

            LEFT JOIN customers c
                ON c.id = COALESCE(m.customer_id, o.customer_id)
               AND c.company_id = ol.company_id

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
           FILTER AFFECTED ONU ONLY
        ===================================================== */

                const faultType = String(
            fault?.fault_type || fault?.type || ""
        ).toLowerCase();

        const faultReasonText = String(
            fault?.reason || ""
        ).toLowerCase();

        const isOpticalLoss =
            faultType.includes("optical") ||
            faultType.includes("loss");

        const isMixedFault =
            faultType.includes("multiple") &&
            /(weak|critical|rx)/i.test(faultReasonText);

        const isStaleFault = faultType.includes("stale");

        const affectedOnus = [];

        for (const onu of onus) {

            if (!fault) continue;

            const isOnline = nfIsOnline(onu.status);
            const isOffline = ["offline", "down", "disconnected", "0"].includes(String(onu.status || "").trim().toLowerCase());
            const rx = nfFaultNumber(onu.rx_power);

            let affected = false;
            let reason = "";

            if (isStaleFault) {

                const effectiveUpdate = onu.last_update || onu.updated_at;
                    const lastUpdate = effectiveUpdate ? new Date(effectiveUpdate).getTime() : NaN;
                const age = Number.isFinite(lastUpdate) ? (Date.now() - lastUpdate) / 1000 : Infinity;

                if (!Number.isFinite(age) || age > 300) {
                    affected = true;
                    reason = "ONU-?? ?????? ????";
                }

            } else if (isMixedFault) {

                if (isOffline) {
                    affected = true;
                    reason = "ONU Offline";
                } else if (isOnline && rx !== null && rx < -30) {
                    affected = true;
                    reason = "Critical RX";
                }

            } else if (isOpticalLoss) {

                if (isOnline && rx !== null && rx < -30) {
                    affected = true;
                    reason = "Critical RX";
                }

            } else if (isOffline) {

                affected = true;
                reason = "ONU Offline";
            }

            if (affected) {
                affectedOnus.push({
                    ...onu,
                    fault_reason: reason
                });
            }
        }

        /* =====================================================
           AFFECTED ONU SUMMARY
        ===================================================== */

        let online = 0;
        let offline = 0;
        let criticalRx = 0;
        let weakRx = 0;

        for (const onu of affectedOnus) {

            if (nfIsOnline(onu.status)) {
                online++;
            } else if (["offline", "down", "disconnected", "0"].includes(String(onu.status || "").trim().toLowerCase())) {
                offline++;
            }

            const rx = nfFaultNumber(onu.rx_power);

            if (rx !== null) {
                if (rx < -30) {
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
                total: affectedOnus.length,
                online,
                offline,
                critical_rx: criticalRx,
                weak_rx: weakRx
            },
            onus: affectedOnus
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


