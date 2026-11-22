import 'dart:async';
import 'package:material_ui/material_ui.dart';
import '../core/format.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../core/tr.dart';
import '../services/monitoring_api.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';

/// Live Fault (Network Fault): OLT/PON/ONU সমস্যার তালিকা + বিস্তারিত।
/// Backend: GET /admin/monitoring/faults, /admin/monitoring/fault-details
class LiveFaultScreen extends StatefulWidget {
  const LiveFaultScreen({super.key});

  @override
  State<LiveFaultScreen> createState() => _LiveFaultScreenState();
}

class _LiveFaultScreenState extends State<LiveFaultScreen> {
  static const _pageSize = 25;

  final _searchC = TextEditingController();
  Timer? _debounce;
  Timer? _auto;

  String _severity = '';
  final List<Map<String, dynamic>> _rows = [];
  int _page = 1, _totalPages = 1, _critical = 0, _warning = 0;
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
    _auto = Timer.periodic(const Duration(seconds: 60), (_) {
      if (mounted && !_loading && !_loadingMore) _load(silent: true);
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _auto?.cancel();
    _searchC.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> _rowsOf(Map<String, dynamic> d) {
    final raw = d['rows'];
    return raw is List
        ? raw.map((e) => Map<String, dynamic>.from(e as Map)).toList()
        : <Map<String, dynamic>>[];
  }

  void _meta(Map<String, dynamic> d) {
    final p = d['pagination'];
    if (p is Map) {
      _page = numOf(p['page']).toInt().clamp(1, 100000);
      _totalPages = numOf(p['totalPages']).toInt().clamp(1, 100000);
    }
    final s = d['summary'];
    if (s is Map) {
      _critical = numOf(s['critical']).toInt();
      _warning = numOf(s['warning']).toInt();
    }
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final d = await MonitoringApi.faults(
        search: _searchC.text.trim(),
        severity: _severity,
        page: 1,
        limit: _pageSize,
      );
      if (!mounted) return;
      setState(() {
        _rows
          ..clear()
          ..addAll(_rowsOf(d));
        _meta(d);
        _loading = false;
      });
    } catch (e) {
      if (!mounted || silent) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || _page >= _totalPages) return;
    setState(() => _loadingMore = true);
    try {
      final d = await MonitoringApi.faults(
        search: _searchC.text.trim(),
        severity: _severity,
        page: _page + 1,
        limit: _pageSize,
      );
      if (!mounted) return;
      setState(() {
        _rows.addAll(_rowsOf(d));
        _meta(d);
        _loadingMore = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadingMore = false);
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
    }
  }

  void _onSearch(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 450), _load);
  }

  Color _sevColor(String s) =>
      s == 'critical' ? Colors.red : (s == 'warning' ? AppColors.orange : Colors.grey);

  void _open(Map<String, dynamic> r) {
    final oltId = numOf(r['olt_id']).toInt();
    final pon = '${r['pon'] ?? ''}';
    if (oltId <= 0 || pon.isEmpty) return;
    Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => _FaultDetailsPage(oltId: oltId, pon: pon)));
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
    if (_rows.isEmpty) return Center(child: Text(l.t('no_data')));
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: _rows.length + 1,
        separatorBuilder: (_, __) => const Divider(height: 1, color: AppColors.line),
        itemBuilder: (_, i) {
          if (i == _rows.length) {
            if (_page >= _totalPages) return const SizedBox(height: 20);
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
          final sev = '${r['severity'] ?? ''}'.toLowerCase();
          final who = '${r['customer_name'] ?? ''}'.isNotEmpty
              ? '${r['customer_name']}'
              : 'ONU ${r['onu_id'] ?? ''}';
          final sub = [
            '${r['olt_name'] ?? ''}',
            'PON ${r['pon'] ?? ''}',
            if ('${r['rx_power'] ?? ''}'.isNotEmpty && r['rx_power'] != null)
              'RX ${r['rx_power']}',
          ].where((e) => e.trim().isNotEmpty).join(' · ');
          return ListTile(
            leading: Icon(Icons.warning_amber_rounded, color: _sevColor(sev)),
            title: Text(who,
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.text)),
            subtitle: Text(
                '${r['fault_reason'] ?? r['fault_type'] ?? ''}\n$sub',
                style: const TextStyle(fontSize: 13, color: AppColors.muted)),
            isThreeLine: true,
            trailing: Text(sev.toUpperCase(),
                style: TextStyle(
                    fontSize: 11, fontWeight: FontWeight.bold, color: _sevColor(sev))),
            onTap: () => _open(r),
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
        current: 'live_fault',
        title: tr('Live Fault', 'Live Fault'),
        actions: [
          IconButton(icon: const Icon(Icons.sync, size: 30), onPressed: _load),
          const SizedBox(width: 4),
        ],
        body: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: TextField(
              controller: _searchC,
              textInputAction: TextInputAction.search,
              onChanged: _onSearch,
              onSubmitted: (_) => _load(),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search),
                hintText: tr('OLT, PON, গ্রাহক, ONU', 'OLT, PON, customer, ONU'),
                isDense: true,
                border: const OutlineInputBorder(),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 4),
            child: Wrap(spacing: 8, children: [
              for (final s in const ['', 'critical', 'warning'])
                ChoiceChip(
                  label: Text(s.isEmpty
                      ? '${tr('সব', 'All')} (${l.digits('${_critical + _warning}')})'
                      : s == 'critical'
                          ? '${tr('ক্রিটিক্যাল', 'Critical')} (${l.digits('$_critical')})'
                          : '${tr('সতর্কতা', 'Warning')} (${l.digits('$_warning')})'),
                  selected: _severity == s,
                  onSelected: (_) {
                    if (_severity == s) return;
                    setState(() => _severity = s);
                    _load();
                  },
                ),
            ]),
          ),
          Expanded(child: _body(l)),
        ]),
      );
    });
  }
}

class _FaultDetailsPage extends StatefulWidget {
  final int oltId;
  final String pon;
  const _FaultDetailsPage({required this.oltId, required this.pon});

  @override
  State<_FaultDetailsPage> createState() => _FaultDetailsPageState();
}

class _FaultDetailsPageState extends State<_FaultDetailsPage> {
  late Future<Map<String, dynamic>> _f;

  @override
  void initState() {
    super.initState();
    _f = MonitoringApi.faultDetails(widget.oltId, widget.pon);
  }

  Widget _kv(String k, dynamic v) {
    final s = '${v ?? ''}'.trim();
    if (s.isEmpty || s == 'null') return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(
            width: 100,
            child: Text(k,
                style: const TextStyle(color: AppColors.muted, fontSize: 13))),
        Expanded(
            child: Text(s,
                style: const TextStyle(color: AppColors.text, fontSize: 14))),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      return Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(
            title: Text('PON ${widget.pon}', style: const TextStyle(fontSize: 22))),
        body: FutureBuilder<Map<String, dynamic>>(
          future: _f,
          builder: (_, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snap.hasError) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                      snap.error.toString().replaceFirst('Exception: ', ''),
                      textAlign: TextAlign.center),
                ),
              );
            }
            final d = snap.data!;
            final olt = mapOf(d['olt']);
            final sum = mapOf(d['summary']);
            final onus = d['onus'] is List ? d['onus'] as List : const [];
            return ListView(
              padding: const EdgeInsets.all(14),
              children: [
                Text('${olt['name'] ?? 'OLT'}',
                    style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: AppColors.navy)),
                const SizedBox(height: 6),
                _kv('IP', olt['ip']),
                _kv(tr('ভেন্ডর', 'Vendor'), olt['vendor']),
                _kv(tr('অবস্থা', 'Status'), olt['status']),
                _kv('ONU', '${tr('মোট', 'Total')} ${olt['onu_total'] ?? ''}  '
                    '${tr('অনলাইন', 'Online')} ${olt['onu_online'] ?? ''}  '
                    '${tr('অফলাইন', 'Offline')} ${olt['onu_offline'] ?? ''}'),
                const Divider(height: 24),
                Wrap(spacing: 14, runSpacing: 4, children: [
                  Text('${tr('প্রভাবিত', 'Affected')}: ${l.digits('${sum['total'] ?? 0}')}'),
                  Text('${tr('অফলাইন', 'Offline')}: ${l.digits('${sum['offline'] ?? 0}')}',
                      style: const TextStyle(color: Colors.red)),
                  Text('${tr('ক্রিটিক্যাল RX', 'Critical RX')}: ${l.digits('${sum['critical_rx'] ?? 0}')}',
                      style: const TextStyle(color: Colors.red)),
                  Text('${tr('দুর্বল RX', 'Weak RX')}: ${l.digits('${sum['weak_rx'] ?? 0}')}',
                      style: const TextStyle(color: AppColors.orange)),
                ]),
                const SizedBox(height: 10),
                if (onus.isEmpty) Center(child: Text(l.t('no_data'))),
                for (final o in onus)
                  Card(
                    margin: const EdgeInsets.symmetric(vertical: 5),
                    child: Padding(
                      padding: const EdgeInsets.all(10),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                                '${(o as Map)['customer_name'] ?? ''}'.isEmpty
                                    ? 'ONU ${o['onu_id'] ?? ''}'
                                    : '${o['customer_name']}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.bold, fontSize: 15)),
                            const SizedBox(height: 4),
                            _kv(tr('কারণ', 'Reason'), o['fault_reason']),
                            _kv(tr('অবস্থা', 'Status'), o['status']),
                            _kv('RX / TX', '${o['rx_power'] ?? '-'} / ${o['tx_power'] ?? '-'}'),
                            _kv(tr('দূরত্ব', 'Distance'), o['distance']),
                            _kv('PPPoE', o['pppoe_username']),
                            _kv(tr('ফোন', 'Phone'), o['customer_phone']),
                            _kv('SN', o['onu_sn']),
                            _kv('MAC', o['onu_mac']),
                          ]),
                    ),
                  ),
              ],
            );
          },
        ),
      );
    });
  }
}
