"use strict";

/*
|--------------------------------------------------------------------------
| CUSTOMER RECHARGE SERVICE
|--------------------------------------------------------------------------
| Port of:
|   customers/recharge_modal/recharge_process.php
|   customers/bulk_recharge/bulk_recharge_process.php
|
| Balance convention:  -500 = due,  0 = paid,  +500 = advance
| Amount is always calculated on the server (never trusted from browser).
|--------------------------------------------------------------------------
*/

const db = require("../config/database");
const ppp = require("./ppp.service");

const BILL_TYPES = ["Bill", "Advance"];
const BILLING_TYPES = ["Monthly", "Daily"];
const PAYMENT_METHODS = ["Hand Cash", "Bkash", "Nagad", "Bank"];


class RechargeError extends Error {}


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function pad(n) {
    return String(n).padStart(2, "0");
}

function formatDate(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(value) {

    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));

    if (!m) return null;

    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

    return Number.isNaN(d.getTime()) ? null : d;
}

function daysInMonth(year, month1) {
    return new Date(year, month1, 0).getDate();
}

/* same overflow behaviour as PHP DateTime::modify('+N months') */
function addMonths(date, months) {
    const d = new Date(date.getTime());
    d.setMonth(d.getMonth() + months);
    return d;
}

function addDays(date, days) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + days);
    return d;
}

function money(n) {
    return Number(n).toFixed(2);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/*
|--------------------------------------------------------------------------
| COMPANY
|--------------------------------------------------------------------------
*/

async function resolveCompanyId(user) {

    let companyId = Number(user.company_id || 0);

    if (companyId > 0) return companyId;

    const [rows] = await db.query(
        "SELECT company_id FROM users WHERE id = ? LIMIT 1",
        [Number(user.user_id || 0)]
    );

    companyId = Number(rows[0]?.company_id || 0);

    if (companyId > 0 && user) user.company_id = companyId;

    if (companyId <= 0) {
        throw new RechargeError("Company information missing.");
    }

    return companyId;
}


/*
|--------------------------------------------------------------------------
| INPUT VALIDATION
|--------------------------------------------------------------------------
*/

function normalizeInput(body = {}) {

    const billType = String(body.bill_type || "Bill").trim();

    if (!BILL_TYPES.includes(billType)) {
        throw new RechargeError("Invalid bill type.");
    }

    const billingType = String(body.billing_type || "Monthly").trim();

    if (!BILLING_TYPES.includes(billingType)) {
        throw new RechargeError("Invalid billing type.");
    }

    const rechargeMonth = parseInt(body.recharge_month ?? 1, 10);

    if (!(rechargeMonth >= 1 && rechargeMonth <= 12)) {
        throw new RechargeError("Invalid recharge month.");
    }

    const selectedDays = parseInt(body.selected_days ?? 1, 10);

    if (!(selectedDays >= 1 && selectedDays <= 31)) {
        throw new RechargeError("Invalid number of days.");
    }

    let method = String(body.payment_method || "Hand Cash").trim();

    if (method === "bKash") method = "Bkash";

    if (!PAYMENT_METHODS.includes(method)) {
        throw new RechargeError("Invalid payment method.");
    }

    const discount = Math.max(0, Number(body.discount || 0) || 0);

    return {
        billType,
        billingType,
        rechargeMonth,
        selectedDays,
        paymentMethod: method,
        discount,
        comment: String(body.comment || "").trim()
    };
}


/*
|--------------------------------------------------------------------------
| RECHARGE ONE CUSTOMER
|--------------------------------------------------------------------------
| 1. DB transaction (customer row locked, payment inserted, customer updated)
| 2. COMMIT
| 3. MikroTik restore - failure does NOT cancel the payment
|
| `session` is an optional ppp.createSession() shared by a bulk run.
|--------------------------------------------------------------------------
*/

async function rechargeCustomer({ user, customerDbId, input, session = null }) {

    customerDbId = Number(customerDbId);

    if (!(customerDbId > 0)) {
        throw new RechargeError("No customer selected.");
    }

    const companyId = await resolveCompanyId(user);
    const userId = Number(user.user_id || 0);

    const opts = normalizeInput(input);

    const conn = await db.getConnection();

    let result;

    try {

        await conn.beginTransaction();

        const [rows] = await conn.query(
            `SELECT id, customer_id, name, phone, monthly_bill, balance,
                    status, payment_status, promise_date, billing_cycle,
                    pppoe_username, mikrotik_id, company_id
             FROM customers
             WHERE id = ? AND company_id = ? AND deleted_at IS NULL
             LIMIT 1
             FOR UPDATE`,
            [customerDbId, companyId]
        );

        const customer = rows[0];

        if (!customer) throw new RechargeError("Customer not found.");

        const softwareId = String(customer.customer_id || "").trim();
        const currentBalance = Number(customer.balance || 0);
        const monthlyBill = Number(customer.monthly_bill || 0);
        const pppoe = String(customer.pppoe_username || "").trim();
        const mikrotikId = Number(customer.mikrotik_id || 0);

        if (!(monthlyBill > 0)) {
            throw new RechargeError("Customer monthly bill is not configured.");
        }

        const now = new Date();
        const today = formatDate(now);

        /* amount */
        let amount;

        if (opts.billingType === "Daily") {

            const dim = daysInMonth(now.getFullYear(), now.getMonth() + 1);

            if (opts.selectedDays > dim) {
                throw new RechargeError(
                    `Selected days cannot exceed ${dim} days for the running month.`
                );
            }

            amount = (monthlyBill / dim) * opts.selectedDays;

        } else {
            amount = monthlyBill * opts.rechargeMonth;
        }

        amount = Math.max(0, amount - opts.discount);

        if (!(amount > 0)) {
            throw new RechargeError("Recharge amount must be greater than zero.");
        }

        amount = Math.round(amount * 100) / 100;

        const newBalance = currentBalance + amount;

        /* base date: a future promise date is extended, otherwise today */
        let base = parseDate(today);

        const oldPromise = String(
            customer.promise_date instanceof Date
                ? formatDate(customer.promise_date)
                : (customer.promise_date || "")
        ).trim().slice(0, 10);

        if (oldPromise && oldPromise !== "0000-00-00" && oldPromise >= today) {
            base = parseDate(oldPromise) || base;
        }

        const next = opts.billingType === "Daily"
            ? addDays(base, opts.selectedDays)
            : addMonths(base, opts.rechargeMonth);

        const newPromiseDate = formatDate(next);
        const newBillingCycle = newPromiseDate;

        const [pay] = await conn.query(
            `INSERT INTO payments
                (company_id, customer_id, amount, payment_method, payment_date,
                 billing_month, billing_year, months_paid, is_advance,
                 comments, created_by)
             VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?)`,
            [
                companyId,
                customerDbId,
                amount,
                opts.paymentMethod,
                next.getMonth() + 1,
                next.getFullYear(),
                opts.rechargeMonth,
                opts.billType === "Advance" ? 1 : 0,
                opts.comment,
                userId
            ]
        );

        await conn.query(
            `UPDATE customers
             SET balance = ?, status = 'Active', payment_status = 'paid',
                 promise_date = ?, billing_cycle = ?
             WHERE id = ? AND company_id = ?
             LIMIT 1`,
            [newBalance, newPromiseDate, newBillingCycle, customerDbId, companyId]
        );

        const text =
            `Customer recharge: ${customer.name || ""}` +
            ` | Customer ID: ${softwareId}` +
            ` | Amount: ৳${money(amount)}` +
            ` | Method: ${opts.paymentMethod}` +
            ` | Billing Type: ${opts.billingType}` +
            ` | Months: ${opts.rechargeMonth}` +
            ` | Days: ${opts.selectedDays}` +
            ` | Bill Type: ${opts.billType}` +
            ` | Discount: ৳${money(opts.discount)}` +
            ` | New Promise Date: ${newPromiseDate}` +
            ` | New Billing Cycle: ${newBillingCycle}`;

        try {
            await conn.query(
                `INSERT INTO activity_logs
                    (user_id, company_id, customer_id, action, description, module, created_at)
                 VALUES (?, ?, ?, 'customer_recharge', ?, 'customers', NOW())`,
                [userId, companyId, customerDbId, text.slice(0, 500)]
            );
        } catch (_) {
            /* logging must never cancel a recharge */
        }

        await conn.commit();

        result = {
            customer_id: softwareId,
            database_customer_id: customerDbId,
            payment_id: pay.insertId,
            amount,
            balance: Math.round(newBalance * 100) / 100,
            promise_date: newPromiseDate,
            billing_cycle: newBillingCycle,
            billing_type: opts.billingType,
            recharge_month: opts.rechargeMonth,
            selected_days: opts.selectedDays,
            mikrotik_ok: true,
            _pppoe: pppoe,
            _mikrotikId: mikrotikId
        };

    } catch (error) {

        try { await conn.rollback(); } catch (_) {}

        throw error;

    } finally {

        conn.release();
    }


    /* MikroTik - after commit */
    const ownSession = !session;

    const sess = session || ppp.createSession({ companyId });

    try {

        if (result._mikrotikId > 0 && result._pppoe) {

            const api = await sess.api(result._mikrotikId);

            const secret = await ppp.findSecret(api, result._pppoe);

            if (!secret) {
                throw new Error(
                    `PPPoE customer not found on MikroTik: ${result._pppoe}`
                );
            }

            await ppp.restoreCustomer(api, {
                secret,
                routerId: result._mikrotikId,
                customerId: customerDbId
            });
        }

    } catch (error) {

        console.error(
            `Recharge MikroTik warning [${customerDbId}]:`,
            error.message
        );

        result.mikrotik_ok = false;
        result.mikrotik_error = error.message;

    } finally {

        if (ownSession) await sess.closeAll();
    }

    delete result._pppoe;
    delete result._mikrotikId;

    return result;
}


/*
|--------------------------------------------------------------------------
| BULK RECHARGE
|--------------------------------------------------------------------------
| Same options for every customer. One failure never stops the batch.
|--------------------------------------------------------------------------
*/

async function bulkRecharge({ user, ids, input }) {

    const clean = [...new Set(
        (ids || []).map(Number).filter(n => Number.isInteger(n) && n > 0)
    )];

    if (!clean.length) {
        throw new RechargeError("Please select at least one customer.");
    }

    normalizeInput(input); /* fail fast on bad options */

    const companyId = await resolveCompanyId(user);

    const session = ppp.createSession({ companyId });

    const results = [];

    try {

        for (const id of clean) {

            try {

                const r = await rechargeCustomer({
                    user,
                    customerDbId: id,
                    input,
                    session
                });

                results.push({ id, success: true, ...r });

            } catch (error) {

                results.push({
                    id,
                    success: false,
                    message: error.message
                });
            }
        }

    } finally {

        await session.closeAll();
    }

    const ok = results.filter(r => r.success).length;
    const mikrotikIssues = results.filter(r => r.success && !r.mikrotik_ok).length;

    return {
        total: results.length,
        success: ok,
        failed: results.length - ok,
        mikrotik_issues: mikrotikIssues,
        results
    };
}


/*
|--------------------------------------------------------------------------
| FRAGMENTS (HTML for the popup body)
|--------------------------------------------------------------------------
*/

function optionsHtml() {

    const months = Array.from({ length: 12 }, (_, i) => i + 1)
        .map(n => `<option value="${n}">${n} month${n > 1 ? "s" : ""}</option>`)
        .join("");

    const days = Array.from({ length: 31 }, (_, i) => i + 1)
        .map(n => `<option value="${n}">${n} day${n > 1 ? "s" : ""}</option>`)
        .join("");

    return `
<div class="row g-2">
    <div class="col-6">
        <label class="form-label small text-muted mb-1">Bill Type</label>
        <select name="bill_type" class="form-select form-select-sm">
            <option value="Bill" selected>Bill</option>
            <option value="Advance">Advance</option>
        </select>
    </div>
    <div class="col-6">
        <label class="form-label small text-muted mb-1">Billing Type</label>
        <select name="billing_type" class="form-select form-select-sm">
            <option value="Monthly" selected>Monthly</option>
            <option value="Daily">Daily</option>
        </select>
    </div>
    <div class="col-6">
        <label class="form-label small text-muted mb-1">Months (Monthly)</label>
        <select name="recharge_month" class="form-select form-select-sm">${months}</select>
    </div>
    <div class="col-6">
        <label class="form-label small text-muted mb-1">Days (Daily)</label>
        <select name="selected_days" class="form-select form-select-sm">${days}</select>
    </div>
    <div class="col-6">
        <label class="form-label small text-muted mb-1">Payment Method</label>
        <select name="payment_method" class="form-select form-select-sm">
            <option value="Hand Cash" selected>Hand Cash</option>
            <option value="Bkash">bKash</option>
            <option value="Nagad">Nagad</option>
            <option value="Bank">Bank</option>
        </select>
    </div>
    <div class="col-6">
        <label class="form-label small text-muted mb-1">Discount (৳)</label>
        <input type="number" name="discount" min="0" step="0.01" value="0"
               class="form-control form-control-sm">
    </div>
    <div class="col-12">
        <label class="form-label small text-muted mb-1">Note</label>
        <input type="text" name="comment" maxlength="255"
               class="form-control form-control-sm" placeholder="Optional">
    </div>
</div>
<div class="form-text mt-2">
    Amount is calculated on the server from the customer's monthly bill
    (Daily = monthly bill ÷ days of the running month).
</div>`;
}

async function rechargeFragment({ user, id }) {

    const companyId = await resolveCompanyId(user);

    const [rows] = await db.query(
        `SELECT id, customer_id, name, phone, pppoe_username, monthly_bill, balance
         FROM customers
         WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1`,
        [Number(id), companyId]
    );

    const c = rows[0];

    if (!c) throw new RechargeError("Customer not found.");

    return `
<form action="/api/customers/recharge" method="POST" class="customer-ajax-form">
    <input type="hidden" name="customer_id" value="${Number(c.id)}">
    <div class="border rounded p-2 mb-3 small">
        <div><strong>${escapeHtml(c.name)}</strong>
            <span class="text-muted">(${escapeHtml(c.customer_id)})</span></div>
        <div>PPPoE: ${escapeHtml(c.pppoe_username)} · Mobile: ${escapeHtml(c.phone)}</div>
        <div>Monthly bill: ৳${money(c.monthly_bill || 0)} ·
             Balance: ৳${money(c.balance || 0)}</div>
    </div>
    ${optionsHtml()}
    <div class="text-end mt-3">
        <button type="submit" class="btn btn-primary btn-sm">Recharge</button>
    </div>
</form>`;
}

async function bulkRechargeFragment({ user, ids }) {

    const clean = [...new Set(
        (ids || []).map(Number).filter(n => Number.isInteger(n) && n > 0)
    )];

    if (!clean.length) throw new RechargeError("No customers selected.");

    const companyId = await resolveCompanyId(user);

    const [rows] = await db.query(
        `SELECT COUNT(*) AS total, COALESCE(SUM(monthly_bill),0) AS bill
         FROM customers
         WHERE id IN (?) AND company_id = ? AND deleted_at IS NULL`,
        [clean, companyId]
    );

    return `
<form action="/api/customers/bulk-recharge" method="POST" class="customer-ajax-form">
    <input type="hidden" name="ids" value="${clean.join(",")}">
    <div class="border rounded p-2 mb-3 small">
        <strong>${Number(rows[0].total)}</strong> customer(s) selected ·
        Total monthly bill ৳${money(rows[0].bill)}
    </div>
    ${optionsHtml()}
    <div class="text-end mt-3">
        <button type="submit" class="btn btn-primary btn-sm">Recharge All</button>
    </div>
</form>`;
}


module.exports = {
    RechargeError,
    normalizeInput,
    rechargeCustomer,
    bulkRecharge,
    rechargeFragment,
    bulkRechargeFragment,
    _test: { addMonths, addDays, formatDate, parseDate }
};
