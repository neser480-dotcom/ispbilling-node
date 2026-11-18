# Manual Payment (Send Money + TrxID) — ব্যবহার ও টেস্ট

ব্যাংক/merchant অ্যাকাউন্ট ছাড়া ISP-র নিজের personal Nagad/bKash নম্বরে গ্রাহক Send Money করবে। ISP Admin TrxID মিলিয়ে Approve করবে।
Super Admin merchant পেলে পরে Nagad কার্ডে credential বসাবে (কোড তৈরি আছে) — তখন একই payment লিংকে "Pay with Nagad (online)" বোতামও আসবে।

## ধাপ ১ — মাইগ্রেশন আবার চালান (re-runnable; নতুন TrxID unique index যোগ হবে)
```powershell
cd C:\xampp\htdocs\ispbilling-node
Get-Content .\migrations\2026_11_nagad_gateway.sql -Raw | & "C:\xampp\mysql\bin\mysql.exe" -u root ispbilling
```
## ধাপ ২ — ফাইল বসান ও সার্ভার restart
zip এক্সট্রাক্ট করুন (একই পাথে)। `.env`: `PAYMENT_CREDENTIAL_KEY=<লম্বা র‍্যান্ডম সিক্রেট>` (আগেরটা থাকলে বদলাবেন না)।

## ধাপ ৩ — ISP Admin সেটআপ
1. ISP Admin হিসেবে লগইন → `http://localhost:3000/api/payment-gateway/manual`
2. Enable টিক, Nagad/bKash নম্বর, Payment link name (যেমন `my-isp`) → Save
3. গ্রাহককে লিংক দিন: `http://localhost:3000/api/payment-gateway/pay/my-isp`

## ধাপ ৪ — গ্রাহকের দিক (লগইন ছাড়া)
Customer ID → Check amount (সার্ভারের হিসাব) → ISP-র নম্বরে Send Money → Method, Sender নম্বর, TrxID জমা → "Waiting for Approval" পেজ।

## ধাপ ৫ — Approve
`/api/payment-gateway/manual`-এ "waiting" তালিকা → নিজের Nagad/bKash অ্যাপে TrxID ও টাকা মিলিয়ে **Approve**। এতে গ্রাহকের balance/billing cycle/PPPoE আপডেট হয়, `payments`-এ `Nagad`/`Bkash` পদ্ধতিতে সারি হয়।

## সুরক্ষা (কোডে যা আছে)
- Amount সবসময় সার্ভার হিসাব করে; গ্রাহকের পাঠানো amount ব্যবহার হয় না
- একই TrxID দ্বিতীয়বার জমা হয় না (DB unique index + আগাম চেক)
- Approve ডাবল-ক্লিক/দুই ট্যাবেও ledger-এ একবারই লেখা হয়
- ISP Admin শুধু নিজের কোম্পানির payment দেখে/Approve করে (অন্য ISP-র হলে "not found")
- Approve/Reject/Settings সেভে CSRF; পাবলিক রুটে rate limit (জমা: ১৫ মিনিটে ১০ বার), same-host চেক
- একজন গ্রাহকের ৩টির বেশি "অপেক্ষমাণ" জমা নেওয়া হয় না
- Approve-এর সময় গ্রাহকের due বদলে গেলে (যেমন ইতিমধ্যে রিচার্জ হয়েছে) → `needs_review` (স্বয়ংক্রিয় ভুল ledger হয় না); তালিকায় লাল দেখাবে, হাতে রিচার্জ করুন

## টেস্ট চেকলিস্ট
1. T-A: নিজের ISP slug দিয়ে quote → amount আসে (ভুল Customer ID → "Customer not found")
2. T-B: TrxID জমা → DB: `SELECT transaction_id,status,gateway_transaction_id,amount FROM payment_transactions WHERE gateway='manual' ORDER BY id DESC LIMIT 3;` → status `awaiting_approval`
3. T-C: একই TrxID আবার জমা → "already submitted"
4. T-D: Approve চাপার আগে গ্রাহকের balance/`payments` অপরিবর্তিত; Approve-এর পর একটি নতুন `payments` সারি
5. T-E: Approve দুইবার চাপুন (দুই ট্যাব) → `payments`-এ একটিই সারি
6. T-F: অন্য ISP Admin দিয়ে লগইন করে ওই transaction approve করার চেষ্টা → "not found"
7. T-G: Reject → status `failed`, ledger অপরিবর্তিত
Software subscription এখনকার মতোই (Super Admin-এর ম্যানুয়াল পেমেন্ট) — এতে কোনো পরিবর্তন নেই।
