import 'dart:async';
import 'package:material_ui/material_ui.dart';
import '../core/format.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../core/tr.dart';
import '../services/monitoring_api.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';

/// Customer Traffic: লাইভ (রাউটার ধরে) + মাসিক (ডাটাবেস ইতিহাস)।
/// Backend: GET /admin/monitoring/customer-traffic/live, /monthly
class CustomerTrafficScreen extends StatelessWidget {
  const CustomerTrafficScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      return DefaultTabController(
        length: 2,
        child: AdminScaffold(
          current: 'customer_traffic',
          title: tr('Customer Traffic', 'Customer Traffic'),
          body: Column(children: [
            TabBar(
              labelColor: AppColors.navy,
              indicatorColor: AppColors.sky,
              tabs: [
                Tab(text: tr('লাইভ', 'Live')),
                Tab(text: tr('মাসিক', 'Monthly')),
              ],
            ),
            const Expanded(
              child: TabBarView(children: [_LiveTab(), _MonthlyTab()]),
            ),
          ]),
        ),
      );
    });
  }
}

String _gb(num bytes) => (bytes / (1024 * 1024 * 1024)).toStringAsFixed(2);

Widget _centerError(String msg, VoidCallback retry) => Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Text(msg, textAlign: TextAlign.center),
        ),
        const SizedBox(height: 10),
        OutlinedButton(onPressed: retry, child: Text(Lang.i.t('retry'))),
      ]),
    );

// ======================= লাইভ =======================

class _LiveTab extends StatefulWidget {
  const _LiveTab();

  @override
  State<_LiveTab> createState() => _LiveTabState();
}

class _LiveTabState extends State<_LiveTab>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  final _searchC = TextEditingController();
  Timer? _auto;
  bool _autoOn = false;

  List<Map<String, dynamic>> _routers = [];
  int? _routerId;
  List<Map<String, dynamic>> _customers = [];
  List<Map<String, dynamic>> _chart = [];
  Map<String, dynamic> _totals = {};
  bool _loading = true;
  String? _error;
  bool _inFlight = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _auto?.cancel();
    _searchC.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> _maps(dynamic v) => v is List
      ? v.map((e) => Map<String, dynamic>.from(e as Map)).toList()
      : <Map<String, dynamic>>[];

  Future<void> _load({bool silent = false}) async {
    if (_inFlight) return;
    _inFlight = true;
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final d = await MonitoringApi.trafficLive(routerId: _routerId);
      if (!mounted) return;
      final cur = d['router'];
      final cust = _maps(d['customers']);
      cust.sort((a, b) =>
          numOf(b['download_mbps']).compareTo(numOf(a['download_mbps'])));
      setState(() {
        _routers = _maps(d['routers']);
        if (cur is Map) _routerId = numOf(cur['id']).toInt();
        _customers = cust;
        _chart = _maps(d['chart']);
        _totals = mapOf(d['totals']);
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      if (!silent || _customers.isEmpty) {
        setState(() {
          _error = e.toString().replaceFirst('Exception: ', '');
          _loading = false;
        });
      }
    } finally {
      _inFlight = false;
    }
  }

  void _toggleAuto(bool v) {
    setState(() => _autoOn = v);
    _auto?.cancel();
    if (v) {
      _auto = Timer.periodic(
          const Duration(seconds: 15), (_) => mounted ? _load(silent: true) : null);
    }
  }

  Widget _tile(String label, String value, Color c) => Expanded(
        child: Container(
          margin: const EdgeInsets.all(4),
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
          decoration: BoxDecoration(
              color: AppColors.skyLight, borderRadius: BorderRadius.circular(8)),
          child: Column(children: [
            Text(label,
                style: const TextStyle(fontSize: 12, color: AppColors.muted)),
            const SizedBox(height: 2),
            FittedBox(
              child: Text(value,
                  style: TextStyle(
                      fontSize: 16, fontWeight: FontWeight.bold, color: c)),
            ),
          ]),
        ),
      );

  Widget _topChart() {
    if (_chart.isEmpty) return const SizedBox.shrink();
    final items = _chart.take(8).toList();
    double maxV = 0.01;
    for (final c in items) {
      final d = numOf(c['download']).toDouble();
      final u = numOf(c['upload']).toDouble();
      if (d > maxV) maxV = d;
      if (u > maxV) maxV = u;
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 6, 12, 2),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(tr('শীর্ষ ব্যবহারকারী (Mbps)', 'Top users (Mbps)'),
            style: const TextStyle(
                fontSize: 14, fontWeight: FontWeight.bold, color: AppColors.navy)),
        const SizedBox(height: 4),
        for (final c in items) ...[
          Text('${c['label'] ?? ''}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, color: AppColors.text)),
          _bar(numOf(c['download']).toDouble() / maxV, AppColors.teal,
              '${c['download']}'),
          _bar(numOf(c['upload']).toDouble() / maxV, AppColors.orange,
              '${c['upload']}'),
          const SizedBox(height: 4),
        ],
      ]),
    );
  }

  Widget _bar(double frac, Color c, String label) => Row(children: [
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: frac.clamp(0.0, 1.0),
              minHeight: 6,
              color: c,
              backgroundColor: AppColors.line,
            ),
          ),
        ),
        SizedBox(
            width: 52,
            child: Text(label,
                textAlign: TextAlign.right,
                style: const TextStyle(fontSize: 11, color: AppColors.muted))),
      ]);

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final l = Lang.i;
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _centerError(_error!, _load);

    final q = _searchC.text.trim().toLowerCase();
    final shown = q.isEmpty
        ? _customers
        : _customers
            .where((c) => ['${c['name']}', '${c['customer_id']}', '${c['username']}', '${c['address']}']
                .any((s) => s.toLowerCase().contains(q)))
            .toList();

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (_routers.length > 1)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: DropdownButtonFormField<int>(
                key: ValueKey('traffic-router-$_routerId'),
                initialValue: _routerId,
                isExpanded: true,
                decoration: InputDecoration(
                  isDense: true,
                  border: const OutlineInputBorder(),
                  labelText: tr('MikroTik রাউটার', 'MikroTik router'),
                ),
                items: [
                  for (final r in _routers)
                    DropdownMenuItem<int>(
                      value: numOf(r['id']).toInt(),
                      child: Text('${r['name'] ?? ''}',
                          overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (v) {
                  if (v == null || v == _routerId) return;
                  setState(() => _routerId = v);
                  _load();
                },
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 6, 8, 0),
            child: Row(children: [
              _tile(tr('অনলাইন', 'Online'),
                  l.digits('${_totals['activeUsers'] ?? 0}'), AppColors.navy),
              _tile('↓ Mbps', '${_totals['downloadMbps'] ?? 0}', AppColors.teal),
              _tile('↑ Mbps', '${_totals['uploadMbps'] ?? 0}', AppColors.orange),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 0),
            child: Row(children: [
              Expanded(
                child: Text(tr('অটো রিফ্রেশ (১৫ সেকেন্ড)', 'Auto refresh (15s)'),
                    style: const TextStyle(fontSize: 13, color: AppColors.muted)),
              ),
              Switch(value: _autoOn, onChanged: _toggleAuto),
            ]),
          ),
          _topChart(),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 4),
            child: TextField(
              controller: _searchC,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search),
                hintText: tr('নাম, ID, PPPoE, IP', 'Name, ID, PPPoE, IP'),
                isDense: true,
                border: const OutlineInputBorder(),
              ),
            ),
          ),
          if (shown.isEmpty)
            Padding(
              padding: const EdgeInsets.all(30),
              child: Center(child: Text(l.t('no_data'))),
            ),
          for (final c in shown) ...[
            ListTile(
              dense: true,
              title: Text('${c['name'] ?? c['username'] ?? ''}',
                  style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: AppColors.text)),
              subtitle: Text(
                  [
                    '${c['customer_id'] ?? ''}',
                    '${c['package'] ?? ''}',
                    '${c['uptime'] ?? ''}',
                  ].where((e) => e.isNotEmpty && e != 'null').join(' · '),
                  style: const TextStyle(fontSize: 12, color: AppColors.muted)),
              trailing: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('↓ ${c['download_mbps'] ?? 0} Mbps',
                      style: const TextStyle(fontSize: 12, color: AppColors.teal)),
                  Text('↑ ${c['upload_mbps'] ?? 0} Mbps',
                      style: const TextStyle(fontSize: 12, color: AppColors.orange)),
                ],
              ),
            ),
            const Divider(height: 1, color: AppColors.line),
          ],
          const SizedBox(height: 20),
        ],
      ),
    );
  }
}

// ======================= মাসিক =======================

class _MonthlyTab extends StatefulWidget {
  const _MonthlyTab();

  @override
  State<_MonthlyTab> createState() => _MonthlyTabState();
}

class _MonthlyTabState extends State<_MonthlyTab>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  final _searchC = TextEditingController();
  late DateTime _month;
  List<Map<String, dynamic>> _customers = [];
  Map<String, dynamic> _totals = {};
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    final n = DateTime.now();
    _month = DateTime(n.year, n.month);
    _load();
  }

  @override
  void dispose() {
    _searchC.dispose();
    super.dispose();
  }

  String get _key =>
      '${_month.year.toString().padLeft(4, '0')}-${_month.month.toString().padLeft(2, '0')}';

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final d = await MonitoringApi.trafficMonthly(month: _key);
      if (!mounted) return;
      final raw = d['customers'];
      final list = raw is List
          ? raw.map((e) => Map<String, dynamic>.from(e as Map)).toList()
          : <Map<String, dynamic>>[];
      list.sort((a, b) => (numOf(b['download_bytes']) + numOf(b['upload_bytes']))
          .compareTo(numOf(a['download_bytes']) + numOf(a['upload_bytes'])));
      setState(() {
        _customers = list;
        _totals = mapOf(d['totals']);
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

  void _shift(int delta) {
    final next = DateTime(_month.year, _month.month + delta);
    final n = DateTime.now();
    if (next.isAfter(DateTime(n.year, n.month))) return;
    setState(() => _month = next);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final l = Lang.i;
    final q = _searchC.text.trim().toLowerCase();
    final shown = q.isEmpty
        ? _customers
        : _customers
            .where((c) => ['${c['name']}', '${c['customer_id']}', '${c['username']}']
                .any((s) => s.toLowerCase().contains(q)))
            .toList();

    return Column(children: [
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        IconButton(
            icon: const Icon(Icons.chevron_left), onPressed: () => _shift(-1)),
        Text('${l.months[_month.month - 1]} ${l.digits('${_month.year}')}',
            style: const TextStyle(
                fontSize: 17, fontWeight: FontWeight.bold, color: AppColors.navy)),
        IconButton(
            icon: const Icon(Icons.chevron_right), onPressed: () => _shift(1)),
      ]),
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 4),
        child: TextField(
          controller: _searchC,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            prefixIcon: const Icon(Icons.search),
            hintText: tr('নাম, ID, PPPoE', 'Name, ID, PPPoE'),
            isDense: true,
            border: const OutlineInputBorder(),
          ),
        ),
      ),
      if (!_loading && _error == null)
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 6),
          child: Row(children: [
            Text('↓ ${_totals['download_gb'] ?? 0} GB',
                style: const TextStyle(
                    fontWeight: FontWeight.bold, color: AppColors.teal)),
            const SizedBox(width: 16),
            Text('↑ ${_totals['upload_gb'] ?? 0} GB',
                style: const TextStyle(
                    fontWeight: FontWeight.bold, color: AppColors.orange)),
            const Spacer(),
            Text('${tr('গ্রাহক', 'Users')}: ${l.digits('${_customers.length}')}',
                style: const TextStyle(fontSize: 13, color: AppColors.muted)),
          ]),
        ),
      Expanded(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? _centerError(_error!, _load)
                : shown.isEmpty
                    ? Center(child: Text(l.t('no_data')))
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView.separated(
                          physics: const AlwaysScrollableScrollPhysics(),
                          itemCount: shown.length,
                          separatorBuilder: (_, __) =>
                              const Divider(height: 1, color: AppColors.line),
                          itemBuilder: (_, i) {
                            final c = shown[i];
                            return ListTile(
                              dense: true,
                              title: Text('${c['name'] ?? c['username'] ?? ''}',
                                  style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.bold,
                                      color: AppColors.text)),
                              subtitle: Text(
                                  [
                                    '${c['customer_id'] ?? ''}',
                                    '${c['package'] ?? ''}',
                                    '${tr('সেশন', 'Sessions')} ${c['sessions'] ?? 0}',
                                  ].where((e) => e.isNotEmpty).join(' · '),
                                  style: const TextStyle(
                                      fontSize: 12, color: AppColors.muted)),
                              trailing: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text('↓ ${_gb(numOf(c['download_bytes']))} GB',
                                      style: const TextStyle(
                                          fontSize: 12, color: AppColors.teal)),
                                  Text('↑ ${_gb(numOf(c['upload_bytes']))} GB',
                                      style: const TextStyle(
                                          fontSize: 12, color: AppColors.orange)),
                                ],
                              ),
                            );
                          },
                        ),
                      ),
      ),
    ]);
  }
}
