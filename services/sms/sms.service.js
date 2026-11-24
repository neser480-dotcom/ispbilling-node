"use strict";

const db = require("../../config/database");
const { sendOne } = require("./gateway");

const CHANNELS = ["non_masking", "masking", "fixed", "voice"];

/* Latin: 160 (153 per part). Bangla/unicode: 70 (67 per part). */
function countSms(text) {
    const letters = [...String(text || "")].length;
    const unicode = /[^\x00-\x7F]/.test(String(text || ""));
    const single = unicode ? 70 : 160;
    const multi = unicode ? 67 : 153;
    const sms = letters === 0 ? 1 : letters <= single ? 1 : Math.ceil(letters / multi);
    return { letters, sms, unicode };
}

/* USERNAME, CUSTOMER_ID ... -> values; unknown words stay as they are */
function render(template, vars) {
    return String(template || "").replace(/\b[A-Z][A-Z_]{2,}\b/g, (k) =>
        Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k] ?? "") : k
    );
}

function normalizeMobile(m) {
    let s = String(m || "").replace(/[^\d+]/g, "");
    if (s.startsWith("+88")) s = s.slice(3);
    else if (s.startsWith("88") && s.length === 13) s = s.slice(2);
    return /^01\d{9}$/.test(s) ? s : null;
}

const channelOf = (messageType, sendType) =>
    messageType === "voice" ? "voice" : sendType;

const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

/* ---------------- balance ---------------- */
async function ensureBalance(companyId) {
    await db.query(
        "INSERT IGNORE INTO sms_balances (company_id, type, balance) VALUES (?,'non_masking',0),(?,'masking',0),(?,'fixed',0),(?,'voice',0)",
        [companyId, companyId, companyId, companyId]
    );
}

async function getBalance(companyId) {
    await ensureBalance(companyId);
    const [rows] = await db.query("SELECT type, balance FROM sms_balances WHERE company_id = ?", [companyId]);
    const out = { non_masking: 0, masking: 0, fixed: 0, voice: 0 };
    rows.forEach((r) => (out[r.type] = r.balance));
    return out;
}

async function deduct(companyId, channel, n) {
    await ensureBalance(companyId);
    const [r] = await db.query(
        "UPDATE sms_balances SET balance = balance - ? WHERE company_id = ? AND type = ? AND balance >= ?",
        [n, companyId, channel, n]
    );
    return r.affectedRows === 1;
}

async function refund(companyId, channel, n) {
    if (n > 0) {
        await db.query("UPDATE sms_balances SET balance = balance + ? WHERE company_id = ? AND type = ?", [n, companyId, channel]);
    }
}

/* ---------------- areas ---------------- */
async function listAreas(companyId) {
    const id = Number(companyId);

    if (!Number.isInteger(id) || id <= 0) {
        return [];
    }

    const [areas] = await db.query(
        `SELECT id, name
         FROM areas
         WHERE company_id = ?
         ORDER BY name`,
        [id]
    );

    const [subs] = await db.query(
        `SELECT id, area_id, name
         FROM sub_areas
         WHERE company_id = ?
         ORDER BY name`,
        [id]
    );

    return areas.map((a) => ({
        id: Number(a.id),
        name: a.name,
        subs: subs
            .filter((s) => Number(s.area_id) === Number(a.id))
            .map((s) => ({
                id: Number(s.id),
                name: s.name
            }))
    }));
}

/* ---------------- recipients ----------------
   customers: phone, customer_id, name, pppoe_username, monthly_bill, balance,
   payment_status (paid|unpaid), status (Active|Expired|...), promise_date, area_id, sub_area_id */
async function findRecipients(companyId, f = {}) {
    const where = ["c.company_id = ?", "c.deleted_at IS NULL", "c.phone IS NOT NULL", "c.phone <> ''"];
    const args = [companyId];

    const areaIds = (f.areaIds || []).map(Number).filter(Boolean);
    const subIds = (f.subAreaIds || []).map(Number).filter(Boolean);
    if (areaIds.length || subIds.length) {
        const parts = [];
        if (areaIds.length) { parts.push("c.area_id IN (?)"); args.push(areaIds); }
        if (subIds.length) { parts.push("c.sub_area_id IN (?)"); args.push(subIds); }
        where.push("(" + parts.join(" OR ") + ")");
    }

    switch (f.status) {
case "paid":
    where.push("LOWER(COALESCE(c.payment_status, '')) = 'paid'");
    break;

case "unpaid":
    where.push("LOWER(COALESCE(c.payment_status, '')) = 'unpaid'");
    break;
        case "active": where.push("LOWER(c.status) = 'active'"); break;
        case "inactive": where.push("LOWER(c.status) = 'inactive'"); break;
        case "expired": where.push("LOWER(c.status) = 'expired'"); break;
        case "expiring":
            where.push("LOWER(c.status) = 'active' AND c.promise_date IS NOT NULL AND c.promise_date >= NOW() AND c.promise_date < DATE_ADD(NOW(), INTERVAL ? DAY)");
            args.push(Math.min(Math.max(Number(f.days) || 3, 1), 60));
            break;
        case "bill_date":
            if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date || "")) throw new Error("Bill date দিন");
            where.push("DATE(c.promise_date) = ?");
            args.push(f.date);
            break;
        default: break;
    }

    const [rows] = await db.query(
        `SELECT c.id, c.customer_id, c.name, c.phone, c.pppoe_username, c.monthly_bill,
                c.payment_status, c.promise_date
           FROM customers c WHERE ${where.join(" AND ")}`,
        args
    );
    return rows;
}

function varsFor(c) {
    const due = c.payment_status === "unpaid" ? Number(c.monthly_bill || 0) : 0;
    return {
        USERNAME: c.pppoe_username || "",
        CUSTOMER_ID: c.customer_id || c.id,
        CUSTOMER_NAME: c.name || "",
        AMOUNT: Number(c.monthly_bill || 0),
        BILL_DUE: due,
        BILL_DATE: fmtDate(c.promise_date),
        BILL_MONTH: new Date().toLocaleString("en", { month: "long" }),
    };
}

/* ---------------- sending ---------------- */
async function deliver({ companyId, customerId, channel, mobile, message, kind }) {
    const { sms } = countSms(message);
    const r = await sendOne({ to: mobile, message, channel });
    await db.query(
        "INSERT INTO sms_message_log (company_id, customer_id, channel, mobile, status, kind, sms_count, message, error) VALUES (?,?,?,?,?,?,?,?,?)",
        [companyId, customerId || null, channel, mobile, r.ok ? "sent" : "failed", kind, sms, message, r.ok ? null : String(r.error || "error").slice(0, 250)]
    );
    return { ok: r.ok, sms };
}

function buildJobs(recipients, message) {
    return recipients
        .map((c) => ({ c, mobile: normalizeMobile(c.phone) }))
        .filter((x) => x.mobile)
        .map((x) => ({ id: x.c.id, mobile: x.mobile, text: render(message, varsFor(x.c)) }));
}

async function previewBulk(companyId, { filters, message, messageType, sendType }) {
    const all = await findRecipients(companyId, filters);
    const jobs = buildJobs(all, message || "");
    const totalSms = jobs.reduce((s, j) => s + countSms(j.text).sms, 0);
    const channel = channelOf(messageType, sendType);
    const balance = (await getBalance(companyId))[channel];
    return { recipients: jobs.length, skipped: all.length - jobs.length, totalSms, channel, balance, enough: balance >= totalSms };
}

async function sendBulk(companyId, { filters, message, messageType = "text", sendType = "non_masking" }) {
    if (!String(message || "").trim()) throw new Error("মেসেজ লিখুন");
    if (!CHANNELS.includes(channelOf(messageType, sendType))) throw new Error("Invalid type");
    const channel = channelOf(messageType, sendType);
    const jobs = buildJobs(await findRecipients(companyId, filters), message);
    if (!jobs.length) throw new Error("কোনো কাস্টমার পাওয়া যায়নি");

    const need = jobs.reduce((s, j) => s + countSms(j.text).sms, 0);
    if (!(await deduct(companyId, channel, need))) throw new Error("SMS ব্যালেন্স যথেষ্ট নয়");

    let sent = 0, failed = 0, failedSms = 0;
    for (let i = 0; i < jobs.length; i += 20) {
        const res = await Promise.all(
            jobs.slice(i, i + 20).map((j) =>
                deliver({ companyId, customerId: j.id, channel, mobile: j.mobile, message: j.text, kind: "bulk" })
            )
        );
        res.forEach((r) => (r.ok ? sent++ : (failed++, (failedSms += r.sms))));
    }
    await refund(companyId, channel, failedSms);
    return { sent, failed, charged: need - failedSms };
}

/* Auto SMS from other code:
   await require("./services/sms/sms.service").sendEvent(companyId, "bill_confirmation", phone, {USERNAME:..., AMOUNT:...}) */
async function sendEvent(companyId, eventKey, phone, vars = {}, customerId = null) {
    const [[t]] = await db.query("SELECT * FROM sms_templates WHERE company_id = ? AND event_key = ?", [companyId, eventKey]);
    const mobile = normalizeMobile(phone);
    if (!t || !t.enabled || !mobile || !String(t.body).trim()) return { skipped: true };
    const channel = channelOf(t.message_type, t.send_type);
    const message = render(t.body, vars);
    const { sms } = countSms(message);
    if (!(await deduct(companyId, channel, sms))) return { skipped: true, reason: "insufficient balance" };
    const r = await deliver({ companyId, customerId, channel, mobile, message, kind: eventKey });
    if (!r.ok) await refund(companyId, channel, sms);
    return r;
}

/* ---------------- purchase ---------------- */
async function price(type, count) {
    const [[p]] = await db.query("SELECT unit_price FROM sms_prices WHERE type = ?", [type]);
    if (!p) throw new Error("Invalid type");
    return Math.round(Number(p.unit_price) * Number(count) * 100) / 100;
}

async function createPurchase(companyId, type, count) {
    if (!CHANNELS.includes(type) || !Number.isInteger(count) || count < 1 || count > 1000000) throw new Error("Invalid input");
    const amount = await price(type, count);
    const [r] = await db.query("INSERT INTO sms_purchases (company_id, type, sms_count, amount) VALUES (?,?,?,?)", [companyId, type, count, amount]);
    return { id: r.insertId, amount };
}

/* Call after payment is verified (super admin / gateway callback only) */
async function confirmPurchase(id, paymentRef = null) {
    const [r] = await db.query("UPDATE sms_purchases SET status='paid', paid_at=NOW(), payment_ref=? WHERE id=? AND status='pending'", [paymentRef, id]);
    if (r.affectedRows !== 1) throw new Error("অর্ডার pending নয়");
    const [[p]] = await db.query("SELECT company_id, type, sms_count FROM sms_purchases WHERE id = ?", [id]);
    await ensureBalance(p.company_id);
    await db.query("UPDATE sms_balances SET balance = balance + ? WHERE company_id = ? AND type = ?", [p.sms_count, p.company_id, p.type]);
    return p;
}

module.exports = {
    CHANNELS, countSms, render, normalizeMobile, getBalance, listAreas, previewBulk, sendBulk,
    sendEvent, price, createPurchase, confirmPurchase,
};
