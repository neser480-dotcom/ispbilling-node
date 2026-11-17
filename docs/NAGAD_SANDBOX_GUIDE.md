# Nagad Sandbox — সেটআপ ও টেস্ট গাইড

## ১. ফাইল বসানো (প্রজেক্ট ফোল্ডারে একই পাথে কপি করুন)
Changed:  `services/payment/payment.service.js`, `services/customers/customer-recharge.service.js`,
          `controllers/billing/paymentGateway.controller.js`, `routes/billing/paymentGateway.js`,
          `views/billing/payment/payment-gateway.html`
New:      `services/payment/nagad.service.js`, `services/payment/paymentSettlement.service.js`,
          `services/billing/softwareBillingPayment.service.js`, `views/billing/payment/customer-pay.html`,
          `migrations/2026_11_nagad_gateway.sql`
Unchanged (ইচ্ছাকৃত): `payment.factory.js` (nagad আগে থেকেই wired), `softwareBilling.controller.js`, `app.js`, `security.js`.

## ২. Database
ব্যাকআপ আপনি নিয়েছেন। তারপর:
```powershell
cd C:\xampp\htdocs\ispbilling-node
Get-Content .\migrations\2026_11_nagad_gateway.sql -Raw | & "C:\xampp\mysql\bin\mysql.exe" -u root ispbilling
& "C:\xampp\mysql\bin\mysql.exe" -u root ispbilling -e "SHOW CREATE TABLE payment_gateways\G"
```
(না চালালে নতুন কোড কাজ করবে না — `scope` কলাম লাগে।)

## ৩. .env
```
PAYMENT_CREDENTIAL_KEY=<কমপক্ষে ৩২ অক্ষরের র‍্যান্ডম সিক্রেট>   # আগেরটা থাকলে বদলাবেন না
APP_BASE_URL=http://localhost:3000                              # আপনার আসল URL (live এ https)
# NAGAD_SANDBOX_BASE_URL=...   # শুধু যদি আপনার Nagad kit-এর sandbox URL আলাদা হয়
```
Node ≥ 18 লাগবে (`node -v`)। Reverse proxy থাকলে `app.set("trust proxy", 1)` দিন, নইলে rate-limit/IP ঠিক আসবে না।
সার্ভার restart করুন।

## ৪. Nagad Sandbox credential বসানো
Nagad merchant kit থেকে পাবেন: Merchant ID, Nagad PG Public Key, Merchant Private Key।
- **Super Admin → Payment Gateway → Nagad → "Central account"** : Amader Bill-এর সফটওয়্যার সাবস্ক্রিপশনের টাকা এখানে।
- **Super Admin → "ISP account"** : গ্রাহকের বিলের টাকা ISP-র নিজের merchant এ। "Customer Payment Link Name" দিন (যেমন `my-isp`)।
- Key PEM বা raw base64 — দুটোই চলবে। Save করলে key আর ব্রাউজারে ফেরত আসে না; ফাঁকা রাখলে পুরনো key থাকে।
- দুই account-এর credential, ledger, transaction আলাদা; একটি অন্যটির fallback নয়।

## ৫. ⚠️ Nagad API যাচাই (আমি পারিনি)
এই কোড Nagad-এর প্রকাশ্য checkout flow (initialize → complete → verify) অনুযায়ী লেখা, কিন্তু আমার কাছে **অফিসিয়াল Nagad ডকুমেন্ট/sandbox অ্যাকাউন্ট ছিল না** এবং আমি Nagad-এ কোনো রিকোয়েস্ট পাঠাইনি। আপনার kit-এর সাথে মিলিয়ে দেখুন:
1. Sandbox base URL (`nagad.service.js` → `SANDBOX_BASE`)
2. Header নাম (`X-KM-Api-Version` ইত্যাদি) ও version
3. Verify response-এর `status`/`statusCode` মান ও ফিল্ড নাম
4. Initialize response-এর signature কোন অ্যালগরিদমে — এখন SHA256/SHA1 দুটোই চেষ্টা হয়, ফলাফল `metadata.initiate.initialize_signature_ok`-এ থাকে
5. Callback query ফিল্ড (`payment_ref_id`, `order_id`, `status`) — কোড এগুলোর উপর নির্ভর করে না; সবসময় নিজের DB-র ref দিয়ে Verify API ডাকে
6. orderId-র সর্বোচ্চ দৈর্ঘ্য (এখন ~১৭ অক্ষর)
7. Sandbox কি `localhost` callback গ্রহণ করে, নাকি public https URL (ngrok) লাগে

## ৬. PowerShell টেস্ট
সব টেস্ট লগইন সেশন কুকি দিয়ে। প্রথমে লগইন (আপনার লগইন রুট/ফিল্ড অনুযায়ী বদলান):
```powershell
$base = "http://localhost:3000"
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-RestMethod "$base/api/auth/login" -Method Post -WebSession $s -ContentType "application/json" `
  -Body (@{ username="ADMIN_USER"; password="ADMIN_PASS" } | ConvertTo-Json)
$csrf = (Invoke-RestMethod "$base/api/payment-gateway/csrf" -WebSession $s).csrf_token
```
**T1 Credential সেভ (Nagad, ISP)** — UI থেকেই করা সহজ; API দিয়ে:
```powershell
$pub  = Get-Content .\nagad_pg_public.pem -Raw
$priv = Get-Content .\merchant_private.pem -Raw
$body = @{ gateway="nagad"; scope="customer"; enabled=$true; environment="sandbox"
  credentials=@{ merchantId="MERCHANT_ID"; publicKey=$pub; privateKey=$priv }
  settings=@{ slug="my-isp" } } | ConvertTo-Json -Depth 5
Invoke-RestMethod "$base/api/payment-gateway/save" -Method Post -WebSession $s -ContentType "application/json" -Headers @{ "X-CSRF-Token"=$csrf } -Body $body
Invoke-RestMethod "$base/api/payment-gateway/list?scope=customer" -WebSession $s | ConvertTo-Json -Depth 6   # privateKey দেখা যাবে না
```
**T2 CSRF ছাড়া save → 419 হতে হবে**
```powershell
try { Invoke-RestMethod "$base/api/payment-gateway/save" -Method Post -WebSession $s -ContentType "application/json" -Body '{"gateway":"nagad"}' } catch { $_.Exception.Response.StatusCode.value__ }
```
**T3 Public quote (লগইন ছাড়া) — amount সার্ভার বলবে**
```powershell
Invoke-RestMethod "$base/api/payment-gateway/public/quote" -Method Post -ContentType "application/json" `
  -Body (@{ slug="my-isp"; customer_id="CUSTOMER_ID"; bill_type="Bill"; recharge_month=1 } | ConvertTo-Json)
```
**T4 ব্রাউজারের amount উপেক্ষা** — body-তে `amount=1` পাঠিয়ে দেখুন, quote/create-এর amount বদলায় না:
```powershell
Invoke-RestMethod "$base/api/payment-gateway/public/quote" -Method Post -ContentType "application/json" `
  -Body (@{ slug="my-isp"; customer_id="CUSTOMER_ID"; amount=1 } | ConvertTo-Json)
```
**T5 অন্য ISP-র গ্রাহক ID → "Customer not found"** (slug অন্য কোম্পানির ID দিয়ে চেষ্টা করুন)।
**T6 Public create → Nagad sandbox পেজে রিডাইরেক্ট**
```powershell
$r = Invoke-RestMethod "$base/api/payment-gateway/public/create" -Method Post -ContentType "application/json" `
  -Body (@{ slug="my-isp"; customer_id="CUSTOMER_ID"; bill_type="Bill"; recharge_month=1 } | ConvertTo-Json)
$r; Start-Process $r.redirect_url   # Nagad sandbox wallet দিয়ে পেমেন্ট করুন
```
**T7 সফটওয়্যার বিল (লগইন + CSRF)**
```powershell
Invoke-RestMethod "$base/api/payment-gateway/create" -Method Post -WebSession $s -ContentType "application/json" -Headers @{ "X-CSRF-Token"=$csrf } `
  -Body (@{ gateway="nagad"; purpose="software_billing"; billing_id=BILLING_ID } | ConvertTo-Json)
```
**T8 ভুয়া callback কিছু বদলায় না**
```powershell
Invoke-WebRequest "$base/api/payment-gateway/nagad/callback/NXXXXXXXXXXXX?status=Success&payment_ref_id=FAKE" -UseBasicParsing
```
শেষে DB দেখুন — status `pending` থাকতে হবে, ledger অপরিবর্তিত:
```powershell
& "C:\xampp\mysql\bin\mysql.exe" -u root ispbilling -e "SELECT id,transaction_id,scope,purpose,amount,status,applied_at,applied_payment_id FROM payment_transactions ORDER BY id DESC LIMIT 5"
```
**T9 Duplicate callback** — সফল পেমেন্টের callback URL ৩–৪ বার রিফ্রেশ করুন → `payments`/`software_billing_payments`-এ একটি-ই সারি।
**T10 Rate limit** — `public/quote` ৪১ বার দ্রুত ডাকলে 429।

## ৭. লাইভে যাওয়ার আগে
- Nagad-এর কাছ থেকে **production merchant** + live key; `environment=live`, `APP_BASE_URL=https://…`
- Nagad-এ callback URL/ডোমেইন whitelist (যদি চান)
- উপরের §৫-এর সব আইটেম sandbox-এ সফলভাবে যাচাই
- `.env`-এ শক্ত `PAYMENT_CREDENTIAL_KEY` (বদলালে সেভ করা credential আর পড়া যাবে না — ব্যাকআপ রাখুন)
- `needs_review` স্ট্যাটাসের জন্য অপারেশন প্রসেস (টাকা এসেছে কিন্তু ledger আপডেট হয়নি → ম্যানুয়াল Advance/refund); অ্যাডমিন লিস্ট UI এখনো নেই
- পুরনো `pending` লেনদেনের স্বয়ংক্রিয় reconciliation (cron) এখনো নেই; এখন result পেজ খুললে রি-ভেরিফাই হয়
- Public লিংকে Customer ID অনুমান-ঠেকাতে rate limit আছে; চাইলে মোবাইল নম্বরের শেষ ৪ ডিজিট যাচাই যোগ করুন
- HTTPS, `trust proxy`, ব্যাকআপ, লগ মনিটরিং
