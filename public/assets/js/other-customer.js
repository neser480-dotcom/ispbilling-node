/*
| OTHER CUSTOMER PAGE
| Tabs:  New Customer (এই মাসে যোগ হওয়া) | Inactive Customer (শুধু Inactive) | Due Customers (unpaid, Inactive বাদে)
| ডাটা: GET /api/customers (আগের মতোই), ট্যাব ভাগ হয় ব্রাউজারে।
*/
(function () {
    "use strict";

    var tab = "new";
    var all = [];
    var query = "";
    var sortKey = "";
    var sortDir = 1;
    var loading = false;

    function $(id) { return document.getElementById(id); }

    function esc(v) {
        return String(v == null ? "" : v)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
    function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
    function str(v) { return String(v == null ? "" : v).trim(); }
    function taka(v) {
        return num(v).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }

    /* ---------- field helpers (customer.js এর মতো) ---------- */
    function dbId(c) { return num(c.id != null ? c.id : (c.customer_db_id != null ? c.customer_db_id : c.customerIdDb)); }
    function cid(c) { return str(c.customer_id != null ? c.customer_id : c.customerId); }
    function name(c) { return str(c.name || c.full_name || c.customer_name); }
    function pppoe(c) { return str(c.pppoe_username || c.pppoe_name || c.username); }
    function phone(c) { return str(c.phone || c.mobile || c.mobile_no); }
    function address(c) { return str(c.address); }
    function pkg(c) { return str(c.display_package || c.package_name || c["package"]); }
    function bill(c) { return num(c.display_bill != null ? c.display_bill : (c.monthly_bill != null ? c.monthly_bill : c.monthlyBill)); }
    function bal(c) { return num(c.balance); }
    function status(c) { return str(c.status || "Inactive"); }
    function pay(c) { return str(c.payment_status || c.paymentStatus || "unpaid").toLowerCase(); }
    function created(c) { return c.created_at || c.createdAt || ""; }
    function billing(c) { return c.billing_cycle || c.billing_date || null; }
    function promise(c) { return c.promise_date || c.promiseDate || null; }
    function kind(c) { return str(c.connection_type || c.service_type || c.customer_type_name || "PPPoE") || "PPPoE"; }

    function dayLeft(c) {
        var raw = c.day_left != null ? c.day_left : c.dayLeft;
        if (raw !== "" && raw != null && isFinite(Number(raw))) { return Number(raw); }
        var d = promise(c) || billing(c);
        if (!d) { return null; }
        var t = new Date(d).getTime();
        if (!isFinite(t)) { return null; }
        return Math.ceil((t - Date.now()) / 86400000);
    }

    function dateTime(v) {
        if (!v) { return ""; }
        var d = new Date(v);
        if (isNaN(d.getTime())) { return esc(v); }
        var p = function (n) { return String(n).padStart(2, "0"); };
        var h = d.getHours(), sfx = h >= 12 ? "PM" : "AM";
        h = h % 12 || 12;
        return d.getFullYear() + "/" + p(d.getMonth() + 1) + "/" + p(d.getDate()) + " " + p(h) + ":" + p(d.getMinutes()) + " " + sfx;
    }

    /* ---------- tab rules ---------- */
    function isThisMonth(v) {
        if (!v) { return false; }
        var d = new Date(v), n = new Date();
        return !isNaN(d.getTime()) && d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
    }
    function inTab(c, t) {
        var st = status(c).toLowerCase();
        if (t === "new") { return isThisMonth(created(c)); }
        if (t === "inactive") { return st === "inactive"; }
        return pay(c) === "unpaid" && st !== "inactive";
    }

    /* ---------- rows ---------- */
    function haystack(c) {
        return [cid(c), name(c), pppoe(c), phone(c), address(c), pkg(c), status(c), pay(c)].join(" ").toLowerCase();
    }

    function sortVal(c, k) {
        switch (k) {
            case "id": return num(cid(c).replace(/\D/g, "")) || cid(c);
            case "name": return name(c);
            case "contact": return phone(c) || address(c);
            case "package": return pkg(c);
            case "bill": return bal(c);
            case "date": return new Date(promise(c) || billing(c) || 0).getTime() || 0;
            case "day": return dayLeft(c) == null ? -99999 : dayLeft(c);
            case "status": return status(c) + pay(c);
            default: return 0;
        }
    }

    function rows() {
        var q = query.toLowerCase();
        var list = all.filter(function (c) { return inTab(c, tab) && (!q || haystack(c).indexOf(q) > -1); });
        if (sortKey) {
            var col = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
            list = list.slice().sort(function (a, b) {
                var x = sortVal(a, sortKey), y = sortVal(b, sortKey);
                var r = (typeof x === "number" && typeof y === "number") ? x - y : col.compare(String(x), String(y));
                return r * sortDir;
            });
        }
        return list;
    }

    function statusBadges(c) {
        var p = pay(c) === "paid" ? "paid" : "unpaid";
        var s = status(c).toLowerCase() || "unknown";
        var cls = { active: "oc-active", expired: "oc-expired", inactive: "oc-inactive", suspended: "oc-warn", pending: "oc-warn" }[s] || "oc-inactive";
        return '<div class="oc-badges"><span class="oc-badge ' + (p === "paid" ? "oc-paid" : "oc-unpaid") + '">' + p + '</span>' +
               '<span class="oc-badge ' + cls + '">' + esc(s) + "</span></div>";
    }

    function dayBox(c) {
        var d = dayLeft(c);
        if (d == null) { return '<span class="oc-na">N/A</span>'; }
        var title = d < 0 ? Math.abs(d) + " days overdue" : d + " day(s) left";
        var cls = d < 0 ? "oc-day-over" : (pay(c) === "paid" ? "oc-day-ok" : "oc-day-pend");
        return '<span class="oc-day ' + cls + '" title="' + title + '">' + d + "</span>";
    }

    function promiseClass(c) {
        var p = promise(c);
        if (!p) { return ""; }
        var t = new Date(p).getTime();
        if (!isFinite(t)) { return ""; }
        var diff = t - Date.now();
        if (diff < 0) { return " oc-late"; }
        if (diff < 3 * 86400000) { return " oc-soon"; }
        return "";
    }

    function rowHtml(c) {
        var id = dbId(c), nm = name(c) || "-";
        var b = billing(c), p = promise(c);
        var dates = "";
        if (b) { dates += "<div>" + dateTime(b) + "</div>"; }
        if (p) { dates += '<div class="oc-pd' + promiseClass(c) + '">' + dateTime(p) + "</div>"; }
        var bl = bal(c);
        return "<tr>" +
            '<td class="oc-idcell"><div class="oc-id' + (c.auto_connection != null && Number(c.auto_connection) === 0 ? " cl-conn-off" : "") + '">' + esc(cid(c)) + '</div><span class="oc-kind">' + esc(kind(c)) + "</span></td>" +
            '<td class="oc-left"><div class="oc-name">' + esc(nm) + '</div><div class="oc-sub">' + esc(pppoe(c) || cid(c) || "-") + "</div></td>" +
            '<td class="oc-left"><div class="oc-line"><i class="fa-solid fa-mobile-screen-button oc-ico-phone"></i>' + (phone(c) ? '<b class="oc-ph">' + esc(phone(c)) + "</b>" : "N/A") + "</div>" +
                '<div class="oc-line"><i class="fa-solid fa-location-dot oc-ico-pin"></i>' + esc(address(c) || "N/A") + "</div></td>" +
            '<td class="oc-left">' + esc(pkg(c) || "-") + "</td>" +
            '<td class="oc-left"><div>৳' + taka(bill(c)) + '</div><div class="' + (bl < 0 ? "oc-neg" : "oc-pos") + '">৳' + taka(bl) + "</div></td>" +
            '<td class="oc-left">' + (dates || "-") + "</td>" +
            "<td>" + dayBox(c) + "</td>" +
            "<td>" + statusBadges(c) + "</td>" +
            '<td><a href="#" class="oc-act customer-profile-btn" data-id="' + id + '" data-name="' + esc(nm) + '" title="Profile"><i class="fa-regular fa-user"></i></a></td>' +
            "</tr>";
    }

    function summary(list) {
        var el = $("ocSummary");
        if (!el) { return; }
        if (tab === "new") {
            var fee = list.reduce(function (s, c) { return s + bill(c); }, 0);
            el.textContent = "Monthly Fee:-৳" + (Math.round(fee * 100) / 100);
        } else if (tab === "due") {
            var due = list.reduce(function (s, c) { return s + (bal(c) < 0 ? bal(c) : 0); }, 0);
            el.textContent = "Due: ৳" + (due < 0 ? "-" + taka(Math.abs(due)) : "0");
        } else {
            el.textContent = "";
        }
    }

    function render() {
        var list = rows();
        $("ocTotal").textContent = list.length;
        summary(list);

        document.querySelectorAll("#ocTable thead th[data-sort]").forEach(function (th) {
            var on = th.dataset.sort === sortKey;
            th.classList.toggle("oc-sorted", on);
            var d = th.querySelector(".oc-sort");
            if (d) { d.textContent = on ? (sortDir === 1 ? "↑" : "↓") : "↓↑"; }
        });

        $("ocBody").innerHTML = list.length
            ? list.map(rowHtml).join("")
            : '<tr><td colspan="9" class="oc-empty">No customers found</td></tr>';
    }

    /* ---------- load ---------- */
    function filterParams(p) {
        document.querySelectorAll("[data-cf]").forEach(function (el) {
            var k = str(el.getAttribute("data-cf")), v = str(el.value);
            if (k && v !== "") { p.set(k, v); }
        });
    }

    async function load() {
        if (loading) { return; }
        loading = true;
        $("ocBody").innerHTML = '<tr><td colspan="9" class="oc-empty"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading customers...</td></tr>';
        try {
            var out = [], page = 1, pages = 1;
            do {
                var p = new URLSearchParams();
                p.set("page", String(page));
                p.set("limit", "5000");
                filterParams(p);
                var res = await fetch("/api/customers?" + p.toString(), {
                    credentials: "same-origin",
                    headers: { "X-Requested-With": "XMLHttpRequest" }
                });
                var j = await res.json();
                if (!res.ok || !j.success) { throw new Error(j.message || "Failed to load customers."); }
                var data = Array.isArray(j.data) ? j.data : (Array.isArray(j.customers) ? j.customers : []);
                out = out.concat(data);
                pages = num(j.pagination && j.pagination.totalPages) || 1;
                page++;
            } while (page <= pages && page <= 20);
            all = out;
            render();
        } catch (e) {
            $("ocBody").innerHTML = '<tr><td colspan="9" class="oc-empty oc-err"><i class="fa-solid fa-triangle-exclamation me-2"></i>' + esc(e.message) + "</td></tr>";
            $("ocTotal").textContent = "0";
        } finally {
            loading = false;
        }
    }

    /* customer-actions.js (update/recharge/delete এর পর) এটাই ডাকে */
    window.CustomerList = { refresh: load };

    /* ---------- filter dropdowns ---------- */
    async function fetchList(url, key) {
        var r = await fetch(url, { credentials: "same-origin", headers: { "X-Requested-With": "XMLHttpRequest" } });
        var j = await r.json();
        if (!r.ok || j.success === false) { throw new Error(j.message || "load failed"); }
        var a = j[key] || j.data || [];
        return Array.isArray(a) ? a : [];
    }
    function fill(sel, list, label) {
        if (!sel) { return; }
        var first = sel.options[0] ? sel.options[0].cloneNode(true) : new Option("", "");
        sel.innerHTML = "";
        sel.appendChild(first);
        list.forEach(function (r) {
            var id = num(r.id), l = str(label(r));
            if (id > 0 && l) { sel.add(new Option(l, String(id))); }
        });
    }
    function sel(k) { return document.querySelector('[data-cf="' + k + '"]'); }

    async function initFilters() {
        try { fill(sel("router_id"), await fetchList("/api/router", "routers"), function (r) { return r.name; }); } catch (e) { /* ignore */ }
        try { fill(sel("area_id"), await fetchList("/areas/data", "data"), function (r) { return r.name; }); } catch (e) { /* ignore */ }

        sel("router_id").addEventListener("change", async function () {
            fill(sel("package_id"), [], function () { return ""; });
            if (!this.value) { return; }
            try {
                fill(sel("package_id"), await fetchList("/api/router/" + encodeURIComponent(this.value) + "/packages", "packages"),
                    function (r) { return r.alias_name || r.package_name; });
            } catch (e) { /* ignore */ }
        });
        sel("area_id").addEventListener("change", async function () {
            fill(sel("sub_area_id"), [], function () { return ""; });
            if (!this.value) { return; }
            try {
                fill(sel("sub_area_id"), await fetchList("/areas/sub-areas?area_id=" + encodeURIComponent(this.value), "data"),
                    function (r) { return r.name; });
            } catch (e) { /* ignore */ }
        });
    }

    /* ---------- CSV ---------- */
    function csvCell(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }
    function exportCsv() {
        var list = rows();
        var head = ["ID", "Name", "PPPoE", "Mobile", "Address", "Package", "Bill", "Balance", "Billing Date", "Promise Date", "Day Left", "Payment", "Status"];
        var lines = [head.map(csvCell).join(",")];
        list.forEach(function (c) {
            lines.push([cid(c), name(c), pppoe(c), phone(c), address(c), pkg(c), bill(c), bal(c),
                dateTime(billing(c)), dateTime(promise(c)), dayLeft(c) == null ? "" : dayLeft(c), pay(c), status(c)].map(csvCell).join(","));
        });
        var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "other-customer-" + tab + ".csv";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }

    /* ---------- events ---------- */
    function bind() {
        document.querySelectorAll(".oc-tab").forEach(function (b) {
            b.addEventListener("click", function () {
                tab = b.dataset.tab;
                document.querySelectorAll(".oc-tab").forEach(function (x) { x.classList.toggle("active", x === b); });
                sortKey = ""; sortDir = 1;
                render();
            });
        });

        $("ocSearch").addEventListener("input", function () { query = this.value.trim(); render(); });

        document.querySelectorAll("#ocTable thead th[data-sort]").forEach(function (th) {
            th.addEventListener("click", function () {
                var k = th.dataset.sort;
                if (sortKey === k) { sortDir = -sortDir; } else { sortKey = k; sortDir = 1; }
                render();
            });
        });

        $("ocFilterBtn").addEventListener("click", function () { var p = $("ocFilterPanel"); p.hidden = !p.hidden; });
        $("ocRefreshBtn").addEventListener("click", load);
        $("ocApplyFilter").addEventListener("click", load);
        $("ocResetFilter").addEventListener("click", function () {
            document.querySelectorAll("[data-cf]").forEach(function (el) { el.value = ""; });
            fill(sel("package_id"), [], function () { return ""; });
            fill(sel("sub_area_id"), [], function () { return ""; });
            load();
        });
        $("ocCsvBtn").addEventListener("click", exportCsv);
        $("ocPrintBtn").addEventListener("click", function () { window.print(); });

        $("ocToggleTools").addEventListener("click", function () {
            var ex = $("ocExtra");
            ex.hidden = !ex.hidden;
            this.classList.toggle("open", !ex.hidden);
            this.setAttribute("aria-expanded", String(!ex.hidden));
        });

        var y = $("ocYear");
        if (y) { y.textContent = new Date().getFullYear(); }
    }

    bind();
    initFilters();
    load();
})();
