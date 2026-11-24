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

/* RouterOS-এর pppoe-in interface-এর নাম API-তে "pppoe-<username>" (<> ছাড়া) —
   customerTrafficService-এর মতোই। RX/TX-ও সেখানকার নিয়মে: RX = Download, TX = Upload।
   উল্টো দেখালে নিচের RX_IS_DOWNLOAD = false করুন। */
const RX_IS_DOWNLOAD = true;
const lastSample = new Map();   // key -> { t, rx, tx }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readIface(api, user) {
    const name = `pppoe-${user}`;
    let r = rows(await api.write(["/interface/print", `?name=${name}`]))[0];
    if (!r) r = rows(await api.write(["/interface/print", `?name=<${name}>`]))[0];
    if (!r) return null;
    return { t: Date.now(), rx: Number(r["rx-byte"]) || 0, tx: Number(r["tx-byte"]) || 0 };
}

async function fetchLive(customer) {
    const user = String(customer.pppoe_username || "").trim();
    if (!user || !customer.mikrotik_id) return null;
    const router = await getRouter(customer);
    if (!router) return null;
    router.timeout = Math.min(Number(router.timeout) || 3, 5);
    const key = `${customer.company_id}:${customer.id}`;

    return withRouter(router, async (api) => {
        const active = rows(await api.write(["/ppp/active/print", `?name=${user}`]))[0];
        if (!active) {
            lastSample.delete(key);
            const sec = rows(await api.write(["/ppp/secret/print", `?name=${user}`]))[0];
            return { online: false, lastLoggedOut: sec ? sec["last-logged-out"] : "" };
        }
        let prev = lastSample.get(key);
        if (!prev || Date.now() - prev.t > 10000) {     // আগের sample নেই/পুরোনো: নিজেই ১ সেকেন্ডের ব্যবধানে নিই
            prev = await readIface(api, user);
            if (prev) await sleep(1000);
        }
        const cur = await readIface(api, user);
        let upBps = 0, downBps = 0, rxB = 0, txB = 0;
        if (cur) {
            rxB = cur.rx; txB = cur.tx;
            lastSample.set(key, cur);
            if (prev && cur.t > prev.t) {
                const sec = (cur.t - prev.t) / 1000;
                const rxBps = (Math.max(0, cur.rx - prev.rx) * 8) / sec;
                const txBps = (Math.max(0, cur.tx - prev.tx) * 8) / sec;
                downBps = RX_IS_DOWNLOAD ? rxBps : txBps;
                upBps = RX_IS_DOWNLOAD ? txBps : rxBps;
            }
        }
        const dl = RX_IS_DOWNLOAD ? rxB : txB, ul = RX_IS_DOWNLOAD ? txB : rxB;
        return { online: true, uptimeSec: parseUptime(active.uptime), upBps, downBps, upB: ul, downB: dl };
    });
}

function cached(customer) {
    const key = `${customer.company_id}:${customer.id}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.value);
    if (inflight.has(key)) return inflight.get(key);
    const p = fetchLive(customer)
        .then((v) => { cache.set(key, { at: Date.now(), value: v }); return v; })
        .finally(() => inflight.delete(key));
    inflight.set(key, p);
    if (cache.size > 2000) cache.clear();
    if (lastSample.size > 5000) lastSample.clear();
    return p;
}

/* GET /live-speed -> { up_kbps, down_kbps } */
async function liveSpeed(customer) {
    try {
        const v = await cached(customer);
        if (!v || !v.online) return { up_kbps: 0, down_kbps: 0 };
        return { up_kbps: v.upBps / 1000, down_kbps: v.downBps / 1000 };
    } catch (e) { console.error("[live-speed]", e.message); return { up_kbps: 0, down_kbps: 0 }; }
}

/* dashboard.stats — NetStats.fromJson-এর key অনুযায়ী */
async function stats(customer) {
    try {
        const v = await cached(customer);
        if (!v) return {};
        if (!v.online) {
            return { last_link_label: "Last Logged Out:", last_link_uptime: v.lastLoggedOut || "-",
                     current_uptime: "Offline", upload: "0 MB", download: "0 MB", uptime_alert: true };
        }
        const since = new Date(Date.now() - v.uptimeSec * 1000);
        return {
            last_link_label: "Last Link Uptime:", last_link_uptime: fmtDateTime(since),
            current_uptime: fmtUptime(v.uptimeSec),
            upload: fmtMB(v.upB), download: fmtMB(v.downB), uptime_alert: false,
        };
    } catch (e) { console.error("[live-stats]", e.message); return {}; }
}

module.exports = { liveSpeed, stats, fmtDateTime };
