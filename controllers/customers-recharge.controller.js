"use strict";

const service = require("../services/customer-recharge.service");

function fail(res, error, label) {

    const known = error instanceof service.RechargeError;

    if (!known) console.error(label, error);

    return res.status(known ? 400 : 500).json({
        success: false,
        message: known ? error.message : "Recharge failed."
    });
}

function parseIds(value) {

    const raw = Array.isArray(value) ? value.join(",") : String(value || "");

    return raw.split(",").map(s => Number(s.trim())).filter(n => n > 0);
}

async function rechargeForm(req, res) {
    try {
        const html = await service.rechargeFragment({
            user: req.session,
            id: Number(req.query.id)
        });
        return res.type("html").send(html);
    } catch (e) {
        return res.status(e instanceof service.RechargeError ? 404 : 500)
            .type("html")
            .send(`<div class="alert alert-danger">${
                e instanceof service.RechargeError ? e.message : "Failed to load recharge form."
            }</div>`);
    }
}

async function recharge(req, res) {
    try {
        const r = await service.rechargeCustomer({
            user: req.session,
            customerDbId: Number(req.body.customer_id),
            input: req.body
        });

        return res.json({
            success: true,
            message: r.mikrotik_ok
                ? "Recharge successful. Customer enabled and billing date updated."
                : "Recharge successful. Payment and billing date updated, but MikroTik restore needs attention.",
            ...r
        });
    } catch (e) {
        return fail(res, e, "RECHARGE ERROR:");
    }
}

async function bulkRechargeForm(req, res) {
    try {
        const html = await service.bulkRechargeFragment({
            user: req.session,
            ids: parseIds(req.query.ids)
        });
        return res.type("html").send(html);
    } catch (e) {
        return res.status(400).type("html")
            .send(`<div class="alert alert-danger">${
                e instanceof service.RechargeError ? e.message : "Failed to load form."
            }</div>`);
    }
}

async function bulkRecharge(req, res) {
    try {
        const r = await service.bulkRecharge({
            user: req.session,
            ids: parseIds(req.body.ids),
            input: req.body
        });

        let message = `Recharged ${r.success} of ${r.total} customer(s).`;
        if (r.failed) message += ` ${r.failed} failed.`;
        if (r.mikrotik_issues) message += ` ${r.mikrotik_issues} need MikroTik attention.`;

        return res.status(r.success ? 200 : 400).json({
            success: r.success > 0,
            message,
            ...r
        });
    } catch (e) {
        return fail(res, e, "BULK RECHARGE ERROR:");
    }
}

module.exports = { rechargeForm, recharge, bulkRechargeForm, bulkRecharge };
