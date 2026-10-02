/*
|--------------------------------------------------------------------------
| NetFee - Network Fault Detection Service
|--------------------------------------------------------------------------
|
| File:
| services/networkFaultService.js
|
| Purpose:
| - Detect PON / Fiber / ONU / Optical faults
| - Group ONU by OLT + PON
| - Detect single / multiple / all ONU offline
| - Analyze RX optical power
| - Estimate affected distance area
| - Detect stale ONU data
| - Provide diagnostic confidence
| - Keep existing API response fields compatible
|
*/

"use strict";

const crypto = require("crypto");

/*
|--------------------------------------------------------------------------
| CONFIGURATION
|--------------------------------------------------------------------------
|
| Stale data means the ONU record has not been updated within this period.
|
| 5 minutes is intentionally used as a conservative default.
| It prevents old ONU records from being treated as fresh live data.
|
*/

const DEFAULT_STALE_MINUTES = 5;

/*
|--------------------------------------------------------------------------
| NUMBER HELPER
|--------------------------------------------------------------------------
*/

function nfFaultNumber(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    const text = String(value).trim();

    if (!text) {
        return null;
    }

    const match = text.match(
        /-?\d+(?:\.\d+)?/
    );

    return match
        ? Number.parseFloat(match[0])
        : null;
}

/*
|--------------------------------------------------------------------------
| STATUS HELPER
|--------------------------------------------------------------------------
*/

function nfIsOnline(status) {
    return [
        "online",
        "up",
        "active",
        "connected",
        "1"
    ].includes(
        String(status ?? "")
            .trim()
            .toLowerCase()
    );
}

/*
|--------------------------------------------------------------------------
| RX SEVERITY
|--------------------------------------------------------------------------
*/

function nfRxSeverity(rx) {
    if (
        rx === null ||
        rx === undefined ||
        !Number.isFinite(Number(rx))
    ) {
        return "unknown";
    }

    const value = Number(rx);

    if (value > -25) {
        return "normal";
    }

    if (value > -27) {
        return "warning";
    }

    if (value > -30) {
        return "weak";
    }

    return "critical";
}

/*
|--------------------------------------------------------------------------
| DATE PARSER
|--------------------------------------------------------------------------
*/

function nfParseDate(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    if (value instanceof Date) {
        const time = value.getTime();

        return Number.isFinite(time)
            ? value
            : null;
    }

    const text = String(value).trim();

    if (!text) {
        return null;
    }

    /*
    | MySQL datetime:
    | 2026-10-02 09:15:00
    |
    | Convert to ISO-like form where possible.
    */

    let parsed = new Date(text);

    if (!Number.isNaN(parsed.getTime())) {
        return parsed;
    }

    parsed = new Date(
        text.replace(" ", "T")
    );

    if (!Number.isNaN(parsed.getTime())) {
        return parsed;
    }

    return null;
}

/*
|--------------------------------------------------------------------------
| STALE DATA CHECK
|--------------------------------------------------------------------------
*/

function nfIsStale(
    lastUpdate,
    staleMinutes = DEFAULT_STALE_MINUTES
) {
    const parsed = nfParseDate(lastUpdate);

    if (!parsed) {
        return true;
    }

    const ageMs =
        Date.now() - parsed.getTime();

    /*
    | Future timestamps are not considered stale.
    */

    if (ageMs < 0) {
        return false;
    }

    return (
        ageMs >
        Number(staleMinutes) *
            60 *
            1000
    );
}

/*
|--------------------------------------------------------------------------
| DATA AGE
|--------------------------------------------------------------------------
*/

function nfDataAgeSeconds(lastUpdate) {
    const parsed = nfParseDate(lastUpdate);

    if (!parsed) {
        return null;
    }

    const ageMs =
        Date.now() - parsed.getTime();

    if (ageMs < 0) {
        return 0;
    }

    return Math.floor(
        ageMs / 1000
    );
}

/*
|--------------------------------------------------------------------------
| MAX / MIN DATE
|--------------------------------------------------------------------------
*/

function nfLatestDateValue(
    currentValue,
    newValue
) {
    if (!newValue) {
        return currentValue;
    }

    if (!currentValue) {
        return newValue;
    }

    const currentDate =
        nfParseDate(currentValue);

    const newDate =
        nfParseDate(newValue);

    if (!currentDate) {
        return newValue;
    }

    if (!newDate) {
        return currentValue;
    }

    return newDate.getTime() >
        currentDate.getTime()
        ? newValue
        : currentValue;
}

/*
|--------------------------------------------------------------------------
| ESTIMATE FAULT AREA
|--------------------------------------------------------------------------
|
| IMPORTANT:
| This is only an approximate distance cluster.
| It is NOT an exact fiber-break location.
|
| Exact physical fault location requires OTDR / field testing.
|
*/

function nfEstimateFaultArea(
    allOnus,
    offlineOnus
) {
    const offlineDistances = [];
    const onlineDistances = [];

    for (const onu of offlineOnus) {
        const distance =
            nfFaultNumber(
                onu.distance
            );

        if (
            distance !== null &&
            distance >= 0
        ) {
            offlineDistances.push(
                distance
            );
        }
    }

    for (const onu of allOnus) {
        if (
            !nfIsOnline(
                onu.status
            )
        ) {
            continue;
        }

        const distance =
            nfFaultNumber(
                onu.distance
            );

        if (
            distance !== null &&
            distance >= 0
        ) {
            onlineDistances.push(
                distance
            );
        }
    }

    if (
        offlineDistances.length === 0
    ) {
        return {
            available: false,
            min: null,
            max: null,
            nearest_online: null,
            text:
                "Distance data unavailable",
            confidence: "low"
        };
    }

    offlineDistances.sort(
        (a, b) => a - b
    );

    onlineDistances.sort(
        (a, b) => a - b
    );

    const minOffline =
        Math.min(
            ...offlineDistances
        );

    const maxOffline =
        Math.max(
            ...offlineDistances
        );

    /*
    | If an online ONU exists beyond the
    | offline cluster, it gives us a useful
    | approximate boundary.
    */

    const onlineBeyond =
        onlineDistances.filter(
            distance =>
                distance > maxOffline
        );

    if (
        onlineBeyond.length > 0
    ) {
        const nearestOnline =
            Math.min(
                ...onlineBeyond
            );

        const lower =
            minOffline;

        let upper =
            maxOffline;

        /*
        | Very close distances do not give
        | a meaningful range, so keep a
        | minimum 100 meter display range.
        */

        if (
            upper - lower < 0.1
        ) {
            upper =
                lower + 0.1;
        }

        return {
            available: true,
            min: lower,
            max: upper,
            nearest_online:
                nearestOnline,
            text:
                `${lower.toFixed(2)} – ${upper.toFixed(2)} km from OLT`,
            confidence: "medium"
        };
    }

    return {
        available: true,
        min: minOffline,
        max: maxOffline,
        nearest_online: null,
        text:
            `${minOffline.toFixed(2)} – ${maxOffline.toFixed(2)} km from OLT`,
        confidence: "low"
    };
}

/*
|--------------------------------------------------------------------------
| RX ANALYSIS
|--------------------------------------------------------------------------
*/

function nfAnalyzeRx(allOnus) {
    let normal = 0;
    let warning = 0;
    let weak = 0;
    let critical = 0;
    let unknown = 0;

    const values = [];

    for (const onu of allOnus) {
        const rx =
            nfFaultNumber(
                onu.rx_power
            );

        if (rx === null) {
            unknown++;
            continue;
        }

        values.push(rx);

        const severity =
            nfRxSeverity(rx);

        if (severity === "normal") {
            normal++;
        } else if (
            severity === "warning"
        ) {
            warning++;
        } else if (
            severity === "weak"
        ) {
            weak++;
        } else if (
            severity === "critical"
        ) {
            critical++;
        }
    }

    let average = null;
    let minimum = null;
    let maximum = null;

    if (values.length > 0) {
        const total =
            values.reduce(
                (sum, value) =>
                    sum + value,
                0
            );

        average =
            Number(
                (
                    total /
                    values.length
                ).toFixed(2)
            );

        minimum =
            Math.min(...values);

        maximum =
            Math.max(...values);
    }

    return {
        normal,
        warning,
        weak,
        critical,
        unknown,
        average_rx:
            average,
        minimum_rx:
            minimum,
        maximum_rx:
            maximum,
        measured:
            values.length
    };
}

/*
|--------------------------------------------------------------------------
| PON HEALTH
|--------------------------------------------------------------------------
*/

function nfPonHealth(
    total,
    online,
    offline,
    stale,
    criticalRx,
    weakRx
) {
    if (total <= 0) {
        return "unknown";
    }

    /*
    | If every record is stale, we cannot safely
    | call the PON faulty.
    */

    if (
        stale === total
    ) {
        return "data_stale";
    }

    const offlinePercent =
        (
            offline /
            total
        ) * 100;

    if (
        offline === 0 &&
        criticalRx === 0 &&
        weakRx === 0
    ) {
        return "healthy";
    }

    if (
        offline === total &&
        total >= 2
    ) {
        return "critical";
    }

    if (
        offline >= 3 &&
        offlinePercent >= 30
    ) {
        return "critical";
    }

    if (
        criticalRx >= 2 ||
        weakRx >= 3 ||
        offline > 0
    ) {
        return "degraded";
    }

    return "warning";
}

/*
|--------------------------------------------------------------------------
| DIAGNOSTIC DETAILS
|--------------------------------------------------------------------------
*/

function nfBuildDiagnosis({
    total,
    online,
    offline,
    stale,
    offlinePercent,
    criticalRx,
    weakRx,
    estimated
}) {
    let severity = "warning";

    let faultType =
        "Unknown Fault";

    let reason =
        "Network condition detected.";

    let likelyCause =
        "Network condition requires inspection.";

    let confidence =
        "low";

    let recommendedChecks = [];

    /*
    |--------------------------------------------------------------------------
    | STALE DATA
    |--------------------------------------------------------------------------
    */

    if (
        stale === total &&
        total > 0
    ) {
        severity = "warning";

        faultType =
            "ONU Data Stale";

        reason =
            "এই PON-এর ONU data অনেকক্ষণ update হয়নি। এটি সরাসরি network fault প্রমাণ করে না।";

        likelyCause =
            "ONU monitoring/synchronization data may be stale.";

        confidence =
            "low";

        recommendedChecks = [
            "OLT synchronization status পরীক্ষা করুন",
            "ONU polling / sync service পরীক্ষা করুন",
            "OLT connectivity পরীক্ষা করুন",
            "তারপর পুনরায় Live Fault refresh করুন"
        ];

        return {
            severity,
            faultType,
            reason,
            likelyCause,
            confidence,
            recommendedChecks
        };
    }

    /*
    |--------------------------------------------------------------------------
    | ALL ONU OFFLINE
    |--------------------------------------------------------------------------
    */

    if (
        total >= 2 &&
        offline === total
    ) {
        severity = "critical";

        faultType =
            "PON / Fiber Fault";

        reason =
            "এই PON-এর সব ONU offline। PON fiber, splitter, OLT PON port অথবা upstream optical path পরীক্ষা করুন.";

        likelyCause =
            "PON-level connectivity বা upstream optical path issue হওয়ার সম্ভাবনা বেশি.";

        confidence =
            stale === 0
                ? "high"
                : "medium";

        recommendedChecks = [
            "OLT PON port status পরীক্ষা করুন",
            "PON optical signal পরীক্ষা করুন",
            "Splitter / feeder fiber পরীক্ষা করুন",
            "Upstream optical path পরীক্ষা করুন",
            "প্রয়োজনে OTDR test করুন"
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | MANY ONU OFFLINE
    |--------------------------------------------------------------------------
    */

    else if (
        offline >= 3 &&
        offlinePercent >= 30
    ) {
        severity = "critical";

        faultType =
            "Possible Fiber Fault";

        reason =
            "একই PON-এর একাধিক ONU offline। Fiber line বা splitter path-এ সমস্যা থাকার সম্ভাবনা আছে.";

        likelyCause =
            "Shared fiber / splitter path degradation বা interruption হতে পারে.";

        confidence =
            stale === 0
                ? "high"
                : "medium";

        recommendedChecks = [
            "Offline ONU-গুলোর common fiber path পরীক্ষা করুন",
            "Splitter output পরীক্ষা করুন",
            "PON RX / optical level পরীক্ষা করুন",
            "Feeder / distribution fiber পরীক্ষা করুন",
            "প্রয়োজনে OTDR test করুন"
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | OPTICAL LOSS
    |--------------------------------------------------------------------------
    */

    else if (
        criticalRx >= 2 ||
        weakRx >= 3
    ) {
        severity = "warning";

        faultType =
            "Possible Optical Loss";

        reason =
            "একাধিক ONU-এর RX optical power দুর্বল/critical অবস্থায় আছে। Fiber loss, connector, splitter বা optical path পরীক্ষা করুন.";

        likelyCause =
            "Optical attenuation, connector, splitter অথবা fiber path loss হতে পারে.";

        confidence =
            stale === 0
                ? "medium"
                : "low";

        recommendedChecks = [
            "Affected ONU-এর RX power পরীক্ষা করুন",
            "Connector cleaning / inspection করুন",
            "Splitter optical loss পরীক্ষা করুন",
            "Fiber bending / damage পরীক্ষা করুন",
            "প্রয়োজনে OTDR test করুন"
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | SINGLE ONU
    |--------------------------------------------------------------------------
    */

    else if (
        offline === 1
    ) {
        severity = "warning";

        faultType =
            "Single ONU Offline";

        reason =
            "শুধু একটি ONU offline। Customer power, ONU device, drop fiber অথবা local connection পরীক্ষা করুন.";

        likelyCause =
            "Customer-side power, ONU device অথবা drop fiber issue হতে পারে.";

        confidence =
            stale === 0
                ? "medium"
                : "low";

        recommendedChecks = [
            "Customer ONU power পরীক্ষা করুন",
            "ONU LOS / PON indicator পরীক্ষা করুন",
            "Adapter / power supply পরীক্ষা করুন",
            "Drop fiber পরীক্ষা করুন",
            "Customer-side connector পরীক্ষা করুন"
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | MULTIPLE ONU
    |--------------------------------------------------------------------------
    */

    else {
        severity = "warning";

        faultType =
            "Multiple ONU Offline";

        reason =
            "একই PON-এ একাধিক ONU offline। Splitter, fiber path, optical signal এবং PON port পরীক্ষা করুন.";

        likelyCause =
            "Shared splitter / fiber / optical path issue হতে পারে.";

        confidence =
            stale === 0
                ? "medium"
                : "low";

        recommendedChecks = [
            "Affected ONU-গুলোর common path পরীক্ষা করুন",
            "Splitter output পরীক্ষা করুন",
            "PON optical level পরীক্ষা করুন",
            "PON port status পরীক্ষা করুন"
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | DISTANCE INFORMATION
    |--------------------------------------------------------------------------
    */

    if (
        estimated.available &&
        offline >= 2
    ) {
        reason +=
            ` Estimated affected area: ${estimated.text}.`;
    }

    /*
    |--------------------------------------------------------------------------
    | RX DETAILS
    |--------------------------------------------------------------------------
    */

    if (
        criticalRx > 0
    ) {
        reason +=
            ` Critical RX ONU: ${criticalRx}.`;
    }

    if (
        weakRx > 0
    ) {
        reason +=
            ` Weak RX ONU: ${weakRx}.`;
    }

    /*
    |--------------------------------------------------------------------------
    | STALE MIXED DATA
    |--------------------------------------------------------------------------
    */

    if (
        stale > 0 &&
        stale < total
    ) {
        reason +=
            ` Warning: ${stale} ONU data stale.`;

        confidence =
            confidence === "high"
                ? "medium"
                : "low";
    }

    return {
        severity,
        faultType,
        reason,
        likelyCause,
        confidence,
        recommendedChecks
    };
}

/*
|--------------------------------------------------------------------------
| EMPTY RESULT
|--------------------------------------------------------------------------
*/

function emptyResult() {
    return {
        faults: [],

        summary: {
            total: 0,
            critical: 0,
            warning: 0,
            recovered: 0,

            affected_onu: 0,
            affected_pon: 0,
            stale_pon: 0
        },

        updated_at:
            new Date()
    };
}

/*
|--------------------------------------------------------------------------
| MAIN DETECTOR
|--------------------------------------------------------------------------
*/

async function detectNetworkFaults(
    db,
    companyId = 0,
    isSuperAdmin = false
) {
    let sql = `
        SELECT
            o.id,
            o.olt_id,
            o.pon,
            o.status,
            o.onu_mac,
            o.onu_sn,
            o.distance,
            o.rx_power,
            o.tx_power,
            o.last_update,
            ol.name AS olt_name
        FROM onu o
        LEFT JOIN olts ol
            ON ol.id = o.olt_id
    `;

    const params = [];

    /*
    |--------------------------------------------------------------------------
    | TENANT SECURITY
    |--------------------------------------------------------------------------
    */

    if (!isSuperAdmin) {
        if (
            !companyId ||
            Number(companyId) <= 0
        ) {
            return emptyResult();
        }

        sql += `
            WHERE ol.company_id = ?
        `;

        params.push(
            Number(companyId)
        );
    }

    sql += `
        ORDER BY
            o.olt_id ASC,
            o.pon ASC,
            o.id ASC
    `;

    const [rows] =
        await db.execute(
            sql,
            params
        );

    /*
    |--------------------------------------------------------------------------
    | GROUP BY OLT + PON
    |--------------------------------------------------------------------------
    */

    const groups =
        new Map();

    for (const row of rows) {
        const oltId =
            Number(
                row.olt_id ?? 0
            );

        const pon =
            String(
                row.pon ?? ""
            ).trim();

        if (
            oltId <= 0
        ) {
            continue;
        }

        const groupKey =
            `${oltId}|${pon}`;

        if (
            !groups.has(groupKey)
        ) {
            groups.set(
                groupKey,
                {
                    olt_id: oltId,

                    olt_name:
                        String(
                            row.olt_name ?? ""
                        ),

                    pon,

                    total: 0,
                    online: 0,
                    offline: 0,
                    stale: 0,

                    fresh: 0,

                    all_onus: [],
                    offline_onus: [],
                    stale_onus: [],

                    last_update: ""
                }
            );
        }

        const group =
            groups.get(groupKey);

        group.total++;

        const status =
            String(
                row.status ?? ""
            )
                .trim()
                .toLowerCase();

        const isOnline =
            nfIsOnline(status);

        if (isOnline) {
            group.online++;
        } else {
            group.offline++;
        }

        const lastUpdate =
            String(
                row.last_update ?? ""
            );

        const stale =
            nfIsStale(
                row.last_update
            );

        if (stale) {
            group.stale++;

        } else {
            group.fresh++;
        }

        const onuData = {
            id:
                Number(
                    row.id ?? 0
                ),

            onu_mac:
                String(
                    row.onu_mac ?? ""
                ),

            onu_sn:
                String(
                    row.onu_sn ?? ""
                ),

            status:
                String(
                    row.status ?? ""
                ),

            distance:
                String(
                    row.distance ?? ""
                ),

            rx_power:
                String(
                    row.rx_power ?? ""
                ),

            tx_power:
                String(
                    row.tx_power ?? ""
                ),

            last_update:
                lastUpdate,

            is_online:
                isOnline,

            is_stale:
                stale,

            data_age_seconds:
                nfDataAgeSeconds(
                    row.last_update
                )
        };

        group.all_onus.push(
            onuData
        );

        if (!isOnline) {
            group.offline_onus.push(
                onuData
            );
        }

        if (stale) {
            group.stale_onus.push(
                onuData
            );
        }

        group.last_update =
            nfLatestDateValue(
                group.last_update,
                lastUpdate
            );
    }

    /*
    |--------------------------------------------------------------------------
    | ANALYZE GROUPS
    |--------------------------------------------------------------------------
    */

    const faults = [];

    for (
        const group of groups.values()
    ) {
        const total =
            Number(group.total);

        const online =
            Number(group.online);

        const offline =
            Number(group.offline);

        const stale =
            Number(group.stale);

        /*
        | No offline ONU means no active
        | network fault for this PON.
        |
        | We still don't generate a healthy row,
        | because Live Fault should show faults only.
        */

        if (
            offline <= 0
        ) {
            continue;
        }

        const offlinePercent =
            total > 0
                ? (
                    offline /
                    total
                ) * 100
                : 0;

        /*
        |--------------------------------------------------------------------------
        | DISTANCE
        |--------------------------------------------------------------------------
        */

        const estimated =
            nfEstimateFaultArea(
                group.all_onus,
                group.offline_onus
            );

        /*
        |--------------------------------------------------------------------------
        | RX ANALYSIS
        |--------------------------------------------------------------------------
        */

        const rxAnalysis =
            nfAnalyzeRx(
                group.all_onus
            );

        const criticalRx =
            rxAnalysis.critical;

        const weakRx =
            rxAnalysis.weak;

        /*
        |--------------------------------------------------------------------------
        | DIAGNOSIS
        |--------------------------------------------------------------------------
        */

        const diagnosis =
            nfBuildDiagnosis({
                total,
                online,
                offline,
                stale,
                offlinePercent,
                criticalRx,
                weakRx,
                estimated
            });

        /*
        |--------------------------------------------------------------------------
        | PON HEALTH
        |--------------------------------------------------------------------------
        */

        const ponHealth =
            nfPonHealth(
                total,
                online,
                offline,
                stale,
                criticalRx,
                weakRx
            );

        /*
        |--------------------------------------------------------------------------
        | FAULT ID / FINGERPRINT
        |--------------------------------------------------------------------------
        |
        | Same OLT + PON + fault type = same fingerprint.
        | This allows the frontend/database notification
        | layer to identify the same recurring fault.
        |
        */

        const faultId =
            crypto
                .createHash("md5")
                .update(
                    `${group.olt_id}|${group.pon}|${diagnosis.faultType}`
                )
                .digest("hex");

        /*
        |--------------------------------------------------------------------------
        | OFFLINE ONU SUMMARY
        |--------------------------------------------------------------------------
        */

        const offlineList =
            group.offline_onus.map(
                onu => ({
                    ...onu,

                    rx_severity:
                        nfRxSeverity(
                            nfFaultNumber(
                                onu.rx_power
                            )
                        )
                })
            );

        /*
        |--------------------------------------------------------------------------
        | FAULT OBJECT
        |--------------------------------------------------------------------------
        */

        faults.push({
            /*
            | Existing fields
            */

            id:
                faultId,

            severity:
                diagnosis.severity,

            fault_type:
                diagnosis.faultType,

            type:
                diagnosis.faultType,

            olt_id:
                group.olt_id,

            olt_name:
                group.olt_name,

            pon:
                group.pon,

            affected_onu:
                offline,

            total_onu:
                total,

            online_onu:
                online,

            offline_onu:
                offline,

            offline_percent:
                Number(
                    offlinePercent.toFixed(2)
                ),

            reason:
                diagnosis.reason,

            detected_at:
                new Date(),

            last_update:
                group.last_update,

            estimated_fault_area:
                estimated.available
                    ? estimated.text
                    : "Distance data unavailable",

            estimated_min_km:
                estimated.min,

            estimated_max_km:
                estimated.max,

            estimated_confidence:
                estimated.confidence,

            nearest_online_km:
                estimated.nearest_online,

            critical_rx_count:
                criticalRx,

            weak_rx_count:
                weakRx,

            offline_list:
                offlineList,

            /*
            |--------------------------------------------------------------------------
            | New diagnostic fields
            |--------------------------------------------------------------------------
            */

            likely_cause:
                diagnosis.likelyCause,

            recommended_checks:
                diagnosis.recommendedChecks,

            fault_confidence:
                diagnosis.confidence,

            pon_health:
                ponHealth,

            stale_onu_count:
                stale,

            fresh_onu_count:
                group.fresh,

            data_quality:
                stale === total
                    ? "stale"
                    : stale > 0
                        ? "partial_stale"
                        : "fresh",

            stale_percent:
                total > 0
                    ? Number(
                        (
                            stale /
                            total
                        ).toFixed(2)
                    )
                    : 0,

            rx_average:
                rxAnalysis.average_rx,

            rx_min:
                rxAnalysis.minimum_rx,

            rx_max:
                rxAnalysis.maximum_rx,

            rx_normal_count:
                rxAnalysis.normal,

            rx_warning_count:
                rxAnalysis.warning,

            rx_unknown_count:
                rxAnalysis.unknown,

            measured_rx_count:
                rxAnalysis.measured,

            data_age_seconds:
                group.last_update
                    ? nfDataAgeSeconds(
                        group.last_update
                    )
                    : null,

            /*
            |--------------------------------------------------------------------------
            | Fault classification metadata
            |--------------------------------------------------------------------------
            */

            fault_fingerprint:
                faultId,

            detection_version:
                "2.0"
        });
    }

    /*
    |--------------------------------------------------------------------------
    | SORT
    |--------------------------------------------------------------------------
    */

    const priority = {
        critical: 1,
        warning: 2,
        recovered: 3,
        info: 4
    };

    faults.sort(
        (a, b) => {
            const pa =
                priority[
                    a.severity
                ] ?? 99;

            const pb =
                priority[
                    b.severity
                ] ?? 99;

            if (
                pa !== pb
            ) {
                return pa - pb;
            }

            /*
            | More affected ONU first.
            */

            const affectedDifference =
                Number(
                    b.affected_onu ?? 0
                ) -
                Number(
                    a.affected_onu ?? 0
                );

            if (
                affectedDifference !== 0
            ) {
                return affectedDifference;
            }

            /*
            | Critical RX count next.
            */

            const rxDifference =
                Number(
                    b.critical_rx_count ?? 0
                ) -
                Number(
                    a.critical_rx_count ?? 0
                );

            if (
                rxDifference !== 0
            ) {
                return rxDifference;
            }

            /*
            | Finally OLT / PON.
            */

            return (
                Number(
                    a.olt_id ?? 0
                ) -
                Number(
                    b.olt_id ?? 0
                )
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | SUMMARY
    |--------------------------------------------------------------------------
    */

    let critical = 0;
    let warning = 0;
    let recovered = 0;

    let affectedOnu = 0;

    const affectedPonSet =
        new Set();

    let stalePon = 0;

    for (
        const fault of faults
    ) {
        if (
            fault.severity ===
            "critical"
        ) {
            critical++;
        } else if (
            fault.severity ===
            "warning"
        ) {
            warning++;
        } else if (
            fault.severity ===
            "recovered"
        ) {
            recovered++;
        }

        affectedOnu +=
            Number(
                fault.offline_onu ?? 0
            );

        affectedPonSet.add(
            `${fault.olt_id}|${fault.pon}`
        );

        if (
            fault.data_quality ===
            "stale"
        ) {
            stalePon++;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | RESULT
    |--------------------------------------------------------------------------
    */

    return {
        faults,

        summary: {
            total:
                faults.length,

            critical,

            warning,

            recovered,

            affected_onu:
                affectedOnu,

            affected_pon:
                affectedPonSet.size,

            stale_pon:
                stalePon
        },

        updated_at:
            new Date()
    };
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
    nfFaultNumber,
    nfIsOnline,
    nfRxSeverity,
    nfEstimateFaultArea,
    detectNetworkFaults
};