-- Rollback for 2026-11-22-app-download.up.sql
-- WARNING: deletes only the two new tables (release list & promotions).
-- APK / banner files in storage/ are NOT deleted by this script.
DROP TABLE IF EXISTS `app_promotions`;
DROP TABLE IF EXISTS `app_releases`;
