-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Host: localhost
-- Generation Time: Nov 24, 2026 at 07:22 AM
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

--
-- Dumping data for table `sessions`
--

INSERT INTO `sessions` (`session_id`, `expires`, `data`) VALUES
('8XSztPh9Js1cQ_HpGNBCpQ_86689ePtG', 1795552321, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:32:00.589Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"a615e82d1959b3f7f03e824dc56d3b7e8e2e922e50625351b2b98904692ecb4c\"}'),
('8tuZUqwegSdqnyheKX0xkMIVrEzdiv8O', 1795551908, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:25:07.842Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"3600b8f3bedae8bd9c31915153513df2bb0ed6324c406c3cd888d4ca47f47888\"}'),
('9cmvx5yXxmIhV4PxYRrE29-HOUaDYGJG', 1795587085, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-25T06:11:24.893Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"66edad5bbd0266f5ced838c079121e44b901839d7c638e6e19fb1c628a925c23\",\"forgot_otp_last_request\":1795500684892,\"password_reset_user_id\":null,\"password_reset_verified_until\":null}'),
('ALdyUWQ10lpn7t5voxMAhsMVs0G2wIPn', 1795550633, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:03:53.219Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"3fe6ab5508b389f6f01c70320406878c8e54b1ae80fae9bfa78b5d47afe979b5\"}'),
('C_XzknZQnYfhcGYIRb5q2jBj2B30G4FR', 1795551907, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:25:07.331Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"eb607e6b559c1a9cc91b9486a8e0b8842f30f508cea6b2c4b2b00733d699bc25\"}'),
('Gx-9qZJ4LIASpo9hQ2aeeSu5Idk2w9TF', 1795551835, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:23:55.478Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"50d62ccc8da0bd5e2864decd854247c6e6c2e2a3c5e133264d808289feff64f6\"}'),
('IF9vi4UaK3SgOK2Y93twuCF1bhXFlQR7', 1795550960, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:09:19.826Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"291fd9d69844e8554f78fd74eb2e5618cd95d8ac8ad6339ddd2bc2f237e604e6\"}'),
('IWshMYkuJbioSez71mRAmz7kvaS0Ql0h', 1795552051, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:27:30.850Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"02c52016b40ce678db3a871d8cf07fbde0a9f90b25f60a1fe52f7cc5d38ff001\"}'),
('J3RAqT9I7ogre3BkxVCHgY2mYvlkbdnY', 1795551908, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:25:07.569Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"a1193559c63c0771c490955f9fb02e4679c4ca86f959497d595f664e2af63e7a\"}'),
('J4ccQaVnFZ8eEOJbt96-ebh-Ei9VrEIE', 1795551456, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:17:36.265Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"563d409c427c8f1a5343e97ca68d6748beb733ab3af1e411a6ead987bd26551b\"}'),
('LPoOj_vzdPQfKIGzgpm-YyN_Dyj-wsiu', 1795550634, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:03:54.041Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"8c6e3a184bfa4c4803f6b93f861f9d13d78a8e3bb2423334f23610607fdf0c98\"}'),
('LagOsb0ZYGTktx8apbU8-Qu4BACkBGav', 1795551907, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:25:06.817Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"351efc0268847c93e5f25593a5ce8ccdc85ae7de53200427b800d99e56bfc2c4\"}'),
('Ll68D7kjOIO5jQNJjy9Z01nPKM-qM1MP', 1795551832, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:23:52.105Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"2419bc23e54340a8875dedbbe212d16edbf4ff106ca49cc9079816e713643149\"}'),
('NY7J8HggFY1fB4mEPoLO4ZrwAhdOJbP_', 1795551847, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:24:07.190Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"8708622ec9d2fd0005bc0af66909f7f3ef82301cd0d4df94af31db8cf93780cc\"}'),
('RQi75uc1YzkTssmhy4-l6UBsjB7Wjdqj', 1795552054, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:27:34.007Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"49cab4ad20d35be70ebb986341d3e5555df69204f1a5ac17714a0f19e224fb65\"}'),
('TMZ4FnRUP18D7GVB7668bhtUaLEHzERE', 1795551908, '{\"cookie\":{\"originalMaxAge\":86399999,\"expires\":\"2026-11-24T20:25:08.374Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"4c3658f14037604df1e1257f41afc40ee4b92f68d7572182f6c89c3f94ba50b1\"}'),
('Vpn8_1zGumfJptU1TcwxpJGhmobatBT7', 1795550951, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:09:11.075Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"d236df8e1813a851d2b406df64091c054feb3f4fa61c77e354a92a65acc7064c\"}'),
('Xv-xyaa84hRfcmY7x2_CWnWQEcykk5bu', 1795550634, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:03:54.464Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"1e96fc361c6baf4dff7a95c8bb8543651c3bf7a88a253f2f167d1e9a9c2dfef9\"}'),
('Z-IZKqTgfq6vGxltgyrVDn3SEao9P8yK', 1795551908, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:25:08.118Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"3bf54e22b7284434e4d23a61f358fa7f449e21085a1d207e2ac87044c2389688\"}'),
('c8CPW5Qlsy-LY4wbe1tYQuW5wvqIhgFR', 1795550726, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:05:26.498Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"ade8979aa32fa10f85627e426478ca60f711541e04b7801ae45c34835d9e4d39\"}'),
('cCcEdTdGUROjEj-78T2r-9mh0O1Tx7hk', 1795549713, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T19:39:43.368Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"0fcb39066f4ed226f005b4fd080aada8b3bb13fa39455d3a3d8eb46505ccd197\"}'),
('cEcriweb6ZjBTDoBHPgVQbirrmkVmyG0', 1795550680, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:04:39.675Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"0de197c5d3d2f6f50d430bedd224f80f04364b70a507a43a54f8267c57ce311b\"}'),
('dnW73qBL2PYFCmuRkcASUiTpk6kAAn6C', 1795586676, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T22:05:32.631Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user_id\":8,\"username\":\"NESER0162\",\"fullname\":\"নেছার উদ্দিন\",\"role\":\"super_admin\",\"company_id\":8,\"client_type\":\"PPPoE\",\"customer_id\":\"ISP-10008\",\"csrf_token\":\"cb4765b6f25a2bcb1b840ed445c1409e721cbc02fccba5076dbfc1b02e69b0ed\"}'),
('kp1_O2IaGr3Hvo0Tw8XMAkMkgunuVFfU', 1795550739, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:05:39.132Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"7442720a589eff4a8a215307df6e4509dbea9c8d3176d3419b45243adbe5bb5b\"}'),
('nI5Uth2So1VTikWGzUNxH0vMDiFKDjso', 1795550636, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:03:55.776Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"1c2cbb8b3315e4dc512af230959e54ea8a8d7dc434e695211ef4a8042b3fe982\"}'),
('oVb4JHzNb-ZTGUeIgICvpA9baCIVH2ES', 1795550635, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:03:54.948Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"9cbd9201e92f438a07343f5a1a2f08554baa6fbbd001d7ca5699ae7735b41627\"}'),
('ovGWeyIABu7X3PpTQs7w4HGW9T1BVa40', 1795550743, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:05:43.255Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"8fa0ac6bfe634d87150ca8b1398ed52d34c53d47889dccec0ec058897cec451d\"}'),
('qXnMwN18RyL68AACmSXHfJhr7Z2dfp1j', 1795550715, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:05:15.288Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"e72d0f451064e5159aed94cd8128341eed9149fee34cb42069e89d30f6417da1\"}'),
('rD37HTfls_hz6rUI1qChOHJ-XKVumW_V', 1795558305, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T22:11:44.422Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"9228102b0933f8f0431a5064705532de755c287f44152196978a1770beddad49\"}'),
('vhJTgUqhprofP4xwWItfjcBUpZwnjJs6', 1795550635, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:03:55.369Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"048987933c36e1cf7492e3e6008d7d24fff25085963a54993a26dc3b63749c61\"}'),
('xy3DihauyNFLWnRf3soKxM92n2czFy-0', 1795552316, '{\"cookie\":{\"originalMaxAge\":86400000,\"expires\":\"2026-11-24T20:31:56.037Z\",\"secure\":true,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"csrf_token\":\"8ec1f9dbe47bb63ace094179d5092450d11a8c70da048b05d3890e30f622812c\"}');

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
-- Table structure for table `support_tickets`
--

CREATE TABLE `support_tickets` (
  `id` int(10) UNSIGNED NOT NULL,
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
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `company_id`, `username`, `password`, `fullname`, `email`, `mobile`, `role`, `status`, `last_login`, `created_at`, `package_id`, `client_type`, `customer_id`, `reset_token_hash`, `reset_token_expires`, `settings`, `company_name`, `owner_name`, `phone`, `address`, `nid`, `add_staff`, `created_by`, `name`) VALUES
(8, 8, 'NESER0162', '$2b$12$CuDMZtWcOOwYQyPyBOJ5sO4XBxLw6TGJ9rVN3oNBZ3wVm4Scnur.u', 'নেছার উদ্দিন', 'neser480@gmail.com', '01627078607', 'super_admin', 'active', '2026-11-24 04:05:32', '2026-07-06 11:23:47', 0, 'PPPoE', 'ISP-10008', '93a5a74996f83e349e24dbe35044db6deb361395d7479b1a74159d7ab87be9af', '2026-08-21 03:46:52', NULL, 'আযহার ক্যাবল টিভি এন্ড ব্রডব্যান্ড', 'নেছার উদ্দিন', '01627078607', 'গ্রাম মধ্যকান্দি', NULL, 0, NULL, NULL),
(33, 33, 'NESER', '$2b$12$7z0H6T9mo.X/kLgwqdBT0.ZXFno18POpqfpqT050Dr758cotX4RFS', 'neser uddin', 'neseru4@gmail.com', '01936516717', 'admin', 'active', '2026-11-24 12:10:54', '2026-10-04 09:43:51', 12, 'PPPoE', 'ISP-10033', '411de3cc3a24b5978695d1b74c45cfc755566edb1b6ae1b5f877a9b36ba391ed', '2026-11-24 12:16:21', '{\"trial_hours\":3,\"trial_started_at\":\"2026-10-04T09:43:51.607Z\",\"trial_expires_at\":\"2026-10-04T12:43:51.607Z\",\"registration_payment\":\"unpaid\",\"registration_fee\":5000,\"registration_discount\":0,\"registration_amount\":5000,\"monthly_fee\":9000,\"reference_name\":null,\"reference_mobile\":null}', 'আযহার ক্যাবল এন্ড ব্রডব্যান্ড সার্ভিস', 'neser uddin', '01936516717', 'homna', NULL, 0, NULL, 'neser uddin'),
(34, 34, 'admin', '$2b$12$oT5A/n4N352Vk1JtH9xdouX6DDt5IhV6d/8fZsOwQ4HJ/sEyqGPgW', 'DEMO', 'neser480@gmail.com', '01936516717', 'admin', 'active', '2026-11-22 14:37:19', '2026-10-30 14:38:12', 1, 'PPPoE', 'ISP-10034', NULL, NULL, '{\"trial_hours\":3,\"trial_started_at\":\"2026-10-30T14:38:12.051Z\",\"trial_expires_at\":\"2026-10-30T17:38:12.051Z\",\"registration_payment\":\"unpaid\",\"registration_fee\":2000,\"registration_discount\":0,\"registration_amount\":2000,\"monthly_fee\":600,\"reference_name\":null,\"reference_mobile\":null}', 'DEMO', 'DEMO', '01936516717', 'BANGLADESH', NULL, 0, NULL, 'DEMO');

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

--
-- Dumping data for table `user_remember_tokens`
--

INSERT INTO `user_remember_tokens` (`id`, `user_id`, `user_type`, `selector`, `token_hash`, `expires_at`, `created_at`) VALUES
(2, 8, 'user', '9cd912bd09438db69131fccb84e240ba', '9cd912bd09438db69131fccb84e240bad4feae464798e8716be0d604b5686c00', '2026-12-24 03:51:20', '2026-11-24 03:51:20'),
(3, 8, 'user', '1e22e182d2e49e4b2d206d4552ccbc2f', '1e22e182d2e49e4b2d206d4552ccbc2f407741af79346e6ff4316d4d6190f274', '2026-12-24 04:05:32', '2026-11-24 04:05:32');

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
-- Dumping data for table `website_contents`
--

INSERT INTO `website_contents` (`id`, `content`, `updated_by`, `created_at`, `updated_at`) VALUES
(1, '{\"site_name\":\"\",\"tagline\":\"\",\"logo\":\"\",\"favicon\":\"\",\"hero_heading\":\"\",\"hero_description\":\"\",\"admin_login_url\":\"https://app.amaderbill.com\",\"customer_login_url\":\"https://app.amaderbill.com/customer/login\",\"trial_url\":\"https://app.amaderbill.com/register\",\"hero_image\":\"\",\"about_heading\":\"\",\"about_description\":\"\",\"features_json\":[],\"statistics_json\":[],\"pricing_json\":[],\"support_team_json\":[],\"gallery_json\":[],\"phone\":\"01627078607\",\"whatsapp\":\"01627078607\",\"email\":\"amaderbill@gmail.com\",\"address\":\"homna\",\"admin_app_url\":\"\",\"customer_app_url\":\"\",\"sms_app_url\":\"\",\"promotions_json\":[],\"footer_description\":\"\",\"social_links_json\":[]}', 8, '2026-11-23 21:55:54', '2026-11-24 06:06:57');

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
-- Indexes for table `sms_logs`
--
ALTER TABLE `sms_logs`
  ADD PRIMARY KEY (`id`);

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
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

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
-- AUTO_INCREMENT for table `support_tickets`
--
ALTER TABLE `support_tickets`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

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
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=42;

--
-- AUTO_INCREMENT for table `user_permissions`
--
ALTER TABLE `user_permissions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `user_remember_tokens`
--
ALTER TABLE `user_remember_tokens`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `user_permissions`
--
ALTER TABLE `user_permissions`
  ADD CONSTRAINT `fk_user_permissions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
