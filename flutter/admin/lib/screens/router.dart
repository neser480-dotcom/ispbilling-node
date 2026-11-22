import 'package:material_ui/material_ui.dart';
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
import 'customer_recharge_screen.dart';
import 'bulk_recharge_screen.dart';
import 'employee_screen.dart';
import 'active_customers_screen.dart';
import 'interface_monitor_screen.dart';
import 'live_fault_screen.dart';
import 'customer_traffic_screen.dart';
import 'olt_list_screen.dart';
import 'olt_monitor_screen.dart';
import 'activity_log_screen.dart';
import 'mikrotik_screen.dart';
import 'sa_users_screen.dart';
import 'sa_permissions_screen.dart';
import 'sa_registration_invoices_screen.dart';
import 'sa_manual_payment_screen.dart';
import 'sa_billing_extend_screen.dart';
import 'sa_notices_screen.dart';
import 'sa_payment_gateways_screen.dart';
import 'purpose_screen.dart';
import 'message_accounts_screen.dart';
import 'message_log_screen.dart';
import 'deposit_report_screen.dart';

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
    case 'recharge':
      return const CustomerRechargeScreen();
    case 'bulk_recharge':
      return const BulkRechargeScreen();
    case 'employee':
      return const EmployeeScreen();
    case 'active_pppoe':
      return const ActiveCustomersScreen();
    case 'interface_monitor':
      return const InterfaceMonitorScreen();
    case 'live_fault':
      return const LiveFaultScreen();
    case 'customer_traffic':
      return const CustomerTrafficScreen();
    case 'olt':
      return const OltListScreen();
    case 'onu':
      return const OltListScreen(onuMode: true);
    case 'olt_monitor':
      return const OltMonitorScreen();
    case 'activity_log':
      return const ActivityLogScreen();
    case 'sa_users':
      return const SaUsersScreen();
    case 'sa_permissions':
      return const SaPermissionsScreen();
    case 'sa_registration_invoices':
      return const SaRegistrationInvoicesScreen();
    case 'sa_manual_payment':
      return const SaManualPaymentScreen();
    case 'sa_billing_extend':
      return const SaBillingExtendScreen();
    case 'sa_notices':
      return const SaNoticesScreen();
    case 'sa_notice_add':
      return const SaNoticesScreen(addOnly: true);
    case 'payment_gateways':
      return const SaPaymentGatewaysScreen();
    case 'mikrotik':
      return const MikrotikScreen();
    case 'purpose':
      return const PurposeScreen();
    case 'message_accounts':
      return const MessageAccountsScreen();
    case 'message_log':
      return const MessageLogScreen();
    case 'deposit_report':
      return const DepositReportScreen();
    default:
      return PlaceholderScreen(menuKey: key);
  }
}
