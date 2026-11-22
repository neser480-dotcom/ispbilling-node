import 'package:material_ui/material_ui.dart';
import '../core/format.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import 'dart:async';
import '../core/tr.dart';
import '../services/api_service.dart';
import '../services/monitoring_api.dart';
import '../widgets/lang_builder.dart';
import '../widgets/netfee_ui.dart';
import '../widgets/letter_avatar.dart';

/// "2026-12-01T16:27:02.000Z" বা "2026-12-01 16:27:02" → "01-12-2026 10:27 PM"
/// (UTC হলে ডিভাইসের লোকাল সময়ে)
String fmtDateTime(dynamic raw) {
  final s = '${raw ?? ''}'.trim();
  if (s.isEmpty || s == 'null') return '';
  var d = DateTime.tryParse(s.contains('T') ? s : s.replaceFirst(' ', 'T'));
  if (d == null) return s;
  if (d.isUtc) d = d.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  final h12 = d.hour % 12 == 0 ? 12 : d.hour % 12;
  final ampm = d.hour >= 12 ? 'PM' : 'AM';
  return '${two(d.day)}-${two(d.month)}-${d.year} ${two(h12)}:${two(d.minute)} $ampm';
}

/// স্ক্রিনশটের মতো নীল বার: বড় টাইটেল + নিচে ছোট (হালকা) গ্রাহকের নাম
AppBar customerAppBar(String title, String name, {List<Widget>? actions}) {
  return AppBar(
    toolbarHeight: 72,
    titleSpacing: 0,
    actions: actions,
    title: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(fontSize: 26)),
        if (name.isNotEmpty)
          Text(name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 20, color: Color(0xCCFFFFFF))),
      ],
    ),
  );
}

// ───────────────────────── Profile ─────────────────────────

class CustomerProfilePage extends StatefulWidget {
  final Map<String, dynamic> summary;
  const CustomerProfilePage({super.key, required this.summary});

  @override
  State<CustomerProfilePage> createState() => _CustomerProfilePageState();
}

class _CustomerProfilePageState extends State<CustomerProfilePage> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = ApiService.customerDetail(numOf(widget.summary['id']).toInt());
  }

  Future<void> _delete(Map<String, dynamic> c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete customer?'),
        content: const Text(
            'This action may be blocked if payment history exists. '
            'Choose whether to also delete the MikroTik PPPoE secret.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Continue')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final deleteMikrotik = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('MikroTik secret'),
        content: const Text(
            'Also delete this customer PPPoE secret from MikroTik?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Keep secret')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Delete secret')),
        ],
      ),
    );
    if (deleteMikrotik == null || !mounted) return;
    try {
      await ApiService.deleteCustomer(numOf(c['id']).toInt(),
          deleteMikrotik: deleteMikrotik);
      if (mounted) Navigator.pop(context, 'deleted');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
      }
    }
  }

  String _s(Map<String, dynamic> c, List<String> keys) {
    for (final k in keys) {
      final v = '${c[k] ?? ''}'.trim();
      if (v.isNotEmpty && v != 'null') return v;
    }
    return '';
  }

  Widget _item(String label, String value, {bool bold = true}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: const TextStyle(fontSize: 18, color: Color(0xFF666666))),
          const SizedBox(height: 2),
          // মান না থাকলেও জায়গা ফাঁকা রাখা হয় (স্ক্রিনশটের Mobile/Email)
          Text(value.isEmpty ? ' ' : value,
              style: TextStyle(
                  fontSize: 28,
                  fontWeight: bold ? FontWeight.bold : FontWeight.normal,
                  color: const Color(0xFF666666))),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      return FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snap) {
          final loaded = snap.connectionState == ConnectionState.done &&
              !snap.hasError;
          final raw = loaded ? snap.data! : <String, dynamic>{};
          final c = Map<String, dynamic>.from(
              (raw['customer'] is Map ? raw['customer'] : raw) as Map);
          final name = _s(c, ['name']).isNotEmpty
              ? _s(c, ['name'])
              : '${widget.summary['name'] ?? ''}';

          Widget body;
          if (snap.connectionState != ConnectionState.done) {
            body = const Center(child: CircularProgressIndicator());
          } else if (snap.hasError) {
            body = Padding(
              padding: const EdgeInsets.all(24),
              child: Text(snap.error.toString().replaceFirst('Exception: ', '')),
            );
          } else {
            body = SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _item('Customer ID',
                      _s(c, ['customer_code', 'customer_id', 'id'])),
                  _item('Name:', name),
                  _item('Address:', _s(c, ['address'])),
                  _item('Mobile:', _s(c, ['phone', 'mobile'])),
                  _item('Email:', _s(c, ['email'])),
                  _item(
                      'Activation:',
                      fmtDateTime(_s(c, [
                        'connection_date',
                        'activation_date',
                        'created_at'
                      ]))),
                  _item('Monthly Fee:',
                      '${intl(numOf(c['monthly_bill']))} Tk.'),
                  _item('Current Balance:',
                      '${intl(numOf(c['balance']))} Tk.'),
                  _item('Status:', _s(c, ['status']).toLowerCase()),
                  _item('Payment:', _s(c, ['payment_status']).toLowerCase()),
                  _item('Bill Date:',
                      fmtDateTime(_s(c, ['billing_cycle', 'expire_date']))),
                ],
              ),
            );
          }
          return Scaffold(
            backgroundColor: Colors.white,
            appBar: customerAppBar('Profile', name, actions: [
              if (loaded)
                IconButton(
                  tooltip: 'Delete',
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => _delete(c),
                ),
            ]),
            body: body,
          );
        },
      );
    });
  }
}

// ───────────────────────── Bill Report ─────────────────────────

class CustomerBillReportPage extends StatefulWidget {
  final Map<String, dynamic> summary;
  const CustomerBillReportPage({super.key, required this.summary});

  @override
  State<CustomerBillReportPage> createState() => _CustomerBillReportPageState();
}

class _CustomerBillReportPageState extends State<CustomerBillReportPage> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = ApiService.customerDetail(numOf(widget.summary['id']).toInt());
  }

  String _s(Map<String, dynamic> c, List<String> keys) {
    for (final k in keys) {
      final v = '${c[k] ?? ''}'.trim();
      if (v.isNotEmpty && v != 'null') return v;
    }
    return '';
  }

  void _details(Map<String, dynamic> p) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('${intl(numOf(p['amount']))} Tk.'),
        content: Text([
          if (_s(p, ['month']).isNotEmpty) 'Month: ${_s(p, ['month'])}',
          if (_s(p, ['method']).isNotEmpty) 'Medium: ${_s(p, ['method'])}',
          if (_s(p, ['paid_at', 'payment_date', 'created_at', 'date'])
              .isNotEmpty)
            'Date: ${fmtDateTime(_s(p, ['paid_at', 'payment_date', 'created_at', 'date']))}',
        ].join('\n')),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('OK')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final name = '${widget.summary['name'] ?? ''}';
    return LangBuilder(builder: (_) {
      return Scaffold(
        backgroundColor: Colors.white,
        appBar: customerAppBar('Bill Report', name),
        body: FutureBuilder<Map<String, dynamic>>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snap.hasError) {
              return Padding(
                padding: const EdgeInsets.all(24),
                child:
                    Text(snap.error.toString().replaceFirst('Exception: ', '')),
              );
            }
            final raw = snap.data!;
            final c = raw['customer'] is Map ? raw['customer'] as Map : raw;
            final pays = ((c['payments'] ?? raw['payments'] ?? []) as List)
                .map((e) => mapOf(e))
                .toList();
            if (pays.isEmpty) {
              return Center(child: Text(Lang.i.t('no_data')));
            }
            return ListView.separated(
              itemCount: pays.length,
              separatorBuilder: (_, __) =>
                  const Divider(height: 1, color: AppColors.line),
              itemBuilder: (_, i) {
                final p = pays[i];
                final who = _s(p, [
                  'collected_by',
                  'received_by',
                  'collector',
                  'created_by_name',
                  'method'
                ]);
                final when = fmtDateTime(
                    _s(p, ['paid_at', 'payment_date', 'created_at', 'date']));
                return InkWell(
                  onTap: () => _details(p),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(10, 12, 4, 12),
                    child: Row(children: [
                      LetterAvatar(
                        text: 'B',
                        radius: 22,
                        color: AppColors.avatars[i % AppColors.avatars.length],
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${intl(numOf(p['amount']))} Tk.',
                                style: const TextStyle(
                                    fontSize: 26,
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.sky)),
                            if (who.isNotEmpty)
                              Text(who,
                                  style: const TextStyle(
                                      fontSize: 19, color: AppColors.text)),
                            if (when.isNotEmpty)
                              Text(when,
                                  style: const TextStyle(
                                      fontSize: 19, color: AppColors.text)),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.more_vert, color: AppColors.sky),
                        onPressed: () => _details(p),
                      ),
                    ]),
                  ),
                );
              },
            );
          },
        ),
      );
    });
  }
}

// ───────────────────────── Note ─────────────────────────

/// নতুন নোট লিখে সাবমিট করলে লেখাটা ফেরত দেয় (Navigator.pop)।
class CustomerNotePage extends StatefulWidget {
  final Map<String, dynamic> summary;
  const CustomerNotePage({super.key, required this.summary});

  @override
  State<CustomerNotePage> createState() => _CustomerNotePageState();
}

class _CustomerNotePageState extends State<CustomerNotePage> {
  final _c = TextEditingController();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.of(context).size.width;
    final side = (w * 0.19).clamp(16.0, 140.0).toDouble();
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: customerAppBar('নোট', '${widget.summary['name'] ?? ''}'),
      body: ListView(
        padding: EdgeInsets.fromLTRB(side, 52, side, 24),
        children: [
          const Text('নতুন নোট',
              style: TextStyle(fontSize: 15, color: Color(0xFF333333))),
          TextField(
            controller: _c,
            autofocus: true,
            maxLines: null,
            style: const TextStyle(fontSize: 26, color: Color(0xFF333333)),
            decoration: const InputDecoration(
              hintText: 'লিখুন',
              hintStyle: TextStyle(fontSize: 26, color: Color(0xFF666666)),
              enabledBorder: UnderlineInputBorder(
                  borderSide: BorderSide(color: Color(0xFF555555))),
            ),
          ),
          const SizedBox(height: 56),
          Center(
            child: PillButton(
              text: 'সাবমিট',
              onPressed: () => Navigator.pop(context, _c.text),
            ),
          ),
        ],
      ),
    );
  }
}

// ───────────────────────── Bandwidth ─────────────────────────

/// গ্রাহকের PPPoE ইন্টারফেসের লাইভ Tx/Rx (প্রতি ~৩ সেকেন্ডে সার্ভার থেকে নেওয়া)।
/// ইন্টারফেসের নাম MikroTik-এর ডায়নামিক নামে: `<pppoe-ইউজারনেম>`
class CustomerBandwidthPage extends StatefulWidget {
  final Map<String, dynamic> summary;
  const CustomerBandwidthPage({super.key, required this.summary});

  @override
  State<CustomerBandwidthPage> createState() => _CustomerBandwidthPageState();
}

class _CustomerBandwidthPageState extends State<CustomerBandwidthPage> {
  static const _tx = Color(0xFF38AFEF);
  static const _rx = Color(0xFFE85342);
  static const _maxPoints = 60;

  Timer? _timer;
  int? _routerId;
  String _user = '';
  String _extra = '';
  String? _error;
  bool _busy = false;
  final List<double> _txPts = [];
  final List<double> _rxPts = [];

  @override
  void initState() {
    super.initState();
    _init();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String _s(Map<String, dynamic> c, List<String> keys) {
    for (final k in keys) {
      final v = '${c[k] ?? ''}'.trim();
      if (v.isNotEmpty && v != 'null') return v;
    }
    return '';
  }

  Future<void> _init() async {
    try {
      final r = await ApiService.customerDetail(
          numOf(widget.summary['id']).toInt());
      final c = Map<String, dynamic>.from(
          (r['customer'] is Map ? r['customer'] : r) as Map);
      if (!mounted) return;
      setState(() {
        _routerId = int.tryParse(_s(c, ['mikrotik_id']));
        _user = _s(c, ['pppoe_name', 'pppoe_username']);
        _extra = _s(c, ['package_name']);
      });
      if (_routerId == null || _user.isEmpty) {
        setState(() => _error = 'PPPoE ইউজার বা রাউটার পাওয়া যায়নি');
        return;
      }
      await _tick();
      _timer = Timer.periodic(const Duration(seconds: 3), (_) => _tick());
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
      }
    }
  }

  Future<void> _tick() async {
    if (_busy || _routerId == null) return;
    _busy = true;
    try {
      final d = await MonitoringApi.bandwidth(_routerId!, '<pppoe-$_user>');
      if (!mounted) return;
      setState(() {
        _error = null;
        _txPts.add(numOf(d['downloadMbps']).toDouble());
        _rxPts.add(numOf(d['uploadMbps']).toDouble());
        if (_txPts.length > _maxPoints) _txPts.removeAt(0);
        if (_rxPts.length > _maxPoints) _rxPts.removeAt(0);
      });
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      _busy = false;
    }
  }

  Widget _box(String label, String value, Color color) {
    return Expanded(
      child: Container(
        height: 140,
        color: color,
        padding: const EdgeInsets.only(top: 14),
        child: Column(children: [
          Text(label, style: const TextStyle(fontSize: 24, color: Colors.white)),
          const SizedBox(height: 6),
          Text(value, style: const TextStyle(fontSize: 18, color: Colors.white)),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final txNow = _txPts.isEmpty ? '' : '${_txPts.last.toStringAsFixed(2)} Mbps';
    final rxNow = _rxPts.isEmpty ? '' : '${_rxPts.last.toStringAsFixed(2)} Mbps';
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: customerAppBar(
          tr('ব্যান্ডউইথ', 'BandWidth'), '${widget.summary['name'] ?? ''}'),
      body: Column(
        children: [
          const SizedBox(height: 70),
          Text(
            'Mikrotik User: ${_user.isEmpty ? '-' : _user}'
            '${_extra.isEmpty ? '' : ' ($_extra)'}',
            style: const TextStyle(fontSize: 22, color: Color(0xFF666666)),
          ),
          const SizedBox(height: 36),
          Row(children: [
            _box('Tx', txNow, _tx),
            const SizedBox(width: 4),
            _box('Rx', rxNow, _rx),
          ]),
          Expanded(
            child: _txPts.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Text(
                        _error ?? 'No chart data available.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            fontSize: 18, color: Color(0xFFE8B52A)),
                      ),
                    ),
                  )
                : Padding(
                    padding: const EdgeInsets.fromLTRB(12, 20, 16, 20),
                    child: CustomPaint(
                      size: Size.infinite,
                      painter: _LinePainter(_txPts, _rxPts, _tx, _rx),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _LinePainter extends CustomPainter {
  final List<double> a, b;
  final Color ca, cb;
  _LinePainter(this.a, this.b, this.ca, this.cb);

  @override
  void paint(Canvas canvas, Size s) {
    final all = [...a, ...b];
    var maxV = all.fold<double>(0, (m, v) => v > m ? v : m);
    if (maxV <= 0) maxV = 1;
    final grid = Paint()
      ..color = const Color(0xFFE0E0E0)
      ..strokeWidth = 1;
    for (var i = 0; i <= 4; i++) {
      final y = s.height * i / 4;
      canvas.drawLine(Offset(0, y), Offset(s.width, y), grid);
    }
    void line(List<double> pts, Color c) {
      if (pts.length < 2) return;
      final path = Path();
      for (var i = 0; i < pts.length; i++) {
        final x = s.width * i / (pts.length - 1);
        final y = s.height - (pts[i] / maxV) * s.height;
        i == 0 ? path.moveTo(x, y) : path.lineTo(x, y);
      }
      canvas.drawPath(
          path,
          Paint()
            ..color = c
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2.5);
    }

    line(a, ca);
    line(b, cb);
  }

  @override
  bool shouldRepaint(covariant _LinePainter old) => true;
}
