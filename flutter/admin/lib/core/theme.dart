import 'package:flutter/material.dart';

class AppColors {
  static const sky = Color(0xFF38AFEF);
  static const skyLight = Color(0xFFDCF1FB);
  static const navy = Color(0xFF174562);
  static const text = Color(0xFF555555);
  static const muted = Color(0xFF777777);
  static const line = Color(0xFFDDDDDD);
  static const orange = Color(0xFFFFB04F);
  static const teal = Color(0xFF4DB6AC);
  static const pink = Color(0xFFF06292);
  static const purple = Color(0xFF9575CD);

  static const avatars = [
    Color(0xFFF06292),
    Color(0xFF4DD0E1),
    Color(0xFFAED581),
    Color(0xFFFF8A65),
    Color(0xFFA1887F),
    Color(0xFF4FC3F7),
    Color(0xFF64B5F6),
    Color(0xFF81C784),
  ];
}

ThemeData buildTheme() {
  return ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(seedColor: AppColors.sky),
    scaffoldBackgroundColor: Colors.white,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.sky,
      foregroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
    ),
  );
}
