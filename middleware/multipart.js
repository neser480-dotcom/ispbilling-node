"use strict";

const fileUpload = require("express-fileupload");

/* APK আপলোড (বড় ফাইল) নিজস্ব রুটে হ্যান্ডেল হয় — এখানে পার্স করা হয় না */
const SKIP_PATHS = new Set(["/api/app-download/apk"]);

function multipart() {
    const parser = buildParser();

    return (req, res, next) => {
        if (SKIP_PATHS.has(req.path) && req.method === "POST") return next();
        return parser(req, res, next);
    };
}

function buildParser() {
    return fileUpload({
        createParentPath: false,

        limits: {
            fileSize: 50 * 1024 * 1024
        },

        abortOnLimit: true,

        useTempFiles: false,

        parseNested: false,

        debug: false
    });
}

module.exports = {
    multipart
};