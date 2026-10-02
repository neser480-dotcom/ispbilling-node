@echo off
cd /d C:\xampp\htdocs\ispbilling-node
"C:\Program Files\nodejs\node.exe" "C:\xampp\htdocs\ispbilling-node\cron\software-billing-monthly.js" >> "C:\xampp\htdocs\ispbilling-node\cron\software-billing-monthly.log" 2>&1