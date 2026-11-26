"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const ROOT_FILES = ["app.js", "README.txt"];
const SOURCE_DIRS = [
    "views",
    "routes",
    "controllers",
    "services",
    "middleware",
    "public/assets/js",
    "public/assets/css",
    "docs"
];
const ALLOWED_EXTENSIONS = new Set([".html", ".js", ".css", ".md"]);
const SKIP_DIRS = new Set([
    "node_modules", ".git", "uploads", "storage", "logs",
    "backups", "backup", "vendor", "dist", "build"
]);
const SKIP_FILES = /(?:^|[._-])(?:min|bundle|backup|credentials?|secrets?|private|\.bak)(?:[._-]|$)/i;
const SENSITIVE_LINE = /process\.env|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|password|passwd|authorization|bearer\s|private\s+key|BEGIN\s+(?:RSA|OPENSSH|EC)\s+PRIVATE|webhook[_-]?secret|session[_-]?secret|encryption[_-]?key|otp/i;
const SECRET_VALUE = /(?:sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/g;

let cached = null;
let cachedAt = 0;
let buildPromise = null;
const CACHE_MS = 5 * 60 * 1000;

function walk(dir, output) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
        return;
    }

    for (const entry of entries) {
        if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name.toLowerCase())) continue;
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            walk(full, output);
            continue;
        }

        const ext = path.extname(entry.name).toLowerCase();
        if (!entry.isFile() || !ALLOWED_EXTENSIONS.has(ext) || SKIP_FILES.test(entry.name)) continue;
        if (entry.name.endsWith(".min.js") || entry.name.endsWith(".bundle.js")) continue;
        output.push(full);
    }
}

function sanitizeSource(source) {
    const lines = String(source || "").split(/\r?\n/);
    const blocked = new Set();

    // Remove credential declarations and nearby continuation lines too
    // (for example, a multi-line SESSION_SECRET fallback expression).
    lines.forEach((line, index) => {
        if (SENSITIVE_LINE.test(line) || new RegExp(SECRET_VALUE.source).test(line)) {
            for (let offset = -2; offset <= 2; offset++) {
                const target = index + offset;
                if (target >= 0 && target < lines.length) blocked.add(target);
            }
        }
    });

    return lines
        .filter((line, index) => !blocked.has(index))
        .map(line => line.replace(SECRET_VALUE, "[REDACTED SECRET]"))
        .join("\n")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "[inline script omitted from page markup]")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "[inline style omitted from page markup]");
}

const QUERY_SYNONYMS = {
    "গ্রাহক": "customer", "গ্রাহকরা": "customer", "grahok": "customer", "customer": "customer", "customers": "customer",
    "বিলিং": "billing", "bill": "billing", "billing": "billing",
    "রিচার্জ": "recharge", "recharge": "recharge",
    "পেমেন্ট": "payment", "payment": "payment", "পেমেন্টস": "payment",
    "মাইক্রোটিক": "mikrotik", "মাইক্রোটিকের": "mikrotik", "mikrotik": "mikrotik",
    "রাউটার": "router", "router": "router", "routers": "router",
    "ওএলটি": "olt", "olt": "olt", "ওএনইউ": "onu", "onu": "onu",
    "এলাকা": "area", "এরিয়া": "area", "area": "area",
    "কর্মচারী": "staff", "স্টাফ": "staff", "staff": "staff", "employee": "staff",
    "রিসেলার": "reseller", "reseller": "reseller",
    "রিপোর্ট": "report", "report": "report", "reports": "report",
    "এসএমএস": "sms", "sms": "sms",
    "ড্যাশবোর্ড": "dashboard", "dashboard": "dashboard",
    "সাপোর্ট": "support", "support": "support", "টিকিট": "ticket", "ticket": "ticket",
    "অনুমতি": "permission", "পারমিশন": "permission", "permission": "permission",
    "ইনভয়েস": "invoice", "ইনভয়েস": "invoice", "invoice": "invoice",
    "প্যাকেজ": "package", "package": "package", "packages": "package",
    "ব্যান্ডউইথ": "bandwidth", "bandwidth": "bandwidth",
    "মনিটরিং": "monitoring", "monitoring": "monitoring",
    "ওয়েবসাইট": "website", "ওয়েবসাইট": "website", "website": "website",
    "অ্যাপ": "app", "app": "app", "application": "app",
    "প্রোফাইল": "profile", "profile": "profile",
    "বেতন": "salary", "salary": "salary",
    "কালেক্টর": "collector", "collector": "collector",
    "লগইন": "login", "login": "login",
    "সেটিংস": "settings", "সেটিং": "settings", "settings": "settings",
    "ইমপোর্ট": "import", "import": "import", "এক্সপোর্ট": "export", "export": "export"
};

function tokenize(value) {
    return String(value || "")
        .toLowerCase()
        .match(/[\p{L}\p{N}_-]{2,}/gu) || [];
}

function expandQueryTokens(value) {
    const expanded = new Set();
    for (const token of tokenize(value)) {
        expanded.add(token);
        if (QUERY_SYNONYMS[token]) expanded.add(QUERY_SYNONYMS[token]);
        if (token.endsWith("ies") && token.length > 4) expanded.add(token.slice(0, -3) + "y");
        else if (token.endsWith("s") && token.length > 3) expanded.add(token.slice(0, -1));
    }
    return expanded;
}

function makeChunks(relativePath, source) {
    const lines = sanitizeSource(source).split(/\r?\n/);
    const chunks = [];
    const size = 32;

    for (let start = 0; start < lines.length; start += size) {
        const text = lines.slice(start, start + size).join("\n").trim();
        if (text.length < 80) continue;
        chunks.push({
            path: relativePath.replace(/\\/g, "/"),
            startLine: start + 1,
            text: text.slice(0, 4200),
            tokens: new Set(tokenize(relativePath + " " + text))
        });
    }

    return chunks;
}

async function buildIndex() {
    if (buildPromise) return buildPromise;

    buildPromise = Promise.resolve().then(() => {
        const files = [];
        for (const relativeDir of SOURCE_DIRS) {
            walk(path.join(ROOT, relativeDir), files);
        }

        for (const relativeFile of ROOT_FILES) files.push(path.join(ROOT, relativeFile));

        const chunks = [];
        let indexedFiles = 0;

        for (const file of files) {
            let stat;
            try {
                stat = fs.statSync(file);
                if (stat.size > 300 * 1024) continue;
                const source = fs.readFileSync(file, "utf8");
                const relativePath = path.relative(ROOT, file);
                const fileChunks = makeChunks(relativePath, source);
                if (fileChunks.length) {
                    chunks.push(...fileChunks);
                    indexedFiles++;
                }
            } catch (_) {
                // Ignore unreadable or non-text files; never interrupt chat.
            }
        }

        cached = { chunks, indexedFiles, builtAt: Date.now() };
        cachedAt = Date.now();
        return cached;
    }).finally(() => {
        buildPromise = null;
    });

    return buildPromise;
}

async function getSoftwareKnowledge(question) {
    try {
        const index = cached && Date.now() - cachedAt < CACHE_MS
            ? cached
            : await buildIndex();

        const queryTokens = expandQueryTokens(question);
        if (!queryTokens.size || !index.chunks.length) {
            return { text: "", indexedFiles: index.indexedFiles };
        }

        const scored = index.chunks.map(chunk => {
            let score = 0;
            for (const token of queryTokens) {
                if (chunk.tokens.has(token)) score += 1;
                if (chunk.path.toLowerCase().includes(token)) score += 2;
            }
            return { chunk, score };
        }).filter(item => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 9);

        const text = scored.map(({ chunk }) =>
            "[Source: " + chunk.path + ", lines " + chunk.startLine + "-]\n" + chunk.text
        ).join("\n\n---\n\n").slice(0, 22000);

        return { text, indexedFiles: index.indexedFiles };
    } catch (error) {
        console.error("[AI Help Software Index]", error.message);
        return { text: "", indexedFiles: 0 };
    }
}

module.exports = { getSoftwareKnowledge };
