
(function () {
    "use strict";

    if (window.__ispMasterLoaderStarted) {
        return;
    }

    window.__ispMasterLoaderStarted = true;

    /*
    |--------------------------------------------------------------------------
    | 1. LOAD EXISTING APP TOAST
    |--------------------------------------------------------------------------
    */

    function loadAppToast() {
        if (window.AppToast) {
            return Promise.resolve(true);
        }

        const existing = document.querySelector(
            'script[data-app-toast]'
        );

        if (existing) {
            return new Promise(function (resolve) {
                if (window.AppToast) {
                    resolve(true);
                    return;
                }

                existing.addEventListener(
                    "load",
                    function () {
                        resolve(!!window.AppToast);
                    },
                    { once: true }
                );

                existing.addEventListener(
                    "error",
                    function () {
                        resolve(false);
                    },
                    { once: true }
                );
            });
        }

        return new Promise(function (resolve) {
            const script = document.createElement("script");

            script.src = "/assets/js/app-toast.js";
            script.dataset.appToast = "true";
            script.async = false;

            script.onload = function () {
                resolve(!!window.AppToast);
            };

            script.onerror = function () {
                console.error(
                    "App Toast loading failed:",
                    script.src
                );
                resolve(false);
            };

            document.head.appendChild(script);
        });
    }

    /*
    |--------------------------------------------------------------------------
    | 2. CENTRAL API ERROR TOAST
    |--------------------------------------------------------------------------
    */

    function installFetchErrorHandler() {
        if (window.__ispFetchErrorHandlerInstalled) {
            return;
        }

        window.__ispFetchErrorHandlerInstalled = true;

        const originalFetch = window.fetch.bind(window);

        window.fetch = async function (...args) {
            const response = await originalFetch(...args);

            try {
                const requestUrl =
                    typeof args[0] === "string"
                        ? args[0]
                        : args[0]?.url || "";

                const url = new URL(
                    requestUrl,
                    window.location.origin
                );

                // Handle same-origin failed API responses.
                if (
                    url.origin === window.location.origin &&
                    url.pathname.startsWith("/api/") &&
                    !response.ok
                ) {
                    const contentType =
                        response.headers.get("content-type") || "";

                    let data = {};

                    if (
                        contentType.includes("application/json")
                    ) {
                        data = await response.clone().json();
                    }

                    if (window.AppToast) {
                        const message =
                            data.message ||
                            (response.status === 401
                                ? "সেশন শেষ হয়েছে। আবার লগইন করুন।"
                                : response.status === 403
                                ? "অনুরোধটি অনুমোদিত নয় অথবা CSRF Token ভুল।"
                                : response.status === 404
                                ? "চাওয়া API বা তথ্য পাওয়া যায়নি।"
                                : response.status >= 500
                                ? "সার্ভারে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।"
                                : "অনুরোধটি সম্পন্ন হয়নি।");

                        window.AppToast.error(message);
                    }
                }
            } catch (error) {
                console.error(
                    "Central API error handler:",
                    error
                );
            }

            // Return the original response unchanged.
            return response;
        };
    }

    /*
    |--------------------------------------------------------------------------
    | 3. LOAD TOPBAR HTML, CSS AND JS
    |--------------------------------------------------------------------------
    */

    async function loadTopbar() {
        const container =
            document.getElementById("topbarContainer");

        if (!container) {
            return;
        }

        try {
            const response = await fetch(
                "/partials/topbar.html",
                {
                    credentials: "same-origin"
                }
            );

            if (!response.ok) {
                throw new Error(
                    "Topbar HTTP " + response.status
                );
            }

            container.innerHTML = await response.text();

            // Load existing Topbar CSS.
            if (
                !document.querySelector(
                    "link[data-topbar-css]"
                )
            ) {
                const css = document.createElement("link");

                css.rel = "stylesheet";
                css.href = "/assets/css/topbar.css";
                css.dataset.topbarCss = "true";

                document.head.appendChild(css);
            }

            // Load existing Topbar JS.
            if (
                !document.querySelector(
                    'script[data-topbar-js]'
                )
            ) {
                const script = document.createElement("script");

                script.src = "/assets/js/topbar.js";
                script.dataset.topbarJs = "true";

                document.body.appendChild(script);
            }
        } catch (error) {
            console.error("Topbar loading error:", error);

            if (window.AppToast) {
                window.AppToast.error(
                    "Topbar লোড করা যায়নি। পেজটি Refresh করুন।"
                );
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | 4. START CENTRAL LOADER
    |--------------------------------------------------------------------------
    */

    async function initialize() {
        await loadAppToast();

        installFetchErrorHandler();

        await loadTopbar();
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initialize,
            { once: true }
        );
    } else {
        initialize();
    }
})();
