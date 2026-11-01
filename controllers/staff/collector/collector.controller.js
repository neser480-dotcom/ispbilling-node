"use strict";

const service = require("../../../services/staff/collector/collector.service");

function csrfOk(req, res) {
    const s = String(req.session?.csrf_token || "").trim();
    const t = String(req.get("X-CSRF-Token") || req.body?.csrf_token || req.body?._csrf || "").trim();
    if (!s || !t || s !== t) {
        res.status(403).json({ success: false, message: "Invalid CSRF token." });
        return false;
    }
    return true;
}

function fail(res, error) {
    const status = Number(error?.httpCode) || 500;
    if (status >= 500) console.error("COLLECTOR MODULE ERROR:", error);
    return res.status(status).json({
        success: false,
        message: status >= 500 ? "An unexpected server error occurred." : error.message
    });
}

const read = (fn) => async (req, res) => {
    try { res.json({ success: true, ...(await fn(req)) }); } catch (e) { fail(res, e); }
};

const write = (fn, message) => async (req, res) => {
    if (!csrfOk(req, res)) return;
    try { res.json({ success: true, message, ...(await fn(req)) }); } catch (e) { fail(res, e); }
};

module.exports = {
    getList: read((req) => service.list(req, req.query || {})),
    getProfile: read((req) => service.profile(req, req.params.id)),
    getEditData: read((req) => service.editData(req, req.params.id)),
    getActivity: read((req) => service.activity(req, req.params.id)),
    update: write((req) => service.update(req, req.params.id, req.body || {}),
        "কালেক্টরের তথ্য সফলভাবে আপডেট হয়েছে!"),
    remove: write(async (req) => { await service.remove(req, req.params.id); return {}; },
        "কালেক্টর সফলভাবে ডিলিট হয়েছে!")
};
