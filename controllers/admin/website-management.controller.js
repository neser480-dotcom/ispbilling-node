"use strict";

const path = require("path");
const db = require("../../config/database");
// copy website-default-content.json to config/
const DEFAULT_CONTENT = require("../../config/website-default-content.json");

const PUBLISHED_ID = 1;
const DRAFT_ID = 2;
const MAX_BYTES = 512 * 1024;
const MAX_SECTIONS = 30;
const MAX_STRING = 5000;
const TYPES = ["hero", "about", "features", "stats", "pricing", "team", "gallery", "contact", "apps", "faq", "testimonials", "cta", "custom"];
const URL_KEYS = /(^|_)(url|image|logo|favicon|href)$/i;
const SAFE_URL = /^(https?:\/\/|\/|#|mailto:|tel:)/i;

async function readRow(id) {
    const [rows] = await db.query(
        "SELECT content, updated_at FROM website_contents WHERE id = ? LIMIT 1", [id]
    );
    if (!rows.length || !rows[0].content) return null;
    let c = rows[0].content;
    if (typeof c === "string") { try { c = JSON.parse(c); } catch { return null; } }
    return { content: c, updated_at: rows[0].updated_at };
}

const clone = (o) => JSON.parse(JSON.stringify(o));

// Old flat format (site_name, hero_heading ...) -> new section format
function migrate(old) {
    const c = clone(DEFAULT_CONTENT);
    const s = (k) => (typeof old[k] === "string" ? old[k].trim() : "");
    const sec = (t) => c.sections.find((x) => x.type === t).data;
    if (s("site_name")) c.site.name = s("site_name");
    if (s("tagline")) c.site.tagline = s("tagline");
    if (s("logo")) c.site.logo = s("logo");
    if (s("favicon")) c.site.favicon = s("favicon");
    if (s("hero_description")) sec("hero").description = s("hero_description");
    if (s("about_heading")) sec("about").title = s("about_heading");
    if (s("about_description")) sec("about").paragraphs = [s("about_description")];
    ["email", "phone", "whatsapp", "address"].forEach((k) => { if (s(k)) sec("contact")[k] = s(k); });
    if (s("footer_description")) c.footer.description = s("footer_description");
    return c;
}

function normalize(raw) {
    if (!raw) return clone(DEFAULT_CONTENT);
    if (raw.version === 2 && Array.isArray(raw.sections)) return raw;
    return migrate(raw);
}

// returns an error message or null
function validate(c) {
    if (!c || typeof c !== "object" || Array.isArray(c)) return "Invalid website content.";
    if (c.version !== 2 || !Array.isArray(c.sections)) return "Unsupported content format.";
    if (c.sections.length > MAX_SECTIONS) return "Too many sections.";
    if (Buffer.byteLength(JSON.stringify(c)) > MAX_BYTES) return "Content is too large.";

    const ids = new Set();
    for (const s of c.sections) {
        if (!s || !TYPES.includes(s.type)) return "Unknown section type.";
        if (!/^[a-z][a-z0-9-]{0,40}$/.test(s.id || "") || ids.has(s.id)) return "Invalid or duplicate section id: " + s.id;
        ids.add(s.id);
    }

    let bad = null;
    (function walk(v, key) {
        if (bad) return;
        if (typeof v === "string") {
            if (v.length > MAX_STRING) bad = "Text too long in field: " + key;
            else if (URL_KEYS.test(key) && v && !SAFE_URL.test(v)) bad = "Unsafe link in field: " + key;
        } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
        else if (v && typeof v === "object") Object.keys(v).forEach((k) => walk(v[k], k));
    })(c, "");
    return bad;
}

exports.page = (req, res) =>
    res.sendFile(path.join(__dirname, "../../views/admin/website-management.html"));

// PUBLIC: published content
exports.getContent = async (req, res) => {
    try {
        const row = await readRow(PUBLISHED_ID);
        res.set("Cache-Control", "public, max-age=60");
        return res.json({ success: true, content: normalize(row && row.content), updated_at: row ? row.updated_at : null });
    } catch (e) {
        console.error("[Website Management] Load:", e);
        return res.status(500).json({ success: false, message: "Unable to load website content." });
    }
};

// SUPER ADMIN: draft (falls back to published, then default)
exports.getDraft = async (req, res) => {
    try {
        const row = (await readRow(DRAFT_ID)) || (await readRow(PUBLISHED_ID));
        return res.json({ success: true, content: normalize(row && row.content), updated_at: row ? row.updated_at : null });
    } catch (e) {
        console.error("[Website Management] Draft load:", e);
        return res.status(500).json({ success: false, message: "Unable to load draft." });
    }
};

async function upsert(id, content, userId) {
    await db.query(
        `INSERT INTO website_contents (id, content, updated_by) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE content = VALUES(content), updated_by = VALUES(updated_by)`,
        [id, JSON.stringify(content), userId]
    );
}

exports.saveDraft = async (req, res) => {
    try {
        const content = req.body && req.body.content;
        const err = validate(content);
        if (err) return res.status(400).json({ success: false, message: err });
        await upsert(DRAFT_ID, content, Number(req.session.user_id));
        return res.json({ success: true, message: "Draft saved." });
    } catch (e) {
        console.error("[Website Management] Save draft:", e);
        return res.status(500).json({ success: false, message: "Unable to save draft." });
    }
};

// Publish the saved draft (keeps one backup in row id=3)
exports.publish = async (req, res) => {
    try {
        const draft = await readRow(DRAFT_ID);
        if (!draft) return res.status(400).json({ success: false, message: "Save a draft first." });
        const err = validate(draft.content);
        if (err) return res.status(400).json({ success: false, message: err });
        const prev = await readRow(PUBLISHED_ID);
        const uid = Number(req.session.user_id);
        if (prev) await upsert(3, prev.content, uid);
        await upsert(PUBLISHED_ID, draft.content, uid);
        return res.json({ success: true, message: "Website published." });
    } catch (e) {
        console.error("[Website Management] Publish:", e);
        return res.status(500).json({ success: false, message: "Unable to publish." });
    }
};

// Restore previous published version into draft
exports.restoreBackup = async (req, res) => {
    try {
        const prev = await readRow(3);
        if (!prev) return res.status(404).json({ success: false, message: "No backup found." });
        await upsert(DRAFT_ID, prev.content, Number(req.session.user_id));
        return res.json({ success: true, message: "Backup loaded into draft." });
    } catch (e) {
        console.error("[Website Management] Restore:", e);
        return res.status(500).json({ success: false, message: "Unable to restore." });
    }
};
