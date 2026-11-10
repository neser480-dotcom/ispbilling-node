"use strict";

/*
| middleware/security.js
|
| প্রয়োজন: npm i helmet express-rate-limit
|
| .env ভ্যারিয়েবল (সবগুলো ঐচ্ছিক):
|   NODE_ENV=production
|   CSRF_MODE=log        // log (ডিফল্ট: শুধু warning) | enforce (403 দেয়) | off
|   ALLOWED_ORIGINS=https://a.com,https://b.com
|   ENABLE_HSTS=true     // শুধু সাইট পুরোপুরি HTTPS হলে
*/

const crypto = require("crypto");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/* পেমেন্ট গেটওয়ে কলব্যাকে অন্য ডোমেইনের Origin থাকে, তাই বাদ */
const EXEMPT_PREFIXES = ["/api/payment-gateway"];

function isExempt(req) {
    const p = req.path || "";
    return EXEMPT_PREFIXES.some((x) => p === x || p.startsWith(x + "/"));
}

/* ---------- 1. সিকিউরিটি হেডার ---------- */
function headers() {
    const helmetMw = helmet({
        contentSecurityPolicy: false,          // আগে report-only/টেস্ট করে পরে চালু করুন
        crossOriginEmbedderPolicy: false,
        crossOriginOpenerPolicy: false,
        crossOriginResourcePolicy: false,
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
        hsts: process.env.ENABLE_HSTS === "true"
    });

    const permissionsPolicy = (req, res, next) => {
        res.setHeader(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=()"
        );
        next();
    };

    return [helmetMw, permissionsPolicy];
}

/* ---------- 2. Origin গার্ড (ফ্রন্টএন্ড বদলাতে হয় না) ---------- */
function sameOriginGuard(req, res, next) {
    if (!UNSAFE_METHODS.has(req.method) || isExempt(req)) return next();

    const origin = req.get("origin");
    if (!origin) return next();

    try {
        if (new URL(origin).host === req.get("host")) return next();
    } catch (_) { /* অবৈধ Origin → নিচে ব্লক */ }

    const allowed = (process.env.ALLOWED_ORIGINS || "")
        .split(",").map((s) => s.trim()).filter(Boolean);
    if (allowed.includes(origin)) return next();

    return res.status(403).json({
        success: false,
        code: "CSRF_ORIGIN_MISMATCH",
        message: "অনুরোধটি বৈধ উৎস থেকে আসেনি।"
    });
}

/* ---------- 3. CSRF টোকেন যাচাই (/api/csrf-token এর টোকেন) ---------- */
function safeEqual(a, b) {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function csrfTokenCheck(req, res, next) {
    const mode = (process.env.CSRF_MODE || "log").toLowerCase();
    if (mode === "off") return next();
    if (!UNSAFE_METHODS.has(req.method) || isExempt(req)) return next();

    /* লগইনের আগের অনুরোধে সেশন টোকেন থাকে না; সেগুলো Origin গার্ড সামলায় */
    if (!req.session || !req.session.user_id) return next();

    const sent =
        req.get("x-csrf-token") ||
        (req.body && (req.body.csrf_token || req.body._csrf)) ||
        "";
    const expected = req.session.csrf_token || "";

    if (expected && sent && safeEqual(sent, expected)) return next();

    if (mode === "enforce") {
        return res.status(403).json({
            success: false,
            code: "CSRF_TOKEN_INVALID",
            message: "নিরাপত্তা টোকেন সঠিক নয়। পেজ রিফ্রেশ করে আবার চেষ্টা করুন।"
        });
    }

    console.warn("[CSRF-LOG] token missing/invalid:", req.method, req.originalUrl);
    return next();
}

/* ---------- 4. লগইন/রেজিস্টার রেট লিমিট ---------- */
function authLimiter(opts = {}) {
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 20,                               // প্রতি IP, ১৫ মিনিটে
        standardHeaders: true,
        legacyHeaders: false,
        message: {
            success: false,
            code: "TOO_MANY_ATTEMPTS",
            message: "অনেকবার চেষ্টা করা হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।"
        },
        ...opts
    });
}

module.exports = {
    headers,
    sameOriginGuard,
    csrfTokenCheck,
    authLimiter
};
