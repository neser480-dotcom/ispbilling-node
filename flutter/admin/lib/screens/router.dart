import 'package:flutter/material.dart';
import 'area_screen.dart';
import 'collection_report_screen.dart';
import 'customers_screen.dart';
import 'deposit_screen.dart';
import 'expenditure_screen.dart';
import 'staff_screen.dart';
import 'dashboard_screen.dart';
import 'package_screen.dart';
import 'registration_screen.dart';
import 'sa_billing_screen.dart';
import 'sa_pricing_screen.dart';
import 'placeholder_screen.dart';

/// ড্রয়ারের key অনুযায়ী পেজ। নতুন পেজ বানালে এখানে যোগ করুন।
Widget screenFor(String key) {
  switch (key) {
    case 'dashboard':
      return const DashboardScreen();
    case 'area':
      return const AreaScreen();
    case 'customer':
      return const CustomersScreen();
    case 'collector':
      return const StaffScreen(kind: 'collector');
    case 'manager':
      return const StaffScreen(kind: 'manager');
    case 'report':
      return const CollectionReportScreen();
    case 'deposit':
      return const DepositScreen();
    case 'expenditure':
      return const ExpenditureScreen();
    case 'package':
      return const PackageScreen();
    case 'registration':
      return const RegistrationScreen();
    case 'sa_billing':
      return const SaBillingScreen();
    case 'sa_pricing':
      return const SaPricingScreen();
    default:
      return PlaceholderScreen(menuKey: key);
  }
}
