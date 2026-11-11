"use strict";
/*
| apply-security-fix.js  —  প্রজেক্ট রুটে রেখে চালান:  node apply-security-fix.js
|
| কী করে:
|  1. app.js, package.json, .env এর ব্যাকআপ (*.bak-security) রাখে
|  2. app.js-এ security middleware, সেশন সিক্রেট গার্ড, secure কুকি সেটিং বসায়
|  3. package.json-এ mysql2 overrides যোগ করে
|  4. .env-এ SESSION_SECRET না থাকলে র‍্যান্ডম সিক্রেট বানায়
| যেকোনো ধাপের টেক্সট না মিললে কিছু না বদলিয়েই থেমে যায়।
*/

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = process.cwd();
const P = (f) => path.join(root, f);

function fail(msg) {
    console.error("\n[থেমে গেছে] " + msg + "\nকোনো ফাইল বদলানো হয়নি।");
    process.exit(1);
}

if (!fs.existsSync(P("app.js"))) fail("app.js পাওয়া যায়নি। প্রজেক্ট ফোল্ডার থেকে চালান।");
if (!fs.existsSync(P("package.json"))) fail("package.json পাওয়া যায়নি।");
if (!fs.existsSync(P("middleware/security.js"))) fail("middleware/security.js নেই। আগে ফাইলটা ওখানে রাখুন।");

/* ---------- app.js ---------- */
const rawApp = fs.readFileSync(P("app.js"), "utf8");
const crlf = rawApp.includes("\r\n");
let app = rawApp.replace(/\r\n/g, "\n");
let appChanged = false;

if (app.includes('require("./middleware/security")')) {
    console.log("app.js: আগেই প্যাচ করা আছে, বাদ দিলাম।");
} else {
    const steps = [
        {
            name: "require যোগ",
            re: /(const path = require\("path"\);\n)/g,
            to: '$1const security = require("./middleware/security");\n'
        },
        {
            name: "helmet/হেডার",
            re: /(const app =\s*express\(\);\n)/g,
            to:
                '$1\napp.disable("x-powered-by");\n' +
                "app.use(security.headers());\n" +
                'if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY));\n'
        },
        {
            name: "সেশন সিক্রেট গার্ড",
            re: /secret:\s*process\.env\.SESSION_SECRET\s*\|\|\s*"ispbilling_node_test_secret",/g,
            to:
                "secret:\n" +
                "            process.env.SESSION_SECRET ||\n" +
                "            (() => {\n" +
                '                if (process.env.NODE_ENV === "production") {\n' +
                '                    throw new Error("SESSION_SECRET is required in production");\n' +
                "                }\n" +
                '                return "ispbilling_node_test_secret";\n' +
                "            })(),"
        },
        {
            name: "secure কুকি",
            re: /secure:\s*false,/g,
            to: 'secure:\n                process.env.COOKIE_SECURE === "true",'
        },
        {
            name: "origin/CSRF/রেট লিমিট",
            re: /(app\.use\(\s*express\.static\()/g,
            to:
                'app.use("/api/auth/login", security.authLimiter());\n' +
                'app.use("/api/register", security.authLimiter());\n' +
                "app.use(security.sameOriginGuard);\n" +
                "app.use(security.csrfTokenCheck);\n\n$1"
        }
    ];

    for (const s of steps) {
        const n = (app.match(s.re) || []).length;
        if (n !== 1) fail(`app.js: "${s.name}" ধাপে ঠিক ১টি মিল দরকার, পাওয়া গেছে ${n}টি।`);
        app = app.replace(s.re, s.to);
    }
    appChanged = true;
}

/* ---------- package.json ---------- */
const rawPkg = fs.readFileSync(P("package.json"), "utf8");
const pkg = JSON.parse(rawPkg);
const indent = (rawPkg.match(/^\{\r?\n([ \t]+)"/) || [, "  "])[1];
const wantOverride =
    pkg.overrides &&
    pkg.overrides["express-mysql-session"] &&
    pkg.overrides["express-mysql-session"].mysql2;
let pkgChanged = false;
if (!wantOverride) {
    if (!(pkg.dependencies && pkg.dependencies.mysql2)) {
        fail('package.json-এর dependencies-এ "mysql2" নেই, overrides বসানো যাচ্ছে না।');
    }
    pkg.overrides = pkg.overrides || {};
    pkg.overrides["express-mysql-session"] = { mysql2: "$mysql2" };
    pkgChanged = true;
}

/* ---------- .env ---------- */
let envChanged = false;
let envText = "";
const envPath = P(".env");
if (fs.existsSync(envPath)) envText = fs.readFileSync(envPath, "utf8");
const hasSecret = /^\s*SESSION_SECRET\s*=\s*\S+/m.test(envText);

/* ---------- লেখা (সব ঠিক থাকলেই) ---------- */
const stamp = ".bak-security";
if (appChanged) {
    fs.copyFileSync(P("app.js"), P("app.js" + stamp));
    fs.writeFileSync(P("app.js"), crlf ? app.replace(/\n/g, "\r\n") : app);
    console.log("app.js: প্যাচ করা হয়েছে (ব্যাকআপ: app.js" + stamp + ")");
}
if (pkgChanged) {
    fs.copyFileSync(P("package.json"), P("package.json" + stamp));
    const eol = rawPkg.includes("\r\n") ? "\r\n" : "\n";
    let out = JSON.stringify(pkg, null, indent);
    if (eol === "\r\n") out = out.replace(/\n/g, "\r\n");
    fs.writeFileSync(P("package.json"), out + eol);
    console.log("package.json: mysql2 overrides যোগ হয়েছে (ব্যাকআপ: package.json" + stamp + ")");
}
if (!hasSecret) {
    if (fs.existsSync(envPath)) fs.copyFileSync(envPath, P(".env" + stamp));
    const nl = envText.includes("\r\n") ? "\r\n" : "\n";
    const pre = envText && !/\n$/.test(envText) ? nl : "";
    fs.writeFileSync(
        envPath,
        envText + pre + "SESSION_SECRET=" + crypto.randomBytes(48).toString("hex") + nl
    );
    envChanged = true;
    console.log(".env: নতুন SESSION_SECRET বসানো হয়েছে (সবাইকে একবার নতুন করে লগইন করতে হবে)");
} else {
    console.log(".env: SESSION_SECRET আগেই আছে।");
}

console.log("\nশেষ। এবার চালান:\n  npm install\n  npm audit\n  node app.js");
