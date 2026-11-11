"use strict";
/*
| fix-theme-default.js  —  প্রজেক্ট রুটে রেখে চালান:  node fix-theme-default.js
|
| public/assets/js/theme-colors.js কে এমনভাবে বদলায় যেন পেজের নীল রং বদলানোর
| কাজটা শুধু তখনই চলে যখন:
|   - --theme-primary এর মান সেট আছে, এবং
|   - data-color-theme আছে ও "blue" নয়।
| ডিফল্ট নীল থিমে পেজ আগের মতোই থাকবে।
| ব্যাকআপ: theme-colors.js.bak-theme । টেক্সট না মিললে কিছুই বদলায় না।
*/

const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "public", "assets", "js", "theme-colors.js");

function fail(msg) {
    console.error("[থেমে গেছে] " + msg + "\nকোনো ফাইল বদলানো হয়নি।");
    process.exit(1);
}

if (!fs.existsSync(file)) fail("public/assets/js/theme-colors.js পাওয়া যায়নি।");

const raw = fs.readFileSync(file, "utf8");
const crlf = raw.includes("\r\n");
let text = raw.replace(/\r\n/g, "\n");

if (text.includes("function themeActive()")) {
    console.log("আগেই প্যাচ করা আছে, কিছু বদলানোর নেই।");
    process.exit(0);
}

const edits = [
    {
        name: "run() এ গার্ড",
        from:
            "    function run() {\n" +
            "        fixAllSheets();\n" +
            "        fixInline();\n" +
            "    }\n",
        to:
            "    /* default Blue: pages keep their own colours, nothing is re-pointed */\n" +
            "    function themeActive() {\n" +
            "        var v = getComputedStyle(root).getPropertyValue('--theme-primary').trim();\n" +
            "        var t = root.getAttribute('data-color-theme');\n\n" +
            "        return !!v && !!t && t !== 'blue';\n" +
            "    }\n\n" +
            "    function run() {\n" +
            "        if (!themeActive()) {\n" +
            "            return;\n" +
            "        }\n\n" +
            "        fixAllSheets();\n" +
            "        fixInline();\n" +
            "    }\n"
    },
    {
        name: "দেরি করা রান এ গার্ড",
        from:
            "        timer = setTimeout(function () {\n" +
            "            if (needSheets) {\n",
        to:
            "        timer = setTimeout(function () {\n" +
            "            if (!themeActive()) {\n" +
            "                needSheets = false;\n" +
            "                return;\n" +
            "            }\n\n" +
            "            if (needSheets) {\n"
    },
    {
        name: "থিম বদলালে আবার চালানো",
        from: "new MutationObserver(applyAccent).observe(root, {",
        to: "new MutationObserver(function () { applyAccent(); later(true); }).observe(root, {"
    }
];

for (const e of edits) {
    const n = text.split(e.from).length - 1;
    if (n !== 1) fail('"' + e.name + '" ধাপে ঠিক ১টি মিল দরকার, পাওয়া গেছে ' + n + "টি। (ফাইল আগে বদলানো হয়েছে?)");
    text = text.replace(e.from, () => e.to);
}

fs.writeFileSync(file + ".bak-theme", raw);
fs.writeFileSync(file, crlf ? text.replace(/\n/g, "\r\n") : text);

console.log("theme-colors.js প্যাচ করা হয়েছে (ব্যাকআপ: theme-colors.js.bak-theme)");
console.log("ব্রাউজারে Ctrl+F5 দিয়ে রিফ্রেশ করুন।");
