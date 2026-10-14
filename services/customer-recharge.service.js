
"use strict";

/*
|--------------------------------------------------------------------------
| CUSTOMER RECHARGE SERVICE
|--------------------------------------------------------------------------
| Single and Bulk Customer Recharge
|
| Balance convention:
|   -500 = Due
|      0 = Paid
|   +500 = Advance credit
|
| Payment amount:
|   Subscription amount - Discount + Previous Due
|
| Amount is always calculated and validated on the server.
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

    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);

    const d = new Date(year, month - 1, day);

    if (
        d.getFullYear() !== year ||
        d.getMonth() !== month - 1 ||
        d.getDate() !== day
    ) {
        return null;
    }

    return d;
}

function daysInMonth(year, month1) {
    return new Date(year, month1, 0).getDate();
}

/*
 * Retains the original JavaScript/PHP-port month overflow behavior.
 */
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
    const value = Number(n);
    return (Number.isFinite(value) ? value : 0).toFixed(2);
}

function roundMoney(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
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
    let companyId = Number(user?.company_id || 0);

    if (companyId > 0) {
        return companyId;
    }

    const [rows] = await db.query(
        "SELECT company_id FROM users WHERE id = ? LIMIT 1",
        [Number(user?.user_id || 0)]
    );

    companyId = Number(rows[0]?.company_id || 0);

    if (companyId > 0 && user) {
        user.company_id = companyId;
    }

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

    const rechargeMonth = Number.parseInt(body.recharge_month ?? 1, 10);

    if (
        !Number.isInteger(rechargeMonth) ||
        rechargeMonth < 1 ||
        rechargeMonth > 12
    ) {
        throw new RechargeError("Invalid recharge month.");
    }

    const selectedDays = Number.parseInt(body.selected_days ?? 30, 10);

    if (
        !Number.isInteger(selectedDays) ||
        selectedDays < 1 ||
        selectedDays > 31
    ) {
        throw new RechargeError("Invalid number of days.");
    }

    let method = String(body.payment_method || "Hand Cash").trim();

    if (method.toLowerCase() === "bkash") {
        method = "Bkash";
    }

    if (!PAYMENT_METHODS.includes(method)) {
        throw new RechargeError("Invalid payment method.");
    }

    const rawDiscount = Number(body.discount ?? 0);

    if (!Number.isFinite(rawDiscount) || rawDiscount < 0) {
        throw new RechargeError("Invalid discount amount.");
    }

    const comment = String(body.comment || "").trim();

    if (comment.length > 255) {
        throw new RechargeError("Note cannot exceed 255 characters.");
    }

    return {
        billType,
        billingType,
        rechargeMonth,
        selectedDays,
        paymentMethod: method,
        discount: roundMoney(rawDiscount),
        comment
    };
}

/*
|--------------------------------------------------------------------------
| RECHARGE ONE CUSTOMER
|--------------------------------------------------------------------------
| 1. Lock the customer row.
| 2. Calculate subscription + previous due.
| 3. Insert payment and update customer.
| 4. Commit database transaction.
| 5. Restore PPPoE on MikroTik.
|
| MikroTik failure does not cancel a committed payment.
|--------------------------------------------------------------------------
*/

async function rechargeCustomer({
    user,
    customerDbId,
    input,
    session = null
}) {
    customerDbId = Number(customerDbId);

    if (!Number.isInteger(customerDbId) || customerDbId <= 0) {
        throw new RechargeError("No customer selected.");
    }

    const companyId = await resolveCompanyId(user);
    const userId = Number(user?.user_id || 0);
    const opts = normalizeInput(input);

    const conn = await db.getConnection();

    let result;

    try {
        await conn.beginTransaction();

        const [rows] = await conn.query(
            `SELECT
                id,
                customer_id,
                name,
                phone,
                monthly_bill,
                balance,
                status,
                payment_status,
                promise_date,
                billing_cycle,
                pppoe_username,
                mikrotik_id,
                company_id
             FROM customers
             WHERE id = ?
               AND company_id = ?
               AND deleted_at IS NULL
             LIMIT 1
             FOR UPDATE`,
            [customerDbId, companyId]
        );

        const customer = rows[0];

        if (!customer) {
            throw new RechargeError("Customer not found.");
        }

        const softwareId = String(customer.customer_id || "").trim();
        const currentBalance = Number(customer.balance || 0);
        const monthlyBill = Number(customer.monthly_bill || 0);
        const pppoe = String(customer.pppoe_username || "").trim();
        const mikrotikId = Number(customer.mikrotik_id || 0);

        if (!Number.isFinite(monthlyBill) || monthlyBill <= 0) {
            throw new RechargeError(
                "Customer monthly bill is not configured."
            );
        }

        const now = new Date();
        const today = formatDate(now);

        /*
         * Negative balance represents previous due.
         * Positive balance represents existing advance credit.
         */
        const previousDue = roundMoney(Math.max(0, -currentBalance));

        /*
         * Calculate subscription amount.
         */
        let subscriptionAmount;

        if (opts.billingType === "Daily") {
            const dim = daysInMonth(
                now.getFullYear(),
                now.getMonth() + 1
            );

            if (opts.selectedDays > dim) {
                throw new RechargeError(
                    `Selected days cannot exceed ${dim} days for the running month.`
                );
            }

            subscriptionAmount =
                (monthlyBill / dim) * opts.selectedDays;
        } else {
            subscriptionAmount =
                monthlyBill * opts.rechargeMonth;
        }

        subscriptionAmount = roundMoney(subscriptionAmount);

        if (!Number.isFinite(subscriptionAmount) || subscriptionAmount <= 0) {
            throw new RechargeError(
                "Subscription amount must be greater than zero."
            );
        }

        /*
         * Discount applies to the subscription charge only.
         * It cannot cancel or reduce previous due.
         */
        if (opts.discount >= subscriptionAmount) {
            throw new RechargeError(
                "Discount must be less than the subscription amount."
            );
        }

        subscriptionAmount = roundMoney(
            subscriptionAmount - opts.discount
        );

        /*
         * Total payment includes previous due.
         *
         * Example:
         *   12 months subscription = 6000
         *   previous due           = 1000
         *   total payment           = 7000
         */
        const amount = roundMoney(
            subscriptionAmount + previousDue
        );

        if (!Number.isFinite(amount) || amount <= 0) {
            throw new RechargeError(
                "Recharge amount must be greater than zero."
            );
        }

        /*
         * Balance convention:
         *   current balance = -1000
         *   payment         = +7000
         *   resulting credit = +6000
         *
         * This preserves the positive advance credit representing
         * the subscription amount paid after clearing the previous due.
         */
        const newBalance = roundMoney(currentBalance + amount);

        /*
         * Extend from a future promise date, if present.
         * Otherwise start from today.
         */
        let base = parseDate(today);

        const oldPromise = String(
            customer.promise_date instanceof Date
                ? formatDate(customer.promise_date)
                : (customer.promise_date || "")
        ).trim().slice(0, 10);

        if (
            oldPromise &&
            oldPromise !== "0000-00-00" &&
            oldPromise >= today
        ) {
            base = parseDate(oldPromise) || base;
        }

        const next = opts.billingType === "Daily"
            ? addDays(base, opts.selectedDays)
            : addMonths(base, opts.rechargeMonth);

        const newPromiseDate = formatDate(next);
        const newBillingCycle = newPromiseDate;

        /*
         * Record the total collected amount, including previous due.
         */
        const [pay] = await conn.query(
            `INSERT INTO payments
                (
                    company_id,
                    customer_id,
                    amount,
                    payment_method,
                    payment_date,
                    billing_month,
                    billing_year,
                    months_paid,
                    is_advance,
                    comments,
                    created_by
                )
             VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?)`,
            [
                companyId,
                customerDbId,
                amount,
                opts.paymentMethod,
                next.getMonth() + 1,
                next.getFullYear(),
                opts.billingType === "Monthly" ? opts.rechargeMonth : 0,
                opts.billType === "Advance" ? 1 : 0,
                opts.comment,
                userId
            ]
        );

        await conn.query(
            `UPDATE customers
             SET balance = ?,
                 status = 'Active',
                 payment_status = 'paid',
                 promise_date = ?,
                 billing_cycle = ?
             WHERE id = ?
               AND company_id = ?
             LIMIT 1`,
            [
                newBalance,
                newPromiseDate,
                newBillingCycle,
                customerDbId,
                companyId
            ]
        );

        const text =
            `Customer recharge: ${customer.name || ""}` +
            ` | Customer ID: ${softwareId}` +
            ` | Subscription: ৳${money(subscriptionAmount)}` +
            ` | Previous Due: ৳${money(previousDue)}` +
            ` | Total Paid: ৳${money(amount)}` +
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
                    (
                        user_id,
                        company_id,
                        customer_id,
                        action,
                        description,
                        module,
                        created_at
                    )
                 VALUES (?, ?, ?, 'customer_recharge', ?, 'customers', NOW())`,
                [
                    userId,
                    companyId,
                    customerDbId,
                    text.slice(0, 500)
                ]
            );
        } catch (_) {
            // Activity logging must not cancel a recharge.
        }

        await conn.commit();

        result = {
            customer_id: softwareId,
            database_customer_id: customerDbId,
            payment_id: pay.insertId,
            subscription_amount: subscriptionAmount,
            previous_due: previousDue,
            amount,
            balance: newBalance,
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
        try {
            await conn.rollback();
        } catch (_) {}

        throw error;
    } finally {
        conn.release();
    }

    /*
     * MikroTik restore happens only after the payment transaction commits.
     */
    const ownSession = !session;
    const sess = session || ppp.createSession({ companyId });

    try {
        if (result._mikrotikId > 0 && result._pppoe) {
            const api = await sess.api(result._mikrotikId);

            const secret = await ppp.findSecret(
                api,
                result._pppoe
            );

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
        if (ownSession) {
            await sess.closeAll();
        }
    }

    delete result._pppoe;
    delete result._mikrotikId;

    return result;
}

/*
|--------------------------------------------------------------------------
| BULK RECHARGE
|--------------------------------------------------------------------------
*/

async function bulkRecharge({ user, ids, input }) {
    const clean = [...new Set(
        (ids || [])
            .map(Number)
            .filter(n => Number.isInteger(n) && n > 0)
    )];

    if (!clean.length) {
        throw new RechargeError("Please select at least one customer.");
    }

    normalizeInput(input);

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

                results.push({
                    id,
                    success: true,
                    ...r
                });
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
    const mikrotikIssues = results.filter(
        r => r.success && !r.mikrotik_ok
    ).length;

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
| BULK FORM OPTIONS
|--------------------------------------------------------------------------
| Kept separate so the Single Recharge redesign does not change the
| existing Bulk Recharge form layout.
|--------------------------------------------------------------------------
*/

function optionsHtml() {
    const months = Array.from({ length: 12 }, (_, i) => i + 1)
        .map(n =>
            `<option value="${n}">${n} month${n > 1 ? "s" : ""}</option>`
        )
        .join("");

    const days = Array.from({ length: 31 }, (_, i) => i + 1)
        .map(n =>
            `<option value="${n}">${n} day${n > 1 ? "s" : ""}</option>`
        )
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
        <select name="recharge_month" class="form-select form-select-sm">
            ${months}
        </select>
    </div>

    <div class="col-6">
        <label class="form-label small text-muted mb-1">Days (Daily)</label>
        <select name="selected_days" class="form-select form-select-sm">
            ${days}
        </select>
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
        <input type="number"
               name="discount"
               min="0"
               step="0.01"
               value="0"
               class="form-control form-control-sm">
    </div>

    <div class="col-12">
        <label class="form-label small text-muted mb-1">Note</label>
        <input type="text"
               name="comment"
               maxlength="255"
               class="form-control form-control-sm"
               placeholder="Optional">
    </div>
</div>

<div class="form-text mt-2">
    The server calculates the amount from the customer's monthly bill.
</div>`;
}

/*
|--------------------------------------------------------------------------
| SINGLE RECHARGE MODAL
|--------------------------------------------------------------------------
*/

async function rechargeFragment({ user, id }) {
    const companyId = await resolveCompanyId(user);

    const [rows] = await db.query(
        `SELECT
            id,
            customer_id,
            name,
            phone,
            pppoe_username,
            monthly_bill,
            balance
         FROM customers
         WHERE id = ?
           AND company_id = ?
           AND deleted_at IS NULL
         LIMIT 1`,
        [Number(id), companyId]
    );

    const c = rows[0];

    if (!c) {
        throw new RechargeError("Customer not found.");
    }

    const monthlyBill = Number(c.monthly_bill || 0);
    const balance = Number(c.balance || 0);
    const previousDue = Math.max(0, -balance);

    const months = Array.from({ length: 12 }, (_, i) => i + 1)
        .map(n =>
            `<option value="${n}" ${n === 1 ? "selected" : ""}>${n} ${n === 1 ? "Month" : "Months"}</option>`
        )
        .join("");

    const days = Array.from({ length: 31 }, (_, i) => i + 1)
        .map(n =>
            `<option value="${n}" ${n === 30 ? "selected" : ""}>${n} ${n === 1 ? "Day" : "Days"}</option>`
        )
        .join("");

    return `
<form action="/api/customers/recharge"
      method="POST"
      class="customer-ajax-form netfee-recharge-form"
      data-monthly-bill="${monthlyBill}"
      data-previous-due="${previousDue}">

    <input type="hidden"
           name="customer_id"
           value="${Number(c.id)}">

    <div class="d-flex align-items-center justify-content-between mb-3">
        <h5 class="mb-0 fw-bold">Recharge</h5>
        <span class="badge text-bg-primary">Customer Payment</span>
    </div>

    <div class="table-responsive mb-3">
        <table class="table table-bordered table-sm align-middle mb-0">
            <tbody>
                <tr>
                    <th class="table-light">ID</th>
                    <td>${escapeHtml(c.customer_id)}</td>
                    <th class="table-light">PPPoE</th>
                    <td>${escapeHtml(c.pppoe_username || "-")}</td>
                </tr>
                <tr>
                    <th class="table-light">Name</th>
                    <td>${escapeHtml(c.name || "-")}</td>
                    <th class="table-light">Mobile</th>
                    <td>${escapeHtml(c.phone || "-")}</td>
                </tr>
                <tr>
                    <th class="table-light">Monthly</th>
                    <td>৳${money(monthlyBill)}</td>
                    <th class="table-light">Balance</th>
                    <td>৳${money(balance)}</td>
                </tr>
            </tbody>
        </table>
    </div>

    <div class="border rounded p-3 mb-3">
        <div class="fw-semibold mb-3">
            ${escapeHtml(c.name || "Customer")} — Recharge Details
        </div>

        <div class="row g-3">
            <div class="col-md-6">
                <label class="form-label">Bill Type *</label>
                <select name="bill_type" class="form-select" required>
                    <option value="Bill" selected>Bill</option>
                    <option value="Advance">Advance</option>
                </select>
            </div>

            <div class="col-md-6">
                <label class="form-label">Billing Type *</label>
                <select name="billing_type"
                        class="form-select"
                        data-recharge-billing-type
                        required>
                    <option value="Monthly" selected>Monthly</option>
                    <option value="Daily">Daily</option>
                </select>
            </div>

            <div class="col-md-6" data-recharge-month-wrap>
                <label class="form-label">Select Month *</label>
                <select name="recharge_month"
                        class="form-select"
                        data-recharge-month>
                    ${months}
                </select>
            </div>

            <div class="col-md-6 d-none" data-recharge-day-wrap>
                <label class="form-label">Select Days *</label>
                <select name="selected_days"
                        class="form-select"
                        data-recharge-days
                        disabled>
                    ${days}
                </select>
            </div>

            <div class="col-md-6">
                <label class="form-label">Medium *</label>
                <select name="payment_method" class="form-select" required>
                    <option value="Hand Cash" selected>Hand Cash</option>
                    <option value="Bkash">bKash</option>
                    <option value="Nagad">Nagad</option>
                    <option value="Bank">Bank</option>
                </select>
            </div>

            <div class="col-md-6">
                <label class="form-label">Discount (৳)</label>
                <input type="number"
                       name="discount"
                       class="form-control"
                       min="0"
                       step="0.01"
                       value="0"
                       data-recharge-discount>
            </div>

            <div class="col-12">
                <label class="form-label">Note</label>
                <input type="text"
                       name="comment"
                       maxlength="255"
                       class="form-control"
                       placeholder="Optional note">
            </div>
        </div>
    </div>

    <div class="border rounded p-3">
        <div class="d-flex justify-content-between mb-2">
            <span>Subscription Bill</span>
            <strong data-recharge-subtotal>৳${money(monthlyBill)}</strong>
        </div>

        <div class="d-flex justify-content-between mb-2">
            <span>Previous Due</span>
            <strong class="text-danger">৳${money(previousDue)}</strong>
        </div>

        <div class="d-flex justify-content-between mb-2">
            <span>Discount</span>
            <strong data-recharge-discount-label>৳0.00</strong>
        </div>

        <hr>

        <div class="d-flex justify-content-between align-items-center">
            <strong>Total Payment</strong>
            <strong class="fs-4 text-primary" data-recharge-total>
                ৳${money(monthlyBill + previousDue)}
            </strong>
        </div>

        <small class="text-muted d-block mt-2">
            Previous Due is included in the total payment.
            Final amount is calculated and validated by the server.
        </small>
    </div>

    <div class="d-flex justify-content-end gap-2 mt-3">
        <button type="button"
                class="btn btn-outline-secondary"
                data-bs-dismiss="modal">
            Cancel
        </button>

        <button type="submit" class="btn btn-primary">
            Recharge
        </button>
    </div>
</form>`;
}

/*
|--------------------------------------------------------------------------
| BULK RECHARGE MODAL
|--------------------------------------------------------------------------
*/

async function bulkRechargeFragment({ user, ids }) {
    const clean = [...new Set(
        (ids || [])
            .map(Number)
            .filter(n => Number.isInteger(n) && n > 0)
    )];

    if (!clean.length) {
        throw new RechargeError("No customers selected.");
    }

    const companyId = await resolveCompanyId(user);

    const [rows] = await db.query(
        `SELECT
            COUNT(*) AS total,
            COALESCE(SUM(monthly_bill), 0) AS bill
         FROM customers
         WHERE id IN (?)
           AND company_id = ?
           AND deleted_at IS NULL`,
        [clean, companyId]
    );

    return `
<form action="/api/customers/bulk-recharge"
      method="POST"
      class="customer-ajax-form">

    <input type="hidden"
           name="ids"
           value="${clean.join(",")}">

    <div class="border rounded p-2 mb-3 small">
        <strong>${Number(rows[0].total)}</strong> customer(s) selected
        · Total monthly bill ৳${money(rows[0].bill)}
    </div>

    ${optionsHtml()}

    <div class="text-end mt-3">
        <button type="submit" class="btn btn-primary btn-sm">
            Recharge All
        </button>
    </div>
</form>`;
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
    RechargeError,
    normalizeInput,
    rechargeCustomer,
    bulkRecharge,
    rechargeFragment,
    bulkRechargeFragment,
    _test: {
        addMonths,
        addDays,
        formatDate,
        parseDate
    }
};
