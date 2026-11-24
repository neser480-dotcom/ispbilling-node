"use strict";

const requestContext = require("../middleware/request-context");

/*
| Activity log auto-fill.
| Many services INSERT into activity_logs without ip_address / user_name /
| role_name. For those inserts (column list + VALUES form only) the values of
| the current request are added here, so the Activity Log page shows them.
*/
function fillActivityLog(sql, params) {
    try {
        if (typeof sql !== "string" || !Array.isArray(params)) return [sql, params];
        if (!/INSERT\s+INTO\s+activity_logs\s*\(/i.test(sql)) return [sql, params];

        const ctx = requestContext.get();
        if (!ctx || !ctx.ip) return [sql, params];

        const add = [];
        const vals = [];

        if (!/\bip_address\b/i.test(sql)) { add.push("ip_address"); vals.push(ctx.ip); }
        if (!/\buser_name\b/i.test(sql) && ctx.userName) { add.push("user_name"); vals.push(ctx.userName); }
        if (!/\brole_name\b/i.test(sql) && ctx.role) { add.push("role_name"); vals.push(ctx.role); }

        if (!add.length || !/VALUES\s*\(/i.test(sql)) return [sql, params];

        const out = sql
            .replace(/(INSERT\s+INTO\s+activity_logs\s*\()/i, `$1${add.join(", ")}, `)
            .replace(/(VALUES\s*\()/i, `$1${add.map(() => "?").join(", ")}, `);

        return [out, [...vals, ...params]];
    } catch (_) {
        return [sql, params];
    }
}

function patch(target) {
    for (const name of ["query", "execute"]) {
        const original = target[name];
        if (typeof original !== "function" || original.__activityPatched) continue;

        const wrapped = function (sql, params, ...rest) {
            const [s, p] = fillActivityLog(sql, params);
            return original.call(this, s, p, ...rest);
        };
        wrapped.__activityPatched = true;
        target[name] = wrapped;
    }
}

module.exports = function installActivityLogPatch(db) {
    if (!db || db.__activityLogPatched) return db;
    db.__activityLogPatched = true;

    patch(db);

    const originalGetConnection = db.getConnection.bind(db);

    db.getConnection = async function (...args) {
        const conn = await originalGetConnection(...args);
        patch(conn);
        return conn;
    };

    return db;
};

