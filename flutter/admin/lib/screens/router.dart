import 'sa_payment_gateways_screen.dart';
import 'package:flutter/material.dart';
import 'area_screen.dart';
import 'dashboard_screen.dart';
import 'package_screen.dart';
import 'registration_screen.dart';
import 'sa_billing_extend_screen.dart';
import 'sa_manual_payment_screen.dart';
import 'sa_registration_invoices_screen.dart';
import 'sa_pricing_screen.dart';
import 'sa_users_screen.dart';
import 'sa_permissions_screen.dart';
import 'sa_notices_screen.dart';
import 'placeholder_screen.dart';
import 'mikrotik_screen.dart';

/// ÃƒÂ Ã‚Â¦Ã‚Â¡ÃƒÂ Ã‚Â§Ã‚ÂÃƒÂ Ã‚Â¦Ã‚Â°ÃƒÂ Ã‚Â¦Ã‚Â¯ÃƒÂ Ã‚Â¦Ã‚Â¼ÃƒÂ Ã‚Â¦Ã‚Â¾ÃƒÂ Ã‚Â¦Ã‚Â°ÃƒÂ Ã‚Â§Ã¢â‚¬Â¡ÃƒÂ Ã‚Â¦Ã‚Â° key ÃƒÂ Ã‚Â¦Ã¢â‚¬Â¦ÃƒÂ Ã‚Â¦Ã‚Â¨ÃƒÂ Ã‚Â§Ã‚ÂÃƒÂ Ã‚Â¦Ã‚Â¯ÃƒÂ Ã‚Â¦Ã‚Â¾ÃƒÂ Ã‚Â¦Ã‚Â¯ÃƒÂ Ã‚Â¦Ã‚Â¼ÃƒÂ Ã‚Â§Ã¢â€šÂ¬ ÃƒÂ Ã‚Â¦Ã‚ÂªÃƒÂ Ã‚Â§Ã¢â‚¬Â¡ÃƒÂ Ã‚Â¦Ã…â€œÃƒÂ Ã‚Â¥Ã‚Â¤ ÃƒÂ Ã‚Â¦Ã‚Â¨ÃƒÂ Ã‚Â¦Ã‚Â¤ÃƒÂ Ã‚Â§Ã‚ÂÃƒÂ Ã‚Â¦Ã‚Â¨ ÃƒÂ Ã‚Â¦Ã‚ÂªÃƒÂ Ã‚Â§Ã¢â‚¬Â¡ÃƒÂ Ã‚Â¦Ã…â€œ ÃƒÂ Ã‚Â¦Ã‚Â¬ÃƒÂ Ã‚Â¦Ã‚Â¾ÃƒÂ Ã‚Â¦Ã‚Â¨ÃƒÂ Ã‚Â¦Ã‚Â¾ÃƒÂ Ã‚Â¦Ã‚Â²ÃƒÂ Ã‚Â§Ã¢â‚¬Â¡ ÃƒÂ Ã‚Â¦Ã‚ÂÃƒÂ Ã‚Â¦Ã¢â‚¬â€œÃƒÂ Ã‚Â¦Ã‚Â¾ÃƒÂ Ã‚Â¦Ã‚Â¨ÃƒÂ Ã‚Â§Ã¢â‚¬Â¡ ÃƒÂ Ã‚Â¦Ã‚Â¯ÃƒÂ Ã‚Â§Ã¢â‚¬Â¹ÃƒÂ Ã‚Â¦Ã¢â‚¬â€ ÃƒÂ Ã‚Â¦Ã¢â‚¬Â¢ÃƒÂ Ã‚Â¦Ã‚Â°ÃƒÂ Ã‚Â§Ã‚ÂÃƒÂ Ã‚Â¦Ã‚Â¨ÃƒÂ Ã‚Â¥Ã‚Â¤
Widget screenFor(String key) {
  switch (key) {
    case 'mikrotik':
      return const MikrotikScreen();
    case 'dashboard':
      return const DashboardScreen();
    case 'area':
      return const AreaScreen();
    case 'package':
      return const PackageScreen();
    case 'registration':
      return const RegistrationScreen();
    case 'sa_billing':
      return const SaPaymentGatewaysScreen();
    case 'sa_billing_extend':
      return const SaBillingExtendScreen();
    case 'sa_manual_payment':
      return const SaManualPaymentScreen();
    case 'sa_registration_invoices':
      return const SaRegistrationInvoicesScreen();
    case 'sa_users':
      return const SaUsersScreen();
    case 'sa_permissions':
      return const SaPermissionsScreen();
    case 'sa_notices':
      return const SaNoticesScreen();
    case 'sa_notice_add':
      return const SaNoticesScreen(addOnly: true);
    case 'sa_pricing':
      return const SaPricingScreen();

    default:
      return PlaceholderScreen(menuKey: key);
  }
}
