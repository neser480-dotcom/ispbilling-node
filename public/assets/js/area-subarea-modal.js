/*
| SUB AREA POPUP  (Area page)
| "Sub Area N ->" বাটনে ক্লিক করলে আলাদা পেজ না খুলে popup খোলে।
| Endpoints (আগের মতোই): GET /areas/sub-data/:id, POST /areas/sub-add, /sub-update, /sub-delete
*/
(function () {
    "use strict";

    if (window.__subAreaPopupLoaded) { return; }
    window.__subAreaPopupLoaded = true;

    var cur = { id: 0, name: "" };
    var rows = [];
    var sortKey = "";
    var sortDir = 1;
    var query = "";
    var csrf = null;
    var editing = null;

    function esc(v) {
        return String(v == null ? "" : v)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    var PLUS = '<svg class="sa-plus" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2"></circle><path d="M12 7.8v8.4M7.8 12h8.4"></path></svg>';

    /* ---------- markup ---------- */
    var holder = document.createElement("div");
    holder.id = "subAreaPopups";
    holder.innerHTML =
        '<div class="modal fade sa-modal" id="subAreaListModal" tabindex="-1" aria-hidden="true">' +
          '<div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">' +
            '<div class="modal-content border-0 shadow">' +
              '<div class="modal-header sa-head"><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>' +
              '<div class="modal-body">' +
                '<div class="area-header-card sa-title-card">' +
                  '<h1 id="saTitle">Sub Areas</h1>' +
                  '<div class="area-header-actions"><button type="button" class="area-icon-btn" id="saAddBtn" title="Add Sub Area">' + PLUS + '</button></div>' +
                '</div>' +
                '<div class="area-data-strip sa-strip">' +
                  '<div class="area-total"><i class="fa fa-gear me-2"></i>Total Data: <span class="area-count-pill" id="saCount">0</span></div>' +
                  '<div class="area-search-wrap"><input type="text" id="saSearch" class="form-control" placeholder="Search" autocomplete="off"></div>' +
                '</div>' +
                '<div class="sa-table-wrap">' +
                  '<table class="table area-table align-middle mb-0" id="saTable"><thead><tr>' +
                    '<th width="60" data-sort="idx"># <span class="sort-icon">⇅</span></th>' +
                    '<th data-sort="name">Sub Area <span class="sort-icon">⇅</span></th>' +
                    '<th data-sort="remarks">Remarks <span class="sort-icon">⇅</span></th>' +
                    '<th width="110" class="text-center" data-sort="idx">Action <span class="sort-icon">⇅</span></th>' +
                  '</tr></thead><tbody id="saBody"></tbody></table>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="modal fade sa-modal sa-small" id="subAreaAddModal" tabindex="-1" aria-hidden="true">' +
          '<div class="modal-dialog modal-dialog-centered"><div class="modal-content shadow">' +
            '<form id="saAddForm" autocomplete="off">' +
              '<div class="modal-header"><h5 class="modal-title" id="saAddTitle">addSubArea</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>' +
              '<div class="modal-body">' +
                '<div class="mb-3"><label class="form-label" for="saAddName">Sub-Area Name <span class="text-danger">*</span></label><input type="text" class="form-control" id="saAddName" name="name" required></div>' +
                '<div class="mb-1"><label class="form-label" for="saAddRemarks">Remarks</label><textarea class="form-control" id="saAddRemarks" name="remarks" rows="3"></textarea></div>' +
                '<div class="sa-error" id="saAddError" hidden></div>' +
              '</div>' +
              '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-success">Save</button></div>' +
            '</form>' +
          '</div></div>' +
        '</div>' +

        '<div class="modal fade sa-modal sa-small" id="subAreaEditModal" tabindex="-1" aria-hidden="true">' +
          '<div class="modal-dialog modal-dialog-centered"><div class="modal-content shadow">' +
            '<form id="saEditForm" autocomplete="off">' +
              '<div class="modal-header"><h5 class="modal-title">Edit Subarea</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>' +
              '<div class="modal-body">' +
                '<div class="mb-3"><label class="form-label" for="saEditName">Sub Area Name</label><input type="text" class="form-control" id="saEditName" name="name" required></div>' +
                '<div class="mb-1"><label class="form-label" for="saEditRemarks">Remarks</label><textarea class="form-control" id="saEditRemarks" name="remarks" rows="3"></textarea></div>' +
                '<div class="sa-error" id="saEditError" hidden></div>' +
              '</div>' +
              '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-success">Save</button></div>' +
            '</form>' +
          '</div></div>' +
        '</div>';
    document.body.appendChild(holder);

    var $ = function (id) { return document.getElementById(id); };
    var listEl = $("subAreaListModal");
    var addEl = $("subAreaAddModal");
    var editEl = $("subAreaEditModal");

    function modalOf(el) { return bootstrap.Modal.getOrCreateInstance(el); }

    /* second-level popups must sit above the first one */
    [addEl, editEl].forEach(function (el) {
        el.addEventListener("show.bs.modal", function () { el.style.setProperty("z-index", "1000003", "important"); });
        el.addEventListener("shown.bs.modal", function () {
            var b = document.querySelectorAll(".modal-backdrop");
            if (b.length) { b[b.length - 1].style.setProperty("z-index", "1000002", "important"); }
            var f = el.querySelector("input,textarea");
            if (f) { f.focus(); }
        });
        el.addEventListener("hidden.bs.modal", function () {
            if (document.querySelector(".modal.show")) { document.body.classList.add("modal-open"); }
        });
    });

    /* ---------- api ---------- */
    async function token() {
        if (csrf) { return csrf; }
        var r = await fetch("/api/auth/csrf", { credentials: "same-origin", cache: "no-store" });
        var d = await r.json();
        if (!r.ok || !d.csrf_token) { throw new Error("Unable to obtain security token. Refresh the page."); }
        csrf = d.csrf_token;
        return csrf;
    }

    async function parse(res) {
        var t = await res.text(), j;
        try { j = JSON.parse(t); } catch (e) { throw new Error("Invalid server response."); }
        if (!res.ok || !j.success) { throw new Error(j.message || "Request failed."); }
        return j;
    }

    async function post(url, data) {
        var body = new URLSearchParams();
        Object.keys(data).forEach(function (k) { body.append(k, data[k]); });
        var res = await fetch(url, {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "X-CSRF-Token": await token(),
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
            },
            body: body.toString()
        });
        return parse(res);
    }

    function notify(msg, icon) {
        if (window.Swal) { window.Swal.fire({ icon: icon || "error", text: msg, confirmButtonText: "OK" }); }
        else { window.alert(msg); }
    }

    function refreshAreaPage() {
        var b = $("reloadArea");
        if (b) { b.click(); }
    }

    /* ---------- list ---------- */
    function visibleRows() {
        var q = query.toLowerCase();
        var list = rows.map(function (r, i) { r.idx = i + 1; return r; }).filter(function (r) {
            return !q || String(r.name).toLowerCase().indexOf(q) > -1 || String(r.remarks).toLowerCase().indexOf(q) > -1;
        });
        if (sortKey) {
            var col = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
            list.sort(function (a, b) {
                var x = sortKey === "idx" ? a.idx - b.idx : col.compare(String(a[sortKey] || ""), String(b[sortKey] || ""));
                return x * sortDir;
            });
        }
        return list;
    }

    function render() {
        var list = visibleRows();
        $("saCount").textContent = rows.length;

        document.querySelectorAll("#saTable thead th[data-sort]").forEach(function (th, i) {
            var ic = th.querySelector(".sort-icon");
            var on = th.dataset.sort === sortKey && (th.dataset.sort !== "idx" || i === 0);
            if (ic) { ic.textContent = on ? (sortDir === 1 ? "↑" : "↓") : "⇅"; }
        });

        if (!list.length) {
            $("saBody").innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">' +
                (rows.length ? "No match" : "No Sub Area Found") + "</td></tr>";
            return;
        }

        $("saBody").innerHTML = list.map(function (r) {
            return "<tr>" +
                "<td>" + r.idx + "</td>" +
                '<td class="area-name">' + esc(r.name) + "</td>" +
                "<td>" + esc(r.remarks) + "</td>" +
                '<td class="text-center"><div class="dropdown">' +
                    '<button type="button" class="area-dots" data-bs-toggle="dropdown" data-bs-popper-config=\'{"strategy":"fixed"}\' aria-expanded="false" title="Actions"><i class="fa fa-ellipsis"></i></button>' +
                    '<ul class="dropdown-menu dropdown-menu-end">' +
                        '<li><button type="button" class="dropdown-item sa-edit" data-id="' + r.id + '"><i class="fa fa-edit me-2 text-primary"></i>Edit</button></li>' +
                        '<li><hr class="dropdown-divider"></li>' +
                        '<li><button type="button" class="dropdown-item text-danger sa-del" data-id="' + r.id + '"><i class="fa fa-trash me-2"></i>Delete</button></li>' +
                    "</ul></div></td>" +
                "</tr>";
        }).join("");
    }

    async function load() {
        $("saBody").innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted"><i class="fa fa-spinner fa-spin me-2"></i>Loading...</td></tr>';
        try {
            var res = await fetch("/areas/sub-data/" + cur.id, { credentials: "same-origin", cache: "no-store" });
            var j = await parse(res);
            if (j.area && j.area.name) { cur.name = j.area.name; $("saTitle").textContent = cur.name + " Sub Areas"; }
            rows = (Array.isArray(j.data) ? j.data : []).map(function (r) {
                return { id: Number(r.id), name: String(r.name || ""), remarks: String(r.remarks || "") };
            });
            render();
        } catch (e) {
            $("saBody").innerHTML = '<tr><td colspan="4" class="text-center py-4 text-danger"><i class="fa fa-triangle-exclamation me-2"></i>' + esc(e.message) + "</td></tr>";
            $("saCount").textContent = "0";
        }
    }

    function openFor(id, name) {
        cur = { id: id, name: name || "" };
        rows = []; sortKey = ""; sortDir = 1; query = "";
        $("saSearch").value = "";
        $("saTitle").textContent = (name ? name + " " : "") + "Sub Areas";
        $("saCount").textContent = "0";
        modalOf(listEl).show();
        load();
    }

    /* ---------- events ---------- */
    document.addEventListener("click", function (ev) {
        var a = ev.target.closest("a.btn-subarea");
        if (!a || ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) { return; }
        var m = /\/areas\/sub\/(\d+)/.exec(a.getAttribute("href") || "");
        if (!m || typeof bootstrap === "undefined") { return; }
        ev.preventDefault();
        var tr = a.closest("tr");
        var nm = tr && tr.querySelector(".area-name");
        openFor(Number(m[1]), nm ? nm.textContent.trim() : "");
    });

    $("saSearch").addEventListener("input", function () { query = this.value.trim(); render(); });

    $("saTable").querySelectorAll("thead th[data-sort]").forEach(function (th, i) {
        th.addEventListener("click", function () {
            var key = th.dataset.sort;
            if (sortKey === key) { sortDir = -sortDir; } else { sortKey = key; sortDir = 1; }
            render();
        });
    });

    $("saAddBtn").addEventListener("click", function () {
        $("saAddForm").reset();
        $("saAddError").hidden = true;
        $("saAddTitle").textContent = cur.name + " - addSubArea";
        modalOf(addEl).show();
    });

    function busy(form, on) {
        var b = form.querySelector('button[type="submit"]');
        if (!b) { return; }
        b.disabled = on;
        b.textContent = on ? "Saving..." : "Save";
    }

    function showErr(id, msg) { var e = $(id); e.textContent = msg; e.hidden = false; }

    $("saAddForm").addEventListener("submit", async function (ev) {
        ev.preventDefault();
        var f = this;
        $("saAddError").hidden = true;
        busy(f, true);
        try {
            await post("/areas/sub-add", {
                area_id: cur.id,
                name: $("saAddName").value.trim(),
                remarks: $("saAddRemarks").value.trim()
            });
            modalOf(addEl).hide();
            await load();
            refreshAreaPage();
        } catch (e) {
            showErr("saAddError", e.message || "Sub Area add failed.");
        } finally { busy(f, false); }
    });

    document.addEventListener("click", function (ev) {
        var b = ev.target.closest("#saBody .sa-edit");
        if (!b) { return; }
        var id = Number(b.dataset.id);
        var r = rows.filter(function (x) { return x.id === id; })[0];
        if (!r) { return; }
        editing = r;
        $("saEditName").value = r.name;
        $("saEditRemarks").value = r.remarks;
        $("saEditError").hidden = true;
        modalOf(editEl).show();
    });

    $("saEditForm").addEventListener("submit", async function (ev) {
        ev.preventDefault();
        if (!editing) { return; }
        var f = this;
        $("saEditError").hidden = true;
        busy(f, true);
        try {
            await post("/areas/sub-update", {
                area_id: cur.id,
                id: editing.id,
                name: $("saEditName").value.trim(),
                remarks: $("saEditRemarks").value.trim()
            });
            modalOf(editEl).hide();
            await load();
        } catch (e) {
            showErr("saEditError", e.message || "Sub Area update failed.");
        } finally { busy(f, false); }
    });

    document.addEventListener("click", async function (ev) {
        var b = ev.target.closest("#saBody .sa-del");
        if (!b) { return; }
        var id = Number(b.dataset.id);
        var r = rows.filter(function (x) { return x.id === id; })[0];
        if (!r) { return; }

        var ok;
        if (window.Swal) {
            var s = await window.Swal.fire({
                icon: "warning", title: "Delete Sub Area?",
                text: 'Are you sure you want to delete "' + r.name + '"?',
                showCancelButton: true, confirmButtonText: "Yes", cancelButtonText: "Cancel"
            });
            ok = s.isConfirmed;
        } else {
            ok = window.confirm('Are you sure you want to delete "' + r.name + '"?');
        }
        if (!ok) { return; }

        try {
            await post("/areas/sub-delete", { area_id: cur.id, id: r.id });
            await load();
            refreshAreaPage();
        } catch (e) {
            notify(e.message || "Sub Area delete failed.", "error");
        }
    });

    listEl.addEventListener("hidden.bs.modal", refreshAreaPage);
})();
