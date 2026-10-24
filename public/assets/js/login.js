"use strict";


/*
|--------------------------------------------------------------------------
| PASSWORD SHOW / HIDE
|--------------------------------------------------------------------------
*/

function showPassword(){

    let pass =
        document.getElementById("password");


    if (!pass) {
        return;
    }


    if(pass.type === "password"){

        pass.type="text";

    }else{

        pass.type="password";

    }

}


/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

document.addEventListener(
    "DOMContentLoaded",
    function () {

        const form =
            document.getElementById("loginForm");

        const csrfInput =
            document.getElementById("csrf_token");

        const usernameInput =
            document.getElementById("username");

        const passwordInput =
            document.getElementById("password");

        const rememberInput =
            document.getElementById("remember");

        const errorBox =
            document.getElementById("loginError");

        const errorText =
            document.getElementById("loginErrorText");

        const loginButton =
            document.getElementById("loginButton");

        const currentYear =
            document.getElementById("currentYear");


        /*
        |--------------------------------------------------------------------------
        | YEAR
        |--------------------------------------------------------------------------
        */

        if (currentYear) {

            currentYear.textContent =
                new Date().getFullYear();

        }


        /*
        |--------------------------------------------------------------------------
        | SHOW ERROR
        |--------------------------------------------------------------------------
        */

        function showError(message) {

            if (!errorBox || !errorText) {
                return;
            }

            errorText.textContent =
                message || "Login failed.";

            errorBox.style.display =
                "flex";
        }


        /*
        |--------------------------------------------------------------------------
        | HIDE ERROR
        |--------------------------------------------------------------------------
        */

        function hideError() {

            if (!errorBox) {
                return;
            }

            errorBox.style.display =
                "none";

            if (errorText) {
                errorText.textContent = "";
            }
        }


        /*
        |--------------------------------------------------------------------------
        | SET CSRF
        |--------------------------------------------------------------------------
        */

        function setCsrf(token) {

            if (
                csrfInput &&
                typeof token === "string" &&
                token !== ""
            ) {

                csrfInput.value =
                    token;
            }
        }


        /*
        |--------------------------------------------------------------------------
        | LOAD CSRF
        |--------------------------------------------------------------------------
        */

        async function loadCsrf() {

            try {

                const response =
                    await fetch(
                        "/api/auth/csrf",
                        {
                            method: "GET",
                            credentials: "same-origin",
                            cache: "no-store"
                        }
                    );


                const data =
                    await response.json();


                if (
                    data &&
                    data.success &&
                    data.csrf_token
                ) {

                    setCsrf(
                        data.csrf_token
                    );
                }

            } catch (error) {

                console.error(
                    "CSRF load error:",
                    error
                );

                showError(
                    "Unable to initialize login. Please refresh the page."
                );
            }
        }


        /*
        |--------------------------------------------------------------------------
        | LOAD REMEMBERED USERNAME
        |--------------------------------------------------------------------------
        */

        async function loadRememberedUsername() {

            try {

                const response =
                    await fetch(
                        "/api/auth/remembered",
                        {
                            method: "GET",
                            credentials: "same-origin",
                            cache: "no-store"
                        }
                    );


                const data =
                    await response.json();


                if (
                    data &&
                    data.success &&
                    data.username
                ) {

                    if (
                        usernameInput &&
                        usernameInput.value === ""
                    ) {

                        usernameInput.value =
                            data.username;
                    }
                }

            } catch (error) {

                console.error(
                    "Remembered username error:",
                    error
                );
            }
        }


        /*
        |--------------------------------------------------------------------------
        | INITIALIZE
        |--------------------------------------------------------------------------
        */

        loadCsrf();

        loadRememberedUsername();


        /*
        |--------------------------------------------------------------------------
        | SUBMIT
        |--------------------------------------------------------------------------
        */

        if (!form) {
            return;
        }


        form.addEventListener(
            "submit",
            async function (event) {

                event.preventDefault();


                hideError();


                if (
                    !usernameInput ||
                    !passwordInput ||
                    !csrfInput
                ) {

                    showError(
                        "Login form is not configured correctly."
                    );

                    return;
                }


                const username =
                    usernameInput.value.trim();

                const password =
                    passwordInput.value;


                /*
                |--------------------------------------------------------------------------
                | BASIC VALIDATION
                |--------------------------------------------------------------------------
                */

                if (
                    username === "" ||
                    password === ""
                ) {

                    showError(
                        "Please enter username and password."
                    );

                    return;
                }


                /*
                |--------------------------------------------------------------------------
                | CSRF CHECK
                |--------------------------------------------------------------------------
                */

                if (
                    !csrfInput.value
                ) {

                    await loadCsrf();

                    if (!csrfInput.value) {

                        showError(
                            "Unable to initialize login. Please refresh the page."
                        );

                        return;
                    }
                }


                /*
                |--------------------------------------------------------------------------
                | DISABLE BUTTON
                |--------------------------------------------------------------------------
                */

                if (loginButton) {

                    loginButton.disabled =
                        true;
                }


                /*
                |--------------------------------------------------------------------------
                | REQUEST
                |--------------------------------------------------------------------------
                */

                const formData =
                    new URLSearchParams();


                formData.append(
                    "username",
                    username
                );

                formData.append(
                    "password",
                    password
                );

                formData.append(
                    "csrf_token",
                    csrfInput.value
                );

                formData.append(
                    "login",
                    "1"
                );


                if (
                    rememberInput &&
                    rememberInput.checked
                ) {

                    formData.append(
                        "remember",
                        "1"
                    );
                }


                try {

                    const response =
                        await fetch(
                            "/api/auth/login",
                            {
                                method: "POST",

                                credentials:
                                    "same-origin",

                                headers: {
                                    "Content-Type":
                                        "application/x-www-form-urlencoded;charset=UTF-8"
                                },

                                body:
                                    formData.toString()
                            }
                        );


                    const data =
                        await response.json();


                    /*
                    |--------------------------------------------------------------------------
                    | ROTATED CSRF
                    |--------------------------------------------------------------------------
                    */

                    if (
                        data &&
                        data.csrf_token
                    ) {

                        setCsrf(
                            data.csrf_token
                        );
                    }


                    /*
                    |--------------------------------------------------------------------------
                    | SUCCESS
                    |--------------------------------------------------------------------------
                    */

                    if (
                        response.ok &&
                        data &&
                        data.success
                    ) {

                        window.location.href =
                            data.redirect ||
                            "/dashboard";

                        return;
                    }


                    /*
                    |--------------------------------------------------------------------------
                    | ERROR
                    |--------------------------------------------------------------------------
                    */

                    showError(
                        data?.message ||
                        "Invalid username or password."
                    );


                    /*
                    |--------------------------------------------------------------------------
                    | LOCKOUT
                    |--------------------------------------------------------------------------
                    */

                    if (
                        data &&
                        data.locked
                    ) {

                        if (loginButton) {

                            loginButton.disabled =
                                true;
                        }

                    } else {

                        if (loginButton) {

                            loginButton.disabled =
                                false;
                        }
                    }


                } catch (error) {

                    console.error(
                        "Login request error:",
                        error
                    );


                    showError(
                        "Unable to process login. Please try again."
                    );


                    if (loginButton) {

                        loginButton.disabled =
                            false;
                    }
                }

            }
        );

    }
);