(function () {

    'use strict';

    // Ensure every page loading the shared sidebar also gets the
    // centralized action toast and automatic modal-close handler.
    if (!document.querySelector('script[src*="/assets/js/topbar-loader.js"]')) {
        const masterScript = document.createElement('script');
        masterScript.src = '/assets/js/topbar-loader.js';
        masterScript.dataset.masterLoader = 'true';
        document.head.appendChild(masterScript);
    }


    /* =====================================================
       STAFF PERMISSION FILTER
       admin / super_admin / reseller  -> সব মেনু দেখে
       manager / collector / staff / employee -> শুধু permission পাওয়া মেনু
       নতুন মেনুর জন্য শুধু নিচের MENU_PERMISSION এ লাইন যোগ করুন।
    ===================================================== */

    const STAFF_ROLES = ['manager', 'collector', 'staff', 'employee'];

    /* সবসময় দেখাবে */
    const ALWAYS = ['/dashboard', '/tutorial', '/profile', '/activity'];

    /* link path  ->  দরকারি permission key */
    const MENU_PERMISSION = {
        '/customers':               'customer_list',
        '/reports/collection':      'bill_posting',
        '/reports/deposit':         'bill_posting',
        '/accounts/expenditure':    'expenditure',
        '/accounts/invoices':       'bill_invoice_print',
        '/message':                 'sms_board',
        '/olt/onu':                 'olt_user_monitoring',
        '/olt_monitoring':          'olt_user_monitoring',
        '/areas':                   'area_management'
    };

    function matchPermission(path) {

        let best = '';

        Object.keys(MENU_PERMISSION).forEach(function (p) {

            if (
                (path === p || path.indexOf(p + '/') === 0) &&
                p.length > best.length
            ) {
                best = p;
            }

        });

        return best ? MENU_PERMISSION[best] : null;
    }

    async function applyPermissionFilter(container) {

        let role = '';
        let granted = [];

        try {

            const response =
                await fetch(
                    '/api/auth/permissions',
                    {
                        credentials: 'same-origin',
                        cache: 'no-store'
                    }
                );

            if (!response.ok) {
                return;
            }

            const data =
                await response.json();

            role =
                String(data.role || '')
                    .trim()
                    .toLowerCase()
                    .replace(/[\s-]+/g, '_');

            granted =
                Array.isArray(data.permissions)
                    ? data.permissions
                    : [];

        } catch (error) {

            console.error(
                'Sidebar permission error:',
                error
            );

            return;
        }

        if (STAFF_ROLES.indexOf(role) === -1) {
            return;
        }

        /* প্রতিটি লিংক: অনুমতি না থাকলে লুকাও */

        container
            .querySelectorAll('a[href^="/"]')
            .forEach(function (a) {

                const path =
                    (a.getAttribute('href') || '')
                        .split('?')[0]
                        .replace(/\/+$/, '');

                if (ALWAYS.indexOf(path) !== -1) {
                    return;
                }

                const key =
                    matchPermission(path);

                if (!key || granted.indexOf(key) === -1) {

                    const item =
                        a.closest('li') && !a.classList.contains('submenu')
                            ? a.closest('li')
                            : a;

                    item.style.display = 'none';
                }

            });

        /* সব সাবমেনু লুকানো হলে গ্রুপও লুকাও */

        container
            .querySelectorAll('a[data-bs-toggle="collapse"]')
            .forEach(function (toggle) {

                const target =
                    container.querySelector(
                        toggle.getAttribute('href')
                    );

                if (!target) {
                    return;
                }

                const visible =
                    Array.from(
                        target.querySelectorAll('a[href^="/"]')
                    ).some(function (a) {
                        return a.style.display !== 'none';
                    });

                if (!visible) {

                    const li = toggle.closest('li');

                    (li || toggle).style.display = 'none';
                }

            });
    }

    async function loadSidebar() {

        const container =
            document.getElementById(
                'sidebarContainer'
            );


        if (!container) {
            return;
        }


        try {

            const response =
                await fetch(
                    '/partials/sidebar.html',
                    {
                        credentials:
                            'same-origin'
                    }
                );


            if (!response.ok) {

                throw new Error(
                    'Sidebar HTTP ' +
                    response.status
                );

            }


            const html =
                await response.text();


            container.style.visibility =
                'hidden';

            container.innerHTML =
                html;

            await applyPermissionFilter(
                container
            );

            container.style.visibility =
                '';


            /* =================================================
               SIDEBAR CSS
            ================================================= */

            if (
                !document.querySelector(
                    'link[data-sidebar-css]'
                )
            ) {

                const css =
                    document.createElement(
                        'link'
                    );

                css.rel =
                    'stylesheet';

                css.href =
                    '/assets/css/sidebar.css';

                css.dataset.sidebarCss =
                    'true';

                document.head.appendChild(
                    css
                );

            }


            /* =================================================
               SIDEBAR JS
            ================================================= */

            if (
                !document.querySelector(
                    'script[data-sidebar-js]'
                )
            ) {

                const script =
                    document.createElement(
                        'script'
                    );

                script.src =
                    '/assets/js/sidebar.js';

                script.dataset.sidebarJs =
                    'true';

                document.body.appendChild(
                    script
                );

            }

        } catch (error) {

            console.error(
                'Sidebar loading error:',
                error
            );

            container.style.visibility =
                '';

        }

    }


    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            loadSidebar,
            {
                once: true
            }
        );

    } else {

        loadSidebar();

    }

})();