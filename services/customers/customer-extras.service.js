"use strict";

const db = require("../../config/database");
const bcrypt = require("bcrypt");
const ppp = require("../ppp.service");
const bulk = require("./customer-bulk.service");

const { esc, BulkError, companyIdOf, isSuperAdmin, customerScope } = bulk;

const DEFAULT_PASSWORD = "123456";
const TICKET_TYPES = ["Complaint", "Request", "Inquiry", "Other"];
const TICKET_CATEGORIES = ["Connection Problem", "Slow Speed", "Billing", "Package Change", "Cable / Hardware", "Other"];

const STYLE = `<style>
.nf-pad{padding:16px;box-sizing:border-box;width:100%}
.nf-pad .form-check{position:relative;display:block;min-height:1.5rem;padding-left:1.75em!important;margin:0 0 14px!important}
.nf-pad .form-check .form-check-input{position:absolute;left:0;top:.2em;float:none;margin:0!important;width:1.1em;height:1.1em;border:1px solid #adb5bd!important;background-color:#fff;border-radius:50%;appearance:none;-webkit-appearance:none}
.nf-pad .form-check .form-check-input:checked{border-color:#0d6efd!important;background-color:#fff;background-image:radial-gradient(circle,#0d6efd 45%,transparent 50%)}
.nf-pad .form-check .form-check-label{display:inline-block;cursor:pointer;color:#212529}
.nf-pad .btn{white-space:nowrap}
#customerActionModal.nf-ex-nohead .modal-header{display:none!important}
#customerActionModal.nf-ex-nohead .modal-body{padding-top:1rem}
/* no inner scrollbars: the popup itself scrolls like the reference */
#customerActionModal.nf-ex.modal{overflow-y:auto!important}
#customerActionModal.nf-ex .modal-dialog{max-height:none!important;margin:1.75rem auto!important}
#customerActionModal.nf-ex .modal-content{max-height:none!important;overflow:visible!important}
#customerActionModal.nf-ex .modal-body{max-height:none!important;overflow:visible!important}
#customerActionModal.nf-ex .table-responsive{overflow:visible!important}
.nf-note-item{border-bottom:1px solid #e5e7eb;padding:8px 4px;text-align:left}
.nf-note-item small{color:#6b7280}.nf-note-empty{text-align:center;padding:6px 0 10px}
.nf-hr{border:0;border-top:1px solid #d1d5db;margin:10px 0 14px}
.nf-rp-manual{display:none;margin:6px 0 0 24px}.nf-rp-manual.open{display:block}
.nf-rp-foot{display:flex;justify-content:flex-end;gap:8px;border-top:1px solid #e5e7eb;margin:14px -16px -16px;padding:12px 16px;background:#fff}
.nf-act-head{background:#2f86e8;color:#fff;border-radius:6px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.nf-act-head h5{margin:0;font-weight:700;color:#fff;font-size:24px;display:flex;align-items:center;gap:12px}
.nf-act-head .nf-back{background:transparent;border:0;color:#fff;font-size:16px;padding:0;cursor:pointer}
.nf-head-btns{display:flex;gap:10px}
.nf-head-btns .btn{background:#fff;color:#2f86e8;border:0;width:34px;height:34px;border-radius:6px;padding:0}
.nf-act-bar{background:#2f86e8;color:#fff;border-radius:6px;padding:8px 14px;display:flex;align-items:center;gap:8px;margin-bottom:10px;box-shadow:0 2px 6px rgba(47,134,232,.35)}
.nf-pill{background:#1d5fb8;border-radius:12px;padding:1px 12px;font-size:12px}
.nf-act-bar .nf-act-search{margin-left:auto;width:330px;background:#2b7bdc;border:1px solid #5aa0ee;color:#fff}
.nf-act-bar .nf-act-search::placeholder{color:#dbeafe}
.nf-act .nf-act-filter{display:none;gap:8px;flex-wrap:wrap;margin-bottom:10px}.nf-act .nf-act-filter.open{display:flex}
.nf-act-table{font-size:13px;color:#555;margin:0}
.nf-act-table thead th{font-weight:700;color:#444;border-bottom:0;padding:12px 8px;white-space:nowrap;user-select:none}
.nf-act-table thead th.nf-sort{cursor:pointer}
.nf-arr{color:#2f86e8;font-size:11px;font-weight:700}
.nf-act-table tbody td{border:0;padding:10px 8px;vertical-align:middle}
.nf-act-table tbody tr:nth-child(odd) td{background:#f1f1f1}
.nf-act-table tbody tr:nth-child(even) td{background:#fff}
.nf-act .badge-act,.nf-act .badge-del,.nf-act .badge-mod{color:#fff;font-size:10px;font-weight:700;padding:3px 7px;border-radius:5px;text-transform:uppercase;display:inline-block}
.nf-act .badge-act{background:#198754}.nf-act .badge-del{background:#dc3545}.nf-act .badge-mod{background:#0dcaf0;text-transform:none}
.nf-act .badge-role{background:#0d6efd;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;display:inline-block;margin-top:2px}
.nf-eye{background:#fff;border:1px solid #2f86e8;color:#2f86e8;border-radius:5px;width:28px;height:28px;padding:0;cursor:pointer}
.nf-act-empty{display:none;text-align:center;padding:24px;color:#888}
.nf-use-svg{width:100%;height:auto}
</style>`;

function uid(user) {
    return Number(user?.user_id || user?.userId || user?.id || 0);
}

function fmtDate(v) {
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d)) return "";
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtBytes(n) {
    n = Number(n) || 0;
    const u = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return n.toFixed(i ? 2 : 0) + " " + u[i];
}

async function getCustomer(user, id) {
    id = Number(id);
    if (!Number.isInteger(id) || id <= 0) throw new BulkError("Invalid customer.");
    const scope = await customerScope(user, "c");
    const [rows] = await db.query(
        `SELECT c.id, c.company_id, c.name, c.phone, c.mikrotik_id, c.pppoe_username
         FROM customers c WHERE c.id = ? ${scope.sql} LIMIT 1`,
        [id, ...scope.params]
    );
    if (!rows.length) throw new BulkError("Customer not found.", 404);
    return rows[0];
}

async function actorName(user) {
    try {
        const [r] = await db.query("SELECT name FROM users WHERE id = ? LIMIT 1", [uid(user)]);
        return String(r[0]?.name || user?.name || user?.username || "").slice(0, 100);
    } catch (e) {
        return String(user?.name || user?.username || "").slice(0, 100);
    }
}

async function log(user, customer, action, description, req) {
    try {
        await db.query(
            `INSERT INTO activity_logs (company_id,user_id,customer_id,user_name,action,description,module,ip_address,role_name,created_at)
             VALUES (?,?,?,?,?,?, 'customers', ?, ?, NOW())`,
            [customer.company_id || (await companyIdOf(user)), uid(user), customer.id, await actorName(user), action,
             String(description || "").slice(0, 500), String(req?.ip || "").slice(0, 45), String(user?.role || "").slice(0, 50)]
        );
    } catch (e) {
        console.warn("CUSTOMER ACTIVITY LOG WARNING:", e.message);
    }
}

/* ---------------- NOTE ---------------- */

async function noteFragment(user, id) {
    const c = await getCustomer(user, id);
    const [rows] = await db.query(
        "SELECT note, created_by_name, created_at FROM customer_notes WHERE customer_pk = ? AND company_id = ? ORDER BY id DESC LIMIT 100",
        [c.id, c.company_id || 0]
    );
    const list = rows.length
        ? rows.map(r => `<div class="nf-note-item"><div>${esc(r.note).replace(/\n/g, "<br>")}</div><small>${esc(r.created_by_name || "")} &middot; ${esc(fmtDate(r.created_at))}</small></div>`).join("")
        : `<div class="nf-note-empty">Data Not Found!</div>`;
    return `${STYLE}<div class="nf-note-wrap nf-pad" data-width="1140" data-title="${esc(c.name || "Note")}" data-wide="1" data-customer-id="${c.id}">
        ${list}<hr class="nf-hr">
        <form class="nf-note-form">
            <textarea name="note" class="form-control" rows="3" placeholder="Note" required></textarea>
            <div class="d-flex justify-content-end gap-2 mt-3">
                <button type="submit" class="btn btn-outline-success btn-sm">Submit</button>
                <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
            </div></form></div>`;
}

async function saveNote(user, req) {
    bulk.checkCsrf(req.session, req.body);
    const c = await getCustomer(user, req.body.customer_id);
    const note = String(req.body.note || "").trim();
    if (!note) throw new BulkError("Note cannot be empty.");
    await db.query(
        "INSERT INTO customer_notes (company_id,customer_pk,note,created_by,created_by_name) VALUES (?,?,?,?,?)",
        [c.company_id || 0, c.id, note.slice(0, 2000), uid(user), await actorName(user)]
    );
    await log(user, c, "customer_note", `Note added for ${c.name}`, req);
    return { success: true, message: "Note saved." };
}

/* ---------------- ACTIVITY LOG ---------------- */

async function activityFragment(user, id) {
    const c = await getCustomer(user, id);
    const [rows] = await db.query(
        `SELECT user_name, role_name, module, action, description, ip_address, created_at FROM activity_logs
         WHERE customer_id = ? AND (company_id = ? OR company_id IS NULL) ORDER BY id DESC LIMIT 300`,
        [c.id, c.company_id || 0]
    );
    const uniq = k => [...new Set(rows.map(r => String(r[k] || "")).filter(Boolean))];
    const opts = arr => arr.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    const actLabel = a => String(a || "").replace(/^customer_/, "").replace(/_/g, " ");
    const actClass = a => (/delete|remove/i.test(a) ? "badge-del" : "badge-act");
    const body = rows.map((r, i) => `<tr data-author="${esc(r.user_name || "")}" data-action="${esc(r.action || "")}">
        <td class="nf-act-no" data-sort="${i + 1}">${i + 1}</td>
        <td>${esc(r.description || "")}</td>
        <td><span class="badge-mod">${esc(r.module || "customer")}</span></td>
        <td>${esc(r.ip_address || "")}</td>
        <td>${esc(r.user_name || "")}<br>${r.role_name ? `<span class="badge-role">${esc(r.role_name)}</span>` : ""}</td>
        <td><span class="${actClass(r.action)}">${esc(actLabel(r.action))}</span></td>
        <td data-sort="${new Date(r.created_at).getTime() || 0}">${esc(fmtDate(r.created_at))}</td>
        <td><button type="button" class="nf-eye nf-act-view" data-desc="${esc(r.description || "")}"
            data-action="${esc(r.action || "")}" data-author="${esc(r.user_name || "")}" data-ip="${esc(r.ip_address || "")}"
            data-date="${esc(fmtDate(r.created_at))}"><i class="fa-regular fa-eye"></i></button></td></tr>`).join("");
    const th = (t, sort) => sort ? `<th class="nf-sort">${t} <span class="nf-arr">&#8645;</span></th>` : `<th>${t}</th>`;
    return `${STYLE}<div class="nf-act nf-pad" data-nohead="1" data-width="1140" data-title="${esc(c.name || "")} Activity Log" data-wide="1" data-customer-id="${c.id}">
        <div class="nf-act-head">
            <h5><button type="button" class="nf-back" data-bs-dismiss="modal" title="Back"><i class="fa-solid fa-arrow-left"></i></button>${esc(c.name || "")} Activity Log</h5>
            <div class="nf-head-btns">
                <button type="button" class="btn btn-sm nf-act-toggle" title="Filter"><i class="fa-solid fa-filter"></i></button>
                <button type="button" class="btn btn-sm nf-act-refresh" title="Refresh"><i class="fa-solid fa-rotate"></i></button>
            </div></div>
        <div class="nf-act-filter">
            <select class="form-select form-select-sm nf-act-by" style="width:auto"><option value="">All users</option>${opts(uniq("user_name"))}</select>
            <select class="form-select form-select-sm nf-act-act" style="width:auto"><option value="">All actions</option>${opts(uniq("action"))}</select>
            <button type="button" class="btn btn-sm btn-success nf-act-apply">Apply</button>
            <button type="button" class="btn btn-sm btn-secondary nf-act-reset">Reset</button></div>
        <div class="nf-act-bar"><i class="fa-solid fa-gear"></i> <span>Total Data:</span> <span class="nf-act-count nf-pill">${rows.length}</span>
            <input class="form-control form-control-sm nf-act-search" placeholder="Search"></div>
        <div class="table-responsive"><table class="table align-middle nf-act-table">
            <thead><tr>${th("#", 1)}${th("Description", 1)}${th("Module", 1)}${th("IP Address", 1)}${th("Role", 1)}${th("Action", 1)}${th("Date", 1)}${th("View", 0)}</tr></thead>
            <tbody>${body}</tbody></table></div>
        <div class="nf-act-empty" style="${rows.length ? "" : "display:block"}">Data Not Found!</div></div>`;
}

/* ---------------- RESET PASSWORD ---------------- */

function resetFragment(c) {
    return `${STYLE}<div class="nf-rp-wrap nf-pad" data-width="460" data-title="Reset Password" data-customer-id="${c.id}">
        <form class="nf-rp-form">
            <div class="form-check mb-3"><input class="form-check-input" type="radio" name="type" id="rpDef" value="default" checked>
                <label class="form-check-label" for="rpDef">Default Password</label></div>
            <div class="form-check mb-3"><input class="form-check-input" type="radio" name="type" id="rpMob" value="mobile">
                <label class="form-check-label" for="rpMob">Mobile number password</label></div>
            <div class="form-check mb-1"><input class="form-check-input" type="radio" name="type" id="rpMan" value="manual">
                <label class="form-check-label" for="rpMan">Manually Password</label></div>
            <div class="nf-rp-manual"><input type="text" name="password" class="form-control form-control-sm" placeholder="New password" autocomplete="off"></div>
            <div class="nf-rp-foot">
                <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-outline-success btn-sm">Save</button></div></form></div>`;
}

async function resetFragmentFor(user, id) {
    return resetFragment(await getCustomer(user, id));
}

async function resetPassword(user, req) {
    bulk.checkCsrf(req.session, req.body);

    const c = await getCustomer(user, req.body.customer_id);
    const type = String(req.body.type || "default");

    let pass;

    if (type === "mobile") {
        pass = String(c.phone || "").trim();

        if (!pass) {
            throw new BulkError("Customer has no mobile number.");
        }
    } else if (type === "manual") {
        pass = String(req.body.password || "").trim();

        if (pass.length < 4) {
            throw new BulkError("Password must be at least 4 characters.");
        }
    } else {
        pass = DEFAULT_PASSWORD;
    }

    if (/[\s"']/.test(pass) || pass.length > 64) {
        throw new BulkError("Password has invalid characters or is too long.");
    }

    // Customer App requires bcrypt password hash.
    const passwordHash = await bcrypt.hash(pass, 12);

    const [accounts] = await db.query(
        `SELECT id FROM customer_mobile_accounts
         WHERE customer_pk = ? AND company_id = ?
         LIMIT 1`,
        [c.id, c.company_id]
    );

    if (accounts.length) {
        await db.query(
            `UPDATE customer_mobile_accounts
             SET password_hash = ?
             WHERE customer_pk = ? AND company_id = ?`,
            [passwordHash, c.id, c.company_id]
        );
    } else {
        await db.query(
            `INSERT INTO customer_mobile_accounts
             (company_id, customer_pk, password_hash, status, must_change_password)
             VALUES (?, ?, ?, 'active', 1)`,
            [c.company_id, c.id, passwordHash]
        );
    }

    await log(
        user,
        c,
        "customer_reset_password",
        `Customer App password reset (${type}) for ${c.name}`,
        req
    );

    return {
        success: true,
        message: "Customer App password reset successfully."
    };
}

/* ---------------- DATA USAGE ---------------- */

async function usageFragment(user, id, monthRaw) {
    const c = await getCustomer(user, id);
    const now = new Date();
    let y = now.getFullYear(), m = now.getMonth() + 1;
    const mm = /^(\d{4})-(\d{2})$/.exec(String(monthRaw || ""));
    if (mm && Number(mm[2]) >= 1 && Number(mm[2]) <= 12) { y = Number(mm[1]); m = Number(mm[2]); }
    const first = `${y}-${String(m).padStart(2, "0")}-01`;
    const dim = new Date(y, m, 0).getDate();
    const pppoe = String(c.pppoe_username || "").trim();
    let rows = [];
    if (pppoe) {
        [rows] = await db.query(
            `SELECT DAY(day) d, SUM(rx_bytes) rx, SUM(tx_bytes) tx FROM customer_traffic_daily
             WHERE username = ? AND (company_id = ? OR company_id = 0) AND day >= ? AND day < DATE_ADD(?, INTERVAL 1 MONTH)
             GROUP BY day ORDER BY day`,
            [pppoe, c.company_id || 0, first, first]
        );
    }
    const GB = 1073741824;
    const map = new Map(rows.map(r => [Number(r.d), r]));
    const series = [];
    for (let d = 1; d <= dim; d++) {
        const r = map.get(d);
        // rx = received from the customer (upload), tx = sent to the customer (download); values in GB
        series.push({ d, up: Number(r?.rx || 0) / GB, down: Number(r?.tx || 0) / GB });
    }
    const totUp = series.reduce((a, s) => a + s.up, 0), totDown = series.reduce((a, s) => a + s.down, 0);
    const rawMax = Math.max(0.001, ...series.map(s => Math.max(s.up, s.down)));
    const mag = Math.pow(10, Math.floor(Math.log10(rawMax)));
    const step = [1, 2, 2.5, 5, 10].map(k => k * mag / 1).find(v => rawMax / v <= 7) || mag * 10;
    const top = Math.ceil(rawMax / step) * step;
    const W = 860, H = 340, L = 64, R = 12, T = 14, B = 54, pw = W - L - R, ph = H - T - B, gw = pw / dim, bw = gw * 0.38;
    const fmtTick = v => (step < 1 ? v.toFixed(2) : v.toLocaleString("en-US", { maximumFractionDigits: 1 }));
    let g = "";
    for (let v = 0; v <= top + step / 1000; v += step) {
        const yy = T + ph - (v / top) * ph;
        g += `<line x1="${L}" y1="${yy}" x2="${W - R}" y2="${yy}" stroke="#333" stroke-opacity=".75"/><text x="${L - 6}" y="${yy + 3}" font-size="10" text-anchor="end" fill="#444">${fmtTick(v)}</text>`;
    }
    series.forEach((s, i) => {
        const x = L + i * gw, hu = (s.up / top) * ph, hd = (s.down / top) * ph;
        g += `<rect x="${x + gw * 0.08}" y="${T + ph - hu}" width="${bw}" height="${hu}" fill="#4f81bd"><title>Day ${s.d} Upload ${s.up.toFixed(2)} GB</title></rect>`;
        g += `<rect x="${x + gw * 0.08 + bw}" y="${T + ph - hd}" width="${bw}" height="${hd}" fill="#c0504d"><title>Day ${s.d} Download ${s.down.toFixed(2)} GB</title></rect>`;
        g += `<text x="${x + gw / 2}" y="${T + ph + 14}" font-size="10" text-anchor="middle" fill="#444">${s.d}</text>`;
    });
    g += `<text transform="translate(14 ${T + ph / 2}) rotate(-90)" font-size="12" text-anchor="middle" fill="#333">Data Consumed (GB)</text>`;
    g += `<rect x="${W / 2 - 110}" y="${H - 22}" width="10" height="10" fill="#4f81bd"/><text x="${W / 2 - 96}" y="${H - 13}" font-size="11" font-weight="600">Upload: ${totUp.toFixed(2)} GB</text>`;
    g += `<rect x="${W / 2 + 20}" y="${H - 22}" width="10" height="10" fill="#c0504d"/><text x="${W / 2 + 34}" y="${H - 13}" font-size="11" font-weight="600">Download: ${totDown.toFixed(2)} GB</text>`;
    const opts = [];
    for (let i = 0; i < 12; i++) {
        const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const v = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
        opts.push(`<option value="${v}"${dt.getFullYear() === y && dt.getMonth() + 1 === m ? " selected" : ""}>${v}</option>`);
    }
    return `${STYLE}<div class="nf-use nf-pad" data-width="910" data-title="${esc(c.name || "")} Data Usage Report" data-wide="1" data-customer-id="${c.id}">
        <div class="d-flex justify-content-end mb-1"><select class="form-select form-select-sm nf-use-days" style="width:auto">${opts.join("")}</select></div>
        ${pppoe ? "" : '<div class="alert alert-warning py-2 small">No PPPoE username.</div>'}
        <svg class="nf-use-svg" viewBox="0 0 ${W} ${H}">${g}</svg></div>`;
}

/* ---------------- TICKET ---------------- */

async function ticketFragment(user, id) {
    const c = await getCustomer(user, id);
    const [staff] = await db.query("SELECT id, name FROM staff WHERE company_id = ? ORDER BY name", [c.company_id || 0]);
    const opt = arr => arr.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    return `${STYLE}<div class="nf-tk-wrap nf-pad" data-width="500" data-title="Create Support Ticket" data-customer-id="${c.id}">
        <form class="nf-tk-form">
            <div class="mb-2"><label class="form-label text-secondary mb-1">Enter Support Text</label>
                <input type="text" name="message" class="form-control" required></div>
            <div class="mb-2"><label class="form-label text-secondary mb-1">Select Staff</label>
                <select name="staff_id" class="form-select"><option value="">...</option>
                ${staff.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></div>
            <div class="mb-2"><label class="form-label text-secondary mb-1">Select Ticket Type</label>
                <select name="ticket_type" class="form-select" required><option value="">...</option>${opt(TICKET_TYPES)}</select></div>
            <div class="mb-2"><label class="form-label text-secondary mb-1">Select Ticket Category</label>
                <select name="category" class="form-select" required><option value="">...</option>${opt(TICKET_CATEGORIES)}</select></div>
            <div class="d-flex justify-content-end mt-3">
                <button type="submit" class="btn btn-success">Submit</button></div></form></div>`;
}

async function saveTicket(user, req) {
    bulk.checkCsrf(req.session, req.body);
    const c = await getCustomer(user, req.body.customer_id);
    const message = String(req.body.message || "").trim();
    const type = String(req.body.ticket_type || "").trim();
    const category = String(req.body.category || "").trim();
    if (!message) throw new BulkError("Text is required.");
    if (!TICKET_TYPES.includes(type)) throw new BulkError("Select a valid type.");
    if (!TICKET_CATEGORIES.includes(category)) throw new BulkError("Select a valid category.");
    let staffId = null;
    if (req.body.staff_id) {
        const [s] = await db.query("SELECT id FROM staff WHERE id = ? AND company_id = ?", [Number(req.body.staff_id), c.company_id || 0]);
        if (!s.length) throw new BulkError("Invalid staff.");
        staffId = s[0].id;
    }
    await db.query(
        `INSERT INTO customer_tickets (company_id,customer_pk,type,subject,message,status,assigned_staff_id,ticket_type,category,created_by)
         VALUES (?,?, 'ticket', ?, ?, 'open', ?, ?, ?, ?)`,
        [c.company_id || 0, c.id, `${category} - ${type}`.slice(0, 150), message.slice(0, 4000), staffId, type, category, uid(user)]
    );
    await log(user, c, "customer_ticket", `Support ticket (${category}) created for ${c.name}`, req);
    return { success: true, message: "Support ticket created." };
}

module.exports = { noteFragment, saveNote, activityFragment, resetFragmentFor, resetPassword, usageFragment, ticketFragment, saveTicket, BulkError };
