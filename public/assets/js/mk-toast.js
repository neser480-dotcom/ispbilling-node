"use strict";

/* স্ক্রিনশটের মতো toast: সলিড সবুজ/হলুদ/লাল, সাদা আইকন + লেখা + ×, উপরে ডানে।
   আপনার AppToast এর সাথে সংঘর্ষ নেই (নাম আলাদা: window.MkToast) */
(function () {

    if (window.MkToast) { return; }

    const COLORS = { success: "#1cb100", warning: "#f1c40f", error: "#e03131", info: "#2f86e3" };
    const ICONS  = { success: "fa-circle-check", warning: "fa-triangle-exclamation", error: "fa-circle-xmark", info: "fa-circle-info" };

    let root = null;

    function container() {

        if (root && document.body.contains(root)) { return root; }

        root = document.createElement("div");

        Object.assign(root.style, {
            position: "fixed", top: "70px", right: "12px", zIndex: "99999",
            display: "flex", flexDirection: "column", gap: "6px",
            width: "min(310px, calc(100vw - 24px))", pointerEvents: "none"
        });

        document.body.appendChild(root);
        return root;
    }

    function show(message, type = "success", duration = 4000) {

        const text = String(message || "").trim();
        if (!text) { return; }

        const toast = document.createElement("div");
        const dark = type === "warning" ? "#fff" : "#fff";

        Object.assign(toast.style, {
            background: COLORS[type] || COLORS.info, color: dark,
            borderRadius: "4px", padding: "13px 14px", fontSize: "13px",
            display: "flex", alignItems: "center", gap: "10px",
            boxShadow: "0 3px 10px rgba(0,0,0,.25)", pointerEvents: "auto",
            opacity: "0", transition: "opacity .2s", position: "relative", overflow: "hidden"
        });

        const icon = document.createElement("i");
        icon.className = "fa " + (ICONS[type] || ICONS.info);
        icon.style.fontSize = "16px";

        const msg = document.createElement("span");
        msg.textContent = text;
        msg.style.flex = "1";

        const close = document.createElement("button");
        close.type = "button";
        close.innerHTML = "&times;";
        Object.assign(close.style, {
            background: "transparent", border: 0, color: "inherit",
            fontSize: "18px", lineHeight: "1", cursor: "pointer", opacity: ".8"
        });
        close.addEventListener("click", () => toast.remove());

        toast.append(icon, msg, close);

        if (duration > 0) {
            const bar = document.createElement("div");
            Object.assign(bar.style, {
                position: "absolute", left: "0", bottom: "0", height: "3px", width: "100%",
                background: "rgba(255,255,255,.55)", transformOrigin: "left",
                transition: "transform " + duration + "ms linear"
            });
            toast.appendChild(bar);
            requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transform = "scaleX(0)"; }));
        }
        container().appendChild(toast);

        requestAnimationFrame(() => { toast.style.opacity = "1"; });

        if (duration > 0) {
            setTimeout(() => {
                toast.style.opacity = "0";
                setTimeout(() => toast.remove(), 220);
            }, duration);
        }
    }

    window.MkToast = {
        success: m => show(m, "success"),
        warning: m => show(m, "warning"),
        error:   m => show(m, "error", 6000),
        info:    m => show(m, "info")
    };

})();
