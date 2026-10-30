"use strict";

/*
|--------------------------------------------------------------------------
| CUSTOMER AUTO EXPIRE  (run every ~10 minutes)
|--------------------------------------------------------------------------
|   node cron/customer-auto-expire.js
|
| Windows: schedule cron/run-customer-auto-expire.cmd in Task Scheduler.
| One run at a time (lock file). Log: cron/customer-auto-expire.log
|--------------------------------------------------------------------------
*/

const fs = require("fs");
const path = require("path");

const service = require("../services/customers/customer-auto-expire.service");

const LOCK_FILE = path.join(__dirname, "customer-auto-expire.lock");
const LOG_FILE = path.join(__dirname, "customer-auto-expire.log");
const STALE_LOCK_MS = 15 * 60 * 1000;
const MAX_LOG_BYTES = 1024 * 1024;


function stamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function log(message) {

    const line = `[${stamp()}] ${message}\n`;

    try {
        if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_LOG_BYTES) {
            fs.writeFileSync(LOG_FILE, "");
        }
        fs.appendFileSync(LOG_FILE, line);
    } catch (_) {}

    process.stdout.write(line);
}

function acquireLock() {

    try {
        fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: "wx" });
        return true;
    } catch (error) {

        if (error.code !== "EEXIST") throw error;

        /* a crashed run must not block the job forever */
        try {
            if (Date.now() - fs.statSync(LOCK_FILE).mtimeMs > STALE_LOCK_MS) {
                fs.unlinkSync(LOCK_FILE);
                return acquireLock();
            }
        } catch (_) {}

        return false;
    }
}

function releaseLock() {
    try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
}


async function main() {

    if (!acquireLock()) {
        process.stdout.write("Another run is still working.\n");
        return 0;
    }

    try {
        await service.run({ log });
        return 0;

    } catch (error) {
        log(`ERROR: ${error.message}`);
        return 1;

    } finally {
        releaseLock();
    }
}

if (require.main === module) {
    main().then(code => process.exit(code));
}

module.exports = { main };
