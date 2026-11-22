import 'dart:async';
import 'package:material_ui/material_ui.dart';
import '../core/format.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../core/tr.dart';
import '../services/monitoring_api.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';

/// Interface Monitor: রাউটারের Ethernet/VLAN ইন্টারফেসের অবস্থা + লাইভ ব্যান্ডউইথ।
/// Backend: GET /admin/monitoring/interface, /interface/bandwidth
class InterfaceMonitorScreen extends StatefulWidget {
  const InterfaceMonitorScreen({super.key});

  @override
  State<InterfaceMonitorScreen> createState() => _InterfaceMonitorScreenState();
}

class _InterfaceMonitorScreenState extends State<InterfaceMonitorScreen> {
  List<Map<String, dynamic>> _routers = [];
  int? _routerId;
  List<Map<String, dynamic>> _eth = [];
  List<Map<String, dynamic>> _vlan = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  List<Map<String, dynamic>> _maps(dynamic v) => v is List
      ? v.map((e) => Map<String, dynamic>.from(e as Map)).toList()
      : <Map<String, dynamic>>[];

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final d = await MonitoringApi.interfaces(routerId: _routerId);
      if (!mounted) return;
      final routers = _maps(d['routers']);
      final cur = d['router'];
      setState(() {
        _routers = routers;
        if (cur is Map) {
          _routerId = numOf(cur['id']).toInt();
        } else if (_routerId == null && routers.isNotEmpty) {
          _routerId = numOf(routers.first['id']).toInt();
        }
        _eth = _maps(d['ethernet_interfaces']);
        _vlan = _maps(d['vlan_interfaces']);
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

  void _open(Map<String, dynamic> itf) {
    final id = _routerId;
    if (id == null) return;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _BandwidthSheet(routerId: id, itf: itf),
    );
  }

  Widget _section(String title, List<Map<String, dynamic>> items, bool vlan) {
    if (items.isEmpty) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
        child: Text('$title (${Lang.i.digits('${items.length}')})',
            style: const TextStyle(
                fontSize: 15, fontWeight: FontWeight.bold, color: AppColors.navy)),
      ),
      for (final it in items)
        ListTile(
          dense: true,
          leading: Icon(Icons.circle,
              size: 14, color: '${it['status']}' == 'up' ? Colors.green : Colors.red),
          title: Text('${it['name'] ?? ''}',
              style: const TextStyle(fontSize: 16, color: AppColors.text)),
          subtitle: vlan && '${it['vlan_id'] ?? ''}'.isNotEmpty
              ? Text('VLAN ${it['vlan_id']}',
                  style: const TextStyle(fontSize: 12, color: AppColors.muted))
              : null,
          trailing: Text('${it['status'] ?? ''}'.toUpperCase(),
              style: const TextStyle(fontSize: 12, color: AppColors.muted)),
          onTap: () => _open(it),
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
          OutlinedButton(onPressed: _load, child: Text(l.t('retry'))),
        ]),
      );
    }
    if (_eth.isEmpty && _vlan.isEmpty) return Center(child: Text(l.t('no_data')));
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          _section('Ethernet', _eth, false),
          _section('VLAN', _vlan, true),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      return AdminScaffold(
        current: 'interface_monitor',
        title: tr('Interface Monitor', 'Interface Monitor'),
        actions: [
          IconButton(icon: const Icon(Icons.sync, size: 30), onPressed: _load),
          const SizedBox(width: 4),
        ],
        body: Column(children: [
          if (_routers.length > 1)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: DropdownButtonFormField<int>(
                key: ValueKey('iface-router-$_routerId'),
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
          Expanded(child: _body(l)),
        ]),
      );
    });
  }
}

/// লাইভ ব্যান্ডউইথ: শীট খোলা থাকলে প্রায় প্রতি ৩ সেকেন্ডে নতুন নমুনা (সার্ভার ~১ সেকেন্ড মাপে)।
class _BandwidthSheet extends StatefulWidget {
  final int routerId;
  final Map<String, dynamic> itf;
  const _BandwidthSheet({required this.routerId, required this.itf});

  @override
  State<_BandwidthSheet> createState() => _BandwidthSheetState();
}

class _BandwidthSheetState extends State<_BandwidthSheet> {
  static const _max = 30;
  final List<double> _dl = [];
  final List<double> _ul = [];
  Timer? _timer;
  bool _inFlight = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _sample();
    _timer = Timer.periodic(const Duration(seconds: 3), (_) => _sample());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _sample() async {
    if (_inFlight || !mounted) return;
    _inFlight = true;
    try {
      final d = await MonitoringApi.bandwidth(
          widget.routerId, '${widget.itf['name']}');
      if (!mounted) return;
      setState(() {
        _dl.add(numOf(d['downloadMbps']).toDouble());
        _ul.add(numOf(d['uploadMbps']).toDouble());
        if (_dl.length > _max) _dl.removeAt(0);
        if (_ul.length > _max) _ul.removeAt(0);
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      _inFlight = false;
    }
  }

  Widget _stat(String label, List<double> s, Color c) {
    final v = s.isEmpty ? 0.0 : s.last;
    return Expanded(
      child: Column(children: [
        Text(label, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
        const SizedBox(height: 2),
        Text('${v.toStringAsFixed(2)} Mbps',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: c)),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${widget.itf['name'] ?? ''}',
                style: const TextStyle(
                    fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.navy)),
            const SizedBox(height: 10),
            Row(children: [
              _stat(tr('ডাউনলোড', 'Download'), _dl, AppColors.teal),
              _stat(tr('আপলোড', 'Upload'), _ul, AppColors.orange),
            ]),
            const SizedBox(height: 12),
            SizedBox(
              height: 130,
              width: double.infinity,
              child: CustomPaint(
                painter: _LinePainter([
                  _Series(_dl, AppColors.teal),
                  _Series(_ul, AppColors.orange),
                ]),
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            if (_dl.isEmpty && _error == null)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: LinearProgressIndicator(),
              ),
          ],
        ),
      ),
    );
  }
}

class _Series {
  final List<double> values;
  final Color color;
  const _Series(this.values, this.color);
}

/// খুব সহজ লাইন চার্ট (নতুন প্যাকেজ ছাড়া)।
class _LinePainter extends CustomPainter {
  final List<_Series> series;
  _LinePainter(this.series);

  @override
  void paint(Canvas canvas, Size size) {
    final grid = Paint()
      ..color = AppColors.line
      ..strokeWidth = 1;
    for (var i = 0; i <= 3; i++) {
      final y = size.height * i / 3;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }
    double maxV = 0.1;
    for (final s in series) {
      for (final v in s.values) {
        if (v > maxV) maxV = v;
      }
    }
    for (final s in series) {
      if (s.values.length < 2) continue;
      final p = Paint()
        ..color = s.color
        ..strokeWidth = 2
        ..style = PaintingStyle.stroke;
      final path = Path();
      for (var i = 0; i < s.values.length; i++) {
        final x = size.width * i / (s.values.length - 1);
        final y = size.height - (s.values[i] / maxV) * (size.height - 4) - 2;
        if (i == 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      }
      canvas.drawPath(path, p);
    }
  }

  @override
  bool shouldRepaint(covariant _LinePainter old) => true;
}
