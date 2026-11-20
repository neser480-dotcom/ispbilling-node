import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../services/api_service.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';
import '../widgets/letter_avatar.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  late int _year;
  late int _month;
  String _medium = 'all';
  String _mode = 'amount'; // amount | count
  String _people = 'collector'; // collector | reseller

  late Future<DashboardSummary> _summary;
  late Future<List<double>> _chart;
  late Future<PeopleData> _peopleF;
  late Future<List<SimpleOption>> _mediums;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _year = now.year;
    _month = now.month;
    _mediums = ApiService.mediums();
    _load();
  }

  void _load() {
    _summary = ApiService.dashboard(_year, _month, _medium);
    _chart = ApiService.chart(_year, _month, _mode, _medium);
    _peopleF = ApiService.people(_people, _year, _month);
  }

  void _refresh() => setState(() {
        _mediums = ApiService.mediums();
        _load();
      });

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      return AdminScaffold(
        current: 'dashboard',
        title: 'আমাদের বিল',
        actions: [
          IconButton(
              icon: const Icon(Icons.sync, size: 30), onPressed: _refresh),
          const SizedBox(width: 6),
        ],
        body: ListView(
          padding: EdgeInsets.zero,
          children: [
            _topRow(l),
            _cards(l),
            _filters(l),
            _radioRow(
              [
                (l.t('amount'), _mode == 'amount', () => _setMode('amount')),
                (l.t('bill_count'), _mode == 'count', () => _setMode('count')),
              ],
              alignStart: true,
            ),
            _chartSection(l),
            _radioRow([
              (
                l.t('collector'),
                _people == 'collector',
                () => _setPeople('collector')
              ),
              (
                l.t('reseller'),
                _people == 'reseller',
                () => _setPeople('reseller')
              ),
            ]),
            _peopleSection(l),
          ],
        ),
      );
    });
  }

  void _setMode(String m) => setState(() {
        _mode = m;
        _chart = ApiService.chart(_year, _month, _mode, _medium);
      });

  void _setPeople(String p) => setState(() {
        _people = p;
        _peopleF = ApiService.people(_people, _year, _month);
      });

  // ---------- উপরের সম্ভাব্য / রিং / কালেকশন ----------
  Widget _topRow(Lang l) {
    return FutureBuilder<DashboardSummary>(
      future: _summary,
      builder: (context, snap) {
        final s = snap.data;
        final percent = s?.percent ?? 0;
        return Padding(
          padding: const EdgeInsets.fromLTRB(14, 20, 14, 12),
          child: Row(
            children: [
              Expanded(
                  child: _amountBox(l.t('potential'), s?.potential,
                      AppColors.text, CrossAxisAlignment.start)),
              SizedBox(
                width: 104,
                height: 104,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    SizedBox(
                      width: 104,
                      height: 104,
                      child: CircularProgressIndicator(
                        value: (percent / 100).clamp(0.0, 1.0),
                        strokeWidth: 9,
                        backgroundColor: const Color(0xFFEEEEEE),
                        color: AppColors.sky,
                      ),
                    ),
                    Container(
                      width: 82,
                      height: 82,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: const Color(0xFFCCCCCC)),
                      ),
                      child: Text(
                        l.digits('${percent.toStringAsFixed(1)}%'),
                        style: const TextStyle(
                            fontSize: 20, color: AppColors.text),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                  child: _amountBox(l.t('collection'), s?.collection,
                      AppColors.sky, CrossAxisAlignment.end)),
            ],
          ),
        );
      },
    );
  }

  Widget _amountBox(
      String label, double? v, Color color, CrossAxisAlignment a) {
    return Column(
      crossAxisAlignment: a,
      children: [
        Text(label,
            style: const TextStyle(fontSize: 16, color: AppColors.muted)),
        const SizedBox(height: 4),
        FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(v == null ? '-' : inr(v),
              style: TextStyle(
                  fontSize: 28, fontWeight: FontWeight.bold, color: color)),
        ),
      ],
    );
  }

  // ---------- রঙিন কার্ড (অনুভূমিক স্ক্রল) ----------
  Widget _cards(Lang l) {
    return FutureBuilder<DashboardSummary>(
      future: _summary,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const SizedBox(
            height: 100,
            child: Center(child: CircularProgressIndicator()),
          );
        }
        if (snap.hasError || !snap.hasData) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Text('Dashboard cards could not be loaded'),
          );
        }

        final s = snap.data!;
        final cards = <Widget>[];
        final admin = s.admin ?? {};
        final collector = s.collector ?? {};
        final superAdmin = s.superAdmin ?? {};

        String count(dynamic v) => '${v ?? 0}';
        String money(dynamic v) => '৳${inr((v as num?) ?? 0)}';

        void add(
          String title,
          IconData icon,
          Color color,
          dynamic value, {
          String footer = '',
          dynamic footerValue,
          bool isMoney = false,
        }) {
          cards.add(_SumCard(
            color: color,
            title: title,
            icon: icon,
            value: isMoney ? money(value) : count(value),
            footerLabel: footer,
            footerValue: footerValue == null
                ? ''
                : (isMoney ? money(footerValue) : count(footerValue)),
          ));
        }

        if (s.type == 'super_admin') {
          add('Registered Users', Icons.people_outline, AppColors.orange,
              superAdmin['registered_users']);
          add('Active Users', Icons.verified_user_outlined, AppColors.teal,
              superAdmin['active_users']);
          add('Registration Invoices', Icons.receipt_long, AppColors.pink,
              superAdmin['registration_invoices']);
          add('Registration Collection', Icons.payments_outlined, AppColors.sky,
              superAdmin['registration_collection'],
              isMoney: true);
          add('Paid Registration', Icons.check_circle_outline, AppColors.teal,
              superAdmin['paid_registration']);
          add('Unpaid Registration', Icons.pending_actions, AppColors.orange,
              superAdmin['unpaid_registration']);
          add('Software Payments', Icons.account_balance_wallet_outlined,
              AppColors.pink, superAdmin['software_payments'],
              isMoney: true);
        } else {
          if (s.hasCustomers) {
            add('Total Customer', Icons.people_outline, AppColors.orange,
                s.totalCustomers,
                footer: 'New Customer', footerValue: s.newCustomers);
            add('Active Customer', Icons.wifi, AppColors.teal,
                s.connectedCustomers,
                footer: 'New Active', footerValue: s.activeNew);
            add('Paid Customer', Icons.person_search_outlined, AppColors.pink,
                s.paidCustomers,
                footer: 'New Paid', footerValue: s.paidNew);
            add('Unpaid Customer', Icons.money_off, AppColors.orange,
                s.unpaidCustomers,
                footer: 'New Unpaid', footerValue: s.unpaidNew);
            add('Expired Customer', Icons.timer_off_outlined, AppColors.sky,
                s.expiredCustomers,
                footer: 'New Expired', footerValue: s.expiredNew);
            add('Inactive Customer', Icons.person_off_outlined, AppColors.pink,
                s.inactiveCustomers,
                footer: 'New Inactive', footerValue: s.inactiveNew);
            add('Free Customer', Icons.card_giftcard, AppColors.teal,
                s.freeCustomers);
          }

          if (s.hasCollection) {
            add('Total Collection (With New)', Icons.payments_outlined,
                AppColors.teal, s.collection,
                footer: 'New Collection',
                footerValue: s.paidNewAmount,
                isMoney: true);
            add('Total Bill & Connection Fee', Icons.receipt_long,
                AppColors.sky, s.billAndFee,
                isMoney: true);
            add('Today Collection', Icons.today, AppColors.orange,
                s.todayCollection,
                isMoney: true);
          }

          if (s.hasFinance) {
            add('Total Connection Fee', Icons.add_card, AppColors.pink,
                s.connectionFee,
                footer: 'Today',
                footerValue: s.todayConnectionFee,
                isMoney: true);
            add('Total Discount', Icons.discount_outlined, AppColors.orange,
                s.discount,
                footer: 'Today', footerValue: s.todayDiscount, isMoney: true);
            add('Total Expenditure', Icons.money_off_csred_outlined,
                AppColors.sky, s.expenditure,
                footer: 'Today',
                footerValue: s.todayExpenditure,
                isMoney: true);
            add('Total Salary', Icons.payments, AppColors.teal, s.salary,
                isMoney: true);
            add('Business Balance', Icons.account_balance, AppColors.orange,
                s.balance,
                isMoney: true);
          }

          if (s.hasAdmin) {
            add('Admin Collection', Icons.payments, AppColors.teal,
                admin['collection'],
                isMoney: true,
                footer: 'Today',
                footerValue: admin['today_collection']);
            add('Admin Connection Fee', Icons.add_card, AppColors.sky,
                admin['connection_fee'],
                isMoney: true,
                footer: 'Today',
                footerValue: admin['today_connection_fee']);
            add('Own Expenditure', Icons.money_off, AppColors.orange,
                admin['expenditure'],
                isMoney: true);
            add('Admin Discount', Icons.discount, AppColors.pink,
                admin['discount'],
                isMoney: true,
                footer: 'Today',
                footerValue: admin['today_discount']);
            add('Admin Salary', Icons.payments_outlined, AppColors.teal,
                admin['salary'],
                isMoney: true);
            add('Deposit Collection', Icons.account_balance_wallet,
                AppColors.sky, admin['deposit'],
                isMoney: true);
            add('Own Balance', Icons.account_balance, AppColors.orange,
                admin['balance'],
                isMoney: true);

            final messages = admin['messages'] is Map
                ? Map<String, dynamic>.from(admin['messages'])
                : <String, dynamic>{};
            add('Messages', Icons.message_outlined, AppColors.pink,
                messages['masking'],
                footer: 'Non Masking / Fixed',
                footerValue:
                    '${messages['non_masking'] ?? 0} / ${messages['fixed'] ?? 0}');
          }

          if (s.hasCollector) {
            add('All Collector', Icons.groups, AppColors.orange,
                collector['total'],
                footer: 'Today Collection',
                footerValue: collector['today_collection'],
                isMoney: false);
            add('Collector Connection Fee', Icons.add_card, AppColors.teal,
                collector['connection_fee'],
                isMoney: true);
            add('Collector Deposit', Icons.account_balance_wallet,
                AppColors.sky, collector['deposit'],
                isMoney: true);
            add('Collector Expenditure', Icons.money_off, AppColors.pink,
                collector['expenditure'],
                isMoney: true);
            add('Collector Balance', Icons.account_balance, AppColors.orange,
                collector['balance'],
                isMoney: true);
          }

          if (s.hasMikrotik) {
            add('MikroTik Routers', Icons.router, AppColors.teal,
                s.mikrotik?['total']);
          }
        }

        if (cards.isEmpty) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Text('No dashboard cards available for your permissions'),
          );
        }

        return SizedBox(
          height: 100,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 1),
            children: cards,
          ),
        );
      },
    );
  }

  // ---------- মাধ্যম / বছর / মাস ----------
  Widget _pill<T>({
    required T value,
    required List<DropdownMenuItem<T>> items,
    required ValueChanged<T?> onChanged,
  }) {
    return Container(
      height: 52,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFF555555)),
        borderRadius: BorderRadius.circular(30),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          value: value,
          isExpanded: true,
          items: items,
          onChanged: onChanged,
          style: const TextStyle(fontSize: 18, color: Color(0xFF333333)),
        ),
      ),
    );
  }

  Widget _filters(Lang l) {
    final thisYear = DateTime.now().year;
    return Padding(
      padding: const EdgeInsets.fromLTRB(9, 18, 9, 4),
      child: Row(
        children: [
          Expanded(
            child: FutureBuilder<List<SimpleOption>>(
              future: _mediums,
              builder: (context, snap) {
                final opts = [
                  SimpleOption(id: 'all', name: l.t('all')),
                  ...(snap.data ?? const <SimpleOption>[])
                      .where((o) => o.id != 'all'),
                ];
                final value =
                    opts.any((o) => o.id == _medium) ? _medium : 'all';
                return _pill<String>(
                  value: value,
                  items: [
                    for (final o in opts)
                      DropdownMenuItem(
                          value: o.id,
                          child: Text(o.name, overflow: TextOverflow.ellipsis)),
                  ],
                  onChanged: (v) => setState(() {
                    _medium = v ?? 'all';
                    _load();
                  }),
                );
              },
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _pill<int>(
              value: _year,
              items: [
                for (var y = thisYear; y > thisYear - 6; y--)
                  DropdownMenuItem(value: y, child: Text('$y')),
              ],
              onChanged: (v) => setState(() {
                _year = v ?? _year;
                _load();
              }),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _pill<int>(
              value: _month,
              items: [
                for (var m = 1; m <= 12; m++)
                  DropdownMenuItem(
                      value: m,
                      child: Text(l.months[m - 1],
                          overflow: TextOverflow.ellipsis)),
              ],
              onChanged: (v) => setState(() {
                _month = v ?? _month;
                _load();
              }),
            ),
          ),
        ],
      ),
    );
  }

  // ---------- রেডিও সারি ----------
  Widget _radioRow(List<(String, bool, VoidCallback)> opts,
      {bool alignStart = false}) {
    return Padding(
      padding: EdgeInsets.fromLTRB(alignStart ? 16 : 0, 14, 0, 6),
      child: Row(
        mainAxisAlignment:
            alignStart ? MainAxisAlignment.start : MainAxisAlignment.center,
        children: [
          for (final o in opts)
            InkWell(
              onTap: o.$3,
              child: Padding(
                padding: const EdgeInsets.only(right: 28),
                child: Row(
                  children: [
                    Icon(
                      o.$2
                          ? Icons.radio_button_checked
                          : Icons.radio_button_unchecked,
                      size: 34,
                      color: o.$2 ? AppColors.sky : const Color(0xFF666666),
                    ),
                    const SizedBox(width: 8),
                    Text(o.$1,
                        style: const TextStyle(
                            fontSize: 18, color: Color(0xFF333333))),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  // ---------- বার চার্ট ----------
  Widget _chartSection(Lang l) {
    return FutureBuilder<List<double>>(
      future: _chart,
      builder: (context, snap) {
        final values = snap.data ?? List<double>.filled(31, 0);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 10),
            SizedBox(
              height: 230,
              width: double.infinity,
              child: CustomPaint(
                painter: BarChartPainter(values, isAmount: _mode == 'amount'),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(left: 46, top: 2),
              child: Row(
                children: [
                  Container(
                      width: 14, height: 14, color: const Color(0xFF8FE3FF)),
                  const SizedBox(width: 8),
                  Text(l.t('chart'),
                      style:
                          const TextStyle(fontSize: 14, color: AppColors.text)),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  // ---------- কালেক্টর/রিসেলার তালিকা ----------
  Widget _peopleSection(Lang l) {
    return FutureBuilder<PeopleData>(
      future: _peopleF,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        if (snap.hasError) {
          return Padding(
            padding: const EdgeInsets.all(16),
            child: Center(
              child:
                  Text(snap.error.toString().replaceFirst('Exception: ', '')),
            ),
          );
        }
        final d = snap.data!;
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
              child: Align(
                alignment: Alignment.centerRight,
                child: Text('${l.t('balance')} ${inr(d.balance)} Tk.',
                    style:
                        const TextStyle(fontSize: 19, color: AppColors.text)),
              ),
            ),
            for (final p in d.items)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: const BoxDecoration(
                  border: Border(top: BorderSide(color: AppColors.line)),
                ),
                child: Row(
                  children: [
                    LetterAvatar(text: p.name, radius: 25),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${inr(p.amount)} Tk.',
                              style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                  color: AppColors.text)),
                          Text(p.name.toUpperCase(),
                              style: const TextStyle(
                                  fontSize: 18, color: AppColors.text)),
                        ],
                      ),
                    ),
                    Text('${p.count}',
                        style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                            color: AppColors.sky)),
                  ],
                ),
              ),
            const SizedBox(height: 20),
          ],
        );
      },
    );
  }
}

class _SumCard extends StatelessWidget {
  final Color color;
  final String title, value, footerLabel, footerValue;
  final IconData icon;

  const _SumCard({
    required this.color,
    required this.title,
    required this.icon,
    required this.value,
    required this.footerLabel,
    required this.footerValue,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 152,
      margin: const EdgeInsets.only(right: 2),
      padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
      color: color,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Colors.white, fontSize: 13)),
          Row(
            children: [
              Icon(icon, color: Colors.white, size: 28),
              const SizedBox(width: 8),
              Expanded(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(value,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(
                child: Text(footerLabel,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white, fontSize: 10)),
              ),
              Text(footerValue,
                  style: const TextStyle(color: Colors.white, fontSize: 10))
            ],
          ),
        ],
      ),
    );
  }
}

/// ১–৩১ তারিখের বার চার্ট: প্রতিটি বার একটি দিন, রঙ ঘুরে ঘুরে (সবুজ/হলুদ/লাল/নীল)
class BarChartPainter extends CustomPainter {
  final List<double> values;
  final bool isAmount;
  BarChartPainter(this.values, {required this.isAmount});

  static const _colors = [
    Color(0xFF2ECC71),
    Color(0xFFF1C40F),
    Color(0xFFE74C3C),
    Color(0xFF3498DB),
  ];
  static const _l = 48.0, _r = 48.0, _t = 26.0, _b = 8.0;

  double _niceTop(double maxV) {
    if (maxV <= 0) return 4;
    final raw = maxV / 4;
    final mag = math.pow(10, (math.log(raw) / math.ln10).floor()).toDouble();
    final n = raw / mag;
    final step = (n <= 1
            ? 1
            : n <= 2
                ? 2
                : n <= 5
                    ? 5
                    : 10) *
        mag;
    return step * 4;
  }

  void _text(Canvas c, String s, Offset o,
      {double size = 11,
      Color color = const Color(0xFF444444),
      TextAlign align = TextAlign.center}) {
    final tp = TextPainter(
      text: TextSpan(text: s, style: TextStyle(fontSize: size, color: color)),
      textDirection: TextDirection.ltr,
    )..layout();
    var dx = o.dx;
    if (align == TextAlign.center) dx -= tp.width / 2;
    if (align == TextAlign.right) dx -= tp.width;
    tp.paint(c, Offset(dx, o.dy - tp.height / 2));
  }

  @override
  void paint(Canvas canvas, Size size) {
    final l = Lang.i;
    final plot = Rect.fromLTRB(_l, _t, size.width - _r, size.height - _b);
    var maxV = 0.0;
    for (final v in values) {
      if (v > maxV) maxV = v;
    }
    final top = _niceTop(maxV);
    final grid = Paint()
      ..color = const Color(0xFFBDBDBD)
      ..strokeWidth = 1;

    // অনুভূমিক গ্রিড + দুই পাশের মান
    for (var i = 0; i <= 4; i++) {
      final y = plot.bottom - plot.height * i / 4;
      canvas.drawLine(Offset(plot.left, y), Offset(plot.right, y), grid);
      final label = l.digits(intl(top * i / 4));
      _text(canvas, label, Offset(plot.left - 4, y),
          size: 12, align: TextAlign.right);
      _text(canvas, label, Offset(plot.right + 4, y),
          size: 12, align: TextAlign.left);
    }

    final dayCount = values.isEmpty ? 1 : values.length;
    final dayW = plot.width / dayCount;
    canvas.drawLine(
        Offset(plot.left, plot.top), Offset(plot.left, plot.bottom), grid);
    canvas.drawLine(
        Offset(plot.right, plot.top), Offset(plot.right, plot.bottom), grid);
    for (var d = 5; d <= dayCount; d += 5) {
      final x = plot.left + dayW * (d - 0.5);
      if (d >= 10) {
        canvas.drawLine(Offset(x, plot.top), Offset(x, plot.bottom), grid);
      }
      _text(canvas, l.digits('$d'), Offset(x, plot.top - 12), size: 12);
    }

    // বার + মান লেবেল
    for (var i = 0; i < values.length; i++) {
      final v = values[i];
      final h = top == 0 ? 0.0 : plot.height * v / top;
      final rect =
          Rect.fromLTWH(plot.left + dayW * i + 1, plot.bottom - h, dayW - 2, h);
      canvas.drawRect(rect, Paint()..color = _colors[i % _colors.length]);
      final label = l.digits(isAmount ? intl(v) : v.toStringAsFixed(0));
      _text(canvas, label,
          Offset(plot.left + dayW * (i + 0.5), plot.bottom - h - 6),
          size: 6.5);
    }
  }

  @override
  bool shouldRepaint(covariant BarChartPainter old) => true;
}
