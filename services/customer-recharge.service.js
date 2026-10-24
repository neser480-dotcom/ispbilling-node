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
| Billing rules:
|   - Existing billing_cycle remains the date anchor,
|     even when that date has passed.
|   - If billing_cycle is missing/invalid, use today.
|   - promise_date is independent and is never overwritten.
|   - Month-end dates are clamped (Jan 31 + 1 month = Feb 28/29).
|--------------------------------------------------------------------------
*/

const db = require("../config/database");
const ppp = require("./ppp.service");

const BILL_TYPES = ["Bill", "Advance"];
const BILLING_TYPES = ["Monthly", "Daily"];
const PAYMENT_METHODS = ["Hand Cash", "Bkash", "Nagad", "Bank"];

class RechargeError extends Error {
    constructor(message) {
        super(message);
        this.name = "RechargeError";
    }
}

/*
|--------------------------------------------------------------------------
| DATE HELPERS
|--------------------------------------------------------------------------
*/

function pad(n) {
    return String(n).padStart(2, "0");
}

function formatDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        throw new RechargeError("Invalid date.");
    }

    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join("-");
}

/*
 * Extract YYYY-MM-DD without allowing JavaScript to interpret a
 * MySQL DATE string as a UTC timestamp.
 */
function dateString(value) {
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            return "";
        }

        return formatDate(value);
    }

    const valueString = String(value ?? "").trim();

    const match = /^(\d{4}-\d{2}-\d{2})(?:$|[ T])/.exec(valueString);

    return match ? match[1] : "";
}

function parseDate(value) {
    const text = dateString(value);

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const date = new Date(year, month - 1, day);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
}

function daysInMonth(year, month1) {
    return new Date(year, month1, 0).getDate();
}

/*
 * Adds months while preserving the original day whenever possible.
 *
 * Examples:
 *   Jan 31 + 1 month = Feb 28/29
 *   Mar 31 + 1 month = Apr 30
 *   Nov 03 + 1 month = Dec 03
 */
function addMonthsClamped(date, months) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        throw new RechargeError("Invalid billing-cycle date.");
    }

    if (!Number.isInteger(months) || months < 1) {
        throw new RechargeError("Invalid recharge month.");
    }

    const originalDay = date.getDate();

    const target = new Date(
        date.getFullYear(),
        date.getMonth() + months,
        1
    );

    target.setDate(
        Math.min(
            originalDay,
            daysInMonth(
                target.getFullYear(),
                target.getMonth() + 1
            )
        )
    );

    return target;
}

function addMonths(date, months) {
    return addMonthsClamped(date, months);
}

function addDays(date, days) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        throw new RechargeError("Invalid billing-cycle date.");
    }

    if (!Number.isInteger(days) || days < 1) {
        throw new RechargeError("Invalid number of days.");
    }

    const result = new Date(date.getTime());
    result.setDate(result.getDate() + days);

    return result;
}

function money(value) {
    const number = Number(value);

    return (Number.isFinite(number) ? number : 0).toFixed(2);
}

function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
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

    const userId = Number(user?.user_id || 0);

    if (!Number.isInteger(userId) || userId <= 0) {
        throw new RechargeError("Company information missing.");
    }

    const [rows] = await db.query(
        `SELECT company_id
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [userId]
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

    const billingType = String(
        body.billing_type || "Monthly"
    ).trim();

    if (!BILLING_TYPES.includes(billingType)) {
        throw new RechargeError("Invalid billing type.");
    }

    const rechargeMonth = Number.parseInt(
        body.recharge_month ?? 1,
        10
    );

    if (
        !Number.isInteger(rechargeMonth) ||
        rechargeMonth < 1 ||
        rechargeMonth > 12
    ) {
        throw new RechargeError("Invalid recharge month.");
    }

    const selectedDays = Number.parseInt(
        body.selected_days ?? 30,
        10
    );

    if (
        !Number.isInteger(selectedDays) ||
        selectedDays < 1 ||
        selectedDays > 31
    ) {
        throw new RechargeError("Invalid number of days.");
    }

    let method = String(
        body.payment_method || "Hand Cash"
    ).trim();

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
        throw new RechargeError(
            "Note cannot exceed 255 characters."
        );
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
*/

async function rechargeCustomer({
    user,
    customerDbId,
    input,
    session = null
}) {
    customerDbId = Number(customerDbId);

    if (
        !Number.isInteger(customerDbId) ||
        customerDbId <= 0
    ) {
        throw new RechargeError("No customer selected.");
    }

    const companyId = await resolveCompanyId(user);
    const userId = Number(user?.user_id || 0);
    const opts = normalizeInput(input);

    const conn = await db.getConnection();

    let result;

    try {
        await conn.beginTransaction();

        /*
         * Lock the customer row to avoid concurrent recharge updates.
         */
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

        const softwareId = String(
            customer.customer_id || ""
        ).trim();

        const currentBalance = Number(customer.balance || 0);
        const monthlyBill = Number(customer.monthly_bill || 0);
        const pppoe = String(
            customer.pppoe_username || ""
        ).trim();

        const mikrotikId = Number(customer.mikrotik_id || 0);

        if (
            !Number.isFinite(monthlyBill) ||
            monthlyBill <= 0
        ) {
            throw new RechargeError(
                "Customer monthly bill is not configured."
            );
        }

        if (!Number.isFinite(currentBalance)) {
            throw new RechargeError(
                "Customer balance is invalid."
            );
        }

        /*
         * Use a date-only value for billing calculations.
         */
        const now = new Date();
        const today = formatDate(now);
        const todayDate = parseDate(today);

        if (!todayDate) {
            throw new RechargeError(
                "Unable to determine today's date."
            );
        }

        /*
         * Balance convention:
         * Negative = due
         * Positive = advance credit
         */
        const previousDue = roundMoney(
            Math.max(0, -currentBalance)
        );

        /*
         * Calculate the subscription charge.
         */
        let subscriptionAmount;

        if (opts.billingType === "Daily") {
            const daysThisMonth = daysInMonth(
                now.getFullYear(),
                now.getMonth() + 1
            );

            if (opts.selectedDays > daysThisMonth) {
                throw new RechargeError(
                    `Selected days cannot exceed ${daysThisMonth} days for the running month.`
                );
            }

            subscriptionAmount =
                (monthlyBill / daysThisMonth) *
                opts.selectedDays;
        } else {
            subscriptionAmount =
                monthlyBill * opts.rechargeMonth;
        }

        subscriptionAmount = roundMoney(subscriptionAmount);

        if (
            !Number.isFinite(subscriptionAmount) ||
            subscriptionAmount <= 0
        ) {
            throw new RechargeError(
                "Subscription amount must be greater than zero."
            );
        }

        /*
         * Discount applies to the subscription charge only.
         * It cannot reduce the previous due.
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
         * Total collected amount = discounted subscription + previous due.
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
         * Clear the old due through the collected payment.
         */
        const newBalance = roundMoney(
            currentBalance + amount
        );

        /*
         * DATE-TO-DATE BILLING
         *
         * Preserve the old billing-cycle anchor even if it has expired.
         *
         * Example:
         *   Old billing_cycle = 2026-11-03
         *   Recharge          = 1 month
         *   New billing_cycle = 2026-12-03
         *
         * If the old date is absent or invalid, start from today.
         *
         * Promise Date is deliberately NOT used as the billing base.
         */
        const oldBillingCycle = dateString(
            customer.billing_cycle
        );

        const parsedOldCycle = parseDate(oldBillingCycle);

        const base = parsedOldCycle || todayDate;

        const next = opts.billingType === "Daily"
            ? addDays(base, opts.selectedDays)
            : addMonthsClamped(
                base,
                opts.rechargeMonth
            );

        const newBillingCycle = formatDate(next);

        /*
         * Preserve the existing promise_date exactly as stored.
         * It is not changed by this recharge.
         */
        const existingPromiseDate =
            customer.promise_date ?? null;
        /*
         * Insert payment record with balance/status snapshots.
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
                    created_by,
                    balance_before,
                    balance_after,
                    billing_cycle_before,
                    promise_date_before,
                    status_before,
                    payment_status_before
                )
             VALUES (
                    ?, ?, ?, ?, NOW(),
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?
             )`,
            [
                companyId,
                customerDbId,
                amount,
                opts.paymentMethod,
                next.getMonth() + 1,
                next.getFullYear(),
                opts.billingType === "Monthly"
                    ? opts.rechargeMonth
                    : 0,
                opts.billType === "Advance" ? 1 : 0,
                opts.comment,
                userId,

                // State before recharge
                roundMoney(currentBalance),
                // State after recharge
                newBalance,
                customer.billing_cycle ?? null,
                customer.promise_date ?? null,
                customer.status ?? null,
                customer.payment_status ?? null
            ]
        );


        /*
         * Update billing/payment fields.
         * Do not update promise_date here.
         */
        await conn.query(
            `UPDATE customers
             SET balance = ?,
                 status = 'Active',
                 payment_status = 'paid',
                 billing_cycle = ?
             WHERE id = ?
               AND company_id = ?
             LIMIT 1`,
            [
                newBalance,
                newBillingCycle,
                customerDbId,
                companyId
            ]
        );

        /*
         * Activity log.
         * Logging failure must not cancel a valid recharge.
         */
        const description =
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
            ` | Billing Cycle: ${newBillingCycle}`;

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
                 VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [
                    userId,
                    companyId,
                    customerDbId,
                    "recharge",
                    description.slice(0, 500),
                    "customers"
                ]
            );
        } catch (logError) {
            console.error(
                "Recharge activity log warning:",
                logError.message
            );
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
            promise_date: existingPromiseDate,
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
        } catch (_) {
            // Preserve the original error.
        }

        throw error;
    } finally {
        conn.release();
    }

    /*
     * Restore PPPoE only after the payment transaction commits.
     *
     * A MikroTik error does not undo the committed payment.
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
            .filter(
                n => Number.isInteger(n) && n > 0
            )
    )];

    if (!clean.length) {
        throw new RechargeError(
            "Please select at least one customer."
        );
    }

    normalizeInput(input);

    const companyId = await resolveCompanyId(user);
    const session = ppp.createSession({ companyId });
    const results = [];

    try {
        for (const id of clean) {
            try {
                const rechargeResult = await rechargeCustomer({
                    user,
                    customerDbId: id,
                    input,
                    session
                });

                results.push({
                    id,
                    success: true,
                    ...rechargeResult
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

    const successCount = results.filter(
        item => item.success
    ).length;

    const mikrotikIssues = results.filter(
        item => item.success && !item.mikrotik_ok
    ).length;

    return {
        total: results.length,
        success: successCount,
        failed: results.length - successCount,
        mikrotik_issues: mikrotikIssues,
        results
    };
}

/*
|--------------------------------------------------------------------------
| BULK FORM OPTIONS
|--------------------------------------------------------------------------
| Kept separate so the Single Recharge form remains unchanged.
|--------------------------------------------------------------------------
*/

function optionsHtml() {
    const months = Array.from(
        { length: 12 },
        (_, index) => index + 1
    )
        .map(month =>
            `<option value="${month}">${month} month${month > 1 ? "s" : ""}</option>`
        )
        .join("");

    const days = Array.from(
        { length: 31 },
        (_, index) => index + 1
    )
        .map(day =>
            `<option value="${day}">${day} day${day > 1 ? "s" : ""}</option>`
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
    const customerId = Number(id);

    if (!Number.isInteger(customerId) || customerId <= 0) {
        throw new RechargeError("Invalid customer.");
    }

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
        [customerId, companyId]
    );

    const customer = rows[0];

    if (!customer) {
        throw new RechargeError("Customer not found.");
    }

    const monthlyBill = Number(customer.monthly_bill || 0);
    const balance = Number(customer.balance || 0);
    const previousDue = Math.max(0, -balance);

    const months = Array.from(
        { length: 12 },
        (_, index) => index + 1
    )
        .map(month =>
            `<option value="${month}" ${month === 1 ? "selected" : ""}>${month} ${month === 1 ? "Month" : "Months"}</option>`
        )
        .join("");

    const days = Array.from(
        { length: 31 },
        (_, index) => index + 1
    )
        .map(day =>
            `<option value="${day}" ${day === 30 ? "selected" : ""}>${day} ${day === 1 ? "Day" : "Days"}</option>`
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
           value="${Number(customer.id)}">

    <div class="d-flex align-items-center justify-content-between mb-3">
        <h5 class="mb-0 fw-bold">Recharge</h5>
        <span class="badge text-bg-primary">Customer Payment</span>
    </div>

    <div class="table-responsive mb-3">
        <table class="table table-bordered table-sm align-middle mb-0">
            <tbody>
                <tr>
                    <th class="table-light">ID</th>
                    <td>${escapeHtml(customer.customer_id)}</td>
                    <th class="table-light">PPPoE</th>
                    <td>${escapeHtml(customer.pppoe_username || "-")}</td>
                </tr>
                <tr>
                    <th class="table-light">Name</th>
                    <td>${escapeHtml(customer.name || "-")}</td>
                    <th class="table-light">Mobile</th>
                    <td>${escapeHtml(customer.phone || "-")}</td>
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
            ${escapeHtml(customer.name || "Customer")} — Recharge Details
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
            .filter(
                id => Number.isInteger(id) && id > 0
            )
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

    const summary = rows[0] || {
        total: 0,
        bill: 0
    };

    return `
<form action="/api/customers/bulk-recharge"
      method="POST"
      class="customer-ajax-form">

    <input type="hidden"
           name="ids"
           value="${clean.join(",")}">

    <div class="border rounded p-2 mb-3 small">
        <strong>${Number(summary.total || 0)}</strong> customer(s) selected
        · Total monthly bill ৳${money(summary.bill)}
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
        addMonthsClamped,
        addDays,
        daysInMonth,
        formatDate,
        dateString,
        parseDate
    }
};
