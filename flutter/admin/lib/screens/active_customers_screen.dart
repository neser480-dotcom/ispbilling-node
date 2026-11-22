import 'dart:async';
import 'package:material_ui/material_ui.dart';
import '../core/format.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../core/tr.dart';
import '../services/monitoring_api.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';
import '../widgets/netfee_ui.dart';

/// Active PPPoE: রাউটার ধরে অনলাইন/অফলাইন গ্রাহক, খোঁজা, Ping, সংযোগ বিচ্ছিন্ন করা।
/// Backend: GET /admin/monitoring/active-pppoe (Ping/Remove শুধু Admin — সার্ভার যাচাই করে)
class ActiveCustomersScreen extends StatefulWidget {
  const ActiveCustomersScreen({super.key});

  @override
  State<ActiveCustomersScreen> createState() => _ActiveCustomersScreenState();
}

class _ActiveCustomersScreenState extends State<ActiveCustomersScreen> {
  static const _pageSize = 50;

  final _searchC = TextEditingController();
  Timer? _debounce;

  List<Map<String, dynamic>> _routers = [];
  int? _routerId;
  String _status = 'all';
  bool _searching = false;

  final List<Map<String, dynamic>> _rows = [];
  int _page = 1;
  int _totalPages = 1;
  int _total = 0, _active = 0, _offline = 0, _matched = 0;

  bool _loading = true;
  bool _loadingMore = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _init();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchC.dispose();
    super.dispose();
  }

  Future<void> _init() async {
    try {
      final r = await MonitoringApi.activeRouters();
      if (!mounted) return;
      if (r.isEmpty) {
        setState(() {
          _loading = false;
          _error = tr('কোনো MikroTik রাউটার যোগ করা নেই', 'No MikroTik router added');
        });
        return;
      }
      setState(() {
        _routers = r;
        _routerId = numOf(r.first['id']).toInt();
      });
      await _load();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _load() async {
    final id = _routerId;
    if (id == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final d = await MonitoringApi.activeCustomers(
        routerId: id,
        status: _status,
        search: _searchC.text.trim(),
        page: 1,
        limit: _pageSize,
      );
      if (!mounted) return;
      setState(() {
        _rows
          ..clear()
          ..addAll(_rowsOf(d));
        _applyMeta(d);
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
    final id = _routerId;
    if (id == null || _loadingMore || _page >= _totalPages) return;
    setState(() => _loadingMore = true);
    try {
      final d = await MonitoringApi.activeCustomers(
        routerId: id,
        status: _status,
        search: _searchC.text.trim(),
        page: _page + 1,
        limit: _pageSize,
      );
      if (!mounted) return;
      setState(() {
        _rows.addAll(_rowsOf(d));
        _applyMeta(d);
        _loadingMore = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadingMore = false);
      _toast(e.toString().replaceFirst('Exception: ', ''));
    }
  }

  List<Map<String, dynamic>> _rowsOf(Map<String, dynamic> d) {
    final raw = d['data'];
    return raw is List
        ? raw.map((e) => Map<String, dynamic>.from(e as Map)).toList()
        : <Map<String, dynamic>>[];
  }

  void _applyMeta(Map<String, dynamic> d) {
    _page = numOf(d['page']).toInt().clamp(1, 100000);
    _totalPages = numOf(d['total_pages']).toInt().clamp(1, 100000);
    _total = numOf(d['total']).toInt();
    _active = numOf(d['active']).toInt();
    _offline = numOf(d['offline']).toInt();
    _matched = numOf(d['matched']).toInt();
  }

  void _toast(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  void _onSearch(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 450), _load);
  }

  void _open(Map<String, dynamic> row) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ActiveSheet(
        routerId: _routerId!,
        row: row,
        onChanged: _load,
      ),
    );
  }

  Widget _header(Lang l) {
    final count = _status == 'active'
        ? _active
        : _status == 'offline'
            ? _offline
            : _total;
    String statusLabel(String s) => s == 'active'
        ? 'Online'
        : s == 'offline'
            ? 'Offline'
            : 'Customer';
    // স্ক্রিনশট: দুটো গোল-কোণা ড্রপডাউন (রাউটার | Customer) + "Customer: 579"
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 22, 12, 0),
        child: Row(children: [
          Expanded(
            child: LayoutBuilder(
              builder: (_, bc) => PillDropdown<int>(
                width: bc.maxWidth,
                value: _routerId ?? -1,
                values: [
                  if (_routerId == null) -1,
                  for (final r in _routers) numOf(r['id']).toInt(),
                ],
                label: (v) {
                  for (final r in _routers) {
                    if (numOf(r['id']).toInt() == v) return '${r['name'] ?? ''}';
                  }
                  return '';
                },
                onChanged: (v) {
                  if (v == _routerId) return;
                  setState(() => _routerId = v);
                  _load();
                },
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: LayoutBuilder(
              builder: (_, bc) => PillDropdown<String>(
                width: bc.maxWidth,
                value: _status,
                values: const ['all', 'active', 'offline'],
                label: statusLabel,
                onChanged: (v) {
                  if (_status == v) return;
                  setState(() => _status = v);
                  _load();
                },
              ),
            ),
          ),
        ]),
      ),
      if (_searching)
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
          child: TextField(
            controller: _searchC,
            autofocus: true,
            textInputAction: TextInputAction.search,
            onChanged: _onSearch,
            onSubmitted: (_) => _load(),
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.search),
              hintText: tr('নাম, ID, PPPoE, IP, MAC', 'Name, ID, PPPoE, IP, MAC'),
              isDense: true,
              border: const OutlineInputBorder(),
            ),
          ),
        ),
      Padding(
        padding: const EdgeInsets.fromLTRB(18, 18, 12, 4),
        child: Align(
          alignment: Alignment.centerLeft,
          child: Text.rich(
            TextSpan(
              style: const TextStyle(fontSize: 20, color: AppColors.text),
              children: [
                TextSpan(text: '${statusLabel(_status)}: '),
                TextSpan(
                  text: l.digits('$count'),
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ),
        ),
      ),
    ]);
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
          OutlinedButton(
              onPressed: _routerId == null ? _init : _load,
              child: Text(l.t('retry'))),
        ]),
      );
    }
    if (_rows.isEmpty) return Center(child: Text(l.t('no_data')));
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: _rows.length + 1,
        separatorBuilder: (_, __) => const Divider(height: 1, color: AppColors.line),
        itemBuilder: (_, i) {
          if (i == _rows.length) {
            if (_page >= _totalPages) {
              return Padding(
                padding: const EdgeInsets.all(14),
                child: Center(
                  child: Text('${tr('মোট মিলেছে', 'Matched')}: ${l.digits('$_matched')}',
                      style: const TextStyle(color: AppColors.muted, fontSize: 13)),
                ),
              );
            }
            return Padding(
              padding: const EdgeInsets.all(10),
              child: Center(
                child: _loadingMore
                    ? const CircularProgressIndicator()
                    : OutlinedButton(
                        onPressed: _loadMore,
                        child: Text(tr('আরও দেখান', 'Load more'))),
              ),
            );
          }
          final r = _rows[i];
          final online = '${r['status']}' == 'active';
          final name = '${r['username'] ?? r['customer_name'] ?? ''}';
          final when = online
              ? '${r['login_time'] ?? ''}'
              : '${r['logout_time'] ?? r['login_time'] ?? ''}';
          return InkWell(
            onTap: () => _open(r),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(22, 10, 4, 10),
              child: Row(children: [
                Icon(online ? Icons.wifi : Icons.wifi_off,
                    size: 38,
                    color: online ? const Color(0xFF2E7D32) : const Color(0xFF666666)),
                const SizedBox(width: 24),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 22, color: AppColors.text)),
                      Text(when,
                          style: const TextStyle(
                              fontSize: 19, color: AppColors.muted)),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.more_vert, color: AppColors.sky),
                  onPressed: () => _open(r),
                ),
              ]),
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      return AdminScaffold(
        current: 'active_pppoe',
        title: 'Active Pppoe',
        titleWidget: const SmallCapsText('Active Pppoe',
            style: TextStyle(fontSize: 26, color: Colors.white)),
        actions: [
          IconButton(
              icon: Icon(_searching ? Icons.close : Icons.search, size: 28),
              onPressed: () {
                setState(() => _searching = !_searching);
                if (!_searching && _searchC.text.isNotEmpty) {
                  _searchC.clear();
                  _load();
                }
              }),
          IconButton(
              icon: const Icon(Icons.sync, size: 30),
              onPressed: _routerId == null ? _init : _load),
          const SizedBox(width: 4),
        ],
        body: Column(children: [
          _header(l),
          Expanded(child: _body(l)),
        ]),
      );
    });
  }
}

class _ActiveSheet extends StatefulWidget {
  final int routerId;
  final Map<String, dynamic> row;
  final Future<void> Function() onChanged;
  const _ActiveSheet({
    required this.routerId,
    required this.row,
    required this.onChanged,
  });

  @override
  State<_ActiveSheet> createState() => _ActiveSheetState();
}

class _ActiveSheetState extends State<_ActiveSheet> {
  bool _busy = false;
  String? _vendor;

  bool get _online => '${widget.row['status']}' == 'active';
  String get _ip => '${widget.row['address'] ?? ''}'.trim();
  String get _mac => '${widget.row['caller_id'] ?? ''}'.trim();
  String get _activeId => '${widget.row['.id'] ?? ''}'.trim();

  void _toast(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  String _err(Object e) => e.toString().replaceFirst('Exception: ', '');

  Future<void> _ping() async {
    setState(() => _busy = true);
    try {
      final d = await MonitoringApi.ping(widget.routerId, _ip);
      if (!mounted) return;
      final sent = numOf(d['sent']).toInt();
      final rec = numOf(d['received']).toInt();
      final replies = d['replies'] is List ? d['replies'] as List : const [];
      final times = replies
          .map((e) => e is Map ? '${e['time'] ?? ''}' : '')
          .where((t) => t.isNotEmpty)
          .join(', ');
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          title: Text('Ping $_ip'),
          content: Text('${tr('পাঠানো', 'Sent')}: $sent\n'
              '${tr('পাওয়া', 'Received')}: $rec\n'
              '${times.isEmpty ? tr('কোনো উত্তর নেই', 'No reply') : times}'),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context), child: const Text('OK'))
          ],
        ),
      );
    } catch (e) {
      _toast(_err(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(tr('সংযোগ বিচ্ছিন্ন করবেন?', 'Disconnect this user?')),
        content: Text(tr(
            'গ্রাহকের PPPoE সেশন বন্ধ হবে; রাউটার আবার সংযোগ দিতে পারে।',
            'The PPPoE session will be dropped; the client may reconnect.')),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text(tr('না', 'No'))),
          TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: Text(tr('হ্যাঁ', 'Yes'))),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await MonitoringApi.removeConnection(widget.routerId, _activeId);
      if (!mounted) return;
      Navigator.pop(context);
      await widget.onChanged();
    } catch (e) {
      _toast(_err(e));
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _lookupVendor() async {
    try {
      final v = await MonitoringApi.macVendor(_mac);
      if (!mounted) return;
      setState(() => _vendor = v.isEmpty ? '—' : v);
    } catch (e) {
      _toast(_err(e));
    }
  }

  Widget _row(String k, String v) {
    if (v.trim().isEmpty || v == '—') return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(
            width: 110,
            child: Text(k,
                style: const TextStyle(color: AppColors.muted, fontSize: 14))),
        Expanded(
            child: Text(v,
                style: const TextStyle(color: AppColors.text, fontSize: 15))),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.row;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
            16, 16, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${r['customer_name'] ?? r['username'] ?? ''}',
                style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: AppColors.navy)),
            const SizedBox(height: 6),
            _row('ID', '${r['id'] ?? ''}'),
            _row('PPPoE', '${r['username'] ?? ''}'),
            _row(tr('প্যাকেজ', 'Package'), '${r['package'] ?? ''}'),
            _row(tr('অবস্থা', 'Status'),
                _online ? tr('অনলাইন', 'Online') : tr('অফলাইন', 'Offline')),
            _row('IP', _ip),
            _row('MAC', _mac + (_vendor == null ? '' : '  ($_vendor)')),
            _row(tr('আপটাইম', 'Uptime'), '${r['uptime'] ?? ''}'),
            _row(tr('লগইন', 'Login'), '${r['login_time'] ?? ''}'),
            _row(tr('লগআউট', 'Logout'), '${r['logout_time'] ?? ''}'),
            if (_online) ...[
              _row(tr('ডাউনলোড', 'Download'),
                  '${r['download_display'] ?? ''}  (${r['download_mbps'] ?? '0'} Mbps)'),
              _row(tr('আপলোড', 'Upload'),
                  '${r['upload_display'] ?? ''}  (${r['upload_mbps'] ?? '0'} Mbps)'),
            ],
            const SizedBox(height: 12),
            if (_busy)
              const Center(child: CircularProgressIndicator())
            else
              Wrap(spacing: 8, runSpacing: 8, children: [
                if (_online && _ip.isNotEmpty)
                  OutlinedButton.icon(
                      onPressed: _ping,
                      icon: const Icon(Icons.network_ping),
                      label: const Text('Ping')),
                if (_mac.isNotEmpty && _vendor == null)
                  OutlinedButton.icon(
                      onPressed: _lookupVendor,
                      icon: const Icon(Icons.memory),
                      label: Text(tr('MAC ভেন্ডর', 'MAC vendor'))),
                if (_online && _activeId.isNotEmpty)
                  OutlinedButton.icon(
                      onPressed: _remove,
                      style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                      icon: const Icon(Icons.link_off),
                      label: Text(tr('সংযোগ বিচ্ছিন্ন', 'Disconnect'))),
              ]),
          ],
        ),
      ),
    );
  }
}
