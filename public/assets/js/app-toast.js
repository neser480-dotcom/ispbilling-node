
"use strict";

(function () {
    if (window.AppToast) return;

    let container = null;
    const recent = new Map();

    function createContainer() {
        if (container && document.body.contains(container)) {
            return container;
        }

        container = document.createElement("div");
        container.id = "appToastContainer";

        Object.assign(container.style, {
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: "99999",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            width: "min(380px, calc(100vw - 32px))",
            pointerEvents: "none"
        });

        document.body.appendChild(container);
        return container;
    }

    function repairMojibake(value) {
        const input = String(value || "");
        const mojibakePattern = /(?:Ã.|Â.|â€|ðŸ|à¦|à§)/g;
        if (!mojibakePattern.test(input)) return input;
        mojibakePattern.lastIndex = 0;

        // Recover UTF-8 bytes that were incorrectly decoded as Latin-1/Windows-1252.
        const windows1252 = {
            0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84,
            0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88,
            0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C,
            0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93,
            0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
            0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
            0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F
        };

        try {
            const bytes = [];
            for (const char of input) {
                const code = char.codePointAt(0);
                const byte = code <= 0xFF ? code : windows1252[code];
                if (byte === undefined) return input;
                bytes.push(byte);
            }

            const decoded = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
            const markersBefore = (input.match(mojibakePattern) || []).length;
            const markersAfter = (decoded.match(mojibakePattern) || []).length;
            return decoded && markersAfter < markersBefore ? decoded : input;
        } catch (_) {
            // Invalid or incomplete byte sequences cannot be repaired safely.
            return input;
        }
    }

    function show(message, type = "error", duration = 4500) {
        const text = repairMojibake(message || "একটি সমস্যা হয়েছে।").trim();
        if (!text) return;

        const key = type + ":" + text;
        const now = Date.now();

        if (recent.has(key) && now - recent.get(key) < 1800) {
            return;
        }

        recent.set(key, now);

        for (const [itemKey, time] of recent) {
            if (now - time > 10000) recent.delete(itemKey);
        }

        const root = createContainer();
        const toast = document.createElement("div");

        const colors = {
            success: "#15803d",
            error: "#b91c1c",
            warning: "#a16207",
            info: "#1d4ed8"
        };

        toast.setAttribute("role", "status");

        Object.assign(toast.style, {
            background: "#ffffff",
            color: "#1f2937",
            borderLeft: "5px solid " + (colors[type] || colors.error),
            borderRadius: "10px",
            boxShadow: "0 8px 28px rgba(0,0,0,.18)",
            padding: "14px 16px",
            fontSize: "14px",
            lineHeight: "1.55",
            overflowWrap: "anywhere",
            pointerEvents: "auto",
            opacity: "0",
            transform: "translateX(12px)",
            transition: "opacity .2s ease, transform .2s ease"
        });

        const heading = document.createElement("div");
        heading.textContent = ({
            success: "সফল",
            error: "সমস্যা হয়েছে",
            warning: "সতর্কতা",
            info: "তথ্য"
        })[type] || "সমস্যা হয়েছে";

        heading.style.fontWeight = "700";
        heading.style.marginBottom = "4px";

        const body = document.createElement("div");
        body.textContent = text;

        const close = document.createElement("button");
        close.type = "button";
        close.textContent = "×";
        close.setAttribute("aria-label", "বন্ধ করুন");

        Object.assign(close.style, {
            float: "right",
            border: "0",
            background: "transparent",
            fontSize: "22px",
            cursor: "pointer",
            marginLeft: "12px",
            color: "#6b7280"
        });

        close.addEventListener("click", () => toast.remove());

        toast.append(close, heading, body);
        root.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = "1";
            toast.style.transform = "translateX(0)";
        });

        if (duration > 0) {
            window.setTimeout(() => {
                toast.style.opacity = "0";
                toast.style.transform = "translateX(12px)";
                window.setTimeout(() => toast.remove(), 250);
            }, duration);
        }
    }

    window.AppToast = {
        success: message => show(message, "success"),
        error: message => show(message, "error", 6000),
        warning: message => show(message, "warning"),
        info: message => show(message, "info"),

        fromResponse: async response => {
            let data = {};

            try {
                data = await response.clone().json();
            } catch (_) {
                // JSON না হলে নিরাপদ সাধারণ বার্তা ব্যবহার হবে
            }

            if (!response.ok || data.success === false) {
                show(
                    data.message ||
                    (response.status === 401
                        ? "সেশন শেষ হয়েছে। আবার লগইন করুন।"
                        : response.status === 403
                        ? "এই কাজ করার অনুমতি নেই।"
                        : response.status === 404
                        ? "চাওয়া তথ্য বা API পাওয়া যায়নি।"
                        : response.status >= 500
                        ? "সার্ভারে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।"
                        : "অনুরোধটি সম্পন্ন হয়নি। তথ্য যাচাই করুন।"),
                    "error",
                    6000
                );
                return false;
            }

            return true;
        }
    };
})();
