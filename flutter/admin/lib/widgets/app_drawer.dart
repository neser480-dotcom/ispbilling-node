import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../core/api_client.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../screens/login_screen.dart';
import '../screens/router.dart';
import 'lang_builder.dart';

class _Entry {
  final String key;
  final String label;
  final IconData icon;
  const _Entry(this.key, this.label, this.icon);
}

class _MenuGroup {
  final String label;
  final IconData icon;
  final List<_Entry> children;
  const _MenuGroup(this.label, this.icon, this.children);
}

class AppDrawer extends StatelessWidget {
  final String current;
  const AppDrawer({super.key, required this.current});

  static const _items = [
    _Entry('dashboard', 'Dashboard', Icons.grid_view_rounded),
    _Entry('area', 'Area', Icons.location_on_outlined),
    _Entry('package', 'Package', Icons.inventory_2_outlined),
    _Entry('customer', 'Customer', Icons.groups),
    _Entry('manager', 'Manager', Icons.account_circle),
    _Entry('collector', 'Collector', Icons.directions_walk),
    _Entry('reseller', 'Reseller', Icons.hub_outlined),
    _Entry('deposit', 'Deposit', Icons.savings_outlined),
    _Entry('report', 'Report', Icons.bar_chart),
    _Entry('expenditure', 'Expenditure', Icons.style),
    _Entry('message', 'Message', Icons.sms_outlined),
    _Entry('netfee_bill', 'Netfee Bill', Icons.receipt_long_outlined),
    _Entry('last_bill', 'Last Bill', Icons.receipt_long_outlined),
  ];

  static const _superAdminGroups = [
    _MenuGroup('Companies / Users', Icons.business, [
      _Entry('sa_users', 'Users', Icons.people),
      _Entry('sa_permissions', 'Permissions', Icons.admin_panel_settings),
    ]),
    _MenuGroup('Software Billing', Icons.credit_card, [
      _Entry('sa_registration_invoices', 'Registration Invoices',
          Icons.receipt_long),
      _Entry('sa_billing', 'Pay Now', Icons.payments),
      _Entry('sa_manual_payment', 'Manual Payment', Icons.handshake),
      _Entry('sa_pricing', 'Negotiated Pricing', Icons.price_change_outlined),
      _Entry('sa_billing_extend', 'Extend Due Date', Icons.event_available),
    ]),
    _MenuGroup('Notice Board', Icons.campaign, [
      _Entry('sa_notices', 'All Notices', Icons.list_alt),
      _Entry('sa_notice_add', 'New Notice', Icons.add),
    ]),
    _MenuGroup('Software Updates', Icons.sync, [
      _Entry('sa_updates', 'Updates', Icons.system_update_alt),
      _Entry('sa_upgrade', 'Upgrade', Icons.upgrade),
    ]),
    _MenuGroup('Support / Problems', Icons.support_agent, [
      _Entry('isp_support', 'ISP Support', Icons.headset_mic),
      _Entry('support_tickets', 'Support Tickets', Icons.confirmation_number),
    ]),
    _MenuGroup('Network', Icons.lan, [
      _Entry('mikrotik', 'MikroTik', Icons.router),
      _Entry('olt', 'OLT List', Icons.dns),
      _Entry('onu', 'ONU List', Icons.account_tree),
      _Entry('interface_monitor', 'Interface Monitor', Icons.monitor),
      _Entry('live_fault', 'Live Fault', Icons.warning_amber),
    ]),
  ];

  void _go(BuildContext context, String key) {
    Navigator.pop(context);
    if (key == current) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => screenFor(key)),
    );
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

  Widget _tile(
    IconData icon,
    String label,
    VoidCallback onTap, {
    bool selected = false,
    bool nested = false,
  }) {
    return InkWell(
      onTap: onTap,
      child: Container(
        height: 50,
        padding: EdgeInsets.only(left: nested ? 48 : 16, right: 16),
        decoration: BoxDecoration(
          color: selected ? AppColors.sky.withValues(alpha: 0.10) : null,
          border: const Border(
            bottom: BorderSide(color: AppColors.line),
          ),
        ),
        child: Row(
          children: [
            Icon(icon, color: AppColors.sky, size: nested ? 22 : 28),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: nested ? 15 : 18,
                  fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
                  color: const Color(0xFF444444),
                ),
              ),
            ),
            if (selected)
              const Icon(Icons.chevron_right, color: AppColors.sky, size: 24),
          ],
        ),
      ),
    );
  }

  Widget _group(BuildContext context, _MenuGroup group) {
    final isActive = group.children.any((e) => e.key == current);
    return Theme(
      data: Theme.of(context).copyWith(
        dividerColor: AppColors.line,
        splashColor: AppColors.sky.withValues(alpha: 0.08),
        highlightColor: AppColors.sky.withValues(alpha: 0.04),
      ),
      child: ExpansionTile(
        key: PageStorageKey<String>('super_admin_${group.label}'),
        initiallyExpanded: isActive,
        tilePadding: const EdgeInsets.symmetric(horizontal: 16),
        childrenPadding: EdgeInsets.zero,
        leading: Icon(group.icon, color: AppColors.sky, size: 28),
        title: Text(
          group.label,
          style: const TextStyle(fontSize: 17, color: Color(0xFF444444)),
        ),
        iconColor: AppColors.sky,
        collapsedIconColor: const Color(0xFF666680),
        children: [
          for (final e in group.children)
            _tile(
              e.icon,
              e.label,
              () => _go(context, e.key),
              selected: current == e.key,
              nested: true,
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      return Drawer(
        width: 290,
        backgroundColor: Colors.white,
        shape: const RoundedRectangleBorder(),
        child: Column(
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(
                16,
                MediaQuery.of(context).padding.top + 14,
                16,
                6,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  FutureBuilder<Map<String, dynamic>?>(
                    future: ApiClient.getProfile(),
                    builder: (context, snapshot) {
                      final profile = snapshot.data ?? {};
                      final name =
                          '${profile['fullname'] ?? profile['name'] ?? l.t('admin')}';
                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          const Icon(
                            Icons.account_circle_outlined,
                            size: 56,
                            color: AppColors.navy,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              name,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 15,
                                color: AppColors.text,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      );
                    },
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
                      child: Text(
                        l.toggleLabel,
                        style: const TextStyle(fontSize: 18),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    l.t('menu_title'),
                    style: const TextStyle(
                      fontSize: 21,
                      fontWeight: FontWeight.bold,
                      color: AppColors.text,
                    ),
                  ),
                  const Text(
                    'Version(4.0)',
                    style: TextStyle(fontSize: 13, color: AppColors.text),
                  ),
                  const SizedBox(height: 8),
                ],
              ),
            ),
            Expanded(
              child: FutureBuilder<Map<String, dynamic>?>(
                future: ApiClient.getProfile(),
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }

                  final role = '${snapshot.data?['role'] ?? ''}'
                      .trim()
                      .toLowerCase()
                      .replaceAll(RegExp(r'[\s_-]+'), '');
                  final isSuperAdmin = role == 'superadmin';

                  return ListView(
                    padding: EdgeInsets.zero,
                    children: [
                      if (isSuperAdmin) ...[
                        _tile(
                          Icons.home_outlined,
                          'Dashboard',
                          () => _go(context, 'dashboard'),
                          selected: current == 'dashboard',
                        ),
                        for (final group in _superAdminGroups)
                          _group(context, group),
                        _tile(
                          Icons.menu_book,
                          'Tutorial',
                          () => _go(context, 'tutorial'),
                          selected: current == 'tutorial',
                        ),
                      ] else ...[
                        for (final e in _items)
                          _tile(
                            e.icon,
                            l.t(e.key),
                            () => _go(context, e.key),
                            selected: current == e.key,
                          ),
                      ],
                      _tile(
                        Icons.power_settings_new,
                        l.t('logout'),
                        () => _logout(context),
                      ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      );
    });
  }
}
