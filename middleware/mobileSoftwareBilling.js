"use strict";
/*
| middleware/mobileSoftwareBilling.js
| Web-এর middleware/softwareBilling.js-এর হুবহু নিয়ম মোবাইল Admin API-তে প্রয়োগ করে।
| ISP-র Software Bill (Registration trial শেষ / Monthly মেয়াদোত্তীর্ণ) অপরিশোধিত থাকলে
| Admin API ৪০২ (BILLING_REQUIRED) দেয়। Super Admin আটকায় না।
| Web-এর যাচাই-ফাংশন নিজেই পুনঃব্যবহার করা হয়েছে (নকল নয়), তাই নিয়ম এক জায়গায় থাকে।
*/
const web = require("./softwareBilling");

async function loadState(auth) {
    if (auth.isSuperAdmin) {
        return { ...web.createBillingState(null), super_admin: true };
    }

    /* Web ফাংশন req.session পড়ে; Bearer-যাচাই করা মান দিয়ে সেটি সাজানো হলো */
    const sessionReq = {
        session: {
            user_id: auth.userId,
            company_id: auth.companyId,
            role: auth.role
        }
    };

    const billing = await web.getCurrentUnpaidBilling(sessionReq);

    return web.createBillingState(billing);
}

/* অ্যাপে দেখানোর জন্য নিরাপদ আকার (শুধু দরকারি ফিল্ড) */
function publicState(state) {
    const b = state.billing || null;

    return {
        required: !!state.required,
        trial: !!state.trial,
        trial_expired: !!state.trial_expired,
        trial_expires_at: state.trial_expires_at || null,
        trial_remaining_seconds: Number(state.trial_remaining_seconds || 0),
        monthly_notice: !!state.monthly_notice,
        monthly_expired: !!state.monthly_expired,
        monthly_due_at: state.monthly_due_at || null,
        monthly_days_remaining: state.monthly_days_remaining ?? null,
        billing: b
            ? {
                id: Number(b.id),
                type: String(b.billing_type || ""),
                amount: Number(b.amount || 0),
                due_date: b.due_date || null
            }
            : null
    };
}

function requireMobileSoftwareBilling() {
    return async (req, res, next) => {
        try {
            const state = await loadState(req.auth);

            req.softwareBilling = state;

            if (!state.required) {
                return next();
            }

            const pub = publicState(state);

            return res.status(402).json({
                success: false,
                code: "BILLING_REQUIRED",
                billing_required: true,
                trial_expired: pub.trial_expired,
                monthly_expired: pub.monthly_expired,
                message: "Software billing payment is required.",
                billing_id: pub.billing ? pub.billing.id : 0,
                amount: pub.billing ? pub.billing.amount : 0,
                due_date: pub.billing ? pub.billing.due_date : null
            });
        } catch (e) {
            return next(e);
        }
    };
}

/* গেটের বাইরে থাকে: আটকে গেলেও অ্যাপ বিলের অবস্থা দেখাতে পারে */
async function billingStatus(req, res, next) {
    try {
        const state = await loadState(req.auth);

        return res.json({ success: true, ...publicState(state) });
    } catch (e) {
        return next(e);
    }
}

module.exports = { requireMobileSoftwareBilling, billingStatus, loadState, publicState };
