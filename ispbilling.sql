-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Host: localhost
-- Generation Time: Nov 25, 2026 at 07:33 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.0.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `ispbilling`
--

-- --------------------------------------------------------

--
-- Table structure for table `activity_logs`
--

CREATE TABLE `activity_logs` (
  `id` int(11) NOT NULL,
  `company_id` int(11) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `user_name` varchar(100) DEFAULT NULL,
  `action` varchar(255) DEFAULT NULL,
  `description` varchar(500) DEFAULT NULL,
  `module` varchar(100) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `role_name` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `app_promotions`
--

CREATE TABLE `app_promotions` (
  `id` int(10) UNSIGNED NOT NULL,
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
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `app_releases`
--

CREATE TABLE `app_releases` (
  `id` int(10) UNSIGNED NOT NULL,
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
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `app_site_settings`
--

CREATE TABLE `app_site_settings` (
  `setting_key` varchar(60) NOT NULL,
  `setting_value` text DEFAULT NULL,
  `updated_by` int(10) UNSIGNED DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `areas`
--

CREATE TABLE `areas` (
  `id` int(11) NOT NULL,
  `mikrotik_id` int(11) DEFAULT NULL,
  `name` varchar(100) DEFAULT NULL,
  `remarks` varchar(255) DEFAULT NULL,
  `company_id` int(11) NOT NULL DEFAULT 0,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `bandwidth_collections`
--

CREATE TABLE `bandwidth_collections` (
  `id` int(10) UNSIGNED NOT NULL,
  `company_id` int(10) UNSIGNED NOT NULL,
  `reseller_id` int(10) UNSIGNED NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `payment_method` varchar(50) NOT NULL DEFAULT 'Cash',
  `reference_no` varchar(100) DEFAULT NULL,
  `collected_by` int(10) UNSIGNED DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  `collected_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `bandwidth_items`
--

CREATE TABLE `bandwidth_items` (
  `id` int(10) UNSIGNED NOT NULL,
  `company_id` int(10) UNSIGNED NOT NULL,
  `name` varchar(120) NOT NULL,
  `category` varchar(60) DEFAULT 'General',
  `unit_rate` decimal(10,2) NOT NULL DEFAULT 0.00,
  `unit` varchar(20) NOT NULL DEFAULT 'Mbps',
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `bandwidth_resellers`
--

CREATE TABLE `bandwidth_resellers` (
  `id` int(10) UNSIGNED NOT NULL,
  `company_id` int(10) UNSIGNED NOT NULL,
  `bandwidth_id` int(10) UNSIGNED DEFAULT NULL,
  `reseller_name` varchar(150) NOT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `nid_no` varchar(30) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `allocated_mbps` decimal(10,2) NOT NULL DEFAULT 0.00,
  `rate_per_mbps` decimal(10,2) NOT NULL DEFAULT 0.00,
  `monthly_bill` decimal(12,2) NOT NULL DEFAULT 0.00,
  `due_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` enum('active','suspended') NOT NULL DEFAULT 'active',
  `nttn_info` varchar(255) DEFAULT NULL,
  `scr_or_link_id` varchar(150) DEFAULT NULL,
  `activation_date` datetime DEFAULT NULL,
  `vlans_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`vlans_json`)),
  `ips_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`ips_json`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `billings`
--

CREATE TABLE `billings` (
  `id` int(11) NOT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `billing_month` varchar(20) DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `due_amount` decimal(10,2) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'Unpaid',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `mikrotik_id` int(11) DEFAULT NULL,
  `ppp_username` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `bill_reports`
--

CREATE TABLE `bill_reports` (
  `id` int(11) NOT NULL,
  `company_id` int(11) DEFAULT NULL,
  `payment_id` int(11) DEFAULT NULL,
  `user_id` varchar(50) NOT NULL,
  `connection_type` varchar(20) DEFAULT 'PPPoE',
  `customer_name` varchar(150) NOT NULL,
  `area_name` varchar(100) DEFAULT NULL,
  `pppoe_username` varchar(100) NOT NULL,
  `package_name` varchar(100) NOT NULL,
  `bill_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `discount` decimal(10,2) DEFAULT 0.00,
  `due_amount` decimal(10,2) DEFAULT 0.00,
  `collected_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `medium` varchar(50) DEFAULT 'cash',
  `bill_type` varchar(50) DEFAULT 'monthly',
  `collected_by` varchar(100) NOT NULL,
  `collector_role` varchar(50) DEFAULT 'ispOwner',
  `note` varchar(255) DEFAULT 'September',
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `collector_deposit`
--

CREATE TABLE `collector_deposit` (
  `id` int(11) NOT NULL,
  `collector_id` int(11) DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT 0.00,
  `deposit_date` date DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `company_pricing_history`
--

CREATE TABLE `company_pricing_history` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` int(11) NOT NULL,
  `fee_type` enum('registration','monthly','yearly') NOT NULL,
  `action` enum('create','update','enable','disable','reset') NOT NULL,
  `old_mode` varchar(20) DEFAULT NULL,
  `old_value` decimal(12,2) DEFAULT NULL,
  `old_enabled` tinyint(1) DEFAULT NULL,
  `new_mode` varchar(20) DEFAULT NULL,
  `new_value` decimal(12,2) DEFAULT NULL,
  `new_enabled` tinyint(1) DEFAULT NULL,
  `starts_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `note` varchar(500) DEFAULT NULL,
  `changed_by` int(11) NOT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `company_pricing_rules`
--

CREATE TABLE `company_pricing_rules` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` int(11) NOT NULL,
  `fee_type` enum('registration','monthly','yearly') NOT NULL,
  `mode` enum('special_price','fixed_discount') NOT NULL,
  `value` decimal(12,2) NOT NULL,
  `is_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `starts_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `note` varchar(500) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customers`
--

CREATE TABLE `customers` (
  `id` int(11) NOT NULL,
  `created_by` int(11) NOT NULL,
  `customer_id` varchar(50) DEFAULT NULL,
  `name` varchar(100) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `package_name` varchar(50) DEFAULT NULL,
  `monthly_bill` decimal(10,2) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'Active',
  `sync_status` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `last_sync` datetime DEFAULT NULL,
  `mikrotik_id` int(11) DEFAULT NULL,
  `package_id` int(11) DEFAULT NULL,
  `balance` decimal(10,2) DEFAULT 0.00,
  `pppoe_username` varchar(100) DEFAULT NULL,
  `pppoe_password` varchar(100) DEFAULT NULL,
  `area_id` int(11) DEFAULT NULL,
  `sub_area_id` int(11) DEFAULT NULL,
  `nid_no` varchar(50) DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `billing_cycle` varchar(50) DEFAULT NULL,
  `promise_date` datetime DEFAULT NULL,
  `payment_status` enum('paid','unpaid') NOT NULL DEFAULT 'unpaid',
  `connection_date` date DEFAULT NULL,
  `connection_fee` decimal(10,2) DEFAULT 0.00,
  `billing_type` enum('PREPAID','POSTPAID') DEFAULT 'POSTPAID',
  `reference_name` varchar(150) DEFAULT NULL,
  `reference_mobile` varchar(30) DEFAULT NULL,
  `auto_connection` tinyint(1) DEFAULT 1,
  `continue_next_month` tinyint(1) DEFAULT 1,
  `comments` text DEFAULT NULL,
  `connection_type` enum('PPPOE','STATIC','CORPORATE','OTHER') DEFAULT 'PPPOE',
  `reseller_id` int(11) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` int(11) DEFAULT NULL,
  `company_id` int(11) DEFAULT NULL,
  `division` varchar(100) DEFAULT NULL,
  `district` varchar(100) DEFAULT NULL,
  `upazila` varchar(100) DEFAULT NULL,
  `onu_mac` varchar(17) DEFAULT NULL,
  `router_mac` varchar(17) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customers_backup_20261104`
--

CREATE TABLE `customers_backup_20261104` (
  `id` int(11) NOT NULL DEFAULT 0,
  `created_by` int(11) NOT NULL,
  `customer_id` varchar(50) DEFAULT NULL,
  `name` varchar(100) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `package_name` varchar(50) DEFAULT NULL,
  `monthly_bill` decimal(10,2) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'Active',
  `sync_status` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `last_sync` datetime DEFAULT NULL,
  `mikrotik_id` int(11) DEFAULT NULL,
  `package_id` int(11) DEFAULT NULL,
  `balance` decimal(10,2) DEFAULT 0.00,
  `pppoe_username` varchar(100) DEFAULT NULL,
  `pppoe_password` varchar(100) DEFAULT NULL,
  `area_id` int(11) DEFAULT NULL,
  `sub_area_id` int(11) DEFAULT NULL,
  `nid_no` varchar(50) DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `billing_cycle` varchar(50) DEFAULT NULL,
  `promise_date` datetime DEFAULT NULL,
  `payment_status` enum('paid','unpaid') NOT NULL DEFAULT 'unpaid',
  `connection_date` date DEFAULT NULL,
  `connection_fee` decimal(10,2) DEFAULT 0.00,
  `billing_type` enum('PREPAID','POSTPAID') DEFAULT 'POSTPAID',
  `reference_name` varchar(150) DEFAULT NULL,
  `reference_mobile` varchar(30) DEFAULT NULL,
  `auto_connection` tinyint(1) DEFAULT 1,
  `continue_next_month` tinyint(1) DEFAULT 1,
  `comments` text DEFAULT NULL,
  `connection_type` enum('PPPOE','STATIC','CORPORATE','OTHER') DEFAULT 'PPPOE',
  `reseller_id` int(11) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` int(11) DEFAULT NULL,
  `company_id` int(11) DEFAULT NULL,
  `division` varchar(100) DEFAULT NULL,
  `district` varchar(100) DEFAULT NULL,
  `upazila` varchar(100) DEFAULT NULL,
  `onu_mac` varchar(17) DEFAULT NULL,
  `router_mac` varchar(17) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_mobile_accounts`
--

CREATE TABLE `customer_mobile_accounts` (
  `id` int(11) NOT NULL,
  `company_id` int(11) NOT NULL,
  `customer_pk` int(11) NOT NULL COMMENT 'customers.id',
  `password_hash` varchar(255) NOT NULL,
  `must_change_password` tinyint(1) NOT NULL DEFAULT 1,
  `status` enum('active','disabled') NOT NULL DEFAULT 'active',
  `last_login` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_notes`
--

CREATE TABLE `customer_notes` (
  `id` int(11) NOT NULL,
  `company_id` int(11) NOT NULL DEFAULT 0,
  `customer_pk` int(11) NOT NULL,
  `note` text NOT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_by_name` varchar(100) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_tickets`
--

CREATE TABLE `customer_tickets` (
  `id` int(11) NOT NULL,
  `company_id` int(11) NOT NULL,
  `customer_pk` int(11) NOT NULL COMMENT 'customers.id',
  `type` enum('ticket','package_change') NOT NULL DEFAULT 'ticket',
  `subject` varchar(150) NOT NULL,
  `message` text DEFAULT NULL,
  `requested_package_id` int(11) DEFAULT NULL COMMENT 'mikrotik_packages.id (শুধু package_change)',
  `status` enum('open','in_progress','resolved','rejected') NOT NULL DEFAULT 'open',
  `admin_note` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `assigned_staff_id` int(11) DEFAULT NULL,
  `ticket_type` varchar(60) DEFAULT NULL,
  `category` varchar(60) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_traffic_daily`
--

CREATE TABLE `customer_traffic_daily` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `router_id` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `username` varchar(190) NOT NULL,
  `day` date NOT NULL,
  `rx_bytes` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `tx_bytes` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `sessions` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_traffic_state`
--

CREATE TABLE `customer_traffic_state` (
  `router_id` bigint(20) UNSIGNED NOT NULL,
  `username` varchar(190) NOT NULL,
  `company_id` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `last_rx` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `last_tx` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `last_uptime` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 0,
  `last_logged_out` datetime DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `expenditures`
--

CREATE TABLE `expenditures` (
  `id` int(11) NOT NULL,
  `serial_no` int(11) NOT NULL DEFAULT 0,
  `company_id` int(11) NOT NULL DEFAULT 0,
  `expenditure_type` varchar(150) NOT NULL,
  `expense_definition` varchar(255) DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `user_role` varchar(50) DEFAULT 'ispOwner',
  `amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `expenditure_types`
--

CREATE TABLE `expenditure_types` (
  `id` int(11) NOT NULL,
  `serial_no` int(11) NOT NULL DEFAULT 0,
  `company_id` int(11) NOT NULL DEFAULT 0,
  `type_name` varchar(150) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `invoices`
--

CREATE TABLE `invoices` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` int(11) NOT NULL DEFAULT 0,
  `user_id` int(10) UNSIGNED DEFAULT NULL,
  `billing_id` bigint(20) DEFAULT NULL,
  `type` varchar(100) NOT NULL,
  `message_type` varchar(100) DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` varchar(30) NOT NULL DEFAULT 'unpaid',
  `invoice_date` datetime NOT NULL DEFAULT current_timestamp(),
  `due_date` datetime DEFAULT NULL,
  `paid_date` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `login_attempts`
--

CREATE TABLE `login_attempts` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `username` varchar(100) NOT NULL,
  `failed_attempts` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `first_failed_at` datetime DEFAULT NULL,
  `locked_until` datetime DEFAULT NULL,
  `last_ip` varchar(100) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `managers`
--

CREATE TABLE `managers` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `mobile` varchar(20) NOT NULL,
  `nid` varchar(50) NOT NULL,
  `address` varchar(255) NOT NULL,
  `email` varchar(100) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'Active',
  `add_staff` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `messages`
--

CREATE TABLE `messages` (
  `id` int(11) NOT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `mobile` varchar(30) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `status` varchar(20) DEFAULT 'Pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `mikrotik_packages`
--

CREATE TABLE `mikrotik_packages` (
  `id` int(10) UNSIGNED NOT NULL,
  `company_id` int(11) NOT NULL DEFAULT 0,
  `router_id` int(11) NOT NULL,
  `profile_id` varchar(100) NOT NULL,
  `package_name` varchar(255) NOT NULL,
  `price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `alias_name` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `mikrotik_servers`
--

CREATE TABLE `mikrotik_servers` (
  `id` int(11) NOT NULL,
  `created_by` int(11) NOT NULL DEFAULT 0,
  `name` varchar(100) DEFAULT NULL,
  `ip` varchar(100) DEFAULT NULL,
  `username` varchar(100) DEFAULT NULL,
  `password` varchar(100) DEFAULT NULL,
  `port` int(11) DEFAULT 8728,
  `use_ssl` tinyint(1) NOT NULL DEFAULT 0,
  `timeout` int(11) NOT NULL DEFAULT 3,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` int(11) DEFAULT NULL,
  `company_id` int(11) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `mobile_refresh_tokens`
--

CREATE TABLE `mobile_refresh_tokens` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `subject_type` enum('user','customer') NOT NULL,
  `subject_id` int(11) NOT NULL,
  `company_id` int(11) NOT NULL,
  `family_id` char(36) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `device_name` varchar(100) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `replaced_by` bigint(20) UNSIGNED DEFAULT NULL,
  `last_used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `monthly_billing_runs`
--

CREATE TABLE `monthly_billing_runs` (
  `period` char(7) NOT NULL,
  `ran_at` datetime NOT NULL,
  `affected` int(11) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `monthly_billing_snapshots`
--

CREATE TABLE `monthly_billing_snapshots` (
  `id` bigint(20) NOT NULL,
  `period` char(7) NOT NULL,
  `customer_id` bigint(20) NOT NULL,
  `company_id` bigint(20) DEFAULT NULL,
  `balance` decimal(12,2) DEFAULT NULL,
  `payment_status` varchar(20) DEFAULT NULL,
  `promise_date` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `notices`
--

CREATE TABLE `notices` (
  `id` int(10) UNSIGNED NOT NULL,
  `notice_type` enum('invoice','maintenance') NOT NULL,
  `title` varchar(190) NOT NULL,
  `message` text NOT NULL,
  `starts_at` datetime NOT NULL,
  `ends_at` datetime NOT NULL,
  `company_id` int(10) UNSIGNED DEFAULT NULL COMMENT 'NULL = all companies',
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `created_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `olts`
--

CREATE TABLE `olts` (
  `id` int(11) NOT NULL,
  `company_id` int(11) NOT NULL,
  `created_by` int(11) NOT NULL,
  `mikrotik_id` int(11) DEFAULT NULL,
  `vendor` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `location` varchar(150) DEFAULT NULL,
  `ip` varchar(50) NOT NULL,
  `port` int(11) NOT NULL DEFAULT 161,
  `username` varchar(100) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `snmp_version` enum('v1','v2c','v3') DEFAULT 'v2c',
  `community` varchar(100) DEFAULT 'public',
  `pon_ports` int(11) DEFAULT 4,
  `status` enum('online','offline','unknown') DEFAULT 'unknown',
  `cpu` varchar(20) DEFAULT NULL,
  `memory` varchar(20) DEFAULT NULL,
  `temperature` varchar(20) DEFAULT NULL,
  `uptime` varchar(100) DEFAULT NULL,
  `onu_total` int(11) DEFAULT 0,
  `onu_online` int(11) DEFAULT 0,
  `onu_offline` int(11) DEFAULT 0,
  `last_check` datetime DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  `model` varchar(100) DEFAULT 'Auto Detect',
  `mikrotik_user` varchar(100) DEFAULT NULL,
  `mikrotik_mac` varchar(50) DEFAULT NULL,
  `remote_address` varchar(50) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `olt_customer_sessions`
--

CREATE TABLE `olt_customer_sessions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` int(11) NOT NULL,
  `olt_id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `router_id` int(11) DEFAULT NULL,
  `pppoe_username` varchar(255) DEFAULT NULL,
  `caller_id` varchar(32) DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `online_status` tinyint(1) NOT NULL DEFAULT 0,
  `last_seen` datetime DEFAULT NULL,
  `synced_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `olt_customer_session_history`
--

CREATE TABLE `olt_customer_session_history` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` int(11) NOT NULL,
  `olt_id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `router_id` int(11) DEFAULT NULL,
  `pppoe_username` varchar(255) DEFAULT NULL,
  `caller_id` varchar(32) DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `previous_status` tinyint(1) DEFAULT NULL,
  `new_status` tinyint(1) NOT NULL,
  `event_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `olt_monitor_snapshots`
--

CREATE TABLE `olt_monitor_snapshots` (
  `olt_id` int(11) NOT NULL,
  `payload` longtext NOT NULL,
  `captured_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `onu`
--

CREATE TABLE `onu` (
  `id` int(11) NOT NULL,
  `olt_id` int(11) DEFAULT NULL,
  `company_id` int(11) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'offline',
  `last_seen` datetime DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `mac_address` varchar(17) DEFAULT NULL,
  `onu_mac` varchar(17) DEFAULT NULL,
  `olt_name` varchar(100) DEFAULT NULL,
  `pon` varchar(100) DEFAULT NULL,
  `onu_sn` varchar(100) DEFAULT NULL,
  `onu_name` varchar(255) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `port` varchar(100) DEFAULT NULL,
  `rx_power` decimal(5,2) DEFAULT NULL,
  `tx_power` decimal(5,2) DEFAULT NULL,
  `distance` varchar(20) DEFAULT NULL,
  `bias_current` varchar(50) DEFAULT NULL,
  `voltage` decimal(4,2) DEFAULT NULL,
  `temperature` decimal(5,2) DEFAULT NULL,
  `last_update` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `olt_deleted_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `onu_customer_map`
--

CREATE TABLE `onu_customer_map` (
  `onu_mac` varchar(17) NOT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `customer_code` varchar(50) DEFAULT NULL,
  `customer_name` varchar(255) DEFAULT NULL,
  `pppoe_username` varchar(100) DEFAULT NULL,
  `mapped_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `onu_ppp_info`
--

CREATE TABLE `onu_ppp_info` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` int(11) NOT NULL,
  `olt_id` int(11) NOT NULL,
  `onu_id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `pppoe_username` varchar(255) DEFAULT NULL,
  `caller_id` varchar(32) DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `onu_ppp_info_history`
--

CREATE TABLE `onu_ppp_info_history` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `source_id` bigint(20) UNSIGNED NOT NULL,
  `company_id` int(11) NOT NULL,
  `olt_id` int(11) NOT NULL,
  `onu_id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `pppoe_username` varchar(255) DEFAULT NULL,
  `caller_id` varchar(32) DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `original_updated_at` datetime NOT NULL,
  `archived_at` datetime NOT NULL DEFAULT current_timestamp(),
  `replaced_by_olt_id` int(11) DEFAULT NULL,
  `replaced_by_onu_id` int(11) DEFAULT NULL,
  `reason` varchar(50) NOT NULL DEFAULT 'olt_remap'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `onu_user_mapping`
--

CREATE TABLE `onu_user_mapping` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` bigint(20) UNSIGNED NOT NULL,
  `olt_id` bigint(20) UNSIGNED NOT NULL,
  `onu_id` bigint(20) UNSIGNED NOT NULL,
  `customer_id` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `customer_code` varchar(50) DEFAULT NULL,
  `customer_name` varchar(255) DEFAULT NULL,
  `customer_phone` varchar(30) DEFAULT NULL,
  `pppoe_username` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `package_change_requests`
--

CREATE TABLE `package_change_requests` (
  `id` int(11) NOT NULL,
  `company_id` int(11) NOT NULL,
  `customer_id` int(11) NOT NULL,
  `customer_name` varchar(150) NOT NULL,
  `mobile` varchar(30) NOT NULL,
  `previous_package` varchar(120) NOT NULL,
  `requested_package` varchar(120) NOT NULL,
  `status` enum('pending','accepted','rejected') DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payments`
--

CREATE TABLE `payments` (
  `id` int(11) NOT NULL,
  `company_id` int(11) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `discount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `payment_method` varchar(50) DEFAULT NULL,
  `payment_date` date DEFAULT NULL,
  `billing_month` tinyint(4) DEFAULT NULL,
  `billing_year` smallint(6) DEFAULT NULL,
  `months_paid` int(11) NOT NULL DEFAULT 1,
  `is_advance` tinyint(1) NOT NULL DEFAULT 0,
  `comments` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` int(11) DEFAULT NULL,
  `balance_before` decimal(10,2) DEFAULT NULL,
  `balance_after` decimal(10,2) DEFAULT NULL,
  `billing_cycle_before` varchar(50) DEFAULT NULL,
  `promise_date_before` datetime DEFAULT NULL,
  `payment_cancelled_at` datetime DEFAULT NULL,
  `payment_cancelled_by` int(11) DEFAULT NULL,
  `cancellation_reason` varchar(255) DEFAULT NULL,
  `status_before` varchar(20) DEFAULT NULL,
  `payment_status_before` varchar(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Triggers `payments`
--
DELIMITER $$
CREATE TRIGGER `trg_payments_after_insert_bill_report` AFTER INSERT ON `payments` FOR EACH ROW BEGIN

    INSERT INTO bill_reports
    (
        company_id,
        payment_id,
        user_id,
        connection_type,
        customer_name,
        area_name,
        pppoe_username,
        package_name,
        bill_amount,
        discount,
        due_amount,
        collected_amount,
        medium,
        bill_type,
        collected_by,
        collector_role,
        note,
        created_at
    )

    SELECT

        /* COMPANY */
        COALESCE(
            NULLIF(NEW.company_id, 0),
            NULLIF(c.company_id, 0),
            NULLIF(u.company_id, 0),
            0
        ) AS company_id,

        /* ORIGINAL PAYMENT ID */
        NEW.id AS payment_id,

        /* CUSTOMER ID */
        COALESCE(c.customer_id, '') AS user_id,

        /* CONNECTION */
        COALESCE(c.connection_type, 'PPPOE') AS connection_type,

        /* CUSTOMER */
        COALESCE(c.name, '') AS customer_name,

        /* SUB AREA FIRST, AREA SECOND */
        COALESCE(
            NULLIF(sa.name, ''),
            NULLIF(a.name, ''),
            ''
        ) AS area_name,

        /* PPPOE */
        COALESCE(c.pppoe_username, '') AS pppoe_username,

        /* PACKAGE */
        COALESCE(c.package_name, '') AS package_name,

        /* MONTHLY BILL */
        COALESCE(c.monthly_bill, 0.00) AS bill_amount,

        /* NO DISCOUNT FIELD IN PAYMENTS */
        0.00 AS discount,

        /*
         * Do not use customers.balance here.
         * The payment INSERT can happen before the customer
         * balance UPDATE inside the recharge transaction.
         *
         * Therefore this is kept at zero.
         */
        0.00 AS due_amount,

        /* ACTUAL COLLECTION */
        COALESCE(NEW.amount, 0.00) AS collected_amount,

        /* PAYMENT METHOD */
        COALESCE(NEW.payment_method, 'Hand Cash') AS medium,

        /* BILL / ADVANCE */
        CASE
            WHEN NEW.is_advance = 1 THEN 'Advance'
            ELSE 'Bill'
        END AS bill_type,

        /* COLLECTOR */
        COALESCE(
            NULLIF(u.fullname, ''),
            NULLIF(u.username, ''),
            'Unknown'
        ) AS collected_by,

        /* COLLECTOR ROLE */
        COALESCE(
            NULLIF(u.role, ''),
            'unknown'
        ) AS collector_role,

        /* COMMENTS */
        LEFT(
            COALESCE(NEW.comments, ''),
            255
        ) AS note,

        /* PAYMENT DATE */
        COALESCE(
            NEW.payment_date,
            NOW()
        ) AS created_at

    FROM customers c

    LEFT JOIN users u
        ON u.id = NEW.created_by

    LEFT JOIN sub_areas sa
        ON sa.id = c.sub_area_id
       AND sa.area_id = c.area_id

    LEFT JOIN areas a
        ON a.id = c.area_id

    WHERE c.id = NEW.customer_id

    LIMIT 1;

END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `payments_backup_20261116`
--

CREATE TABLE `payments_backup_20261116` (
  `id` int(11) NOT NULL DEFAULT 0,
  `company_id` int(11) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `discount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `payment_method` varchar(50) DEFAULT NULL,
  `payment_date` date DEFAULT NULL,
  `billing_month` tinyint(4) DEFAULT NULL,
  `billing_year` smallint(6) DEFAULT NULL,
  `months_paid` int(11) NOT NULL DEFAULT 1,
  `is_advance` tinyint(1) NOT NULL DEFAULT 0,
  `comments` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` int(11) DEFAULT NULL,
  `balance_before` decimal(10,2) DEFAULT NULL,
  `balance_after` decimal(10,2) DEFAULT NULL,
  `billing_cycle_before` varchar(50) DEFAULT NULL,
  `promise_date_before` datetime DEFAULT NULL,
  `payment_cancelled_at` datetime DEFAULT NULL,
  `payment_cancelled_by` int(11) DEFAULT NULL,
  `cancellation_reason` varchar(255) DEFAULT NULL,
  `status_before` varchar(20) DEFAULT NULL,
  `payment_status_before` varchar(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payment_gateways`
--

CREATE TABLE `payment_gateways` (
  `id` int(10) UNSIGNED NOT NULL,
  `company_id` int(11) DEFAULT NULL,
  `scope` varchar(20) NOT NULL DEFAULT 'customer',
  `gateway` varchar(50) NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 0,
  `environment` varchar(20) NOT NULL DEFAULT 'sandbox',
  `credentials` text DEFAULT NULL,
  `settings` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payment_transactions`
--

CREATE TABLE `payment_transactions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` int(11) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `invoice_id` int(11) DEFAULT NULL,
  `gateway` varchar(50) NOT NULL,
  `purpose` varchar(50) NOT NULL,
  `scope` varchar(20) NOT NULL DEFAULT 'customer',
  `amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `quoted_amount` decimal(12,2) DEFAULT NULL,
  `currency` varchar(10) NOT NULL DEFAULT 'BDT',
  `transaction_id` varchar(100) NOT NULL,
  `gateway_transaction_id` varchar(150) DEFAULT NULL,
  `gateway_session_id` varchar(150) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'pending',
  `payment_date` datetime DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `applied_at` datetime DEFAULT NULL,
  `applied_payment_id` bigint(20) UNSIGNED DEFAULT NULL,
  `applied_ref` varchar(30) DEFAULT NULL,
  `metadata` longtext DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `pon_ports`
--

CREATE TABLE `pon_ports` (
  `id` int(11) NOT NULL,
  `olt_id` int(11) NOT NULL,
  `pon_no` int(11) NOT NULL,
  `status` varchar(30) DEFAULT NULL,
  `online_onu` int(11) DEFAULT 0,
  `offline_onu` int(11) DEFAULT 0,
  `rx_power` decimal(8,2) DEFAULT NULL,
  `tx_power` decimal(8,2) DEFAULT NULL,
  `last_sync` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ppp_profile_backup`
--

CREATE TABLE `ppp_profile_backup` (
  `customer_id` int(11) NOT NULL,
  `profile` varchar(150) NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `resellers`
--

CREATE TABLE `resellers` (
  `id` int(10) UNSIGNED NOT NULL,
  `company_id` int(10) UNSIGNED NOT NULL,
  `name` varchar(150) NOT NULL,
  `mobile` varchar(30) NOT NULL,
  `nid_no` varchar(30) NOT NULL,
  `address` varchar(255) NOT NULL,
  `email` varchar(150) NOT NULL,
  `website` varchar(200) DEFAULT NULL,
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `balance` decimal(12,2) NOT NULL DEFAULT 0.00,
  `commission_type` enum('global','package') NOT NULL DEFAULT 'global',
  `areas_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`areas_json`)),
  `packages_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`packages_json`)),
  `permissions_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`permissions_json`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reseller_recharges`
--

CREATE TABLE `reseller_recharges` (
  `id` int(10) UNSIGNED NOT NULL,
  `company_id` int(10) UNSIGNED NOT NULL,
  `reseller_id` int(10) UNSIGNED DEFAULT NULL,
  `reseller_name` varchar(150) NOT NULL,
  `amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `medium` varchar(60) NOT NULL DEFAULT 'Manual',
  `status` enum('paid','unpaid','pending','rejected') NOT NULL DEFAULT 'pending',
  `comment` varchar(255) DEFAULT NULL,
  `processed_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reseller_sms_requests`
--

CREATE TABLE `reseller_sms_requests` (
  `id` int(10) UNSIGNED NOT NULL,
  `company_id` int(10) UNSIGNED NOT NULL,
  `reseller_id` int(10) UNSIGNED DEFAULT NULL,
  `reseller_name` varchar(150) NOT NULL,
  `sms_amount` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `money_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `processed_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reseller_withdrawals`
--

CREATE TABLE `reseller_withdrawals` (
  `id` int(10) UNSIGNED NOT NULL,
  `company_id` int(10) UNSIGNED NOT NULL,
  `reseller_id` int(10) UNSIGNED DEFAULT NULL,
  `reseller_name` varchar(150) NOT NULL,
  `amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `method` varchar(60) DEFAULT 'Cash',
  `account_info` varchar(150) DEFAULT NULL,
  `status` enum('pending','approved','paid','rejected') NOT NULL DEFAULT 'pending',
  `processed_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `role_permissions`
--

CREATE TABLE `role_permissions` (
  `id` int(11) NOT NULL,
  `company_id` int(11) NOT NULL,
  `role` varchar(30) NOT NULL,
  `permission` varchar(100) NOT NULL,
  `allowed` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `salary`
--

CREATE TABLE `salary` (
  `id` int(11) NOT NULL,
  `staff_id` int(11) DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT 0.00,
  `salary_month` varchar(20) DEFAULT NULL,
  `payment_date` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sessions`
--

CREATE TABLE `sessions` (
  `session_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `expires` int(11) UNSIGNED NOT NULL,
  `data` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `settings`
--

CREATE TABLE `settings` (
  `id` int(11) NOT NULL,
  `company_id` int(11) DEFAULT 1,
  `company_name` varchar(255) DEFAULT NULL,
  `owner_name` varchar(255) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `company_phone` varchar(50) DEFAULT NULL,
  `company_email` varchar(100) DEFAULT NULL,
  `company_address` text DEFAULT NULL,
  `logo` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sms_balances`
--

CREATE TABLE `sms_balances` (
  `company_id` int(11) NOT NULL,
  `type` enum('non_masking','masking','fixed','voice') NOT NULL,
  `balance` int(11) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sms_logs`
--

CREATE TABLE `sms_logs` (
  `id` int(11) NOT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `status` varchar(20) DEFAULT NULL,
  `response` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sms_message_log`
--

CREATE TABLE `sms_message_log` (
  `id` bigint(20) NOT NULL,
  `company_id` int(11) NOT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `channel` enum('non_masking','masking','fixed','voice') NOT NULL,
  `mobile` varchar(20) NOT NULL,
  `status` enum('sent','failed','pending') NOT NULL DEFAULT 'pending',
  `kind` varchar(30) NOT NULL DEFAULT 'bulk',
  `sms_count` int(11) NOT NULL DEFAULT 1,
  `attempt` int(11) NOT NULL DEFAULT 1,
  `duration` int(11) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `error` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sms_prices`
--

CREATE TABLE `sms_prices` (
  `type` enum('non_masking','masking','fixed','voice') NOT NULL,
  `unit_price` decimal(10,4) NOT NULL DEFAULT 0.4000
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sms_purchases`
--

CREATE TABLE `sms_purchases` (
  `id` int(11) NOT NULL,
  `company_id` int(11) NOT NULL,
  `type` enum('non_masking','masking','fixed','voice') NOT NULL,
  `sms_count` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `status` enum('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
  `payment_ref` varchar(80) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `paid_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sms_templates`
--

CREATE TABLE `sms_templates` (
  `company_id` int(11) NOT NULL,
  `event_key` varchar(40) NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `message_type` enum('text','voice') NOT NULL DEFAULT 'text',
  `send_type` enum('non_masking','masking','fixed') NOT NULL DEFAULT 'non_masking',
  `title` varchar(120) NOT NULL DEFAULT '',
  `body` text NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `software_billing_notifications`
--

CREATE TABLE `software_billing_notifications` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` int(11) NOT NULL DEFAULT 0,
  `user_id` int(10) UNSIGNED NOT NULL,
  `billing_type` varchar(50) NOT NULL,
  `package_id` int(10) UNSIGNED DEFAULT NULL,
  `package_code` varchar(50) DEFAULT NULL,
  `user_count` int(10) UNSIGNED DEFAULT NULL,
  `rate_per_user` decimal(12,2) DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` enum('unpaid','paid','cancelled') NOT NULL DEFAULT 'unpaid',
  `due_date` datetime DEFAULT NULL,
  `original_due_date` datetime DEFAULT NULL,
  `extended_by` int(11) DEFAULT NULL,
  `extended_at` datetime DEFAULT NULL,
  `billing_period` char(7) DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `software_billing_payments`
--

CREATE TABLE `software_billing_payments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `billing_id` bigint(20) UNSIGNED NOT NULL,
  `company_id` int(11) NOT NULL DEFAULT 0,
  `user_id` int(11) NOT NULL DEFAULT 0,
  `payment_mode` varchar(30) NOT NULL DEFAULT 'manual',
  `gateway` varchar(50) DEFAULT NULL,
  `transaction_id` varchar(150) DEFAULT NULL,
  `reference_no` varchar(150) DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `currency` varchar(10) NOT NULL DEFAULT 'BDT',
  `status` varchar(30) NOT NULL DEFAULT 'pending',
  `payment_note` text DEFAULT NULL,
  `gateway_response` longtext DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `software_billing_settings`
--

CREATE TABLE `software_billing_settings` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` int(11) NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `monthly_fee` decimal(12,2) NOT NULL DEFAULT 0.00,
  `due_date` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `software_packages`
--

CREATE TABLE `software_packages` (
  `id` int(10) UNSIGNED NOT NULL,
  `package_code` varchar(50) NOT NULL,
  `package_name` varchar(150) NOT NULL,
  `customer_limit` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `signup_fee` decimal(12,2) NOT NULL DEFAULT 0.00,
  `monthly_fee` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `staff`
--

CREATE TABLE `staff` (
  `id` int(11) NOT NULL,
  `company_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `name` varchar(150) NOT NULL,
  `mobile` varchar(20) NOT NULL,
  `nid_no` varchar(50) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `assigned_areas` text DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `parent_name` varchar(150) DEFAULT NULL,
  `salary` decimal(10,2) DEFAULT 0.00,
  `due` decimal(10,2) DEFAULT 0.00,
  `role` varchar(50) DEFAULT 'Employee',
  `status` varchar(20) DEFAULT 'Active',
  `ref_name` varchar(150) DEFAULT NULL,
  `ref_mobile` varchar(20) DEFAULT NULL,
  `ref_email` varchar(150) DEFAULT NULL,
  `ref_nid` varchar(50) DEFAULT NULL,
  `ref_address` text DEFAULT NULL,
  `ref_relation` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `staff_area_assignments`
--

CREATE TABLE `staff_area_assignments` (
  `id` int(11) NOT NULL,
  `company_id` int(11) NOT NULL,
  `staff_id` int(11) NOT NULL,
  `area_id` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `staff_salary`
--

CREATE TABLE `staff_salary` (
  `id` int(11) NOT NULL,
  `company_id` int(11) NOT NULL,
  `staff_id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `payment_date` date NOT NULL,
  `year` int(11) NOT NULL,
  `month` tinyint(4) NOT NULL,
  `note` text DEFAULT NULL,
  `comment` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `staff_sub_area_assignments`
--

CREATE TABLE `staff_sub_area_assignments` (
  `id` int(11) NOT NULL,
  `company_id` int(11) NOT NULL DEFAULT 0,
  `staff_id` int(11) NOT NULL,
  `sub_area_id` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sub_areas`
--

CREATE TABLE `sub_areas` (
  `id` int(11) NOT NULL,
  `area_id` int(11) NOT NULL,
  `company_id` int(11) NOT NULL DEFAULT 0,
  `created_by` int(11) NOT NULL DEFAULT 0,
  `name` varchar(255) NOT NULL,
  `remarks` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `support_numbers`
--

CREATE TABLE `support_numbers` (
  `id` int(11) NOT NULL,
  `company_id` int(11) NOT NULL,
  `name` varchar(150) NOT NULL,
  `mobile` varchar(30) NOT NULL,
  `start_time` varchar(20) NOT NULL,
  `end_time` varchar(20) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `support_tickets`
--

CREATE TABLE `support_tickets` (
  `id` int(10) UNSIGNED NOT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `ticket_code` varchar(50) DEFAULT NULL,
  `customer_name` varchar(150) DEFAULT NULL,
  `ticket_no` varchar(50) NOT NULL,
  `company_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `subject` varchar(255) NOT NULL,
  `problem_type` varchar(100) NOT NULL DEFAULT 'Other',
  `priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  `message` text NOT NULL,
  `status` enum('open','in_progress','waiting_user','resolved','closed') NOT NULL DEFAULT 'open',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `support_ticket_categories`
--

CREATE TABLE `support_ticket_categories` (
  `id` int(11) NOT NULL,
  `company_id` int(11) NOT NULL,
  `name` varchar(120) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `system_notices`
--

CREATE TABLE `system_notices` (
  `id` int(10) UNSIGNED NOT NULL,
  `title` varchar(255) NOT NULL,
  `message` longtext NOT NULL,
  `type` enum('info','feature','update','maintenance','important','warning') NOT NULL DEFAULT 'info',
  `priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  `target_type` enum('all','company') NOT NULL DEFAULT 'all',
  `company_id` int(11) DEFAULT NULL,
  `status` enum('draft','published') NOT NULL DEFAULT 'draft',
  `is_pinned` tinyint(1) NOT NULL DEFAULT 0,
  `publish_at` datetime DEFAULT NULL,
  `expire_at` datetime DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `system_updates`
--

CREATE TABLE `system_updates` (
  `id` int(10) UNSIGNED NOT NULL,
  `title` varchar(255) NOT NULL,
  `type` enum('feature','update','upgrade','maintenance','bug_fix','important') NOT NULL DEFAULT 'update',
  `message` longtext NOT NULL,
  `company_id` int(11) DEFAULT NULL,
  `target_type` enum('all','company') NOT NULL DEFAULT 'all',
  `priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  `status` enum('draft','published') NOT NULL DEFAULT 'draft',
  `is_pinned` tinyint(1) NOT NULL DEFAULT 0,
  `publish_at` datetime DEFAULT NULL,
  `expire_at` datetime DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `company_id` int(11) NOT NULL DEFAULT 0,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `fullname` varchar(100) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `mobile` varchar(20) DEFAULT NULL,
  `role` enum('super_admin','admin','manager','collector','staff') NOT NULL DEFAULT 'staff',
  `status` enum('active','inactive','suspended') NOT NULL DEFAULT 'active',
  `last_login` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `package_id` int(11) DEFAULT 0,
  `client_type` varchar(50) DEFAULT 'PPPoE',
  `customer_id` varchar(50) DEFAULT NULL,
  `reset_token_hash` varchar(64) DEFAULT NULL,
  `reset_token_expires` datetime DEFAULT NULL,
  `settings` text DEFAULT NULL,
  `company_name` varchar(255) DEFAULT NULL,
  `owner_name` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `nid` varchar(50) DEFAULT NULL,
  `add_staff` tinyint(4) DEFAULT 0,
  `created_by` int(11) DEFAULT NULL,
  `name` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Triggers `users`
--
DELIMITER $$
CREATE TRIGGER `auto_increment_company_id` BEFORE INSERT ON `users` FOR EACH ROW BEGIN
    IF NEW.company_id IS NULL OR NEW.company_id = 0 OR NEW.company_id = 1 THEN
        SET NEW.company_id = (SELECT IFNULL(MAX(company_id), 0) + 1 FROM `users`);
    END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `user_permissions`
--

CREATE TABLE `user_permissions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` int(11) NOT NULL,
  `company_id` int(11) NOT NULL,
  `permission_key` varchar(100) NOT NULL,
  `allowed` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_remember_tokens`
--

CREATE TABLE `user_remember_tokens` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `user_type` varchar(30) NOT NULL,
  `selector` varchar(64) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `website_contents`
--

CREATE TABLE `website_contents` (
  `id` tinyint(3) UNSIGNED NOT NULL,
  `content` longtext NOT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `activity_logs`
--
ALTER TABLE `activity_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_activity_company_id` (`company_id`);

--
-- Indexes for table `app_promotions`
--
ALTER TABLE `app_promotions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_promo_show` (`is_active`,`starts_at`,`ends_at`,`sort_order`);

--
-- Indexes for table `app_releases`
--
ALTER TABLE `app_releases`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_app_version` (`app_type`,`version_code`),
  ADD UNIQUE KEY `uq_app_stored_name` (`stored_name`),
  ADD KEY `idx_app_published` (`app_type`,`is_published`,`version_code`);

--
-- Indexes for table `app_site_settings`
--
ALTER TABLE `app_site_settings`
  ADD PRIMARY KEY (`setting_key`);

--
-- Indexes for table `areas`
--
ALTER TABLE `areas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_areas_company_id` (`company_id`),
  ADD KEY `idx_areas_mikrotik_id` (`mikrotik_id`);

--
-- Indexes for table `bandwidth_collections`
--
ALTER TABLE `bandwidth_collections`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_bw_col_company` (`company_id`),
  ADD KEY `idx_bw_col_reseller` (`reseller_id`);

--
-- Indexes for table `bandwidth_items`
--
ALTER TABLE `bandwidth_items`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_bw_item_company_name` (`company_id`,`name`),
  ADD KEY `idx_bw_items_company` (`company_id`);

--
-- Indexes for table `bandwidth_resellers`
--
ALTER TABLE `bandwidth_resellers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_bw_reseller_company` (`company_id`),
  ADD KEY `idx_bw_reseller_item` (`bandwidth_id`);

--
-- Indexes for table `billings`
--
ALTER TABLE `billings`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `bill_reports`
--
ALTER TABLE `bill_reports`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_bill_reports_payment_id` (`payment_id`),
  ADD KEY `idx_bill_reports_company_id` (`company_id`);

--
-- Indexes for table `collector_deposit`
--
ALTER TABLE `collector_deposit`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `company_pricing_history`
--
ALTER TABLE `company_pricing_history`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_company` (`company_id`,`created_at`);

--
-- Indexes for table `company_pricing_rules`
--
ALTER TABLE `company_pricing_rules`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_company_fee` (`company_id`,`fee_type`);

--
-- Indexes for table `customers`
--
ALTER TABLE `customers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_company_pppoe` (`company_id`,`pppoe_username`),
  ADD UNIQUE KEY `unique_company_customer_id` (`company_id`,`customer_id`),
  ADD KEY `idx_mikrotik` (`mikrotik_id`),
  ADD KEY `idx_mikrotik_id` (`mikrotik_id`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_company_id` (`company_id`);

--
-- Indexes for table `customer_mobile_accounts`
--
ALTER TABLE `customer_mobile_accounts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_company_customer` (`company_id`,`customer_pk`);

--
-- Indexes for table `customer_notes`
--
ALTER TABLE `customer_notes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cn_customer` (`company_id`,`customer_pk`);

--
-- Indexes for table `customer_tickets`
--
ALTER TABLE `customer_tickets`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_company_status` (`company_id`,`status`),
  ADD KEY `idx_customer` (`company_id`,`customer_pk`);

--
-- Indexes for table `customer_traffic_daily`
--
ALTER TABLE `customer_traffic_daily`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_ctd` (`router_id`,`username`,`day`),
  ADD KEY `idx_ctd_company_day` (`company_id`,`day`);

--
-- Indexes for table `customer_traffic_state`
--
ALTER TABLE `customer_traffic_state`
  ADD PRIMARY KEY (`router_id`,`username`),
  ADD KEY `idx_cts_company` (`company_id`);

--
-- Indexes for table `expenditures`
--
ALTER TABLE `expenditures`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `expenditure_types`
--
ALTER TABLE `expenditure_types`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `invoices`
--
ALTER TABLE `invoices`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_invoices_type` (`type`),
  ADD KEY `idx_invoices_status` (`status`),
  ADD KEY `idx_invoices_date` (`invoice_date`),
  ADD KEY `idx_invoices_company_id` (`company_id`),
  ADD KEY `idx_invoices_user_id` (`user_id`),
  ADD KEY `idx_invoices_billing_id` (`billing_id`);

--
-- Indexes for table `login_attempts`
--
ALTER TABLE `login_attempts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_login_attempt_username` (`username`),
  ADD KEY `idx_login_attempt_locked_until` (`locked_until`);

--
-- Indexes for table `managers`
--
ALTER TABLE `managers`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `messages`
--
ALTER TABLE `messages`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `mikrotik_packages`
--
ALTER TABLE `mikrotik_packages`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_router_profile` (`router_id`,`profile_id`),
  ADD KEY `idx_company_id` (`company_id`),
  ADD KEY `idx_router_id` (`router_id`);

--
-- Indexes for table `mikrotik_servers`
--
ALTER TABLE `mikrotik_servers`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `mobile_refresh_tokens`
--
ALTER TABLE `mobile_refresh_tokens`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_token_hash` (`token_hash`),
  ADD KEY `idx_subject` (`subject_type`,`subject_id`),
  ADD KEY `idx_family` (`family_id`),
  ADD KEY `idx_expires` (`expires_at`);

--
-- Indexes for table `monthly_billing_runs`
--
ALTER TABLE `monthly_billing_runs`
  ADD PRIMARY KEY (`period`);

--
-- Indexes for table `monthly_billing_snapshots`
--
ALTER TABLE `monthly_billing_snapshots`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_period` (`period`),
  ADD KEY `idx_customer` (`customer_id`);

--
-- Indexes for table `notices`
--
ALTER TABLE `notices`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_notice_live` (`status`,`starts_at`,`ends_at`),
  ADD KEY `idx_notice_company` (`company_id`);

--
-- Indexes for table `olts`
--
ALTER TABLE `olts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_company` (`company_id`),
  ADD KEY `idx_vendor` (`vendor`),
  ADD KEY `idx_ip` (`ip`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_mikrotik` (`mikrotik_id`);

--
-- Indexes for table `olt_customer_sessions`
--
ALTER TABLE `olt_customer_sessions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_olt_customer_session` (`company_id`,`customer_id`),
  ADD KEY `idx_olt_session_olt` (`olt_id`),
  ADD KEY `idx_olt_session_status` (`company_id`,`online_status`),
  ADD KEY `idx_olt_session_username` (`company_id`,`pppoe_username`);

--
-- Indexes for table `olt_customer_session_history`
--
ALTER TABLE `olt_customer_session_history`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_session_history_customer` (`company_id`,`customer_id`,`event_at`),
  ADD KEY `idx_session_history_olt` (`olt_id`,`event_at`);

--
-- Indexes for table `olt_monitor_snapshots`
--
ALTER TABLE `olt_monitor_snapshots`
  ADD PRIMARY KEY (`olt_id`);

--
-- Indexes for table `onu`
--
ALTER TABLE `onu`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_mac` (`mac_address`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_onu_customer_id` (`customer_id`),
  ADD KEY `idx_onu_company_orphan` (`company_id`,`olt_deleted_at`);

--
-- Indexes for table `onu_customer_map`
--
ALTER TABLE `onu_customer_map`
  ADD PRIMARY KEY (`onu_mac`);

--
-- Indexes for table `onu_ppp_info`
--
ALTER TABLE `onu_ppp_info`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_onu_ppp_info_customer` (`company_id`,`customer_id`),
  ADD KEY `idx_onu_ppp_info_onu` (`onu_id`),
  ADD KEY `idx_onu_ppp_info_olt` (`company_id`,`olt_id`);

--
-- Indexes for table `onu_ppp_info_history`
--
ALTER TABLE `onu_ppp_info_history`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_history_customer` (`company_id`,`customer_id`),
  ADD KEY `idx_history_source` (`source_id`),
  ADD KEY `idx_history_olt` (`olt_id`);

--
-- Indexes for table `onu_user_mapping`
--
ALTER TABLE `onu_user_mapping`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_onu_mapping` (`onu_id`),
  ADD KEY `idx_customer_mapping` (`customer_id`),
  ADD KEY `idx_company_olt` (`company_id`,`olt_id`);

--
-- Indexes for table `package_change_requests`
--
ALTER TABLE `package_change_requests`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_pkg_company` (`company_id`),
  ADD KEY `idx_pkg_status` (`status`);

--
-- Indexes for table `payments`
--
ALTER TABLE `payments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_payment_date` (`payment_date`),
  ADD KEY `idx_payments_company_id` (`company_id`);

--
-- Indexes for table `payment_gateways`
--
ALTER TABLE `payment_gateways`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_pg_company_scope_gateway` (`company_id`,`scope`,`gateway`),
  ADD KEY `idx_payment_gateway_company` (`company_id`),
  ADD KEY `idx_payment_gateway_gateway` (`gateway`);

--
-- Indexes for table `payment_transactions`
--
ALTER TABLE `payment_transactions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_payment_transaction_id` (`transaction_id`),
  ADD KEY `idx_payment_company` (`company_id`),
  ADD KEY `idx_payment_user` (`user_id`),
  ADD KEY `idx_payment_customer` (`customer_id`),
  ADD KEY `idx_payment_invoice` (`invoice_id`),
  ADD KEY `idx_payment_gateway` (`gateway`),
  ADD KEY `idx_payment_status` (`status`),
  ADD KEY `idx_pt_applied` (`applied_at`);

--
-- Indexes for table `pon_ports`
--
ALTER TABLE `pon_ports`
  ADD PRIMARY KEY (`id`),
  ADD KEY `olt_id` (`olt_id`);

--
-- Indexes for table `ppp_profile_backup`
--
ALTER TABLE `ppp_profile_backup`
  ADD PRIMARY KEY (`customer_id`);

--
-- Indexes for table `resellers`
--
ALTER TABLE `resellers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_resellers_company` (`company_id`),
  ADD KEY `idx_resellers_status` (`status`);

--
-- Indexes for table `reseller_recharges`
--
ALTER TABLE `reseller_recharges`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_rr_company` (`company_id`),
  ADD KEY `idx_rr_status` (`status`);

--
-- Indexes for table `reseller_sms_requests`
--
ALTER TABLE `reseller_sms_requests`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_rsms_company` (`company_id`),
  ADD KEY `idx_rsms_status` (`status`);

--
-- Indexes for table `reseller_withdrawals`
--
ALTER TABLE `reseller_withdrawals`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_rw_company` (`company_id`),
  ADD KEY `idx_rw_status` (`status`);

--
-- Indexes for table `role_permissions`
--
ALTER TABLE `role_permissions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_role_permission` (`company_id`,`role`,`permission`),
  ADD KEY `idx_company_id` (`company_id`),
  ADD KEY `idx_role` (`role`);

--
-- Indexes for table `salary`
--
ALTER TABLE `salary`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `sessions`
--
ALTER TABLE `sessions`
  ADD PRIMARY KEY (`session_id`);

--
-- Indexes for table `settings`
--
ALTER TABLE `settings`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `sms_balances`
--
ALTER TABLE `sms_balances`
  ADD PRIMARY KEY (`company_id`,`type`);

--
-- Indexes for table `sms_logs`
--
ALTER TABLE `sms_logs`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `sms_message_log`
--
ALTER TABLE `sms_message_log`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_co_ch` (`company_id`,`channel`,`id`),
  ADD KEY `idx_mobile` (`mobile`);

--
-- Indexes for table `sms_prices`
--
ALTER TABLE `sms_prices`
  ADD PRIMARY KEY (`type`);

--
-- Indexes for table `sms_purchases`
--
ALTER TABLE `sms_purchases`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_co` (`company_id`);

--
-- Indexes for table `sms_templates`
--
ALTER TABLE `sms_templates`
  ADD PRIMARY KEY (`company_id`,`event_key`);

--
-- Indexes for table `software_billing_notifications`
--
ALTER TABLE `software_billing_notifications`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_user_type_period` (`user_id`,`billing_type`,`billing_period`),
  ADD KEY `idx_company` (`company_id`),
  ADD KEY `idx_user` (`user_id`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_billing_type` (`billing_type`),
  ADD KEY `idx_sbn_company_user_status` (`company_id`,`user_id`,`status`),
  ADD KEY `idx_sbn_company_status_due` (`company_id`,`status`,`due_date`),
  ADD KEY `idx_sbn_company_id` (`company_id`);

--
-- Indexes for table `software_billing_payments`
--
ALTER TABLE `software_billing_payments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_sbp_gateway_txn` (`gateway`,`transaction_id`),
  ADD KEY `idx_billing_id` (`billing_id`),
  ADD KEY `idx_company_id` (`company_id`),
  ADD KEY `idx_user_id` (`user_id`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_transaction_id` (`transaction_id`),
  ADD KEY `idx_sbp_company_billing` (`company_id`,`billing_id`),
  ADD KEY `idx_sbp_company_user` (`company_id`,`user_id`),
  ADD KEY `idx_sbp_company_status` (`company_id`,`status`),
  ADD KEY `idx_sbp_company_created` (`company_id`,`created_at`);

--
-- Indexes for table `software_billing_settings`
--
ALTER TABLE `software_billing_settings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_billing_settings_user` (`company_id`,`user_id`);

--
-- Indexes for table `software_packages`
--
ALTER TABLE `software_packages`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_package_code` (`package_code`);

--
-- Indexes for table `staff`
--
ALTER TABLE `staff`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_staff_user_id` (`user_id`);

--
-- Indexes for table `staff_area_assignments`
--
ALTER TABLE `staff_area_assignments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_staff_area` (`staff_id`,`area_id`),
  ADD KEY `idx_company_id` (`company_id`),
  ADD KEY `idx_staff_id` (`staff_id`),
  ADD KEY `idx_area_id` (`area_id`);

--
-- Indexes for table `staff_salary`
--
ALTER TABLE `staff_salary`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_staff_salary_month` (`staff_id`,`year`,`month`);

--
-- Indexes for table `staff_sub_area_assignments`
--
ALTER TABLE `staff_sub_area_assignments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_staff_sub` (`staff_id`,`sub_area_id`),
  ADD KEY `idx_company` (`company_id`);

--
-- Indexes for table `sub_areas`
--
ALTER TABLE `sub_areas`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `support_numbers`
--
ALTER TABLE `support_numbers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_support_num_company` (`company_id`);

--
-- Indexes for table `support_tickets`
--
ALTER TABLE `support_tickets`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_ticket_no` (`ticket_no`),
  ADD KEY `idx_company_id` (`company_id`),
  ADD KEY `idx_user_id` (`user_id`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_created_at` (`created_at`);

--
-- Indexes for table `support_ticket_categories`
--
ALTER TABLE `support_ticket_categories`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cat_company` (`company_id`);

--
-- Indexes for table `system_notices`
--
ALTER TABLE `system_notices`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_target` (`target_type`,`company_id`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_publish_at` (`publish_at`),
  ADD KEY `idx_expire_at` (`expire_at`);

--
-- Indexes for table `system_updates`
--
ALTER TABLE `system_updates`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_company_id` (`company_id`),
  ADD KEY `idx_target_type` (`target_type`),
  ADD KEY `idx_type` (`type`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_publish_at` (`publish_at`),
  ADD KEY `idx_expire_at` (`expire_at`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD KEY `company_id` (`company_id`),
  ADD KEY `role` (`role`),
  ADD KEY `status` (`status`),
  ADD KEY `company_id_2` (`company_id`);

--
-- Indexes for table `user_permissions`
--
ALTER TABLE `user_permissions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_user_company_permission` (`user_id`,`company_id`,`permission_key`),
  ADD KEY `idx_user_company` (`user_id`,`company_id`),
  ADD KEY `idx_company_permission` (`company_id`,`permission_key`);

--
-- Indexes for table `user_remember_tokens`
--
ALTER TABLE `user_remember_tokens`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_selector` (`selector`),
  ADD KEY `idx_user` (`user_id`,`user_type`),
  ADD KEY `idx_expires` (`expires_at`);

--
-- Indexes for table `website_contents`
--
ALTER TABLE `website_contents`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `activity_logs`
--
ALTER TABLE `activity_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `app_promotions`
--
ALTER TABLE `app_promotions`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `app_releases`
--
ALTER TABLE `app_releases`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `areas`
--
ALTER TABLE `areas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `bandwidth_collections`
--
ALTER TABLE `bandwidth_collections`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `bandwidth_items`
--
ALTER TABLE `bandwidth_items`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `bandwidth_resellers`
--
ALTER TABLE `bandwidth_resellers`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `billings`
--
ALTER TABLE `billings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `bill_reports`
--
ALTER TABLE `bill_reports`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `collector_deposit`
--
ALTER TABLE `collector_deposit`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `company_pricing_history`
--
ALTER TABLE `company_pricing_history`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `company_pricing_rules`
--
ALTER TABLE `company_pricing_rules`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `customers`
--
ALTER TABLE `customers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `customer_mobile_accounts`
--
ALTER TABLE `customer_mobile_accounts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `customer_notes`
--
ALTER TABLE `customer_notes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `customer_tickets`
--
ALTER TABLE `customer_tickets`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `customer_traffic_daily`
--
ALTER TABLE `customer_traffic_daily`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `expenditures`
--
ALTER TABLE `expenditures`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `expenditure_types`
--
ALTER TABLE `expenditure_types`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `invoices`
--
ALTER TABLE `invoices`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `login_attempts`
--
ALTER TABLE `login_attempts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `managers`
--
ALTER TABLE `managers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `messages`
--
ALTER TABLE `messages`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `mikrotik_packages`
--
ALTER TABLE `mikrotik_packages`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `mikrotik_servers`
--
ALTER TABLE `mikrotik_servers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `mobile_refresh_tokens`
--
ALTER TABLE `mobile_refresh_tokens`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `monthly_billing_snapshots`
--
ALTER TABLE `monthly_billing_snapshots`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `notices`
--
ALTER TABLE `notices`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `olts`
--
ALTER TABLE `olts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `olt_customer_sessions`
--
ALTER TABLE `olt_customer_sessions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `olt_customer_session_history`
--
ALTER TABLE `olt_customer_session_history`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `onu`
--
ALTER TABLE `onu`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `onu_ppp_info`
--
ALTER TABLE `onu_ppp_info`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `onu_ppp_info_history`
--
ALTER TABLE `onu_ppp_info_history`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `onu_user_mapping`
--
ALTER TABLE `onu_user_mapping`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `package_change_requests`
--
ALTER TABLE `package_change_requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payments`
--
ALTER TABLE `payments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payment_gateways`
--
ALTER TABLE `payment_gateways`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payment_transactions`
--
ALTER TABLE `payment_transactions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `pon_ports`
--
ALTER TABLE `pon_ports`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `resellers`
--
ALTER TABLE `resellers`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reseller_recharges`
--
ALTER TABLE `reseller_recharges`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reseller_sms_requests`
--
ALTER TABLE `reseller_sms_requests`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reseller_withdrawals`
--
ALTER TABLE `reseller_withdrawals`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `role_permissions`
--
ALTER TABLE `role_permissions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `salary`
--
ALTER TABLE `salary`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `settings`
--
ALTER TABLE `settings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `sms_logs`
--
ALTER TABLE `sms_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `sms_message_log`
--
ALTER TABLE `sms_message_log`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `sms_purchases`
--
ALTER TABLE `sms_purchases`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `software_billing_notifications`
--
ALTER TABLE `software_billing_notifications`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `software_billing_payments`
--
ALTER TABLE `software_billing_payments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `software_billing_settings`
--
ALTER TABLE `software_billing_settings`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `software_packages`
--
ALTER TABLE `software_packages`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `staff`
--
ALTER TABLE `staff`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `staff_area_assignments`
--
ALTER TABLE `staff_area_assignments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `staff_salary`
--
ALTER TABLE `staff_salary`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `staff_sub_area_assignments`
--
ALTER TABLE `staff_sub_area_assignments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `sub_areas`
--
ALTER TABLE `sub_areas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `support_numbers`
--
ALTER TABLE `support_numbers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `support_tickets`
--
ALTER TABLE `support_tickets`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `support_ticket_categories`
--
ALTER TABLE `support_ticket_categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `system_notices`
--
ALTER TABLE `system_notices`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `system_updates`
--
ALTER TABLE `system_updates`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `user_permissions`
--
ALTER TABLE `user_permissions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `user_remember_tokens`
--
ALTER TABLE `user_remember_tokens`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `bandwidth_collections`
--
ALTER TABLE `bandwidth_collections`
  ADD CONSTRAINT `fk_bw_col_reseller` FOREIGN KEY (`reseller_id`) REFERENCES `bandwidth_resellers` (`id`) ON UPDATE CASCADE;

--
-- Constraints for table `bandwidth_resellers`
--
ALTER TABLE `bandwidth_resellers`
  ADD CONSTRAINT `fk_bw_reseller_item` FOREIGN KEY (`bandwidth_id`) REFERENCES `bandwidth_items` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `user_permissions`
--
ALTER TABLE `user_permissions`
  ADD CONSTRAINT `fk_user_permissions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
