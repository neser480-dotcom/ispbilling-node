import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../screens/login_screen.dart';
import '../screens/router.dart';
import 'lang_builder.dart';

class _Entry {
  final String key;
  final IconData icon;
  final bool chevron;
  const _Entry(this.key, this.icon, this.chevron);
}

class AppDrawer extends StatelessWidget {
  final String current;
  const AppDrawer({super.key, required this.current});

  static const _items = [
    _Entry('dashboard', Icons.grid_view_rounded, false),
    _Entry('area', Icons.location_on_outlined, false),
    _Entry('package', Icons.inventory_2_outlined, false),
    _Entry('customer', Icons.groups, true),
    _Entry('manager', Icons.account_circle, false),
    _Entry('collector', Icons.directions_walk, false),
    _Entry('reseller', Icons.hub_outlined, false),
    _Entry('deposit', Icons.savings_outlined, false),
    _Entry('report', Icons.bar_chart, true),
    _Entry('expenditure', Icons.style, true),
    _Entry('message', Icons.sms_outlined, true),
    _Entry('netfee_bill', Icons.receipt_long_outlined, false),
    _Entry('last_bill', Icons.receipt_long_outlined, false),
  ];

  void _go(BuildContext context, String key) {
    Navigator.pop(context);
    if (key == current) return;
    Navigator.pushReplacement(
        context, MaterialPageRoute(builder: (_) => screenFor(key)));
  }

  Future<void> _logout(BuildContext context) async {
    await ApiService.logout();
    if (!context.mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  Widget _tile(IconData icon, String label, bool chevron, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Container(
        height: 50,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: AppColors.line)),
        ),
        child: Row(
          children: [
            Icon(icon, color: AppColors.sky, size: 28),
            const SizedBox(width: 14),
            Expanded(
              child: Text(label,
                  style: const TextStyle(fontSize: 18, color: Color(0xFF444444))),
            ),
            if (chevron)
              const Icon(Icons.chevron_right, color: Color(0xFF666680), size: 28),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      return Drawer(
        width: 270,
        backgroundColor: Colors.white,
        shape: const RoundedRectangleBorder(),
        child: Column(
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(
                  16, MediaQuery.of(context).padding.top + 14, 16, 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      const Icon(Icons.account_circle_outlined,
                          size: 56, color: AppColors.navy),
                      const SizedBox(width: 8),
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(l.t('admin'),
                            style: const TextStyle(
                                fontSize: 14, color: AppColors.text)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Align(
                    alignment: Alignment.centerRight,
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.navy,
                        side: const BorderSide(color: AppColors.sky),
                        shape: const StadiumBorder(),
                        padding: const EdgeInsets.symmetric(horizontal: 22),
                      ),
                      onPressed: l.toggle,
                      child: Text(l.toggleLabel,
                          style: const TextStyle(fontSize: 18)),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(l.t('menu_title'),
                      style: const TextStyle(
                          fontSize: 21, fontWeight: FontWeight.bold, color: AppColors.text)),
                  const Text('Version(4.0)',
                      style: TextStyle(fontSize: 13, color: AppColors.text)),
                  const SizedBox(height: 8),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  for (final e in _items)
                    _tile(e.icon, l.t(e.key), e.chevron, () => _go(context, e.key)),
                  _tile(Icons.power_settings_new, l.t('logout'), false,
                      () => _logout(context)),
                ],
              ),
            ),
          ],
        ),
      );
    });
  }
}
