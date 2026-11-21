import 'package:material_ui/material_ui.dart';
import '../core/format.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../core/tr.dart';
import '../services/api_service.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';

/// কালেক্টর ডিপোজিট রিপোর্ট (শুধু পড়া)। Backend: GET /admin/reports/collector-deposit
class DepositScreen extends StatefulWidget {
  const DepositScreen({super.key});

  @override
  State<DepositScreen> createState() => _DepositScreenState();
}

class _DepositScreenState extends State<DepositScreen> {
  final List<Map<String, dynamic>> _items = [];
  List<Map<String, dynamic>> _collectors = [];
  int? _collectorId;
  DateTimeRange? _range;
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
      final d = await ApiService.collectorDeposits(
        collectorId: _collectorId,
        from: _range == null ? '' : ymd(_range!.start),
        to: _range == null ? '' : ymd(_range!.end),
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

  Future<void> _pickRange() async {
    final now = DateTime.now();
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 5),
      lastDate: DateTime(now.year + 1),
      initialDateRange: _range,
    );
    if (r != null) {
      setState(() => _range = r);
      _load(reset: true);
    }
  }

  Widget _tile(Map<String, dynamic> d) {
    final meta = [
      dateOnly(d['deposit_date']),
      '${d['deposit_by'] ?? ''}',
      '${d['status'] ?? ''}',
    ].where((e) => e.isNotEmpty).join(' · ');
    final note = '${d['note'] ?? ''}';
    final received = '${d['received_by'] ?? ''}';
    final extra = [
      if (received.isNotEmpty) '${tr('গ্রহণ', 'Received')}: $received',
      if (note.isNotEmpty) note,
    ].join(' · ');
    return ListTile(
      title: Text(meta,
          style: const TextStyle(fontSize: 15, color: AppColors.text)),
      subtitle: extra.isEmpty
          ? null
          : Text(extra, style: const TextStyle(fontSize: 13, color: AppColors.muted)),
      trailing: Text(taka(numOf(d['amount'])),
          style: const TextStyle(
              fontSize: 15, fontWeight: FontWeight.bold, color: AppColors.navy)),
    );
  }

  Widget _list(Lang l) {
    if (_items.isEmpty && _loading) return const Center(child: CircularProgressIndicator());
    if (_items.isEmpty && _error != null) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Text(_error!, textAlign: TextAlign.center)),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: () => _load(reset: true), child: Text(l.t('retry'))),
        ]),
      );
    }
    if (!_available) {
      return Center(
          child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(_notice.isEmpty ? l.t('no_data') : _notice,
                  textAlign: TextAlign.center)));
    }
    if (_items.isEmpty) return Center(child: Text(l.t('no_data')));
    final hasMore = _page <= _totalPages;
    return ListView.separated(
      itemCount: _items.length + 1,
      separatorBuilder: (_, __) => const Divider(height: 1, color: AppColors.line),
      itemBuilder: (_, i) {
        if (i < _items.length) return _tile(_items[i]);
        if (_loading) {
          return const Padding(
              padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()));
        }
        if (_error != null || hasMore) {
          return TextButton(onPressed: () => _load(), child: Text(l.t('load_more')));
        }
        return const SizedBox(height: 24);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      return AdminScaffold(
        current: 'deposit',
        title: l.t('deposit'),
        actions: [
          IconButton(icon: const Icon(Icons.sync, size: 30), onPressed: () => _load(reset: true)),
          const SizedBox(width: 4),
        ],
        body: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
            child: Row(children: [
              Expanded(
                child: DropdownButtonFormField<int?>(
                  initialValue: _collectorId,
                  isExpanded: true,
                  decoration: InputDecoration(
                    isDense: true,
                    border: const OutlineInputBorder(),
                    labelText: l.t('collector'),
                  ),
                  items: [
                    DropdownMenuItem<int?>(value: null, child: Text(tr('সব', 'All'))),
                    ..._collectors.map((c) => DropdownMenuItem<int?>(
                          value: numOf(c['id']).toInt(),
                          child: Text('${c['name'] ?? ''}', overflow: TextOverflow.ellipsis),
                        )),
                  ],
                  onChanged: (v) {
                    setState(() => _collectorId = v);
                    _load(reset: true);
                  },
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                icon: Icon(Icons.date_range, color: _range == null ? AppColors.muted : AppColors.sky),
                onPressed: _pickRange,
              ),
              if (_range != null)
                IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  onPressed: () {
                    setState(() => _range = null);
                    _load(reset: true);
                  },
                ),
            ]),
          ),
          Container(
            width: double.infinity,
            color: AppColors.skyLight,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Text(
              '${tr('মোট', 'Total')}: ${l.digits('$_totalData')}   ·   '
              '${tr('মোট জমা', 'Total deposit')}: ${taka(_totalAmount)}',
              style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy),
            ),
          ),
          Expanded(child: _list(l)),
        ]),
      );
    });
  }
}
