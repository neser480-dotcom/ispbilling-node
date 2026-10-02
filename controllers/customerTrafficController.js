"use strict";

const path = require("path");

const {
    getCustomerTraffic
} = require("../services/customerTrafficService");


/*
|--------------------------------------------------------------------------
| CUSTOMER TRAFFIC CONTROLLER
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| PAGE
|--------------------------------------------------------------------------
|
| GET:
| /monitoring/customer-traffic
|
| GET:
| /monitoring/customer-traffic?id=1
|
*/

async function index(req, res) {

    if (
        !req.session ||
        !req.session.user_id
    ) {
        return res.redirect("/");
    }

    return res.sendFile(
        path.join(
            __dirname,
            "..",
            "views",
            "monitoring",
            "customer-traffic.html"
        )
    );
}


/*
|--------------------------------------------------------------------------
| LIVE API
|--------------------------------------------------------------------------
|
| GET:
| /monitoring/customer-traffic/live?id=1
|
|--------------------------------------------------------------------------
*/

async function live(req, res) {

    try {

        const companyId =
            Number(
                req.session?.company_id || 0
            );


        const role =
            String(
                req.session?.role || ""
            );


        const routerId =
            Number(
                req.query.id || 0
            );


        const data =
            await getCustomerTraffic({
                routerId,
                companyId,
                role
            });


        return res.json(data);

    } catch (error) {

        console.error(
            "Customer Traffic API Error:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Customer Traffic API failed.",

            error:
                process.env.NODE_ENV === "production"
                    ? undefined
                    : error.message

        });

    }

}


module.exports = {

    index,

    live

};