"use strict";

const service =
    require("../services/customer-bulk-recharge.service");


/*
|--------------------------------------------------------------------------
| FORM
|--------------------------------------------------------------------------
*/

async function form(req, res) {

    return res.json({

        success: true,

        message:
            "Bulk Recharge ready."

    });

}


/*
|--------------------------------------------------------------------------
| PROCESS
|--------------------------------------------------------------------------
*/

async function process(req, res) {

    /*
    |--------------------------------------------------------------------------
    | DEBUG REQUEST
    |--------------------------------------------------------------------------
    */

    console.log(
        "\n========== BULK RECHARGE REQUEST =========="
    );

    console.log(
        "CONTENT-TYPE:",
        req.headers["content-type"]
    );

    console.log(
        "BODY:",
        JSON.stringify(
            req.body,
            null,
            2
        )
    );

    console.log(
        "SESSION USER:",
        JSON.stringify(
            {
                user_id:
                    req.session?.user_id,

                company_id:
                    req.session?.company_id,

                role:
                    req.session?.role
            },
            null,
            2
        )
    );

    console.log(
        "===========================================\n"
    );


    /*
    |--------------------------------------------------------------------------
    | PROCESS
    |--------------------------------------------------------------------------
    */

    try {

        const result =
            await service.processBulkRecharge({

                user:
                    req.session,

                body:
                    req.body || {}

            });


        console.log(
            "BULK RECHARGE RESULT:",
            JSON.stringify(
                result,
                null,
                2
            )
        );


        return res.status(
            result.httpCode || 200
        ).json({

            success:
                result.success,

            message:
                result.message,

            total:
                result.total,

            ok:
                result.ok,

            failed:
                result.failed,

            total_amount:
                result.total_amount,

            billing_type:
                result.billing_type,

            medium:
                result.medium,

            months_paid:
                result.months_paid,

            results:
                result.results

        });

    } catch (error) {

        console.error(
            "BULK RECHARGE ERROR:",
            error
        );


        return res.status(
            error.httpCode || 500
        ).json({

            success:
                false,

            message:
                error.message ||
                "Bulk recharge server error."

        });

    }

}


/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports = {

    form,

    process

};
