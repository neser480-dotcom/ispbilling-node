
"use strict";

const express = require("express");
const crypto = require("crypto");
const db = require("../../config/database");
const { requireAuth } = require("../../middleware/auth");
const { isAdmin, isSuperAdmin } = require("../../middleware/permission");

const router = express.Router();

let schemaPromise;

const CHAT_LIMIT = 20;
const CHAT_WINDOW = 60 * 1000;
const chatAttempts = new Map();

const DEFAULT_MODEL = "openai/gpt-oss-120b";

const ALLOWED_MODELS = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b"
];

const GROQ_API_URL =
    "https://api.groq.com/openai/v1/chat/completions";

function companyId(req) {
    if (isSuperAdmin(req)) return 0;

    const id = Number(
        req.session?.company_id ||
        req.session?.companyId ||
        0
    );

    return Number.isInteger(id) && id > 0 ? id : 0;
}

function canManage(req) {
    return isAdmin(req);
}

function encryptionKey() {
    const secret =
        process.env.AI_HELP_ENCRYPTION_KEY ||
        process.env.SESSION_SECRET;

    if (!secret || String(secret).length < 16) {
        throw new Error(
            "AI encryption key is missing or too short."
        );
    }

    return crypto.createHash("sha256")
        .update(String(secret))
        .digest();
}

function encrypt(value) {
    if (!value) return null;

    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv(
        "aes-256-gcm",
        encryptionKey(),
        iv
    );

    const encrypted = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final()
    ]);

    return [
        iv.toString("hex"),
        cipher.getAuthTag().toString("hex"),
        encrypted.toString("hex")
    ].join(":");
}

function decrypt(value) {
    if (!value) return "";

    const parts = String(value).split(":");

    if (parts.length !== 3) {
        throw new Error("Invalid encrypted API key.");
    }

    const [iv, tag, data] = parts;

    const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        encryptionKey(),
        Buffer.from(iv, "hex")
    );

    decipher.setAuthTag(Buffer.from(tag, "hex"));

    return Buffer.concat([
        decipher.update(Buffer.from(data, "hex")),
        decipher.final()
    ]).toString("utf8");
}

async function ensureSchema() {
    if (!schemaPromise) {
        schemaPromise = (async () => {

            await db.query(`
                CREATE TABLE IF NOT EXISTS ai_help_settings (
                    company_id INT NOT NULL PRIMARY KEY,
                    enabled TINYINT(1) NOT NULL DEFAULT 0,
                    model VARCHAR(100) NOT NULL
                        DEFAULT 'openai/gpt-oss-120b',
                    api_key_enc TEXT NULL,
                    updated_by INT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS ai_help_knowledge (
                    company_id INT NOT NULL PRIMARY KEY,
                    knowledge LONGTEXT NULL,
                    updated_by INT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            await db.query(`
                CREATE TABLE IF NOT EXISTS ai_help_messages (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    company_id INT NOT NULL,
                    user_id INT NOT NULL,
                    role VARCHAR(40),
                    conversation_id CHAR(36) NOT NULL,
                    question TEXT NOT NULL,
                    answer MEDIUMTEXT NOT NULL,
                    prompt_tokens INT DEFAULT 0,
                    completion_tokens INT DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_ai_user_conversation
                        (company_id, user_id, conversation_id, id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

        })().catch(error => {
            schemaPromise = null;
            throw error;
        });
    }

    return schemaPromise;
}

async function getSettings(id) {
    const [rows] = await db.query(
        `SELECT enabled, model, api_key_enc
         FROM ai_help_settings
         WHERE company_id = ?
         LIMIT 1`,
        [id]
    );

    const selected = rows[0];

    return {
        enabled: Number(selected?.enabled) === 1,
        model: selected?.model || DEFAULT_MODEL,
        apiKey: decrypt(selected?.api_key_enc),
        configured: Boolean(selected?.api_key_enc)
    };
}

function checkChatLimit(userId) {
    const now = Date.now();

    const current = chatAttempts.get(userId);

    if (!current || now - current.startedAt >= CHAT_WINDOW) {
        chatAttempts.set(userId, {
            startedAt: now,
            count: 1
        });

        return true;
    }

    if (current.count >= CHAT_LIMIT) {
        return false;
    }

    current.count++;

    return true;
}

const SYSTEM_GUIDE = `
You are Amader Bill AI Help.

You help users understand and troubleshoot Amader Bill ISP Billing software.
STRICT SOFTWARE KNOWLEDGE RULES:

1. Answer questions about Amader Bill only using the provided
   Software Knowledge Base and verified conversation context.

2. Never invent menu names, buttons, pages, tabs, fields,
   recharge procedures, payment methods, reports, or settings.

3. Never assume that a feature exists just because it is common
   in other ISP billing software.

4. If the Knowledge Base does not contain the requested procedure,
   clearly say in the user's language:
   "এই নির্দিষ্ট প্রক্রিয়ার তথ্য Knowledge Base-এ নেই।
   Admin-এর কাছ থেকে সঠিক নির্দেশনা নিন।"

5. Do not provide guessed step-by-step instructions.

6. Do not claim that a recharge, payment, customer update,
   or MikroTik operation has been completed.

7. The AI Help assistant is read-only. Never instruct users to
   bypass permissions or security controls.
Rules:
1. Reply in the user's language: Bangla or English.
2. Give clear step-by-step instructions.
3. Never claim to access live customer or router data.
4. Never change customer, payment, recharge or billing records.
5. Never ask for passwords, OTP or API keys.
6. Never bypass company isolation or user permissions.
7. Do not invent menu names, buttons, database fields or SQL.
8. If information is missing, ask one short question.

Important software rules:
- Billing, payment and recharge are database-first.
- MikroTik connectivity must not prevent database updates.
- MikroTik synchronization can happen later.
- OLT customer sync and ONU hardware sync are separate operations.
- Customer data must remain company-isolated.

You are a read-only help assistant.
`;

router.use(requireAuth, async (req, res, next) => {
    try {
        const id = companyId(req);

        if (id === 0 && !isSuperAdmin(req)) {
            return res.status(403).json({
                success: false,
                message: "Valid company account is required."
            });
        }

        await ensureSchema();

        return next();

    } catch (error) {
        console.error("[AI Help Initialization]", error);

        return res.status(500).json({
            success: false,
            message: "AI Help initialization failed."
        });
    }
});

// --------------------------------------------------
// AI HELP STATUS
// --------------------------------------------------

router.get("/status", async (req, res) => {
    try {
        const settings = await getSettings(companyId(req));

        return res.json({
            success: true,
            enabled: settings.enabled && settings.configured,
            can_manage: canManage(req)
        });

    } catch (error) {
        console.error("[AI Help Status]", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load AI status."
        });
    }
});

// --------------------------------------------------
// GET SETTINGS
// --------------------------------------------------

router.get("/settings", async (req, res) => {
    if (!canManage(req)) {
        return res.status(403).json({
            success: false,
            message: "Admin permission required."
        });
    }

    try {
        const id = companyId(req);

        const [settings] = await db.query(
            `SELECT enabled, model, api_key_enc
             FROM ai_help_settings
             WHERE company_id = ?
             LIMIT 1`,
            [id]
        );

        const [knowledge] = await db.query(
            `SELECT knowledge
             FROM ai_help_knowledge
             WHERE company_id = ?
             LIMIT 1`,
            [id]
        );

        const [usage] = await db.query(
            `SELECT
                COUNT(*) AS messages,
                COUNT(DISTINCT conversation_id) AS conversations,
                COALESCE(
                    SUM(prompt_tokens + completion_tokens), 0
                ) AS tokens
             FROM ai_help_messages
             WHERE company_id = ?`,
            [id]
        );

        return res.json({
            success: true,

            settings: {
                enabled: Number(settings[0]?.enabled) === 1,
                model: settings[0]?.model || DEFAULT_MODEL,
                key_configured: Boolean(settings[0]?.api_key_enc)
            },

            knowledge: knowledge[0]?.knowledge || "",
            usage: usage[0]
        });

    } catch (error) {
        console.error("[AI Help Settings]", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load settings."
        });
    }
});

// --------------------------------------------------
// SAVE SETTINGS
// --------------------------------------------------

router.put("/settings", async (req, res) => {
    if (!canManage(req)) {
        return res.status(403).json({
            success: false,
            message: "Admin permission required."
        });
    }

    try {
        const id = companyId(req);
        const body = req.body || {};

        const enabled =
            body.enabled === true ||
            body.enabled === 1 ||
            body.enabled === "1" ||
            body.enabled === "true"
                ? 1 : 0;

        const model = String(
            body.model || DEFAULT_MODEL
        ).trim();

        const apiKey = String(
            body.api_key || ""
        ).trim();

        if (!ALLOWED_MODELS.includes(model)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Groq model."
            });
        }

        if (apiKey.length > 500) {
            return res.status(400).json({
                success: false,
                message: "API Key is too long."
            });
        }

        let knowledge;

        if (
            Object.prototype.hasOwnProperty.call(
                body,
                "knowledge"
            )
        ) {
            knowledge = String(body.knowledge || "");

            if (knowledge.length > 30000) {
                return res.status(400).json({
                    success: false,
                    message: "Knowledge is too long."
                });
            }
        }

        const [old] = await db.query(
            `SELECT api_key_enc
             FROM ai_help_settings
             WHERE company_id = ?
             LIMIT 1`,
            [id]
        );

        const encryptedKey = apiKey
            ? encrypt(apiKey)
            : old[0]?.api_key_enc || null;

        await db.query(`
            INSERT INTO ai_help_settings
                (company_id, enabled, model, api_key_enc, updated_by)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                enabled = VALUES(enabled),
                model = VALUES(model),
                api_key_enc = VALUES(api_key_enc),
                updated_by = VALUES(updated_by)
        `, [
            id,
            enabled,
            model,
            encryptedKey,
            Number(req.session.user_id)
        ]);

        // Only update knowledge when it is actually submitted.
        if (typeof knowledge !== "undefined") {
            await db.query(`
                INSERT INTO ai_help_knowledge
                    (company_id, knowledge, updated_by)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    knowledge = VALUES(knowledge),
                    updated_by = VALUES(updated_by)
            `, [
                id,
                knowledge,
                Number(req.session.user_id)
            ]);
        }

        return res.json({
            success: true,
            message: "AI Help settings saved."
        });

    } catch (error) {
        console.error("[AI Help Save Settings]", error);

        return res.status(500).json({
            success: false,
            message: "Unable to save settings."
        });
    }
});

// --------------------------------------------------
// AI CHAT - GROQ
// --------------------------------------------------

router.post("/chat", async (req, res) => {
    try {
        const question = String(
            req.body?.message || ""
        ).trim();

        if (!question || question.length > 4000) {
            return res.status(400).json({
                success: false,
                message: "Invalid question."
            });
        }

        const id = companyId(req);
        const userId = Number(req.session.user_id);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid user session."
            });
        }

        if (!checkChatLimit(userId)) {
            return res.status(429).json({
                success: false,
                message: "Too many messages. Please try again later."
            });
        }

        const settings = await getSettings(id);

        if (!settings.enabled || !settings.apiKey) {
            return res.status(403).json({
                success: false,
                message: "AI Help is not configured."
            });
        }

        if (!ALLOWED_MODELS.includes(settings.model)) {
            return res.status(400).json({
                success: false,
                message: "Invalid configured Groq model."
            });
        }

        let conversationId = String(
            req.body?.conversation_id || ""
        );

        if (!/^[0-9a-f-]{36}$/i.test(conversationId)) {
            conversationId = crypto.randomUUID();
        }

        const [history] = await db.query(`
            SELECT question, answer
            FROM ai_help_messages
            WHERE company_id = ?
              AND user_id = ?
              AND conversation_id = ?
            ORDER BY id DESC
            LIMIT 8
        `, [
            id,
            userId,
            conversationId
        ]);

        const [kb] = await db.query(`
            SELECT knowledge
            FROM ai_help_knowledge
            WHERE company_id = ?
              AND knowledge IS NOT NULL
              AND knowledge <> ''
            LIMIT 1
        `, [id]);

        const knowledge = String(
            kb[0]?.knowledge || ""
        ).slice(0, 30000);

        const messages = [{
            role: "system",
            content: SYSTEM_GUIDE +
                "\n\nSoftware Knowledge:\n" + knowledge
        }];

        history.reverse().forEach(row => {
            messages.push({
                role: "user",
                content: row.question
            });

            messages.push({
                role: "assistant",
                content: row.answer
            });
        });

        messages.push({
            role: "user",
            content: question
        });

        const controller = new AbortController();

        const timer = setTimeout(
            () => controller.abort(),
            45000
        );

        let response;

        try {
            response = await fetch(
                GROQ_API_URL,
                {
                    method: "POST",

                    headers: {
                        Authorization:
                            "Bearer " + settings.apiKey,
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        model: settings.model,
                        messages,
                        temperature: 0.2,
                        max_tokens: 900
                    }),

                    signal: controller.signal
                }
            );

        } finally {
            clearTimeout(timer);
        }

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error(
                "[Groq AI Help API Error]",
                response.status,
                result.error?.message || "Unknown API error"
            );

            return res.status(502).json({
                success: false,
                message: "AI service could not answer."
            });
        }

        const answer = String(
            result.choices?.[0]?.message?.content || ""
        ).trim();

        if (!answer) {
            return res.status(502).json({
                success: false,
                message: "Empty AI response."
            });
        }

        await db.query(`
            INSERT INTO ai_help_messages
                (company_id, user_id, role, conversation_id,
                 question, answer, prompt_tokens, completion_tokens)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id,
            userId,
            String(req.session.role || "user"),
            conversationId,
            question,
            answer,
            Number(result.usage?.prompt_tokens || 0),
            Number(result.usage?.completion_tokens || 0)
        ]);

        return res.json({
            success: true,
            answer,
            conversation_id: conversationId
        });

    } catch (error) {
        console.error("[AI Help Chat]", error);

        return res.status(
            error.name === "AbortError" ? 504 : 500
        ).json({
            success: false,
            message: error.name === "AbortError"
                ? "AI response timed out. Please try again."
                : "AI response failed. Please try again."
        });
    }
});

// --------------------------------------------------
// CHAT HISTORY
// --------------------------------------------------

router.get("/history", async (req, res) => {
    try {
        const conversationId = String(
            req.query.conversation_id || ""
        );

        if (!/^[0-9a-f-]{36}$/i.test(conversationId)) {
            return res.json({
                success: true,
                messages: []
            });
        }

        const [rows] = await db.query(`
            SELECT question, answer, created_at
            FROM ai_help_messages
            WHERE company_id = ?
              AND user_id = ?
              AND conversation_id = ?
            ORDER BY id ASC
            LIMIT 50
        `, [
            companyId(req),
            Number(req.session.user_id),
            conversationId
        ]);

        return res.json({
            success: true,
            messages: rows
        });

    } catch (error) {
        console.error("[AI Help History]", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load history."
        });
    }
});

module.exports = router;
