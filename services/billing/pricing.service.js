"use strict";

/*
|--------------------------------------------------------------------------
| services/billing/pricing.service.js
|--------------------------------------------------------------------------
|
| Company-wise negotiated pricing (Super Admin only).
|
| - Default prices live in software_packages (signup_fee, monthly_fee).
| - A company may have ONE rule per fee type
|   (registration | monthly | yearly) in company_pricing_rules.
| - A rule is effective only while it is enabled and the current
|   Bangladesh time is inside [starts_at, expires_at).
|   Expiry is evaluated at read time, so an expired offer silently
|   falls back to the default price (no cron needed).
| - Every change writes company_pricing_history and one activity_logs
|   line inside the same transaction.
| - Existing billing amounts are never touched here.
|
| Yearly: software_packages has no yearly price, so a yearly rule can
| only be a special_price, and nothing consumes it yet.
|
| starts_at / expires_at are Bangladesh wall-clock time (UTC+6).
|--------------------------------------------------------------------------
*/

const db = require("../../config/database");

const FEE_TYPES = ["registration", "monthly", "yearly"];
const MODES = ["special_price", "fixed_discount"];
const MAX_AMOUNT = 9999999999.99;
const MAX_NOTE = 500;
const LIST_LIMIT = 200;
const HISTORY_LIMIT = 100;

const BD_OFFSET_MS = 6 * 60 * 60 * 1000;

const FEE_LABELS = {
    registration: "Registration",
    monthly: "Monthly",
    yearly: "Yearly"
};

class PricingError extends Error {
    constructor(message, httpCode = 400) {
        super(message);
        this.name = "PricingError";
        this.httpCode = httpCode;
    }
}

/*
|--------------------------------------------------------------------------
| TIME (Bangladesh wall clock)
|--------------------------------------------------------------------------
*/

function pad(n) {
    return String(n).padStart(2, "0");
}

function bdNowWall(nowMs = Date.now()) {
    const d = new Date(nowMs + BD_OFFSET_MS);

    return (
        `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
        `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
    );
}

/*
 * Accepts "YYYY-MM-DD", "YYYY-MM-DD HH:mm[:ss]" or "YYYY-MM-DDTHH:mm[:ss]".
 * Returns "YYYY-MM-DD HH:mm:ss" or null for empty input.
 * A date-only value means 00:00:00, or 23:59:59 when endOfDay is true.
 */
function parseWall(value, label, endOfDay = false) {
    if (value === undefined || value === null) {
        return null;
    }

    const text = String(value).trim();

    if (!text) {
        return null;
    }

    const m = text.match(
        /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (!m) {
        throw new PricingError(`${label} সঠিক নয়।`);
    }

    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const hasTime = m[4] !== undefined;

    const h = hasTime ? Number(m[4]) : (endOfDay ? 23 : 0);
    const mi = hasTime ? Number(m[5]) : (endOfDay ? 59 : 0);
    const s = hasTime ? Number(m[6] || 0) : (endOfDay ? 59 : 0);

    const check = new Date(Date.UTC(y, mo - 1, d, h, mi, s));

    if (
        check.getUTCFullYear() !== y ||
        check.getUTCMonth() !== mo - 1 ||
        check.getUTCDate() !== d ||
        h > 23 ||
        mi > 59 ||
        s > 59
    ) {
        throw new PricingError(`${label} সঠিক নয়।`);
    }

    return (
        `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s)}`
    );
}

/*
|--------------------------------------------------------------------------
| VALIDATION HELPERS
|--------------------------------------------------------------------------
*/

function toMoney(value, label) {
    const number = Number(value);

    if (
        value === undefined ||
        value === null ||
        String(value).trim() === "" ||
        !Number.isFinite(number) ||
        number <= 0 ||
        number > MAX_AMOUNT
    ) {
        throw new PricingError(`${label} অবশ্যই ০-এর বেশি সঠিক সংখ্যা হতে হবে।`);
    }

    return Number(number.toFixed(2));
}

function toCompanyId(value) {
    const id = Number(value);

    if (!Number.isInteger(id) || id <= 0) {
        throw new PricingError("Company ID সঠিক নয়।");
    }

    return id;
}

function toFeeType(value) {
    const feeType = String(value || "").trim().toLowerCase();

    if (!FEE_TYPES.includes(feeType)) {
        throw new PricingError("Fee type সঠিক নয়।");
    }

    return feeType;
}

function toNote(value) {
    const note = String(value ?? "").trim();

    if (note.length > MAX_NOTE) {
        throw new PricingError(`Note সর্বোচ্চ ${MAX_NOTE} অক্ষরের হতে পারবে।`);
    }

    return note || null;
}

function toBool(value, fallback = true) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;

    const text = String(value).trim().toLowerCase();

    if (["1", "true", "yes", "on"].includes(text)) return true;
    if (["0", "false", "no", "off"].includes(text)) return false;

    throw new PricingError("Enabled মান সঠিক নয়।");
}

/*
|--------------------------------------------------------------------------
| PRICE CALCULATION
|--------------------------------------------------------------------------
|
| rule: { mode, value } of a rule that is ALREADY known to be active.
| A rule that cannot produce a valid price (for example a discount that is
| now >= the default price after the package price changed) is ignored and
| the default price is used. This never returns <= 0 for a positive default.
|--------------------------------------------------------------------------
*/

function effectiveAmount(defaultAmount, rule) {
    const base = Number(defaultAmount);
    const hasBase = Number.isFinite(base) && base > 0;

    if (rule) {
        const value = Number(rule.value);

        if (Number.isFinite(value) && value > 0) {
            if (rule.mode === "special_price") {
                return {
                    amount: Number(value.toFixed(2)),
                    source: "special_price"
                };
            }

            if (
                rule.mode === "fixed_discount" &&
                hasBase &&
                value < base
            ) {
                return {
                    amount: Number((base - value).toFixed(2)),
                    source: "fixed_discount"
                };
            }
        }
    }

    return {
        amount: hasBase ? Number(base.toFixed(2)) : (Number.isFinite(base) ? base : null),
        source: "default"
    };
}

/*
|--------------------------------------------------------------------------
| SQL FRAGMENTS (used by services/monthlyBilling.js)
|--------------------------------------------------------------------------
|
| activeRuleJoinSql(alias, companyExpr, feeType)
|   LEFT JOIN of the one rule that is active right now.
|   It contains TWO "?" placeholders: pass the Bangladesh wall-clock
|   "now" string twice, in order.
|
| effectiveAmountSql(defaultExpr, alias)
|   CASE expression equal to effectiveAmount() above.
|--------------------------------------------------------------------------
*/

function activeRuleJoinSql(alias, companyExpr, feeType) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) {
        throw new Error("Invalid SQL alias.");
    }

    if (!/^[a-z_][a-z0-9_.]*$/i.test(companyExpr)) {
        throw new Error("Invalid SQL company expression.");
    }

    if (!FEE_TYPES.includes(feeType)) {
        throw new Error("Invalid fee type.");
    }

    return `
        LEFT JOIN company_pricing_rules ${alias}
          ON ${alias}.company_id = ${companyExpr}
         AND ${alias}.fee_type = '${feeType}'
         AND ${alias}.is_enabled = 1
         AND (${alias}.starts_at IS NULL OR ${alias}.starts_at <= ?)
         AND (${alias}.expires_at IS NULL OR ${alias}.expires_at > ?)
    `;
}

function effectiveAmountSql(defaultExpr, alias) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) {
        throw new Error("Invalid SQL alias.");
    }

    if (!/^[a-z_][a-z0-9_.]*$/i.test(defaultExpr)) {
        throw new Error("Invalid SQL default expression.");
    }

    return `
        (CASE
            WHEN ${alias}.id IS NULL THEN ${defaultExpr}
            WHEN ${alias}.mode = 'special_price'
                 AND ${alias}.value > 0
                THEN ${alias}.value
            WHEN ${alias}.mode = 'fixed_discount'
                 AND ${alias}.value > 0
                 AND ${alias}.value < ${defaultExpr}
                THEN ${defaultExpr} - ${alias}.value
            ELSE ${defaultExpr}
        END)
    `;
}

/*
|--------------------------------------------------------------------------
| LOOKUPS
|--------------------------------------------------------------------------
*/

const DT = "%Y-%m-%d %H:%i:%s";

function stateSql() {
    return `
        CASE
            WHEN is_enabled = 0 THEN 'disabled'
            WHEN expires_at IS NOT NULL AND expires_at <= ? THEN 'expired'
            WHEN starts_at IS NOT NULL AND starts_at > ? THEN 'scheduled'
            ELSE 'active'
        END
    `;
}

function ruleSelectSql() {
    return `
        SELECT
            id,
            company_id,
            fee_type,
            mode,
            value AS rule_amount,
            is_enabled,
            DATE_FORMAT(starts_at, '${DT}') AS starts_at,
            DATE_FORMAT(expires_at, '${DT}') AS expires_at,
            note,
            DATE_FORMAT(updated_at, '${DT}') AS updated_at,
            ${stateSql()} AS state
        FROM company_pricing_rules
    `;
}

function defaultsFromPackage(pkg) {
    return {
        registration: pkg ? Number(pkg.signup_fee) : null,
        monthly: pkg ? Number(pkg.monthly_fee) : null,
        yearly: null
    };
}

function shapeRule(row, defaultAmount) {
    const rule = {
        id: Number(row.id),
        fee_type: row.fee_type,
        mode: row.mode,
        value: Number(row.rule_amount),
        is_enabled: Number(row.is_enabled) === 1,
        starts_at: row.starts_at || null,
        expires_at: row.expires_at || null,
        note: row.note || "",
        updated_at: row.updated_at || null,
        state: row.state
    };

    const result = effectiveAmount(
        defaultAmount,
        rule.state === "active" ? rule : null
    );

    rule.default_amount = defaultAmount;
    rule.effective_amount = result.amount;
    rule.source = result.source;

    return rule;
}

function buildCompany(row, ruleRows) {
    const pkg = row.package_code
        ? { signup_fee: row.signup_fee, monthly_fee: row.monthly_fee }
        : null;

    const defaults = defaultsFromPackage(pkg);

    const rules = {};
    const effective = {};

    for (const feeType of FEE_TYPES) {
        const found = ruleRows.find(r => r.fee_type === feeType);

        rules[feeType] = found
            ? shapeRule(found, defaults[feeType])
            : null;

        const result = effectiveAmount(
            defaults[feeType],
            rules[feeType] && rules[feeType].state === "active"
                ? rules[feeType]
                : null
        );

        effective[feeType] = {
            amount: result.amount,
            source: result.source
        };
    }

    return {
        company_id: Number(row.company_id),
        company_name: row.company_name || "",
        owner_name: row.owner_name || row.fullname || "",
        username: row.username || "",
        mobile: row.mobile || "",
        status: row.status,
        package_code: row.package_code || null,
        package_name: row.package_name || null,
        defaults,
        rules,
        effective
    };
}

function escapeLike(text) {
    return text.replace(/[\\%_]/g, ch => "\\" + ch);
}

/*
|--------------------------------------------------------------------------
| LIST COMPANIES
|--------------------------------------------------------------------------
|
| A company is an ISP owner row in users where id = company_id.
|--------------------------------------------------------------------------
*/

async function listCompanies(search) {
    const term = String(search || "").trim().slice(0, 100);

    let sql = `
        SELECT
            u.id AS company_id,
            u.company_name,
            u.owner_name,
            u.fullname,
            u.username,
            u.mobile,
            u.status,
            p.package_code,
            p.package_name,
            p.signup_fee,
            p.monthly_fee
        FROM users u
        LEFT JOIN software_packages p
            ON p.id = u.package_id
        WHERE u.role = 'admin'
          AND u.company_id = u.id
    `;

    const params = [];

    if (term) {
        const like = `%${escapeLike(term)}%`;

        sql += `
          AND (
                u.company_name LIKE ?
             OR u.owner_name LIKE ?
             OR u.fullname LIKE ?
             OR u.username LIKE ?
             OR u.mobile LIKE ?
             OR CAST(u.id AS CHAR) = ?
          )
        `;

        params.push(like, like, like, like, like, term);
    }

    sql += ` ORDER BY u.id DESC LIMIT ${LIST_LIMIT}`;

    const [companies] = await db.execute(sql, params);

    if (!companies.length) {
        return [];
    }

    const ids = companies.map(c => Number(c.company_id));
    const marks = ids.map(() => "?").join(",");
    const now = bdNowWall();

    const [ruleRows] = await db.execute(
        `
        ${ruleSelectSql()}
        WHERE company_id IN (${marks})
        `,
        [now, now, ...ids]
    );

    return companies.map(company =>
        buildCompany(
            company,
            ruleRows.filter(
                r => Number(r.company_id) === Number(company.company_id)
            )
        )
    );
}

/*
|--------------------------------------------------------------------------
| COMPANY DETAIL (+ HISTORY)
|--------------------------------------------------------------------------
*/

async function loadCompanyRow(executor, companyId) {
    const [rows] = await executor.execute(
        `
        SELECT
            u.id AS company_id,
            u.company_name,
            u.owner_name,
            u.fullname,
            u.username,
            u.mobile,
            u.status,
            u.package_id,
            p.package_code,
            p.package_name,
            p.signup_fee,
            p.monthly_fee
        FROM users u
        LEFT JOIN software_packages p
            ON p.id = u.package_id
        WHERE u.id = ?
          AND u.company_id = u.id
          AND u.role = 'admin'
        LIMIT 1
        `,
        [companyId]
    );

    return rows.length ? rows[0] : null;
}

async function getCompanyDetail(companyIdInput) {
    const companyId = toCompanyId(companyIdInput);

    const row = await loadCompanyRow(db, companyId);

    if (!row) {
        throw new PricingError("কোম্পানি পাওয়া যায়নি।", 404);
    }

    const now = bdNowWall();

    const [ruleRows] = await db.execute(
        `
        ${ruleSelectSql()}
        WHERE company_id = ?
        `,
        [now, now, companyId]
    );

    const [history] = await db.execute(
        `
        SELECT
            h.id,
            h.fee_type,
            h.action,
            h.old_mode,
            h.old_value,
            h.old_enabled,
            h.new_mode,
            h.new_value,
            h.new_enabled,
            DATE_FORMAT(h.starts_at, '${DT}') AS starts_at,
            DATE_FORMAT(h.expires_at, '${DT}') AS expires_at,
            h.note,
            h.changed_by,
            COALESCE(cu.name, cu.fullname, cu.username) AS changed_by_name,
            h.ip_address,
            DATE_FORMAT(h.created_at, '${DT}') AS created_at
        FROM company_pricing_history h
        LEFT JOIN users cu
            ON cu.id = h.changed_by
        WHERE h.company_id = ?
        ORDER BY h.id DESC
        LIMIT ${HISTORY_LIMIT}
        `,
        [companyId]
    );

    return {
        company: buildCompany(row, ruleRows),
        history: history.map(h => ({
            id: Number(h.id),
            fee_type: h.fee_type,
            action: h.action,
            old_mode: h.old_mode,
            old_value: h.old_value === null ? null : Number(h.old_value),
            old_enabled: h.old_enabled === null ? null : Number(h.old_enabled) === 1,
            new_mode: h.new_mode,
            new_value: h.new_value === null ? null : Number(h.new_value),
            new_enabled: h.new_enabled === null ? null : Number(h.new_enabled) === 1,
            starts_at: h.starts_at || null,
            expires_at: h.expires_at || null,
            note: h.note || "",
            changed_by: Number(h.changed_by),
            changed_by_name: h.changed_by_name || `User #${h.changed_by}`,
            ip_address: h.ip_address || "",
            created_at: h.created_at
        }))
    };
}

/*
|--------------------------------------------------------------------------
| WRITE HELPERS (inside a transaction)
|--------------------------------------------------------------------------
*/

async function writeHistory(conn, entry, actor) {
    await conn.execute(
        `
        INSERT INTO company_pricing_history
        (
            company_id, fee_type, action,
            old_mode, old_value, old_enabled,
            new_mode, new_value, new_enabled,
            starts_at, expires_at, note,
            changed_by, ip_address
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
            entry.companyId,
            entry.feeType,
            entry.action,
            entry.oldMode ?? null,
            entry.oldValue ?? null,
            entry.oldEnabled ?? null,
            entry.newMode ?? null,
            entry.newValue ?? null,
            entry.newEnabled ?? null,
            entry.startsAt ?? null,
            entry.expiresAt ?? null,
            entry.note ?? null,
            actor.userId,
            actor.ip || null
        ]
    );
}

function describeRule(mode, value, enabled) {
    if (!mode) {
        return "default";
    }

    return `${mode} ${Number(value).toFixed(2)}${enabled ? "" : " (disabled)"}`;
}

async function writeActivityLog(conn, entry, actor) {
    const description = (
        `Pricing ${entry.action}: company #${entry.companyId} ` +
        `${entry.feeType} | ` +
        `${describeRule(entry.oldMode, entry.oldValue, entry.oldEnabled)} -> ` +
        `${describeRule(entry.newMode, entry.newValue, entry.newEnabled)}`
    ).slice(0, 500);

    await conn.execute(
        `
        INSERT INTO activity_logs
        (company_id, user_id, user_name, action, description,
         module, ip_address, role_name)
        VALUES (?, ?, ?, ?, ?, 'pricing', ?, ?)
        `,
        [
            actor.companyId || null,
            actor.userId,
            String(actor.name || "").slice(0, 100) || null,
            `pricing_${entry.action}`,
            description,
            actor.ip || null,
            String(actor.role || "").slice(0, 50) || null
        ]
    );
}

async function lockRule(conn, companyId, feeType) {
    const [rows] = await conn.execute(
        `
        SELECT
            id, mode, value, is_enabled,
            DATE_FORMAT(starts_at, '${DT}') AS starts_at,
            DATE_FORMAT(expires_at, '${DT}') AS expires_at,
            note
        FROM company_pricing_rules
        WHERE company_id = ?
          AND fee_type = ?
        LIMIT 1
        FOR UPDATE
        `,
        [companyId, feeType]
    );

    return rows.length ? rows[0] : null;
}

async function withTransaction(work) {
    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const result = await work(conn);

        await conn.commit();

        return result;
    } catch (error) {
        try {
            await conn.rollback();
        } catch (rollbackError) {
            console.error("PRICING ROLLBACK ERROR:", rollbackError);
        }

        throw error;
    } finally {
        conn.release();
    }
}

/*
|--------------------------------------------------------------------------
| SAVE (create / update)
|--------------------------------------------------------------------------
*/

async function saveRule(input, actor) {
    const companyId = toCompanyId(input.companyId);
    const feeType = toFeeType(input.feeType);

    const mode = String(input.mode || "").trim().toLowerCase();

    if (!MODES.includes(mode)) {
        throw new PricingError("Pricing mode সঠিক নয়।");
    }

    const value = toMoney(
        input.value,
        mode === "special_price" ? "Special Price" : "Discount"
    );

    const enabled = toBool(input.isEnabled, true);
    const startsAt = parseWall(input.startsAt, "Offer Start Date", false);
    const expiresAt = parseWall(input.expiresAt, "Offer Expiry Date", true);
    const note = toNote(input.note);

    if (startsAt && expiresAt && startsAt >= expiresAt) {
        throw new PricingError("Expiry Date অবশ্যই Start Date-এর পরে হতে হবে।");
    }

    return withTransaction(async conn => {
        const company = await loadCompanyRow(conn, companyId);

        if (!company) {
            throw new PricingError("কোম্পানি পাওয়া যায়নি।", 404);
        }

        const defaults = defaultsFromPackage(
            company.package_code ? company : null
        );

        const defaultAmount = defaults[feeType];

        if (mode === "fixed_discount") {
            if (feeType === "yearly") {
                throw new PricingError(
                    "Yearly-র কোনো Default মূল্য নেই, তাই শুধু Special Price সংরক্ষণ করা যাবে।"
                );
            }

            if (
                !Number.isFinite(defaultAmount) ||
                defaultAmount <= 0
            ) {
                throw new PricingError(
                    `${FEE_LABELS[feeType]} Default মূল্য পাওয়া যায়নি, তাই Discount দেওয়া যাবে না।`
                );
            }

            if (value >= defaultAmount) {
                throw new PricingError(
                    `Discount (৳${value.toFixed(2)}) অবশ্যই Default মূল্য (৳${defaultAmount.toFixed(2)})-এর কম হতে হবে।`
                );
            }
        }

        const existing = await lockRule(conn, companyId, feeType);
        const updatedBy = actor.userId;

        if (existing) {
            await conn.execute(
                `
                UPDATE company_pricing_rules
                SET mode = ?, value = ?, is_enabled = ?,
                    starts_at = ?, expires_at = ?, note = ?,
                    updated_by = ?
                WHERE id = ?
                `,
                [
                    mode, value, enabled ? 1 : 0,
                    startsAt, expiresAt, note,
                    updatedBy, existing.id
                ]
            );
        } else {
            await conn.execute(
                `
                INSERT INTO company_pricing_rules
                (company_id, fee_type, mode, value, is_enabled,
                 starts_at, expires_at, note, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    companyId, feeType, mode, value, enabled ? 1 : 0,
                    startsAt, expiresAt, note, updatedBy, updatedBy
                ]
            );
        }

        const entry = {
            companyId,
            feeType,
            action: existing ? "update" : "create",
            oldMode: existing ? existing.mode : null,
            oldValue: existing ? Number(existing.value) : null,
            oldEnabled: existing ? Number(existing.is_enabled) : null,
            newMode: mode,
            newValue: value,
            newEnabled: enabled ? 1 : 0,
            startsAt,
            expiresAt,
            note
        };

        await writeHistory(conn, entry, actor);
        await writeActivityLog(conn, entry, actor);

        return { company_id: companyId, fee_type: feeType };
    });
}

/*
|--------------------------------------------------------------------------
| ENABLE / DISABLE
|--------------------------------------------------------------------------
*/

async function setEnabled(input, actor) {
    const companyId = toCompanyId(input.companyId);
    const feeType = toFeeType(input.feeType);
    const enabled = toBool(input.enabled, true);
    const note = toNote(input.note);

    return withTransaction(async conn => {
        const company = await loadCompanyRow(conn, companyId);

        if (!company) {
            throw new PricingError("কোম্পানি পাওয়া যায়নি।", 404);
        }

        const existing = await lockRule(conn, companyId, feeType);

        if (!existing) {
            throw new PricingError("এই কোম্পানির জন্য কোনো Special Price নেই।", 404);
        }

        if ((Number(existing.is_enabled) === 1) === enabled) {
            return {
                company_id: companyId,
                fee_type: feeType,
                changed: false
            };
        }

        await conn.execute(
            `
            UPDATE company_pricing_rules
            SET is_enabled = ?, updated_by = ?
            WHERE id = ?
            `,
            [enabled ? 1 : 0, actor.userId, existing.id]
        );

        const entry = {
            companyId,
            feeType,
            action: enabled ? "enable" : "disable",
            oldMode: existing.mode,
            oldValue: Number(existing.value),
            oldEnabled: Number(existing.is_enabled),
            newMode: existing.mode,
            newValue: Number(existing.value),
            newEnabled: enabled ? 1 : 0,
            startsAt: existing.starts_at || null,
            expiresAt: existing.expires_at || null,
            note: note || existing.note || null
        };

        await writeHistory(conn, entry, actor);
        await writeActivityLog(conn, entry, actor);

        return {
            company_id: companyId,
            fee_type: feeType,
            changed: true
        };
    });
}

/*
|--------------------------------------------------------------------------
| RESET TO DEFAULT (rule removed, history kept)
|--------------------------------------------------------------------------
*/

async function resetRule(input, actor) {
    const companyId = toCompanyId(input.companyId);
    const feeType = toFeeType(input.feeType);
    const note = toNote(input.note);

    return withTransaction(async conn => {
        const company = await loadCompanyRow(conn, companyId);

        if (!company) {
            throw new PricingError("কোম্পানি পাওয়া যায়নি।", 404);
        }

        const existing = await lockRule(conn, companyId, feeType);

        if (!existing) {
            throw new PricingError("এই কোম্পানির জন্য কোনো Special Price নেই।", 404);
        }

        await conn.execute(
            "DELETE FROM company_pricing_rules WHERE id = ?",
            [existing.id]
        );

        const entry = {
            companyId,
            feeType,
            action: "reset",
            oldMode: existing.mode,
            oldValue: Number(existing.value),
            oldEnabled: Number(existing.is_enabled),
            newMode: null,
            newValue: null,
            newEnabled: null,
            startsAt: existing.starts_at || null,
            expiresAt: existing.expires_at || null,
            note: note || existing.note || null
        };

        await writeHistory(conn, entry, actor);
        await writeActivityLog(conn, entry, actor);

        return { company_id: companyId, fee_type: feeType };
    });
}

/*
|--------------------------------------------------------------------------
| EFFECTIVE PRICE (for registration / payment code paths)
|--------------------------------------------------------------------------
|
| companyId must come from the session or from a billing row,
| never from the request body.
|--------------------------------------------------------------------------
*/

async function resolveEffectivePrice(
    companyIdInput,
    feeTypeInput,
    defaultAmount,
    executor = db
) {
    const companyId = toCompanyId(companyIdInput);
    const feeType = toFeeType(feeTypeInput);
    const now = bdNowWall();

    const [rows] = await executor.execute(
        `
        SELECT id, mode, value AS rule_amount
        FROM company_pricing_rules
        WHERE company_id = ?
          AND fee_type = ?
          AND is_enabled = 1
          AND (starts_at IS NULL OR starts_at <= ?)
          AND (expires_at IS NULL OR expires_at > ?)
        LIMIT 1
        `,
        [companyId, feeType, now, now]
    );

    const rule = rows.length ? rows[0] : null;
    const result = effectiveAmount(
        defaultAmount,
        rule ? { mode: rule.mode, value: rule.rule_amount } : null
    );

    return {
        default_amount: Number(defaultAmount),
        effective_amount: result.amount,
        source: result.source,
        rule_id: rule && result.source !== "default" ? Number(rule.id) : null
    };
}

module.exports = {
    FEE_TYPES,
    MODES,
    PricingError,
    bdNowWall,
    parseWall,
    effectiveAmount,
    activeRuleJoinSql,
    effectiveAmountSql,
    listCompanies,
    getCompanyDetail,
    saveRule,
    setEnabled,
    resetRule,
    resolveEffectivePrice
};
