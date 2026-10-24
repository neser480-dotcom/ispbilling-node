(function () {

    'use strict';

    /*
    |--------------------------------------------------------------------------
    | PREVENT DOUBLE INITIALIZATION
    |--------------------------------------------------------------------------
    */

    if (window.__ispBillingSidebarInitialized) {
        return;
    }

    window.__ispBillingSidebarInitialized = true;


    /*
    |--------------------------------------------------------------------------
    | HELPERS
    |--------------------------------------------------------------------------
    */

    function getElement(id) {
        return document.getElementById(id);
    }


    function setText(id, value) {

        const element = getElement(id);

        if (!element) {
            return;
        }

        element.textContent =
            value !== null &&
            value !== undefined &&
            String(value).trim() !== ''
                ? String(value)
                : '-';
    }


    /*
    |--------------------------------------------------------------------------
    | LOAD SIDEBAR USER DATA
    |--------------------------------------------------------------------------
    */

    async function loadSidebarData() {

        try {

            const response =
                await fetch(
                    '/api/sidebar/data',
                    {
                        method: 'GET',
                        credentials: 'same-origin',
                        cache: 'no-store',
                        headers: {
                            'Accept': 'application/json'
                        }
                    }
                );


            if (!response.ok) {

                throw new Error(
                    'Sidebar API HTTP ' +
                    response.status
                );

            }


            const data =
                await response.json();


            if (
                !data ||
                data.success !== true ||
                !data.user
            ) {

                throw new Error(
                    data?.message ||
                    'Invalid sidebar response.'
                );

            }


            const user =
                data.user;


            /*
            |--------------------------------------------------------------------------
            | USER INFORMATION
            |--------------------------------------------------------------------------
            */

            const fullname =
                String(
                    user.fullname ||
                    ''
                ).trim();


            const role =
                String(
                    user.role ||
                    ''
                ).trim();


            const userId =
                user.user_id ??
                user.customer_id ??
                '-';


            const customerId =
                user.customer_id ??
                '';


            /*
            |--------------------------------------------------------------------------
            | PROFILE NAME
            |--------------------------------------------------------------------------
            */

            setText(
                'profileFullname',
                fullname || 'User'
            );


            /*
            |--------------------------------------------------------------------------
            | ROLE
            |--------------------------------------------------------------------------
            */

            setText(
                'profileRole',
                role || '-'
            );


            /*
            |--------------------------------------------------------------------------
            | USER / CUSTOMER ID
            |--------------------------------------------------------------------------
            */

            setText(
                'profileId',
                userId
            );


            setText(
                'profileCustomerId',
                customerId || userId
            );


            /*
            |--------------------------------------------------------------------------
            | AVATAR
            |--------------------------------------------------------------------------
            */

            const avatar =
                getElement(
                    'profileAvatar'
                );


            if (avatar) {

                let letter = 'A';


                if (fullname !== '') {

                    if (
                        typeof Intl !== 'undefined'
                    ) {

                        letter =
                            Array.from(
                                fullname
                            )[0] || 'A';

                    } else {

                        letter =
                            fullname.charAt(0) ||
                            'A';

                    }

                }


                avatar.textContent =
                    letter.toUpperCase();


                avatar.title =
                    fullname ||
                    'User';

            }


            /*
            |--------------------------------------------------------------------------
            | ROLE NORMALIZATION
            |--------------------------------------------------------------------------
            */

            const normalizedRole =
                role.toLowerCase().trim();


            const isSuperAdmin =
                normalizedRole ===
                'super_admin';


            /*
            |--------------------------------------------------------------------------
            | SIDEBAR SECTIONS
            |--------------------------------------------------------------------------
            */

            const superAdminSidebar =
                getElement(
                    'superAdminSidebar'
                );


            const companySidebar =
                getElement(
                    'companySidebar'
                );


            if (superAdminSidebar) {

                superAdminSidebar.style.display =
                    isSuperAdmin
                        ? ''
                        : 'none';

            }


            if (companySidebar) {

                companySidebar.style.display =
                    isSuperAdmin
                        ? 'none'
                        : '';

            }


            /*
            |--------------------------------------------------------------------------
            | SIDEBAR PROFILE ID FALLBACK
            |--------------------------------------------------------------------------
            |
            | Different converted versions may use different ID names.
            | These are optional and do not affect the menu.
            |
            */

            const possibleIdElements = [
                'sidebarUserId',
                'profileUserId',
                'sidebarCustomerId'
            ];


            possibleIdElements.forEach(
                function (id) {

                    const element =
                        getElement(id);

                    if (!element) {
                        return;
                    }

                    element.textContent =
                        userId;

                }
            );


            /*
            |--------------------------------------------------------------------------
            | DISPATCH EVENT
            |--------------------------------------------------------------------------
            */

            document.dispatchEvent(
                new CustomEvent(
                    'ispBillingSidebarLoaded',
                    {
                        detail: {
                            user: user,
                            isSuperAdmin:
                                isSuperAdmin
                        }
                    }
                )
            );


        } catch (error) {

            console.error(
                'Sidebar data loading error:',
                error
            );


            /*
            |--------------------------------------------------------------------------
            | FALLBACK
            |--------------------------------------------------------------------------
            |
            | Do not leave the complete sidebar blank just because
            | profile API fails.
            |
            */

            const superAdminSidebar =
                getElement(
                    'superAdminSidebar'
                );


            const companySidebar =
                getElement(
                    'companySidebar'
                );


            /*
            | If API cannot be read, keep the company menu visible
            | instead of hiding the complete sidebar.
            */

            if (
                companySidebar &&
                superAdminSidebar
            ) {

                superAdminSidebar.style.display =
                    'none';

                companySidebar.style.display =
                    '';

            }


            setText(
                'profileFullname',
                'User'
            );


            setText(
                'profileRole',
                '-'
            );


            setText(
                'profileId',
                '-'
            );

        }

    }


    /*
    |--------------------------------------------------------------------------
    | SUBMENU
    |--------------------------------------------------------------------------
    */

    function initSubmenus() {

        const menus =
            document.querySelectorAll(
                ".sidebar a[data-bs-toggle='collapse']"
            );


        menus.forEach(
            function (menu) {

                /*
                | Prevent duplicate event binding
                */

                if (
                    menu.dataset.sidebarBound ===
                    'true'
                ) {
                    return;
                }


                menu.dataset.sidebarBound =
                    'true';


                menu.addEventListener(
                    'click',
                    function (e) {

                        e.preventDefault();


                        const targetSelector =
                            menu.getAttribute(
                                'href'
                            );


                        if (
                            !targetSelector ||
                            targetSelector === '#'
                        ) {
                            return;
                        }


                        let target = null;


                        try {

                            target =
                                document.querySelector(
                                    targetSelector
                                );

                        } catch (error) {

                            console.error(
                                'Invalid sidebar target:',
                                targetSelector
                            );

                            return;

                        }


                        if (!target) {
                            return;
                        }


                        const isOpen =
                            target.classList.contains(
                                'show'
                            );


                        /*
                        | Close other submenus
                        */

                        document
                            .querySelectorAll(
                                '.sidebar .collapse.show'
                            )
                            .forEach(
                                function (openMenu) {

                                    if (
                                        openMenu !== target
                                    ) {

                                        openMenu.classList.remove(
                                            'show'
                                        );

                                    }

                                }
                            );


                        /*
                        | Open / close selected submenu
                        */

                        if (isOpen) {

                            target.classList.remove(
                                'show'
                            );

                        } else {

                            target.classList.add(
                                'show'
                            );

                        }

                    }
                );

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | MOBILE MENU BUTTON
    |--------------------------------------------------------------------------
    */

    function initMobileMenu() {

        const menuBtn =
            getElement(
                'menuBtn'
            );


        if (!menuBtn) {
            return;
        }


        if (
            menuBtn.dataset.sidebarMenuBound ===
            'true'
        ) {
            return;
        }


        menuBtn.dataset.sidebarMenuBound =
            'true';


        menuBtn.addEventListener(
            'click',
            function (e) {

                e.preventDefault();
                e.stopPropagation();


                const sidebar =
                    document.querySelector(
                        '.sidebar'
                    );


                if (!sidebar) {
                    return;
                }


                sidebar.classList.toggle(
                    'active'
                );

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | CLOSE SIDEBAR WHEN CLICKING OUTSIDE ON MOBILE
    |--------------------------------------------------------------------------
    */

    function initOutsideClick() {

        document.addEventListener(
            'click',
            function (e) {

                const sidebar =
                    document.querySelector(
                        '.sidebar'
                    );


                const menuBtn =
                    getElement(
                        'menuBtn'
                    );


                if (
                    !sidebar ||
                    !menuBtn
                ) {
                    return;
                }


                if (
                    window.innerWidth <= 768 &&
                    sidebar.classList.contains(
                        'active'
                    ) &&
                    !sidebar.contains(
                        e.target
                    ) &&
                    !menuBtn.contains(
                        e.target
                    )
                ) {

                    sidebar.classList.remove(
                        'active'
                    );

                }

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | INITIALIZE
    |--------------------------------------------------------------------------
    */

    function initSidebar() {

        /*
        | These are initialized after the sidebar HTML
        | has already been inserted by sidebar-loader.js.
        */

        initSubmenus();

        initMobileMenu();

        initOutsideClick();

        loadSidebarData();

    }


    /*
    |--------------------------------------------------------------------------
    | START
    |--------------------------------------------------------------------------
    */

    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            initSidebar,
            {
                once: true
            }
        );

    } else {

        initSidebar();

    }

})();