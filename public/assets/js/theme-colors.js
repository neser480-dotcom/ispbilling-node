/* theme-colors.js - NetFee: in dark mode the accent (sidebar text) follows the
   chosen theme colour; dark surfaces stay normal dark.
   Reads --theme-primary and sets --dk-accent on <html>. Works with any
   script that changes the theme colour (topbar.js, theme.js). */
(function () {
    'use strict';

    if (window.__netfeeThemeColors) {
        return;
    }

    window.__netfeeThemeColors = true;

    var root = document.documentElement;
    var last = '';

    function hexToHsl(hex) {
        var h = hex.replace('#', '');

        if (h.length === 3) {
            h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
        }

        var r = parseInt(h.substr(0, 2), 16) / 255;
        var g = parseInt(h.substr(2, 2), 16) / 255;
        var b = parseInt(h.substr(4, 2), 16) / 255;
        var max = Math.max(r, g, b);
        var min = Math.min(r, g, b);
        var d = max - min;
        var hue = 0;

        if (d !== 0) {
            if (max === r) { hue = ((g - b) / d) % 6; }
            else if (max === g) { hue = (b - r) / d + 2; }
            else { hue = (r - g) / d + 4; }

            hue = Math.round(hue * 60);

            if (hue < 0) { hue += 360; }
        }

        return hue;
    }

    function hsl(h, s, l) {
        return 'hsl(' + h + ', ' + s + '%, ' + l + '%)';
    }

    function apply() {
        var value = getComputedStyle(root).getPropertyValue('--theme-primary').trim();

        if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) || value === last) {
            return;
        }

        last = value;

        var h = hexToHsl(value);
        var style = root.style;

        style.setProperty('--dk-accent', hsl(h, 90, 70));
    }

    apply();

    document.addEventListener('DOMContentLoaded', apply);

    try {
        new MutationObserver(apply).observe(root, {
            attributes: true,
            attributeFilter: ['style', 'data-color-theme']
        });
    } catch (error) {
        // very old browser: colours are set once on load
    }
})();
