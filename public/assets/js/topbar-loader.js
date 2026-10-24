(function () {

    'use strict';


    async function loadTopbar() {

        const container =
            document.getElementById(
                'topbarContainer'
            );


        if (!container) {
            return;
        }


        try {

            const response =
                await fetch(
                    '/partials/topbar.html',
                    {
                        credentials:
                            'same-origin'
                    }
                );


            if (!response.ok) {

                throw new Error(
                    'Topbar HTTP ' +
                    response.status
                );

            }


            const html =
                await response.text();


            container.innerHTML =
                html;


            /* =================================================
               LOAD TOPBAR CSS
            ================================================= */

            if (
                !document.querySelector(
                    'link[data-topbar-css]'
                )
            ) {

                const css =
                    document.createElement(
                        'link'
                    );

                css.rel =
                    'stylesheet';

                css.href =
                    '/assets/css/topbar.css';

                css.dataset.topbarCss =
                    'true';

                document.head.appendChild(
                    css
                );

            }


            /* =================================================
               LOAD TOPBAR JS
            ================================================= */

            if (
                !document.querySelector(
                    'script[data-topbar-js]'
                )
            ) {

                const script =
                    document.createElement(
                        'script'
                    );

                script.src =
                    '/assets/js/topbar.js';

                script.dataset.topbarJs =
                    'true';

                document.body.appendChild(
                    script
                );

            }

        } catch (error) {

            console.error(
                'Topbar loading error:',
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
            loadTopbar,
            {
                once: true
            }
        );

    } else {

        loadTopbar();

    }

})();