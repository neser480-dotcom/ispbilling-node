"use strict";

/*
|--------------------------------------------------------------------------
| CUSTOMER EXTRAS (row menu popups)
|--------------------------------------------------------------------------
| Note, Activity Log and Transfer to Reseller.
| Opens inside the same #customerActionModal used by Add / Edit / Bulk.
| File: public/assets/js/customer-extras.js   (load after customer.js)
|--------------------------------------------------------------------------
*/

(function () {

    const MODAL_ID = "customerActionModal";

    function modalParts() {
        const element = document.getElementById(MODAL_ID);

        if (!element || !window.bootstrap) return null;

        return {
            element,
            modal: window.bootstrap.Modal.getOrCreateInstance(element),
            title: document.getElementById("customerActionModalLabel"),
            body: document.getElementById("customerActionModalBody")
        };
    }

    function csrfToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta && meta.content) return meta.content;

        const input = document.getElementById("csrfTokenInput");
        return input && input.value ? input.value : "";
    }

    function plainText(html) {
        const div = document.createElement("div");
        div.innerHTML = String(html || "");
        return (div.textContent || "").trim();
    }

    function notify(message, type) {
        if (window.Swal) {
            window.Swal.fire({
                icon: type || "info",
                text: message,
                timer: type === "success" ? 1200 : undefined,
                showConfirmButton: type !== "success"
            });
        } else {
            window.alert(message);
        }
    }

    function idFrom(link) {
        const id = link.dataset.id ||
            new URL(link.getAttribute("href") || "", location.origin).searchParams.get("id") ||
            "";
        return String(id).trim();
    }

    /* Load a fragment into the modal body (show = open the modal first) */
    async function load(url, title, show) {

        const parts = modalParts();
        if (!parts) return;

        if (show) {
            if (parts.title) parts.title.textContent = title || "Customer Action";

            parts.body.innerHTML =
                '<div class="text-center py-5">' +
                '<div class="spinner-border text-primary" role="status"></div>' +
                '<div class="mt-3 text-muted">Loading...</div></div>';

            parts.modal.show();
        }

        try {
            const response = await fetch(url, {
                credentials: "same-origin",
                headers: { "X-Requested-With": "XMLHttpRequest", Accept: "text/html" }
            });

            const html = await response.text();

            if (!response.ok) {
                throw new Error(plainText(html) || "Failed to load.");
            }

            parts.body.innerHTML = html;

            const root = parts.body.firstElementChild &&
                parts.body.querySelector("[data-title]");

            if (root && parts.title && root.dataset.title) {
                parts.title.textContent = root.dataset.title;
            }

            parts.element.classList.toggle("nf-ex-nohead", !!(root && root.dataset.nohead));

            const dialog = parts.element.querySelector(".modal-dialog");

            if (dialog) {
                dialog.classList.toggle("modal-xl", !!(root && root.dataset.wide));

                /* exact popup width like the reference screens */
                let width = root && root.dataset.width;

                if (!width && /\/api\/customers\/bulk\/(message|reseller)\b/.test(url)) {
                    width = "500";
                }

                parts.element.classList.toggle("nf-ex", !!width);

                if (width) {
                    dialog.style.setProperty("max-width", width + "px", "important");
                    dialog.style.setProperty("width", "calc(100% - 24px)", "important");
                } else {
                    dialog.style.removeProperty("max-width");
                    dialog.style.removeProperty("width");
                }
            }

        } catch (error) {
            parts.body.innerHTML =
                '<div class="alert alert-danger m-3"></div>';
            parts.body.firstElementChild.textContent =
                error.message || "Failed to load.";
        }
    }

    function reloadOpenFragment() {
        const parts = modalParts();
        const root = parts && parts.body.querySelector("[data-customer-id]");

        if (!root) return;

        const id = encodeURIComponent(root.dataset.customerId);

        if (root.classList.contains("nf-note-wrap")) {
            load("/api/customers/note?id=" + id, "", false);
        } else if (root.classList.contains("nf-act")) {
            load("/api/customers/activity?id=" + id, "", false);
        }
    }

    /* ---------- open popups from the row menu ---------- */

    document.addEventListener("click", function (event) {

        const t = event.target;
        const note = t.closest(".customer-note-btn");
        const activity = t.closest(".customer-activity-log-btn");
        const transfer = t.closest(".customer-transfer-btn") || t.closest(".customer-reseller-btn");
        const reset = t.closest(".customer-reset-password-btn");
        const message = t.closest(".customer-message-btn");
        const ticket = t.closest(".customer-ticket-btn");
        const usage = t.closest(".customer-usage-btn");
        const invoice = t.closest(".customer-invoice-btn");

        const link = note || activity || transfer || reset || message || ticket || usage || invoice;

        if (!link) return;

        event.preventDefault();

        const id = idFrom(link);

        if (!id) return;

        const q = encodeURIComponent(id);
        const dl = link.closest("ul") && link.closest("ul").querySelector(".delete-customer-btn");
        const cname = (dl && dl.dataset.name) || "";

        if (note) {
            load("/api/customers/note?id=" + q, "Note", true);
        } else if (activity) {
            load("/api/customers/activity?id=" + q, "Activity Log", true);
        } else if (reset) {
            load("/api/customers/reset-password?id=" + q, "Reset Password", true);
        } else if (message) {
            load("/api/customers/bulk/message?ids=" + q, (cname ? cname + " to send message" : "Send Message"), true);
        } else if (ticket) {
            load("/api/customers/ticket?id=" + q, "Create Support Ticket", true);
        } else if (usage) {
            load("/api/customers/data-usage?id=" + q, "Data Usage Report", true);
        } else if (invoice) {
            /* Create invoice = the existing single recharge popup of the same row */
            const row = link.closest("tr") || document;
            const btn = row.querySelector(".recharge-single-btn") ||
                document.querySelector('.recharge-single-btn[data-id="' + id + '"]');
            if (btn) btn.click();
        } else {
            load("/api/customers/bulk/reseller?ids=" + q, "Transfer to Reseller", true);
        }
    });

    /* ---------- ticket submit ---------- */

    document.addEventListener("submit", async function (event) {

        const form = event.target.closest("#customerActionModalBody form.nf-tk-form");

        if (!form) return;

        event.preventDefault();

        const wrap = form.closest(".nf-tk-wrap");
        const button = form.querySelector('[type="submit"]');

        button.disabled = true;

        try {
            const response = await fetch("/api/customers/ticket", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "X-CSRF-Token": csrfToken()
                },
                body: JSON.stringify({
                    customer_id: wrap.dataset.customerId,
                    message: form.elements.message.value,
                    staff_id: form.elements.staff_id.value,
                    ticket_type: form.elements.ticket_type.value,
                    category: form.elements.category.value,
                    csrf_token: csrfToken()
                })
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok || result.success === false) {
                throw new Error(result.message || "Failed to create ticket.");
            }

            const parts = modalParts();
            if (parts) parts.modal.hide();
            notify(result.message || "Support ticket created.", "success");

        } catch (error) {
            button.disabled = false;
            notify(error.message || "Failed to create ticket.", "error");
        }
    });

    /* ---------- data usage range ---------- */

    document.addEventListener("change", function (event) {

        const sel = event.target.closest(".nf-use-days");

        if (!sel) return;

        const root = sel.closest(".nf-use");

        load("/api/customers/data-usage?id=" + encodeURIComponent(root.dataset.customerId) +
            "&month=" + encodeURIComponent(sel.value), "", false);
    });

    /* ---------- note submit ---------- */

    document.addEventListener("submit", async function (event) {

        const form = event.target.closest("#customerActionModalBody form.nf-note-form");

        if (!form) return;

        event.preventDefault();

        const wrap = form.closest(".nf-note-wrap");
        const button = form.querySelector('[type="submit"]');
        const text = String(form.elements.note.value || "").trim();

        if (!text) return;

        button.disabled = true;

        try {
            const response = await fetch("/api/customers/note", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "X-CSRF-Token": csrfToken()
                },
                body: JSON.stringify({
                    customer_id: wrap.dataset.customerId,
                    note: text,
                    csrf_token: csrfToken()
                })
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok || result.success === false) {
                throw new Error(result.message || "Failed to save note.");
            }

            reloadOpenFragment();

        } catch (error) {
            button.disabled = false;
            notify(error.message || "Failed to save note.", "error");
        }
    });


    /* ---------- bulk popups: dependent selects (Area->Sub-Area, Mikrotik->Package) ---------- */

    function syncDependent(parent) {

        const key = parent.getAttribute("data-dep-parent");
        const scope = parent.closest("form") || document;
        const child = scope.querySelector('[data-dep-child="' + key + '"]');

        if (!child) return;

        const value = String(parent.value || "");

        Array.prototype.forEach.call(child.options, function (option) {

            const owner = String(option.getAttribute("data-parent") || "");
            const show = !option.value || owner === "" || owner === "0" || owner === value;

            option.hidden = !show;
            option.disabled = !show;
        });

        if (child.selectedOptions[0] && child.selectedOptions[0].disabled) {
            child.value = "";
        }
    }

    document.addEventListener("change", function (event) {

        const parent = event.target.closest("[data-dep-parent]");

        if (parent) syncDependent(parent);
    });

    /* ---------- bulk message: Letter / SMS counter ---------- */

    document.addEventListener("input", function (event) {

        const box = event.target.closest("textarea[data-msg-count]");

        if (!box) return;

        const text = String(box.value || "");
        const length = text.length;
        const unicode = /[^\x00-\x7F]/.test(text);
        const single = unicode ? 70 : 160;
        const multi = unicode ? 67 : 153;
        const sms = !length ? 0 : (length <= single ? 1 : Math.ceil(length / multi));

        const form = box.closest("form") || document;
        const letters = form.querySelector("[data-msg-letters]");
        const count = form.querySelector("[data-msg-sms]");

        if (letters) letters.textContent = String(length);
        if (count) count.textContent = String(sms);
    });


    /* ---------- recharge popup: Select Month chips ---------- */

    function chipsSync(root) {

        const form = root.closest("form");
        const names = Array.prototype.map.call(
            root.querySelectorAll(".nf-chip"),
            function (chip) { return chip.dataset.name; }
        );

        root.querySelectorAll(".nf-chips-item").forEach(function (item) {
            item.classList.toggle("picked", names.indexOf(item.dataset.name) !== -1);
        });

        if (!form) return;

        const selectedMonthInput = form.querySelector("[data-selected-running-month]");
        const selectedChips = root.querySelectorAll(".nf-chip");
        const lastChip = selectedChips[selectedChips.length - 1];

        if (selectedMonthInput && lastChip && lastChip.dataset.monthKey) {
            selectedMonthInput.value = lastChip.dataset.monthKey;
        }

        const select = form.querySelector("[data-recharge-month]");

        if (select) {
            select.value = String(Math.min(12, Math.max(1, names.length)));
            select.dispatchEvent(new Event("change", { bubbles: true }));
        }

        const note = form.querySelector('input[name="comment"]');

        if (note && !note.dataset.edited) {
            note.value = names.join(", ");
        }
    }

    function chipsAdd(root, name, monthKey) {

        if (!name) return;

        if (root.querySelector('.nf-chip[data-name="' + name + '"]')) return;

        if (root.querySelectorAll(".nf-chip").length >= 12) return;

        const chip = document.createElement("span");
        chip.className = "nf-chip";
        chip.dataset.name = name;
        if (monthKey) chip.dataset.monthKey = monthKey;
        chip.appendChild(document.createTextNode(name));

        const x = document.createElement("b");
        x.className = "nf-chip-x";
        x.innerHTML = "&times;";
        chip.appendChild(x);

        root.querySelector(".nf-chips-list").appendChild(chip);
    }

    document.addEventListener("click", function (event) {

        const root = event.target.closest("[data-nf-chips]");

        document.querySelectorAll("[data-nf-chips] .nf-chips-menu.open").forEach(function (menu) {
            if (!root || menu.parentNode !== root) menu.classList.remove("open");
        });

        if (!root) return;

        const menu = root.querySelector(".nf-chips-menu");

        const item = event.target.closest(".nf-chips-item");

        if (item) {

            /* choosing a month selects every month from the first one up to it */
            const items = Array.prototype.slice.call(root.querySelectorAll(".nf-chips-item"));
            const index = items.indexOf(item);

            root.querySelectorAll(".nf-chip").forEach(function (chip) { chip.remove(); });

            items.slice(0, index + 1).forEach(function (it) {
                chipsAdd(root, it.dataset.name, it.dataset.monthKey);
            });

            chipsSync(root);
            menu.classList.remove("open");
            return;
        }

        const remove = event.target.closest(".nf-chip-x");

        if (remove) {

            /* the first month is always kept; removing a month removes the later ones too */
            const chips = Array.prototype.slice.call(root.querySelectorAll(".nf-chip"));
            const index = chips.indexOf(remove.closest(".nf-chip"));

            if (index > 0) {
                chips.slice(index).forEach(function (chip) { chip.remove(); });
            }

            chipsSync(root);
            return;
        }

        if (event.target.closest(".nf-chips-clear")) {

            Array.prototype.slice.call(root.querySelectorAll(".nf-chip"), 1).forEach(function (chip) {
                chip.remove();
            });

            chipsSync(root);
            return;
        }

        if (event.target.closest(".nf-chips-box")) {
            menu.classList.toggle("open");
        }
    });

    document.addEventListener("input", function (event) {

        const note = event.target.closest('.netfee-recharge-form input[name="comment"]');

        if (note) note.dataset.edited = "1";
    });


    /* ---------- row Action menu: always fully reachable, scrolls inside if long ---------- */

    /*
     * The row "..." menu is handled here and NOT by Bootstrap's dropdown/Popper
     * (their placement was the cause of a menu that ran off the bottom of the
     * screen and could not be scrolled).
     *
     *  - The menu is moved into <body> (the table's scroll box can not clip it)
     *    and is fixed to the SCREEN under the "..." button.
     *  - No room below: it opens above the button. No room above either: it is
     *    pushed back inside the screen.
     *  - Its height is limited to the screen, so a long menu scrolls INSIDE
     *    itself (mouse wheel / touch), even with a single customer in the list.
     *  - Closes on: click outside, Esc, page scroll, window resize, or after an
     *    item was clicked (the item's own handler runs first).
     */
    let menuHost = null;
    let openToggle = null;
    let openMenu = null;

    const MENU_STYLE_KEYS = [
        "position", "display", "top", "left", "right", "bottom", "margin",
        "transform", "inset", "z-index", "max-height", "overflow-y",
        "overscroll-behavior"
    ];

    function getMenuHost() {

        if (!menuHost) {
            menuHost = document.createElement("div");
            menuHost.className = "cm-table customer-action nf-menu-host";
            document.body.appendChild(menuHost);
        }

        return menuHost;
    }

    function placeRowMenu(toggle, menu) {

        const pad = 8;
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const rect = toggle.getBoundingClientRect();

        // "important" so no stylesheet rule can override the placement
        const set = function (key, value) {
            menu.style.setProperty(key, value, "important");
        };

        set("position", "fixed");
        set("display", "block");
        set("right", "auto");
        set("bottom", "auto");
        set("margin", "0");
        set("transform", "none");
        set("inset", "auto");
        set("z-index", "2000");
        set("max-height", (vh - pad * 2) + "px");
        set("overflow-y", "auto");
        set("overscroll-behavior", "contain");
        set("top", "0px");
        set("left", "0px");

        const height = menu.offsetHeight;
        const width = menu.offsetWidth;

        let top = rect.bottom + 2;

        if (top + height > vh - pad) {
            const above = rect.top - 2 - height;
            top = above >= pad ? above : Math.max(pad, vh - pad - height);
        }

        const left = Math.min(Math.max(pad, rect.right - width), vw - width - pad);

        set("top", top + "px");
        set("left", left + "px");
    }

    function closeRowMenu() {

        if (!openMenu) return;

        const toggle = openToggle;
        const menu = openMenu;

        openToggle = null;
        openMenu = null;

        menu.classList.remove("show");

        MENU_STYLE_KEYS.forEach(function (key) {
            menu.style.removeProperty(key);
        });

        if (toggle) {
            toggle.classList.remove("show");
            toggle.setAttribute("aria-expanded", "false");

            if (toggle.__nfHome) {
                toggle.__nfHome.appendChild(menu);
            }
        }
    }

    function openRowMenu(toggle) {

        const home = toggle.parentElement;
        const menu = home && home.querySelector(".dropdown-menu");

        if (!menu) return;

        closeRowMenu();

        toggle.__nfHome = home;

        getMenuHost().appendChild(menu);

        menu.classList.add("show");
        toggle.classList.add("show");
        toggle.setAttribute("aria-expanded", "true");

        openToggle = toggle;
        openMenu = menu;

        placeRowMenu(toggle, menu);
    }

    function rowToggleFrom(target) {

        return target && target.closest
            ? target.closest(".cm-table [data-bs-toggle=\"dropdown\"]")
            : null;
    }

    document.addEventListener("click", function (event) {

        const toggle = rowToggleFrom(event.target);

        if (toggle) {

            // Bootstrap must not also handle this click
            event.preventDefault();
            event.stopImmediatePropagation();

            if (openToggle === toggle) {
                closeRowMenu();
            } else {
                openRowMenu(toggle);
            }

            return;
        }

        if (!openMenu) return;

        if (openMenu.contains(event.target)) {

            // let the item's own handler run first, then close
            if (event.target.closest(".dropdown-item")) {
                setTimeout(closeRowMenu, 0);
            }

            return;
        }

        closeRowMenu();

    }, true);

    document.addEventListener("keydown", function (event) {

        if (event.key === "Escape") {
            closeRowMenu();
            return;
        }

        if (event.key === "ArrowDown" || event.key === "ArrowUp") {

            const toggle = rowToggleFrom(event.target);

            if (toggle) {
                event.preventDefault();
                event.stopImmediatePropagation();
                openRowMenu(toggle);
            }
        }
    }, true);

    document.addEventListener("scroll", function (event) {

        // scrolling INSIDE the menu must keep it open
        if (openMenu && !openMenu.contains(event.target)) {
            closeRowMenu();
        }
    }, true);

    window.addEventListener("resize", closeRowMenu);

    /* ---------- reset password ---------- */

    document.addEventListener("change", function (event) {

        const radio = event.target.closest("#customerActionModalBody .nf-rp-form input[name='type']");

        if (!radio) return;

        const box = radio.closest(".nf-rp-form").querySelector(".nf-rp-manual");

        box.classList.toggle("open", radio.value === "manual" && radio.checked);
    });

    document.addEventListener("submit", async function (event) {

        const form = event.target.closest("#customerActionModalBody form.nf-rp-form");

        if (!form) return;

        event.preventDefault();

        const wrap = form.closest(".nf-rp-wrap");
        const button = form.querySelector('[type="submit"]');
        const type = form.querySelector("input[name='type']:checked").value;
        const password = String(form.elements.password.value || "").trim();

        button.disabled = true;

        try {
            const response = await fetch("/api/customers/reset-password", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "X-CSRF-Token": csrfToken()
                },
                body: JSON.stringify({
                    customer_id: wrap.dataset.customerId,
                    type: type,
                    password: password,
                    csrf_token: csrfToken()
                })
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok || result.success === false) {
                throw new Error(result.message || "Failed to reset password.");
            }

            const parts = modalParts();

            if (parts) parts.modal.hide();

            notify(result.message || "Password reset successfully.", "success");

        } catch (error) {
            button.disabled = false;
            notify(error.message || "Failed to reset password.", "error");
        }
    });

    /* ---------- activity log: filter / search / view ---------- */

    function applyActivityFilter(root) {

        const by = root.querySelector(".nf-act-by").value.trim().toLowerCase();
        const act = root.querySelector(".nf-act-act").value.trim().toLowerCase();
        const q = root.querySelector(".nf-act-search").value.trim().toLowerCase();

        let shown = 0;
        let number = 0;

        root.querySelectorAll("tbody tr").forEach(function (row) {

            const ok =
                (!by || String(row.dataset.author || "").toLowerCase() === by) &&
                (!act || String(row.dataset.action || "").toLowerCase() === act) &&
                (!q || row.textContent.toLowerCase().includes(q));

            row.style.display = ok ? "" : "none";

            if (ok) {
                shown++;
                number++;
                const cell = row.querySelector(".nf-act-no");
                if (cell) cell.textContent = String(number);
            }
        });

        root.querySelector(".nf-act-count").textContent = String(shown);
        root.querySelector(".nf-act-empty").style.display = shown ? "none" : "block";
    }

    document.addEventListener("click", function (event) {

        const root = event.target.closest(".nf-act");

        if (!root) return;

        const sortTh = event.target.closest(".nf-act .nf-sort");

        if (sortTh) {
            const table = sortTh.closest("table");
            const idx = Array.prototype.indexOf.call(sortTh.parentNode.children, sortTh);
            const dir = sortTh.dataset.dir === "asc" ? "desc" : "asc";

            table.querySelectorAll(".nf-sort").forEach((h) => { delete h.dataset.dir; });
            sortTh.dataset.dir = dir;

            const body = table.tBodies[0];
            const rows = Array.from(body.rows);
            const val = (tr) => {
                const td = tr.cells[idx];
                const raw = td.dataset.sort !== undefined ? td.dataset.sort : td.textContent.trim().toLowerCase();
                return /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
            };

            rows.sort((a, b) => {
                const x = val(a), y = val(b);
                return (x > y ? 1 : x < y ? -1 : 0) * (dir === "asc" ? 1 : -1);
            });
            rows.forEach((tr) => body.appendChild(tr));
            return;
        }

        if (event.target.closest(".nf-act-toggle")) {
            root.querySelector(".nf-act-filter").classList.toggle("open");
            return;
        }

        if (event.target.closest(".nf-act-apply")) {
            applyActivityFilter(root);
            return;
        }

        if (event.target.closest(".nf-act-reset")) {
            root.querySelector(".nf-act-by").value = "";
            root.querySelector(".nf-act-act").value = "";
            root.querySelector(".nf-act-search").value = "";
            applyActivityFilter(root);
            return;
        }

        if (event.target.closest(".nf-act-refresh")) {
            reloadOpenFragment();
            return;
        }

        const view = event.target.closest(".nf-act-view");

        if (view) {
            const lines = [
                view.dataset.desc,
                "Action: " + String(view.dataset.action || "").toUpperCase(),
                "By: " + view.dataset.author,
                "IP: " + view.dataset.ip,
                "Date: " + view.dataset.date
            ].join("\n");

            if (window.Swal) {
                window.Swal.fire({
                    title: "Activity",
                    html: "",
                    didOpen: function (popup) {
                        const box = popup.querySelector(".swal2-html-container");
                        box.style.whiteSpace = "pre-wrap";
                        box.textContent = lines;
                    }
                });
            } else {
                window.alert(lines);
            }
        }
    });

    document.addEventListener("input", function (event) {

        const search = event.target.closest(".nf-act-search");

        if (search) {
            applyActivityFilter(search.closest(".nf-act"));
        }
    });

    /* ---------- cleanup when the modal closes ---------- */

    document.addEventListener("hidden.bs.modal", function (event) {

        if (!event.target || event.target.id !== MODAL_ID) return;

        event.target.classList.remove("nf-ex-nohead");
        event.target.classList.remove("nf-ex");

        const dialog = event.target.querySelector(".modal-dialog");

        if (dialog) {
            dialog.classList.remove("modal-xl");
            dialog.style.removeProperty("max-width");
            dialog.style.removeProperty("width");
        }
    });

})();
