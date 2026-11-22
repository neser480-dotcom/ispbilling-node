import 'dart:async';
import 'package:material_ui/material_ui.dart';
import '../core/format.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../core/tr.dart';
import '../services/olt_api.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';

String _s(dynamic v, [String fallback = '']) {
  if (v == null || v == 'null') return fallback;
  final t = '$v'.trim();
  return t.isEmpty ? fallback : t;
}

/// Activity Log (শুধু পড়া; Role/Company-scope Backend-এ Web-এর মতোই)।
/// Backend: GET /admin/activity-log ?search&from_date&to_date&page&limit
/// (ড্রয়ারে key: 'activity_log')
class ActivityLogScreen extends StatefulWidget {
  const ActivityLogScreen({super.key});

  @override
  State<ActivityLogScreen> createState() => _ActivityLogScreenState();
}

class _ActivityLogScreenState extends State<ActivityLogScreen> {
  static const _limit = 30;
  final _searchC = TextEditingController();
  final _scroll = ScrollController();
  Timer? _debounce;
  final List<Map<String, dynamic>> _items = [];
  int _page = 1;
  int _total = 0;
  int _totalPages = 1;
  bool _loading = true;
  bool _more = false;
  String? _error;
  String _from = '';
  String _to = '';

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 300) _loadMore();
    });
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchC.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<Map<String, dynamic>> _fetch(int page) => OltApi.activityLog(
        search: _searchC.text.trim(),
        from: _from,
        to: _to,
        page: page,
        limit: _limit,
      );

  void _apply(Map<String, dynamic> d, {required bool append}) {
    final pg = mapOf(d['pagination']);
    final raw = d['logs'];
    final rows = raw is List
        ? raw.map((e) => Map<String, dynamic>.from(e as Map)).toList()
        : <Map<String, dynamic>>[];
    if (!append) _items.clear();
    _items.addAll(rows);
    _total = numOf(pg['total'] ?? mapOf(d['summary'])['total_data']).toInt();
    _totalPages = numOf(pg['totalPages']).toInt();
    if (_totalPages < 1) _totalPages = 1;
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _page = 1;
    });
    try {
      final d = await _fetch(1);
      if (!mounted) return;
      setState(() {
        _apply(d, append: false);
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

  Future<void> _loadMore() async {
    if (_loading || _more || _page >= _totalPages) return;
    setState(() => _more = true);
    try {
      final d = await _fetch(_page + 1);
      if (!mounted) return;
      setState(() {
        _page += 1;
        _apply(d, append: true);
        _more = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _more = false);
    }
  }

  void _onSearch(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 450), _load);
  }

  Future<void> _pickDate(bool isFrom) async {
    final init = DateTime.tryParse(isFrom ? _from : _to) ?? DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: init,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );
    if (d == null) return;
    setState(() {
      if (isFrom) {
        _from = ymd(d);
      } else {
        _to = ymd(d);
      }
    });
    _load();
  }

  void _clearDates() {
    setState(() {
      _from = '';
      _to = '';
    });
    _load();
  }

  Color _actionColor(String type) {
    switch (type) {
      case 'danger':
        return Colors.red.shade600;
      case 'success':
        return Colors.green.shade700;
      case 'warning':
        return AppColors.orange;
      default:
        return AppColors.sky;
    }
  }

  Widget _tile(Map<String, dynamic> l) {
    final c = _actionColor(_s(l['action_type']));
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: c.withOpacity(0.14),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(_s(l['action'], 'UNKNOWN'),
                style: TextStyle(fontSize: 11, color: c, fontWeight: FontWeight.bold)),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(_s(l['module']),
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12, color: AppColors.muted)),
          ),
          Text(_s(l['created_at']).replaceFirst('T', ' ').split('.').first,
              style: const TextStyle(fontSize: 11, color: AppColors.muted)),
        ]),
        const SizedBox(height: 6),
        Text(_s(l['description']),
            style: const TextStyle(fontSize: 14, color: AppColors.text)),
        const SizedBox(height: 4),
        Text(
          '${_s(l['user_name'])} (${_s(l['role_name'])}) · ${_s(l['ip_address'])}',
          style: const TextStyle(fontSize: 12, color: AppColors.muted),
        ),
      ]),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(_error!, textAlign: TextAlign.center),
          ),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: _load, child: Text(tr('আবার চেষ্টা', 'Retry'))),
        ]),
      );
    }
    if (_items.isEmpty) return Center(child: Text(tr('কোনো লগ নেই', 'No logs found')));
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: _items.length + (_more ? 1 : 0),
        separatorBuilder: (_, __) => const Divider(height: 1, color: AppColors.line),
        itemBuilder: (_, i) {
          if (i >= _items.length) {
            return const Padding(
                padding: EdgeInsets.all(14), child: Center(child: CircularProgressIndicator()));
          }
          return _tile(_items[i]);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final hasDates = _from.isNotEmpty || _to.isNotEmpty;
      return AdminScaffold(
        current: 'activity_log',
        title: tr('অ্যাক্টিভিটি লগ', 'Activity Log'),
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
                hintText: tr('ইউজার, মডিউল, বিবরণ বা IP', 'User, module, description or IP'),
                isDense: true,
                border: const OutlineInputBorder(),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 4),
            child: Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _pickDate(true),
                  icon: const Icon(Icons.event, size: 16),
                  label: Text(_from.isEmpty ? tr('শুরু', 'From') : _from,
                      style: const TextStyle(fontSize: 13)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _pickDate(false),
                  icon: const Icon(Icons.event, size: 16),
                  label: Text(_to.isEmpty ? tr('শেষ', 'To') : _to,
                      style: const TextStyle(fontSize: 13)),
                ),
              ),
              if (hasDates)
                IconButton(icon: const Icon(Icons.clear), onPressed: _clearDates),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 6),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                '${tr('মোট', 'Total')}: ${Lang.i.digits('$_total')}',
                style: const TextStyle(fontSize: 13, color: AppColors.muted),
              ),
            ),
          ),
          Expanded(child: _body()),
        ]),
      );
    });
  }
}
