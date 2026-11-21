"use strict";

/*
|--------------------------------------------------------------------------
| CROSS CUSTOMER  (controllers/mikrotik/router-cross.controller.js)
|--------------------------------------------------------------------------
| GET    /api/router/:id/customers/extra-netfee
|        NetFee (customers টেবিল) এ আছে, MikroTik এ নেই  (শুধু পড়ে, কিছু বদলায় না)
|
| DELETE /api/router/:id/customers/extra-netfee/:customerId
|        সেই গ্রাহককে soft-delete (deleted_at = NOW())। ডাটা মোছা হয় না।
|
| DELETE /api/router/:id/customers/mikrotik/:username
|        MikroTik এর /ppp/secret থেকে সেই user মোছে।
|        শুধু যদি NetFee তে সেই user না থাকে (সার্ভারে আবার যাচাই হয়)।
|
| Extra Mikrotik Users এর লিস্ট আগের /customers/sync-preview থেকেই আসে।
|--------------------------------------------------------------------------
*/

const db = require("../../config/database");
const { RouterOSAPI } = require("node-routeros");

const DELETE_ROLES = ["super_admin", "admin", "manager"];


function authUser(req) {
    const session = req.session || {};
    const user = req.user || {};

    const role = String(user.role || session.role || "").trim().toLowerCase();

    return {
        id: Number(user.id ?? user.user_id ?? session.user_id ?? 0),
        role,
        companyId: Number(user.company_id ?? session.company_id ?? 0),
        isSuper: role === "super_admin"
    };
}

function fail(res, status, message) {
    return res.status(status).json({ status: false, success: false, message });
}

async function query(sql, params = []) {
    const [rows] = await db.execute(sql, params);
    return rows;
}

async function getRouter(user, id) {
    let sql = `
        SELECT id, company_id, name, ip, username, password, port, use_ssl, timeout
        FROM mikrotik_servers
        WHERE id = ?
    `;
    const params = [id];

    if (!user.isSuper) {
        sql += " AND company_id = ?";
        params.push(user.companyId);
    }

    const rows = await query(sql + " LIMIT 1", params);
    return rows[0] || null;
}

function connect(router) {
    return new RouterOSAPI({
        host: String(router.ip),
        user: String(router.username),
        password: String(router.password),
        port: Number(router.port || 8728),
        timeout: Number(router.timeout || 3),
        tls: Boolean(Number(router.use_ssl || 0))
    });
}

async function withApi(router, fn) {
    const api = connect(router);
    await api.connect();

    try {
        return await fn(api);
    } finally {
        try { await api.close(); } catch (_) {}
    }
}

function routerId(req) {
    const id = Number(req.params.id);
    return Number.isInteger(id) && id > 0 ? id : 0;
}


/* ---------- EXTRA MIKROTIK USERS (PREVIEW) ---------- */

async function syncPreview(req, res) {
    try {
        const id = routerId(req);

        if (!id) {
            return fail(res, 400, "Invalid router ID.");
        }

        const user = authUser(req);
        const router = await getRouter(user, id);

        if (!router) {
            return fail(res, 404, "Router not found or access denied.");
        }

        const companyId = Number(router.company_id || 0);

        if (companyId <= 0) {
            return fail(res, 403, "Router company is not configured.");
        }

        // Read PPP secrets from MikroTik. No RouterOS changes.
        const secrets = await withApi(router, api =>
            api.write("/ppp/secret/print")
        );

        if (!Array.isArray(secrets)) {
            return fail(res, 500, "Failed to read MikroTik PPP users.");
        }

        // Find customers already registered in this router and company.
        const rows = await query(
            `
            SELECT pppoe_username
            FROM customers
            WHERE mikrotik_id = ?
              AND company_id = ?
              AND pppoe_username IS NOT NULL
              AND pppoe_username <> ''
            `,
            [id, companyId]
        );

        const existingUsers = new Set(
            rows.map(row =>
                String(row.pppoe_username || "").trim().toLowerCase()
            ).filter(Boolean)
        );

        // Only MikroTik users not found in this company's customer list.
        const customers = secrets
            .filter(secret => {
                const username = String(secret?.name || "").trim();

                return username &&
                    !existingUsers.has(username.toLowerCase());
            })
            .map(secret => {
                const username = String(secret.name).trim();

                const disabled = String(
                    secret?.disabled ?? "false"
                ).trim().toLowerCase();

                const isInactive = [
                    "true",
                    "yes",
                    "1"
                ].includes(disabled);

                return {
                    id: String(secret?.[".id"] || username),
                    customer_id: "",
                    pppoe_username: username,
                    status: isInactive ? "inactive" : "active",
                    payment_status: "N/A"
                };
            });

        return res.json({
            status: true,
            success: true,
            router: router.name || "",
            total: customers.length,
            customers
        });

    } catch (error) {
        console.error("MikroTik customer sync preview error:", error);
        return fail(
            res,
            500,
            error.message || "Failed to load Extra MikroTik users."
        );
    }
}

/* ---------- EXTRA Amaderbill USERS (list) ---------- */

async function extraNetfee(req, res) {
    try {
        const id = routerId(req);
        if (!id) { return fail(res, 400, "Invalid router ID."); }

        const user = authUser(req);
        const router = await getRouter(user, id);
        if (!router) { return fail(res, 404, "Router not found or access denied."); }

        const companyId = Number(router.company_id || 0);
        if (companyId <= 0) { return fail(res, 403, "Router company is not configured."); }

        const secrets = await withApi(router, api => api.write("/ppp/secret/print"));

        const onRouter = new Set(
            secrets.map(s => String(s?.name || "").trim()).filter(Boolean)
        );

        const rows = await query(
            `
            SELECT id, customer_id, pppoe_username, status, payment_status,
                   package_name, monthly_bill, balance,
                   DATE_FORMAT(created_at, '%b %d %Y %l:%i %p') AS created
            FROM customers
            WHERE mikrotik_id = ?
              AND company_id = ?
              AND deleted_at IS NULL
              AND pppoe_username IS NOT NULL
              AND pppoe_username <> ''
            ORDER BY id DESC
            `,
            [id, companyId]
        );

        const customers = rows
            .filter(r => !onRouter.has(String(r.pppoe_username).trim()))
            .map(r => ({
                id: r.id,
                customer_id: r.customer_id,
                pppoe_username: r.pppoe_username,
                status: r.status,
                payment_status: r.payment_status,
                package: r.package_name,
                monthly: Number(r.monthly_bill || 0),
                balance: Number(r.balance || 0),
                date: r.created
            }));

        return res.json({
            status: true,
            success: true,
            router: router.name || "",
            total: customers.length,
            customers
        });

    } catch (error) {
        console.error("Extra NetFee users error:", error);
        return fail(res, 500, error.message || "Failed to load users.");
    }
}


/* ---------- EXTRA NETFEE USER (soft delete) ---------- */

async function removeExtraNetfee(req, res) {
    try {
        const user = authUser(req);

        if (!DELETE_ROLES.includes(user.role)) {
            return fail(res, 403, "You do not have permission to delete customers.");
        }

        const id = routerId(req);
        const customerId = Number(req.params.customerId);

        if (!id || !Number.isInteger(customerId) || customerId <= 0) {
            return fail(res, 400, "Invalid request.");
        }

        const router = await getRouter(user, id);
        if (!router) { return fail(res, 404, "Router not found or access denied."); }

        const companyId = Number(router.company_id || 0);

        const rows = await query(
            `
            SELECT id, pppoe_username
            FROM customers
            WHERE id = ? AND mikrotik_id = ? AND company_id = ? AND deleted_at IS NULL
            LIMIT 1
            `,
            [customerId, id, companyId]
        );

        if (!rows.length) { return fail(res, 404, "Customer not found."); }

        /* সার্ভারে আবার যাচাই: এখন MikroTik এ থাকলে মোছা যাবে না */
        const username = String(rows[0].pppoe_username || "").trim();

        const found = await withApi(router, api =>
            api.write("/ppp/secret/print", [`?name=${username}`])
        );

        if (Array.isArray(found) && found.length) {
            return fail(res, 409, "This user exists on MikroTik now.");
        }

        await query(
            `UPDATE customers SET deleted_at = NOW() WHERE id = ? AND company_id = ?`,
            [customerId, companyId]
        );

        return res.json({ status: true, success: true, message: "Customer deleted." });

    } catch (error) {
        console.error("Delete extra NetFee user error:", error);
        return fail(res, 500, error.message || "Delete failed.");
    }
}


/* ---------- EXTRA MIKROTIK USER (delete secret) ---------- */

async function removeExtraMikrotik(req, res) {
    try {
        const user = authUser(req);

        if (!DELETE_ROLES.includes(user.role)) {
            return fail(res, 403, "You do not have permission to delete MikroTik users.");
        }

        const id = routerId(req);
        const username = String(req.params.username || "").trim();

        if (!id || !username) { return fail(res, 400, "Invalid request."); }

        const router = await getRouter(user, id);
        if (!router) { return fail(res, 404, "Router not found or access denied."); }

        const companyId = Number(router.company_id || 0);

        /* NetFee তে থাকলে মোছা যাবে না (এটা "extra" নয়) */
        const existing = await query(
            `
            SELECT id FROM customers
            WHERE mikrotik_id = ? AND company_id = ? AND deleted_at IS NULL
              AND pppoe_username = ?
            LIMIT 1
            `,
            [id, companyId, username]
        );

        if (existing.length) {
            return fail(res, 409, "This user exists in NetFee. Cannot delete.");
        }

        await withApi(router, async api => {
            const found = await api.write("/ppp/secret/print", [`?name=${username}`]);

            if (!Array.isArray(found) || !found.length) {
                throw new Error("User not found on MikroTik.");
            }

            await api.write("/ppp/secret/remove", [`=.id=${found[0][".id"]}`]);
        });

        return res.json({ status: true, success: true, message: "MikroTik user deleted." });

    } catch (error) {
        console.error("Delete extra MikroTik user error:", error);
        return fail(res, 500, error.message || "Delete failed.");
    }
}


module.exports = {
    syncPreview,
    extraNetfee,
    removeExtraNetfee,
    removeExtraMikrotik
};