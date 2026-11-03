"use strict";

/*
| Runs every 10 minutes:
|   1) customer-month-start.service.js  (acts only on the 1st of the month)
|   2) customer-auto-expire.service.js
|
| Put this file in the SAME folder as both services.
|
| - start() is safe to call twice (second call does nothing)
| - a run never overlaps with the previous one
| - GET_LOCK stops two app instances from running it together
*/

const db = require("../../config/database");
const expireService = require("./customer-auto-expire.service");
const monthStart = require("./customer-month-start.service");

const EVERY_MS = 10 * 60 * 1000;

let started = false;
let running = false;

async function tick() {
    if (running) return;
    running = true;

    let conn = null;

    try {
        conn = await db.getConnection();

        const [[lock]] = await conn.query("SELECT GET_LOCK('netfee_auto_expire', 0) AS ok");

        if (Number(lock.ok) !== 1) return;

        try {

            /* month start FIRST, so old promise dates never expire anyone on the 1st */
            try {
                await monthStart.run({
                    log: msg => console.log("[monthStart]", msg)
                });
            } catch (e) {
                console.error("[monthStart] error:", e.message);
            }

            await expireService.run({
                log: msg => {
                    if (msg !== "Nothing to expire.") console.log("[autoExpire]", msg);
                }
            });

        } finally {
            await conn.query("SELECT RELEASE_LOCK('netfee_auto_expire')");
        }
    } catch (e) {
        console.error("[autoExpire] error:", e.message);
    } finally {
        if (conn) conn.release();
        running = false;
    }
}

function start() {
    if (started) return;
    started = true;

    setTimeout(tick, 30 * 1000).unref();
    setInterval(tick, EVERY_MS).unref();
}

module.exports = { start, tick };
