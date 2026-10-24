"use strict";


function getBaseUrl(
    environment
) {

    if (
        String(environment).toLowerCase() ===
        "live"
    ) {

        return "https://engine.shurjopayment.com/api";

    }

    return "https://sandbox.shurjopayment.com/api";

}


async function getToken({
    credentials,
    environment
}) {

    if (
        !credentials ||
        !credentials.username ||
        !credentials.password
    ) {

        throw new Error(
            "ShurjoPay credentials are not configured."
        );

    }


    const base =
        getBaseUrl(
            environment
        );


    const response =
        await fetch(
            `${base}/get_token`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",
                    "Accept":
                        "application/json"
                },

                body: JSON.stringify({
                    username:
                        credentials.username,

                    password:
                        credentials.password
                })
            }
        );


    if (!response.ok) {

        throw new Error(
            `ShurjoPay authentication HTTP ${response.status}`
        );

    }


    const result =
        await response.json();


    if (
        !result.token
    ) {

        throw new Error(
            result.message ||
            "Unable to obtain ShurjoPay token."
        );

    }


    return result;

}


async function initiate({
    credentials,
    environment,
    transaction,
    customer,
    urls
}) {

    const auth =
        await getToken({
            credentials,
            environment
        });


    const base =
        getBaseUrl(
            environment
        );


    const response =
        await fetch(
            `${base}/secret-pay`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    "Accept":
                        "application/json",

                    Authorization:
                        `Bearer ${auth.token}`
                },

                body: JSON.stringify({

                    prefix:
                        credentials.prefix,

                    token:
                        auth.token,

                    return_url:
                        urls.success,

                    cancel_url:
                        urls.cancel,

                    order_id:
                        transaction.transactionId,

                    currency:
                        transaction.currency || "BDT",

                    amount:
                        Number(
                            transaction.amount
                        ).toFixed(2),

                    discount_amount:
                        0,

                    disc_percent:
                        0,

                    customer_name:
                        customer?.name ||
                        "Customer",

                    customer_address:
                        customer?.address ||
                        "Bangladesh",

                    customer_city:
                        customer?.city ||
                        "Dhaka",

                    customer_phone:
                        customer?.phone ||
                        "",

                    customer_email:
                        customer?.email ||
                        "",

                    customer_state:
                        customer?.city ||
                        "Dhaka",

                    customer_postcode:
                        customer?.postcode ||
                        "",

                    customer_country:
                        "Bangladesh",

                    product_name:
                        transaction.purpose,

                    shipping_address:
                        customer?.address ||
                        "Bangladesh",

                    shipping_city:
                        customer?.city ||
                        "Dhaka",

                    shipping_country:
                        "Bangladesh",

                    shipping_phone:
                        customer?.phone ||
                        "",

                    value1:
                        transaction.transactionId

                })
            }
        );


    if (!response.ok) {

        throw new Error(
            `ShurjoPay initiation HTTP ${response.status}`
        );

    }


    const result =
        await response.json();


    return {
        raw:
            result,

        token:
            auth.token,

        spCode:
            result.sp_code,

        spMessage:
            result.sp_message,

        paymentUrl:
            result.checkout_url ||
            result.payment_url ||
            result.url ||
            null
    };

}


async function verify({
    credentials,
    environment,
    transactionId
}) {

    const auth =
        await getToken({
            credentials,
            environment
        });


    const base =
        getBaseUrl(
            environment
        );


    const response =
        await fetch(
            `${base}/verification`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    "Accept":
                        "application/json",

                    Authorization:
                        `Bearer ${auth.token}`
                },

                body: JSON.stringify({
                    order_id:
                        transactionId
                })
            }
        );


    if (!response.ok) {

        throw new Error(
            `ShurjoPay verification HTTP ${response.status}`
        );

    }


    return response.json();

}


module.exports = {
    getToken,
    initiate,
    verify
};