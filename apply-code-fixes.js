"use strict";
/*
| apply-code-fixes.js  —  প্রজেক্ট রুটে রেখে চালান:  node apply-code-fixes.js
|
|  routes/auth/register.js
|     - পাসওয়ার্ড: ন্যূনতম 8, সর্বোচ্চ 72 বাইট (bcrypt 72 বাইটের পরে কেটে ফেলে)
|     - রেট লিমিটে x-forwarded-for হেডার বাদ (এটা নকল করা যায়), req.ip ব্যবহার
|  services/customers/customer-auto-expire.service.js
|  services/customers/customer-month-start.service.js
|     - SHOW COLUMNS FROM ?? (প্যারামিটারাইজড আইডেন্টিফায়ার)
|
| ব্যাকআপ: *.bak-fix । কোনো টেক্সট না মিললে কিছুই না বদলিয়ে থেমে যায়।
*/

const fs = require("fs");
const path = require("path");

const root = process.cwd();

const FILES = [
    {
        rel: "routes/auth/register.js",
        edits: [
            {
                name: "x-forwarded-for বাদ",
                find: /req\.headers\["x-forwarded-for"\]\?\.split\(","\)\[0\]\?\.trim\(\)\s*\|\|\s*/g,
                to: ""
            },
            {
                name: "পাসওয়ার্ড শর্ত",
                find: /password\.length < 6/g,
                to: 'password.length < 8 ||\n            Buffer.byteLength(password, "utf8") > 72'
            },
            {
                name: "পাসওয়ার্ড বার্তা",
                find: /"Password must be at least 6 characters\."/g,
                to: '"Password must be 8 to 72 characters."'
            }
        ]
    },
    {
        rel: "services/customers/customer-auto-expire.service.js",
        edits: [showColumns()]
    },
    {
        rel: "services/customers/customer-month-start.service.js",
        edits: [showColumns()]
    }
];

function showColumns() {
    return {
        name: "SHOW COLUMNS",
        find: /db\.query\(`SHOW COLUMNS FROM \\`\$\{table\}\\``\)/g,
        to: 'db.query("SHOW COLUMNS FROM ??", [table])'
    };
}

function fail(msg) {
    console.error("\n[থেমে গেছে] " + msg + "\nকোনো ফাইল বদলানো হয়নি।");
    process.exit(1);
}

const pending = [];

for (const f of FILES) {
    const full = path.join(root, f.rel);
    if (!fs.existsSync(full)) fail(f.rel + " পাওয়া যায়নি। প্রজেক্ট ফোল্ডার থেকে চালান।");

    const raw = fs.readFileSync(full, "utf8");
    const crlf = raw.includes("\r\n");
    let text = raw.replace(/\r\n/g, "\n");
    let changed = false;

    for (const e of f.edits) {
        const n = (text.match(e.find) || []).length;
        if (n === 0) {
            console.log(`${f.rel}: "${e.name}" আগেই প্যাচ করা (বা টেক্সট নেই), বাদ।`);
            continue;
        }
        if (n !== 1) fail(`${f.rel}: "${e.name}" ধাপে ঠিক ১টি মিল দরকার, পাওয়া গেছে ${n}টি।`);
        text = text.replace(e.find, e.to);
        changed = true;
    }

    if (changed) pending.push({ full, rel: f.rel, raw, out: crlf ? text.replace(/\n/g, "\r\n") : text });
}

for (const p of pending) {
    fs.writeFileSync(p.full + ".bak-fix", p.raw);
    fs.writeFileSync(p.full, p.out);
    console.log(p.rel + ": প্যাচ করা হয়েছে (ব্যাকআপ: " + path.basename(p.full) + ".bak-fix)");
}

if (!pending.length) console.log("নতুন কিছু বদলানোর ছিল না।");

console.log("\nশেষ। এবার চালান:  node app.js   (৩০ সেকেন্ড পরে '[autoExpire] error' আসছে কিনা দেখুন)");
