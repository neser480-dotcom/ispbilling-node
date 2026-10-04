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
            String(value)
                .split(",");

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


/*
|--------------------------------------------------------------------------
| CUSTOMER LIST
|--------------------------------------------------------------------------
*/

async function list(req, res) {

    try {

        const page =
            Number(
                req.query.page || 1
            );

        const limit =
            Number(
                req.query.limit || 100
            );

        const search =
            String(
                req.query.search || ""
            ).trim();

        const status =
            String(
                req.query.status || ""
            ).trim();

        const result =
            await customerService.getCustomers({
                user: req.session,
                page,
                limit,
                search,
                status
            });

        return res.json({
            success: true,
            data: result.customers,
            pagination: result.pagination
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
            await customerService.getSummary({
                user: req.session,
                search,
                status
            });

        return res.json({
            success: true,
            data: result
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

        const customer =
            await customerService.getCustomerById({
                user: req.session,
                id
            });

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
| BULK POPUP HELPERS
|--------------------------------------------------------------------------
|
| These handlers will return the popup HTML.
|
| The actual business logic stays in customer.service.js.
|
|--------------------------------------------------------------------------
*/

function bulkFormNotReady(res, action) {

    return res.status(501).send(`
        <div class="alert alert-warning m-3">
            Bulk ${action} service is not implemented yet.
        </div>
    `);
}


/*
|--------------------------------------------------------------------------
| BULK MESSAGE
|--------------------------------------------------------------------------
*/

async function bulkMessageForm(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }

    return customerService.renderBulkMessageForm({
        req,
        res,
        ids
    });
}


async function bulkMessage(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).json({
            success: false,
            message:
                "No customers selected."
        });
    }

    return customerService.bulkMessage({
        user: req.session,
        ids,
        body: req.body
    });
}


/*
|--------------------------------------------------------------------------
| BULK PROMISE DATE
|--------------------------------------------------------------------------
*/

async function bulkPromiseDateForm(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }

    return customerService.renderBulkPromiseDateForm({
        req,
        res,
        ids
    });
}


async function bulkPromiseDate(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).json({
            success: false,
            message:
                "No customers selected."
        });
    }

    return customerService.bulkPromiseDate({
        user: req.session,
        ids,
        body: req.body
    });
}


/*
|--------------------------------------------------------------------------
| BULK BILLING CYCLE
|--------------------------------------------------------------------------
*/

async function bulkBillingCycleForm(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }

    return customerService.renderBulkBillingCycleForm({
        req,
        res,
        ids
    });
}


async function bulkBillingCycle(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).json({
            success: false,
            message:
                "No customers selected."
        });
    }

    return customerService.bulkBillingCycle({
        user: req.session,
        ids,
        body: req.body
    });
}


/*
|--------------------------------------------------------------------------
| BULK PAYMENT STATUS
|--------------------------------------------------------------------------
*/

async function bulkPaymentStatusForm(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }

    return customerService.renderBulkPaymentStatusForm({
        req,
        res,
        ids
    });
}


async function bulkPaymentStatus(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).json({
            success: false,
            message:
                "No customers selected."
        });
    }

    return customerService.bulkPaymentStatus({
        user: req.session,
        ids,
        body: req.body
    });
}


/*
|--------------------------------------------------------------------------
| BULK AREA
|--------------------------------------------------------------------------
*/

async function bulkAreaForm(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }

    return customerService.renderBulkAreaForm({
        user: req.session,
        req,
        res,
        ids
    });
}


async function bulkArea(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).json({
            success: false,
            message:
                "No customers selected."
        });
    }

    return customerService.bulkArea({
        user: req.session,
        ids,
        body: req.body
    });
}


/*
|--------------------------------------------------------------------------
| BULK STATUS
|--------------------------------------------------------------------------
*/

async function bulkStatusForm(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }

    return customerService.renderBulkStatusForm({
        user: req.session,
        req,
        res,
        ids
    });
}


async function bulkStatus(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).json({
            success: false,
            message:
                "No customers selected."
        });
    }

    return customerService.bulkStatus({
        user: req.session,
        ids,
        body: req.body
    });
}


/*
|--------------------------------------------------------------------------
| BULK BALANCE
|--------------------------------------------------------------------------
*/

async function bulkBalanceForm(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }

    return customerService.renderBulkBalanceForm({
        req,
        res,
        ids
    });
}


async function bulkBalance(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).json({
            success: false,
            message:
                "No customers selected."
        });
    }

    return customerService.bulkBalance({
        user: req.session,
        ids,
        body: req.body
    });
}


/*
|--------------------------------------------------------------------------
| BULK RECHARGE
|--------------------------------------------------------------------------
*/

async function bulkRechargeForm(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }

    return customerService.renderBulkRechargeForm({
        req,
        res,
        ids
    });
}


async function bulkRecharge(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).json({
            success: false,
            message:
                "No customers selected."
        });
    }

    return customerService.bulkRecharge({
        user: req.session,
        ids,
        body: req.body
    });
}


/*
|--------------------------------------------------------------------------
| BULK RESELLER
|--------------------------------------------------------------------------
*/

async function bulkResellerForm(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }

    return customerService.renderBulkResellerForm({
        user: req.session,
        req,
        res,
        ids
    });
}


async function bulkReseller(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).json({
            success: false,
            message:
                "No customers selected."
        });
    }

    return customerService.bulkReseller({
        user: req.session,
        ids,
        body: req.body
    });
}


/*
|--------------------------------------------------------------------------
| BULK PACKAGE
|--------------------------------------------------------------------------
*/

async function bulkPackageForm(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }

    return customerService.renderBulkPackageForm({
        user: req.session,
        req,
        res,
        ids
    });
}


async function bulkPackage(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).json({
            success: false,
            message:
                "No customers selected."
        });
    }

    return customerService.bulkPackage({
        user: req.session,
        ids,
        body: req.body
    });
}


/*
|--------------------------------------------------------------------------
| BULK CONNECTION ON
|--------------------------------------------------------------------------
*/

async function bulkConnectionOnForm(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }

    return customerService.renderBulkConnectionOnForm({
        req,
        res,
        ids
    });
}


async function bulkConnectionOn(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).json({
            success: false,
            message:
                "No customers selected."
        });
    }

    return customerService.bulkConnectionOn({
        user: req.session,
        ids,
        body: req.body
    });
}


/*
|--------------------------------------------------------------------------
| BULK CONNECTION OFF
|--------------------------------------------------------------------------
*/

async function bulkConnectionOffForm(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }

    return customerService.renderBulkConnectionOffForm({
        req,
        res,
        ids
    });
}


async function bulkConnectionOff(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).json({
            success: false,
            message:
                "No customers selected."
        });
    }

    return customerService.bulkConnectionOff({
        user: req.session,
        ids,
        body: req.body
    });
}


/*
|--------------------------------------------------------------------------
| BULK MIKROTIK
|--------------------------------------------------------------------------
*/

async function bulkMikrotikForm(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }

    return customerService.renderBulkMikrotikForm({
        user: req.session,
        req,
        res,
        ids
    });
}


async function bulkMikrotik(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).json({
            success: false,
            message:
                "No customers selected."
        });
    }

    return customerService.bulkMikrotik({
        user: req.session,
        ids,
        body: req.body
    });
}


/*
|--------------------------------------------------------------------------
| BULK DELETE
|--------------------------------------------------------------------------
*/

async function bulkDeleteForm(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).send(`
            <div class="alert alert-danger m-3">
                No customers selected.
            </div>
        `);
    }

    return customerService.renderBulkDeleteForm({
        user: req.session,
        req,
        res,
        ids
    });
}


async function bulkDelete(req, res) {

    const ids = getBulkIds(req);

    if (!ids.length) {
        return res.status(400).json({
            success: false,
            message:
                "No customers selected."
        });
    }

    return customerService.bulkDelete({
        user: req.session,
        ids,
        body: req.body
    });
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