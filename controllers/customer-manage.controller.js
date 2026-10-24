"use strict";

const service = require("../services/customer-manage.service");

function status(error) {
    return error instanceof service.ManageError ? error.httpCode : 500;
}

function message(error, fallback) {
    return error instanceof service.ManageError ? error.message : fallback;
}

function fragmentError(res, error, label) {

    if (!(error instanceof service.ManageError)) console.error(label, error);

    return res.status(status(error)).type("html").send(
        `<div class="alert alert-danger">${service.escapeHtml(
            message(error, "Failed to load.")
        )}</div>`
    );
}

function jsonError(res, error, label, fallback) {

    if (!(error instanceof service.ManageError)) console.error(label, error);

    return res.status(status(error)).json({
        success: false,
        message: message(error, fallback)
    });
}

async function editForm(req, res) {
    try {
        return res.type("html").send(
            await service.editFragment({ user: req.session, id: req.query.id })
        );
    } catch (e) {
        return fragmentError(res, e, "CUSTOMER EDIT FORM ERROR:");
    }
}

async function update(req, res) {
    try {
        const msg = await service.updateCustomer({ user: req.session, body: req.body });
        return res.json({ success: true, message: msg });
    } catch (e) {
        return jsonError(res, e, "CUSTOMER UPDATE ERROR:", "Failed to update customer.");
    }
}

/*
| The list page deletes with a native hidden form POST (full navigation),
| so browser navigations are redirected back to the list; fetch/XHR callers
| get JSON.
*/
function isNavigation(req) {
    return (
        req.headers["x-requested-with"] !== "XMLHttpRequest" &&
        String(req.headers.accept || "").includes("text/html")
    );
}

async function remove(req, res) {
    try {
        const msg = await service.deleteCustomer({
            user: req.session,
            id: req.body.id ?? req.query.id
        });

        if (isNavigation(req)) {
            return res.redirect(`/customers?msg=${encodeURIComponent(msg)}`);
        }

        return res.json({ success: true, message: msg });

    } catch (e) {

        if (isNavigation(req)) {
            if (!(e instanceof service.ManageError)) console.error("CUSTOMER DELETE ERROR:", e);
            return res.redirect(
                `/customers?error=${encodeURIComponent(message(e, "Failed to delete customer."))}`
            );
        }

        return jsonError(res, e, "CUSTOMER DELETE ERROR:", "Failed to delete customer.");
    }
}

async function profile(req, res) {
    try {
        return res.type("html").send(
            await service.profileFragment({ user: req.session, id: req.query.id })
        );
    } catch (e) {
        return fragmentError(res, e, "CUSTOMER PROFILE ERROR:");
    }
}

module.exports = { editForm, update, remove, profile };
