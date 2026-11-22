import 'package:material_ui/material_ui.dart';
import '../core/theme.dart';
import '../core/tr.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';
import '../widgets/letter_avatar.dart';
import '../widgets/netfee_ui.dart';

/// Deposit Report (Depositor, TODAY / MONTH / YEAR) — শুধু ডিজাইন। API পরে যুক্ত হবে।
/// TODO(API): _load এ ভূমিকা/ব্যক্তি/সময় অনুযায়ী ডিপোজিট আনুন।
class DepositReportScreen extends StatefulWidget {
  const DepositReportScreen({super.key});

  @override
  State<DepositReportScreen> createState() => _DepositReportScreenState();
}

class _DepositReportScreenState extends State<DepositReportScreen> {
  /// true = নমুনা সারি দেখায় (শুধু ডিজাইন দেখার জন্য)। API বসালে false করুন।
  static const bool _demo = true;

  static const _roles = ['Depositor', 'Manager', 'Collector'];

  int _tab = 0; // 0 = Today, 1 = Month, 2 = Year
  String _role = _roles.first;
  String _person = ''; // ফাঁকা = সবাই
  List<String> _people = [];
  int _year = DateTime.now().year;
  int _month = 0; // 0 = All Month
  List<Map<String, dynamic>> _all = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    // TODO(API): GET deposits (role = _role, person = _person) এবং ব্যক্তির তালিকা
    final now = DateTime.now();
    setState(() {
      _people = _demo ? ['Manager', 'Mehedi', 'Faruk'] : [];
      _all = _demo
          ? [
              {'name': 'Mehedi', 'amount': 5000, 'date': now},
              {'name': 'Faruk', 'amount': 12000, 'date': now.subtract(const Duration(days: 3))},
              {'name': 'Manager', 'amount': 3500, 'date': now.subtract(const Duration(days: 40))},
            ]
          : [];
    });
  }

  List<String> get _months => [
        tr('সব মাস', 'All Month'),
        for (var m = 1; m <= 12; m++) _monthName(m),
      ];

  String _monthName(int m) {
    const bn = [
      'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
      'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
    ];
    const en = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return tr(bn[m - 1], en[m - 1]);
  }

  bool _inPeriod(DateTime d) {
    final now = DateTime.now();
    switch (_tab) {
      case 0:
        return d.year == now.year && d.month == now.month && d.day == now.day;
      case 1:
        return d.year == _year && (_month == 0 || d.month == _month);
      default:
        return d.year == _year;
    }
  }

  List<Map<String, dynamic>> get _rows => _all.where((e) {
        if (!_inPeriod(e['date'] as DateTime)) return false;
        return _person.isEmpty || e['name'] == _person;
      }).toList();

  String get _headerLabel {
    switch (_tab) {
      case 0:
        return ymd(DateTime.now());
      case 1:
        return '${_month == 0 ? tr('সব মাস', 'All Month') : _monthName(_month)},$_year';
      default:
        return '$_year';
    }
  }

  Widget _filters() {
    if (_tab == 0) return const SizedBox.shrink();
    final thisYear = DateTime.now().year;
    final years = [for (var y = thisYear; y >= thisYear - 5; y--) y];
    return Padding(
      padding: const EdgeInsets.fromLTRB(40, 4, 40, 10),
      child: Row(
        children: [
          Expanded(
            child: PillDropdown<int>(
              value: _year,
              values: years,
              label: (y) => '$y',
              width: double.infinity,
              onChanged: (y) => setState(() => _year = y),
            ),
          ),
          if (_tab == 1) ...[
            const SizedBox(width: 20),
            Expanded(
              child: PillDropdown<int>(
                value: _month,
                values: [for (var m = 0; m <= 12; m++) m],
                label: (m) => _months[m],
                width: double.infinity,
                onChanged: (m) => setState(() => _month = m),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _row(Map<String, dynamic> e) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        children: [
          LetterAvatar(text: '${e['name']}', radius: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(tk(e['amount'] as num),
                    style: const TextStyle(
                        fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.sky)),
                Text('${e['name']}',
                    style: const TextStyle(fontSize: 17, color: AppColors.text)),
                Text(
                  ymd(e['date'] as DateTime),
                  style: const TextStyle(fontSize: 14, color: AppColors.muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final rows = _rows;
      final total = rows.fold<num>(0, (s, e) => s + (e['amount'] as num));
      return AdminScaffold(
        current: 'deposit_report',
        title: tr('ডিপোজিট রিপোর্ট', 'Deposit Report'),
        actions: [
          BarDropdown<String>(
            text: _role,
            values: _roles,
            label: (v) => v,
            onSelected: (v) {
              setState(() => _role = v);
              _load();
            },
          ),
          BarDropdown<String>(
            text: _person.isEmpty ? '' : _person,
            values: ['', ..._people],
            label: (v) => v.isEmpty ? tr('সবাই', 'All') : v,
            onSelected: (v) => setState(() => _person = v),
          ),
          const SizedBox(width: 4),
        ],
        body: Column(
          children: [
            NetfeeTabBar(
              labels: [tr('আজ', 'Today'), tr('মাস', 'Month'), tr('বছর', 'Year')],
              index: _tab,
              onChanged: (i) => setState(() => _tab = i),
            ),
            Expanded(
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  SummaryHeader(label: _headerLabel, amount: tk(total)),
                  _filters(),
                  if (rows.isEmpty)
                    Padding(
                      padding: const EdgeInsets.all(32),
                      child: Center(
                        child: Text(tr('কোনো ডাটা নেই', 'No data'),
                            style: const TextStyle(color: AppColors.muted, fontSize: 16)),
                      ),
                    ),
                  for (final e in rows) _row(e),
                ],
              ),
            ),
          ],
        ),
      );
    });
  }
}
