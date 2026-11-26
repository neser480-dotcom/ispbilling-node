
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
        let lastUserActionAt = 0;
        let lastActionModal = null;

        const ACTION_MODAL_SELECTOR =
            ".modal.show, [role='dialog'][aria-modal='true'], dialog[open], " +
            ".offcanvas.show, [data-modal-root].is-open, .custom-modal.is-open";

        function findActionModal(target) {
            if (!target || typeof target.closest !== "function") return null;
            return target.closest(ACTION_MODAL_SELECTOR);
        }

        function rememberUserAction(target) {
            lastUserActionAt = Date.now();
            const modal = findActionModal(target);

            if (modal) {
                lastActionModal = modal;
            } else if (!target || !target.closest || !target.closest(".swal2-container")) {
                lastActionModal = null;
            }
        }

        function closeActionModal() {
            const modal = lastActionModal;
            lastActionModal = null;

            if (!modal || !modal.isConnected) return;

            if (modal.tagName === "DIALOG" && modal.open) {
                modal.close();
                return;
            }

            if (modal.classList.contains("offcanvas") &&
                window.bootstrap && window.bootstrap.Offcanvas) {
                const instance = window.bootstrap.Offcanvas.getInstance(modal) ||
                    window.bootstrap.Offcanvas.getOrCreateInstance(modal);
                instance.hide();
                return;
            }

            if (window.bootstrap && window.bootstrap.Modal &&
                modal.classList.contains("modal")) {
                const instance = window.bootstrap.Modal.getInstance(modal) ||
                    window.bootstrap.Modal.getOrCreateInstance(modal);
                instance.hide();
                return;
            }

            if (window.jQuery && modal.classList.contains("modal") &&
                typeof window.jQuery(modal).modal === "function") {
                window.jQuery(modal).modal("hide");
                return;
            }

            modal.classList.remove("show", "is-open", "open");
            modal.style.display = "none";
            modal.setAttribute("aria-hidden", "true");
            modal.removeAttribute("aria-modal");
            document.querySelectorAll(".modal-backdrop, .offcanvas-backdrop").forEach(function (backdrop) {
                backdrop.remove();
            });
            document.body.classList.remove("modal-open");
            document.body.style.removeProperty("overflow");
            document.body.style.removeProperty("padding-right");
        }

        // Only show action confirmations for requests that follow a real
        // user interaction; background polling and page-load requests stay silent.
        document.addEventListener("click", function (event) {
            if (event.target.closest("button, [role='button'], input[type='submit'], [data-action], a[data-method]")) {
                rememberUserAction(event.target);
            }
        }, true);

        document.addEventListener("submit", function (event) {
            rememberUserAction(event.target);
        }, true);

        // Handle plain same-origin POST forms centrally. Forms already handled
        // by page JavaScript (event.preventDefault), GET searches, downloads,
        // targeted forms and authentication endpoints retain their own behavior.
        document.addEventListener("submit", function (event) {
            const form = event.target;
            if (!(form instanceof HTMLFormElement) || event.defaultPrevented) return;

            const submitter = event.submitter || null;
            const method = String(
                (submitter && submitter.formMethod) || form.method || "GET"
            ).toUpperCase();
            const action = (submitter && submitter.formAction) || form.action || window.location.href;

            if (
                method !== "POST" ||
                form.target ||
                form.hasAttribute("data-native-submit") ||
                form.hasAttribute("data-no-ajax") ||
                form.hasAttribute("data-download")
            ) return;

            let url;
            try {
                url = new URL(action, window.location.href);
            } catch (_) {
                return;
            }

            if (
                url.origin !== window.location.origin ||
                /^\/(?:login|logout|auth)(?:\/|$)/i.test(url.pathname)
            ) return;

            // A page-level submit handler that already called preventDefault()
            // is left untouched. This branch is only for native form navigation.
            event.preventDefault();

            const previousDisabled = submitter ? submitter.disabled : false;
            if (submitter) submitter.disabled = true;

            (async function () {
                try {
                    let body;
                    try {
                        body = submitter
                            ? new FormData(form, submitter)
                            : new FormData(form);
                    } catch (_) {
                        body = new FormData(form);
                    }

                    const response = await fetch(url.href, {
                        method: "POST",
                        body,
                        credentials: "same-origin",
                        headers: { "X-Requested-With": "XMLHttpRequest" }
                    });

                    const contentType = response.headers.get("content-type") || "";
                    let data = {};
                    if (contentType.includes("application/json")) {
                        try {
                            data = await response.clone().json();
                        } catch (_) {
                            data = {};
                        }
                    }

                    if (!response.ok || data.success === false) {
                        if (window.AppToast && !url.pathname.startsWith("/api/")) {
                            window.AppToast.error(
                                data.message || "ফর্ম জমা দেওয়া যায়নি। তথ্য যাচাই করে আবার চেষ্টা করুন।"
                            );
                        }
                        return;
                    }

                    // API requests are confirmed by the central fetch handler.
                    // For regular HTML form endpoints, confirm here without leaving
                    // the current page or clearing the entered values.
                    if (window.AppToast && !url.pathname.startsWith("/api/")) {
                        window.AppToast.success(
                            data.message || "তথ্য সফলভাবে জমা হয়েছে।"
                        );
                    }
                    closeActionModal();
                } catch (error) {
                    console.error("Central form submission error:", error);
                    if (window.AppToast) {
                        window.AppToast.error("সার্ভারের সাথে যোগাযোগ করা যায়নি। আবার চেষ্টা করুন।");
                    }
                } finally {
                    if (submitter) submitter.disabled = previousDisabled;
                }
            })();
        }, false);

        window.fetch = async function (...args) {
            const response = await originalFetch(...args);

            try {
                const requestUrl =
                    typeof args[0] === "string"
                        ? args[0]
                        : args[0]?.url || "";

                const options = args[1] || {};
                const method = String(
                    options.method ||
                    (args[0] && args[0].method) ||
                    "GET"
                ).toUpperCase();

                const url = new URL(requestUrl, window.location.origin);
                const isSameOriginApi =
                    url.origin === window.location.origin &&
                    url.pathname.startsWith("/api/");
                const isUserAction =
                    lastUserActionAt > 0 &&
                    Date.now() - lastUserActionAt < 10000;
                const isMutation =
                    ["POST", "PUT", "PATCH", "DELETE"].includes(method);

                if (isSameOriginApi && (isMutation || !response.ok)) {
                    const contentType =
                        response.headers.get("content-type") || "";
                    let data = {};

                    if (contentType.includes("application/json")) {
                        try {
                            data = await response.clone().json();
                        } catch (_) {
                            data = {};
                        }
                    }

                    const failed =
                        !response.ok || data.success === false;

                    if (failed) {
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
                    } else if (isMutation && isUserAction) {
                        if (window.AppToast) {
                            window.AppToast.success(
                                data.message || "কাজটি সফলভাবে সম্পন্ন হয়েছে।"
                            );
                        }
                        // Close the Add/Edit dialog automatically only after
                        // the server confirms the mutation was successful.
                        closeActionModal();
                    }
                }
            } catch (error) {
                console.error("Central API action toast error:", error);
            }

            // Return the original response unchanged for existing page logic.
            return response;
        };

        // Also cover XMLHttpRequest/jQuery AJAX pages so the same success
        // toast and automatic modal close work across older sidebar modules.
        if (window.XMLHttpRequest && !window.XMLHttpRequest.prototype.__ispToastWrapped) {
            const xhrOpen = window.XMLHttpRequest.prototype.open;
            const xhrSend = window.XMLHttpRequest.prototype.send;

            window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
                this.__ispRequestMethod = String(method || "GET").toUpperCase();
                this.__ispRequestUrl = url;
                return xhrOpen.call(this, method, url, ...rest);
            };

            window.XMLHttpRequest.prototype.send = function (...args) {
                const xhr = this;
                const method = xhr.__ispRequestMethod || "GET";
                const requestUrl = xhr.__ispRequestUrl || "";
                const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
                const isUserAction = lastUserActionAt > 0 && Date.now() - lastUserActionAt < 10000;

                if (isMutation && isUserAction) {
                    xhr.addEventListener("loadend", function () {
                        try {
                            const url = new URL(requestUrl, window.location.href);
                            if (url.origin !== window.location.origin) return;

                            let data = {};
                            const responseText = xhr.responseText || "";
                            try { data = JSON.parse(responseText); } catch (_) {}

                            const failed = xhr.status < 200 || xhr.status >= 300 || data.success === false;
                            if (failed) {
                                if (window.AppToast) {
                                    window.AppToast.error(
                                        data.message || (xhr.status >= 500
                                            ? "সার্ভারে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।"
                                            : "অনুরোধটি সম্পন্ন হয়নি।")
                                    );
                                }
                                return;
                            }

                            if (window.AppToast) {
                                window.AppToast.success(data.message || "কাজটি সফলভাবে সম্পন্ন হয়েছে।");
                            }
                            closeActionModal();
                        } catch (error) {
                            console.error("Central XHR action toast error:", error);
                        }
                    }, { once: true });
                }

                return xhrSend.apply(this, args);
            };

            window.XMLHttpRequest.prototype.__ispToastWrapped = true;
        }
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
                window.AppToast.error("Topbar লোড করা যায়নি। পেজটি রিফ্রেশ করুন।"
                );
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | 4. START CENTRAL LOADER
    |--------------------------------------------------------------------------
    */

    /*
    |--------------------------------------------------------------------------
    | 3b. THEME COLORS (dark mode follows the chosen colour) - loaded last
    |--------------------------------------------------------------------------
    */

    function loadThemeColors() {
        if (!document.querySelector("link[data-theme-colors-css]")) {
            const css = document.createElement("link");

            css.rel = "stylesheet";
            css.href = "/assets/css/theme-colors.css";
            css.dataset.themeColorsCss = "true";

            document.head.appendChild(css);
        }

        if (!document.querySelector("script[data-theme-colors-js]")) {
            const script = document.createElement("script");

            script.src = "/assets/js/theme-colors.js";
            script.dataset.themeColorsJs = "true";

            document.head.appendChild(script);
        }
    }

    async function initialize() {
        await loadAppToast();

        installFetchErrorHandler();

        loadThemeColors();

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
