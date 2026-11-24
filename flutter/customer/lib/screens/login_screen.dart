import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../services/api_service.dart';
import '../widgets/page_scaffold.dart';
import 'home_shell.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _isp = TextEditingController();
  final _phone = TextEditingController(); // ইউজার (Customer ID)
  bool _needIsp = false; // সার্ভার চাইলে তবেই ISP কোড ঘর দেখাবে
  final _pass = TextEditingController();
  bool _showPass = false;
  bool _loading = false;

  @override
  void dispose() {
    _isp.dispose();
    _phone.dispose();
    _pass.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (_phone.text.trim().isEmpty || _pass.text.isEmpty) {
      _toast('ইউজার ও পাসওয়ার্ড দিন');
      return;
    }
    if (_needIsp && _isp.text.trim().isEmpty) {
      _toast('ISP কোড দিন');
      return;
    }
    setState(() => _loading = true);
    try {
      final mustChange =
          await ApiService.login(_phone.text.trim(), _pass.text, ispCode: _isp.text);
      if (!mounted) return;
      if (mustChange) {
        _toast('নিরাপত্তার জন্য প্রোফাইল থেকে পাসওয়ার্ড পরিবর্তন করুন');
      }
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const HomeShell()),
      );
    } on NeedIspCodeException {
      if (mounted) setState(() => _needIsp = true);
      _toast('আপনার ISP কোড দিন (যেমন ISP-10033)');
    } catch (e) {
      _toast(e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toast(String m) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return Scaffold(
      backgroundColor: Colors.white,
      body: Column(
        children: [
          const AppTitleBar(),
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                children: [
                  // নীল অংশ: লোগো + টাইটেল + মোবাইল ফিল্ড (নীল/সাদার সীমানায়)
                  Container(
                    width: double.infinity,
                    height: size.height * 0.52,
                    color: AppColors.loginBlue,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        const CircleAvatar(
                          radius: 32,
                          backgroundColor: Colors.white,
                          child: Icon(Icons.support_agent,
                              size: 40, color: AppColors.loginBlue),
                        ),
                        const SizedBox(height: 10),
                        const Text('আমাদের বিল গ্রাহক',
                            style: TextStyle(
                                color: Colors.white,
                                fontSize: 22,
                                fontWeight: FontWeight.w500)),
                        const SizedBox(height: 26),
                        if (_needIsp) ...[
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 24),
                          child: Container(
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(4),
                              border: const Border(
                                  bottom: BorderSide(color: AppColors.line)),
                            ),
                            child: TextField(
                              controller: _isp,
                              keyboardType: TextInputType.text,
                              textCapitalization: TextCapitalization.characters,
                              style: const TextStyle(fontSize: 17),
                              decoration: const InputDecoration(
                                hintText: 'ISP কোড (যেমন ISP-10033)',
                                border: InputBorder.none,
                                prefixIcon: Icon(Icons.business,
                                    color: AppColors.loginBlue),
                                contentPadding:
                                    EdgeInsets.symmetric(vertical: 16),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        ],
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 24),
                          child: Container(
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(4),
                              border: const Border(
                                  bottom: BorderSide(color: AppColors.line)),
                            ),
                            child: TextField(
                              controller: _phone,
                              keyboardType: TextInputType.text,
                              style: const TextStyle(fontSize: 17),
                              decoration: const InputDecoration(
                                hintText: 'মোবাইল নম্বর / ইউজার',
                                border: InputBorder.none,
                                prefixIcon: Icon(Icons.smartphone,
                                    color: AppColors.loginBlue),
                                contentPadding:
                                    EdgeInsets.symmetric(vertical: 16),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
                    child: Column(
                      children: [
                        TextField(
                          controller: _pass,
                          obscureText: !_showPass,
                          style: const TextStyle(fontSize: 17),
                          decoration: const InputDecoration(
                            hintText: 'পাসওয়ার্ড',
                            prefixIcon: Icon(Icons.lock_person_outlined,
                                color: AppColors.loginBlue),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Checkbox(
                              value: _showPass,
                              activeColor: AppColors.linkBlue,
                              onChanged: (v) =>
                                  setState(() => _showPass = v ?? false),
                            ),
                            const Text('ভিউ পাসওয়ার্ড',
                                style: TextStyle(fontSize: 17)),
                          ],
                        ),
                        const SizedBox(height: 14),
                        SizedBox(
                          width: size.width * 0.56,
                          height: 50,
                          child: ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.loginBlue,
                              foregroundColor: Colors.white,
                              elevation: 0,
                              shape: const StadiumBorder(),
                            ),
                            onPressed: _loading ? null : _login,
                            child: _loading
                                ? const SizedBox(
                                    height: 22,
                                    width: 22,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2.5, color: Colors.white))
                                : const Text('লগিন',
                                    style: TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.bold)),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
