"use strict";

const customerService =
    require("../services/customer.service");


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

/**
 * Read selected customer IDs from:
 *
 * GET:
 *   ?ids=1,2,3
 *
 * POST:
 *   ids=1,2,3
 *
 * POST:
 *   customer_ids[]=1
 *   customer_ids[]=2
 *
 * Keeps compatibility with the old PHP bulk system.
 */
function getBulkIds(req) {

    let values = [];

    const sources = [
        req.body?.customer_ids,
        req.body?.ids,
        req.body?.customer_id,
        req.body?.selected_ids,
        req.query?.ids
    ];

    for (const source of sources) {

        if (Array.isArray(source)) {
            values.push(...source);
            continue;
        }

        if (
            source !== undefined &&
            source !== null
        ) {
            values.push(source);
        }
    }

    const ids = [];

    for (const value of values) {

        if (
            value === undefined ||
            value === null
        ) {
            continue;
        }

        const parts =
            String(value).split(",");

        for (const part of parts) {

            const id =
                Number(
                    String(part).trim()
                );

            if (
                Number.isInteger(id) &&
                id > 0
            ) {
                ids.push(id);
            }
        }
    }

    return [
        ...new Set(ids)
    ];
}


/**
 * Return first available value.
 */
function firstValue(body, keys, fallback = null) {

    for (const key of keys) {

        if (
            body &&
            body[key] !== undefined &&
            body[key] !== null &&
            body[key] !== ""
        ) {
            return body[key];
        }
    }

    return fallback;
}


/*
|--------------------------------------------------------------------------
| CUSTOMER LIST
|--------------------------------------------------------------------------
*/

async function list(req, res) {

    try {

        const page =
            Number(req.query.page || 1);

        const limit =
            Number(req.query.limit || 100);

        const search =
            String(
                req.query.search || ""
            ).trim();

        const status =
            String(
                req.query.status || ""
            ).trim();


        /*
        |--------------------------------------------------------------------------
        | IMPORTANT
        |--------------------------------------------------------------------------
        | customer.service.js expects:
        |
        | getCustomers(user, options)
        |
        | NOT:
        |
        | getCustomers({ user, ... })
        |--------------------------------------------------------------------------
        */

        const result =
            await customerService.getCustomers(
                req.session,
                {
                    page,
                    limit,
                    search,
                    status
                }
            );


        return res.json({

            success: true,

            data:
                Array.isArray(result?.data)
                    ? result.data
                    : [],

            pagination:
                result?.pagination || {
                    page,
                    limit,
                    total: 0,
                    totalPages: 0
                }

        });

    } catch (error) {

        console.error(
            "CUSTOMER LIST ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Failed to load customers."

        });
    }
}


/*
|--------------------------------------------------------------------------
| CUSTOMER SUMMARY
|--------------------------------------------------------------------------
*/

async function summary(req, res) {

    try {

        const search =
            String(
                req.query.search || ""
            ).trim();

        const status =
            String(
                req.query.status || ""
            ).trim();


        const result =
            await customerService.getSummary(
                req.session,
                {
                    search,
                    status
                }
            );


        return res.json({

            success: true,

            data:
                result || {
                    total_customer: 0,
                    total: 0,
                    active: 0,
                    expired: 0,
                    inactive: 0,
                    suspended: 0,
                    disabled: 0,
                    pending: 0,
                    total_balance: 0,
                    balance: 0,
                    total_bill: 0
                }

        });

    } catch (error) {

        console.error(
            "CUSTOMER SUMMARY ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Failed to load customer summary."

        });
    }
}


/*
|--------------------------------------------------------------------------
| CUSTOMER VIEW / API
|--------------------------------------------------------------------------
*/

async function view(req, res) {

    try {

        const id =
            Number(req.params.id);

        if (
            !Number.isInteger(id) ||
            id <= 0
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid customer ID."

            });
        }


        /*
        |--------------------------------------------------------------------------
        | customer.service.js expects:
        |
        | getCustomerById(user, id)
        |--------------------------------------------------------------------------
        */

        const customer =
            await customerService.getCustomerById(
                req.session,
                id
            );


        if (!customer) {

            return res.status(404).json({

                success: false,

                message:
                    "Customer not found."

            });
        }


        return res.json({

            success: true,

            data: customer

        });

    } catch (error) {

        console.error(
            "CUSTOMER VIEW ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Failed to load customer."

        });
    }
}


/*
|--------------------------------------------------------------------------
| BULK MESSAGE
|--------------------------------------------------------------------------
*/

async function bulkMessageForm(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }


    return customerService.bulkMessageForm(
        req.session,
        ids
    );
}


async function bulkMessage(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).json({

            success: false,

            message:
                "No customers selected."

        });
    }


    const message =
        firstValue(
            req.body,
            [
                "message",
                "comments",
                "comment"
            ],
            ""
        );


    return customerService.bulkMessage(
        req.session,
        ids,
        message
    );
}


/*
|--------------------------------------------------------------------------
| BULK PROMISE DATE
|--------------------------------------------------------------------------
*/

async function bulkPromiseDateForm(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }


    return customerService.bulkPromiseDateForm(
        req.session,
        ids
    );
}


async function bulkPromiseDate(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).json({

            success: false,

            message:
                "No customers selected."

        });
    }


    const promiseDate =
        firstValue(
            req.body,
            [
                "promise_date",
                "promiseDate"
            ],
            null
        );


    return customerService.bulkPromiseDate(
        req.session,
        ids,
        promiseDate
    );
}


/*
|--------------------------------------------------------------------------
| BULK BILLING CYCLE
|--------------------------------------------------------------------------
*/

async function bulkBillingCycleForm(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }


    return customerService.bulkBillingCycleForm(
        req.session,
        ids
    );
}


async function bulkBillingCycle(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).json({

            success: false,

            message:
                "No customers selected."

        });
    }


    const billingCycle =
        firstValue(
            req.body,
            [
                "billing_cycle",
                "billingCycle"
            ],
            null
        );


    return customerService.bulkBillingCycle(
        req.session,
        ids,
        billingCycle
    );
}


/*
|--------------------------------------------------------------------------
| BULK PAYMENT STATUS
|--------------------------------------------------------------------------
*/

async function bulkPaymentStatusForm(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }


    return customerService.bulkPaymentStatusForm(
        req.session,
        ids
    );
}


async function bulkPaymentStatus(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).json({

            success: false,

            message:
                "No customers selected."

        });
    }


    const status =
        firstValue(
            req.body,
            [
                "status",
                "payment_status",
                "paymentStatus"
            ],
            null
        );


    return customerService.bulkPaymentStatus(
        req.session,
        ids,
        status
    );
}


/*
|--------------------------------------------------------------------------
| BULK AREA
|--------------------------------------------------------------------------
*/

async function bulkAreaForm(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }


    return customerService.bulkAreaForm(
        req.session,
        ids
    );
}


async function bulkArea(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).json({

            success: false,

            message:
                "No customers selected."

        });
    }


    const areaId =
        firstValue(
            req.body,
            [
                "area_id",
                "areaId"
            ],
            null
        );

    const subAreaId =
        firstValue(
            req.body,
            [
                "sub_area_id",
                "subAreaId"
            ],
            null
        );


    return customerService.bulkArea(
        req.session,
        ids,
        areaId,
        subAreaId
    );
}


/*
|--------------------------------------------------------------------------
| BULK STATUS
|--------------------------------------------------------------------------
*/

async function bulkStatusForm(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }


    return customerService.bulkStatusForm(
        req.session,
        ids
    );
}


async function bulkStatus(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).json({

            success: false,

            message:
                "No customers selected."

        });
    }


    const status =
        firstValue(
            req.body,
            [
                "status"
            ],
            null
        );


    return customerService.bulkStatus(
        req.session,
        ids,
        status
    );
}


/*
|--------------------------------------------------------------------------
| BULK BALANCE
|--------------------------------------------------------------------------
*/

async function bulkBalanceForm(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }


    return customerService.bulkBalanceForm(
        req.session,
        ids
    );
}


async function bulkBalance(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).json({

            success: false,

            message:
                "No customers selected."

        });
    }


    const balance =
        firstValue(
            req.body,
            [
                "balance"
            ],
            null
        );


    return customerService.bulkBalance(
        req.session,
        ids,
        balance
    );
}


/*
|--------------------------------------------------------------------------
| BULK RECHARGE
|--------------------------------------------------------------------------
*/

async function bulkRechargeForm(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }


    /*
    |--------------------------------------------------------------------------
    | bulkRechargeForm is not exported by the current service.
    |
    | Keep this handler compatible with the existing API structure.
    |--------------------------------------------------------------------------
    */

    return res.status(501).send(`
        <div class="alert alert-warning m-3">
            Bulk recharge form is not implemented yet.
        </div>
    `);
}


async function bulkRecharge(req, res) {

    const ids =
        getBulkIds(req);


    if (!ids.length) {

        return res.status(400).json({

            success: false,

            message:
                "No customers selected."

        });
    }


    /*
    |--------------------------------------------------------------------------
    | Current service signature:
    |
    | bulkRecharge(user, payload)
    |
    | Payload supports:
    | - items[]
    | - customer_ids / ids
    | - amount[id] / amount
    | - billing_type
    | - medium / payment_method
    | - comment
    |--------------------------------------------------------------------------
    */

    const payload = {

        ...req.body,

        ids,

        customer_ids:
            req.body?.customer_ids ||
            ids,

        billing_type:
            firstValue(
                req.body,
                [
                    "billing_type",
                    "billingType"
                ],
                undefined
            ),

        medium:
            firstValue(
                req.body,
                [
                    "medium",
                    "payment_method",
                    "paymentMethod"
                ],
                undefined
            ),

        payment_method:
            firstValue(
                req.body,
                [
                    "payment_method",
                    "paymentMethod",
                    "medium"
                ],
                undefined
            ),

        comment:
            firstValue(
                req.body,
                [
                    "comment",
                    "comments"
                ],
                undefined
            )

    };


    return customerService.bulkRecharge(
        req.session,
        payload
    );
}


/*
|--------------------------------------------------------------------------
| BULK RESELLER
|--------------------------------------------------------------------------
*/

async function bulkResellerForm(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }


    /*
    |--------------------------------------------------------------------------
    | Current customer.service.js does not export
    | bulkResellerForm.
    |--------------------------------------------------------------------------
    */

    return res.status(501).send(`
        <div class="alert alert-warning m-3">
            Bulk reseller form is not implemented yet.
        </div>
    `);
}


async function bulkReseller(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).json({

            success: false,

            message:
                "No customers selected."

        });
    }


    const resellerId =
        firstValue(
            req.body,
            [
                "reseller_id",
                "resellerId"
            ],
            null
        );

    const subAreaId =
        firstValue(
            req.body,
            [
                "sub_area_id",
                "subAreaId"
            ],
            null
        );


    return customerService.bulkReseller(
        req.session,
        ids,
        resellerId,
        subAreaId
    );
}


/*
|--------------------------------------------------------------------------
| BULK PACKAGE
|--------------------------------------------------------------------------
*/

async function bulkPackageForm(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }


    return customerService.bulkPackageForm(
        req.session,
        ids
    );
}


async function bulkPackage(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).json({

            success: false,

            message:
                "No customers selected."

        });
    }


    const routerId =
        firstValue(
            req.body,
            [
                "router_id",
                "routerId"
            ],
            null
        );

    const packageId =
        firstValue(
            req.body,
            [
                "package_id",
                "packageId"
            ],
            null
        );


    return customerService.bulkPackage(
        req.session,
        ids,
        routerId,
        packageId
    );
}


/*
|--------------------------------------------------------------------------
| BULK CONNECTION ON
|--------------------------------------------------------------------------
*/

async function bulkConnectionOnForm(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }


    /*
    |--------------------------------------------------------------------------
    | Current customer.service.js does not export
    | bulkConnectionOnForm.
    |--------------------------------------------------------------------------
    */

    return res.status(501).send(`
        <div class="alert alert-warning m-3">
            Bulk connection-on form is not implemented yet.
        </div>
    `);
}


async function bulkConnectionOn(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).json({

            success: false,

            message:
                "No customers selected."

        });
    }


    const autoStatus =
        firstValue(
            req.body,
            [
                "auto_connection",
                "auto_status",
                "autoStatus"
            ],
            1
        );

    const nextMonthStatus =
        firstValue(
            req.body,
            [
                "continue_next_month",
                "next_month_status",
                "nextMonthStatus"
            ],
            1
        );


    return customerService.bulkConnectionOn(
        req.session,
        ids,
        autoStatus,
        nextMonthStatus
    );
}


/*
|--------------------------------------------------------------------------
| BULK CONNECTION OFF
|--------------------------------------------------------------------------
*/

async function bulkConnectionOffForm(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }


    /*
    |--------------------------------------------------------------------------
    | Current customer.service.js does not export
    | bulkConnectionOffForm.
    |--------------------------------------------------------------------------
    */

    return res.status(501).send(`
        <div class="alert alert-warning m-3">
            Bulk connection-off form is not implemented yet.
        </div>
    `);
}


async function bulkConnectionOff(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).json({

            success: false,

            message:
                "No customers selected."

        });
    }


    return customerService.bulkConnectionOff(
        req.session,
        ids
    );
}


/*
|--------------------------------------------------------------------------
| BULK MIKROTIK
|--------------------------------------------------------------------------
*/

async function bulkMikrotikForm(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }


    return customerService.bulkMikrotikForm(
        req.session,
        ids
    );
}


async function bulkMikrotik(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).json({

            success: false,

            message:
                "No customers selected."

        });
    }


    const routerId =
        firstValue(
            req.body,
            [
                "router_id",
                "routerId"
            ],
            null
        );


    return customerService.bulkMikrotik(
        req.session,
        ids,
        routerId
    );
}


/*
|--------------------------------------------------------------------------
| BULK DELETE
|--------------------------------------------------------------------------
*/

async function bulkDeleteForm(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }


    return customerService.bulkDeleteForm(
        req.session,
        ids
    );
}


async function bulkDelete(req, res) {

    const ids =
        getBulkIds(req);

    if (!ids.length) {

        return res.status(400).json({

            success: false,

            message:
                "No customers selected."

        });
    }


    const deleteMikrotik =
        firstValue(
            req.body,
            [
                "delete_mikrotik",
                "deleteMikrotik"
            ],
            0
        );


    return customerService.bulkDelete(
        req.session,
        ids,
        deleteMikrotik
    );
}


/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {

    list,
    summary,
    view,

    bulkMessageForm,
    bulkMessage,

    bulkPromiseDateForm,
    bulkPromiseDate,

    bulkBillingCycleForm,
    bulkBillingCycle,

    bulkPaymentStatusForm,
    bulkPaymentStatus,

    bulkAreaForm,
    bulkArea,

    bulkStatusForm,
    bulkStatus,

    bulkBalanceForm,
    bulkBalance,

    bulkRechargeForm,
    bulkRecharge,

    bulkResellerForm,
    bulkReseller,

    bulkPackageForm,
    bulkPackage,

    bulkConnectionOnForm,
    bulkConnectionOn,

    bulkConnectionOffForm,
    bulkConnectionOff,

    bulkMikrotikForm,
    bulkMikrotik,

    bulkDeleteForm,
    bulkDelete
};