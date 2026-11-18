import 'package:flutter/material.dart';
import 'area_screen.dart';
import 'dashboard_screen.dart';
import 'package_screen.dart';
import 'placeholder_screen.dart';

/// ড্রয়ারের key অনুযায়ী পেজ। নতুন পেজ বানালে এখানে যোগ করুন।
Widget screenFor(String key) {
  switch (key) {
    case 'dashboard':
      return const DashboardScreen();
    case 'area':
      return const AreaScreen();
    case 'package':
      return const PackageScreen();
    default:
      return PlaceholderScreen(menuKey: key);
  }
}
