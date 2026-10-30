"use strict";

const customerService =
    require("../../services/customers/customer.service");


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
            req.query.limit ??
            100;

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

                status,
                ...req.query

            });


        return res.json({

            success: true,

            data:
                result.customers,

            customers:
                result.customers,

            pagination:
                result.pagination

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
| SUMMARY
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

                status,
                ...req.query

            });


        return res.json({

            success: true,

            data: result,

            summary: result

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
| SINGLE CUSTOMER
|--------------------------------------------------------------------------
*/

async function view(req, res) {

    try {

        const id =
            Number(
                req.params.id
            );


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

            data: customer,

            customer

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


module.exports = {

    list,
    summary,
    view

};


