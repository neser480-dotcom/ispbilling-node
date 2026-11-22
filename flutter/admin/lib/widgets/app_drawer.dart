import 'package:material_ui/material_ui.dart';
import '../services/api_service.dart';
import '../core/api_client.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../core/tr.dart';
import '../screens/login_screen.dart';
import '../screens/router.dart';
import 'lang_builder.dart';
import 'netfee_ui.dart';

class _Entry {
  final String key;
  final String label;
  final IconData icon;
  final String? bn; // বাংলা লেবেল (lang.dart-এ key না থাকলে)
  const _Entry(this.key, this.label, this.icon, [this.bn]);
}

class _MenuGroup {
  final String label;
  final IconData icon;
  final List<_Entry> children;
  final String? bn;
  final bool triangle; // Netfee স্টাইল: সাব-আইটেমে নীল ▶
  const _MenuGroup(this.label, this.icon, this.children,
      {this.bn, this.triangle = false});
}

class AppDrawer extends StatefulWidget {
  final String current;
  const AppDrawer({super.key, required this.current});

  @override
  State<AppDrawer> createState() => _AppDrawerState();
}

class _AppDrawerState extends State<AppDrawer> {
  String get current => widget.current;

  /// এখন যে ড্রপডাউন খোলা (একসাথে একটাই খোলা থাকে)।
  String? _open;

  @override
  void initState() {
    super.initState();
    for (final n in _adminMenu) {
      if (n is _MenuGroup && n.children.any((e) => e.key == current)) {
        _open = n.label;
      }
    }
  }

  /// সাধারণ Admin মেনু: Netfee স্ক্রিনশটের ক্রম + নতুন OLT / MikroTik / Monitoring ড্রপডাউন।
  static const List<Object> _adminMenu = [
    _Entry('dashboard', 'Dashboard', Icons.grid_view_rounded),
    _Entry('area', 'Area', Icons.location_on_outlined),
    _Entry('package', 'Package', Icons.inventory_2_outlined),
    _MenuGroup('Customer(PPPoE)', Icons.groups, [
      _Entry('customer', 'PPPoE', Icons.groups, 'PPPoE'),
      _Entry('active_pppoe', 'Active PPPoE', Icons.play_arrow,
          'অ্যাক্টিভ PPPoE'),
      _Entry('bulk_recharge', 'Bulk Recharge',
          Icons.library_add_check_outlined, 'বাল্ক রিচার্জ'),
    ], bn: 'গ্রাহক (PPPoE)', triangle: true),
    _Entry('manager', 'Manager', Icons.account_circle),
    _Entry('collector', 'Collector', Icons.directions_walk),
    _Entry('reseller', 'Reseller', Icons.hub_outlined),
    _Entry('employee', 'Employee', Icons.badge_outlined),
    _Entry('deposit', 'Deposit', Icons.savings_outlined),
    _MenuGroup('Report', Icons.bar_chart, [
      _Entry('report', 'Bill Report', Icons.play_arrow, 'বিল রিপোর্ট'),
      _Entry('deposit_report', 'Deposit Report', Icons.play_arrow,
          'ডিপোজিট রিপোর্ট'),
    ], bn: 'রিপোর্ট', triangle: true),
    _MenuGroup('Expenditure', Icons.style, [
      _Entry('purpose', 'Purpose', Icons.play_arrow, 'খাত'),
      _Entry('expenditure', 'Expenditure Report', Icons.play_arrow,
          'খরচ রিপোর্ট'),
    ], bn: 'খরচ', triangle: true),
    _MenuGroup('Message', Icons.sms_outlined, [
      _Entry('message_accounts', 'Accounts', Icons.play_arrow, 'অ্যাকাউন্টস'),
      _Entry('message_log', 'Message Log', Icons.play_arrow, 'মেসেজ লগ'),
    ], bn: 'মেসেজ', triangle: true),
    _MenuGroup('OLT', Icons.dns, [
      _Entry('olt', 'OLT List', Icons.play_arrow, 'OLT তালিকা'),
      _Entry('onu', 'ONU List', Icons.play_arrow, 'ONU তালিকা'),
    ], bn: 'OLT', triangle: true),
    _Entry('mikrotik', 'MikroTik', Icons.router, 'MikroTik'),
    _MenuGroup('Monitoring', Icons.monitor_heart, [
      _Entry('olt_monitor', 'OLT Monitor', Icons.play_arrow, 'OLT মনিটর'),
      _Entry('interface_monitor', 'Interface Monitor', Icons.play_arrow,
          'ইন্টারফেস মনিটর'),
      _Entry('customer_traffic', 'Customer Traffic', Icons.play_arrow,
          'গ্রাহক ট্রাফিক'),
      _Entry('live_fault', 'Live Fault', Icons.play_arrow, 'লাইভ ফল্ট'),
    ], bn: 'মনিটরিং', triangle: true),
    _Entry('activity_log', 'Activity Log', Icons.history),
    _Entry('netfee_bill', 'Amader Bill', Icons.receipt_long_outlined),
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
      _Entry('payment_gateways', 'Payment Gateways', Icons.account_balance_wallet),
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
      _Entry('olt_monitor', 'OLT Monitor', Icons.monitor_heart),
      _Entry('active_pppoe', 'Active PPPoE', Icons.wifi_tethering),
      _Entry('interface_monitor', 'Interface Monitor', Icons.monitor),
      _Entry('customer_traffic', 'Customer Traffic', Icons.speed),
      _Entry('live_fault', 'Live Fault', Icons.warning_amber),
      _Entry('activity_log', 'Activity Log', Icons.history),
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
        height: nested ? 41 : 50,
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
              child: SmallCapsText(
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

  String _entryText(_Entry e, Lang l) =>
      e.bn != null ? tr(e.bn!, e.label) : l.t(e.key);

  Widget _group(BuildContext context, _MenuGroup group,
      {bool admin = false, Lang? l}) {
    final open = admin ? _open == group.label : null;
    final title = (admin && group.bn != null)
        ? tr(group.bn!, group.label)
        : group.label;
    final isActive = group.children.any((e) => e.key == current);
    return Theme(
      data: Theme.of(context).copyWith(
        dividerColor: Colors.transparent,
        splashColor: AppColors.sky.withValues(alpha: 0.08),
        highlightColor: AppColors.sky.withValues(alpha: 0.04),
      ),
      child: Container(
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: AppColors.line)),
        ),
        child: ExpansionTile(
          key: admin
              ? ValueKey<String>('admin_${group.label}_$open')
              : PageStorageKey<String>('super_admin_${group.label}'),
          initiallyExpanded: admin ? open == true : isActive,
          onExpansionChanged: admin
              ? (v) => setState(() => _open = v ? group.label : null)
              : null,
          tilePadding: const EdgeInsets.symmetric(horizontal: 16),
          childrenPadding: EdgeInsets.zero,
          leading: Icon(group.icon, color: AppColors.sky, size: 28),
          title: SmallCapsText(
            title,
            style: TextStyle(
              fontSize: admin ? 18 : 17,
              color: const Color(0xFF444444),
              fontWeight: isActive ? FontWeight.w600 : FontWeight.normal,
            ),
          ),
          trailing: admin
              ? Icon(
                  open == true
                      ? Icons.keyboard_arrow_up
                      : Icons.chevron_right,
                  color: open == true
                      ? const Color(0xFFD32F2F)
                      : const Color(0xFF666680),
                  size: 28,
                )
              : null,
          iconColor: AppColors.sky,
          collapsedIconColor: const Color(0xFF666680),
          children: [
            for (final e in group.children)
              _tile(
                group.triangle ? Icons.play_arrow : e.icon,
                (admin && l != null) ? _entryText(e, l) : e.label,
                () => _go(context, e.key),
                selected: current == e.key,
                nested: true,
              ),
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
        // স্ক্রিনশটে ড্রয়ার পর্দার ~৭৫%
        width: (MediaQuery.of(context).size.width * 0.75)
            .clamp(260.0, 320.0)
            .toDouble(),
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
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          const Icon(
                            Icons.account_circle_outlined,
                            size: 56,
                            color: AppColors.navy,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: Text(
                                name,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 16,
                                  color: AppColors.text,
                                ),
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
                        for (final n in _adminMenu)
                          if (n is _MenuGroup)
                            _group(context, n, admin: true, l: l)
                          else if (n is _Entry)
                            _tile(
                              n.icon,
                              _entryText(n, l),
                              () => _go(context, n.key),
                              selected: current == n.key,
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
