"use strict";

/*
| Keeps the current request's IP / user / role available to the database
| layer, so every INSERT INTO activity_logs automatically records them even
| when the writing service does not pass them.
*/

const { AsyncLocalStorage } = require("async_hooks");

const storage = new AsyncLocalStorage();

function cleanIp(value) {
    let ip = String(value || "").split(",")[0].trim();
    if (ip.startsWith("::ffff:")) ip = ip.slice(7);
    if (ip === "::1") ip = "127.0.0.1";
    return ip.slice(0, 45);
}

function requestContext(req, res, next) {
    const s = req.session || {};
    storage.run({
        ip: cleanIp(req.ip || req.socket?.remoteAddress),
        userName: String(s.username || "").slice(0, 100),
        role: String(s.role || "").slice(0, 50)
    }, next);
}

requestContext.get = () => storage.getStore() || null;

module.exports = requestContext;
