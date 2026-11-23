-- App Download & Promotion (platform-level, Super Admin managed)
-- Safe to run once. Rollback: 2026-11-22-app-download.down.sql
-- Existing tables/data are NOT touched.

CREATE TABLE IF NOT EXISTS `app_releases` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `app_type` enum('admin','customer') NOT NULL,
  `version_name` varchar(30) NOT NULL,
  `version_code` int(10) UNSIGNED NOT NULL,
  `release_notes` text DEFAULT NULL,
  `stored_name` varchar(120) NOT NULL COMMENT 'file name inside storage/apk (never user supplied)',
  `original_name` varchar(190) DEFAULT NULL,
  `file_size` bigint(20) UNSIGNED NOT NULL,
  `sha256` char(64) NOT NULL,
  `is_published` tinyint(1) NOT NULL DEFAULT 0,
  `published_at` datetime DEFAULT NULL,
  `uploaded_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_app_version` (`app_type`,`version_code`),
  UNIQUE KEY `uq_app_stored_name` (`stored_name`),
  KEY `idx_app_published` (`app_type`,`is_published`,`version_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `app_promotions` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` varchar(190) NOT NULL,
  `message` text DEFAULT NULL,
  `banner_file` varchar(60) DEFAULT NULL COMMENT 'file name inside storage/promo',
  `button_text` varchar(60) DEFAULT NULL,
  `button_link` varchar(500) DEFAULT NULL,
  `starts_at` datetime DEFAULT NULL COMMENT 'NULL = already started',
  `ends_at` datetime DEFAULT NULL COMMENT 'NULL = never ends',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_promo_show` (`is_active`,`starts_at`,`ends_at`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
