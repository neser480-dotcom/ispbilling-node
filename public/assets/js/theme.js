
document.addEventListener('DOMContentLoaded', function () {

    const themeToggle = document.getElementById('themeToggle');

    if (!themeToggle) {
        return;
    }

    /* =========================================================
       THEME CONFIG
    ========================================================= */

    const themes = {
        blue: {
            name: 'Blue',
            accent: '#2563eb',
            accentHover: '#1d4ed8',
            accentSoft: '#dbeafe'
        },

        purple: {
            name: 'Purple',
            accent: '#7c3aed',
            accentHover: '#6d28d9',
            accentSoft: '#ede9fe'
        },

        green: {
            name: 'Green',
            accent: '#16a34a',
            accentHover: '#15803d',
            accentSoft: '#dcfce7'
        },

        orange: {
            name: 'Orange',
            accent: '#ea580c',
            accentHover: '#c2410c',
            accentSoft: '#ffedd5'
        },

        red: {
            name: 'Red',
            accent: '#dc2626',
            accentHover: '#b91c1c',
            accentSoft: '#fee2e2'
        },

        cyan: {
            name: 'Cyan',
            accent: '#0891b2',
            accentHover: '#0e7490',
            accentSoft: '#cffafe'
        },

        pink: {
            name: 'Pink',
            accent: '#db2777',
            accentHover: '#be185d',
            accentSoft: '#fce7f3'
        },

        amber: {
            name: 'Amber',
            accent: '#d97706',
            accentHover: '#b45309',
            accentSoft: '#fef3c7'
        }
    };


    /* =========================================================
       STORAGE
    ========================================================= */

    const savedTheme =
        localStorage.getItem('ispbilling_color_theme') || 'blue';

    const savedMode =
        localStorage.getItem('ispbilling_theme_mode') || 'light';


    /* =========================================================
       APPLY COLOR
    ========================================================= */

    function applyColorTheme(themeName) {

        if (!themes[themeName]) {
            themeName = 'blue';
        }

        const theme = themes[themeName];

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
    }


    /* =========================================================
       APPLY LIGHT / DARK
    ========================================================= */

    function applyMode(mode) {

        if (mode === 'dark') {

            document.body.classList.add('dark-mode');

            themeToggle.innerHTML =
                '<i class="fas fa-sun"></i>';

            themeToggle.title = 'Light Mode';

        } else {

            document.body.classList.remove('dark-mode');

            themeToggle.innerHTML =
                '<i class="fas fa-moon"></i>';

            themeToggle.title = 'Dark Mode';
        }

        localStorage.setItem(
            'ispbilling_theme_mode',
            mode
        );
    }


    /* =========================================================
       CREATE COLOR PANEL
    ========================================================= */

    let themePanel = document.getElementById('netfeeThemePanel');

    if (!themePanel) {

        themePanel = document.createElement('div');

        themePanel.id = 'netfeeThemePanel';

        themePanel.innerHTML = `
            <div class="netfee-theme-title">
                <span>Theme Color</span>
                <button type="button" id="closeThemePanel">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div class="netfee-theme-mode">
                <button type="button" id="themeLightBtn">
                    <i class="fas fa-sun"></i>
                    Light
                </button>

                <button type="button" id="themeDarkBtn">
                    <i class="fas fa-moon"></i>
                    Dark
                </button>
            </div>

            <div class="netfee-color-grid">

                <button
                    type="button"
                    class="netfee-color blue"
                    data-theme="blue"
                    title="Blue">
                    <span></span>
                    <small>Blue</small>
                </button>

                <button
                    type="button"
                    class="netfee-color purple"
                    data-theme="purple"
                    title="Purple">
                    <span></span>
                    <small>Purple</small>
                </button>

                <button
                    type="button"
                    class="netfee-color green"
                    data-theme="green"
                    title="Green">
                    <span></span>
                    <small>Green</small>
                </button>

                <button
                    type="button"
                    class="netfee-color orange"
                    data-theme="orange"
                    title="Orange">
                    <span></span>
                    <small>Orange</small>
                </button>

                <button
                    type="button"
                    class="netfee-color red"
                    data-theme="red"
                    title="Red">
                    <span></span>
                    <small>Red</small>
                </button>

                <button
                    type="button"
                    class="netfee-color cyan"
                    data-theme="cyan"
                    title="Cyan">
                    <span></span>
                    <small>Cyan</small>
                </button>

                <button
                    type="button"
                    class="netfee-color pink"
                    data-theme="pink"
                    title="Pink">
                    <span></span>
                    <small>Pink</small>
                </button>

                <button
                    type="button"
                    class="netfee-color amber"
                    data-theme="amber"
                    title="Amber">
                    <span></span>
                    <small>Amber</small>
                </button>

            </div>
        `;

        document.body.appendChild(themePanel);
    }


    /* =========================================================
       OPEN / CLOSE PANEL
    ========================================================= */

    themeToggle.addEventListener('click', function (event) {

        event.stopPropagation();

        themePanel.classList.toggle('show');

    });


    const closeThemePanel =
        document.getElementById('closeThemePanel');

    if (closeThemePanel) {

        closeThemePanel.addEventListener('click', function () {

            themePanel.classList.remove('show');

        });

    }


    /* =========================================================
       LIGHT MODE
    ========================================================= */

    const lightBtn =
        document.getElementById('themeLightBtn');

    if (lightBtn) {

        lightBtn.addEventListener('click', function () {

            applyMode('light');

        });

    }


    /* =========================================================
       DARK MODE
    ========================================================= */

    const darkBtn =
        document.getElementById('themeDarkBtn');

    if (darkBtn) {

        darkBtn.addEventListener('click', function () {

            applyMode('dark');

        });

    }


    /* =========================================================
       COLOR SELECTION
    ========================================================= */

    document
        .querySelectorAll('.netfee-color')
        .forEach(function (button) {

            button.addEventListener('click', function () {

                const selectedTheme =
                    button.getAttribute('data-theme');

                applyColorTheme(selectedTheme);

                document
                    .querySelectorAll('.netfee-color')
                    .forEach(function (item) {
                        item.classList.remove('active');
                    });

                button.classList.add('active');

            });

        });


    /* =========================================================
       CLOSE WHEN CLICKING OUTSIDE
    ========================================================= */

    document.addEventListener('click', function (event) {

        if (
            !themePanel.contains(event.target) &&
            !themeToggle.contains(event.target)
        ) {

            themePanel.classList.remove('show');

        }

    });


    /* =========================================================
       INITIAL LOAD
    ========================================================= */

    applyColorTheme(savedTheme);
    applyMode(savedMode);


    const selectedColor =
        document.querySelector(
            '.netfee-color[data-theme="' + savedTheme + '"]'
        );

    if (selectedColor) {
        selectedColor.classList.add('active');
    }

});