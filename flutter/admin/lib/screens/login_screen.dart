import 'package:material_ui/material_ui.dart';
import '../core/lang.dart';
import '../core/api_client.dart';
import '../core/theme.dart';
import '../services/api_service.dart';
import '../widgets/lang_builder.dart';
import 'dashboard_screen.dart';
import 'registration_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController();
  final _pass = TextEditingController();
  bool _showPass = false;
  bool _loading = false;
  bool _rememberMe = false;

  @override
  void initState() {
    super.initState();
    _loadRememberMe();
  }

  Future<void> _loadRememberMe() async {
    final enabled = await ApiClient.getRememberMe();
    final username = await ApiClient.getRememberedUsername();
    if (!mounted) return;
    setState(() {
      _rememberMe = enabled;
      if (enabled && username != null) _phone.text = username;
    });
  }

  @override
  void dispose() {
    _phone.dispose();
    _pass.dispose();
    super.dispose();
  }

  void _toast(String m) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> _login() async {
    if (_loading) return;
    if (_phone.text.trim().isEmpty || _pass.text.isEmpty) {
      _toast(Lang.i.t('fill_all'));
      return;
    }

    setState(() => _loading = true);
    try {
      await ApiService.login(_phone.text.trim(), _pass.text);
      await ApiClient.saveRememberMe(_rememberMe, _phone.text.trim());

      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const DashboardScreen()),
      );
    } catch (e) {
      if (mounted) {
        _toast(e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  InputDecoration _dec(IconData icon) => InputDecoration(
        prefixIcon: Icon(icon, color: AppColors.sky, size: 34),
        enabledBorder: const UnderlineInputBorder(
            borderSide: BorderSide(color: AppColors.sky)),
        focusedBorder: const UnderlineInputBorder(
            borderSide: BorderSide(color: AppColors.sky, width: 2)),
      );

  Widget _check(String label, bool value, ValueChanged<bool?> onChanged) => Row(
        children: [
          Checkbox(
            value: value,
            onChanged: onChanged,
            activeColor: AppColors.sky,
            side: const BorderSide(color: AppColors.sky, width: 2),
          ),
          Text(label,
              style: const TextStyle(fontSize: 18, color: AppColors.sky)),
        ],
      );

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      return Scaffold(
        backgroundColor: Colors.white,
        body: SingleChildScrollView(
          child: Column(
            children: [
              SizedBox(
                height: 340,
                width: double.infinity,
                child: Stack(
                  children: [
                    Positioned.fill(
                        child: CustomPaint(painter: _WavePainter())),
                    Positioned(
                      left: 0,
                      right: 0,
                      top: 76,
                      child: Column(
                        children: [
                          // নিজের লোগো দিতে এখানে Image.asset ব্যবহার করুন
                          Container(
                            width: 68,
                            height: 68,
                            decoration: const BoxDecoration(
                                color: Colors.white, shape: BoxShape.circle),
                            child: const Icon(Icons.wifi_tethering,
                                color: AppColors.sky, size: 40),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                              '\u0986\u09AE\u09BE\u09A6\u09C7\u09B0 \u09AC\u09BF\u09B2',
                              style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 38,
                                  fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                    Positioned(
                      right: 10,
                      top: 248,
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: const BorderSide(color: Colors.white),
                          shape: const StadiumBorder(),
                          padding: const EdgeInsets.symmetric(horizontal: 24),
                        ),
                        onPressed: l.toggle,
                        child: Text(l.toggleLabel,
                            style: const TextStyle(fontSize: 18)),
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 54),
                child: Column(
                  children: [
                    TextField(
                      controller: _phone,
                      keyboardType: TextInputType.text,
                      autocorrect: false,
                      style: const TextStyle(fontSize: 20),
                      decoration: _dec(Icons.account_circle),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _pass,
                      obscureText: !_showPass,
                      style: const TextStyle(fontSize: 20),
                      decoration: _dec(Icons.person_pin),
                    ),
                    const SizedBox(height: 14),
                    _check('Remember Me', _rememberMe,
                        (v) => setState(() => _rememberMe = v ?? false)),
                    _check(l.t('view_pw'), _showPass,
                        (v) => setState(() => _showPass = v ?? false)),
                    const SizedBox(height: 22),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.sky,
                        foregroundColor: Colors.white,
                        elevation: 4,
                        fixedSize: const Size(140, 42),
                        shape: const StadiumBorder(),
                      ),
                      onPressed: _loading ? null : _login,
                      child: _loading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2.5, color: Colors.white))
                          : Text(l.t('login'),
                              style: const TextStyle(
                                  fontSize: 18, letterSpacing: 1.2)),
                    ),
                    const SizedBox(height: 22),
                    Text(l.t('new_acc'),
                        style: const TextStyle(
                            fontSize: 17, color: AppColors.muted)),
                    const SizedBox(height: 10),
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.sky,
                        side: const BorderSide(color: AppColors.sky),
                        fixedSize: const Size(150, 42),
                        shape: const StadiumBorder(),
                      ),
                      onPressed: _loading
                          ? null
                          : () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => const RegistrationScreen(),
                                ),
                              );
                            },
                      child: Text(l.t('register'),
                          style: const TextStyle(fontSize: 17)),
                    ),
                    const SizedBox(height: 30),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    });
  }
}

class _WavePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final light = Path()
      ..moveTo(0, 0)
      ..lineTo(w, 0)
      ..lineTo(w, h * 0.99)
      ..cubicTo(w * 0.6, h * 0.93, w * 0.3, h * 0.72, 0, h * 0.87)
      ..close();
    canvas.drawPath(light, Paint()..color = AppColors.skyLight);
    final main = Path()
      ..moveTo(0, 0)
      ..lineTo(w, 0)
      ..lineTo(w, h * 0.88)
      ..cubicTo(w * 0.6, h * 0.90, w * 0.28, h * 0.66, 0, h * 0.86)
      ..close();
    canvas.drawPath(main, Paint()..color = AppColors.sky);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
