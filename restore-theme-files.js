"use strict";
/*
| restore-theme-files.js  —  প্রজেক্ট রুটে রেখে চালান:  node restore-theme-files.js
|
| scripts/patch-theme-colors-1.js এর ভেতর থেকে CSS ও JS টেক্সট বের করে
|   public/assets/css/theme-colors.css
|   public/assets/js/theme-colors.js
| তৈরি করে। topbar-loader.js বা অন্য কিছু বদলায় না।
| ফাইল আগে থেকে থাকলে ওভাররাইট করে না।
*/

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = process.cwd();
const src = path.join(root, "scripts", "patch-theme-colors-1.js");

function fail(msg) {
    console.error("[থেমে গেছে] " + msg);
    process.exit(1);
}

if (!fs.existsSync(src)) fail("scripts/patch-theme-colors-1.js পাওয়া যায়নি।");

const text = fs.readFileSync(src, "utf8").replace(/\r\n/g, "\n");

const lines = text.split("\n").filter((l) => /^const (CSS|JS) = ".*";$/.test(l));
if (lines.length !== 2) fail("CSS/JS লাইন ঠিক ২টি পাওয়া যায়নি (পাওয়া গেছে " + lines.length + "টি)।");

const ctx = {};
try {
    vm.runInNewContext(lines.map((l) => l.replace(/^const /, "var ")).join("\n"), ctx, { timeout: 2000 });
} catch (e) {
    fail("টেক্সট পড়তে সমস্যা: " + e.message);
}

if (typeof ctx.CSS !== "string" || typeof ctx.JS !== "string" || ctx.CSS.length < 500 || ctx.JS.length < 500) {
    fail("বের করা টেক্সট অস্বাভাবিক ছোট, কিছু লেখা হয়নি।");
}

const targets = [
    [path.join(root, "public", "assets", "css", "theme-colors.css"), ctx.CSS],
    [path.join(root, "public", "assets", "js", "theme-colors.js"), ctx.JS]
];

for (const [file, content] of targets) {
    const rel = path.relative(root, file);
    if (fs.existsSync(file)) {
        console.log(rel + ": আগেই আছে, বাদ দিলাম।");
        continue;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    console.log(rel + ": তৈরি হয়েছে (" + content.length + " অক্ষর)");
}

console.log("\nশেষ। ব্রাউজারে Ctrl+F5 দিয়ে পেজ রিফ্রেশ করুন।");
