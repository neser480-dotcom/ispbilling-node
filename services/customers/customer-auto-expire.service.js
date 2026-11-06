"use strict";

/*
|--------------------------------------------------------------------------
| CUSTOMER AUTO EXPIRE
|--------------------------------------------------------------------------
| Port of customers/cron/auto_expire.php  (bulk/auto_expire.php is identical)
|
| 1) EXPIRE: Active customers whose promise date has passed (or, with no
|    promise date, whose billing cycle has passed) are moved to the MikroTik
|    block profile and set to status 'Expired'.
| 2) OPTIONAL (AUTO_REACTIVATE): Expired customers whose date moved to the
|    future become Active again.
|
| Date-only values (00:00:00) count as valid for the whole day.
|--------------------------------------------------------------------------
*/

const db = require("../../config/database");
const ppp = require("../ppp.service");

const SETTINGS = {
    AUTO_REACTIVATE: false,  /* true = Expired customer with a future date becomes Active again */
    MAX_PER_RUN: 300,        /* customers handled per run */
    TIMEZONE: "Asia/Dhaka"
};


function nowInZone(timeZone) {

    /* "sv-SE" prints "YYYY-MM-DD HH:mm:ss" */
    const stamp = new Intl.DateTimeFormat("sv-SE", {
        timeZone,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false
    }).format(new Date());

    return { now: stamp, today: stamp.slice(0, 10) };
}

function expiredExpr(col, now, today) {
    return `(\`${col}\` > '1000-01-01' AND ((\`${col}\` <= '${now}' AND TIME(\`${col}\`) <> '00:00:00') OR DATE(\`${col}\`) < '${today}'))`;
}

function emptyExpr(col) {
    return `(\`${col}\` IS NULL OR \`${col}\` <= '1000-01-01')`;
}

async function firstColumn(table, candidates) {

    const [cols] = await db.query(`SHOW COLUMNS FROM \`${table}\``);

    const have = new Set(cols.map(c => c.Field));

    return candidates.find(c => have.has(c)) || null;
}

async function activity(c, action, text) {

    try {
        await db.query(
            `INSERT INTO activity_logs
                (user_id, company_id, customer_id, action, description, module, created_at)
             VALUES (0, ?, ?, ?, ?, 'customers', NOW())`,
            [Number(c.company_id), Number(c.id), action, String(text).slice(0, 500)]
        );
    } catch (_) {}
}


/*
|--------------------------------------------------------------------------
| RUN
|--------------------------------------------------------------------------
| `log(message)` receives every line. Returns the counters.
|--------------------------------------------------------------------------
*/

async function run({ log = console.log, settings = {} } = {}) {

    const cfg = { ...SETTINGS, ...settings };

    const { now, today } = nowInZone(cfg.TIMEZONE);

    const promiseCol = await firstColumn("customers", ["promise_date"]);
    const billingCol = await firstColumn("customers", ["billing_cycle"]);
    const autoCol = await firstColumn("customers", [
        "auto_connection", "automatic_connection", "connection_enabled",
        "auto_connect", "connection_on"
    ]);
    const userCol = await firstColumn("customers", [
        "pppoe_username", "username", "user_name", "login"
    ]);
    const deletedCol = await firstColumn("customers", ["deleted_at"]);
    const payCol = await firstColumn("customers", ["payment_status"]);

    if (!promiseCol || !userCol) {
        log("STOP: promise_date or PPPoE username column not found in customers table.");
        return null;
    }

    const promiseExpired = expiredExpr(promiseCol, now, today);

    let expired = promiseExpired;

    if (billingCol) {
        expired = `(${promiseExpired} OR (${emptyExpr(promiseCol)} AND ${expiredExpr(billingCol, now, today)}))`;
    }

    const hasPromise = `(\`${promiseCol}\` > '1000-01-01')`;

    const common =
        (deletedCol ? `\`${deletedCol}\` IS NULL AND ` : "") +
        (autoCol ? `COALESCE(\`${autoCol}\`, 1) = 1 AND ` : "");

    /* paid customers are never expired */
    const unpaidOnly = payCol
        ? ` AND LOWER(COALESCE(\`${payCol}\`, '')) <> 'paid'`
        : "";

    const counts = { expired: 0, renewed: 0, reactivated: 0, skipped: 0, failed: 0 };

    /* customers belong to many companies - one super session serves all routers */
    const session = ppp.createSession({ isSuper: true });

    try {

        /* ---------- 1) EXPIRE ---------- */
        const [toExpire] = await db.query(
            `SELECT id, company_id, name, mikrotik_id, monthly_bill, balance,
                    \`${userCol}\` AS pppoe, \`${promiseCol}\` AS promise
             FROM customers
             WHERE ${common} LOWER(status) = 'active' AND ${expired}${unpaidOnly}
             ORDER BY id ASC
             LIMIT ?`,
            [cfg.MAX_PER_RUN]
        );

        for (const c of toExpire) {

            const cid = Number(c.id);
            const pppoe = String(c.pppoe || "").trim();
            const label = `#${cid} ${c.name} (${pppoe})`;

            try {

                /*
                 * Promise / billing date has passed:
                 *   balance covers the monthly bill -> take it from balance,
                 *   move billing cycle one month, customer stays Active.
                 *   no balance                      -> expire (below).
                 */
                if (payCol && Number(c.monthly_bill) > 0 && Number(c.balance) >= Number(c.monthly_bill)) {

                    const cycleSet = billingCol
                        ? `, \`${billingCol}\` = CASE WHEN \`${billingCol}\` > '1000-01-01'
                                 THEN DATE_ADD(\`${billingCol}\`, INTERVAL 1 MONTH)
                                 ELSE \`${billingCol}\` END`
                        : "";

                    const [renew] = await db.query(
                        `UPDATE customers
                         SET balance = balance - monthly_bill,
                             \`${payCol}\` = 'paid'${cycleSet}
                         WHERE id = ? AND monthly_bill > 0 AND balance >= monthly_bill
                         LIMIT 1`,
                        [cid]
                    );

                    if (renew.affectedRows) {

                        await activity(
                            c, "auto_balance_deduct",
                            `Auto renewed from balance: ${c.name} | Bill: ${c.monthly_bill} | Balance was: ${c.balance}`
                        );

                        counts.renewed++;
                        log(`RENEWED ${label} (bill ${c.monthly_bill} taken from balance ${c.balance})`);
                        continue;
                    }
                }

                const routerId = await ppp.resolveRouter(session, {
                    customerId: cid, mikrotikId: Number(c.mikrotik_id || 0), pppoe
                });

                if (routerId <= 0 || !pppoe) {
                    counts.skipped++;
                    log(`SKIP  ${label}: no MikroTik router / PPPoE username linked.`);
                    continue;
                }

                const api = await session.api(routerId);

                await ppp.blockCustomer(api, {
                    pppoe,
                    blockProfileName: await ppp.blockProfile(routerId),
                    customerId: cid
                });

                await db.query(
                    "UPDATE customers SET status = 'Expired' WHERE id = ? LIMIT 1",
                    [cid]
                );

                await activity(c, "auto_expire", `Auto expired: ${c.name} | Date: ${c.promise}`);

                counts.expired++;
                log(`EXPIRED ${label} (date ${c.promise})`);

            } catch (e) {
                counts.failed++;
                log(`FAIL  ${label}: ${e.message} - will retry in 10 minutes.`);
            }
        }

        /* ---------- 2) OPTIONAL: reactivate ---------- */
        if (cfg.AUTO_REACTIVATE) {

            const [toActivate] = await db.query(
                `SELECT id, company_id, name, mikrotik_id, \`${userCol}\` AS pppoe, \`${promiseCol}\` AS promise
                 FROM customers
                 WHERE ${common} LOWER(status) = 'expired' AND ${hasPromise} AND NOT ${promiseExpired}
                 ORDER BY id ASC
                 LIMIT ?`,
                [cfg.MAX_PER_RUN]
            );

            for (const c of toActivate) {

                const cid = Number(c.id);
                const pppoe = String(c.pppoe || "").trim();
                const label = `#${cid} ${c.name} (${pppoe})`;

                try {

                    const routerId = await ppp.resolveRouter(session, {
                        customerId: cid, mikrotikId: Number(c.mikrotik_id || 0), pppoe
                    });

                    if (routerId <= 0 || !pppoe) continue;

                    const api = await session.api(routerId);

                    await ppp.unblockCustomer(api, { pppoe, routerId, customerId: cid });

                    await db.query(
                        "UPDATE customers SET status = 'Active' WHERE id = ? LIMIT 1",
                        [cid]
                    );

                    await activity(c, "auto_reactivate", `Auto reactivated: ${c.name} | Date: ${c.promise}`);

                    counts.reactivated++;
                    log(`ACTIVE ${label} (date ${c.promise})`);

                } catch (e) {
                    counts.failed++;
                    log(`FAIL  ${label}: ${e.message}`);
                }
            }
        }

    } finally {
        await session.closeAll();
    }

    if (counts.expired || counts.renewed || counts.failed || counts.skipped || counts.reactivated) {
        log(`Finished: expired=${counts.expired}, renewed=${counts.renewed}, reactivated=${counts.reactivated}, skipped=${counts.skipped}, failed=${counts.failed}`);
    } else {
        log("Nothing to expire.");
    }

    return counts;
}


module.exports = { SETTINGS, run, _test: { expiredExpr, emptyExpr, nowInZone } };
