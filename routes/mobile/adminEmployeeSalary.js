"use strict";
/*
| routes/mobile/adminEmployeeSalary.js   (mount: /api/mobile/admin)
| Employee (staff টেবিল, role=staff) ও Salary — বিদ্যমান Web Handler ভেতর থেকে পুনঃব্যবহার
| (Business Logic, Company-scope, Duplicate-মাস যাচাই, Activity Log সব Web-এর সার্ভিসেই থাকে)।
|
| মোবাইল-স্তরের সুরক্ষা:
|  • Employee ও Salary দুটোই শুধু admin/super_admin (টাকার তথ্য; Collector/Manager-এর নিয়মের সাথে মিল)।
|  • সব উত্তর থেকে password/token/secret/hash/pppoe/nid* ফিল্ড মুছে ফেলা হয়।
|  • সম্পাদনায় (PUT) অ্যাপ যে ফিল্ড পাঠায়নি (nid_no, ref_*, parent_name...) তা আগের মানই থাকে —
|    Web সার্ভিস অনুপস্থিত ফিল্ডকে NULL করে দেয়, তাই এখানে আগে বর্তমান রেকর্ড পড়ে মিলিয়ে নেওয়া হয়।
|  • SMS endpoint দেওয়া হয়নি (Web-এ gateway নেই)।
*/
const express = require("express");
const { requireBearer } = require("../../middleware/mobileAuth");
const { invokeRouter } = require("../../services/mobile/webBridge");

const staffRouter = require("../staff/staff.routes");
const salaryRouter = require("../staff/salary.routes");

const router = express.Router();
router.use(requireBearer("admin"));

/* ---------------- সহায়ক ---------------- */
const SENSITIVE = /pass(word)?|token|secret|hash|salt|csrf|api[_-]?key|private|pppoe|^nid/i;
function scrub(v, depth = 0) {
    if (depth > 8 || v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map((x) => scrub(x, depth + 1));
    if (v instanceof Date) return v;
    const out = {};
    for (const [k, val] of Object.entries(v)) {
        if (SENSITIVE.test(k)) continue;
        out[k] = scrub(val, depth + 1);
    }
    return out;
}

const bad = (res, message) => res.status(400).json({ success: false, code: "BAD_REQUEST", message });
const adminOnly = (req, res, next) => req.auth.hasFullAccess ? next()
    : res.status(403).json({ success: false, code: "FORBIDDEN", message: "শুধু Admin এই কাজ করতে পারবেন।" });
router.use("/employees", adminOnly);
router.use("/salaries", adminOnly);

const intId = (v) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001F]/g, "").trim().slice(0, max);
const money = (v) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };

async function call(res, next, target, opts) {
    try {
        const r = await invokeRouter(target, res.req, opts);
        res.status(r.status || 502).json(scrub(r.body) || { success: false, message: "ব্যর্থ হয়েছে।" });
    } catch (e) { next(e); }
}

/* Web-এর বর্তমান Employee রেকর্ড (scrub ছাড়া, শুধু সার্ভারের ভেতরে ব্যবহৃত) */
async function currentEmployee(req, id) {
    const r = await invokeRouter(staffRouter, req, { url: "/data", query: {} });
    const rows = (r.body && Array.isArray(r.body.staff)) ? r.body.staff : [];
    return rows.find((s) => Number(s.id) === id) || null;
}

const FIELDS = {
    name: 150, mobile: 30, email: 150, address: 300, parent_name: 150,
    nid_no: 40, ref_name: 150, ref_mobile: 30, ref_email: 150, ref_nid: 40,
    ref_address: 300, ref_relation: 60
};
function employeeBody(src, base = {}) {
    const out = { ...base };
    for (const [k, max] of Object.entries(FIELDS)) {
        if (src[k] !== undefined) out[k] = clean(src[k], max);
    }
    if (src.salary !== undefined) out.salary = money(src.salary);
    if (src.status !== undefined) out.status = clean(src.status, 20).toLowerCase();
    return out;
}

/* ============ Employee ============ */
router.get("/employees", (req, res, next) => {
    const query = {};
    const search = clean(req.query.search, 60); if (search) query.search = search;
    return call(res, next, staffRouter, { url: "/data", query });
});

router.post("/employees", (req, res, next) => {
    const body = employeeBody(req.body || {});
    if (!body.name) return bad(res, "নাম দিন।");
    if (!body.mobile) return bad(res, "মোবাইল নম্বর দিন।");
    if (body.salary !== undefined && Number.isNaN(body.salary)) return bad(res, "বেতনের অংকটি ভুল।");
    return call(res, next, staffRouter, { method: "POST", url: "/", body, csrf: true });
});

router.put("/employees/:id", async (req, res, next) => {
    const id = intId(req.params.id);
    if (!id) return bad(res, "ভুল ID।");
    try {
        const cur = await currentEmployee(req, id);
        if (!cur) return res.status(404).json({ success: false, code: "NOT_FOUND", message: "কর্মী পাওয়া যায়নি।" });
        const base = {};
        for (const k of [...Object.keys(FIELDS), "salary", "status"]) {
            if (cur[k] !== undefined && cur[k] !== null) base[k] = cur[k];
        }
        const body = employeeBody(req.body || {}, base);
        if (!body.name) return bad(res, "নাম দিন।");
        if (!body.mobile) return bad(res, "মোবাইল নম্বর দিন।");
        if (Number.isNaN(body.salary)) return bad(res, "বেতনের অংকটি ভুল।");
        return call(res, next, staffRouter, { method: "PUT", url: `/${id}`, body, csrf: true });
    } catch (e) { return next(e); }
});

router.delete("/employees/:id", (req, res, next) => {
    const id = intId(req.params.id);
    if (!id) return bad(res, "ভুল ID।");
    return call(res, next, staffRouter, { method: "DELETE", url: `/${id}`, csrf: true });
});

/* ============ Salary (কর্মী-ভিত্তিক) ============ */
// GET /salaries/:staffId?search=  -> {staff, salaryList, totalPaid, totalData}
router.get("/salaries/:staffId", (req, res, next) => {
    const id = intId(req.params.staffId);
    if (!id) return bad(res, "ভুল ID।");
    const query = { id: String(id) };
    const search = clean(req.query.search, 60); if (search) query.search = search;
    return call(res, next, salaryRouter, { url: "/data", query });
});

// POST /salaries/:staffId/pay  {year, month, amount, comment}
router.post("/salaries/:staffId/pay", (req, res, next) => {
    const id = intId(req.params.staffId);
    if (!id) return bad(res, "ভুল ID।");
    const b = req.body || {};
    const year = Number(b.year), month = Number(b.month), amount = money(b.amount);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return bad(res, "বছর ২০০০–২১০০ এর মধ্যে দিন।");
    if (!Number.isInteger(month) || month < 1 || month > 12) return bad(res, "মাস ১–১২ এর মধ্যে দিন।");
    if (!(amount > 0)) return bad(res, "অংক শূন্যের বেশি হতে হবে।");
    const body = { staff_id: id, year, month, amount, comment: clean(b.comment, 2000) };
    return call(res, next, salaryRouter, { method: "POST", url: `/${id}/pay`, body, csrf: true });
});

// DELETE /salaries/:staffId/:salaryId
router.delete("/salaries/:staffId/:salaryId", (req, res, next) => {
    const staffId = intId(req.params.staffId), salaryId = intId(req.params.salaryId);
    if (!staffId || !salaryId) return bad(res, "ভুল ID।");
    return call(res, next, salaryRouter, {
        method: "POST", url: "/delete", body: { staff_id: staffId, salary_id: salaryId }, csrf: true });
});

module.exports = router;
module.exports._test = { scrub, employeeBody };
