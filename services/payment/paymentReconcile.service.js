"use strict";

/*
|--------------------------------------------------------------------------
| PAYMENT RECONCILIATION  (background safety net)
|--------------------------------------------------------------------------
| Every few minutes:
|   * "verified"  = money confirmed, ledger step did not finish  -> retry
|   * "pending"   = customer paid but never came back to our site -> ask the
|                   gateway (server-to-server) via settle()
| Only transactions from the last 24h are re-checked while pending.
| settle() is idempotent, so running it here and from callbacks together
| is safe. Never marks anything failed on its own: only the gateway can.
|--------------------------------------------------------------------------
*/

const db = require("../../config/database");
const paymentService = require("./payment.service");
const settlement = require("./paymentSettlement.service");

const INTERVAL_MS = 5 * 60 * 1000;
const MIN_AGE_MIN = 3;
const MAX_AGE_HOURS = 24;
const BATCH = 50;

let timer = null;
let running = false;

async function runOnce() {
    if (running) {
        return { checked: 0, skipped: true };
    }

    running = true;

    try {
        const [rows] = await db.execute(
            `
            SELECT id
            FROM payment_transactions
            WHERE applied_at IS NULL
              AND (
                    status = 'verified'
                 OR (
                        status = 'pending'
                    AND created_at <= (NOW() - INTERVAL ${MIN_AGE_MIN} MINUTE)
                    AND created_at >= (NOW() - INTERVAL ${MAX_AGE_HOURS} HOUR)
                 )
              )
            ORDER BY id ASC
            LIMIT ${BATCH}
            `
        );

        let paid = 0;

        for (const row of rows) {
            try {
                const transaction =
                    await paymentService.getTransactionById(row.id);

                if (!transaction) {
                    continue;
                }

                const outcome = await settlement.settle(transaction, {
                    clientIp: "127.0.0.1"
                });

                if (outcome.state === "paid") {
                    paid++;
                }
            } catch (error) {
                console.error(
                    `PAYMENT RECONCILE ERROR [${row.id}]:`,
                    error.message
                );
            }
        }

        return { checked: rows.length, paid };
    } catch (error) {
        console.error("PAYMENT RECONCILE ERROR:", error.message);

        return { checked: 0, error: error.message };
    } finally {
        running = false;
    }
}

function start() {
    if (timer || process.env.PAYMENT_RECONCILE === "0") {
        return;
    }

    timer = setInterval(runOnce, INTERVAL_MS);

    if (timer.unref) {
        timer.unref();
    }
}

module.exports = { start, runOnce };
