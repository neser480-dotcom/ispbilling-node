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

const COLS = "id, name, ip, username, password, port, use_ssl, timeout";
const routerOf = new Map();    // key -> router id (যে router-এ গ্রাহক পাওয়া গেছে, মনে রাখি)
const warned = new Map();
function warn(key, msg) {      // একই কারণে ৬০ সেকেন্ডে একবার log
    const t = warned.get(key + msg) || 0;
    if (Date.now() - t > 60000) { warned.set(key + msg, Date.now()); console.warn("[live]", key, msg); }
}

async function candidateRouters(customer, key) {
    const ids = [];
    if (routerOf.get(key)) ids.push(routerOf.get(key));
    if (customer.mikrotik_id) ids.push(Number(customer.mikrotik_id));
    const out = [];
    for (const id of [...new Set(ids)]) {
        const [r] = await db.execute(
            `SELECT ${COLS} FROM mikrotik_servers WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1`,
            [id, customer.company_id]);
        if (r[0]) out.push(r[0]);
    }
    if (!out.length) {          // customers.mikrotik_id ফাঁকা/ভুল: কোম্পানির সব router থেকে খুঁজি
        const [r] = await db.execute(
            `SELECT ${COLS} FROM mikrotik_servers WHERE company_id = ? AND deleted_at IS NULL ORDER BY id ASC LIMIT 6`,
            [customer.company_id]);
        out.push(...r);
    }
    return out;
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

async function probe(router, customer, user, key) {
    router.timeout = Math.min(Number(router.timeout) || 3, 5);
    return withRouter(router, async (api) => {
        const active = rows(await api.write(["/ppp/active/print", `?name=${user}`]))[0];
        if (!active) {
            lastSample.delete(key);
            const sec = rows(await api.write(["/ppp/secret/print", `?name=${user}`]))[0];
            return sec ? { online: false, lastLoggedOut: sec["last-logged-out"] || "" } : null;
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
        } else {
            warn(key, `interface pppoe-${user} পাওয়া যায়নি (active আছে কিন্তু interface নাম মেলেনি)`);
        }
        const dl = RX_IS_DOWNLOAD ? rxB : txB, ul = RX_IS_DOWNLOAD ? txB : rxB;
        return { online: true, uptimeSec: parseUptime(active.uptime), upBps, downBps, upB: ul, downB: dl };
    });
}

async function fetchLive(customer) {
    const user = String(customer.pppoe_username || "").trim();
    const key = `${customer.company_id}:${customer.id}`;
    if (!user) { warn(key, "customers.pppoe_username ফাঁকা"); return null; }
    const routers = await candidateRouters(customer, key);
    if (!routers.length) { warn(key, "এই কোম্পানির কোনো mikrotik_servers router পাওয়া যায়নি"); return null; }

    let offline = null, lastErr = null;
    for (const router of routers) {
        try {
            const r = await probe(router, customer, user, key);
            if (r && r.online) { routerOf.set(key, router.id); return r; }
            if (r && !offline) { offline = r; routerOf.set(key, router.id); }
        } catch (e) {
            lastErr = e;
            warn(key, `router #${router.id} (${router.ip}) সংযোগ ব্যর্থ: ${e.message}`);
        }
    }
    if (offline) return offline;
    if (lastErr) throw lastErr;
    warn(key, `PPPoE user "${user}" কোনো router-এর /ppp/secret-এ পাওয়া যায়নি`);
    return null;
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
    if (routerOf.size > 5000) routerOf.clear();
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
