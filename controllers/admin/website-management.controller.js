"use strict";

const path = require("path");
const db = require("../../config/database");

exports.page = (req, res) => {
    return res.sendFile(
        path.join(__dirname, "../../views/admin/website-management.html")
    );
};

// Public website এই API থেকে কনটেন্ট পড়বে
exports.getContent = async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT content, updated_at FROM website_contents WHERE id = 1 LIMIT 1"
        );

        let content = {};

        if (rows.length && rows[0].content) {
            content = JSON.parse(rows[0].content);
        }

return res.json({
    success: true,
    data: content,
    content,
    updated_at: rows[0]?.updated_at || null
});
    } catch (error) {
        console.error("[Website Management] Load:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load website content."
        });
    }
};

// Super Admin কনটেন্ট সংরক্ষণ করবে
exports.saveContent = async (req, res) => {
    try {
        const content = req.body?.content ?? req.body;

        if (
            !content ||
            typeof content !== "object" ||
            Array.isArray(content)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid website content."
            });
        }

        const contentJson = JSON.stringify(content);

        await db.query(
            `INSERT INTO website_contents (id, content, updated_by)
             VALUES (1, ?, ?)
             ON DUPLICATE KEY UPDATE
                content = VALUES(content),
                updated_by = VALUES(updated_by)`,
            [contentJson, Number(req.session.user_id)]
        );

        return res.json({
            success: true,
            message: "Website content saved successfully."
        });
    } catch (error) {
        console.error("[Website Management] Save:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to save website content."
        });
    }
};