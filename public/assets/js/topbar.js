(function () {

    'use strict';

    /* =========================================================
       LOAD APP TOAST ONCE
    ========================================================= */

    function loadAppToast() {
        return new Promise(function (resolve) {

            // Toast already loaded
            if (window.AppToast) {
                resolve(true);
                return;
            }

            // Script is already loading
            let existingScript = document.querySelector(
                'script[data-app-toast]'
            );

            if (existingScript) {
                existingScript.addEventListener(
                    'load',
                    function () {
                        resolve(!!window.AppToast);
                    },
                    { once: true }
                );

                existingScript.addEventListener(
                    'error',
                    function () {
                        resolve(false);
                    },
                    { once: true }
                );

                return;
            }

            const script = document.createElement('script');

            script.src = '/assets/js/app-toast.js';
            script.dataset.appToast = 'true';
            script.async = true;

            script.onload = function () {
                resolve(!!window.AppToast);
            };

            script.onerror = function () {
                console.error('App Toast script load failed.');
                resolve(false);
            };

            document.head.appendChild(script);
        });
    }
    /* =========================================================
       PREVENT DUPLICATE INITIALIZATION
    ========================================================= */

    if (window.__ispBillingTopbarInitialized) {
        return;
    }

    window.__ispBillingTopbarInitialized = true;


    /* =========================================================
       HELPER
    ========================================================= */

    function getElement(id) {
        return document.getElementById(id);
    }


    /* =========================================================
       USER
    ========================================================= */

    async function loadTopbarUser() {

        try {

            const response = await fetch(
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
                getElement(
                    'profileFullname'
                );


            const roleElement =
                getElement(
                    'profileRole'
                );


            const avatarElement =
                getElement(
                    'profileAvatar'
                );


            if (fullnameElement) {

                fullnameElement.textContent =
                    fullname || 'User';

            }


            if (roleElement) {

                roleElement.textContent =
                    role || '-';

            }


            if (avatarElement) {

                const firstLetter =
                    fullname
                        ? Array.from(fullname)[0]
                        : 'A';


                avatarElement.textContent =
                    firstLetter.toUpperCase();

                // topbarAvatarPhoto: show the profile photo when the API has one
                const photoUrl = String(
                    user.photo || user.avatar || user.image ||
                    user.profile_image || user.profile_photo ||
                    user.picture || ''
                ).trim().replace(/["'\\\n\r]/g, '');

                if (/^(\/|https?:\/\/)/i.test(photoUrl)) {
                    avatarElement.style.backgroundImage =
                        'url("' + photoUrl + '")';
                    avatarElement.classList.add('has-photo');
                    avatarElement.textContent = '';
                }

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
            getElement(
                'profileBtn'
            );


        const profileMenu =
            getElement(
                'profileMenu'
            );


        const profileContainer =
            getElement(
                'profileContainer'
            );


        if (
            !profileBtn ||
            !profileMenu
        ) {
            return;
        }


        if (
            profileBtn.dataset.bound ===
            'true'
        ) {
            return;
        }


        profileBtn.dataset.bound =
            'true';


        profileBtn.addEventListener(
            'click',
            function (event) {

                event.preventDefault();

                event.stopPropagation();


                const langMenu =
                    getElement(
                        'langMenu'
                    );


                const colorPanel =
                    getElement(
                        'netfeeColorPanel'
                    );


                if (langMenu) {

                    langMenu.classList.remove(
                        'show'
                    );

                }


                if (colorPanel) {

                    colorPanel.classList.remove(
                        'show'
                    );

                }


                profileMenu.classList.toggle(
                    'show'
                );


                profileBtn.setAttribute(
                    'aria-expanded',
                    profileMenu.classList.contains(
                        'show'
                    )
                        ? 'true'
                        : 'false'
                );

            }
        );


        document.addEventListener(
            'click',
            function (event) {

                if (
                    profileContainer &&
                    !profileContainer.contains(
                        event.target
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
            getElement(
                'langBtn'
            );


        const langMenu =
            getElement(
                'langMenu'
            );


        const languageDropdown =
            getElement(
                'languageDropdown'
            );


        if (
            !langBtn ||
            !langMenu
        ) {
            return;
        }


        if (
            langBtn.dataset.bound ===
            'true'
        ) {
            return;
        }


        langBtn.dataset.bound =
            'true';


        const savedLanguage =
            localStorage.getItem(
                'ispbilling_lang'
            ) || 'en';


        updateLanguageUI(
            savedLanguage
        );


        langBtn.addEventListener(
            'click',
            function (event) {

                event.preventDefault();

                event.stopPropagation();


                const profileMenu =
                    getElement(
                        'profileMenu'
                    );


                const colorPanel =
                    getElement(
                        'netfeeColorPanel'
                    );


                if (profileMenu) {

                    profileMenu.classList.remove(
                        'show'
                    );

                }


                if (colorPanel) {

                    colorPanel.classList.remove(
                        'show'
                    );

                }


                langMenu.classList.toggle(
                    'show'
                );

            }
        );


        langMenu
            .querySelectorAll(
                'a[data-lang]'
            )
            .forEach(
                function (link) {

                    link.addEventListener(
                        'click',
                        function (event) {

                            event.preventDefault();

                            event.stopPropagation();


                            const language =
                                link.getAttribute(
                                    'data-lang'
                                );


                            localStorage.setItem(
                                'ispbilling_lang',
                                language
                            );


                            updateLanguageUI(
                                language
                            );


                            langMenu.classList.remove(
                                'show'
                            );

                        }
                    );

                }
            );


        document.addEventListener(
            'click',
            function (event) {

                if (
                    languageDropdown &&
                    !languageDropdown.contains(
                        event.target
                    )
                ) {

                    langMenu.classList.remove(
                        'show'
                    );

                }

            }
        );

    }


    function updateLanguageUI(language) {

        const langBtn =
            getElement(
                'langBtn'
            );


        if (langBtn) {

            langBtn.innerHTML =
                language === 'bn'
                    ? 'বাংলা <i class="fas fa-caret-down"></i>'
                    : 'EN <i class="fas fa-caret-down"></i>';

        }


        const search =
            getElement(
                'topbarCustomerSearch'
            );


        if (search) {

            search.placeholder =
                language === 'bn'
                    ? 'কাস্টমার খুঁজুন...'
                    : 'Search customer...';

        }

    }


    /* =========================================================
       THEME CONFIG
    ========================================================= */

    const themes = {

        blue: {
            accent: '#2563eb',
            accentHover: '#1d4ed8',
            accentSoft: '#dbeafe'
        },

        purple: {
            accent: '#7c3aed',
            accentHover: '#6d28d9',
            accentSoft: '#ede9fe'
        },

        green: {
            accent: '#16a34a',
            accentHover: '#15803d',
            accentSoft: '#dcfce7'
        },

        orange: {
            accent: '#ea580c',
            accentHover: '#c2410c',
            accentSoft: '#ffedd5'
        },

        red: {
            accent: '#dc2626',
            accentHover: '#b91c1c',
            accentSoft: '#fee2e2'
        },

        cyan: {
            accent: '#0891b2',
            accentHover: '#0e7490',
            accentSoft: '#cffafe'
        },

        pink: {
            accent: '#db2777',
            accentHover: '#be185d',
            accentSoft: '#fce7f3'
        },

        amber: {
            accent: '#d97706',
            accentHover: '#b45309',
            accentSoft: '#fef3c7'
        }

    };


    /* netfeeMakeTheme: build a theme from any colour */
    function netfeeHexToHsl(hex) {
        let h = String(hex).replace('#', '');
        if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
        const r = parseInt(h.substr(0, 2), 16) / 255;
        const g = parseInt(h.substr(2, 2), 16) / 255;
        const b = parseInt(h.substr(4, 2), 16) / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) / 2;
        const d = max - min;
        let hue = 0;
        let s = 0;
        if (d !== 0) {
            s = d / (1 - Math.abs(2 * l - 1));
            if (max === r) { hue = ((g - b) / d) % 6; }
            else if (max === g) { hue = (b - r) / d + 2; }
            else { hue = (r - g) / d + 4; }
            hue = Math.round(hue * 60);
            if (hue < 0) { hue += 360; }
        }
        return { h: hue, s: s, l: l };
    }

    function netfeeHslToHex(h, s, l) {
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;
        let r = 0; let g = 0; let b = 0;
        if (h < 60) { r = c; g = x; }
        else if (h < 120) { r = x; g = c; }
        else if (h < 180) { g = c; b = x; }
        else if (h < 240) { g = x; b = c; }
        else if (h < 300) { r = x; b = c; }
        else { r = c; b = x; }
        const hex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
        return '#' + hex(r) + hex(g) + hex(b);
    }

    function netfeeMakeTheme(name, accent) {
        const hsl = netfeeHexToHsl(accent);
        return {
            name: name,
            accent: accent,
            accentHover: netfeeHslToHex(hsl.h, hsl.s, Math.max(0.15, hsl.l - 0.08)),
            accentSoft: netfeeHslToHex(hsl.h, Math.min(0.95, Math.max(0.4, hsl.s)), 0.93)
        };
    }

    const extraThemes = {
        teal: ['Teal', '#0d9488'],
        indigo: ['Indigo', '#4f46e5'],
        rose: ['Rose', '#e11d48'],
        lime: ['Lime', '#65a30d'],
        sky: ['Sky', '#0284c7'],
        emerald: ['Emerald', '#059669'],
        fuchsia: ['Fuchsia', '#c026d3'],
        slate: ['Slate', '#475569'],
        brown: ['Brown', '#92400e'],
        violet: ['Violet', '#8b5cf6'],
        navy: ['Navy', '#1e3a8a']
    };

    Object.keys(extraThemes).forEach(function (key) {
        themes[key] = netfeeMakeTheme(extraThemes[key][0], extraThemes[key][1]);
    });

    function netfeeCustomColor() {
        let saved = '';
        try { saved = localStorage.getItem('ispbilling_custom_color') || ''; } catch (e) { saved = ''; }
        return /^#[0-9a-f]{6}$/i.test(saved) ? saved : '#2563eb';
    }




    /* =========================================================
       APPLY COLOR THEME
    ========================================================= */

    function applyColorTheme(themeName) {

        let theme;

        if (themeName === 'custom') {
            theme = netfeeMakeTheme('Custom', netfeeCustomColor());
        } else {
            if (!themes[themeName]) {
                themeName = 'blue';
            }

            theme = themes[themeName];
        }


        document.documentElement.style.setProperty(
            '--theme-primary',
            theme.accent
        );


        document.documentElement.style.setProperty(
            '--theme-primary-hover',
            theme.accentHover
        );


        document.documentElement.style.setProperty(
            '--theme-primary-soft',
            theme.accentSoft
        );


        document.documentElement.setAttribute(
            'data-color-theme',
            themeName
        );


        localStorage.setItem(
            'ispbilling_color_theme',
            themeName
        );


        /*
         * CSS class অনুযায়ী active button
         */

        document
            .querySelectorAll(
                '.netfee-color-option'
            )
            .forEach(
                function (item) {

                    item.classList.remove(
                        'active'
                    );

                }
            );


        /*
         * Existing HTML/old class support
         */

        document
            .querySelectorAll(
                '.netfee-color'
            )
            .forEach(
                function (item) {

                    item.classList.remove(
                        'active'
                    );

                }
            );


        const selected =
            document.querySelector(
                '.netfee-color-option[data-color-theme="' +
                themeName +
                '"]'
            );


        if (selected) {

            selected.classList.add(
                'active'
            );

        }


        const oldSelected =
            document.querySelector(
                '.netfee-color[data-theme="' +
                themeName +
                '"]'
            );


        if (oldSelected) {

            oldSelected.classList.add(
                'active'
            );

        }

    }


    /* =========================================================
       APPLY DAY / NIGHT MODE
    ========================================================= */

    function applyMode(mode) {

        const isDark =
            mode === 'dark';


        if (isDark) {

            document.body.classList.add(
                'dark-mode'
            );

            document.body.classList.remove(
                'light-mode'
            );

        } else {

            document.body.classList.remove(
                'dark-mode'
            );

            document.body.classList.add(
                'light-mode'
            );

        }


        localStorage.setItem(
            'ispbilling_theme_mode',
            isDark
                ? 'dark'
                : 'light'
        );


        updateThemeToggleIcon(
            isDark
                ? 'dark'
                : 'light'
        );

    }


    /* =========================================================
       UPDATE DAY / NIGHT ICON
    ========================================================= */

    function updateThemeToggleIcon(mode) {

        const themeToggle =
            getElement(
                'themeToggle'
            );


        if (!themeToggle) {
            return;
        }


        const icon =
            themeToggle.querySelector(
                'i'
            );


        if (!icon) {
            return;
        }


        if (mode === 'dark') {

            icon.className =
                'fas fa-sun';


            themeToggle.title =
                'Light Mode';


            themeToggle.setAttribute(
                'aria-label',
                'Switch to Light Mode'
            );

        } else {

            icon.className =
                'fas fa-moon';


            themeToggle.title =
                'Dark Mode';


            themeToggle.setAttribute(
                'aria-label',
                'Switch to Dark Mode'
            );

        }

    }


    /* =========================================================
       DAY / NIGHT BUTTON
       
       themeToggle = ONLY DAY/NIGHT
    ========================================================= */

    function initThemeToggle() {

        const themeToggle =
            getElement(
                'themeToggle'
            );


        if (!themeToggle) {
            return;
        }


        if (
            themeToggle.dataset.modeBound ===
            'true'
        ) {
            return;
        }


        themeToggle.dataset.modeBound =
            'true';


        themeToggle.addEventListener(
            'click',
            function (event) {

                event.preventDefault();

                event.stopPropagation();

                event.stopImmediatePropagation();


                const currentMode =
                    localStorage.getItem(
                        'ispbilling_theme_mode'
                    ) ||
                    (
                        document.body.classList.contains(
                            'dark-mode'
                        )
                            ? 'dark'
                            : 'light'
                    );


                const nextMode =
                    currentMode === 'dark'
                        ? 'light'
                        : 'dark';


                applyMode(
                    nextMode
                );


                /*
                 * Close color panel
                 */

                const colorPanel =
                    getElement(
                        'netfeeColorPanel'
                    );


                if (colorPanel) {

                    colorPanel.classList.remove(
                        'show'
                    );

                }

            }
        );

    }


    /* =========================================================
       COLOR PANEL
       
       IMPORTANT:
       CSS ID = #netfeeColorPanel
       ========================================================= */

    function initColorPanel() {

        const colorThemeToggle =
            getElement(
                'colorThemeToggle'
            );


        if (!colorThemeToggle) {
            return;
        }


        if (
            colorThemeToggle.dataset.colorPanelBound ===
            'true'
        ) {
            return;
        }


        colorThemeToggle.dataset.colorPanelBound =
            'true';


        /*
         * Find existing panel
         */

        let colorPanel =
            getElement(
                'netfeeColorPanel'
            );


        /*
         * If panel does not exist,
         * create it.
         */

        if (!colorPanel) {

            colorPanel =
                document.createElement(
                    'div'
                );


            colorPanel.id =
                'netfeeColorPanel';


            colorPanel.innerHTML = `

                <div class="netfee-color-panel-header">

                    <div>

                        <strong>
                            Theme Color
                        </strong>

                        <small>
                            Customize dashboard color
                        </small>

                    </div>


                    <button
                        type="button"
                        id="closeNetfeeColorPanel"
                        aria-label="Close">

                        <i class="fas fa-times"></i>

                    </button>

                </div>


                <div class="netfee-theme-mode-buttons">

                    <button
                        type="button"
                        data-theme-mode="light">

                        <i class="fas fa-sun"></i>

                        Light

                    </button>


                    <button
                        type="button"
                        data-theme-mode="dark">

                        <i class="fas fa-moon"></i>

                        Dark

                    </button>

                </div>


                <div class="netfee-color-title">
                    Color
                </div>


                <div class="netfee-color-options">

                    <button
                        type="button"
                        class="netfee-color-option"
                        data-color-theme="blue">

                        <span
                            style="background:#2563eb">
                        </span>

                        <small>
                            Blue
                        </small>

                    </button>


                    <button
                        type="button"
                        class="netfee-color-option"
                        data-color-theme="purple">

                        <span
                            style="background:#7c3aed">
                        </span>

                        <small>
                            Purple
                        </small>

                    </button>


                    <button
                        type="button"
                        class="netfee-color-option"
                        data-color-theme="green">

                        <span
                            style="background:#16a34a">
                        </span>

                        <small>
                            Green
                        </small>

                    </button>


                    <button
                        type="button"
                        class="netfee-color-option"
                        data-color-theme="orange">

                        <span
                            style="background:#ea580c">
                        </span>

                        <small>
                            Orange
                        </small>

                    </button>


                    <button
                        type="button"
                        class="netfee-color-option"
                        data-color-theme="red">

                        <span
                            style="background:#dc2626">
                        </span>

                        <small>
                            Red
                        </small>

                    </button>


                    <button
                        type="button"
                        class="netfee-color-option"
                        data-color-theme="cyan">

                        <span
                            style="background:#0891b2">
                        </span>

                        <small>
                            Cyan
                        </small>

                    </button>


                    <button
                        type="button"
                        class="netfee-color-option"
                        data-color-theme="pink">

                        <span
                            style="background:#db2777">
                        </span>

                        <small>
                            Pink
                        </small>

                    </button>


                    <button
                        type="button"
                        class="netfee-color-option"
                        data-color-theme="amber">

                        <span
                            style="background:#d97706">
                        </span>

                        <small>
                            Amber
                        </small>

                    </button>

                </div>

            `;


            /*
             * CSS uses position:fixed.
             * So body is correct.
             */

            document.body.appendChild(
                colorPanel
            );

            // netfeeMakeTheme: more colours + custom picker
            const optionsBox = colorPanel.querySelector('.netfee-color-options');

            if (optionsBox) {
                Object.keys(extraThemes).forEach(function (key) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'netfee-color-option';
                    btn.setAttribute('data-color-theme', key);
                    btn.innerHTML = '<span style="background:' + themes[key].accent + '"></span><small>' + themes[key].name + '</small>';
                    optionsBox.appendChild(btn);
                });

                const custom = document.createElement('button');
                custom.type = 'button';
                custom.className = 'netfee-color-option';
                custom.setAttribute('data-color-theme', 'custom');
                custom.title = 'Pick any colour';
                custom.innerHTML = '<span style="background:conic-gradient(red,yellow,lime,aqua,blue,magenta,red)"></span><small>Custom</small>';
                optionsBox.appendChild(custom);

                const picker = document.createElement('input');
                picker.type = 'color';
                picker.id = 'netfeeCustomColor';
                picker.value = netfeeCustomColor();
                picker.setAttribute('aria-label', 'Custom colour');
                picker.className = 'netfee-custom-picker';
                colorPanel.appendChild(picker);

                custom.addEventListener('click', function () {
                    picker.value = netfeeCustomColor();
                    picker.click();
                });

                picker.addEventListener('input', function () {
                    try { localStorage.setItem('ispbilling_custom_color', picker.value); } catch (e) { /* ignore */ }
                    applyColorTheme('custom');
                });
            }

        }


        /* =====================================================
           OPEN / CLOSE COLOR PANEL
        ===================================================== */

        colorThemeToggle.addEventListener(
            'click',
            function (event) {

                event.preventDefault();

                event.stopPropagation();

                event.stopImmediatePropagation();


                const profileMenu =
                    getElement(
                        'profileMenu'
                    );


                const langMenu =
                    getElement(
                        'langMenu'
                    );


                if (profileMenu) {

                    profileMenu.classList.remove(
                        'show'
                    );

                }


                if (langMenu) {

                    langMenu.classList.remove(
                        'show'
                    );

                }


                colorPanel.classList.toggle(
                    'show'
                );

            }
        );


        /* =====================================================
           CLOSE BUTTON
        ===================================================== */

        const closeButton =
            getElement(
                'closeNetfeeColorPanel'
            );


        if (closeButton) {

            closeButton.addEventListener(
                'click',
                function (event) {

                    event.preventDefault();

                    event.stopPropagation();


                    colorPanel.classList.remove(
                        'show'
                    );

                }
            );

        }


        /* =====================================================
           LIGHT BUTTON
        ===================================================== */

        const lightBtn =
            colorPanel.querySelector(
                '[data-theme-mode="light"]'
            );


        if (lightBtn) {

            lightBtn.addEventListener(
                'click',
                function (event) {

                    event.preventDefault();

                    event.stopPropagation();


                    applyMode(
                        'light'
                    );

                }
            );

        }


        /* =====================================================
           DARK BUTTON
        ===================================================== */

        const darkBtn =
            colorPanel.querySelector(
                '[data-theme-mode="dark"]'
            );


        if (darkBtn) {

            darkBtn.addEventListener(
                'click',
                function (event) {

                    event.preventDefault();

                    event.stopPropagation();


                    applyMode(
                        'dark'
                    );

                }
            );

        }


        /* =====================================================
           COLOR BUTTONS
        ===================================================== */

        colorPanel
            .querySelectorAll(
                '.netfee-color-option'
            )
            .forEach(
                function (button) {

                    button.addEventListener(
                        'click',
                        function (event) {

                            event.preventDefault();

                            event.stopPropagation();


                            const selectedTheme =
                                button.getAttribute(
                                    'data-color-theme'
                                );


                            applyColorTheme(
                                selectedTheme
                            );

                        }
                    );

                }
            );


        /* =====================================================
           OUTSIDE CLICK
        ===================================================== */

        document.addEventListener(
            'click',
            function (event) {

                if (
                    !colorPanel.contains(
                        event.target
                    ) &&
                    !colorThemeToggle.contains(
                        event.target
                    )
                ) {

                    colorPanel.classList.remove(
                        'show'
                    );

                }

            }
        );

    }


    /* =========================================================
       MESSAGES
    ========================================================= */

    function initMessages() {

        const messagesBtn =
            getElement(
                'messagesBtn'
            );


        if (!messagesBtn) {
            return;
        }


        if (
            messagesBtn.dataset.bound ===
            'true'
        ) {
            return;
        }


        messagesBtn.dataset.bound =
            'true';


        messagesBtn.addEventListener(
            'click',
            function (event) {

                event.preventDefault();


                if (
                    typeof window.openMessages ===
                    'function'
                ) {

                    window.openMessages();

                    return;

                }


                window.location.href =
                    '/message/log';

            }
        );

    }


    /* =========================================================
       CUSTOMER SEARCH
    ========================================================= */

    function initCustomerSearch() {

        const search =
            getElement(
                'topbarCustomerSearch'
            );


        if (!search) {
            return;
        }


        if (
            search.dataset.bound ===
            'true'
        ) {
            return;
        }


        search.dataset.bound =
            'true';


        search.addEventListener(
            'keydown',
            function (event) {

                if (
                    event.key !== 'Enter'
                ) {
                    return;
                }


                const value =
                    search.value.trim();


                if (!value) {
                    return;
                }


                window.location.href =
                    '/customers?search=' +
                    encodeURIComponent(
                        value
                    );

            }
        );

    }


    /* =========================================================
       LOGOUT
    ========================================================= */

function initLogout() {

    const logoutBtn = getElement('logoutBtn');

    if (!logoutBtn) {
        return;
    }

    if (logoutBtn.dataset.bound === 'true') {
        return;
    }

    logoutBtn.dataset.bound = 'true';

    logoutBtn.addEventListener('click', async function (event) {

        event.preventDefault();

        if (logoutBtn.dataset.loggingOut === 'true') {
            return;
        }

        logoutBtn.dataset.loggingOut = 'true';

        try {

            // প্রথমে বর্তমান session-এর CSRF token নিন
            const csrfResponse = await fetch('/api/auth/csrf', {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!csrfResponse.ok) {
                throw new Error('CSRF token পাওয়া যায়নি।');
            }

            const csrfData = await csrfResponse.json();
            const csrfToken = csrfData.csrf_token;

            if (!csrfData.success || !csrfToken) {
                throw new Error('CSRF token অনুপস্থিত।');
            }

            // CSRF token সহ Logout request
            const response = await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({
                    csrf_token: csrfToken
                })
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || 'Logout ব্যর্থ হয়েছে।'
                );
            }

            window.location.replace('/');

        } catch (error) {

            console.error('Logout error:', error);

            alert(
                'Logout হয়নি: ' +
                (error.message || 'আবার চেষ্টা করুন।')
            );

            delete logoutBtn.dataset.loggingOut;
        }

    });

}



    /* =========================================================
       ESCAPE
    ========================================================= */

    function initEscape() {

        if (
            window.__ispBillingTopbarEscapeBound
        ) {
            return;
        }


        window.__ispBillingTopbarEscapeBound =
            true;


        document.addEventListener(
            'keydown',
            function (event) {

                if (
                    event.key !== 'Escape' &&
                    event.key !== 'Esc'
                ) {
                    return;
                }


                const profileMenu =
                    getElement(
                        'profileMenu'
                    );


                const langMenu =
                    getElement(
                        'langMenu'
                    );


                const colorPanel =
                    getElement(
                        'netfeeColorPanel'
                    );


                if (profileMenu) {

                    profileMenu.classList.remove(
                        'show'
                    );

                }


                if (langMenu) {

                    langMenu.classList.remove(
                        'show'
                    );

                }


                if (colorPanel) {

                    colorPanel.classList.remove(
                        'show'
                    );

                }


                if (
                    window.innerWidth <= 850
                ) {

                    const sidebar =
                        document.querySelector(
                            '.sidebar'
                        );


                    const menuBtn =
                        getElement(
                            'menuBtn'
                        );


                    if (sidebar) {

                        sidebar.classList.remove(
                            'active'
                        );

                    }


                    if (menuBtn) {

                        menuBtn.classList.remove(
                            'active'
                        );


                        menuBtn.setAttribute(
                            'aria-expanded',
                            'false'
                        );

                    }

                }

            }
        );

    }


    /* =========================================================
       INIT
    ========================================================= */

    function initTopbar() {

        initProfile();

        initLanguage();

        initThemeToggle();

        initColorPanel();

        initMessages();

        initCustomerSearch();

        initLogout();

        initEscape();

        loadTopbarUser();


        /* =====================================================
           RESTORE SAVED COLOR
        ===================================================== */

        const savedColor =
            localStorage.getItem(
                'ispbilling_color_theme'
            ) || 'blue';


        applyColorTheme(
            savedColor
        );


        /* =====================================================
           RESTORE SAVED MODE
        ===================================================== */

        const savedMode =
            localStorage.getItem(
                'ispbilling_theme_mode'
            ) || 'light';


        applyMode(
            savedMode
        );

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


    /* =========================================================
       OPTIONAL GLOBAL ACCESS
    ========================================================= */

    window.applyColorTheme =
        applyColorTheme;

    window.applyMode =
        applyMode;

    window.initTopbar =
        initTopbar;


})();