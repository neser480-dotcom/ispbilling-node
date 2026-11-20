# Batch 1 — Collector, Manager, Report/Deposit, Expenditure (Backend)

## ফাইল (আপনার ispbilling-node-এ)
| ZIP-এর ফাইল | কী করবেন |
|---|---|
| `routes/mobile/adminStaffReports.js` | **নতুন** — `routes\mobile\`-এ রাখুন |
| `routes/mobile/index.js` | **Replace** (শুধু ১ লাইন বাড়তি: `adminStaffReports` মাউন্ট) |
| `services/mobile/webBridge.js` | **Replace** (আগেরটির সুপারসেট; Web-এর CSRF শর্ত পূরণের জন্য `csrf` অপশন যোগ হয়েছে) |
| `test/adminStaffReports.test.js` | নতুন; `node test\adminStaffReports.test.js` |

আগে `routes\mobile\` ও `services\mobile\`-এর backup নিন। তারপর সার্ভার restart।

## Endpoint (সব `/api/mobile/admin/...`, Bearer লাগবে; Billing-গেট আগের মতোই প্রযোজ্য)
**Collector** (শুধু admin/super_admin): `GET /collectors`, `GET /collectors/areas`, `POST /collectors`, `GET /collectors/:id/{profile,edit-data,activity,balance}`, `PUT /collectors/:id`, `PUT /collectors/:id/password`, `DELETE /collectors/:id`
**Manager** (শুধু admin/super_admin): একই, `balance` ছাড়া — `/managers...`
**Report** (শুধু পড়া): `GET /reports/collection`, `/reports/collection/filters`, `/reports/deposit`, `/reports/collector-deposit`, `/reports/collector-deposit/collectors` — প্যারামিটার: `page, limit, search, from_date, to_date, from_dt, to_dt` (+ `tab, collector_id, reseller_id`)
**Expenditure**: `GET /expenditures` (সবাই), `POST/PUT /expenditures[/:id]` ও `POST/PUT/DELETE /expenditure-types[/:id]` (শুধু admin), `DELETE /expenditures/:id` (`expenditure_delete` Permission)

উত্তর = বিদ্যমান Web Handler-এর JSON (হুবহু আকার), শুধু `password/token/secret/hash/pppoe*/nid*`-নামের ফিল্ড মুছে ফেলা। `GET /expenditures` গ্রহণ করে: `date_from, date_to, filter=1, name, type`।

## সিদ্ধান্ত যা আপনার (ফাইলের উপরের অংশে)
- `REPORT_PERMISSION = null` → Report Web-এর মতোই: লগইন করা যে-কেউ নিজের Company-র রিপোর্ট দেখে (Collector/Staff-ও)। কঠোর করতে `"bill_posting"`-এর মতো একটি Permission key বসান।
- Expenditure যোগ/সম্পাদনা আমি **মোবাইলে শুধু Admin-এর জন্য** রেখেছি (Web-এ লগইনই যথেষ্ট ছিল)। Staff-কেও দিতে চাইলে বলুন।

## এখনো বাকি
Customer Recharge/Add/Edit, Employee/Salary, Active PPPoE, OLT/Monitoring, Activity Log, Report-এর বিল-বাতিল।
Flutter স্ক্রিন: এই API আপনার সার্ভারে চালিয়ে আসল JSON দেখে মিলিয়ে বানানো হবে।
