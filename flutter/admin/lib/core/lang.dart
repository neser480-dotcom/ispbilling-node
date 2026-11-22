import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// বাংলা/ইংরেজি ভাষা পরিবর্তন। UI-তে Lang.i.t('key') ব্যবহার করুন।
class Lang extends ChangeNotifier {
  static final Lang i = Lang._();
  Lang._();

  bool bn = true;

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    bn = p.getBool('lang_bn') ?? true;
  }

  Future<void> toggle() async {
    bn = !bn;
    notifyListeners();
    final p = await SharedPreferences.getInstance();
    await p.setBool('lang_bn', bn);
  }

  String t(String key) => (bn ? _bn : _en)[key] ?? key;

  /// ভাষা বাটনে অন্য ভাষার নাম দেখায়
  String get toggleLabel => bn ? 'English' : 'বাংলা';

  /// বাংলা মোডে ইংরেজি সংখ্যা -> বাংলা সংখ্যা
  String digits(String s) {
    if (!bn) return s;
    const d = '০১২৩৪৫৬৭৮৯';
    return s.replaceAllMapped(RegExp(r'[0-9]'), (m) => d[int.parse(m[0]!)]);
  }

  List<String> get months => bn ? _bnMonths : _enMonths;

  static const _bnMonths = [
    'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
    'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
  ];
  static const _enMonths = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  static const _bn = {
    'potential': 'সম্ভাব্য',
    'collection': 'কালেকশন',
    'total_customers': 'মোট গ্রাহক',
    'connected_customers': 'সংযোগ গ্রাহক',
    'paid_customers': 'পরিশোধ গ্রাহক',
    'new_customers': 'নতুন গ্রাহক',
    'medium': 'মাধ্যম',
    'all': 'সব',
    'amount': 'Amount',
    'bill_count': 'Bill Count',
    'chart': 'চার্ট',
    'balance': 'ব্যালেন্সঃ',
    'menu_title': '\u0986\u09AE\u09BE\u09A6\u09C7\u09B0 \u09AC\u09BF\u09B2 \u09AE\u09C7\u09A8\u09C1',
    'admin': 'এডমিন',
    'dashboard': 'ড্যাশবোর্ড',
    'area': 'এরিয়া',
    'package': 'প্যাকেজ',
    'customer': 'গ্রাহক(PPPoE)',
    'manager': 'ম্যানেজার',
    'collector': 'কালেক্টর',
    'reseller': 'রিসেলার',
    'deposit': 'ডিপোজিট',
    'report': 'রিপোর্ট',
    'expenditure': 'খরচ',
    'message': 'মেসেজ',
    'netfee_bill': '\u0986\u09AE\u09BE\u09A6\u09C7\u09B0 \u09AC\u09BF\u09B2',
    'last_bill': 'সর্বশেষ বিল',
    'recharge': 'রিচার্জ',
    'bulk_recharge': 'বাল্ক রিচার্জ',
    'active_pppoe': 'অ্যাক্টিভ PPPoE',
    'employee': 'কর্মচারী',
    'olt': 'OLT',
    'olt_monitor': 'OLT মনিটর',
    'interface_monitor': 'ইন্টারফেস মনিটর',
    'customer_traffic': 'গ্রাহক ট্রাফিক',
    'live_fault': 'লাইভ ফল্ট',
    'activity_log': 'অ্যাক্টিভিটি লগ',
    'logout': 'লগ আউট',
    'login': 'লগইন',
    'view_pw': 'পাসওয়ার্ড দেখুন',
    'save_pw': 'পাসওয়ার্ড সেভ করুন',
    'new_acc': 'আপনি কি নতুন একাউন্ট করতে চান?',
    'register': 'রেজিস্ট্রেশন',
    'fill_all': 'ফোন নম্বর ও পাসওয়ার্ড দিন',
    'packages_count': 'প্যাকেজ:',
    'add': 'যোগ করুন',
    'edit': 'এডিট',
    'delete': 'ডিলিট',
    'cancel': 'বাতিল',
    'save': 'সেভ',
    'name': 'নাম',
    'description': 'বিবরণ',
    'confirm_delete': 'ডিলিট করতে চান?',
    'coming_soon': 'শীঘ্রই আসছে',
    'retry': 'আবার চেষ্টা করুন',
    'no_data': 'কোনো তথ্য নেই',
  };

  static const _en = {
    'potential': 'Potential',
    'collection': 'Collection',
    'total_customers': 'Total Customers',
    'connected_customers': 'Connected Customers',
    'paid_customers': 'Paid Customers',
    'new_customers': 'New Customers',
    'medium': 'Medium',
    'all': 'All',
    'amount': 'Amount',
    'bill_count': 'Bill Count',
    'chart': 'Chart',
    'balance': 'Balance:',
    'menu_title': 'Amader Bill Menu',
    'admin': 'Admin',
    'dashboard': 'Dashboard',
    'area': 'Area',
    'package': 'Package',
    'customer': 'Customer(PPPoE)',
    'manager': 'Manager',
    'collector': 'Collector',
    'reseller': 'Reseller',
    'deposit': 'Deposit',
    'report': 'Report',
    'expenditure': 'Expenditure',
    'message': 'Message',
    'netfee_bill': 'Amader Bill',
    'last_bill': 'Last Bill',
    'recharge': 'Recharge',
    'bulk_recharge': 'Bulk Recharge',
    'active_pppoe': 'Active PPPoE',
    'employee': 'Employee',
    'olt': 'OLT',
    'olt_monitor': 'OLT Monitor',
    'interface_monitor': 'Interface Monitor',
    'customer_traffic': 'Customer Traffic',
    'live_fault': 'Live Fault',
    'activity_log': 'Activity Log',
    'logout': 'Logout',
    'login': 'LOGIN',
    'view_pw': 'View Password',
    'save_pw': 'Save Password',
    'new_acc': 'Do you open new account?',
    'register': 'REGISTRATION',
    'fill_all': 'Enter phone and password',
    'packages_count': 'Packages:',
    'add': 'Add',
    'edit': 'Edit',
    'delete': 'Delete',
    'cancel': 'Cancel',
    'save': 'Save',
    'name': 'Name',
    'description': 'Description',
    'confirm_delete': 'Do you want to delete?',
    'coming_soon': 'Coming soon',
    'retry': 'Retry',
    'no_data': 'No Data Found!',
  };
}

/// ভারতীয় গ্রুপিং: 285800 -> 2,85,800
String inr(num v) {
  final s = v.round().toString();
  if (s.length <= 3) return s;
  final last3 = s.substring(s.length - 3);
  final rest = s
      .substring(0, s.length - 3)
      .replaceAllMapped(RegExp(r'\B(?=(\d{2})+(?!\d))'), (m) => ',');
  return '$rest,$last3';
}

/// আন্তর্জাতিক গ্রুপিং: 40000 -> 40,000
String intl(num v) => v
    .round()
    .toString()
    .replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (m) => ',');
