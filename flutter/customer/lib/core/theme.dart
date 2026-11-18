import 'package:flutter/material.dart';

class AppColors {
  static const navy = Color(0xFF174562); // উপরের টাইটেল বার
  static const appBlue = Color(0xFF4A8CF7); // পেজ অ্যাপ বার
  static const loginBlue = Color(0xFF0096FF); // লগইন ব্যাকগ্রাউন্ড/বাটন
  static const linkBlue = Color(0xFF1F6FE5);
  static const cyan = Color(0xFF17C1E8);
  static const red = Color(0xFFD9383A);
  static const green = Color(0xFF1DB26B);
  static const darkRed = Color(0xFF7A1A1A);
  static const text = Color(0xFF1F2937);
  static const grey = Color(0xFF757575);
  static const line = Color(0xFFD0D0D0);
  static const tileBlue = Color(0xFF4A86E8);
  static const tileGreen = Color(0xFF52A27D);
  static const tileCyan = Color(0xFF4DD7F0);
  static const tilePink = Color(0xFFE5666F);
}

ThemeData buildTheme() {
  return ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(seedColor: AppColors.appBlue),
    scaffoldBackgroundColor: Colors.white,
  );
}
