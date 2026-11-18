# Online Pay — সেটআপ ও টেস্ট (bKash, Nagad, SSLCommerz, ShurjoPay)

Rocket ও Bank-এ টাকা এলে জানার কোনো API নেই, তাই ওগুলো Manual Submit-এই থাকবে।

## ১. ফাইল বসানো (একই পাথে কপি)
আগে ব্যাকআপ নিন: `services/payment/sslcommerz.service.js`, `shurjopay.service.js` (এই patch এগুলো নতুন করে লিখেছে), আর `bkash.service.js` যদি আপনার প্রজেক্টে থাকে।
Changed: payment.service.js, customer-recharge.service.js, paymentGateway.controller.js, paymentGateway.js (route), payment-gateway.html, sslcommerz.service.js, shurjopay.service.js
New: bkash.service.js, nagad.service.js, gatewayHttp.js, paymentSettlement.service.js, softwareBillingPayment.service.js, customer-pay.html, software-pay.html, migrations/2026_11_nagad_gateway.sql
Unchanged: payment.factory.js, softwareBilling.controller.js, billingManual.controller.js (আপনার Manual Submit), app.js, security.js

## ২. Database (re-runnable)
```powershell
cd C:\xampp\htdocs\ispbilling-node
Get-Content .\migrations\2026_11_nagad_gateway.sql -Raw | & "C:\xampp\mysql\bin\mysql.exe" -u root ispbilling
```
## ৩. .env ও restart
`PAYMENT_CREDENTIAL_KEY=<লম্বা র‍্যান্ডম সিক্রেট>` (credential এনক্রিপ্ট করে), `APP_BASE_URL=http://localhost:3000` (live এ https)। Node ≥ 18। সার্ভার restart।

## ৪. ⭐ ড্যাশবোর্ডের "Online Pay" বোতাম
বোতামটি এখানে নিয়ে যাবে:
```
/api/payment-gateway/software/pay
```
(নির্দিষ্ট বিল হলে `?billing_id=ID`)। পেজটি ওই ISP-র বকেয়া রেজিস্ট্রেশন ফি / মাসিক বিলের amount (বিলের রো থেকে) দেখায় এবং Super Admin যে Central গেটওয়েগুলো Enable করেছে সেগুলোর বোতাম দেখায়। পেমেন্ট verify হলে বিল paid, invoice paid, রশিদ আসে। আপনার ড্যাশবোর্ড/software-billing পেজের Online Pay বোতামের `href`/`location` এই লিংকে বদলান (ফাইল পাঠালে আমি করে দেব)। Manual Submit অপরিবর্তিত।

## ৫. Credential কোথায় বসবে (শুধু Super Admin)
`http://localhost:3000/api/payment-gateway/` পেজের একদম উপরে **Merchant Account** বাছুন:
- **Central** = Amader Bill-এর গেটওয়ে → ISP-দের রেজিস্ট্রেশন ফি ও মাসিক সফটওয়্যার বিল এখানে আসে।
- **ISP account** + **ISP Company ID** = ওই ISP-র নিজের গেটওয়ে → ওই ISP-র গ্রাহকের বিল ওই ISP-র merchant-এ যায়। "Customer Payment Link Name" (যেমন `my-isp`) দিন; গ্রাহক লগইন ছাড়া `/api/payment-gateway/pay/my-isp`-এ পে করবে।

তারপর যে গেটওয়ের কার্ড, তার credential বসিয়ে Enable টিক দিয়ে Save:
| Gateway | Credential |
|---|---|
| bKash | App Key, App Secret, Username, Password |
| Nagad | Merchant ID, Merchant Number(ঐচ্ছিক), Public Key, Private Key |
| SSLCommerz | Store ID, Store Password |
| ShurjoPay | Username, Password, Prefix |
Secret ফাঁকা রাখলে আগেরটা থাকে; সেভের পর আর দেখা যায় না। Central ও ISP-র credential, লেনদেন, ledger সম্পূর্ণ আলাদা।

## ৬. ⚠️ যা আমি যাচাই করতে পারিনি
কোনো credential না থাকায় কোনো গেটওয়ের সাথে আসল রিকোয়েস্ট চলেনি। কোড অফিসিয়াল/প্রকাশ্য ডকুমেন্টের ফিল্ড অনুযায়ী; প্রথম sandbox টেস্টে ছোটখাটো ফিল্ডের গরমিল বেরোতে পারে:
- SSLCommerz: query-by-tran_id ও validation API (ডক পড়া); callback POST আসে।
- ShurjoPay: sandbox/live base URL অফিসিয়াল পেজে ফাঁকা ছিল — `settings.baseUrl` দিয়ে বদলানো যায়।
- bKash: `payment/status` (query) endpoint পাবলিক ডকে পাইনি; `execute` সফল না হলে query-ই সিদ্ধান্ত নেয়।
- Nagad: sandbox URL, header, verify status মান আপনার Nagad kit-এর সাথে মেলান।
প্রতিটি গেটওয়ে: payment সফল ধরা হয় **শুধু** গেটওয়ের নিজের সার্ভার-টু-সার্ভার verify-এ order id + amount + currency মিললে। ব্রাউজারের callback কিছুই বদলায় না; ভুয়া/অবৈধ callback লেনদেন pending-ই রাখে।

## ৭. টেস্ট (credential পাওয়ার পর)
1. Super Admin → Central → একটি গেটওয়ের sandbox credential → Save → Enable।
2. একটি ISP অ্যাকাউন্টে unpaid মাসিক বিল রাখুন → লগইন → `…/software/pay` → গেটওয়ে বাছুন → sandbox পেজে পেমেন্ট।
3. ফেরার পর পেজে "Payment Successful" ও রশিদ লিংক; DB:
```powershell
& "C:\xampp\mysql\bin\mysql.exe" -u root ispbilling -e "SELECT transaction_id,gateway,scope,purpose,amount,status,applied_at,applied_payment_id FROM payment_transactions ORDER BY id DESC LIMIT 5; SELECT id,status,paid_at FROM software_billing_notifications ORDER BY id DESC LIMIT 3;"
```
4. ভুয়া callback: `Invoke-WebRequest "http://localhost:3000/api/payment-gateway/bkash/callback/NXXXXXXXXXXXX?status=success" -UseBasicParsing` → status `pending`, ledger অপরিবর্তিত।
5. একই callback ৩–৪ বার রিফ্রেশ → `software_billing_payments`-এ একটিই সারি।
6. গ্রাহক: ISP-র লিংক → Customer ID → Check amount → গেটওয়ে → পেমেন্ট → `payments`-এ নতুন সারি।

## ৮. লাইভের আগে
প্রতিটি গেটওয়ের production credential, `environment=live`, `APP_BASE_URL=https://…`, sandbox-এ §৬-এর সব আইটেম যাচাই, `needs_review` লেনদেন দেখার প্রক্রিয়া (টাকা এসেছে কিন্তু বিল আপডেট হয়নি), পুরনো pending-এর auto-reconcile (cron) এখনো নেই, `trust proxy`, HTTPS।

---

## Extra: Payment Review, auto re-check, mobile app

**Payment Review (Super Admin):** open `/api/payment-gateway/review`.
Shows `needs_review` (money received but bill not updated), stuck `verified`
and `pending` older than 30 min. *Retry* asks the gateway again / retries the
ledger step (safe). *Resolve* = you fixed it by hand (refund / manual entry);
a note is required. A `needs_review` payment is never applied automatically.

**Auto re-check:** every 5 minutes the server re-verifies `verified` payments
and `pending` payments (3 min – 24 h old) with the gateway. It never marks a
payment failed by itself. Disable with `PAYMENT_RECONCILE=0` in `.env`.
It starts when `routes/billing/paymentGateway.js` is loaded (no app.js change).

**Flutter / mobile:** keep the login cookie, then
1. `GET /api/payment-gateway/software/info` -> `csrf_token`, `billing_id`, `amount`, `all_gateways`
2. `POST /api/payment-gateway/create` (JSON: `gateway`, `purpose`, `billing_id`, `csrf_token`)
   -> `redirect_url`: open it in a WebView / external browser
3. After returning, poll `GET /api/payment-gateway/status/<transaction_id>`
   -> `{status, paid, final}`; stop when `final` is true.
No separate token API was added; it reuses the same session.
