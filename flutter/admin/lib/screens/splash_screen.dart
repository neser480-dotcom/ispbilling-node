import 'dart:async';
import 'package:material_ui/material_ui.dart';
import '../core/api_client.dart';
import 'dashboard_screen.dart';

/// লগইন করা থাকলে অ্যাপ খুললে প্রথমে এই পেজ: কোম্পানির নাম + লোগো + ঘুরন্ত চাকা,
/// তারপর ড্যাশবোর্ড। কোম্পানির নাম প্রোফাইল থেকে (না থাকলে সার্ভার থেকে একবার এনে সেভ করে)।
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  static const _bg = Color(0xFF5BBBF2);
  static const _text = Color(0xFF3F7DA3);

  String _company = '';

  @override
  void initState() {
    super.initState();
    _start();
  }

  static String companyOf(Map<String, dynamic>? p) {
    if (p == null) return '';
    for (final k in const [
      'company_name',
      'company_title',
      'organization_name',
      'isp_name',
    ]) {
      final v = '${p[k] ?? ''}'.trim();
      if (v.isNotEmpty && v != 'null') return v;
    }
    final c = p['company'];
    if (c is Map) {
      for (final k in const ['name', 'company_name', 'title']) {
        final v = '${c[k] ?? ''}'.trim();
        if (v.isNotEmpty && v != 'null') return v;
      }
    } else if (c != null && '$c'.trim().isNotEmpty) {
      return '$c'.trim();
    }
    return '';
  }

  Future<void> _start() async {
    final started = DateTime.now();
    var profile = await ApiClient.getProfile();
    var name = companyOf(profile);
    if (mounted && name.isNotEmpty) setState(() => _company = name);

    if (name.isEmpty) {
      // নাম সেভ করা নেই — সার্ভার থেকে একবার (সর্বোচ্চ ৪ সেকেন্ড) আনা
      try {
        final r = await ApiClient.dio
            .get('/auth/admin/me')
            .timeout(const Duration(seconds: 4));
        final data = Map<String, dynamic>.from(r.data as Map);
        final fresh = data['user'] is Map
            ? Map<String, dynamic>.from(data['user'] as Map)
            : data;
        name = companyOf(fresh);
        if (name.isNotEmpty) {
          await ApiClient.saveProfile({...?profile, ...fresh});
          if (mounted) setState(() => _company = name);
        }
      } catch (_) {}
    }

    // কমপক্ষে ~১.৫ সেকেন্ড নাম দেখানো
    final wait = const Duration(milliseconds: 1500) -
        DateTime.now().difference(started);
    if (!wait.isNegative) await Future<void>.delayed(wait);
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      PageRouteBuilder<void>(
        pageBuilder: (_, __, ___) => const DashboardScreen(),
        transitionsBuilder: (_, a, __, child) =>
            FadeTransition(opacity: a, child: child),
        transitionDuration: const Duration(milliseconds: 250),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      body: SizedBox.expand(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const _Logo(size: 116),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: SizedBox(
                height: 48,
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    _company,
                    maxLines: 1,
                    style: const TextStyle(
                      fontSize: 30,
                      fontWeight: FontWeight.bold,
                      color: _text,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 40),
            const SizedBox(
              width: 46,
              height: 46,
              child: CircularProgressIndicator(
                strokeWidth: 3,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// সাদা গোল ব্যাকগ্রাউন্ডে নীল বাঁকা ব্যান্ড (স্ক্রিনশটের লোগোর কাছাকাছি)
class _Logo extends StatelessWidget {
  final double size;
  const _Logo({required this.size});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _LogoPainter()),
    );
  }
}

class _LogoPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size s) {
    final c = Offset(s.width / 2, s.height / 2);
    canvas.drawCircle(c, s.width / 2, Paint()..color = Colors.white);

    void band(double cx, double r, double sweepStart, double sweep, double w,
        Color color) {
      final p = Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = w;
      canvas.drawArc(
        Rect.fromCircle(center: Offset(s.width * cx, s.height * 0.5), radius: r),
        sweepStart,
        sweep,
        false,
        p,
      );
    }

    const light = Color(0xFF8CCDF6);
    const dark = Color(0xFF42A5E4);
    // বড় হালকা ব্যান্ড (ডানে), গাঢ় ব্যান্ড (নিচে-ডানে), বাঁয়ে ছোট ব্যান্ড
    band(0.18, s.width * 0.42, -0.95, 1.9, s.width * 0.13, light);
    band(0.12, s.width * 0.42, 0.05, 1.0, s.width * 0.12, dark);
    band(0.78, s.width * 0.20, 2.2, 1.6, s.width * 0.09, dark);
    band(0.78, s.width * 0.20, 3.8, 0.9, s.width * 0.09, light);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}
