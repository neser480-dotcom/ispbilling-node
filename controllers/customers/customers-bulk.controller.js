
"use strict";

const service = require("../../services/customers/customer-bulk.service");
const { hasPermission } = require("../../middleware/permission");

/*
|--------------------------------------------------------------------------
| BULK ACTION PERMISSIONS
|--------------------------------------------------------------------------
|
| Existing permission system is reused.
| Unknown or unmapped actions are denied by default.
|
*/

const ACTION_PERMISSIONS = Object.freeze({
        balance: "update_customer_balance",
    area: "bulk_area_edit",
    status: "bulk_status_edit",

    connection_on: "bulk_auto_disable_edit",
    connection_off: "bulk_auto_disable_edit",

    package: "bulk_package_edit",
    package_update: "bulk_package_edit",

    delete: "bulk_customer_delete",
    mikrotik: "bulk_customer_mikrotik_update",

    billing_cycle: "bulk_billing_cycle_edit",
    promise_date: "bulk_promise_date_edit",
    payment_status: "bulk_payment_status_edit",

    reseller: "bulk_transfer_to_reseller",
    message: "sms_board"
});

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function isKnownError(error) {
    return error instanceof service.BulkError;
}

function getAction(name) {
    if (
        !name ||
        !Object.prototype.hasOwnProperty.call(
            service.actions,
            name
        )
    ) {
        return null;
    }

    return service.actions[name];
}

function errorMessage(error, fallback) {
    return isKnownError(error)
        ? error.message
        : fallback;
}

function errorStatus(error) {
    return isKnownError(error)
        ? error.httpCode
        : 500;
}

/*
|--------------------------------------------------------------------------
| PERMISSION CHECK
|--------------------------------------------------------------------------
*/

async function checkActionPermission(req, name) {
    const permissionKey = ACTION_PERMISSIONS[name];

    /*
     * Fail closed for actions that have no verified mapping.
     */
    if (!permissionKey) {
        return {
            allowed: false,
            permission: null
        };
    }

    const allowed = await hasPermission(
        req,
        permissionKey
    );

    return {
        allowed: allowed === true,
        permission: permissionKey
    };
}

function permissionDenied(res, permissionKey, html = false) {
    const message =
        "You do not have permission to perform this bulk action.";

    if (html) {
        return res
            .status(403)
            .type("html")
            .send(`
                <div class="alert alert-danger m-3">
                    ${service.esc(message)}
                </div>
            `);
    }

    return res
        .status(403)
        .json({
            success: false,
            message,
            ...(permissionKey
                ? { permission: permissionKey }
                : {})
        });
}

/*
|--------------------------------------------------------------------------
| REQUEST CONTEXT
|--------------------------------------------------------------------------
*/

async function buildContext(req) {
    const ids = service.getIds(req);

    const allowedIds = await service.getAllowedIds(
        req.session,
        ids
    );

    return {
        user: req.session,
        body: req.body || {},
        ids: allowedIds
    };
}

/*
|--------------------------------------------------------------------------
| GET BULK FORM
|--------------------------------------------------------------------------
|
| GET /api/customers/bulk/:name?ids=1,2,3
|
*/

async function form(req, res) {
    const name = String(req.params.name || "")
        .trim()
        .toLowerCase();

    const handler = getAction(name);

    if (!handler) {
        return res
            .status(404)
            .type("html")
            .send(`
                <div class="alert alert-danger m-3">
                    Unknown bulk action.
                </div>
            `);
    }

    try {
        /*
         * Permission must be checked before rendering the form.
         */
        const permission = await checkActionPermission(
            req,
            name
        );

        if (!permission.allowed) {
            return permissionDenied(
                res,
                permission.permission,
                true
            );
        }

        const context = await buildContext(req);

        if (
            !Array.isArray(context.ids) ||
            context.ids.length === 0
        ) {
            return res
                .status(400)
                .type("html")
                .send(`
                    <div class="alert alert-warning m-3">
                        No customers selected.
                    </div>
                `);
        }

        const html = await handler.fragment(context);

        return res
            .type("html")
            .send(html);

    } catch (error) {
        if (!isKnownError(error)) {
            console.error("BULK FORM ERROR:", error);
        }

        return res
            .status(errorStatus(error))
            .type("html")
            .send(`
                <div class="alert alert-danger m-3">
                    ${service.esc(
                        errorMessage(
                            error,
                            "Failed to load bulk action form."
                        )
                    )}
                </div>
            `);
    }
}

/*
|--------------------------------------------------------------------------
| APPLY BULK ACTION
|--------------------------------------------------------------------------
|
| POST /api/customers/bulk/:name
|
*/

async function apply(req, res) {
    const name = String(req.params.name || "")
        .trim()
        .toLowerCase();

    const handler = getAction(name);

    if (!handler) {
        return res
            .status(404)
            .json({
                success: false,
                message: "Unknown bulk action."
            });
    }

    try {
        /*
         * Check permission before any action is executed.
         */
        const permission = await checkActionPermission(
            req,
            name
        );

        if (!permission.allowed) {
            return permissionDenied(
                res,
                permission.permission
            );
        }

        /*
         * Existing CSRF validation is preserved.
         */
        service.checkCsrf(
            req.session,
            req.body || {}
        );

        /*
         * Existing tenant/customer scope is preserved.
         */
        const context = await buildContext(req);

        if (
            !Array.isArray(context.ids) ||
            context.ids.length === 0
        ) {
            throw new service.BulkError(
                "No customers selected."
            );
        }

        const result = await handler.apply(context);

        if (
            result &&
            typeof result === "object"
        ) {
            return res.json({
                success: result.success !== false,
                message: String(
                    result.message ||
                    "Bulk action completed successfully."
                ),
                ...result
            });
        }

        return res.json({
            success: true,
            message: String(
                result ||
                "Bulk action completed successfully."
            )
        });

    } catch (error) {
        if (!isKnownError(error)) {
            console.error("BULK ACTION ERROR:", error);
        }

        return res
            .status(errorStatus(error))
            .json({
                success: false,
                message: errorMessage(
                    error,
                    "Bulk action failed."
                )
            });
    }
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
    form,
    apply
};
