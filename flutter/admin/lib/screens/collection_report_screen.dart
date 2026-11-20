import 'dart:async';
import 'package:flutter/material.dart';
import '../core/format.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../core/tr.dart';
import '../services/api_service.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';

/// কালেকশন রিপোর্ট (শুধু পড়া)। Backend: GET /admin/reports/collection
class CollectionReportScreen extends StatefulWidget {
  const CollectionReportScreen({super.key});

  @override
  State<CollectionReportScreen> createState() => _CollectionReportScreenState();
}

class _CollectionReportScreenState extends State<CollectionReportScreen> {
  final _searchC = TextEditingController();
  Timer? _debounce;
  final List<Map<String, dynamic>> _items = [];
  DateTimeRange? _range;
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
      final d = await ApiService.collectionReport(
        search: _searchC.text.trim(),
        from: _range == null ? '' : ymd(_range!.start),
        to: _range == null ? '' : ymd(_range!.end),
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

  void _clearRange() {
    setState(() => _range = null);
    _load(reset: true);
  }

  Widget _tile(Map<String, dynamic> c) {
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
    return ListTile(
      title: Text('${c['customer_name'] ?? ''}',
          style: const TextStyle(
              fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.text)),
      subtitle: Text('$sub\n$meta',
          style: const TextStyle(fontSize: 13, color: AppColors.muted)),
      isThreeLine: true,
      trailing: Text(taka(numOf(c['collected_amount'])),
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
        current: 'report',
        title: l.t('report'),
        actions: [
          IconButton(icon: const Icon(Icons.sync, size: 30), onPressed: () => _load(reset: true)),
          const SizedBox(width: 4),
        ],
        body: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: _searchC,
                  textInputAction: TextInputAction.search,
                  onChanged: (_) {
                    _debounce?.cancel();
                    _debounce = Timer(const Duration(milliseconds: 400), () => _load(reset: true));
                  },
                  onSubmitted: (_) => _load(reset: true),
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.search),
                    hintText: l.t('search'),
                    isDense: true,
                    border: const OutlineInputBorder(),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                icon: Icon(Icons.date_range, color: _range == null ? AppColors.muted : AppColors.sky),
                onPressed: _pickRange,
              ),
            ]),
          ),
          if (_range != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 8, 0),
              child: Row(children: [
                Text('${ymd(_range!.start)} → ${ymd(_range!.end)}',
                    style: const TextStyle(fontSize: 13, color: AppColors.muted)),
                IconButton(
                    icon: const Icon(Icons.close, size: 18), onPressed: _clearRange),
              ]),
            ),
          Container(
            width: double.infinity,
            color: AppColors.skyLight,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Text(
              '${tr('মোট বিল', 'Total bills')}: ${l.digits('$_totalData')}   ·   '
              '${tr('মোট সংগ্রহ', 'Total collection')}: ${taka(_totalBill)}',
              style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy),
            ),
          ),
          Expanded(child: _list(l)),
        ]),
      );
    });
  }
}
