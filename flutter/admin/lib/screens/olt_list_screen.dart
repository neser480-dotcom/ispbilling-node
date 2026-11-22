import 'dart:async';
import 'package:material_ui/material_ui.dart';
import '../core/api_client.dart';
import '../core/format.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../core/tr.dart';
import '../services/olt_api.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';

String _s(dynamic v, [String fallback = '']) {
  if (v == null || v == 'null') return fallback;
  final t = '$v'.trim();
  return t.isEmpty ? fallback : t;
}

bool _isOnline(dynamic status) {
  final t = _s(status).toLowerCase();
  return const ['online', 'up', 'connected', 'active', '1'].contains(t);
}

String _err(Object e) => e.toString().replaceFirst('Exception: ', '');

void _snack(BuildContext context, String msg, {bool error = false}) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
    content: Text(msg),
    backgroundColor: error ? Colors.red.shade700 : null,
  ));
}

List<Map<String, dynamic>> _rows(dynamic v) => v is List
    ? v.map((e) => Map<String, dynamic>.from(e as Map)).toList()
    : <Map<String, dynamic>>[];

Widget _statusChip(bool online, {String? label}) {
  final c = online ? Colors.green.shade700 : Colors.red.shade600;
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
    decoration: BoxDecoration(
      color: c.withOpacity(0.12),
      borderRadius: BorderRadius.circular(10),
    ),
    child: Text(
      label ?? (online ? 'Online' : 'Offline'),
      style: TextStyle(fontSize: 12, color: c, fontWeight: FontWeight.bold),
    ),
  );
}

/// OLT তালিকা (ড্রয়ার key: 'olt') ও ONU তালিকা (key: 'onu', আগে OLT বাছাই)।
/// Backend: GET /admin/olts · /admin/olts/:id/details · /admin/olts/:id/onus
class OltListScreen extends StatefulWidget {
  /// true হলে OLT-তে ট্যাপ করলে সরাসরি ONU তালিকা খোলে (ড্রয়ার key 'onu')
  final bool onuMode;
  const OltListScreen({super.key, this.onuMode = false});

  @override
  State<OltListScreen> createState() => _OltListScreenState();
}

class _OltListScreenState extends State<OltListScreen> {
  final _searchC = TextEditingController();
  Timer? _debounce;
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  String? _error;
  bool _isAdmin = false;
  bool _canAdd = false;

  @override
  void initState() {
    super.initState();
    _loadPerms();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchC.dispose();
    super.dispose();
  }

  Future<void> _loadPerms() async {
    try {
      final perm = await ApiClient.getPermissions() ?? {};
      final profile = await ApiClient.getProfile() ?? {};
      final role = _s(profile['role'], _s(perm['role'])).toLowerCase();
      final full = perm['full_access'] == true ||
          role == 'admin' ||
          role == 'super_admin';
      final list = perm['permissions'];
      final hasAdd = list is List && list.map((e) => '$e').contains('olt_add');
      if (!mounted) return;
      setState(() {
        _isAdmin = full;
        _canAdd = full || hasAdd;
      });
    } catch (_) {}
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final d = await OltApi.olts(search: _searchC.text.trim());
      if (!mounted) return;
      setState(() {
        _items = _rows(d['data']);
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _err(e);
        _loading = false;
      });
    }
  }

  void _onSearch(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), _load);
  }

  void _open(Map<String, dynamic> olt) {
    if (widget.onuMode) {
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => OnuListPage(olt: olt, canManage: _isAdmin)),
      );
      return;
    }
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _OltSheet(
        olt: olt,
        isAdmin: _isAdmin,
        onChanged: () => _load(silent: true),
      ),
    );
  }

  Future<void> _add() async {
    final ok = await showOltForm(context);
    if (ok == true) _load(silent: true);
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(_error!, textAlign: TextAlign.center),
          ),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: _load, child: Text(tr('আবার চেষ্টা', 'Retry'))),
        ]),
      );
    }
    if (_items.isEmpty) {
      return Center(child: Text(tr('কোনো OLT নেই', 'No OLT found')));
    }
    return RefreshIndicator(
      onRefresh: () => _load(silent: true),
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: _items.length,
        separatorBuilder: (_, __) => const Divider(height: 1, color: AppColors.line),
        itemBuilder: (_, i) {
          final o = _items[i];
          final total = numOf(o['onu_total']).toInt();
          final online = numOf(o['onu_online']).toInt();
          return ListTile(
            leading: const CircleAvatar(
              backgroundColor: AppColors.skyLight,
              child: Icon(Icons.dns, color: AppColors.navy),
            ),
            title: Text(_s(o['name'], 'OLT'),
                style: const TextStyle(
                    fontSize: 17, fontWeight: FontWeight.bold, color: AppColors.text)),
            subtitle: Text(
              '${_s(o['vendor']).toUpperCase()} · ${_s(o['ip'])}:${_s(o['port'])}\n'
              'ONU: ${Lang.i.digits('$online')}/${Lang.i.digits('$total')}',
              style: const TextStyle(fontSize: 13, color: AppColors.muted),
            ),
            isThreeLine: true,
            trailing: _statusChip(_isOnline(o['status']),
                label: _s(o['status'], 'unknown')),
            onTap: () => _open(o),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      return AdminScaffold(
        current: widget.onuMode ? 'onu' : 'olt',
        title: widget.onuMode ? tr('ONU তালিকা', 'ONU List') : tr('OLT তালিকা', 'OLT List'),
        actions: [
          if (_canAdd && !widget.onuMode)
            IconButton(icon: const Icon(Icons.add, size: 30), onPressed: _add),
          IconButton(icon: const Icon(Icons.sync, size: 30), onPressed: _load),
          const SizedBox(width: 4),
        ],
        body: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
            child: TextField(
              controller: _searchC,
              textInputAction: TextInputAction.search,
              onChanged: _onSearch,
              onSubmitted: (_) => _load(),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search),
                hintText: tr('নাম, IP বা ভেন্ডর', 'Name, IP or vendor'),
                isDense: true,
                border: const OutlineInputBorder(),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 6),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                '${tr('মোট', 'Total')}: ${Lang.i.digits('${_items.length}')}',
                style: const TextStyle(fontSize: 13, color: AppColors.muted),
              ),
            ),
          ),
          Expanded(child: _body()),
        ]),
      );
    });
  }
}

// ======================= OLT যোগ/সম্পাদনা ফর্ম =======================

const _vendors = [
  'ecom', 'cdata', 'vsol', 'bdcom', 'huawei', 'zte',
  'fiberhome', 'raisecom', 'nokia', 'tplink', 'other',
];

/// true ফেরত দিলে সংরক্ষিত হয়েছে। olt == null মানে নতুন।
Future<bool?> showOltForm(BuildContext context, {Map<String, dynamic>? olt}) {
  final formKey = GlobalKey<FormState>();
  final name = TextEditingController(text: _s(olt?['name']));
  final ip = TextEditingController(text: _s(olt?['ip']));
  final port = TextEditingController(text: _s(olt?['port'], '23'));
  final username = TextEditingController(text: _s(olt?['username']));
  final password = TextEditingController();
  final pon = TextEditingController(text: _s(olt?['pon_ports'], '4'));
  final remarks = TextEditingController(text: _s(olt?['remarks']));
  String vendor = _vendors.contains(_s(olt?['vendor']).toLowerCase())
      ? _s(olt?['vendor']).toLowerCase()
      : 'ecom';
  bool saving = false;
  final editing = olt != null;

  Widget field(TextEditingController c, String label,
      {bool number = false, bool obscure = false, bool required = true}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextFormField(
        controller: c,
        obscureText: obscure,
        keyboardType: number ? TextInputType.number : TextInputType.text,
        decoration: InputDecoration(
            labelText: label, isDense: true, border: const OutlineInputBorder()),
        validator: (v) =>
            required && (v == null || v.trim().isEmpty) ? tr('আবশ্যক', 'Required') : null,
      ),
    );
  }

  return showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (dialogContext) => StatefulBuilder(
      builder: (context, setS) => AlertDialog(
        title: Text(editing ? tr('OLT সম্পাদনা', 'Edit OLT') : tr('নতুন OLT', 'Add OLT')),
        content: SizedBox(
          width: 420,
          child: SingleChildScrollView(
            child: Form(
              key: formKey,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: DropdownButtonFormField<String>(
                    value: vendor,
                    isDense: true,
                    decoration: const InputDecoration(
                        labelText: 'Vendor', border: OutlineInputBorder()),
                    items: _vendors
                        .map((v) => DropdownMenuItem(value: v, child: Text(v.toUpperCase())))
                        .toList(),
                    onChanged: (v) => setS(() => vendor = v ?? vendor),
                  ),
                ),
                field(name, tr('OLT নাম', 'OLT Name')),
                field(ip, 'IP / Host'),
                field(port, 'Port', number: true),
                field(username, 'Username', required: !editing),
                field(password,
                    editing ? tr('নতুন পাসওয়ার্ড (ঐচ্ছিক)', 'New Password (optional)') : 'Password',
                    obscure: true, required: !editing),
                field(pon, 'PON Ports', number: true),
                field(remarks, tr('মন্তব্য', 'Remarks'), required: false),
              ]),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: saving ? null : () => Navigator.pop(dialogContext, false),
            child: Text(tr('বাতিল', 'Cancel')),
          ),
          FilledButton(
            onPressed: saving
                ? null
                : () async {
                    if (!formKey.currentState!.validate()) return;
                    setS(() => saving = true);
                    final body = <String, dynamic>{
                      'vendor': vendor,
                      'name': name.text.trim(),
                      'ip': ip.text.trim(),
                      'port': int.tryParse(port.text.trim()) ?? 23,
                      'username': username.text.trim(),
                      'pon_ports': int.tryParse(pon.text.trim()) ?? 4,
                      'remarks': remarks.text.trim(),
                      if (password.text.isNotEmpty) 'password': password.text,
                    };
                    try {
                      if (editing) {
                        await OltApi.updateOlt(numOf(olt!['id']).toInt(), body);
                      } else {
                        await OltApi.addOlt(body);
                      }
                      if (dialogContext.mounted) Navigator.pop(dialogContext, true);
                    } catch (e) {
                      setS(() => saving = false);
                      if (context.mounted) _snack(context, _err(e), error: true);
                    }
                  },
            child: saving
                ? const SizedBox(
                    width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : Text(tr('সংরক্ষণ', 'Save')),
          ),
        ],
      ),
    ),
  );
}

// ======================= OLT বিস্তারিত (Bottom Sheet) =======================

class _OltSheet extends StatefulWidget {
  final Map<String, dynamic> olt;
  final bool isAdmin;
  final VoidCallback onChanged;
  const _OltSheet({required this.olt, required this.isAdmin, required this.onChanged});

  @override
  State<_OltSheet> createState() => _OltSheetState();
}

class _OltSheetState extends State<_OltSheet> {
  late Future<Map<String, dynamic>> _details;
  bool _busy = false;
  int get _id => numOf(widget.olt['id']).toInt();

  @override
  void initState() {
    super.initState();
    _details = OltApi.oltDetails(_id);
  }

  Widget _row(String k, String v) {
    if (v.trim().isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(
            width: 120,
            child: Text(k, style: const TextStyle(color: AppColors.muted, fontSize: 14))),
        Expanded(child: Text(v, style: const TextStyle(color: AppColors.text, fontSize: 15))),
      ]),
    );
  }

  String _summaryText(Map<String, dynamic> r) {
    final msg = _s(r['message']);
    final data = r['data'];
    if (data is Map && data.isNotEmpty) {
      final parts = <String>[];
      data.forEach((k, v) {
        if (v is num || v is String || v is bool) parts.add('$k: $v');
      });
      if (parts.isNotEmpty) return '$msg\n${parts.take(12).join('\n')}';
    }
    return msg.isEmpty ? 'OK' : msg;
  }

  Future<void> _run(String title, Future<Map<String, dynamic>> Function() fn,
      {bool confirm = true}) async {
    if (confirm) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text(title),
          content: Text(tr('এই কাজে OLT-এর সাথে সংযোগ হবে, কিছুক্ষণ সময় লাগতে পারে। চালাবেন?',
              'This connects to the OLT and may take a while. Continue?')),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: Text(tr('না', 'No'))),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(tr('হ্যাঁ', 'Yes'))),
          ],
        ),
      );
      if (ok != true) return;
    }
    setState(() => _busy = true);
    try {
      final r = await fn();
      if (!mounted) return;
      widget.onChanged();
      await showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text(title),
          content: SingleChildScrollView(child: Text(_summaryText(r))),
          actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('OK'))],
        ),
      );
    } catch (e) {
      if (mounted) _snack(context, _err(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _edit(Map<String, dynamic> olt) async {
    final ok = await showOltForm(context, olt: olt);
    if (ok == true) {
      widget.onChanged();
      if (mounted) Navigator.pop(context);
    }
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(tr('OLT মুছবেন?', 'Delete OLT?')),
        content: Text(tr('এই OLT ও এর সব ONU রেকর্ড মুছে যাবে।',
            'This OLT and all its ONU records will be deleted.')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(tr('না', 'No'))),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            onPressed: () => Navigator.pop(c, true),
            child: Text(tr('মুছুন', 'Delete')),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await OltApi.deleteOlt(_id);
      widget.onChanged();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        _snack(context, _err(e), error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.88),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_s(widget.olt['name'], 'OLT'),
                  style: const TextStyle(
                      fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.navy)),
              const SizedBox(height: 8),
              FutureBuilder<Map<String, dynamic>>(
                future: _details,
                builder: (_, snap) {
                  if (snap.connectionState != ConnectionState.done) {
                    return const Padding(
                        padding: EdgeInsets.all(12),
                        child: Center(child: CircularProgressIndicator()));
                  }
                  if (snap.hasError) return Text(_err(snap.error!));
                  final o = mapOf(snap.data?['data']);
                  final sum = mapOf(o['onu_summary']);
                  return Column(children: [
                    _row('Vendor', _s(o['vendor']).toUpperCase()),
                    _row('Model', _s(o['model'])),
                    _row('IP / Port', '${_s(o['ip'])}:${_s(o['port'])}'),
                    _row('Username', _s(o['username'])),
                    _row('PON Ports', _s(o['pon_ports'])),
                    _row(tr('স্ট্যাটাস', 'Status'), _s(o['status'])),
                    _row(tr('শেষ চেক', 'Last check'), _s(o['last_check'])),
                    _row(tr('মোট ONU', 'Total ONU'), _s(sum['total'], '0')),
                    _row(tr('অনলাইন ONU', 'Online ONU'), _s(sum['online'], '0')),
                    _row('Avg Rx (dBm)', _fixed(sum['avg_rx'])),
                    _row('Avg Tx (dBm)', _fixed(sum['avg_tx'])),
                    _row(tr('মন্তব্য', 'Remarks'), _s(o['remarks'])),
                    if (widget.isAdmin)
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton.icon(
                          onPressed: _busy ? null : () => _edit(o),
                          icon: const Icon(Icons.edit, size: 18),
                          label: Text(tr('সম্পাদনা', 'Edit')),
                        ),
                      ),
                  ]);
                },
              ),
              const Divider(height: 20),
              FilledButton.icon(
                onPressed: _busy
                    ? null
                    : () {
                        Navigator.of(context).push(MaterialPageRoute(
                            builder: (_) =>
                                OnuListPage(olt: widget.olt, canManage: widget.isAdmin)));
                      },
                icon: const Icon(Icons.account_tree),
                label: Text(tr('ONU তালিকা', 'ONU List')),
              ),
              if (widget.isAdmin) ...[
                const SizedBox(height: 10),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  OutlinedButton.icon(
                    onPressed: _busy
                        ? null
                        : () => _run(tr('সংযোগ পরীক্ষা', 'Test connection'),
                            () => OltApi.checkOlt(_id), confirm: false),
                    icon: const Icon(Icons.wifi_tethering, size: 18),
                    label: Text(tr('সংযোগ চেক', 'Check')),
                  ),
                  OutlinedButton.icon(
                    onPressed: _busy
                        ? null
                        : () => _run(tr('ONU সিঙ্ক', 'Sync ONU'), () => OltApi.syncOnu(_id)),
                    icon: const Icon(Icons.sync, size: 18),
                    label: Text(tr('ONU সিঙ্ক', 'Sync ONU')),
                  ),
                  OutlinedButton.icon(
                    onPressed: _busy
                        ? null
                        : () => _run(tr('গ্রাহক সিঙ্ক', 'Sync customers'),
                            () => OltApi.syncCustomers(_id)),
                    icon: const Icon(Icons.people_alt, size: 18),
                    label: Text(tr('গ্রাহক সিঙ্ক', 'Sync customers')),
                  ),
                  OutlinedButton.icon(
                    onPressed: _busy
                        ? null
                        : () => _run(tr('অটো ম্যাপ (প্রিভিউ)', 'Auto-map (preview)'),
                            () => OltApi.autoMap(_id, dryRun: true), confirm: false),
                    icon: const Icon(Icons.visibility, size: 18),
                    label: Text(tr('অটো ম্যাপ প্রিভিউ', 'Auto-map preview')),
                  ),
                  OutlinedButton.icon(
                    onPressed: _busy
                        ? null
                        : () => _run(tr('অটো ম্যাপ', 'Auto-map'), () => OltApi.autoMap(_id)),
                    icon: const Icon(Icons.link, size: 18),
                    label: Text(tr('অটো ম্যাপ', 'Auto-map')),
                  ),
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _delete,
                    style: OutlinedButton.styleFrom(foregroundColor: Colors.red.shade700),
                    icon: const Icon(Icons.delete_outline, size: 18),
                    label: Text(tr('মুছুন', 'Delete')),
                  ),
                ]),
                if (_busy)
                  const Padding(
                    padding: EdgeInsets.only(top: 12),
                    child: LinearProgressIndicator(),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  String _fixed(dynamic v) {
    if (v == null) return '';
    final n = num.tryParse('$v');
    return n == null ? '' : n.toStringAsFixed(2);
  }
}

// ======================= ONU তালিকা পেজ =======================

class OnuListPage extends StatefulWidget {
  final Map<String, dynamic> olt;
  final bool canManage;
  const OnuListPage({super.key, required this.olt, this.canManage = false});

  @override
  State<OnuListPage> createState() => _OnuListPageState();
}

class _OnuListPageState extends State<OnuListPage> {
  final _searchC = TextEditingController();
  Timer? _debounce;
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  String? _error;
  int get _oltId => numOf(widget.olt['id']).toInt();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchC.dispose();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final d = await OltApi.onus(_oltId, search: _searchC.text.trim());
      if (!mounted) return;
      setState(() {
        _items = _rows(d['data']);
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _err(e);
        _loading = false;
      });
    }
  }

  void _onSearch(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), _load);
  }

  String _power(dynamic v) {
    final n = num.tryParse('${v ?? ''}');
    return n == null ? '—' : '${n.toStringAsFixed(2)} dBm';
  }

  void _open(Map<String, dynamic> onu) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _OnuSheet(
        oltId: _oltId,
        onu: onu,
        canManage: widget.canManage,
        onChanged: () => _load(silent: true),
      ),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(_error!, textAlign: TextAlign.center),
          ),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: _load, child: Text(tr('আবার চেষ্টা', 'Retry'))),
        ]),
      );
    }
    if (_items.isEmpty) return Center(child: Text(tr('কোনো ONU নেই', 'No ONU found')));
    return RefreshIndicator(
      onRefresh: () => _load(silent: true),
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: _items.length,
        separatorBuilder: (_, __) => const Divider(height: 1, color: AppColors.line),
        itemBuilder: (_, i) {
          final o = _items[i];
          final customer = _s(o['customer_name'], _s(o['name']));
          final online = _isOnline(o['status']);
          return ListTile(
            title: Text(customer,
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.text)),
            subtitle: Text(
              'PON ${_s(o['pon'], '-')} · ${_s(o['mac'], _s(o['serial'], '-'))}\n'
              'Rx ${_power(o['rx_power'])} · Tx ${_power(o['tx_power'])}',
              style: const TextStyle(fontSize: 13, color: AppColors.muted),
            ),
            isThreeLine: true,
            trailing: _statusChip(online, label: _s(o['status'], online ? 'online' : 'offline')),
            onTap: () => _open(o),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      return Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(
          title: Text('ONU · ${_s(widget.olt['name'], 'OLT')}',
              style: const TextStyle(fontSize: 20)),
          actions: [
            IconButton(icon: const Icon(Icons.sync, size: 28), onPressed: _load),
            const SizedBox(width: 4),
          ],
        ),
        body: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
            child: TextField(
              controller: _searchC,
              textInputAction: TextInputAction.search,
              onChanged: _onSearch,
              onSubmitted: (_) => _load(),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search),
                hintText: tr('গ্রাহক, PON বা ID', 'Customer, PON or ID'),
                isDense: true,
                border: const OutlineInputBorder(),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 6),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                '${tr('মোট', 'Total')}: ${Lang.i.digits('${_items.length}')}',
                style: const TextStyle(fontSize: 13, color: AppColors.muted),
              ),
            ),
          ),
          Expanded(child: _body()),
        ]),
      );
    });
  }
}

class _OnuSheet extends StatefulWidget {
  final int oltId;
  final Map<String, dynamic> onu;
  final bool canManage;
  final VoidCallback onChanged;
  const _OnuSheet({
    required this.oltId,
    required this.onu,
    required this.canManage,
    required this.onChanged,
  });

  @override
  State<_OnuSheet> createState() => _OnuSheetState();
}

class _OnuSheetState extends State<_OnuSheet> {
  bool _busy = false;
  int get _onuId => numOf(widget.onu['id']).toInt();

  Widget _row(String k, String v) {
    if (v.trim().isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(
            width: 120,
            child: Text(k, style: const TextStyle(color: AppColors.muted, fontSize: 14))),
        Expanded(child: Text(v, style: const TextStyle(color: AppColors.text, fontSize: 15))),
      ]),
    );
  }

  Future<void> _unlink() async {
    setState(() => _busy = true);
    try {
      await OltApi.unlinkOnuCustomer(widget.oltId, _onuId);
      widget.onChanged();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        _snack(context, _err(e), error: true);
      }
    }
  }

  Future<void> _link() async {
    final picked = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => _CustomerPicker(oltId: widget.oltId),
    );
    if (picked == null) return;
    setState(() => _busy = true);
    try {
      await OltApi.linkOnuCustomer(widget.oltId, _onuId, numOf(picked['id']).toInt());
      widget.onChanged();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        _snack(context, _err(e), error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.onu;
    final linked = o['customer_linked'] == true;
    final extras = _rows(o['extra_customers']);
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_s(o['onu_device_name'], 'ONU'),
                  style: const TextStyle(
                      fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.navy)),
              const SizedBox(height: 8),
              _row(tr('গ্রাহক', 'Customer'), _s(o['customer_name'])),
              _row(tr('গ্রাহক আইডি', 'Customer ID'), _s(o['customer_code'])),
              _row(tr('মোবাইল', 'Phone'), _s(o['customer_phone'])),
              _row('PON', _s(o['pon'])),
              _row('MAC', _s(o['mac'])),
              _row('Serial', _s(o['serial'])),
              _row('IP', _s(o['ip_address'], _s(o['ppp_ip']))),
              _row(tr('স্ট্যাটাস', 'Status'), _s(o['status'])),
              _row('Rx', _s(o['rx_power'])),
              _row('Tx', _s(o['tx_power'])),
              _row(tr('দূরত্ব', 'Distance'), _s(o['distance'])),
              _row(tr('তাপমাত্রা', 'Temp'), _s(o['temperature'])),
              _row(tr('শেষ আপডেট', 'Last update'), _s(o['last_update'])),
              if (extras.isNotEmpty) ...[
                const Divider(height: 20),
                Text(tr('অতিরিক্ত গ্রাহক', 'Extra customers'),
                    style: const TextStyle(fontWeight: FontWeight.bold)),
                for (final e in extras)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('${_s(e['name'])} · ${_s(e['customer_code'])}'),
                  ),
              ],
              if (widget.canManage) ...[
                const Divider(height: 20),
                if (linked)
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _unlink,
                    style: OutlinedButton.styleFrom(foregroundColor: Colors.red.shade700),
                    icon: const Icon(Icons.link_off, size: 18),
                    label: Text(tr('গ্রাহক আলাদা করুন', 'Unlink customer')),
                  )
                else
                  FilledButton.icon(
                    onPressed: _busy ? null : _link,
                    icon: const Icon(Icons.link, size: 18),
                    label: Text(tr('গ্রাহকের সাথে যুক্ত করুন', 'Link to customer')),
                  ),
                if (_busy)
                  const Padding(
                      padding: EdgeInsets.only(top: 10), child: LinearProgressIndicator()),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// ONU-তে যুক্ত করার জন্য গ্রাহক খোঁজা (কমপক্ষে ২ অক্ষর)
class _CustomerPicker extends StatefulWidget {
  final int oltId;
  const _CustomerPicker({required this.oltId});

  @override
  State<_CustomerPicker> createState() => _CustomerPickerState();
}

class _CustomerPickerState extends State<_CustomerPicker> {
  final _c = TextEditingController();
  Timer? _debounce;
  List<Map<String, dynamic>> _items = [];
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _debounce?.cancel();
    _c.dispose();
    super.dispose();
  }

  void _onChanged(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () async {
      final q = v.trim();
      if (q.length < 2) {
        setState(() {
          _items = [];
          _error = null;
        });
        return;
      }
      setState(() {
        _loading = true;
        _error = null;
      });
      try {
        final d = await OltApi.searchCustomers(widget.oltId, q);
        if (!mounted) return;
        setState(() {
          _items = _rows(d['data']);
          _loading = false;
        });
      } catch (e) {
        if (!mounted) return;
        setState(() {
          _error = _err(e);
          _loading = false;
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(tr('গ্রাহক খুঁজুন', 'Find customer')),
      content: SizedBox(
        width: 400,
        height: 360,
        child: Column(children: [
          TextField(
            controller: _c,
            autofocus: true,
            onChanged: _onChanged,
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.search),
              hintText: tr('নাম, আইডি, মোবাইল বা PPPoE', 'Name, ID, phone or PPPoE'),
              isDense: true,
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          if (_loading) const LinearProgressIndicator(),
          if (_error != null) Text(_error!, style: TextStyle(color: Colors.red.shade700)),
          Expanded(
            child: ListView(
              children: [
                for (final c in _items)
                  ListTile(
                    dense: true,
                    title: Text(_s(c['name'])),
                    subtitle: Text('${_s(c['customer_code'])} · ${_s(c['phone'])}'),
                    onTap: () => Navigator.pop(context, c),
                  ),
              ],
            ),
          ),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(tr('বাতিল', 'Cancel'))),
      ],
    );
  }
}
