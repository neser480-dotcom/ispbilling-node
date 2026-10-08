"use strict";

const service = require("../services/customer-bulk.service");

function known(error) {
    return error instanceof service.BulkError;
}

function action(name) {
    return Object.prototype.hasOwnProperty.call(service.actions, name)
        ? service.actions[name]
        : null;
}

async function context(req) {

    const requested = service.getIds(req);

    return {
        user: req.session,
        body: req.body || {},
        ids: await service.getAllowedIds(req.session, requested)
    };
}

/* GET /api/customers/bulk/:name?ids=1,2,3  -> popup HTML */
async function form(req, res) {

    const handler = action(req.params.name);

    if (!handler) {
        return res.status(404).type("html")
            .send('<div class="alert alert-danger">Unknown bulk action.</div>');
    }

    try {
        return res.type("html").send(await handler.fragment(await context(req)));
    } catch (error) {
        if (!known(error)) console.error("BULK FORM ERROR:", error);
        return res.status(known(error) ? error.httpCode : 500).type("html").send(
            `<div class="alert alert-danger m-3">${service.esc(
                known(error) ? error.message : "Failed to load form."
            )}</div>`
        );
    }
}

/* POST /api/customers/bulk/:name -> JSON */
async function apply(req, res) {

    const handler = action(req.params.name);

    if (!handler) {
        return res.status(404).json({ success: false, message: "Unknown bulk action." });
    }

    try {
        const message = await handler.apply(await context(req));
        return res.json({ success: true, message });
    } catch (error) {
        if (!known(error)) console.error("BULK ACTION ERROR:", error);
        return res.status(known(error) ? error.httpCode : 500).json({
            success: false,
            message: known(error) ? error.message : "Bulk action failed."
        });
    }
}

module.exports = { form, apply };
