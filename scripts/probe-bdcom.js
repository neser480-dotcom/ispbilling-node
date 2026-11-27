"use strict";
/*
| BDCOM OLT probe — শুধু পড়ে (read-only), কিছু বদলায় না। শুধু "show ..." কমান্ড চালায়।
|
| ব্যবহার (প্রজেক্ট ফোল্ডারে):
|   node scripts/probe-bdcom.js <olt_ip> <username> <password> [port]
|   অথবা পাসওয়ার্ড হিস্ট্রিতে না রাখতে:
|   set BDCOM_PASS=xxxx            (Windows CMD)
|   node scripts/probe-bdcom.js 10.10.10.2 admin
|
| ফল: স্ক্রিনে সংক্ষিপ্ত সারাংশ + পুরো আসল আউটপুট scripts/probe-out/bdcom-<ip>-<সময়>.txt ফাইলে।
| ওই .txt ফাইলটা পাঠালে তা দেখে ড্রাইভার/পার্সার লিখব। (ফাইলে পাসওয়ার্ড থাকে না;
| তবু পাঠানোর আগে running-config-এর SNMP community/পাসওয়ার্ড লাইন মুছে দেবেন।)
*/
const fs = require("fs");
const path = require("path");
// ইচ্ছা করে EcomDriver-এর টেলনেট লগইন + "-- More --" হ্যান্ডলিং ব্যবহার করা হয়েছে (বাস্তবে যাচাই করা)।
const { EcomDriver } = require("../drivers/hardware/ecom");

const [ip, username, argPass, argPort] = process.argv.slice(2);
const password = argPass || process.env.BDCOM_PASS || "";
const port = Number(argPort || process.env.BDCOM_PORT || 23);

if (!ip || !username) {
    console.log("ব্যবহার: node scripts/probe-bdcom.js <olt_ip> <username> <password> [port]");
    process.exit(1);
}

// নিরাপত্তা: শুধু show কমান্ড চলবে।
const isShow = (c) => /^show\s/i.test(c.trim()); // "show ... ?" is help only, still read-only

// BDCOM মডেলভেদে কমান্ড আলাদা (EPON: P3310/P3608/P3616..., GPON: GP3600...)। যেটা চলে না সেটা শুধু "ERR" লিখে যাবে।
const BASE = [
    "show version",
    "show running-config",
    "show clock",
    "show cpu usage",
    "show cpu",
    "show processes cpu",
    "show memory",
    "show memory usage",
    "show memory statistics",
    "show memory summary",
    "show system",
    "show uptime",
    // help ("?") lists: show which sub-commands this OLT really has
    "show memory ?",
    "show cpu ?",
    "show epon ?",
    "show interface epon0/1 ?",
    "show transceiver ?",
    "show system ?",
    "show temperature",
    "show fan",
    "show power",
    "show interface brief",
    "show vlan",
    // EPON
    "show epon active-onu",
    "show epon inactive-onu",
    "show epon onu-information",
    "show epon interface-statistic",
    "show epon onu-version",
    // GPON
    "show gpon onu-information",
    "show gpon onu-state",
    "show gpon active-onu",
    // MAC টেবিল (PPPoE ম্যাপিং-এর জন্য)
    "show mac address-table",
    "show mac-address-table",
];

const out = [];
const log = (s = "") => { out.push(s); };
const summary = [];

function uniq(a) { return [...new Set(a)]; }

(async () => {
    const d = new EcomDriver({ ip, port, username, password, timeout: 15000 });
    d.vendor = "BDCOM";
    const results = {};

    async function run(cmd, timeout = 30000) {
        if (!isShow(cmd)) { log(`## ${cmd}\n(SKIPPED: show নয়)\n`); return ""; }
        try {
            const t0 = Date.now();
            const o = await d.command(cmd, timeout);
            const bad = /invalid|unknown command|unrecognized|incomplete command|% ?error/i.test(o);
            results[cmd] = { ok: !bad, len: o.length, ms: Date.now() - t0 };
            log(`## ${cmd}   [${bad ? "UNSUPPORTED" : "OK"} ${o.length} chars ${Date.now() - t0}ms]\n${o}\n`);
            summary.push(`${bad ? "✗" : "✓"} ${cmd}  (${o.length} অক্ষর)`);
            return bad ? "" : o;
        } catch (e) {
            results[cmd] = { ok: false, err: e.message };
            log(`## ${cmd}   [ERR]\n${e.message}\n`);
            summary.push(`✗ ${cmd}  (ERR: ${e.message.slice(0, 80)})`);
            return "";
        }
    }

    console.log(`BDCOM probe → ${ip}:${port} (user ${username})`);
    try {
        await d.connect();
    } catch (e) {
        console.log("লগইন/কানেক্ট হয়নি: " + e.message);
        console.log("চেক করুন: IP/পোর্ট, টেলনেট চালু কি না, ইউজার-পাস, আর এই সার্ভার থেকে OLT-তে পৌঁছানো যায় কি না।");
        process.exit(1);
    }
    log(`# BDCOM probe ${new Date().toISOString()}  ${ip}:${port}\n# prompt: ${d.prompt}\n`);
    console.log("লগইন ঠিক আছে, prompt: " + d.prompt);

    // পেজিং বন্ধ (ড্রাইভার "More" সামলায়, তবু দ্রুত করে)
    await d.command("terminal length 0", 5000).catch(() => {});

    const seen = {};
    for (const c of BASE) {
        // running-config বড় — বেশি সময় দিন
        seen[c] = await run(c, c === "show running-config" ? 90000 : 30000);
    }

    // ONU/ইন্টারফেস নাম বের করে প্রতিটি ধরনের প্রথম ২টির বিস্তারিত নিন
    const blob = Object.values(seen).join("\n");
    const epon = uniq((blob.match(/epon\s?\d+\/\d+:\d+/gi) || []).map((s) => s.replace(/\s+/g, "").toLowerCase())).slice(0, 2);
    const gpon = uniq((blob.match(/gpon\s?\d+\/\d+:\d+/gi) || []).map((s) => s.replace(/\s+/g, "").toLowerCase())).slice(0, 2);
    const pons = uniq((blob.match(/(?:epon|gpon)\s?\d+\/\d+(?!:)\b/gi) || []).map((s) => s.replace(/\s+/g, "").toLowerCase())).slice(0, 2);

    log(`# পাওয়া ONU: epon=${epon.join(",") || "-"} gpon=${gpon.join(",") || "-"}  PON পোর্ট: ${pons.join(",") || "-"}\n`);
    console.log(`ONU পাওয়া গেছে — epon: ${epon.length}, gpon: ${gpon.length}`);

    for (const i of epon) {
        await run(`show epon interface ${i} onu basic-information`);
        await run(`show epon interface ${i} onu ctc optical-transceiver-diagnosis`);
        await run(`show epon optical-transceiver-diagnosis interface ${i}`);
        await run(`show epon interface ${i} onu ctc basic-info`);
        await run(`show interface ${i}`);
        await run(`show mac address-table interface ${i}`);
    }
    for (const i of gpon) {
        await run(`show gpon onu-information interface ${i}`);
        await run(`show gpon interface ${i} onu optical-info`);
        await run(`show gpon interface ${i} onu basic-info`);
        await run(`show interface ${i}`);
    }
    for (const p of pons) {
        await run(`show interface ${p}`);
        await run(`show ${/^g/.test(p) ? "gpon" : "epon"} interface ${p} onu`);
    }

    d.disconnect();

    const dir = path.join(__dirname, "probe-out");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `bdcom-${ip.replace(/[^\d.]/g, "")}-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
    fs.writeFileSync(file, out.join("\n"), "utf8");

    console.log("\n--- সারাংশ ---");
    summary.forEach((s) => console.log(s));
    console.log("\nপুরো আউটপুট: " + file);
    console.log("ওই ফাইলটা পাঠান (running-config থেকে পাসওয়ার্ড/SNMP community মুছে)।");
    process.exit(0);
})().catch((e) => { console.error("probe ব্যর্থ: " + e.message); process.exit(1); });
