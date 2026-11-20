# Admin অ্যাপ — Batch 1 স্ক্রিন (Collector, Manager, Report, Deposit, Expenditure)

## ফাইল (আপনার `lib/`-এ কপি করুন; আগে backup নিন)
| ফাইল | কী করবেন |
|---|---|
| `lib/core/tr.dart` | **নতুন** |
| `lib/screens/staff_screen.dart` | **নতুন** (Collector ও Manager) |
| `lib/screens/collection_report_screen.dart` | **নতুন** |
| `lib/screens/deposit_screen.dart` | **নতুন** |
| `lib/screens/expenditure_screen.dart` | **নতুন** |
| `lib/services/api_service.dart` | **Replace** — আপনার ফাইল + মেরামত করা বাংলা + নতুন মেথডগুলো (নিচে ⚠️) |
| `lib/screens/router.dart` | Replace **অথবা** নিচের লাইনগুলো হাতে যোগ করুন |

⚠️ আপনার `api_service.dart` যদি ১৯ নভেম্বরের পরে বদলে থাকে, Replace করবেন না। সেক্ষেত্রে আমার ফাইলের শেষ দিকের `// ---- Collector / Manager / ...` অংশটুকু কপি করে আপনার ক্লাসের শেষে (শেষ `}`-এর আগে) বসান।

## router.dart — যোগ করার লাইন
```dart
import 'collection_report_screen.dart';
import 'customers_screen.dart';
import 'deposit_screen.dart';
import 'expenditure_screen.dart';
import 'staff_screen.dart';
// switch-এর ভেতরে:
case 'customer':    return const CustomersScreen();
case 'collector':   return const StaffScreen(kind: 'collector');
case 'manager':     return const StaffScreen(kind: 'manager');
case 'report':      return const CollectionReportScreen();
case 'deposit':     return const DepositScreen();
case 'expenditure': return const ExpenditureScreen();
```
(`customer` কেস আগে থেকে থাকলে বাদ দিন; আপনার ১৯ নভেম্বরের সোর্সে `CustomersScreen` কোথাও যুক্ত ছিল না।)

## Backend আগে লাগবে
`batch1-staff-reports.zip` (Collector/Manager/Report/Expenditure API) সার্ভারে বসানো না থাকলে এই স্ক্রিনগুলো ৪০৪ পাবে।

## যা জানা দরকার
- Collector/Manager স্ক্রিন শুধু **Admin** দেখতে পারবেন (Backend ও Web-এর নিয়ম); অন্য রোলে 403 বার্তা দেখাবে।
- Expenditure-এ "+" শুধু Admin-এর জন্য কাজ করবে। খরচের ধরন (Type) আগে থেকে ওয়েবে থাকতে হবে।
- এটি Dart SDK ছাড়া লেখা হয়েছে, কম্পাইল করে দেখা যায়নি: `flutter analyze` চালিয়ে ত্রুটি পাঠান।
