(function () {

    'use strict';


    /* =========================================================
       PREVENT DUPLICATE INITIALIZATION
    ========================================================= */

    if (window.__ispBillingTopbarInitialized) {
        return;
    }

    window.__ispBillingTopbarInitialized = true;


    /* =========================================================
       HELPERS
    ========================================================= */

    function getElement(id) {
        return document.getElementById(id);
    }


    function getCurrentLanguage() {

        const saved =
            localStorage.getItem('ispbilling_lang');

        if (saved === 'bn' || saved === 'en') {
            return saved;
        }

        const params =
            new URLSearchParams(window.location.search);

        const urlLang =
            params.get('lang');

        if (urlLang === 'bn' || urlLang === 'en') {
            return urlLang;
        }

        return 'en';
    }


    function setLanguage(lang) {

        if (lang !== 'bn' && lang !== 'en') {
            lang = 'en';
        }

        localStorage.setItem(
            'ispbilling_lang',
            lang
        );

        const url =
            new URL(window.location.href);

        url.searchParams.set(
            'lang',
            lang
        );

        window.location.href =
            url.toString();
    }


    function updateLanguageUI(lang) {

        const langBtn =
            getElement('langBtn');

        if (!langBtn) {
            return;
        }

        if (lang === 'bn') {

            langBtn.innerHTML =
                'বাংলা <i class="fas fa-caret-down"></i>';

        } else {

            langBtn.innerHTML =
                'EN <i class="fas fa-caret-down"></i>';

        }

        const search =
            getElement('topbarCustomerSearch');

        if (search) {

            search.placeholder =
                lang === 'bn'
                    ? 'কাস্টমার খুঁজুন...'
                    : 'Search customer...';

        }

        const menuBtn =
            getElement('menuBtn');

        if (menuBtn) {

            menuBtn.title =
                lang === 'bn'
                    ? 'মেনু'
                    : 'Menu';

        }

    }


    /* =========================================================
       LOAD USER INFORMATION
    ========================================================= */

    async function loadTopbarUser() {

        try {

            const response =
                await fetch(
                    '/api/sidebar/data',
                    {
                        method: 'GET',
                        credentials: 'same-origin',
                        headers: {
                            'Accept': 'application/json'
                        }
                    }
                );


            if (!response.ok) {
                return;
            }


            const data =
                await response.json();


            if (
                !data ||
                !data.success ||
                !data.user
            ) {
                return;
            }


            const user =
                data.user;


            const fullname =
                String(
                    user.fullname || ''
                ).trim();


            const role =
                String(
                    user.role || ''
                ).trim();


            const fullnameElement =
                getElement('profileFullname');


            const roleElement =
                getElement('profileRole');


            const avatarElement =
                getElement('profileAvatar');


            if (fullnameElement) {

                fullnameElement.textContent =
                    fullname || 'User';

            }


            if (roleElement) {

                roleElement.textContent =
                    role || '-';

            }


            if (avatarElement) {

                let letter = 'A';

                if (fullname) {

                    const chars =
                        Array.from(fullname);

                    if (chars.length > 0) {
                        letter = chars[0];
                    }

                }

                avatarElement.textContent =
                    letter.toUpperCase();

                avatarElement.title =
                    fullname || 'User';

            }

        } catch (error) {

            console.error(
                'Topbar user loading error:',
                error
            );

        }

    }


    /* =========================================================
       PROFILE
    ========================================================= */

    function initProfile() {

        const profileBtn =
            getElement('profileBtn');

        const profileMenu =
            getElement('profileMenu');

        const profileContainer =
            getElement('profileContainer');


        if (
            !profileBtn ||
            !profileMenu
        ) {
            return;
        }


        profileBtn.addEventListener(
            'click',
            function (e) {

                e.preventDefault();
                e.stopPropagation();


                const langMenu =
                    getElement('langMenu');

                const langBtn =
                    getElement('langBtn');


                /* CLOSE LANGUAGE */

                if (langMenu) {

                    langMenu.classList.remove(
                        'show'
                    );

                }


                if (langBtn) {

                    langBtn.setAttribute(
                        'aria-expanded',
                        'false'
                    );

                }


                /* TOGGLE PROFILE */

                const isOpen =
                    profileMenu.classList.contains(
                        'show'
                    );


                if (isOpen) {

                    profileMenu.classList.remove(
                        'show'
                    );

                    profileBtn.setAttribute(
                        'aria-expanded',
                        'false'
                    );

                } else {

                    profileMenu.classList.add(
                        'show'
                    );

                    profileBtn.setAttribute(
                        'aria-expanded',
                        'true'
                    );

                }

            },
            true
        );


        /* OUTSIDE CLICK */

        document.addEventListener(
            'click',
            function (e) {

                if (
                    profileContainer &&
                    !profileContainer.contains(
                        e.target
                    )
                ) {

                    profileMenu.classList.remove(
                        'show'
                    );

                    profileBtn.setAttribute(
                        'aria-expanded',
                        'false'
                    );

                }

            }
        );

    }


    /* =========================================================
       LANGUAGE
    ========================================================= */

    function initLanguage() {

        const langBtn =
            getElement('langBtn');

        const langMenu =
            getElement('langMenu');

        const languageDropdown =
            getElement('languageDropdown');


        if (
            !langBtn ||
            !langMenu
        ) {
            return;
        }


        langBtn.addEventListener(
            'click',
            function (e) {

                e.preventDefault();
                e.stopPropagation();


                const profileMenu =
                    getElement('profileMenu');

                const profileBtn =
                    getElement('profileBtn');


                /* CLOSE PROFILE */

                if (profileMenu) {

                    profileMenu.classList.remove(
                        'show'
                    );

                }


                if (profileBtn) {

                    profileBtn.setAttribute(
                        'aria-expanded',
                        'false'
                    );

                }


                /* TOGGLE LANGUAGE */

                const isOpen =
                    langMenu.classList.contains(
                        'show'
                    );


                if (isOpen) {

                    langMenu.classList.remove(
                        'show'
                    );

                    langBtn.setAttribute(
                        'aria-expanded',
                        'false'
                    );

                } else {

                    langMenu.classList.add(
                        'show'
                    );

                    langBtn.setAttribute(
                        'aria-expanded',
                        'true'
                    );

                }

            },
            true
        );


        /* LANGUAGE LINKS */

        langMenu
            .querySelectorAll('a[data-lang]')
            .forEach(function (link) {

                link.addEventListener(
                    'click',
                    function (e) {

                        e.preventDefault();

                        const lang =
                            link.dataset.lang;

                        setLanguage(lang);

                    }
                );

            });


        /* OUTSIDE CLICK */

        document.addEventListener(
            'click',
            function (e) {

                if (
                    languageDropdown &&
                    !languageDropdown.contains(
                        e.target
                    )
                ) {

                    langMenu.classList.remove(
                        'show'
                    );

                    langBtn.setAttribute(
                        'aria-expanded',
                        'false'
                    );

                }

            }
        );

    }


    /* =========================================================
       ESCAPE
    ========================================================= */

    function initEscape() {

        document.addEventListener(
            'keydown',
            function (e) {

                if (
                    e.key !== 'Escape' &&
                    e.key !== 'Esc'
                ) {
                    return;
                }


                const profileMenu =
                    getElement('profileMenu');

                const profileBtn =
                    getElement('profileBtn');


                const langMenu =
                    getElement('langMenu');

                const langBtn =
                    getElement('langBtn');


                if (profileMenu) {

                    profileMenu.classList.remove(
                        'show'
                    );

                }


                if (profileBtn) {

                    profileBtn.setAttribute(
                        'aria-expanded',
                        'false'
                    );

                }


                if (langMenu) {

                    langMenu.classList.remove(
                        'show'
                    );

                }


                if (langBtn) {

                    langBtn.setAttribute(
                        'aria-expanded',
                        'false'
                    );

                }

            }
        );

    }


    /* =========================================================
       MOBILE SIDEBAR BUTTON
    ========================================================= */

    function initMenuButton() {

        const menuBtn =
            getElement('menuBtn');


        if (!menuBtn) {
            return;
        }


        menuBtn.addEventListener(
            'click',
            function (e) {

                e.preventDefault();

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


    /* =========================================================
       SUPPORT TICKET
    ========================================================= */

    function initSupportTicket() {

        const button =
            getElement(
                'openSupportTicketBtn'
            );


        if (!button) {
            return;
        }


        button.addEventListener(
            'click',
            function () {

                /* 
                   Route is intentionally kept simple.
                   Actual ticket module can be connected later.
                */

            }
        );

    }


    /* =========================================================
       MESSAGES
    ========================================================= */

    function initMessages() {

        const messagesBtn =
            getElement('messagesBtn');


        if (!messagesBtn) {
            return;
        }


        messagesBtn.addEventListener(
            'click',
            function () {

                if (
                    typeof window.openMessages ===
                    'function'
                ) {

                    window.openMessages();

                    return;
                }


                /*
                   Do not invent message module behavior.
                   Existing page-specific message functionality
                   can define window.openMessages().
                */

            }
        );

    }


    /* =========================================================
       TOPBAR CUSTOMER SEARCH
    ========================================================= */

    function initCustomerSearch() {

        const search =
            getElement(
                'topbarCustomerSearch'
            );


        if (!search) {
            return;
        }


        search.addEventListener(
            'keydown',
            function (e) {

                if (e.key !== 'Enter') {
                    return;
                }


                const value =
                    search.value.trim();


                if (!value) {
                    return;
                }


                /*
                   If customer list page exists,
                   pass search through URL.
                */

                window.location.href =
                    '/customers?search=' +
                    encodeURIComponent(value);

            }
        );

    }


    /* =========================================================
       LOGOUT
    ========================================================= */

    function initLogout() {

        const logoutBtn =
            getElement('logoutBtn');


        if (!logoutBtn) {
            return;
        }


        logoutBtn.addEventListener(
            'click',
            async function (e) {

                e.preventDefault();


                try {

                    const response =
                        await fetch(
                            '/api/auth/logout',
                            {
                                method: 'POST',
                                credentials: 'same-origin',
                                headers: {
                                    'Accept':
                                        'application/json'
                                }
                            }
                        );


                    if (
                        response.ok
                    ) {

                        window.location.href =
                            '/';

                        return;

                    }

                } catch (error) {

                    console.error(
                        'Logout error:',
                        error
                    );

                }


                window.location.href =
                    '/';

            }
        );

    }


    /* =========================================================
       INIT TOPBAR
    ========================================================= */

    function initTopbar() {

        const lang =
            getCurrentLanguage();


        updateLanguageUI(
            lang
        );


        initProfile();

        initLanguage();

        initEscape();

        initMenuButton();

        initSupportTicket();

        initMessages();

        initCustomerSearch();

        initLogout();

        loadTopbarUser();

    }


    /* =========================================================
       START
    ========================================================= */

    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            initTopbar,
            {
                once: true
            }
        );

    } else {

        initTopbar();

    }

})();