"use strict";

/*
| services/monthlyBilling.js
|
| Creates the monthly software bill automatically.
|
|  - due date  : BILLING_DUE_DAY of the month (default 7th), 11:59:59 PM
|  - bill is created NOTICE_DAYS (7) days before the due date, so the
|    dashboard notice (which already shows only inside the 7-day window)
|    appears exactly 7 days before.
|  - amount    : software_packages.monthly_fee of the user's package
|  - never creates a second bill for the same user in the same month, and
|    never while an older monthly bill is still unpaid.
*/

const db = require("../config/database");

const DUE_DAY = Math.min(28, Math.max(1, Number(process.env.BILLING_DUE_DAY || 7)));
const NOTICE_DAYS = 7;
const CHECK_EVERY_MS = 60 * 60 * 1000;

/* Bangladesh time (UTC+6), independent of the server's own timezone */
const BD_OFFSET_MS = 6 * 60 * 60 * 1000;
const pad = n => String(n).padStart(2, "0");

/* wall-clock string in BD time for a given UTC-based Date */
const wall = d =>
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;

async function generate() {
    const nowMs = Date.now();
    const bd = new Date(nowMs + BD_OFFSET_MS);          /* BD wall clock via UTC getters */
    const y = bd.getUTCFullYear();
    const mo = bd.getUTCMonth();

    const dueWall = new Date(Date.UTC(y, mo, DUE_DAY, 23, 59, 59));
    const dueMs = dueWall.getTime() - BD_OFFSET_MS;     /* the real instant */
    const opensMs = dueMs - NOTICE_DAYS * 24 * 3600 * 1000;

    if (nowMs < opensMs || nowMs > dueMs) return 0;

    const monthStart = new Date(Date.UTC(y, mo, 1));
    const nextMonth = new Date(Date.UTC(y, mo + 1, 1));
    const period = `${y}-${pad(mo + 1)}`;
    const due = dueWall;

    /* one connection: the named lock must be taken and released on it.
       GET_LOCK stops two app instances (pm2 cluster, double start) from
       generating at the same time. */
    const conn = await db.getConnection();

    try {
        const [[lock]] = await conn.query(
            "SELECT GET_LOCK('netfee_monthly_billing', 0) AS ok"
        );

        if (Number(lock.ok) !== 1) return 0;

        try {
            const [result] = await conn.execute(
                `
                INSERT IGNORE INTO software_billing_notifications
                    (company_id, user_id, billing_type, package_id, package_code,
                     amount, status, due_date, billing_period)
                SELECT u.company_id, u.id, 'monthly', p.id, p.package_code,
                       p.monthly_fee, 'unpaid', ?, ?
                FROM users u
                JOIN software_packages p
                  ON p.id = u.package_id AND p.status = 'active'
                WHERE u.role = 'admin'
                  AND u.status = 'active'
                  AND u.company_id > 0
                  AND p.monthly_fee > 0
                  AND NOT EXISTS (
                        SELECT 1 FROM software_billing_notifications r
                        WHERE r.user_id = u.id
                          AND r.billing_type = 'registration'
                          AND r.status = 'unpaid')
                  AND NOT EXISTS (
                        SELECT 1 FROM software_billing_notifications m
                        WHERE m.user_id = u.id
                          AND m.billing_type = 'monthly'
                          AND (m.status = 'unpaid'
                               OR m.billing_period = ?
                               OR (m.due_date >= ? AND m.due_date < ?)
                               OR m.created_at >= ?))
                `,
                [wall(due), period, period, wall(monthStart), wall(nextMonth), wall(monthStart)]
            );

            return result.affectedRows || 0;
        } finally {
            await conn.query("SELECT RELEASE_LOCK('netfee_monthly_billing')");
        }
    } finally {
        conn.release();
    }
}

let running = false;
let started = false;

async function tick() {
    if (running) return;          /* previous run still going */
    running = true;

    try {
        const n = await generate();
        if (n > 0) console.log(`[monthlyBilling] created ${n} bill(s)`);
    } catch (e) {
        console.error("[monthlyBilling] error:", e.message);
    } finally {
        running = false;
    }
}

function start() {
    if (started) return;          /* calling start() twice does nothing */
    started = true;

    setTimeout(tick, 15 * 1000).unref();
    setInterval(tick, CHECK_EVERY_MS).unref();
}

module.exports = { start, generate };
