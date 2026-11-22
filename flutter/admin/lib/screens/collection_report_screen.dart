import 'dart:async';
import 'package:material_ui/material_ui.dart';
import '../core/format.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../core/tr.dart';
import '../services/api_service.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';
import '../widgets/letter_avatar.dart';
import '../widgets/netfee_ui.dart';

/// Bill Report (শুধু পড়া) — Netfee স্টাইল: Collector ▾ / Medium ▾, TODAY | MONTH | YEAR ট্যাব।
/// Backend: GET /admin/reports/collection
/// দ্রষ্টব্য: Collector / Medium ফিল্টার লোড হওয়া সারির উপর চলে (Backend-এ আলাদা ফিল্টার নেই)।
class CollectionReportScreen extends StatefulWidget {
  const CollectionReportScreen({super.key});

  @override
  State<CollectionReportScreen> createState() => _CollectionReportScreenState();
}

class _CollectionReportScreenState extends State<CollectionReportScreen> {
  final _searchC = TextEditingController();
  Timer? _debounce;
  final List<Map<String, dynamic>> _items = [];
  int _tab = 0; // 0 = Today, 1 = Month, 2 = Year
  int _year = DateTime.now().year;
  int _month = DateTime.now().month;
  String _collector = ''; // ফাঁকা = সব
  String _medium = ''; // ফাঁকা = সব
  bool _searching = false;
  int _page = 1;
  int _totalPages = 1;
  num _totalBill = 0;
  int _totalData = 0;
  bool _loading = false;
  bool _again = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load(reset: true);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchC.dispose();
    super.dispose();
  }

  DateTimeRange get _period {
    final now = DateTime.now();
    switch (_tab) {
      case 0:
        final t = DateTime(now.year, now.month, now.day);
        return DateTimeRange(start: t, end: t);
      case 1:
        return periodRange(_year, _month);
      default:
        return periodRange(_year, 0);
    }
  }

  String get _headerLabel {
    switch (_tab) {
      case 0:
        return ymd(DateTime.now());
      case 1:
        return '${monthName(_month)},$_year';
      default:
        return '$_year';
    }
  }

  Future<void> _load({bool reset = false}) async {
    if (_loading) {
      if (reset) _again = true;
      return;
    }
    if (reset) {
      _page = 1;
      _totalPages = 1;
      _error = null;
      _items.clear();
    } else if (_page > _totalPages) {
      return;
    }
    setState(() => _loading = true);
    try {
      final r = _period;
      final d = await ApiService.collectionReport(
        search: _searchC.text.trim(),
        from: ymd(r.start),
        to: ymd(r.end),
        page: _page,
      );
      if (!mounted) return;
      final list = (d['collections'] is List)
          ? (d['collections'] as List).map((e) => mapOf(e)).toList()
          : <Map<String, dynamic>>[];
      final p = mapOf(d['pagination']);
      final s = mapOf(d['summary']);
      setState(() {
        _items.addAll(list);
        _totalPages = numOf(p['totalPages']).toInt();
        _totalData = numOf(s['total_data']).toInt();
        _totalBill = numOf(s['total_bill']);
        _page++;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) {
        setState(() => _loading = false);
        if (_again) {
          _again = false;
          _load(reset: true);
        }
      }
    }
  }

  List<String> _distinct(String key) {
    final set = <String>{};
    for (final e in _items) {
      final v = '${e[key] ?? ''}'.trim();
      if (v.isNotEmpty) set.add(v);
    }
    return ['', ...set];
  }

  List<Map<String, dynamic>> get _shown => _items.where((e) {
        if (_collector.isNotEmpty && '${e['collected_by'] ?? ''}'.trim() != _collector) {
          return false;
        }
        if (_medium.isNotEmpty && '${e['medium'] ?? ''}'.trim() != _medium) return false;
        return true;
      }).toList();

  Widget _tile(Map<String, dynamic> c) {
    final name = '${c['customer_name'] ?? ''}';
    final sub = [
      '${c['package_name'] ?? ''}',
      '${c['area_name'] ?? ''}',
      '${c['medium'] ?? ''}',
    ].where((e) => e.isNotEmpty).join(' · ');
    final meta = [
      dateOnly(c['created_at']),
      '${c['collected_by'] ?? ''}',
      '${c['bill_type'] ?? ''}',
    ].where((e) => e.isNotEmpty).join(' · ');
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        children: [
          LetterAvatar(text: name.isEmpty ? 'B' : name, radius: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(tk(numOf(c['collected_amount'])),
                    style: const TextStyle(
                        fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.sky)),
                Text(name, style: const TextStyle(fontSize: 17, color: AppColors.text)),
                if (sub.isNotEmpty)
                  Text(sub, style: const TextStyle(fontSize: 14, color: AppColors.muted)),
                Text(meta, style: const TextStyle(fontSize: 14, color: AppColors.muted)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _rows(Lang l) {
    if (_items.isEmpty && _loading) {
      return const Padding(
          padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()));
    }
    if (_items.isEmpty && _error != null) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Column(children: [
          Text(_error!, textAlign: TextAlign.center),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: () => _load(reset: true), child: Text(l.t('retry'))),
        ]),
      );
    }
    final rows = _shown;
    if (rows.isEmpty) {
      return Padding(
          padding: const EdgeInsets.all(32),
          child: Center(
              child: Text(l.t('no_data'),
                  style: const TextStyle(color: AppColors.muted, fontSize: 16))));
    }
    final hasMore = _page <= _totalPages;
    return Column(children: [
      for (final c in rows) _tile(c),
      if (_loading)
        const Padding(
            padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()))
      else if (_error != null || hasMore)
        TextButton(onPressed: () => _load(), child: Text(l.t('load_more')))
      else
        const SizedBox(height: 24),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      final filtered = _collector.isNotEmpty || _medium.isNotEmpty;
      final shown = _shown;
      final total = filtered
          ? shown.fold<num>(0, (s, e) => s + numOf(e['collected_amount']))
          : _totalBill;
      final count = filtered ? shown.length : _totalData;
      return AdminScaffold(
        current: 'report',
        title: '', // স্ক্রিনশটের মতো: শুধু ড্রপডাউন (জায়গার জন্য টাইটেল নেই)
        actions: [
          if (_searching)
            SizedBox(
              width: 130,
              child: TextField(
                controller: _searchC,
                autofocus: true,
                style: const TextStyle(color: Colors.white, fontSize: 18),
                cursorColor: Colors.white,
                textInputAction: TextInputAction.search,
                onChanged: (_) {
                  _debounce?.cancel();
                  _debounce = Timer(const Duration(milliseconds: 400), () => _load(reset: true));
                },
                onSubmitted: (_) => _load(reset: true),
                decoration: InputDecoration(
                  hintText: l.t('search'),
                  hintStyle: const TextStyle(color: Colors.white70),
                  border: InputBorder.none,
                ),
              ),
            ),
          IconButton(
            icon: Icon(_searching ? Icons.close : Icons.search, size: 28),
            onPressed: () {
              setState(() {
                _searching = !_searching;
                if (!_searching && _searchC.text.isNotEmpty) {
                  _searchC.clear();
                  _load(reset: true);
                }
              });
            },
          ),
          BarDropdown<String>(
            text: _collector.isEmpty ? tr('কালেক্টর', 'Collector') : _collector,
            values: _distinct('collected_by'),
            label: (v) => v.isEmpty ? tr('সব', 'All') : v,
            onSelected: (v) => setState(() => _collector = v),
          ),
          BarDropdown<String>(
            text: _medium.isEmpty ? tr('মিডিয়াম', 'Medium') : _medium,
            values: _distinct('medium'),
            label: (v) => v.isEmpty ? tr('সব', 'All') : v,
            onSelected: (v) => setState(() => _medium = v),
          ),
        ],
        body: Column(
          children: [
            NetfeeTabBar(
              labels: [tr('আজ', 'Today'), tr('মাস', 'Month'), tr('বছর', 'Year')],
              index: _tab,
              onChanged: (i) {
                setState(() => _tab = i);
                _load(reset: true);
              },
            ),
            Expanded(
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  SummaryHeader(
                    label: _headerLabel,
                    amount: '${tk(total)} (${l.digits('$count')})',
                  ),
                  if (_tab != 0)
                    YearMonthRow(
                      year: _year,
                      month: _month,
                      showMonth: _tab == 1,
                      onYear: (y) {
                        setState(() => _year = y);
                        _load(reset: true);
                      },
                      onMonth: (m) {
                        setState(() => _month = m);
                        _load(reset: true);
                      },
                    ),
                  _rows(l),
                ],
              ),
            ),
          ],
        ),
      );
    });
  }
}
