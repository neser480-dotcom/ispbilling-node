"use strict";

/*
|--------------------------------------------------------------------------
| APP DOWNLOAD & PROMOTION  (app.amaderbill.com)
|--------------------------------------------------------------------------
|
| File: routes/app-download/appDownload.js      mount: /api/app-download
|
| PUBLIC (no login)
|   GET  /                        latest published Admin + Customer app
|   GET  /promotions              active promotions (date window checked)
|   GET  /download/:type          latest published APK  (type = admin|customer)
|   GET  /download/release/:id    one published release
|   GET  /banner/:file            promotion banner image
|
| SUPER ADMIN (session + CSRF)
|   GET    /admin/releases        all releases (published or not)
|   GET    /admin/promotions      all promotions
|   POST   /apk                   upload APK (multipart)  -> unpublished by default
|   PUT    /apk/:id               publish / unpublish / edit notes
|   POST   /promotions            add  (multipart, optional banner)
|   PUT    /promotions/:id        edit (multipart, optional banner)
|   DELETE /promotions/:id        delete
|
| APK files live in  <project>/storage/apk   (NOT under public/)
| Banners live in    <project>/storage/promo
|
*/

const express = require("express");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const fileUpload = require("express-fileupload");
const rateLimit = require("express-rate-limit");
const db = require("../../config/database");

const ROOT = path.join(__dirname, "..", "..");
const APK_DIR = path.resolve(process.env.APK_STORAGE_DIR || path.join(ROOT, "storage", "apk"));
const PROMO_DIR = path.resolve(process.env.PROMO_STORAGE_DIR || path.join(ROOT, "storage", "promo"));

const APK_MAX_BYTES = Math.max(1, Number(process.env.APK_MAX_MB || 300)) * 1024 * 1024;
const BANNER_MAX_BYTES = 3 * 1024 * 1024;

const APP_TYPES = {
    admin: { label: "Amader Bill Admin", file: "AmaderBill-Admin" },
    customer: { label: "Amader Bill Customer", file: "AmaderBill-Customer" }
};

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function normalizeRole(role) {
    return String(role || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function isSuperAdmin(req) {
    return normalizeRole(req.session && req.session.role) === "superadmin";
}

function apiGuard(req, res, next) {
    if (!req.session || !req.session.user_id) {
        return res.status(401).json({ success: false, message: "Not logged in." });
    }
    if (!isSuperAdmin(req)) {
        return res.status(403).json({ success: false, message: "Super Admin access is required." });
    }
    next();
}

/* সবসময় কড়া CSRF (header X-CSRF-Token — multipart বডি পার্সের আগেও কাজ করে) */
function csrfGuard(req, res, next) {
    const expected = String((req.session && req.session.csrf_token) || "");
    const sent = String(req.get("X-CSRF-Token") || (req.body && req.body.csrf_token) || "");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(sent, "utf8");

    if (!expected || !sent || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(419).json({ success: false, message: "Invalid CSRF token." });
    }
    next();
}

const adminChain = [apiGuard, csrfGuard];

function rowsOf(result) {
    return Array.isArray(result) && Array.isArray(result[0]) ? result[0] : [];
}

function fail(res, status, message) {
    return res.status(status).json({ success: false, message });
}

function serverError(res, err, where) {
    console.error(`[app-download] ${where}:`, err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: "Server error. Please try again." });
}

function parseDateTime(value) {
    const s = String(value ?? "").trim();
    if (s === "") return { value: null };
    const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?$/.exec(s);
    if (!m) return { error: true };
    const text = `${m[1]} ${m[2]}${m[3] || ":00"}`;
    if (Number.isNaN(new Date(text.replace(" ", "T")).getTime())) return { error: true };
    return { value: text };
}

function humanSize(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
    if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
    if (n >= 1024) return (n / 1024).toFixed(0) + " KB";
    return n + " B";
}

function baseUrl() {
    return String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
}

function downloadUrl(row) {
    return `${baseUrl()}/api/app-download/download/release/${row.id}`;
}

function publicRelease(row) {
    return {
        id: row.id,
        app_type: row.app_type,
        app_name: APP_TYPES[row.app_type].label,
        version_name: row.version_name,
        version_code: row.version_code,
        release_notes: row.release_notes || "",
        file_size: Number(row.file_size),
        file_size_label: humanSize(row.file_size),
        sha256: row.sha256,
        published_at: row.published_at,
        download_url: downloadUrl(row),
        latest_download_url: `${baseUrl()}/api/app-download/download/${row.app_type}`
    };
}

function adminRelease(row) {
    return {
        ...publicRelease(row),
        original_name: row.original_name,
        is_published: Number(row.is_published) === 1,
        uploaded_by: row.uploaded_by,
        created_at: row.created_at
    };
}

function bannerUrl(file) {
    return file ? `${baseUrl()}/api/app-download/banner/${file}` : null;
}

function promoOut(row) {
    return {
        id: row.id,
        title: row.title,
        message: row.message || "",
        banner_url: bannerUrl(row.banner_file),
        button_text: row.button_text || "",
        button_link: row.button_link || "",
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        is_active: Number(row.is_active) === 1,
        sort_order: Number(row.sort_order) || 0
    };
}

/* ------------------------------------------------------------------ */
/* file validation                                                    */
/* ------------------------------------------------------------------ */

const PROMO_FILE_RE = /^[a-f0-9]{32}\.(png|jpg|webp)$/;

function imageKind(buf) {
    if (buf.length > 12 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
    if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
    if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
    return null;
}

/* APK = ZIP; শুরুতে PK\x03\x04 এবং শেষের central directory-তে AndroidManifest.xml থাকতে হবে */
async function validateApkFile(filePath, size) {
    const fh = await fsp.open(filePath, "r");
    try {
        const head = Buffer.alloc(4);
        await fh.read(head, 0, 4, 0);
        if (!(head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)) {
            return "This file is not a valid APK (ZIP header missing).";
        }
        const tailLen = Math.min(size, 8 * 1024 * 1024);
        const tail = Buffer.alloc(tailLen);
        await fh.read(tail, 0, tailLen, size - tailLen);
        if (!tail.includes("AndroidManifest.xml")) {
            return "This file does not look like an Android APK (AndroidManifest.xml not found).";
        }
        return null;
    } finally {
        await fh.close();
    }
}

function sha256File(filePath) {
    return new Promise((resolve, reject) => {
        const h = crypto.createHash("sha256");
        fs.createReadStream(filePath)
            .on("error", reject)
            .on("data", (d) => h.update(d))
            .on("end", () => resolve(h.digest("hex")));
    });
}

function safeUnlink(dir, file) {
    try {
        const full = path.resolve(dir, file);
        if (full.startsWith(dir + path.sep)) fs.unlinkSync(full);
    } catch (_) { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* PUBLIC                                                             */
/* ------------------------------------------------------------------ */

const router = express.Router();

const publicLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests. Please wait a moment." }
});

async function latestPublished(type) {
    const [rows] = await db.execute(
        `SELECT * FROM app_releases
         WHERE app_type = ? AND is_published = 1
         ORDER BY version_code DESC, id DESC
         LIMIT 1`,
        [type]
    );
    return rows[0] || null;
}

router.get("/", publicLimiter, async (req, res) => {
    try {
        const out = {};
        for (const type of Object.keys(APP_TYPES)) {
            const row = await latestPublished(type);
            out[type] = row ? publicRelease(row) : null;
        }
        res.set("Cache-Control", "public, max-age=60");
        return res.json({ success: true, apps: out });
    } catch (err) {
        return serverError(res, err, "latest");
    }
});

router.get("/promotions", publicLimiter, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT * FROM app_promotions
             WHERE is_active = 1
               AND (starts_at IS NULL OR starts_at <= NOW())
               AND (ends_at IS NULL OR ends_at >= NOW())
             ORDER BY sort_order ASC, id DESC`
        );
        res.set("Cache-Control", "public, max-age=60");
        return res.json({ success: true, promotions: rows.map(promoOut) });
    } catch (err) {
        return serverError(res, err, "promotions");
    }
});

function sendApk(res, row) {
    const full = path.resolve(APK_DIR, row.stored_name);

    if (!full.startsWith(APK_DIR + path.sep) || !fs.existsSync(full)) {
        return fail(res, 404, "File not found.");
    }

    const prefix = APP_TYPES[row.app_type].file;
    const verName = String(row.version_name).replace(/[^0-9A-Za-z._-]/g, "");
    const fileName = `${prefix}-${verName}.apk`;

    return res.sendFile(full, {
        dotfiles: "deny",
        acceptRanges: true,
        cacheControl: false,
        headers: {
            "Content-Type": "application/vnd.android.package-archive",
            "Content-Disposition": `attachment; filename="${fileName}"`,
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-cache"
        }
    }, (err) => {
        if (err && !res.headersSent) fail(res, 404, "File not found.");
    });
}

router.get("/download/release/:id", publicLimiter, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return fail(res, 404, "File not found.");

        const [rows] = await db.execute(
            "SELECT * FROM app_releases WHERE id = ? AND is_published = 1 LIMIT 1",
            [id]
        );
        if (!rows[0]) return fail(res, 404, "File not found.");
        return sendApk(res, rows[0]);
    } catch (err) {
        return serverError(res, err, "download release");
    }
});

router.get("/download/:type", publicLimiter, async (req, res) => {
    try {
        const type = String(req.params.type || "");
        if (!Object.prototype.hasOwnProperty.call(APP_TYPES, type)) return fail(res, 404, "File not found.");

        const row = await latestPublished(type);
        if (!row) return fail(res, 404, "No published version available yet.");
        return sendApk(res, row);
    } catch (err) {
        return serverError(res, err, "download latest");
    }
});

router.get("/banner/:file", publicLimiter, (req, res) => {
    const file = String(req.params.file || "");
    if (!PROMO_FILE_RE.test(file)) return fail(res, 404, "Not found.");

    const full = path.resolve(PROMO_DIR, file);
    if (!full.startsWith(PROMO_DIR + path.sep) || !fs.existsSync(full)) return fail(res, 404, "Not found.");

    const types = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
    return res.sendFile(full, {
        dotfiles: "deny",
        headers: {
            "Content-Type": types[file.split(".").pop()],
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "public, max-age=86400"
        }
    });
});

/* ------------------------------------------------------------------ */
/* SUPER ADMIN — releases                                             */
/* ------------------------------------------------------------------ */

router.get("/admin/releases", apiGuard, async (req, res) => {
    try {
        const type = String(req.query.app_type || "");
        const where = Object.prototype.hasOwnProperty.call(APP_TYPES, type) ? "WHERE app_type = ?" : "";
        const [rows] = await db.execute(
            `SELECT * FROM app_releases ${where} ORDER BY app_type ASC, version_code DESC, id DESC`,
            where ? [type] : []
        );
        return res.json({ success: true, releases: rows.map(adminRelease) });
    } catch (err) {
        return serverError(res, err, "admin releases");
    }
});

const apkUpload = fileUpload({
    useTempFiles: true,
    tempFileDir: os.tmpdir(),
    createParentPath: false,
    safeFileNames: true,
    preserveExtension: true,
    parseNested: false,
    abortOnLimit: true,
    limits: { fileSize: APK_MAX_BYTES, files: 1 },
    limitHandler: (req, res) => fail(res, 413, `APK is too large (max ${Math.round(APK_MAX_BYTES / 1024 / 1024)} MB).`)
});

const VERSION_NAME_RE = /^[0-9]{1,4}(\.[0-9]{1,4}){0,3}([-+][0-9A-Za-z.]{1,12})?$/;

router.post("/apk", ...adminChain, apkUpload, async (req, res) => {
    const file = req.files && req.files.apk;
    const cleanup = () => { try { if (file && file.tempFilePath) fs.unlinkSync(file.tempFilePath); } catch (_) { /* */ } };

    try {
        const type = String((req.body && req.body.app_type) || "");
        const versionName = String((req.body && req.body.version_name) || "").trim();
        const versionCode = Number(String((req.body && req.body.version_code) || "").trim());
        const notes = String((req.body && req.body.release_notes) || "").trim();
        const publishNow = String((req.body && req.body.publish) || "") === "1";

        if (!Object.prototype.hasOwnProperty.call(APP_TYPES, type)) {
            cleanup(); return fail(res, 400, "App type must be 'admin' or 'customer'.");
        }
        if (!VERSION_NAME_RE.test(versionName)) {
            cleanup(); return fail(res, 400, "Version number is invalid (example: 1.0.3).");
        }
        if (!Number.isInteger(versionCode) || versionCode <= 0 || versionCode > 2100000000) {
            cleanup(); return fail(res, 400, "Version code must be a positive whole number.");
        }
        if (notes.length > 5000) {
            cleanup(); return fail(res, 400, "Release notes are too long (max 5000 characters).");
        }
        if (!file || Array.isArray(file)) {
            cleanup(); return fail(res, 400, "Please choose one APK file (field name: apk).");
        }
        if (!/\.apk$/i.test(String(file.name || ""))) {
            cleanup(); return fail(res, 400, "Only .apk files are allowed.");
        }
        if (!file.size || file.size <= 0 || file.size > APK_MAX_BYTES) {
            cleanup(); return fail(res, 400, "APK file size is not valid.");
        }

        const bad = await validateApkFile(file.tempFilePath, file.size);
        if (bad) { cleanup(); return fail(res, 400, bad); }

        const [dup] = await db.execute(
            "SELECT id FROM app_releases WHERE app_type = ? AND version_code = ? LIMIT 1",
            [type, versionCode]
        );
        if (dup[0]) {
            cleanup();
            return fail(res, 409, "This version code already exists for this app. Use a higher version code.");
        }

        const digest = await sha256File(file.tempFilePath);
        const safeVer = versionName.replace(/[^0-9A-Za-z._-]/g, "");
        const stored = `${type}-${safeVer}-${versionCode}-${crypto.randomBytes(4).toString("hex")}.apk`;
        const dest = path.join(APK_DIR, stored);

        await fsp.mkdir(APK_DIR, { recursive: true });
        /* COPYFILE_EXCL: আগের কোনো ফাইল কখনো ওভাররাইট হবে না */
        await fsp.copyFile(file.tempFilePath, dest, fs.constants.COPYFILE_EXCL);
        await fsp.chmod(dest, 0o644).catch(() => {});
        cleanup();

        const originalName = String(file.name).replace(/[^\w.\- ]/g, "_").slice(0, 190);

        let insertId;
        try {
            const [result] = await db.execute(
                `INSERT INTO app_releases
                   (app_type, version_name, version_code, release_notes, stored_name, original_name,
                    file_size, sha256, is_published, published_at, uploaded_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${publishNow ? "NOW()" : "NULL"}, ?)`,
                [type, versionName, versionCode, notes || null, stored, originalName,
                    file.size, digest, publishNow ? 1 : 0, Number(req.session.user_id) || null]
            );
            insertId = result.insertId;
        } catch (e) {
            safeUnlink(APK_DIR, stored);
            if (e && e.code === "ER_DUP_ENTRY") {
                return fail(res, 409, "This version code already exists for this app.");
            }
            throw e;
        }

        const [rows] = await db.execute("SELECT * FROM app_releases WHERE id = ?", [insertId]);
        return res.status(201).json({
            success: true,
            message: publishNow ? "APK uploaded and published." : "APK uploaded. Publish it to show on the website.",
            release: adminRelease(rows[0])
        });
    } catch (err) {
        cleanup();
        return serverError(res, err, "upload apk");
    }
});

router.put("/apk/:id", ...adminChain, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return fail(res, 400, "Invalid release id.");

        const [found] = await db.execute("SELECT * FROM app_releases WHERE id = ? LIMIT 1", [id]);
        if (!found[0]) return fail(res, 404, "Release not found.");

        const sets = [];
        const args = [];

        if (req.body && Object.prototype.hasOwnProperty.call(req.body, "is_published")) {
            const on = req.body.is_published === true || req.body.is_published === 1 || String(req.body.is_published) === "1";
            sets.push("is_published = ?");
            args.push(on ? 1 : 0);
            if (on && Number(found[0].is_published) !== 1) sets.push("published_at = NOW()");
        }

        if (req.body && Object.prototype.hasOwnProperty.call(req.body, "release_notes")) {
            const notes = String(req.body.release_notes || "").trim();
            if (notes.length > 5000) return fail(res, 400, "Release notes are too long (max 5000 characters).");
            sets.push("release_notes = ?");
            args.push(notes || null);
        }

        if (!sets.length) return fail(res, 400, "Nothing to update.");

        await db.execute(`UPDATE app_releases SET ${sets.join(", ")} WHERE id = ?`, [...args, id]);
        const [rows] = await db.execute("SELECT * FROM app_releases WHERE id = ?", [id]);
        return res.json({ success: true, message: "Release updated.", release: adminRelease(rows[0]) });
    } catch (err) {
        return serverError(res, err, "update release");
    }
});

/* ------------------------------------------------------------------ */
/* SUPER ADMIN — promotions                                           */
/* ------------------------------------------------------------------ */

router.get("/admin/promotions", apiGuard, async (req, res) => {
    try {
        const [rows] = await db.execute("SELECT * FROM app_promotions ORDER BY sort_order ASC, id DESC");
        return res.json({ success: true, promotions: rows.map(promoOut) });
    } catch (err) {
        return serverError(res, err, "admin promotions");
    }
});

function validLink(link) {
    if (!link) return true;
    if (link.length > 500) return false;
    if (link.startsWith("/") && !link.startsWith("//")) return true;
    return /^https?:\/\/[^\s]+$/i.test(link);
}

function readPromo(body) {
    const title = String(body.title || "").trim();
    const message = String(body.message || "").trim();
    const buttonText = String(body.button_text || "").trim();
    const buttonLink = String(body.button_link || "").trim();
    const startsAt = parseDateTime(body.starts_at);
    const endsAt = parseDateTime(body.ends_at);
    const isActive = String(body.is_active) === "0" || body.is_active === false || String(body.is_active) === "false" ? 0 : 1;
    const sortOrder = Number(String(body.sort_order ?? "0").trim() || 0);

    if (!title || title.length > 190) return { error: "Title is required (max 190 characters)." };
    if (message.length > 3000) return { error: "Message is too long (max 3000 characters)." };
    if (buttonText.length > 60) return { error: "Button text is too long (max 60 characters)." };
    if (!validLink(buttonLink)) return { error: "Button link must start with http://, https:// or /." };
    if (buttonLink && !buttonText) return { error: "Please enter the button text for the link." };
    if (startsAt.error || endsAt.error) return { error: "Start/End date format is invalid." };
    if (startsAt.value && endsAt.value && endsAt.value <= startsAt.value) return { error: "End date must be after start date." };
    if (!Number.isInteger(sortOrder) || Math.abs(sortOrder) > 100000) return { error: "Sort order must be a whole number." };

    return {
        data: {
            title, message: message || null, buttonText: buttonText || null, buttonLink: buttonLink || null,
            startsAt: startsAt.value, endsAt: endsAt.value, isActive, sortOrder
        }
    };
}

/* ব্যানার ইমেজ সংরক্ষণ → ফাইলের নাম (অথবা { error }) */
async function saveBanner(req) {
    const f = req.files && req.files.banner;
    if (!f) return { file: null };
    if (Array.isArray(f)) return { error: "Please upload only one banner image." };
    if (!f.data || !f.data.length) return { error: "Banner image is empty." };
    if (f.size > BANNER_MAX_BYTES) return { error: "Banner image is too large (max 3 MB)." };

    const kind = imageKind(f.data);
    if (!kind) return { error: "Banner must be a PNG, JPG or WEBP image." };

    await fsp.mkdir(PROMO_DIR, { recursive: true });
    const name = `${crypto.randomBytes(16).toString("hex")}.${kind}`;
    await fsp.writeFile(path.join(PROMO_DIR, name), f.data, { flag: "wx", mode: 0o644 });
    return { file: name };
}

router.post("/promotions", ...adminChain, async (req, res) => {
    let banner = null;
    try {
        const parsed = readPromo(req.body || {});
        if (parsed.error) return fail(res, 400, parsed.error);

        const saved = await saveBanner(req);
        if (saved.error) return fail(res, 400, saved.error);
        banner = saved.file;

        const d = parsed.data;
        const [result] = await db.execute(
            `INSERT INTO app_promotions
               (title, message, banner_file, button_text, button_link, starts_at, ends_at, is_active, sort_order, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [d.title, d.message, banner, d.buttonText, d.buttonLink, d.startsAt, d.endsAt,
                d.isActive, d.sortOrder, Number(req.session.user_id) || null]
        );
        const [rows] = await db.execute("SELECT * FROM app_promotions WHERE id = ?", [result.insertId]);
        return res.status(201).json({ success: true, message: "Promotion added.", promotion: promoOut(rows[0]) });
    } catch (err) {
        if (banner) safeUnlink(PROMO_DIR, banner);
        return serverError(res, err, "add promotion");
    }
});

router.put("/promotions/:id", ...adminChain, async (req, res) => {
    let newBanner = null;
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return fail(res, 400, "Invalid promotion id.");

        const [found] = await db.execute("SELECT * FROM app_promotions WHERE id = ? LIMIT 1", [id]);
        if (!found[0]) return fail(res, 404, "Promotion not found.");

        const parsed = readPromo(req.body || {});
        if (parsed.error) return fail(res, 400, parsed.error);

        const saved = await saveBanner(req);
        if (saved.error) return fail(res, 400, saved.error);
        newBanner = saved.file;

        const removeBanner = String((req.body && req.body.remove_banner) || "") === "1";
        let bannerFile = found[0].banner_file;
        if (newBanner) bannerFile = newBanner;
        else if (removeBanner) bannerFile = null;

        const d = parsed.data;
        await db.execute(
            `UPDATE app_promotions
                SET title = ?, message = ?, banner_file = ?, button_text = ?, button_link = ?,
                    starts_at = ?, ends_at = ?, is_active = ?, sort_order = ?
              WHERE id = ?`,
            [d.title, d.message, bannerFile, d.buttonText, d.buttonLink, d.startsAt, d.endsAt, d.isActive, d.sortOrder, id]
        );

        if (found[0].banner_file && found[0].banner_file !== bannerFile) {
            safeUnlink(PROMO_DIR, found[0].banner_file);
        }

        const [rows] = await db.execute("SELECT * FROM app_promotions WHERE id = ?", [id]);
        return res.json({ success: true, message: "Promotion updated.", promotion: promoOut(rows[0]) });
    } catch (err) {
        if (newBanner) safeUnlink(PROMO_DIR, newBanner);
        return serverError(res, err, "update promotion");
    }
});

router.delete("/promotions/:id", ...adminChain, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return fail(res, 400, "Invalid promotion id.");

        const [found] = await db.execute("SELECT banner_file FROM app_promotions WHERE id = ? LIMIT 1", [id]);
        if (!found[0]) return fail(res, 404, "Promotion not found.");

        await db.execute("DELETE FROM app_promotions WHERE id = ?", [id]);
        if (found[0].banner_file) safeUnlink(PROMO_DIR, found[0].banner_file);

        return res.json({ success: true, message: "Promotion deleted." });
    } catch (err) {
        return serverError(res, err, "delete promotion");
    }
});

module.exports = router;
module.exports._test = { APK_DIR, PROMO_DIR, imageKind, validateApkFile, parseDateTime, readPromo, validLink };
