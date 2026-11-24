import 'dart:async';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../services/api_service.dart';
import '../widgets/page_scaffold.dart';

/// অনলাইনে বিল পেমেন্ট: bKash / Nagad / SSLCommerz / ShurjoPay।
/// টাকার পরিমাণ সার্ভার ঠিক করে; পেমেন্ট ব্রাউজারে হয়, ফলাফল সার্ভার যাচাই করে জানায়।
class PayScreen extends StatefulWidget {
  final PayOptions options;
  const PayScreen({super.key, required this.options});

  @override
  State<PayScreen> createState() => _PayScreenState();
}

class _PayScreenState extends State<PayScreen> with WidgetsBindingObserver {
  static const _months = [1, 2, 3, 6, 12];
  static const _colors = {
    'bkash': Color(0xFFE2136E),
    'nagad': Color(0xFFED3A2B),
    'sslcommerz': Color(0xFF1B75BB),
    'shurjopay': Color(0xFF2E7D32),
    'rocket': Color(0xFF8E24AA),
    'dbbl': Color(0xFF00695C),
  };

  late double _amount = widget.options.amount;
  int _month = 1;
  bool _busy = false;
  String? _txn; // পেমেন্ট শুরু হলে
  String _info = '';
  bool? _paid; // null = চলছে
  Timer? _timer;
  int _polls = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _txn != null && _paid == null) {
      _check();
    }
  }

  void _toast(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  Future<void> _changeMonth(int m) async {
    setState(() => _month = m);
    try {
      final a = await ApiService.payQuote(months: m);
      if (mounted) setState(() => _amount = a);
    } catch (e) {
      _toast(e.toString().replaceFirst('Exception: ', ''));
    }
  }

  Future<void> _pay(PayGateway g) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final s = await ApiService.payCreate(g.key, months: _month);
      if (s.redirectUrl.isEmpty) throw Exception('পেমেন্ট লিংক পাওয়া যায়নি');
      final ok = await launchUrl(Uri.parse(s.redirectUrl),
          mode: LaunchMode.externalApplication);
      if (!ok) throw Exception('ব্রাউজার খোলা যায়নি');
      if (!mounted) return;
      setState(() {
        _txn = s.transactionId;
        _info = 'পেমেন্ট সম্পন্ন করে অ্যাপে ফিরে আসুন…';
        _polls = 0;
      });
      _timer?.cancel();
      _timer = Timer.periodic(const Duration(seconds: 4), (_) => _check());
    } catch (e) {
      _toast(e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _check() async {
    final id = _txn;
    if (id == null || _paid != null) return;
    _polls++;
    try {
      final s = await ApiService.payStatus(id);
      if (!mounted) return;
      if (s.paid) {
        _timer?.cancel();
        setState(() => _paid = true);
      } else if (s.isFinal) {
        _timer?.cancel();
        setState(() {
          _paid = false;
          _info = s.status == 'needs_review'
              ? 'পেমেন্ট যাচাই হচ্ছে। টাকা কেটে থাকলে ISP-র সাথে যোগাযোগ করুন।'
              : 'পেমেন্ট সম্পন্ন হয়নি।';
        });
      } else if (_polls > 75) {
        _timer?.cancel();
        setState(() {
          _paid = false;
          _info = 'পেমেন্টের ফল পাওয়া যায়নি। টাকা কেটে থাকলে কিছুক্ষণ পরে ড্যাশবোর্ড রিফ্রেশ করুন।';
        });
      }
    } catch (_) {
      /* নেটওয়ার্ক সমস্যা: পরের চেষ্টায় আবার */
    }
  }

  @override
  Widget build(BuildContext context) {
    return PageScaffold(
      title: 'Pay Bill',
      body: _txn == null ? _form() : _progress(),
    );
  }

  Widget _form() {
    final o = widget.options;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.line),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('পরিশোধযোগ্য', style: TextStyle(fontSize: 15)),
              const SizedBox(height: 4),
              Text('${_amount.toStringAsFixed(0)} Tk.',
                  style: const TextStyle(
                      fontSize: 28, fontWeight: FontWeight.bold)),
              if (o.due > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text('বকেয়া: ${o.due.toStringAsFixed(0)} Tk.',
                      style: const TextStyle(color: AppColors.red)),
                ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Text('কত মাসের বিল:', style: TextStyle(fontSize: 15)),
                  const SizedBox(width: 12),
                  DropdownButton<int>(
                    value: _month,
                    items: [
                      for (final m in _months)
                        DropdownMenuItem(value: m, child: Text('$m মাস')),
                    ],
                    onChanged: _busy ? null : (v) => _changeMonth(v ?? 1),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        const Text('পেমেন্ট মাধ্যম',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        for (final g in o.gateways)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Material(
              color: Colors.white,
              child: InkWell(
                onTap: _busy ? null : () => _pay(g),
                child: Container(
                  height: 58,
                  decoration: BoxDecoration(
                    border: Border.all(color: AppColors.line),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 8,
                        color: _colors[g.key] ?? AppColors.loginBlue,
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Text(g.label,
                            style: const TextStyle(fontSize: 18)),
                      ),
                      if (_busy)
                        const Padding(
                          padding: EdgeInsets.only(right: 14),
                          child: SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2)),
                        )
                      else
                        const Padding(
                          padding: EdgeInsets.only(right: 12),
                          child: Icon(Icons.chevron_right, color: AppColors.grey),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _progress() {
    final done = _paid != null;
    final ok = _paid == true;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!done) const CircularProgressIndicator(),
            if (done)
              Icon(ok ? Icons.check_circle : Icons.error_outline,
                  size: 72, color: ok ? AppColors.green : AppColors.red),
            const SizedBox(height: 18),
            Text(
              ok ? 'পেমেন্ট সফল হয়েছে' : _info,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 18),
            ),
            const SizedBox(height: 22),
            if (!done)
              OutlinedButton(
                onPressed: _check,
                child: const Text('পেমেন্ট করেছি, যাচাই করুন'),
              ),
            if (done)
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.loginBlue,
                  foregroundColor: Colors.white,
                  shape: const StadiumBorder(),
                  minimumSize: const Size(160, 46),
                ),
                onPressed: () => Navigator.pop(context, ok),
                child: const Text('ঠিক আছে'),
              ),
          ],
        ),
      ),
    );
  }
}
