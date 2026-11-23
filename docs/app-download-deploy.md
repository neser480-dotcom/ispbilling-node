# Amader Bill — App Download Website: VPS Deployment Guide

বিদ্যমান বিলিং সার্ভিস/ডোমেইন অপরিবর্তিত থাকে। শুধু একটি নতুন সাবডোমেইন + নতুন টেবিল যোগ হয়।

## 1. DNS
`app.amaderbill.com` → A record → VPS public IP (বিদ্যমান প্যানেলের IP-ই)। TTL 300।

## 2. ডাটাবেস মাইগ্রেশন (আগে ব্যাকআপ)
```bash
mysqldump -u USER -p DBNAME > ~/db-before-appdl.sql
mysql -u USER -p DBNAME < migrations/2026-11-22-app-download.up.sql
# rollback (শুধু app_releases ও app_promotions ড্রপ করে):
# mysql -u USER -p DBNAME < migrations/2026-11-22-app-download.down.sql
```

## 3. স্টোরেজ ডিরেক্টরি (ওয়েব-রুটের বাইরে)
```bash
sudo mkdir -p /var/lib/amaderbill/apk /var/lib/amaderbill/promo
sudo chown -R <node-user>:<node-user> /var/lib/amaderbill
sudo chmod 750 /var/lib/amaderbill /var/lib/amaderbill/*
```

## 4. `.env` (নতুন কী যোগ করুন, পুরনোগুলো ছোঁবেন না)
```
APP_DOWNLOAD_HOST=app.amaderbill.com
PUBLIC_BASE_URL=https://app.amaderbill.com
APK_STORAGE_DIR=/var/lib/amaderbill/apk
PROMO_STORAGE_DIR=/var/lib/amaderbill/promo
APK_MAX_MB=300
TRUST_PROXY=1
```
`APP_DOWNLOAD_HOST` সেট থাকলে ওই হোস্টে শুধু পাবলিক সাইট ও `/api/app-download/*` (admin বাদে) চলে; লগইন/অ্যাডমিন সেখানে 404।

## 5. Nginx (নতুন ফাইল: /etc/nginx/sites-available/app.amaderbill.com)
```nginx
server {
    listen 80;
    server_name app.amaderbill.com;
    client_max_body_size 320m;          # APK_MAX_MB এর চেয়ে সামান্য বেশি

    location / {
        proxy_pass http://127.0.0.1:3000;   # আপনার Node পোর্ট
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_request_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/app.amaderbill.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
মূল প্যানেলের অ্যাডমিন ডোমেইনে APK আপলোড করলে সেই server block-এও `client_max_body_size 320m;` লাগবে (শুধু upload পথের জন্য `location /api/app-download/apk { client_max_body_size 320m; ... }` দিলেও চলে)।

## 6. HTTPS / SSL
```bash
sudo certbot --nginx -d app.amaderbill.com
sudo certbot renew --dry-run
```

## 7. রিস্টার্ট
```bash
pm2 restart <app-name> --update-env     # বা systemctl restart <service>
```

## 8. APK আপলোড ও পাবলিশ
Super Admin লগইন → সাইডবার **App & Promotion Management** → App Management → App (Admin/Customer), Version number, Version code, Release notes, APK ফাইল → Upload (Publish immediately টিক দিলে সাথে সাথে সাইটে আসবে)। পরে ইতিহাস টেবিল থেকে Publish/Unpublish করা যায়। Unpublished APK ডাউনলোড হয় না (404)।

ডাউনলোড লিংক: `https://app.amaderbill.com/api/app-download/download/admin` ও `/download/customer` (সর্বশেষ পাবলিশড)।

## 9. প্রমোশন
Promotion Management ট্যাব → New Promotion: টাইটেল, মেসেজ, ব্যানার (PNG/JPG/WebP), বাটন, শুরু/শেষ তারিখ, Active/Inactive, Sort order, লাইভ Preview। সাইটে শুধু Active + তারিখের মধ্যে থাকাগুলো আসে।

## 10. নিরাপত্তা সারাংশ
শুধু Super Admin আপলোড/এডিট; CSRF + সেশন বিদ্যমান সিস্টেমের; APK ZIP/AndroidManifest যাচাই; সার্ভার-জেনারেটেড ফাইলনাম (ওভাররাইট নেই); SHA-256 সংরক্ষণ; ব্যানার ম্যাজিক-বাইট যাচাই; path traversal রোধ; ডাউনলোড রেট-লিমিট।
