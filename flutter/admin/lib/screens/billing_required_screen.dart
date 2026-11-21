import 'package:material_ui/material_ui.dart';
import '../core/format.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../services/api_service.dart';
import '../widgets/lang_builder.dart';
import 'login_screen.dart';

/// Backend ৪০২ (BILLING_REQUIRED) দিলে দেখায়: Software Bill অপরিশোধিত।
/// পরিশোধ হয় Web প্যানেলের Software Billing পেজ থেকে; এখানে শুধু অবস্থা যাচাই ও লগআউট।
class BillingRequiredScreen extends StatefulWidget {
  final Map<String, dynamic> info;
  const BillingRequiredScreen({super.key, required this.info});

  @override
  State<BillingRequiredScreen> createState() => _BillingRequiredScreenState();
}

class _BillingRequiredScreenState extends State<BillingRequiredScreen> {
  late Map<String, dynamic> _info;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _info = widget.info;
  }

  void _toast(String m) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> _check() async {
    setState(() => _busy = true);
    try {
      final s = await ApiService.billingStatus();
      if (!mounted) return;
      if (s['required'] != true) {
        Navigator.of(context).pop();
        return;
      }
      final b = mapOf(s['billing']);
      setState(() {
        _info = {
          'amount': b['amount'] ?? _info['amount'],
          'due_date': b['due_date'] ?? _info['due_date'],
        };
      });
      _toast(Lang.i.t('still_unpaid'));
    } catch (e) {
      if (mounted) _toast(e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _logout() async {
    await ApiService.logout();
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      final amount = numOf(_info['amount']);
      final due = dateOnly(_info['due_date']);
      return Scaffold(
        appBar: AppBar(
          automaticallyImplyLeading: false,
          title: Text(l.t('sa_billing'), style: const TextStyle(fontSize: 22)),
        ),
        body: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.lock_outline, size: 72, color: AppColors.orange),
                const SizedBox(height: 16),
                Text(l.t('billing_required_title'),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        color: AppColors.text)),
                const SizedBox(height: 12),
                Text(l.t('billing_required_msg'),
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 16, color: AppColors.muted)),
                if (amount > 0) ...[
                  const SizedBox(height: 18),
                  Text('${l.t('billing_amount')}: ${taka(amount)}',
                      style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: AppColors.navy)),
                ],
                if (due.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text('${l.t('due_date')}: $due',
                      style: const TextStyle(fontSize: 16, color: AppColors.text)),
                ],
                const SizedBox(height: 26),
                FilledButton(
                  onPressed: _busy ? null : _check,
                  child: _busy
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(l.t('check_again')),
                ),
                const SizedBox(height: 10),
                OutlinedButton(
                  onPressed: _busy ? null : _logout,
                  child: Text(l.t('logout')),
                ),
              ],
            ),
          ),
        ),
      );
    });
  }
}
