/* theme-colors.js - NetFee
   1) Dark mode: --dk-accent (readable lighter shade of the chosen colour).
   2) Every page: fixed blue colours written in page CSS / inline styles
      (#2563eb, #3b82f6, #1d4ed8 ... and rgba() forms) are re-pointed to the
      chosen theme colour, so ALL pages follow the palette.
   Dark surfaces stay normal dark; only colours change. */
(function () {
    'use strict';

    if (window.__netfeeThemeColors) {
        return;
    }

    window.__netfeeThemeColors = true;

    var root = document.documentElement;
    var last = '';

    /* ---------------- 1) accent for dark mode ---------------- */

    function hexToHue(hex) {
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

    function applyAccent() {
        var value = getComputedStyle(root).getPropertyValue('--theme-primary').trim();

        if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) || value === last) {
            return;
        }

        last = value;

        root.style.setProperty('--dk-accent', 'hsl(' + hexToHue(value) + ', 90%, 70%)');
    }

    applyAccent();

    try {
        new MutationObserver(applyAccent).observe(root, {
            attributes: true,
            attributeFilter: ['style', 'data-color-theme']
        });
    } catch (error) {
        // very old browser: accent is set once
    }

    /* ---------------- 2) re-point fixed blues to the theme ---------------- */

    var PRIMARY = 'var(--theme-primary)';
    var HOVER = 'var(--theme-primary-hover)';
    var SOFT = 'var(--theme-primary-soft)';

    function mix(percent, other) {
        return 'color-mix(in srgb, var(--theme-primary) ' + percent + '%, ' + other + ')';
    }

    var HEX = {
        '2563eb': PRIMARY, '3b82f6': PRIMARY, '0d6efd': PRIMARY, '4e73df': PRIMARY,
        '007bff': PRIMARY, '1976d2': PRIMARY, '1a73e8': PRIMARY, '2f80ed': PRIMARY,
        '3d9ad1': PRIMARY,
        '1d4ed8': HOVER, '1e40af': HOVER, '0b5ed7': HOVER, '0a58ca': HOVER,
        '224abe': HOVER, '2e59d9': HOVER, '0069d9': HOVER,
        '1e3a8a': mix(55, '#000'),
        '60a5fa': mix(65, '#fff'), '93c5fd': mix(45, '#fff'), 'bfdbfe': mix(30, '#fff'),
        'dbeafe': SOFT,
        'eff6ff': mix(8, '#fff'), 'e0f2fe': mix(8, '#fff'), 'e8f1fb': mix(8, '#fff')
    };

    var HEX_RE = new RegExp('#(' + Object.keys(HEX).join('|') + ')\\b', 'gi');
    var RGB_RE = /rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[,\/]\s*([\d.]+%?)\s*)?\)/gi;

    // browsers hand back "#2563eb" as "rgb(37, 99, 235)": map those too
    var RGB = {};

    Object.keys(HEX).forEach(function (hex) {
        RGB[parseInt(hex.substr(0, 2), 16) + ',' + parseInt(hex.substr(2, 2), 16) + ',' + parseInt(hex.substr(4, 2), 16)] = HEX[hex];
    });

    function remap(value) {
        return value
            .replace(HEX_RE, function (match, hex) {
                return HEX[hex.toLowerCase()];
            })
            .replace(RGB_RE, function (match, r, g, b, alpha) {
                var target = RGB[Number(r) + ',' + Number(g) + ',' + Number(b)];

                if (!target) {
                    return match;
                }

                if (alpha === undefined) {
                    return target;
                }

                var a = alpha.indexOf('%') >= 0 ? parseFloat(alpha) : parseFloat(alpha) * 100;

                if (a >= 100) {
                    return target;
                }

                return 'color-mix(in srgb, ' + target.replace(/^var\(--theme-primary\)$/, 'var(--theme-primary)') + ' ' + (Math.round(a * 10) / 10) + '%, transparent)';
            });
    }

    function skipSelector(text) {
        // the colour swatches of the palette must keep their own colours
        return /netfee-color|netfee-theme|netfeeColorPanel|netfeeThemePanel|custom-picker/i.test(text || '');
    }

    function fixStyle(style) {
        var names = [];
        var i;

        for (i = 0; i < style.length; i++) {
            names.push(style[i]);
        }

        names.forEach(function (name) {
            if (name.indexOf('--') === 0) {
                return;
            }

            var value = style.getPropertyValue(name);

            if (!value) {
                return;
            }

            var changed = remap(value);

            if (changed !== value) {
                style.setProperty(name, changed, style.getPropertyPriority(name));
            }
        });
    }

    function fixRules(rules) {
        var i;

        for (i = 0; i < rules.length; i++) {
            var rule = rules[i];

            if (rule.style && !skipSelector(rule.selectorText)) {
                try { fixStyle(rule.style); } catch (error) { /* ignore one rule */ }
            }

            if (rule.cssRules && rule.cssRules.length) {
                fixRules(rule.cssRules);
            }
        }
    }

    function fixSheet(sheet) {
        var rules;

        try {
            rules = sheet.cssRules;
        } catch (error) {
            return; // cross-origin (CDN) sheet: cannot be read
        }

        if (rules) {
            fixRules(rules);
        }
    }

    function fixAllSheets() {
        var i;

        for (i = 0; i < document.styleSheets.length; i++) {
            fixSheet(document.styleSheets[i]);
        }
    }

    var INLINE_SELECTOR = Object.keys(HEX).map(function (hex) {
        return '[style*="#' + hex + '" i]';
    }).concat(Object.keys(RGB).map(function (triple) {
        return '[style*="' + triple.replace(/,/g, ', ') + '"]';
    })).join(',');

    function fixInline() {
        var list;

        try {
            list = document.querySelectorAll(INLINE_SELECTOR);
        } catch (error) {
            return;
        }

        Array.prototype.forEach.call(list, function (element) {
            if (element.closest('#netfeeColorPanel, #netfeeThemePanel')) {
                return;
            }

            var before = element.getAttribute('style') || '';
            var after = remap(before);

            if (after !== before) {
                element.setAttribute('style', after);
            }
        });
    }

    function run() {
        fixAllSheets();
        fixInline();
    }

    run();

    document.addEventListener('DOMContentLoaded', run);
    window.addEventListener('load', run);

    // stylesheets added later -> re-scan sheets; new rows/elements -> inline styles only
    var timer = null;
    var needSheets = false;

    function later(sheets) {
        if (sheets) {
            needSheets = true;
        }

        clearTimeout(timer);

        timer = setTimeout(function () {
            if (needSheets) {
                fixAllSheets();
            }

            needSheets = false;
            fixInline();
        }, 250);
    }

    try {
        new MutationObserver(function (mutations) {
            var i;
            var j;
            var any = false;

            for (i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;

                for (j = 0; j < added.length; j++) {
                    var node = added[j];

                    if (node.nodeType !== 1) {
                        continue;
                    }

                    any = true;

                    if (node.tagName === 'LINK') {
                        node.addEventListener('load', function () { later(true); }, { once: true });
                    } else if (node.tagName === 'STYLE') {
                        later(true);
                    }
                }
            }

            if (any) {
                later(false);
            }
        }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (error) {
        // very old browser: runs on load only
    }
})();
