"use strict";

/*
|--------------------------------------------------------------------------
| PAYMENT GATEWAY CONTROLLER
|--------------------------------------------------------------------------
| Admin   : page, csrf, list, save            (credentials, per scope)
| Checkout: createPayment (logged in), publicQuote / publicCreate (by
|           Customer ID, no login)
| Return  : nagadCallback, result, success/fail/cancel
|
| Scopes (never mixed):
|   customer -> ISP's own merchant account (customer bill payments)
|   central  -> Amader Bill's merchant account (software subscription)
|
| The browser NEVER decides the amount:
|   customer bill  -> Customer Recharge calculation (dry run)
|   software bill  -> software_billing_notifications.amount
|--------------------------------------------------------------------------
*/

const crypto = require("crypto");
const path = require("path");

const db = require("../../config/database");
const paymentService = require("../../services/payment/payment.service");
const { getProvider } = require("../../services/payment/payment.factory");
const settlement = require("../../services/payment/paymentSettlement.service");
const nagad = require("../../services/payment/nagad.service");
const recharge = require("../../services/customers/customer-recharge.service");
const softwarePayment = require("../../services/billing/softwareBillingPayment.service");

/* Gateways that use the verified server-side flow. */
const CHECKOUT_GATEWAYS = ["nagad", "bkash", "sslcommerz", "shurjopay"];

/* credential fields accepted per gateway (anything else is dropped) */
const CREDENTIAL_KEYS = {
    nagad: ["merchantId", "merchantNumber", "publicKey", "privateKey"],
    bkash: ["app_key", "app_secret", "username", "password"],
    sslcommerz: ["store_id", "store_password"],
    shurjopay: ["username", "password", "prefix"]
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;

/*
|--------------------------------------------------------------------------
| ROLE / SESSION
|--------------------------------------------------------------------------
*/

function normalizeRole(role) {
    return String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
}

function isSuperAdmin(req) {
    return normalizeRole(req.session?.role) === "superadmin";
}

/* Gateway credentials are managed by Super Admin only. */
function isGatewayAdmin(req) {
    return isSuperAdmin(req);
}

/*
 * Customer-scope credentials belong to one ISP. Super Admin picks which
 * ISP (company_id); default = own company.
 */
async function resolveTargetCompany(req, raw) {
    const value = Number(raw || req.session?.company_id || 0);

    if (!Number.isInteger(value) || value <= 0) {
        const error = new Error("Company ID is required.");
        error.status = 400;
        throw error;
    }

    const [rows] = await db.execute(
        "SELECT 1 FROM users WHERE company_id = ? LIMIT 1",
        [value]
    );

    if (!rows.length) {
        const error = new Error("Invalid company ID: no such company.");
        error.status = 400;
        throw error;
    }

    return value;
}

function requireLogin(req, res) {
    if (!req.session || !req.session.user_id) {
        res.redirect("/");
        return false;
    }

    return true;
}

function requireLoginJson(req, res) {
    if (!req.session || !req.session.user_id) {
        res.status(401).json({
            success: false,
            message: "Not logged in."
        });

        return false;
    }

    return true;
}

function getCompanyId(req) {
    const value = Number(req.session?.company_id || 0);

    return Number.isInteger(value) && value > 0 ? value : null;
}

/*
 * Which merchant account a request may manage.
 */
function resolveScope(req, requested) {
    const scope = paymentService.normalizeScope(requested || "customer");

    if (scope === "central" && !isSuperAdmin(req)) {
        const error = new Error(
            "Only Super Admin can manage the central gateway."
        );
        error.status = 403;
        throw error;
    }

    return scope;
}

/*
|--------------------------------------------------------------------------
| CSRF  (kept: timing-safe, body or header)
|--------------------------------------------------------------------------
*/

function getCsrfToken(req) {
    if (!req.session) {
        return null;
    }

    if (
        typeof req.session.csrf_token !== "string" ||
        !req.session.csrf_token
    ) {
        req.session.csrf_token = crypto.randomBytes(32).toString("hex");
    }

    return req.session.csrf_token;
}

function verifyCsrf(req) {
    const sessionToken = req.session?.csrf_token;

    const postedToken =
        req.body?.csrf_token ||
        req.headers["x-csrf-token"] ||
        req.headers["x-xsrf-token"];

    if (
        typeof sessionToken !== "string" ||
        typeof postedToken !== "string" ||
        !sessionToken ||
        !postedToken
    ) {
        return false;
    }

    const a = Buffer.from(sessionToken, "utf8");
    const b = Buffer.from(postedToken, "utf8");

    if (a.length !== b.length) {
        return false;
    }

    return crypto.timingSafeEqual(a, b);
}

function csrf(req, res) {
    if (!requireLoginJson(req, res)) {
        return;
    }

    return res.json({
        success: true,
        csrf_token: getCsrfToken(req),
        is_super_admin: isSuperAdmin(req),
        is_gateway_admin: isGatewayAdmin(req)
    });
}

/*
|--------------------------------------------------------------------------
| ADMIN PAGE
|--------------------------------------------------------------------------
*/

function page(req, res) {
    if (!requireLogin(req, res)) {
        return;
    }

    if (!isGatewayAdmin(req)) {
        return res
            .status(403)
            .send("Only Super Admin can configure payment gateways.");
    }

    return res.sendFile(
        path.join(
            __dirname, "..", "..", "views", "billing", "payment",
            "payment-gateway.html"
        )
    );
}

/*
|--------------------------------------------------------------------------
| SAVE GATEWAY CONFIGURATION
|--------------------------------------------------------------------------
*/

async function slugTakenByAnotherCompany(slug, companyId) {
    const [rows] = await db.execute(
        `SELECT company_id, settings
         FROM payment_gateways
         WHERE scope = 'customer'
           AND settings LIKE ?`,
        [`%"slug":"${slug}"%`]
    );

    return rows.some((row) => {
        const settings = paymentService.parseJson(row.settings, {});

        return (
            settings.slug === slug &&
            Number(row.company_id) !== Number(companyId)
        );
    });
}

async function save(req, res) {
    if (!requireLoginJson(req, res)) {
        return;
    }

    if (!isGatewayAdmin(req)) {
        return res.status(403).json({
            success: false,
            message: "Only Super Admin can configure payment gateways."
        });
    }

    if (!verifyCsrf(req)) {
        return res.status(419).json({
            success: false,
            message: "Invalid CSRF token."
        });
    }

    try {
        const body = req.body || {};
        const scope = resolveScope(req, body.scope);
        const gateway = String(body.gateway || "").trim().toLowerCase();
        const companyId =
            scope === "central"
                ? 0
                : await resolveTargetCompany(req, body.company_id);

        if (!CHECKOUT_GATEWAYS.includes(gateway)) {
            throw new CheckoutError(
                "Unsupported gateway: online payment is not available for it."
            );
        }

        const incoming = body.credentials || {};
        const credentials = {};

        for (const key of CREDENTIAL_KEYS[gateway]) {
            if (typeof incoming[key] === "string") {
                credentials[key] = incoming[key].trim().slice(0, 4000);
            }
        }

        /* reject bad Nagad keys now instead of at payment time */
        if (gateway === "nagad") {
            if (credentials.publicKey) {
                nagad._test.loadPublicKey(credentials.publicKey);
            }

            if (credentials.privateKey) {
                nagad._test.loadPrivateKey(credentials.privateKey);
            }
        }

        const settings = {};
        const rawSettings = body.settings || {};
        const slug = String(rawSettings.slug || "").trim().toLowerCase();

        if (slug) {
            if (scope !== "customer") {
                throw new CheckoutError(
                    "Checkout link applies to ISP gateways only."
                );
            }

            if (!SLUG_RE.test(slug)) {
                throw new CheckoutError(
                    "Checkout link: use 3-40 letters, digits or hyphens."
                );
            }

            if (await slugTakenByAnotherCompany(slug, companyId)) {
                throw new CheckoutError(
                    "This checkout link name is already taken."
                );
            }

            settings.slug = slug;
        }

        if (rawSettings.baseUrl && gateway === "nagad") {
            const baseUrl = String(rawSettings.baseUrl).trim();

            nagad._test.resolveBaseUrl(body.environment || "sandbox", { baseUrl });

            settings.baseUrl = baseUrl;
        }

        await paymentService.saveGateway({
            companyId,
            scope,
            gateway,
            enabled: Boolean(body.enabled),
            environment: body.environment,
            credentials,
            settings
        });

        return res.json({
            success: true,
            message: "Payment gateway configuration saved."
        });
    } catch (error) {
        const known =
            error.status ||
            error.name === "NagadError" ||
            error.name === "CheckoutError" ||
            /Invalid|Unsupported|required|taken|Checkout|Only|company/.test(
                error.message || ""
            );

        if (!known) {
            console.error("PAYMENT GATEWAY SAVE ERROR:", error);
        }

        return res.status(error.status || (known ? 400 : 500)).json({
            success: false,
            message: known
                ? error.message
                : "Unable to save gateway configuration."
        });
    }
}

/*
|--------------------------------------------------------------------------
| GATEWAY LIST  (secrets are never returned)
|--------------------------------------------------------------------------
*/

const PUBLIC_CREDENTIAL_KEYS = [
    "merchantId", "merchantNumber", "app_key", "username", "store_id", "prefix"
];

async function list(req, res) {
    if (!requireLoginJson(req, res)) {
        return;
    }

    if (!isGatewayAdmin(req)) {
        return res.status(403).json({
            success: false,
            message: "Only Super Admin can view gateway settings."
        });
    }

    try {
        const scope = resolveScope(req, req.query?.scope);
        const companyId =
            scope === "central"
                ? 0
                : await resolveTargetCompany(req, req.query?.company_id);

        const gateways = [];

        for (const gateway of paymentService.SUPPORTED_GATEWAYS) {
            const row = await paymentService.getGateway(
                companyId,
                gateway,
                scope
            );

            const credentials = row?.credentials || {};

            gateways.push({
                gateway,
                scope,
                enabled: Boolean(row?.enabled),
                environment: row?.environment || "sandbox",
                settings: row?.settings || {},
                credentials_public: Object.fromEntries(
                    PUBLIC_CREDENTIAL_KEYS
                        .filter((key) => credentials[key])
                        .map((key) => [key, credentials[key]])
                ),
                credentials_set: Object.fromEntries(
                    Object.keys(credentials).map((key) => [key, true])
                )
            });
        }

        return res.json({ success: true, scope, gateways });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }

        console.error("PAYMENT GATEWAY LIST ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load payment gateways."
        });
    }
}

/*
|--------------------------------------------------------------------------
| HELPERS FOR CHECKOUT
|--------------------------------------------------------------------------
*/

function clientIpV4(req) {
    const ip = String(req.ip || "").replace(/^::ffff:/, "");

    return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : "127.0.0.1";
}

function baseUrl(req) {
    const configured = String(process.env.APP_BASE_URL || "").trim();

    if (configured) {
        return configured.replace(/\/+$/, "");
    }

    return `${req.protocol}://${req.get("host")}`;
}

function maskName(name) {
    const text = String(name || "").trim();

    if (!text) {
        return "";
    }

    return text
        .split(/\s+/)
        .map((part) => part.slice(0, 1) + "***")
        .join(" ");
}

class CheckoutError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = "CheckoutError";
        this.status = status;
    }
}

async function loadEnabledGateway(companyId, gateway, scope) {
    if (!CHECKOUT_GATEWAYS.includes(gateway)) {
        throw new CheckoutError(
            "This payment method is not available for online checkout."
        );
    }

    const row = await paymentService.getGateway(companyId, gateway, scope);

    if (!row || !row.enabled) {
        throw new CheckoutError(
            "This payment method is not available right now."
        );
    }

    return row;
}

/*
 * Real amount for a customer bill (Customer Recharge calculation).
 */
async function quoteCustomerBill({ companyId, customerId, form }) {
    const [rows] = await db.execute(
        `SELECT id
         FROM customers
         WHERE company_id = ?
           AND customer_id = ?
           AND deleted_at IS NULL
         LIMIT 1`,
        [companyId, String(customerId || "").trim()]
    );

    if (!rows.length) {
        throw new CheckoutError("Customer not found.", 404);
    }

    const input = {
        bill_type: form.bill_type === "Advance" ? "Advance" : "Bill",
        billing_type: "Monthly",
        recharge_month: form.recharge_month || 1,
        payment_method: "Nagad",
        discount: 0,
        advance: form.advance || 0
    };

    let quote;

    try {
        quote = await recharge.rechargeCustomer({
            user: { company_id: companyId, user_id: 0 },
            customerDbId: rows[0].id,
            input,
            dryRun: true
        });
    } catch (error) {
        if (error.name === "RechargeError") {
            throw new CheckoutError(error.message);
        }

        throw error;
    }

    if (!(Number(quote.amount) > 0)) {
        throw new CheckoutError("Nothing to pay for this customer.");
    }

    return {
        quote,
        request: {
            customer_db_id: rows[0].id,
            customer_id: quote.customer_id,
            input
        }
    };
}

/*
 * Create the transaction, call Nagad, return the payment page URL.
 */
async function startPayment({
    req,
    companyId,
    userId,
    gateway,
    gatewayRow,
    scope,
    purpose,
    amount,
    request,
    customerName
}) {
    const transaction = await paymentService.createTransaction({
        companyId,
        userId,
        gateway,
        purpose,
        scope,
        amount,
        currency: "BDT",
        shortId: true,
        metadata: { request }
    });

    const provider = getProvider(gateway);

    try {
        const result = await provider.initiate({
            credentials: gatewayRow.credentials,
            environment: gatewayRow.environment,
            settings: gatewayRow.settings,
            transaction,
            customer: { name: customerName || "Customer" },
            clientIp: clientIpV4(req),
            urls: {
                callback:
                    `${baseUrl(req)}/api/payment-gateway/${gateway}/callback/${transaction.transactionId}`
            }
        });

        await paymentService.updateTransaction(transaction.id, {
            gateway_session_id: result.sessionKey || null,
            metadata: JSON.stringify({
                request,
                initiate: result.raw || {}
            })
        });

        return {
            transaction_id: transaction.transactionId,
            redirect_url: result.paymentUrl
        };
    } catch (error) {
        /* nothing was paid: initiation itself failed */
        await paymentService.changeStatus(
            transaction.id,
            ["pending"],
            "failed",
            {
                metadata: JSON.stringify({
                    request,
                    initiate_error: String(error.message).slice(0, 300)
                })
            }
        );

        console.error(
            `PAYMENT INITIATE ERROR [${transaction.transactionId}]:`,
            error.message,
            error.details || ""
        );

        throw new CheckoutError(
            "Could not start the payment. Please try again later.",
            502
        );
    }
}

function sendCheckoutError(res, error, label) {
    if (error instanceof CheckoutError) {
        return res.status(error.status).json({
            success: false,
            message: error.message
        });
    }

    if (
        error.name === "SoftwareBillingError" ||
        error.name === "RechargeError"
    ) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }

    console.error(label, error);

    return res.status(500).json({
        success: false,
        message: "Unable to create payment."
    });
}

/*
|--------------------------------------------------------------------------
| CREATE PAYMENT  (logged in)
|--------------------------------------------------------------------------
| software_*   : billing_id from body, amount from the billing row,
|                central merchant account.
| customer_bill: staff/admin collecting for a customer of THEIR company,
|                ISP merchant account.
|--------------------------------------------------------------------------
*/

function sessionCustomerRef(req) {
    return String(
        req.session?.customer_id ||
        req.session?.customerId ||
        req.session?.customer_code ||
        ""
    ).trim();
}

async function createPayment(req, res) {
    if (!requireLoginJson(req, res)) {
        return;
    }

    if (!verifyCsrf(req)) {
        return res.status(419).json({
            success: false,
            message: "Invalid CSRF token."
        });
    }

    const companyId = getCompanyId(req);

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Company ID is required."
        });
    }

    try {
        const body = req.body || {};
        const gateway = String(body.gateway || "").trim().toLowerCase();
        const purposeIn = String(body.purpose || "").trim().toLowerCase();

        if (!paymentService.SUPPORTED_PURPOSES.includes(purposeIn)) {
            throw new CheckoutError("Unsupported payment purpose.");
        }

        /* ---------------- software subscription ---------------- */
        if (purposeIn !== "customer_bill") {
            if (isSuperAdmin(req)) {
                throw new CheckoutError(
                    "Super Admin does not pay software billing."
                );
            }

            const billing = await softwarePayment.getPayableBilling({
                billingId: body.billing_id,
                companyId,
                userId: req.session.user_id
            });

            const gatewayRow = await loadEnabledGateway(
                0, gateway, "central"
            );

            const result = await startPayment({
                req,
                companyId,
                userId: Number(req.session.user_id),
                gateway,
                gatewayRow,
                scope: "central",
                purpose:
                    String(billing.billing_type).toLowerCase() === "registration"
                        ? "software_registration"
                        : "software_billing",
                amount: billing.amount,
                request: { billing_id: billing.id },
                customerName: req.session?.name || req.session?.username
            });

            return res.json({ success: true, ...result });
        }

        /* ---------------- customer bill ---------------- */
        const role = normalizeRole(req.session?.role);

        if (role === "customer") {
            const own = sessionCustomerRef(req);

            if (!own || own !== String(body.customer_id || "").trim()) {
                throw new CheckoutError(
                    "You can pay only your own bill.", 403
                );
            }
        }

        const gatewayRow = await loadEnabledGateway(
            companyId, gateway, "customer"
        );

        const { quote, request } = await quoteCustomerBill({
            companyId,
            customerId: body.customer_id,
            form: body
        });

        const result = await startPayment({
            req,
            companyId,
            userId: Number(req.session.user_id),
            gateway,
            gatewayRow,
            scope: "customer",
            purpose: "customer_bill",
            amount: quote.amount,
            request,
            customerName: quote.customer_name
        });

        return res.json({ success: true, ...result });
    } catch (error) {
        return sendCheckoutError(res, error, "CREATE PAYMENT ERROR:");
    }
}

/*
|--------------------------------------------------------------------------
| PUBLIC CHECKOUT  (no login, by Customer ID, per-ISP link)
|--------------------------------------------------------------------------
*/

async function companyFromSlug(slug, gateways) {
    slug = String(slug || "").trim().toLowerCase();

    const list = Array.isArray(gateways) ? gateways : [gateways];

    if (!SLUG_RE.test(slug)) {
        throw new CheckoutError("Payment link not found.", 404);
    }

    const [rows] = await db.execute(
        `SELECT company_id, settings
         FROM payment_gateways
         WHERE scope = 'customer'
           AND gateway IN (${list.map(() => "?").join(", ")})
           AND enabled = 1
           AND settings LIKE ?`,
        [...list, `%"slug":"${slug}"%`]
    );

    const match = rows.find(
        (row) =>
            paymentService.parseJson(row.settings, {}).slug === slug
    );

    if (!match) {
        throw new CheckoutError("Payment link not found.", 404);
    }

    return Number(match.company_id);
}

function publicPage(req, res) {
    return res.sendFile(
        path.join(
            __dirname, "..", "..", "views", "billing", "payment",
            "customer-pay.html"
        )
    );
}

async function publicQuote(req, res) {
    try {
        const body = req.body || {};
        const companyId = await companyFromSlug(
            body.slug, CHECKOUT_GATEWAYS
        );

        const { quote } = await quoteCustomerBill({
            companyId,
            customerId: body.customer_id,
            form: body
        });

        return res.json({
            success: true,
            customer_name: maskName(quote.customer_name),
            amount: quote.amount,
            currency: "BDT"
        });
    } catch (error) {
        return sendCheckoutError(res, error, "PUBLIC QUOTE ERROR:");
    }
}

async function publicCreate(req, res) {
    try {
        const body = req.body || {};
        const gateway = String(body.gateway || "").trim().toLowerCase();
        const companyId = await companyFromSlug(body.slug, CHECKOUT_GATEWAYS);

        const gatewayRow = await loadEnabledGateway(
            companyId, gateway, "customer"
        );

        const { quote, request } = await quoteCustomerBill({
            companyId,
            customerId: body.customer_id,
            form: body
        });

        const result = await startPayment({
            req,
            companyId,
            userId: null,
            gateway,
            gatewayRow,
            scope: "customer",
            purpose: "customer_bill",
            amount: quote.amount,
            request,
            customerName: quote.customer_name
        });

        return res.json({ success: true, ...result });
    } catch (error) {
        return sendCheckoutError(res, error, "PUBLIC CREATE ERROR:");
    }
}

async function publicGateways(req, res) {
    try {
        const companyId = await companyFromSlug(
            req.body?.slug, CHECKOUT_GATEWAYS
        );

        const gateways = [];

        for (const gateway of CHECKOUT_GATEWAYS) {
            const row = await paymentService.getGateway(
                companyId, gateway, "customer"
            );

            if (row && row.enabled) {
                gateways.push(gateway);
            }
        }

        return res.json({ success: true, gateways });
    } catch (error) {
        return sendCheckoutError(res, error, "PUBLIC GATEWAYS ERROR:");
    }
}

/*
|--------------------------------------------------------------------------
| SOFTWARE BILLING - ONLINE PAY PAGE  (registration fee / monthly bill)
|--------------------------------------------------------------------------
| The dashboard "Online Pay" button opens
|     /api/payment-gateway/software/pay[?billing_id=ID]
| The page lists the CENTRAL gateways that Super Admin enabled and starts
| the payment through POST /create. Amount = billing row, never the browser.
|--------------------------------------------------------------------------
*/

function softwarePage(req, res) {
    if (!requireLogin(req, res)) {
        return;
    }

    return res.sendFile(
        path.join(
            __dirname, "..", "..", "views", "billing", "payment",
            "software-pay.html"
        )
    );
}

async function softwareInfo(req, res) {
    if (!requireLoginJson(req, res)) {
        return;
    }

    try {
        const companyId = getCompanyId(req);
        const userId = Number(req.session.user_id);

        if (!companyId || isSuperAdmin(req)) {
            throw new CheckoutError(
                "No software billing is payable for this account."
            );
        }

        let billingId = Number(req.query?.billing_id || 0);

        if (!billingId) {
            /* same pick as the billing gate: registration first, newest */
            const [rows] = await db.execute(
                `SELECT id
                 FROM software_billing_notifications
                 WHERE user_id = ? AND company_id = ? AND status = 'unpaid'
                 ORDER BY CASE WHEN billing_type = 'registration' THEN 0 ELSE 1 END,
                          id DESC
                 LIMIT 1`,
                [userId, companyId]
            );

            if (!rows.length) {
                throw new CheckoutError("You have no unpaid software bill.");
            }

            billingId = Number(rows[0].id);
        }

        const billing = await softwarePayment.getPayableBilling({
            billingId, companyId, userId
        });

        const gateways = [];

        for (const gateway of CHECKOUT_GATEWAYS) {
            const row = await paymentService.getGateway(0, gateway, "central");

            if (row && row.enabled) {
                gateways.push(gateway);
            }
        }

        return res.json({
            success: true,
            csrf_token: getCsrfToken(req),
            billing_id: billing.id,
            billing_type: billing.billing_type,
            amount: billing.amount,
            currency: "BDT",
            gateways
        });
    } catch (error) {
        return sendCheckoutError(res, error, "SOFTWARE INFO ERROR:");
    }
}

/*
|--------------------------------------------------------------------------
| RESULT PAGE
|--------------------------------------------------------------------------
| Always built from the DATABASE state, never from the URL the browser
| came through.
|--------------------------------------------------------------------------
*/

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;",
        '"': "&quot;", "'": "&#39;"
    })[c]);
}

const RESULT_TEXT = {
    paid: {
        title: "Payment Successful",
        bn: "আপনার পেমেন্ট সফলভাবে সম্পন্ন হয়েছে।",
        status: 200
    },
    verified: {
        title: "Payment Received",
        bn: "পেমেন্ট পাওয়া গেছে, বিল আপডেট হচ্ছে। কয়েক মুহূর্ত পরে দেখুন।",
        status: 202,
        refresh: true
    },
    pending: {
        title: "Payment Pending",
        bn: "পেমেন্ট যাচাই করা হচ্ছে। এই পেজ নিজে থেকেই আপডেট হবে।",
        status: 202,
        refresh: true
    },
    failed: {
        title: "Payment Failed",
        bn: "পেমেন্ট সম্পন্ন হয়নি। কোনো টাকা কাটা হয়ে থাকলে ফেরত আসবে।",
        status: 400
    },
    needs_review: {
        title: "Payment Under Review",
        bn: "আপনার পেমেন্ট পাওয়া গেছে, তবে স্বয়ংক্রিয়ভাবে বিল আপডেট করা যায়নি। অনুগ্রহ করে অফিসে যোগাযোগ করুন এবং নিচের Transaction ID জানান।",
        status: 202
    }
};

function receiptFor(transaction) {
    if (
        transaction.status !== "paid" ||
        !transaction.applied_payment_id ||
        !String(transaction.purpose).startsWith("software_")
    ) {
        return null;
    }

    const request = paymentService.parseJson(transaction.metadata, {}).request || {};

    return request.billing_id
        ? `/software-billing/receipt?billing_id=${Number(request.billing_id)}&payment_id=${Number(transaction.applied_payment_id)}`
        : null;
}

function renderResult(res, transaction, receipt) {
    receipt = receipt || receiptFor(transaction);

    const state = RESULT_TEXT[transaction.status]
        ? transaction.status
        : "pending";

    const text = RESULT_TEXT[state];

    const backLink =
        transaction.purpose === "customer_bill" && !transaction.user_id
            ? ""
            : receipt
                ? `<p><a href="${escapeHtml(receipt)}">View receipt</a></p>`
                : `<p><a href="/dashboard">Back to Dashboard</a></p>`;

    return res.status(text.status === 200 ? 200 : text.status).send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${text.refresh ? '<meta http-equiv="refresh" content="8">' : ""}
<title>${escapeHtml(text.title)}</title>
</head>
<body style="font-family:Arial;text-align:center;padding:60px 20px;">
<h2>${escapeHtml(text.title)}</h2>
<p>${escapeHtml(text.bn)}</p>
<p>Amount: ৳${escapeHtml(Number(transaction.amount).toFixed(2))}</p>
<p>Transaction ID: <b>${escapeHtml(transaction.transaction_id)}</b></p>
${backLink}
</body>
</html>`);
}

function renderNotFound(res) {
    return res.status(404).send(
        `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Not found</title></head>` +
        `<body style="font-family:Arial;text-align:center;padding:60px 20px;">` +
        `<h2>Payment not found</h2></body></html>`
    );
}

async function settleAndRender(req, res, transaction) {
    let outcome = { transaction };

    const ageMs = Date.now() - new Date(transaction.created_at).getTime();

    if (
        ["pending", "verified"].includes(transaction.status) &&
        ageMs < 24 * 60 * 60 * 1000
    ) {
        try {
            outcome = await settlement.settle(transaction, {
                clientIp: clientIpV4(req)
            });
        } catch (error) {
            console.error("PAYMENT SETTLE ERROR:", error);
        }
    }

    return renderResult(
        res,
        outcome.transaction || transaction,
        outcome.receipt
    );
}

/*
|--------------------------------------------------------------------------
| NAGAD CALLBACK  (browser redirect from Nagad - no login, no CSRF)
|--------------------------------------------------------------------------
| The query string is NOT trusted. The transaction is found by OUR id and
| the payment is confirmed with Nagad's Verify API. An invalid or fake
| callback therefore changes nothing.
|--------------------------------------------------------------------------
*/

async function gatewayCallback(req, res) {
    try {
        const transactionId = String(
            req.params.transactionId || ""
        ).trim();

        if (!/^[A-Za-z0-9]{6,40}$/.test(transactionId)) {
            return renderNotFound(res);
        }

        const transaction =
            await paymentService.getTransactionByTransactionId(transactionId);

        if (
            !transaction ||
            !CHECKOUT_GATEWAYS.includes(transaction.gateway) ||
            transaction.gateway !==
                String(req.params.gateway || "").toLowerCase()
        ) {
            return renderNotFound(res);
        }

        /* query/body are never used: the gateway is asked server-side */

        return settleAndRender(req, res, transaction);
    } catch (error) {
        console.error("GATEWAY CALLBACK ERROR:", error);

        return res.status(500).send("Unable to process the payment result.");
    }
}

async function result(req, res) {
    try {
        const transactionId = String(
            req.params.transactionId || ""
        ).trim();

        if (!/^[A-Za-z0-9]{6,40}$/.test(transactionId)) {
            return renderNotFound(res);
        }

        const transaction =
            await paymentService.getTransactionByTransactionId(transactionId);

        if (!transaction) {
            return renderNotFound(res);
        }

        return settleAndRender(req, res, transaction);
    } catch (error) {
        console.error("PAYMENT RESULT ERROR:", error);

        return res.status(500).send("Unable to load the payment result.");
    }
}

/*
|--------------------------------------------------------------------------
| IPN
|--------------------------------------------------------------------------
| Nagad does not use IPN (browser callback + Verify API only).
| Other gateways are not wired to the verified ledger flow yet, so their
| IPN is not accepted (it previously could only mark payments failed).
|--------------------------------------------------------------------------
*/

async function ipn(req, res) {
    return res.status(501).json({
        success: false,
        message: "IPN is not enabled for this gateway."
    });
}

module.exports = {
    page,
    save,
    list,
    csrf,
    createPayment,
    publicPage,
    publicQuote,
    publicCreate,
    gatewayCallback,
    nagadCallback: gatewayCallback,
    publicGateways,
    softwarePage,
    softwareInfo,
    result,
    ipn,

    /* result pages: the URL never decides the outcome */
    success: result,
    fail: result,
    cancel: result
};
