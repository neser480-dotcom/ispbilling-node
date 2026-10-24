"use strict";

const service =
    require("../services/customer-bulk.service");

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

function errorMessage(
    error,
    fallback
) {

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
| REQUEST CONTEXT
|--------------------------------------------------------------------------
*/

async function buildContext(req) {

    const ids =
        service.getIds(req);

    const allowedIds =
        await service.getAllowedIds(
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
| GET
| /api/customers/bulk/:name?ids=1,2,3
|
*/

async function form(
    req,
    res
) {

    const name =
        String(
            req.params.name || ""
        )
        .trim()
        .toLowerCase();

    const handler =
        getAction(name);

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

        const context =
            await buildContext(req);

        /*
        |--------------------------------------------------------------------------
        | No selected customer
        |--------------------------------------------------------------------------
        */

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

        /*
        |--------------------------------------------------------------------------
        | Render popup
        |--------------------------------------------------------------------------
        */

        const html =
            await handler.fragment(
                context
            );

        return res
            .type("html")
            .send(html);

    } catch (error) {

        if (!isKnownError(error)) {

            console.error(
                "BULK FORM ERROR:",
                error
            );
        }

        return res
            .status(
                errorStatus(error)
            )
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
| POST
| /api/customers/bulk/:name
|
*/

async function apply(
    req,
    res
) {

    const name =
        String(
            req.params.name || ""
        )
        .trim()
        .toLowerCase();

    const handler =
        getAction(name);

    if (!handler) {

        return res
            .status(404)
            .json({
                success: false,
                message:
                    "Unknown bulk action."
            });
    }

    try {

        /*
        |--------------------------------------------------------------------------
        | CSRF
        |--------------------------------------------------------------------------
        */

        service.checkCsrf(
            req.session,
            req.body || {}
        );

        /*
        |--------------------------------------------------------------------------
        | Build context
        |--------------------------------------------------------------------------
        */

        const context =
            await buildContext(req);

        /*
        |--------------------------------------------------------------------------
        | Selected customer validation
        |--------------------------------------------------------------------------
        */

        if (
            !Array.isArray(context.ids) ||
            context.ids.length === 0
        ) {

            throw new service.BulkError(
                "No customers selected."
            );
        }

        /*
        |--------------------------------------------------------------------------
        | Execute action
        |--------------------------------------------------------------------------
        */

        const result =
            await handler.apply(
                context
            );

        /*
        |--------------------------------------------------------------------------
        | Normalize result
        |--------------------------------------------------------------------------
        |
        | Some actions return:
        |
        | {
        |     success: true,
        |     message: "..."
        | }
        |
        | Others may return a string.
        |
        */

        if (
            result &&
            typeof result === "object"
        ) {

            return res.json({
                success:
                    result.success !== false,

                message:
                    String(
                        result.message ||
                        "Bulk action completed successfully."
                    ),

                ...result
            });
        }

        return res.json({
            success: true,
            message:
                String(
                    result ||
                    "Bulk action completed successfully."
                )
        });

    } catch (error) {

        if (!isKnownError(error)) {

            console.error(
                "BULK ACTION ERROR:",
                error
            );
        }

        return res
            .status(
                errorStatus(error)
            )
            .json({
                success: false,
                message:
                    errorMessage(
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