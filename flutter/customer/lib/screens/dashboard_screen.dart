import 'dart:async';
import 'package:flutter/material.dart';
import '../main.dart' show navKey;
import '../core/api_client.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../services/api_service.dart';
import '../widgets/page_scaffold.dart';
import 'home_shell.dart';
import 'login_screen.dart';
import 'packages_screen.dart';
import 'reports_screen.dart';
import 'support_numbers_screen.dart';
import 'tickets_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  late Future<DashboardData> _future;
  Timer? _timer;
  final List<double> _upHist = [];
  final List<double> _downHist = [];
  double _up = 0, _down = 0;

  @override
  void initState() {
    super.initState();
    _future = ApiService.dashboard();
    _timer = Timer.periodic(const Duration(seconds: 3), (_) => _poll());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _poll() async {
    try {
      final s = await ApiService.liveSpeed();
      if (!mounted) return;
      setState(() {
        _up = s[0];
        _down = s[1];
        _upHist.add(_up);
        _downHist.add(_down);
        if (_upHist.length > 40) _upHist.removeAt(0);
        if (_downHist.length > 40) _downHist.removeAt(0);
      });
    } catch (_) {}
  }

  Future<void> _reload() async {
    setState(() => _future = ApiService.dashboard());
    await _future;
  }

  void _open(Widget page) =>
      Navigator.push(context, MaterialPageRoute(builder: (_) => page));

  String _fmt(double v) => double.parse(v.toStringAsFixed(2)).toString();

  /// kbps -> "56.56 kbps" / "2.30 Mbps"
  String _speed(double kbps) => kbps >= 1000
      ? '${(kbps / 1000).toStringAsFixed(2)} Mbps'
      : '${kbps.toStringAsFixed(2)} kbps';

  /// উপরে নীল ব্যানার ("Contact Bill Man.") — ৩ সেকেন্ডে নিজে সরে যায়, ✕ দিয়ে বন্ধ করা যায়
  void _showBanner(String msg) {
    final overlay = navKey.currentState?.overlay;
    if (overlay == null) return;
    late OverlayEntry entry;
    entry = OverlayEntry(builder: (_) => _TopBanner(msg, onClose: () => entry.remove()));
    overlay.insert(entry);
  }

  @override
  Widget build(BuildContext context) {
    return PageScaffold(
      title: 'Dashboard',
      actions: [
        IconButton(
          icon: const Icon(Icons.refresh, color: Colors.white),
          onPressed: _reload,
        ),
        PopupMenuButton<String>(
          icon: const Icon(Icons.more_vert, color: Colors.white),
          color: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          onSelected: (v) async {
            if (v == 'profile') {
              Navigator.pushAndRemoveUntil(
                context,
                MaterialPageRoute(
                    builder: (_) => const HomeShell(initialIndex: 0)),
                (_) => false,
              );
            } else if (v == 'logout') {
              await ApiService.logout();
              if (!mounted) return;
              Navigator.pushAndRemoveUntil(
                context,
                MaterialPageRoute(builder: (_) => const LoginScreen()),
                (_) => false,
              );
            }
          },
          itemBuilder: (_) => const [
            PopupMenuItem(
              value: 'profile',
              child: Row(children: [
                Icon(Icons.account_circle_outlined, color: Colors.black87),
                SizedBox(width: 14),
                Text('Profile', style: TextStyle(fontSize: 17)),
              ]),
            ),
            PopupMenuItem(
              value: 'logout',
              child: Row(children: [
                Icon(Icons.logout, color: Colors.black87),
                SizedBox(width: 14),
                Text('Logout', style: TextStyle(fontSize: 17)),
              ]),
            ),
          ],
        ),
      ],
      body: FutureBuilder<DashboardData>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(snap.error.toString().replaceFirst('Exception: ', '')),
                  const SizedBox(height: 12),
                  OutlinedButton(
                      onPressed: _reload, child: const Text('Retry')),
                ],
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: _reload,
            child: _content(snap.data!),
          );
        },
      ),
    );
  }

  Widget _content(DashboardData d) {
    final s = d.stats;
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        const SizedBox(height: 10),
        Text(d.ispName,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 18, color: Colors.black)),
        const SizedBox(height: 4),
        Text(d.userName,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 15, color: AppColors.grey)),
        const SizedBox(height: 8),
        _line(
          _cell('Monthly Bill:', '${d.monthlyBill.toStringAsFixed(0)} Tk.'),
          OutlinedButton(
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.linkBlue,
              side: const BorderSide(color: AppColors.linkBlue),
              shape: const StadiumBorder(),
              padding: const EdgeInsets.symmetric(horizontal: 18),
            ),
            onPressed: () => _open(const PackagesScreen()),
            child: const Text('Package', style: TextStyle(fontSize: 16)),
          ),
        ),
        _line(
          _cell('Balance:', '${d.balance.toStringAsFixed(0)} Tk.',
              color: AppColors.cyan),
          _cell('Status:', d.status,
              color: d.status == 'ACTIVE' ? AppColors.linkBlue : AppColors.red,
              end: true),
        ),
        _line(
          _cell('Due:', '${d.due.toStringAsFixed(0)} Tk.',
              color: AppColors.red),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.appBlue,
              foregroundColor: Colors.white,
              elevation: 0,
              shape: const StadiumBorder(),
              padding: const EdgeInsets.symmetric(horizontal: 18),
            ),
            onPressed: () {
              _showBanner('Contact Bill Man.');
              Navigator.pushAndRemoveUntil(
                context,
                MaterialPageRoute(builder: (_) => const HomeShell(initialIndex: 2)),
                (_) => false,
              );
            },
            child: const Text('Pay Bill', style: TextStyle(fontSize: 16)),
          ),
        ),
        _line(
          _cell('Last Date:', d.lastPaymentDate, small: true),
          Container(
            width: 50,
            height: 50,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.darkRed, width: 2),
            ),
            child: Text('${d.deadlineDay}',
                style: const TextStyle(fontSize: 17)),
          ),
        ),
        const SizedBox(height: 14),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(
            children: [
              _tile(Icons.layers_outlined, 'Reports', AppColors.tileBlue,
                  () => _open(const ReportsScreen())),
              _tile(Icons.checklist, 'Packages', AppColors.tileGreen,
                  () => _open(const PackagesScreen())),
              _tile(Icons.chat_outlined, 'Support Tickets', AppColors.tileCyan,
                  () => _open(const TicketsScreen())),
              _tile(Icons.headset_mic_outlined, 'Support Numbers',
                  AppColors.tilePink, () => _open(const SupportNumbersScreen())),
            ],
          ),
        ),
        const SizedBox(height: 10),
        const Divider(height: 1, color: AppColors.line),
        _line(
          _cell(s.lastLinkLabel, s.lastLinkUptime, small: true),
          _cell('Uptime:', s.currentUptime,
              end: true,
              plain: true,
              small: true,
              color: s.uptimeAlert ? AppColors.red : Colors.black),
        ),
        _line(
          _cell('Upload:', s.uploadText, plain: true, small: true),
          _cell('Download:', s.downloadText, end: true, plain: true, small: true),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Row(
            children: [
              _legend(AppColors.tileBlue, 'Upload: ${_speed(_up)}'),
              const SizedBox(width: 12),
              Flexible(
                  child: _legend(
                      AppColors.tilePink, 'Download: ${_speed(_down)}')),
            ],
          ),
        ),
        Container(
          height: 170,
          margin: const EdgeInsets.fromLTRB(10, 0, 10, 16),
          decoration:
              BoxDecoration(border: Border.all(color: AppColors.text)),
          child: CustomPaint(
            size: Size.infinite,
            painter: _SpeedPainter(_upHist, _downHist),
          ),
        ),
      ],
    );
  }

  Widget _line(Widget left, Widget right) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: AppColors.line)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [left, right],
        ),
      );

  Widget _cell(String label, String value,
      {Color color = Colors.black,
      bool end = false,
      bool plain = false,
      bool small = false}) {
    return Column(
      crossAxisAlignment:
          end ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 15)),
        const SizedBox(height: 2),
        Text(value,
            style: TextStyle(
              fontSize: small ? 18 : 20,
              fontWeight: plain ? FontWeight.normal : FontWeight.bold,
              color: color,
            )),
      ],
    );
  }

  Widget _tile(IconData icon, String label, Color color, VoidCallback onTap) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          height: 84,
          margin: const EdgeInsets.symmetric(horizontal: 4),
          padding: const EdgeInsets.all(8),
          color: color,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Icon(icon, color: Colors.white, size: 28),
              Text(label,
                  style: const TextStyle(color: Colors.white, fontSize: 14)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _legend(Color c, String text) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 16, height: 16, color: c),
          const SizedBox(width: 6),
          Flexible(
            child: Text(text,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 15, fontWeight: FontWeight.bold)),
          ),
        ],
      );
}

class _SpeedPainter extends CustomPainter {
  final List<double> up, down;
  _SpeedPainter(this.up, this.down);

  @override
  void paint(Canvas canvas, Size size) {
    final grid = Paint()
      ..color = const Color(0xFFE5E7EB)
      ..strokeWidth = 1;
    for (var i = 1; i < 4; i++) {
      final y = size.height * i / 4;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }
    var maxV = 1.0;
    for (final v in [...up, ...down]) {
      if (v > maxV) maxV = v;
    }
    _draw(canvas, size, up, maxV, AppColors.tileBlue);
    _draw(canvas, size, down, maxV, AppColors.tilePink);
  }

  void _draw(Canvas canvas, Size size, List<double> data, double maxV, Color c) {
    if (data.length < 2) return;
    final path = Path();
    for (var i = 0; i < data.length; i++) {
      final x = size.width * i / (data.length - 1);
      final y = size.height - (data[i] / maxV) * (size.height - 12) - 6;
      i == 0 ? path.moveTo(x, y) : path.lineTo(x, y);
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = c
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
  }

  @override
  bool shouldRepaint(covariant _SpeedPainter old) => true;
}

class _TopBanner extends StatefulWidget {
  final String message;
  final VoidCallback onClose;
  const _TopBanner(this.message, {required this.onClose});

  @override
  State<_TopBanner> createState() => _TopBannerState();
}

class _TopBannerState extends State<_TopBanner> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(seconds: 3))
        ..forward().whenComplete(() {
          if (mounted) widget.onClose();
        });

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: Material(
        elevation: 6,
        color: const Color(0xFF3498DB),
        child: SafeArea(
          bottom: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 8, 14),
                child: Row(
                  children: [
                    const Icon(Icons.info, color: Colors.white),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(widget.message,
                          style: const TextStyle(color: Colors.white, fontSize: 20)),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, color: Colors.white70),
                      onPressed: widget.onClose,
                    ),
                  ],
                ),
              ),
              AnimatedBuilder(
                animation: _c,
                builder: (_, __) => Align(
                  alignment: Alignment.centerLeft,
                  child: FractionallySizedBox(
                    widthFactor: 1 - _c.value,
                    child: Container(height: 4, color: Colors.white54),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
