"use strict";

const customerService =
    require("../services/customer.service");


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
            "Customer list error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to load customers.",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : undefined
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
            "Customer summary error:",
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
| SINGLE CUSTOMER
|--------------------------------------------------------------------------
*/

async function view(req, res) {
    try {
        const id =
            Number(
                req.params.id
            );

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
            "Customer view error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to load customer."
        });
    }
}


module.exports = {
    list,
    summary,
    view
};