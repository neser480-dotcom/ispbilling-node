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

/// Deposit (শুধু পড়া) — Netfee স্টাইল: অ্যাপ বারে ব্যক্তি ▾, নিচে বছর/মাস ড্রপডাউন।
/// Backend: GET /admin/reports/collector-deposit
class DepositScreen extends StatefulWidget {
  const DepositScreen({super.key});

  @override
  State<DepositScreen> createState() => _DepositScreenState();
}

class _DepositScreenState extends State<DepositScreen> {
  final List<Map<String, dynamic>> _items = [];
  List<Map<String, dynamic>> _collectors = [];
  int? _collectorId;
  int _year = DateTime.now().year;
  int _month = 0; // 0 = সব মাস
  int _page = 1;
  int _totalPages = 1;
  num _totalAmount = 0;
  int _totalData = 0;
  bool _loading = false;
  bool _available = true;
  String _notice = '';
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadCollectors();
    _load(reset: true);
  }

  Future<void> _loadCollectors() async {
    try {
      final c = await ApiService.depositCollectors();
      if (mounted) setState(() => _collectors = c);
    } catch (_) {
      // ফিল্টার ছাড়াই চলবে
    }
  }

  Future<void> _load({bool reset = false}) async {
    if (_loading) return;
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
      final r = periodRange(_year, _month);
      final d = await ApiService.collectorDeposits(
        collectorId: _collectorId,
        from: ymd(r.start),
        to: ymd(r.end),
        page: _page,
      );
      if (!mounted) return;
      final list = (d['deposits'] is List)
          ? (d['deposits'] as List).map((e) => mapOf(e)).toList()
          : <Map<String, dynamic>>[];
      final p = mapOf(d['pagination']);
      final s = mapOf(d['summary']);
      setState(() {
        _available = d['available'] != false;
        _notice = '${d['message'] ?? ''}';
        _items.addAll(list);
        _totalPages = numOf(p['totalPages']).toInt();
        _totalData = numOf(s['total_data']).toInt();
        _totalAmount = numOf(s['total_amount']);
        _page++;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String get _collectorLabel {
    if (_collectorId == null) return tr('কালেক্টর', 'Collector');
    for (final c in _collectors) {
      if (numOf(c['id']).toInt() == _collectorId) return '${c['name'] ?? ''}';
    }
    return tr('কালেক্টর', 'Collector');
  }

  Widget _tile(Map<String, dynamic> d) {
    final by = '${d['deposit_by'] ?? ''}';
    final meta = [
      dateOnly(d['deposit_date']),
      '${d['status'] ?? ''}',
    ].where((e) => e.isNotEmpty).join(' · ');
    final note = '${d['note'] ?? ''}';
    final received = '${d['received_by'] ?? ''}';
    final extra = [
      if (received.isNotEmpty) '${tr('গ্রহণ', 'Received')}: $received',
      if (note.isNotEmpty) note,
    ].join(' · ');
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        children: [
          LetterAvatar(text: by.isEmpty ? 'D' : by, radius: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(tk(numOf(d['amount'])),
                    style: const TextStyle(
                        fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.sky)),
                if (by.isNotEmpty)
                  Text(by, style: const TextStyle(fontSize: 17, color: AppColors.text)),
                if (extra.isNotEmpty)
                  Text(extra, style: const TextStyle(fontSize: 14, color: AppColors.muted)),
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
    if (!_available) {
      return Padding(
          padding: const EdgeInsets.all(24),
          child: Center(
              child: Text(_notice.isEmpty ? l.t('no_data') : _notice,
                  textAlign: TextAlign.center)));
    }
    if (_items.isEmpty) {
      return Padding(
          padding: const EdgeInsets.all(32),
          child: Center(
              child: Text(l.t('no_data'),
                  style: const TextStyle(color: AppColors.muted, fontSize: 16))));
    }
    final hasMore = _page <= _totalPages;
    return Column(children: [
      for (final d in _items) _tile(d),
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
      return AdminScaffold(
        current: 'deposit',
        title: l.t('deposit'),
        actions: [
          BarDropdown<int>(
            text: _collectorLabel,
            values: [-1, ..._collectors.map((c) => numOf(c['id']).toInt())],
            label: (v) {
              if (v == -1) return tr('সব', 'All');
              for (final c in _collectors) {
                if (numOf(c['id']).toInt() == v) return '${c['name'] ?? ''}';
              }
              return '$v';
            },
            onSelected: (v) {
              setState(() => _collectorId = v == -1 ? null : v);
              _load(reset: true);
            },
          ),
          IconButton(
              icon: const Icon(Icons.sync, size: 30), onPressed: () => _load(reset: true)),
          const SizedBox(width: 4),
        ],
        body: ListView(
          padding: EdgeInsets.zero,
          children: [
            SummaryHeader(
              label: '${monthName(_month)},$_year',
              amount: '${tk(_totalAmount)} (${l.digits('$_totalData')})',
            ),
            YearMonthRow(
              year: _year,
              month: _month,
              onYear: (y) {
                setState(() => _year = y);
                _load(reset: true);
              },
              onMonth: (m) {
                setState(() => _month = m);
                _load(reset: true);
              },
            ),
            const SizedBox(height: 6),
            _rows(l),
          ],
        ),
      );
    });
  }
}
