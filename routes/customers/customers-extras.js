"use strict";

const express = require("express");
const router = express.Router();

const svc = require("../../services/customers/customer-extras.service");
const { requireAuth } = require("../../middleware/auth");
const { requirePermission } = require("../../middleware/permission");

router.use(requireAuth);

const perm = requirePermission("customer_list");

function wrap(fn, html) {
    return async (req, res) => {
        try {
            const out = await fn(req);
            return html ? res.type("html").send(out) : res.json(out);
        } catch (e) {
            const known = e instanceof svc.BulkError;
            if (!known) console.error("CUSTOMER EXTRAS ERROR:", e);
            const code = known ? (e.httpCode || 400) : 500;
            const msg = known ? e.message : "Something went wrong.";
            return html
                ? res.status(code).type("html").send(`<div class="alert alert-danger m-3">${msg}</div>`)
                : res.status(code).json({ success: false, message: msg });
        }
    };
}

router.get("/note", perm, wrap(r => svc.noteFragment(r.session, r.query.id), true));
router.post("/note", perm, wrap(r => svc.saveNote(r.session, r)));
router.get("/activity", perm, wrap(r => svc.activityFragment(r.session, r.query.id), true));
router.get("/reset-password", perm, wrap(r => svc.resetFragmentFor(r.session, r.query.id), true));
router.post("/reset-password", perm, wrap(r => svc.resetPassword(r.session, r)));
router.get("/data-usage", perm, wrap(r => svc.usageFragment(r.session, r.query.id, r.query.month), true));
router.get("/ticket", perm, wrap(r => svc.ticketFragment(r.session, r.query.id), true));
router.post("/ticket", perm, wrap(r => svc.saveTicket(r.session, r)));

module.exports = router;
