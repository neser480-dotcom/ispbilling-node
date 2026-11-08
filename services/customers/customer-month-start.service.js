"use strict";

/*
|--------------------------------------------------------------------------
| CUSTOMER MONTH START
|--------------------------------------------------------------------------
| Runs once per month, on the 1st (Asia/Dhaka).
|
| For every customer (not deleted, all companies):
|   - payment_status -> 'paid' if the balance covers one month, else 'unpaid'
|   - balance        -> NOT touched (it is the customer's real money / advance)
|   - promise_date   -> the customer's billing-cycle day (and time) in the
|                       new month. Billing day 3 -> promise 3rd of this month.
|                       Day 31 in a 30-day month -> last day of the month.
|                       No valid billing_cycle -> promise_date cleared (NULL).
|                       A promise_date that is already LATER is kept, and that
|                       customer's balance is kept too (day left unchanged).
|
| NOT touched:
|   - billing_cycle  (stays on the same day)
|   - status         (Active stays Active; customer-auto-expire.service.js
|                     expires them after billing/promise date passes)
|
| Safety:
|   - monthly_billing_runs   : one row per month, so it can never run twice
|   - monthly_billing_snapshots : old balance / payment_status / promise_date
|                                 of every customer, so nothing is lost
|--------------------------------------------------------------------------
*/

const db = require("../../config/database");

const SETTINGS = {
    TIMEZONE: "Asia/Dhaka",
    RUN_ON_DAY: 1,            /* day of month the reset runs */
    RESET_BALANCE: false      /* wallet rule: balance is real money, never wiped */
};

function nowInZone(timeZone) {

    const stamp = new Intl.DateTimeFormat("sv-SE", {
        timeZone,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false
    }).format(new Date());

    return {
        period: stamp.slice(0, 7),            /* YYYY-MM */
        day: Number(stamp.slice(8, 10))
    };
}

async function hasColumn(table, name) {

    const [cols] = await db.query(`SHOW COLUMNS FROM \`${table}\``);

    return cols.some(c => c.Field === name);
}

async function ensureTables() {

    await db.query(
        `CREATE TABLE IF NOT EXISTS monthly_billing_runs (
            period CHAR(7) NOT NULL PRIMARY KEY,
            ran_at DATETIME NOT NULL,
            affected INT NOT NULL DEFAULT 0
         )`
    );

    await db.query(
        `CREATE TABLE IF NOT EXISTS monthly_billing_snapshots (
            id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            period CHAR(7) NOT NULL,
            customer_id BIGINT NOT NULL,
            company_id BIGINT NULL,
            balance DECIMAL(12,2) NULL,
            payment_status VARCHAR(20) NULL,
            promise_date DATETIME NULL,
            KEY idx_period (period),
            KEY idx_customer (customer_id)
         )`
    );
}

async function run({ log = console.log, settings = {}, force = false } = {}) {

    const cfg = { ...SETTINGS, ...settings };

    const { period, day } = nowInZone(cfg.TIMEZONE);

    if (!force && day !== cfg.RUN_ON_DAY) {
        return { skipped: true, reason: "not the run day" };
    }

    await ensureTables();

    const notDeleted = (await hasColumn("customers", "deleted_at"))
        ? "deleted_at IS NULL"
        : "1 = 1";

    /* new promise_date = billing_cycle day + time, inside the new month */
    const computed =
        `(CASE WHEN billing_cycle IS NULL OR billing_cycle <= '1000-01-01' THEN NULL
               ELSE TIMESTAMP(
                      CONCAT('${period}', '-',
                             LPAD(LEAST(DAY(billing_cycle), DAY(LAST_DAY('${period}-01'))), 2, '0')),
                      TIME(billing_cycle)
                    )
          END)`;

    /*
     * A customer whose promise_date is already LATER than the new one keeps
     * promise_date AND balance untouched (day left stays the same).
     */
    const keepsExtension =
        `(promise_date IS NOT NULL AND promise_date > COALESCE(${computed}, NOW()))`;

    const promiseSql =
        `CASE WHEN ${keepsExtension} THEN promise_date ELSE ${computed} END`;

    /*
     * Only customers whose billing_cycle falls in this month (or earlier) are
     * due now. Customers prepaid into a LATER month stay paid.
     */
    const dueThisMonth =
        `(billing_cycle IS NULL OR billing_cycle <= '1000-01-01'
          OR billing_cycle < DATE_ADD('${period}-01', INTERVAL 1 MONTH))`;

    const balanceSet = cfg.RESET_BALANCE
        ? `balance = CASE WHEN ${keepsExtension} THEN balance ELSE 0 END,`
        : "";

    const conn = await db.getConnection();

    try {

        await conn.beginTransaction();

        const [mark] = await conn.query(
            "INSERT IGNORE INTO monthly_billing_runs (period, ran_at, affected) VALUES (?, NOW(), 0)",
            [period]
        );

        if (!mark.affectedRows) {
            await conn.rollback();
            return { skipped: true, reason: "already ran this month" };
        }

        await conn.query(
            `INSERT INTO monthly_billing_snapshots
                (period, customer_id, company_id, balance, payment_status, promise_date)
             SELECT ?, id, company_id, balance, payment_status, promise_date
             FROM customers
             WHERE ${notDeleted}`,
            [period]
        );

        /* balance is assigned BEFORE promise_date so it still sees the old promise_date */
        const [upd] = await conn.query(
            `UPDATE customers
             SET payment_status = CASE
                     WHEN COALESCE(monthly_bill, 0) > 0 AND COALESCE(balance, 0) >= COALESCE(monthly_bill, 0)
                     THEN 'paid' ELSE 'unpaid' END,
                 ${balanceSet}
                 promise_date = ${promiseSql}
             WHERE ${notDeleted} AND ${dueThisMonth}`
        );

        await conn.query(
            "UPDATE monthly_billing_runs SET affected = ? WHERE period = ?",
            [upd.affectedRows, period]
        );

        await conn.commit();

        log(`Month start ${period}: ${upd.affectedRows} customers -> unpaid, promise = billing day (longer promise kept)` +
            (cfg.RESET_BALANCE ? ", balance 0" : ""));

        try {
            await db.query(
                `INSERT INTO activity_logs
                    (user_id, company_id, customer_id, action, description, module, created_at)
                 SELECT 0, company_id, 0, 'month_start',
                        CONCAT('Month start ${period}: ', COUNT(*), ' customers set unpaid'),
                        'customers', NOW()
                 FROM customers
                 WHERE ${notDeleted}
                 GROUP BY company_id`
            );
        } catch (_) {}

        return { skipped: false, period, affected: upd.affectedRows };

    } catch (e) {

        try { await conn.rollback(); } catch (_) {}

        throw e;

    } finally {
        conn.release();
    }
}

module.exports = { SETTINGS, run };
