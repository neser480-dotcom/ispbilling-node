(function () {

    'use strict';


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


            container.innerHTML =
                html;


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