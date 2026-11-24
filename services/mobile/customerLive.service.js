"use strict";
/*
| Customer-এর live তথ্য MikroTik থেকে (শুধু পড়া, কিছু বদলায় না)।
| Router সবসময় customer-এর নিজের company-র mikrotik_servers থেকে; client কখনো router/interface দেয় না।
| 2 সেকেন্ড cache: অ্যাপ প্রতি 3 সেকেন্ডে poll করলেও router-এ অতিরিক্ত চাপ পড়ে না।
*/
const db = require("../../config/database");
const { withRouter } = require("../mikrotik/routeros.service");

const TTL_MS = 2000;
const cache = new Map();       // key -> { at, value }
const inflight = new Map();    // key -> Promise

function parseUptime(s) {      // "1w2d3h4m5s" -> seconds
    const m = { w: 604800, d: 86400, h: 3600, m: 60, s: 1 };
    let t = 0;
    String(s || "").replace(/(\d+)([wdhms])/g, (_, n, u) => { t += Number(n) * m[u]; });
    return t;
}
function fmtUptime(sec) {
    if (!sec) return "";
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600),
          mi = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (d ? `${d}d` : "") + (h || d ? `${h}h` : "") + (mi || h || d ? `${mi}m` : "") + `${s}s`;
}
function fmtDateTime(d) {
    const p = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dhaka", day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: true,
    }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
    return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()}`;
}
function fmtMB(bytes) {
    const n = Number(bytes) || 0;
    return n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : `${(n / 1024 ** 2).toFixed(2)} MB`;
}
const rows = (r) => (Array.isArray(r) ? r : []);

async function getRouter(customer) {
    const [r] = await db.execute(
        `SELECT id, name, ip, username, password, port, use_ssl, timeout
         FROM mikrotik_servers WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1`,
        [customer.mikrotik_id || 0, customer.company_id]);
    return r[0] || null;
}

async function fetchLive(customer, withTotals) {
    const user = String(customer.pppoe_username || "").trim();
    if (!user || !customer.mikrotik_id) return null;
    const router = await getRouter(customer);
    if (!router) return null;
    router.timeout = Math.min(Number(router.timeout) || 3, 5);

    return withRouter(router, async (api) => {
        const active = rows(await api.write(["/ppp/active/print", `?name=${user}`, "=.proplist=name,uptime,address"]))[0];
        if (!active) {
            const sec = rows(await api.write(["/ppp/secret/print", `?name=${user}`, "=.proplist=name,last-logged-out"]))[0];
            return { online: false, lastLoggedOut: sec ? sec["last-logged-out"] : "" };
        }
        const ifName = `<pppoe-${user}>`;
        let up = 0, down = 0;
        try {
            const t = rows(await api.write(["/interface/monitor-traffic", `=interface=${ifName}`, "=once="]))[0] || {};
            up = Number(t["rx-bits-per-second"]) || 0;     // router rx = customer upload
            down = Number(t["tx-bits-per-second"]) || 0;   // router tx = customer download
        } catch (_) { /* interface নাম না মিললে 0 */ }
        let rxB = 0, txB = 0;
        if (withTotals) {
            try {
                const i = rows(await api.write(["/interface/print", "=stats=", `?name=${ifName}`, "=.proplist=name,rx-byte,tx-byte"]))[0] || {};
                rxB = Number(i["rx-byte"]) || 0; txB = Number(i["tx-byte"]) || 0;
            } catch (_) { /* ignore */ }
        }
        return { online: true, uptimeSec: parseUptime(active.uptime), upBps: up, downBps: down, rxB, txB };
    });
}

function cached(customer, withTotals) {
    const key = `${customer.company_id}:${customer.id}:${withTotals ? 1 : 0}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.value);
    if (inflight.has(key)) return inflight.get(key);
    const p = fetchLive(customer, withTotals)
        .then((v) => { cache.set(key, { at: Date.now(), value: v }); return v; })
        .finally(() => inflight.delete(key));
    inflight.set(key, p);
    if (cache.size > 2000) cache.clear();
    return p;
}

/* GET /live-speed -> { up_kbps, down_kbps } */
async function liveSpeed(customer) {
    try {
        const v = await cached(customer, false);
        if (!v || !v.online) return { up_kbps: 0, down_kbps: 0 };
        return { up_kbps: v.upBps / 1000, down_kbps: v.downBps / 1000 };
    } catch (_) { return { up_kbps: 0, down_kbps: 0 }; }
}

/* dashboard.stats — NetStats.fromJson-এর key অনুযায়ী */
async function stats(customer) {
    try {
        const v = await cached(customer, true);
        if (!v) return {};
        if (!v.online) {
            return { last_link_label: "Last Logged Out:", last_link_uptime: v.lastLoggedOut || "-",
                     current_uptime: "Offline", upload: "0 MB", download: "0 MB", uptime_alert: true };
        }
        const since = new Date(Date.now() - v.uptimeSec * 1000);
        return {
            last_link_label: "Last Link Uptime:", last_link_uptime: fmtDateTime(since),
            current_uptime: fmtUptime(v.uptimeSec),
            upload: fmtMB(v.rxB), download: fmtMB(v.txB), uptime_alert: false,
        };
    } catch (_) { return {}; }
}

module.exports = { liveSpeed, stats, fmtDateTime };
