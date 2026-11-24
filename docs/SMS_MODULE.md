# SMS module

Pages: /message/send (Bulk), /message/template, /message/log. API: /api/message/*.
1. Run `migrations/sms_module.sql` once.
2. `.env`: SMS_PROVIDER=mock|bulksmsbd|greenweb|custom, SMS_API_KEY, SMS_SENDER_ID, SMS_MASK_SENDER, SMS_CUSTOM_URL.
3. Auto SMS from other code: `require("./services/sms/sms.service").sendEvent(companyId, "bill_confirmation", phone, { USERNAME, CUSTOMER_ID, CUSTOMER_NAME, AMOUNT, BILL_DUE, BILL_MONTH })`.
4. Give a company SMS balance: create a purchase in Buy SMS, then super admin calls POST /api/message/purchase/:id/confirm.
