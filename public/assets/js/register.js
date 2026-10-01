"use strict";


/* =========================================================
   PASSWORD SHOW / HIDE
========================================================= */

function showRegPassword() {

    const pass =
        document.getElementById(
            "reg_password"
        );

    if (!pass) {
        return;
    }

    if (pass.type === "password") {

        pass.type = "text";

    } else {

        pass.type = "password";
    }
}


/* =========================================================
   REGISTER
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        const form =
            document.getElementById(
                "registerForm"
            );

        if (!form) {
            return;
        }


        const csrfInput =
            document.getElementById(
                "csrf_token"
            );

        const messageBox =
            document.getElementById(
                "registerMessage"
            );

        const packageSelect =
            document.getElementById(
                "package_id"
            );

        const packageInfo =
            document.getElementById(
                "packageInfo"
            );

        const discountArea =
            document.getElementById(
                "discountArea"
            );

        const discountType =
            document.getElementById(
                "discount_type"
            );

        const discountValue =
            document.getElementById(
                "discount_value"
            );

        const discountSummary =
            document.getElementById(
                "discountSummary"
            );

        const registerButton =
            document.getElementById(
                "registerButton"
            );


        let packages = [];

        let canApplyDiscount = false;


        /* =================================================
           MESSAGE
        ================================================= */

        function showMessage(
            message,
            success = false
        ) {

            if (!messageBox) {
                return;
            }

            messageBox.textContent =
                message || "";

            messageBox.style.color =
                success
                    ? "#86efac"
                    : "#fca5a5";
        }


        /* =================================================
           MONEY
        ================================================= */

        function money(value) {

            const number =
                Number(value || 0);

            return number.toLocaleString(
                "en-US",
                {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }
            );
        }


        /* =================================================
           CSRF
        ================================================= */

        async function loadRegistrationData() {

            try {

                const response =
                    await fetch(
                        "/api/register/data",
                        {
                            method: "GET",
                            credentials: "same-origin"
                        }
                    );


                const data =
                    await response.json();


                if (!data.success) {

                    showMessage(
                        data.message ||
                        "Unable to load registration data."
                    );

                    return;
                }


                if (csrfInput) {

                    csrfInput.value =
                        data.csrf_token || "";
                }


                canApplyDiscount =
                    data.can_apply_discount === true;


                if (
                    discountArea
                ) {

                    discountArea.style.display =
                        canApplyDiscount
                            ? "flex"
                            : "none";
                }


                packages =
                    Array.isArray(data.packages)
                        ? data.packages
                        : [];


                loadPackages();


                if (
                    data.company_message
                ) {

                    showMessage(
                        data.company_message
                    );
                }


            } catch (error) {

                console.error(
                    "REGISTER DATA ERROR:",
                    error
                );

                showMessage(
                    "Unable to load registration data."
                );
            }
        }


        /* =================================================
           LOAD PACKAGES
        ================================================= */

        function loadPackages() {

            if (!packageSelect) {
                return;
            }


            packageSelect.innerHTML =
                "";


            const defaultOption =
                document.createElement(
                    "option"
                );

            defaultOption.value =
                "";

            defaultOption.textContent =
                "প্যাকেজ নির্বাচন করুন";


            packageSelect.appendChild(
                defaultOption
            );


            packages.forEach(
                function (pkg) {

                    const option =
                        document.createElement(
                            "option"
                        );


                    const signup =
                        Number(
                            pkg.signup_fee || 0
                        );

                    const monthly =
                        Number(
                            pkg.monthly_fee || 0
                        );

                    const customers =
                        Number(
                            pkg.customer_limit || 0
                        );


                    option.value =
                        pkg.id;


                    option.dataset.customers =
                        customers;

                    option.dataset.signup =
                        signup;

                    option.dataset.monthly =
                        monthly;


                    option.textContent =
                        `${pkg.package_code} | ` +
                        `${customers} Customers | ` +
                        `Sign up ৳${money(signup)} | ` +
                        `Month ৳${money(monthly)}`;


                    packageSelect.appendChild(
                        option
                    );
                }
            );


            updatePackage();
        }


        /* =================================================
           UPDATE PACKAGE
        ================================================= */

        function updatePackage() {

            if (
                !packageSelect ||
                !packageInfo
            ) {
                return;
            }


            const option =
                packageSelect.options[
                    packageSelect.selectedIndex
                ];


            if (
                !option ||
                !option.value
            ) {

                packageInfo.innerHTML =
                    "প্যাকেজ নির্বাচন করলে এখানে package details দেখাবে.";


                if (discountSummary) {

                    discountSummary.innerHTML =
                        "Payable amount দেখানো হবে.";
                }

                return;
            }


            const customers =
                Number(
                    option.dataset.customers || 0
                );

            const signup =
                Number(
                    option.dataset.signup || 0
                );

            const monthly =
                Number(
                    option.dataset.monthly || 0
                );


            calculateDiscount(
                customers,
                signup,
                monthly
            );
        }


        /* =================================================
           DISCOUNT
        ================================================= */

        function calculateDiscount(
            customers,
            signup,
            monthly
        ) {

            let discount = 0;

            let discountVal =
                Number(
                    discountValue
                        ? discountValue.value
                        : 0
                );


            if (!Number.isFinite(discountVal)) {
                discountVal = 0;
            }


            if (discountVal < 0) {
                discountVal = 0;
            }


            if (
                canApplyDiscount &&
                discountType &&
                discountType.value === "percent"
            ) {

                if (discountVal > 100) {

                    discountVal = 100;

                    if (discountValue) {

                        discountValue.value =
                            "100";
                    }
                }


                discount =
                    signup *
                    (
                        discountVal / 100
                    );

            } else if (
                canApplyDiscount
            ) {

                if (discountVal > signup) {

                    discountVal =
                        signup;

                    if (discountValue) {

                        discountValue.value =
                            signup.toFixed(2);
                    }
                }


                discount =
                    discountVal;

            } else {

                discount =
                    0;
            }


            discount =
                Math.min(
                    signup,
                    Math.max(
                        0,
                        discount
                    )
                );


            const payable =
                Math.max(
                    0,
                    signup - discount
                );


            let signupHTML = "";


            if (discount > 0) {

                signupHTML =
                    '<span class="old-price">৳' +
                    money(signup) +
                    '</span> ' +

                    '<span class="new-price">৳' +
                    money(payable) +
                    '</span>';

            } else {

                signupHTML =
                    '<span class="new-price">৳' +
                    money(signup) +
                    '</span>';
            }


            packageInfo.innerHTML =
                "<strong>Customers: " +
                customers +
                "</strong> | " +

                "Sign up fee: " +
                signupHTML +
                " | " +

                '<span class="month-price">' +
                "Month fee: ৳" +
                money(monthly) +
                "</span>";


            if (discountSummary) {

                if (canApplyDiscount) {

                    discountSummary.style.display =
                        "block";


                    if (discount > 0) {

                        let discountText = "";


                        if (
                            discountType &&
                            discountType.value === "percent"
                        ) {

                            discountText =
                                discountVal +
                                "%";

                        } else {

                            discountText =
                                "৳" +
                                money(discountVal);
                        }


                        discountSummary.innerHTML =
                            "Discount: " +

                            '<span class="discount-value">' +
                            discountText +
                            " (৳" +
                            money(discount) +
                            ")</span>" +

                            " | Payable: " +

                            '<span class="payable-value">৳' +
                            money(payable) +
                            "</span>";

                    } else {

                        discountSummary.innerHTML =
                            "Discount: ৳0.00 | " +

                            "Payable: " +

                            '<span class="payable-value">৳' +
                            money(signup) +
                            "</span>";
                    }

                } else {

                    discountSummary.style.display =
                        "none";
                }
            }
        }


        /* =================================================
           EVENTS
        ================================================= */

        if (packageSelect) {

            packageSelect.addEventListener(
                "change",
                updatePackage
            );
        }


        if (discountType) {

            discountType.addEventListener(
                "change",
                updatePackage
            );
        }


        if (discountValue) {

            discountValue.addEventListener(
                "input",
                updatePackage
            );
        }


        /* =================================================
           SUBMIT
        ================================================= */

        form.addEventListener(
            "submit",
            async function (event) {

                event.preventDefault();


                if (!csrfInput.value) {

                    showMessage(
                        "Invalid request. Please refresh the page and try again."
                    );

                    await loadRegistrationData();

                    return;
                }


                if (registerButton) {

                    registerButton.disabled =
                        true;

                    registerButton.textContent =
                        "রেজিস্টার হচ্ছে...";
                }


                showMessage("");


                try {

                    const formData =
                        new FormData(form);


                    formData.set(
                        "register",
                        "1"
                    );


                    const response =
                        await fetch(
                            "/api/register",
                            {
                                method: "POST",

                                body:
                                    new URLSearchParams(
                                        formData
                                    ),

                                credentials:
                                    "same-origin",

                                headers: {
                                    "Content-Type":
                                        "application/x-www-form-urlencoded;charset=UTF-8"
                                }
                            }
                        );


                    const data =
                        await response.json();


                    if (
                        data.csrf_token &&
                        csrfInput
                    ) {

                        csrfInput.value =
                            data.csrf_token;
                    }


                    if (data.success) {

                        showMessage(
                            data.message ||
                            "Registration successful.",
                            true
                        );


                        /*
                        |--------------------------------------------------------------------------
                        | Same behavior as successful PHP registration:
                        | clear sensitive password and form.
                        |--------------------------------------------------------------------------
                        */

                        const password =
                            document.getElementById(
                                "reg_password"
                            );

                        if (password) {
                            password.value = "";
                        }


                        /*
                        |--------------------------------------------------------------------------
                        | After successful registration, keep the
                        | generated customer ID visible.
                        |--------------------------------------------------------------------------
                        */

                        if (data.customer_id) {

                            showMessage(
                                data.message,
                                true
                            );
                        }


                    } else {

                        showMessage(
                            data.message ||
                            "Registration failed."
                        );
                    }


                } catch (error) {

                    console.error(
                        "REGISTER SUBMIT ERROR:",
                        error
                    );

                    showMessage(
                        "Registration failed. Please try again."
                    );

                } finally {

                    if (registerButton) {

                        registerButton.disabled =
                            false;

                        registerButton.textContent =
                            "রেজিস্টার";
                    }
                }

            }
        );


        /* =================================================
           INITIAL LOAD
        ================================================= */

        loadRegistrationData();

    }
);