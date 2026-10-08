"use strict";

const service = require("../services/customer-bulk-recharge.service");

/*
|--------------------------------------------------------------------------
| FORM
|--------------------------------------------------------------------------
*/

async function form(req, res) {
    try {
        return res.json({
            success: true,
            message: "Bulk Recharge ready."
        });
    } catch (error) {
        console.error("BULK RECHARGE FORM ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load Bulk Recharge."
        });
    }
}


/*
|--------------------------------------------------------------------------
| PROCESS
|--------------------------------------------------------------------------
*/

async function process(req, res) {
    try {
        const result = await service.process({
            user: req.session,
            body: req.body || {}
        });

        return res.status(result.httpCode || 200).json({
            success: result.success,
            message: result.message,

            total: result.total,
            ok: result.ok,
            failed: result.failed,

            total_amount: result.total_amount,

            billing_type: result.billing_type,
            medium: result.medium,
            months_paid: result.months_paid,

            results: result.results
        });

    } catch (error) {
        console.error("BULK RECHARGE ERROR:", error);

        return res.status(error.httpCode || 500).json({
            success: false,
            message: error.message || "Bulk recharge server error."
        });
    }
}


module.exports = {
    form,
    process
};