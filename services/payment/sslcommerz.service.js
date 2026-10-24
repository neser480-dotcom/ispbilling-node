"use strict";


function getBaseUrl(
    environment
) {

    if (
        String(environment).toLowerCase() ===
        "live"
    ) {

        return {
            gateway:
                "https://securepay.sslcommerz.com",
            initiate:
                "https://securepay.sslcommerz.com/gwprocess/v4/api.php",
            validate:
                "https://securepay.sslcommerz.com/validator/api/validationserverAPI.php"
        };

    }


    return {
        gateway:
            "https://sandbox.sslcommerz.com",
        initiate:
            "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
        validate:
            "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php"
    };

}


async function initiate({
    credentials,
    environment,
    transaction,
    customer,
    urls
}) {

    if (
        !credentials ||
        !credentials.store_id ||
        !credentials.store_password
    ) {

        throw new Error(
            "SSLCommerz credentials are not configured."
        );

    }


    const api =
        getBaseUrl(
            environment
        );


    const body =
        new URLSearchParams();


    body.set(
        "store_id",
        credentials.store_id
    );

    body.set(
        "store_passwd",
        credentials.store_password
    );

    body.set(
        "total_amount",
        Number(
            transaction.amount
        ).toFixed(2)
    );

    body.set(
        "currency",
        transaction.currency || "BDT"
    );

    body.set(
        "tran_id",
        transaction.transactionId
    );

    body.set(
        "success_url",
        urls.success
    );

    body.set(
        "fail_url",
        urls.fail
    );

    body.set(
        "cancel_url",
        urls.cancel
    );

    body.set(
        "ipn_url",
        urls.ipn
    );


    body.set(
        "cus_name",
        customer?.name ||
        "Customer"
    );

    body.set(
        "cus_email",
        customer?.email ||
        "customer@example.com"
    );

    body.set(
        "cus_add1",
        customer?.address ||
        "Bangladesh"
    );

    body.set(
        "cus_city",
        customer?.city ||
        "Dhaka"
    );

    body.set(
        "cus_country",
        "Bangladesh"
    );


    body.set(
        "product_name",
        transaction.purpose
    );

    body.set(
        "product_category",
        "ISP Billing"
    );

    body.set(
        "shipping_method",
        "NO"
    );


    const response =
        await fetch(
            api.initiate,
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },
                body
            }
        );


    if (!response.ok) {

        throw new Error(
            `SSLCommerz HTTP ${response.status}`
        );

    }


    const result =
        await response.json();


    if (
        !result.GatewayPageURL
    ) {

        throw new Error(
            result.failedreason ||
            result.error ||
            "SSLCommerz payment session creation failed."
        );

    }


    return {
        gatewayPageUrl:
            result.GatewayPageURL,

        sessionKey:
            result.sessionkey || null,

        raw:
            result
    };

}


async function validate({
    credentials,
    environment,
    valId
}) {

    if (
        !credentials ||
        !credentials.store_id ||
        !credentials.store_password
    ) {

        throw new Error(
            "SSLCommerz credentials are not configured."
        );

    }


    if (!valId) {

        throw new Error(
            "Validation ID is required."
        );

    }


    const api =
        getBaseUrl(
            environment
        );


    const url =
        new URL(
            api.validate
        );


    url.searchParams.set(
        "val_id",
        valId
    );

    url.searchParams.set(
        "store_id",
        credentials.store_id
    );

    url.searchParams.set(
        "store_passwd",
        credentials.store_password
    );

    url.searchParams.set(
        "v",
        "1"
    );

    url.searchParams.set(
        "format",
        "json"
    );


    const response =
        await fetch(
            url
        );


    if (!response.ok) {

        throw new Error(
            `SSLCommerz validation HTTP ${response.status}`
        );

    }


    return response.json();

}


module.exports = {
    initiate,
    validate
};