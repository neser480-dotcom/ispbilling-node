"use strict";


const sslcommerz =
    require("./sslcommerz.service");


const shurjopay =
    require("./shurjopay.service");


function getProvider(
    gateway
) {

    switch (
        String(gateway || "")
            .trim()
            .toLowerCase()
    ) {

        case "sslcommerz":
            return sslcommerz;


        case "shurjopay":
            return shurjopay;


        case "bkash":
            return require("./bkash.service");


        case "nagad":
            return require("./nagad.service");


        case "rocket":
            return require("./rocket.service");


        case "bank":
            return require("./bank.service");


        default:

            throw new Error(
                "Unsupported payment gateway."
            );

    }

}


module.exports = {
    getProvider
};