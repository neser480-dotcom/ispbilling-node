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

/// Collector / Manager তালিকা + বিস্তারিত (শুধু পড়া)।
/// Backend: GET /admin/collectors | /admin/managers (শুধু Admin)
class StaffScreen extends StatefulWidget {
  /// 'collector' বা 'manager' (ড্রয়ারের key)
  final String kind;
  const StaffScreen({super.key, required this.kind});

  @override
  State<StaffScreen> createState() => _StaffScreenState();
}

class _StaffScreenState extends State<StaffScreen> {
  final _searchC = TextEditingController();
  Timer? _debounce;
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  String? _error;

  String get _path => widget.kind == 'collector' ? 'collectors' : 'managers';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchC.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final d = await ApiService.staffList(_path, search: _searchC.text.trim());
      if (!mounted) return;
      final raw = d[_path];
      setState(() {
        _items = raw is List
            ? raw.map((e) => Map<String, dynamic>.from(e as Map)).toList()
            : <Map<String, dynamic>>[];
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  void _onSearch(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), _load);
  }

  void _open(Map<String, dynamic> s) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _StaffSheet(kind: widget.kind, path: _path, summary: s),
    );
  }

  Widget _body(Lang l) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(_error!, textAlign: TextAlign.center),
          ),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: _load, child: Text(l.t('retry'))),
        ]),
      );
    }
    if (_items.isEmpty) return Center(child: Text(l.t('no_data')));
    return ListView.separated(
      itemCount: _items.length,
      separatorBuilder: (_, __) => const Divider(height: 1, color: AppColors.line),
      itemBuilder: (_, i) {
        final s = _items[i];
        final name = '${s['name'] ?? ''}';
        final sub = ['${s['mobile'] ?? ''}', '${s['email'] ?? ''}']
            .where((e) => e.isNotEmpty)
            .join(' · ');
        return ListTile(
          leading: LetterAvatar(text: name, radius: 22),
          title: Text(name,
              style: const TextStyle(
                  fontSize: 17, fontWeight: FontWeight.bold, color: AppColors.text)),
          subtitle: Text(sub, style: const TextStyle(fontSize: 14, color: AppColors.muted)),
          trailing: Text('${s['status'] ?? ''}',
              style: const TextStyle(fontSize: 12, color: AppColors.muted)),
          onTap: () => _open(s),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      return AdminScaffold(
        current: widget.kind,
        title: l.t(widget.kind),
        actions: [
          IconButton(icon: const Icon(Icons.sync, size: 30), onPressed: _load),
          const SizedBox(width: 4),
        ],
        body: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
            child: TextField(
              controller: _searchC,
              textInputAction: TextInputAction.search,
              onChanged: _onSearch,
              onSubmitted: (_) => _load(),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search),
                hintText: l.t('search'),
                isDense: true,
                border: const OutlineInputBorder(),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 6),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text('${l.t('total')}: ${l.digits('${_items.length}')}',
                  style: const TextStyle(fontSize: 13, color: AppColors.muted)),
            ),
          ),
          Expanded(child: _body(l)),
        ]),
      );
    });
  }
}

class _StaffSheet extends StatefulWidget {
  final String kind;
  final String path;
  final Map<String, dynamic> summary;
  const _StaffSheet({required this.kind, required this.path, required this.summary});

  @override
  State<_StaffSheet> createState() => _StaffSheetState();
}

class _StaffSheetState extends State<_StaffSheet> {
  late Future<Map<String, dynamic>> _profile;
  Future<Map<String, dynamic>>? _balance;

  @override
  void initState() {
    super.initState();
    final id = numOf(widget.summary['id']).toInt();
    _profile = ApiService.staffProfile(widget.path, id);
    if (widget.kind == 'collector') {
      _balance = ApiService.collectorBalance(id);
    }
  }

  Widget _row(String k, String v) {
    if (v.trim().isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(
            width: 110,
            child: Text(k, style: const TextStyle(color: AppColors.muted, fontSize: 14))),
        Expanded(
            child: Text(v, style: const TextStyle(color: AppColors.text, fontSize: 15))),
      ]),
    );
  }

  Widget _balanceTable() {
    return FutureBuilder<Map<String, dynamic>>(
      future: _balance,
      builder: (_, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Padding(
              padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()));
        }
        if (snap.hasError) {
          return Text(snap.error.toString().replaceFirst('Exception: ', ''));
        }
        final rows = (snap.data?['rows'] is List) ? snap.data!['rows'] as List : const [];
        if (rows.isEmpty) return Text(Lang.i.t('no_data'));
        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: DataTable(
            columnSpacing: 18,
            headingRowHeight: 38,
            dataRowMinHeight: 34,
            dataRowMaxHeight: 38,
            columns: [
              DataColumn(label: Text(tr('মাস', 'Month'))),
              DataColumn(label: Text(tr('বিল', 'Bill')), numeric: true),
              DataColumn(label: Text(tr('জমা', 'Deposit')), numeric: true),
              DataColumn(label: Text(tr('ব্যালেন্স', 'Balance')), numeric: true),
            ],
            rows: rows.map((e) {
              final m = mapOf(e);
              return DataRow(cells: [
                DataCell(Text('${m['month'] ?? ''} ${m['year'] ?? ''}')),
                DataCell(Text(taka(numOf(m['bill_report'])))),
                DataCell(Text(taka(numOf(m['deposit'])))),
                DataCell(Text(taka(numOf(m['balance'])),
                    style: const TextStyle(fontWeight: FontWeight.bold))),
              ]);
            }).toList(),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = Lang.i;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('${widget.summary['name'] ?? ''}',
                  style: const TextStyle(
                      fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.navy)),
              const SizedBox(height: 8),
              FutureBuilder<Map<String, dynamic>>(
                future: _profile,
                builder: (_, snap) {
                  if (snap.connectionState != ConnectionState.done) {
                    return const Padding(
                        padding: EdgeInsets.all(12),
                        child: Center(child: CircularProgressIndicator()));
                  }
                  if (snap.hasError) {
                    return Text(snap.error.toString().replaceFirst('Exception: ', ''));
                  }
                  final p = mapOf(snap.data?[widget.kind]);
                  return Column(children: [
                    _row(l.t('name'), '${p['name'] ?? ''}'),
                    _row(tr('মোবাইল', 'Mobile'), '${p['mobile'] ?? ''}'),
                    _row(tr('ইমেইল', 'Email'), '${p['email'] ?? ''}'),
                    _row(tr('ঠিকানা', 'Address'), '${p['address'] ?? ''}'),
                    _row(tr('স্ট্যাটাস', 'Status'), '${p['status'] ?? ''}'),
                  ]);
                },
              ),
              if (_balance != null) ...[
                const Divider(height: 24),
                Text(tr('পূর্বের ব্যালেন্স', 'Previous balance'),
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                _balanceTable(),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
