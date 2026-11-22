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

String _err(Object e) => e.toString().replaceFirst('Exception: ', '');

List<Map<String, dynamic>> _rows(dynamic v) => v is List
    ? v.map((e) => Map<String, dynamic>.from(e as Map)).toList()
    : <Map<String, dynamic>>[];

String _dbm(dynamic v) {
  final n = num.tryParse('${v ?? ''}');
  return n == null ? '—' : '${n.toStringAsFixed(2)} dBm';
}

String _d(dynamic v) => Lang.i.digits(_s(v, '0'));

/// OLT মনিটর: সামারি, PON পোর্ট, সিস্টেম স্ট্যাটাস, অ্যালার্ম, সাম্প্রতিক ONU।
/// Backend: GET /admin/olt-monitor/dashboard ও /admin/olt-monitor/live
/// (ড্রয়ারে আলাদা key দিন: 'olt_monitor')
class OltMonitorScreen extends StatefulWidget {
  const OltMonitorScreen({super.key});

  @override
  State<OltMonitorScreen> createState() => _OltMonitorScreenState();
}

class _OltMonitorScreenState extends State<OltMonitorScreen> {
  Map<String, dynamic> _dash = {};
  Map<String, dynamic>? _live; // শুধু Live বাটন চাপলে
  int? _oltId;
  bool _loading = true;
  bool _liveLoading = false;
  String? _error;
  Timer? _auto;

  @override
  void initState() {
    super.initState();
    _load();
    _auto = Timer.periodic(const Duration(seconds: 60), (_) {
      if (mounted && !_loading && !_liveLoading) _load(silent: true);
    });
  }

  @override
  void dispose() {
    _auto?.cancel();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final d = await OltApi.monitorDashboard(oltId: _oltId);
      if (!mounted) return;
      final data = mapOf(d['data']);
      final sel = mapOf(data['selectedOlt']);
      setState(() {
        _dash = data;
        _oltId ??= sel.isEmpty ? null : numOf(sel['id']).toInt();
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      if (silent) return; // ব্যাকগ্রাউন্ড রিফ্রেশ ব্যর্থ হলে আগের ডেটা থাকুক
      setState(() {
        _error = _err(e);
        _loading = false;
      });
    }
  }

  Future<void> _loadLive({bool refresh = false}) async {
    final id = _oltId;
    if (id == null) return;
    setState(() => _liveLoading = true);
    try {
      final d = await OltApi.monitorLive(id, refresh: refresh);
      if (!mounted) return;
      setState(() {
        _live = d;
        _liveLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _liveLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(_err(e)),
        backgroundColor: Colors.red.shade700,
      ));
    }
  }

  void _selectOlt(int? id) {
    if (id == null || id == _oltId) return;
    setState(() {
      _oltId = id;
      _live = null;
    });
    _load();
  }

  // ---------------- UI অংশ ----------------

  Widget _card(String label, String value, IconData icon, Color color) {
    return Container(
      width: 104,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, size: 20, color: color),
        const SizedBox(height: 6),
        Text(value,
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color)),
        Text(label, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
      ]),
    );
  }

  Widget _summary(Map<String, dynamic> s) {
    final rx = s['avgRxPower'];
    return Wrap(spacing: 8, runSpacing: 8, children: [
      _card('OLT', '${_d(s['onlineOlt'])}/${_d(s['totalOlt'])}', Icons.dns, AppColors.navy),
      _card('PON', '${_d(s['activePon'])}/${_d(s['totalPon'])}', Icons.hub, AppColors.teal),
      _card(tr('অনলাইন ONU', 'Online ONU'), '${_d(s['onlineOnu'])}/${_d(s['totalOnu'])}',
          Icons.account_tree, Colors.green.shade700),
      _card(tr('অফলাইন ONU', 'Offline ONU'), _d(s['offlineOnu']), Icons.link_off,
          Colors.red.shade600),
      _card('Avg Rx', rx == null ? '—' : Lang.i.digits(_s(rx)), Icons.signal_cellular_alt,
          AppColors.purple),
    ]);
  }

  Widget _title(String t) => Padding(
        padding: const EdgeInsets.fromLTRB(0, 18, 0, 8),
        child: Text(t,
            style: const TextStyle(
                fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.navy)),
      );

  Widget _selector(List<Map<String, dynamic>> olts) {
    if (olts.isEmpty) return const SizedBox.shrink();
    final ids = olts.map((o) => numOf(o['id']).toInt()).toList();
    final value = ids.contains(_oltId) ? _oltId : ids.first;
    return DropdownButtonFormField<int>(
      key: ValueKey('olt-select-$value'),
      initialValue: value,
      isDense: true,
      decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'OLT'),
      items: [
        for (final o in olts)
          DropdownMenuItem(
            value: numOf(o['id']).toInt(),
            child: Text('${_s(o['name'])} (${_s(o['ip'])})', overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: _selectOlt,
    );
  }

  Color _portColor(String st) {
    switch (st.toLowerCase()) {
      case 'ok':
        return Colors.green.shade700;
      case 'partial':
        return AppColors.orange;
      case 'unavailable':
        return AppColors.muted;
      default:
        return Colors.red.shade600;
    }
  }

  Widget _ports(List<Map<String, dynamic>> ports) {
    if (ports.isEmpty) return Text(tr('PON তথ্য নেই', 'No PON data'));
    return Column(children: [
      for (final p in ports)
        Container(
          margin: const EdgeInsets.only(bottom: 6),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.line),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(children: [
            Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                    color: _portColor(_s(p['status'])), shape: BoxShape.circle)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(_s(p['name'], _s(p['id'])),
                    style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.text)),
                Text(
                  'ONU ${_d(p['onlineOnu'])}/${_d(p['totalOnu'])} · '
                  'Rx ${_dbm(p['avgRx'] ?? p['rxPower'])} · Tx ${_dbm(p['avgTx'])}',
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
              ]),
            ),
            Text(_s(p['status'], '-'),
                style: TextStyle(fontSize: 12, color: _portColor(_s(p['status'])))),
          ]),
        ),
    ]);
  }

  Widget _kv(String k, dynamic v) {
    final t = _s(v);
    if (t.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(children: [
        SizedBox(width: 110, child: Text(k, style: const TextStyle(color: AppColors.muted))),
        Expanded(child: Text(t, style: const TextStyle(color: AppColors.text))),
      ]),
    );
  }

  Widget _system(Map<String, dynamic> s) {
    final has = s.values.any((v) => _s(v).isNotEmpty);
    if (!has) return Text(tr('সিস্টেম তথ্য নেই', 'No system data'));
    return Column(children: [
      _kv(tr('তাপমাত্রা', 'Temperature'), s['temp']),
      _kv(tr('ভোল্টেজ', 'Voltage'), s['voltage']),
      _kv('CPU', s['cpu']),
      _kv('RAM', s['ram']),
      _kv('Fan', s['fan']),
      _kv('Uptime', s['uptime']),
    ]);
  }

  Widget _alarms(List<Map<String, dynamic>> alarms) {
    if (alarms.isEmpty) {
      return Text(tr('কোনো অ্যালার্ম নেই', 'No alarms'),
          style: TextStyle(color: Colors.green.shade700));
    }
    return Column(children: [
      for (final a in alarms)
        ListTile(
          dense: true,
          contentPadding: EdgeInsets.zero,
          leading: Icon(Icons.warning_amber, color: AppColors.orange),
          title: Text(_s(a['message'], _s(a['event']))),
          subtitle: Text([_s(a['time']), _s(a['source']), _s(a['level'], _s(a['severity']))]
              .where((e) => e.isNotEmpty)
              .join(' · ')),
        ),
    ]);
  }

  Widget _recent(List<Map<String, dynamic>> onus) {
    if (onus.isEmpty) return Text(tr('তথ্য নেই', 'No data'));
    return Column(children: [
      for (final o in onus)
        ListTile(
          dense: true,
          contentPadding: EdgeInsets.zero,
          title: Text(_s(o['customer_name'], _s(o['name'], 'ONU ${_s(o['id'])}'))),
          subtitle: Text(
              '${_s(o['olt_name'])} · PON ${_s(o['pon'], '-')} · ${_s(o['status'], '-')}'),
          trailing: Text(_dbm(o['rx_power'] ?? o['rxPower']),
              style: const TextStyle(fontSize: 12, color: AppColors.muted)),
        ),
    ]);
  }

  Widget _liveBlock() {
    final l = _live;
    if (_liveLoading) {
      return const Padding(
          padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()));
    }
    if (l == null) return const SizedBox.shrink();
    final warnings = (l['warnings'] is List)
        ? (l['warnings'] as List).map((e) => '$e').toList()
        : <String>[];
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _title('Live DDM · ${_s(mapOf(l['olt'])['name'])}'),
      Text(
        'ONU ${_d(l['activeOnu'])}/${_d(l['totalOnu'])} · ${_s(l['captured_at'])}',
        style: const TextStyle(fontSize: 12, color: AppColors.muted),
      ),
      const SizedBox(height: 8),
      _ports(_rows(l['ports'])),
      if (warnings.isNotEmpty) ...[
        const SizedBox(height: 6),
        for (final w in warnings)
          Text('• $w', style: TextStyle(fontSize: 12, color: Colors.orange.shade800)),
      ],
      _title(tr('Live অ্যালার্ম', 'Live alarms')),
      _alarms(_rows(l['alarms'])),
    ]);
  }

  Widget _content() {
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
    final olts = _rows(_dash['olts']);
    final sel = mapOf(_dash['selectedOlt']);
    if (olts.isEmpty) return Center(child: Text(tr('কোনো OLT নেই', 'No OLT found')));

    return RefreshIndicator(
      onRefresh: () => _load(silent: true),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(14),
        children: [
          _summary(mapOf(_dash['summary'])),
          const SizedBox(height: 14),
          _selector(olts),
          if (sel.isNotEmpty) ...[
            const SizedBox(height: 10),
            Row(children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: _liveLoading ? null : () => _loadLive(),
                  icon: const Icon(Icons.speed, size: 18),
                  label: const Text('Live DDM'),
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton.icon(
                onPressed: _liveLoading ? null : () => _loadLive(refresh: true),
                icon: const Icon(Icons.refresh, size: 18),
                label: Text(tr('রিফ্রেশ', 'Refresh')),
              ),
            ]),
            _liveBlock(),
            _title(tr('PON পোর্ট', 'PON ports')),
            _ports(_rows(sel['ports'])),
            _title(tr('সিস্টেম স্ট্যাটাস', 'System status')),
            _system(mapOf(_dash['systemStatus'])),
          ],
          _title(tr('অ্যালার্ম', 'Alarms')),
          _alarms(_rows(_dash['alarms'])),
          _title(tr('সাম্প্রতিক ONU', 'Recent ONUs')),
          _recent(_rows(_dash['recentOnus'])),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      return AdminScaffold(
        current: 'olt_monitor',
        title: tr('OLT মনিটর', 'OLT Monitor'),
        actions: [
          IconButton(icon: const Icon(Icons.sync, size: 30), onPressed: _load),
          const SizedBox(width: 4),
        ],
        body: _content(),
      );
    });
  }
}
