"use strict";

/*
| Config পেজে Edit চাপলে একই পেজের উপর "Edit Mikrotik" মডাল (স্ক্রিনশট ২)।
| mikrotik.js এর পরে লোড করুন।
| PUT /api/router/:id   (password খালি = আগেরটাই থাকবে)
*/

window.addEventListener("mk:edit-router", async event => {

    const id = Number(event.detail && event.detail.id);
    const root = document.getElementById("modalRoot");

    if (!id || !root) { return; }

    let router;

    try {
        const res = await fetch("/api/router", { credentials: "same-origin" });
        const data = await res.json();
        router = (data.routers || []).find(r => Number(r.id) === id);
        if (!router) { throw new Error("Router not found."); }
    } catch (error) {
        MkToast.error(error.message);
        return;
    }

    const esc = v => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;").replaceAll('"', "&quot;");

    root.innerHTML = `
        <div class="modal fade rt-modal" id="cfgEditModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Edit Mikrotik</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <form id="cfgEditForm" autocomplete="off">
                        <div class="modal-body">
                            <div class="mb-3"><label class="form-label">Mikrotik Name</label>
                                <input type="text" name="name" class="form-control" value="${esc(router.name)}" required></div>
                            <div class="mb-3"><label class="form-label">Mikrotik User Name</label>
                                <input type="text" name="username" class="form-control" value="${esc(router.username)}" required></div>
                            <div class="mb-3"><label class="form-label">Mikrotik IP</label>
                                <input type="text" name="ip" class="form-control" value="${esc(router.ip)}" required></div>
                            <div class="mb-3"><label class="form-label">Mikrotik Api Port</label>
                                <input type="number" name="port" class="form-control" value="${esc(router.port)}" required></div>
                            <div class="mb-1"><label class="form-label">Mikrotik User Password</label>
                                <input type="password" name="password" class="form-control" autocomplete="new-password"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="submit" class="btn btn-success">Save</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    const el = document.getElementById("cfgEditModal");
    const form = document.getElementById("cfgEditForm");
    const modal = bootstrap.Modal.getOrCreateInstance(el);

    modal.show();

    form.addEventListener("submit", async e => {

        e.preventDefault();

        const btn = form.querySelector('button[type="submit"]');
        const payload = Object.fromEntries(new FormData(form));

        if (!payload.password) { delete payload.password; }

        btn.disabled = true;

        try {

            const res = await fetch(`/api/router/${id}`, {
                method: "PUT",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok || data.status === false || data.success === false) {
                throw new Error(data.message || "Update failed.");
            }

            const set = (elId, v) => { const n = document.getElementById(elId); if (n) { n.textContent = v; } };

            set("routerName", payload.name);
            set("routerIp", payload.ip);
            set("routerUsername", payload.username);
            set("routerPort", payload.port);
            set("routerTitle", `${payload.name} Configuration`);

            modal.hide();
            MkToast.success("Mikrotik Updated");

        } catch (error) {
            MkToast.error(error.message);
        } finally {
            btn.disabled = false;
        }
    });
});
