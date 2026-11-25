"use strict";
/*
| ব্যবহার (প্রজেক্ট ফোল্ডারে):  node scripts/test-live.js 505040@01
| গ্রাহকের PPPoE ইউজারনেম দিন। MikroTik থেকে লাইভ তথ্য কেন আসছে না তার ধাপ-ধাপে ফল ছাপে। কিছু বদলায় না।
*/
require("dotenv").config();
const db = require("../config/database");
const live = require("../services/mobile/customerLive.service");

(async () => {
    const user = process.argv[2];
    if (!user) { console.log("ব্যবহার: node scripts/test-live.js <pppoe_username>"); process.exit(1); }
    const [rows] = await db.execute(
        "SELECT id, company_id, mikrotik_id, pppoe_username FROM customers WHERE pppoe_username = ? AND deleted_at IS NULL LIMIT 1", [user]);
    if (!rows.length) { console.log("এই pppoe_username-এর কোনো গ্রাহক ডাটাবেসে নেই"); process.exit(1); }
    (await live.diagnose(rows[0])).forEach((l) => console.log(l));
    process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
