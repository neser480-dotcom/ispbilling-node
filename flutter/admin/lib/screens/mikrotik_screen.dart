import 'dart:async';
import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../services/api_service.dart';
import '../widgets/admin_scaffold.dart';

class MikrotikScreen extends StatefulWidget {
  const MikrotikScreen({super.key});

  @override
  State<MikrotikScreen> createState() => _MikrotikScreenState();
}

class _MikrotikScreenState extends State<MikrotikScreen> {
  List<Map<String, dynamic>> _routers = [];
  final Map<int, Map<String, dynamic>> _checks = {};
  bool _loading = true;
  String? _error;
  String _search = '';
  bool _canAdd = false;
  bool _canDelete = false;
  bool _isSuperAdmin = false;
  bool _canManage = false;
  bool _checkingAll = false;
  bool _loadingRouters = false;
  final Set<int> _checkingRouters = {};

  bool _canDeletePackage = false;
  Timer? _autoRefresh;
  @override
  void initState() {
    super.initState();
    _load();
    _autoRefresh = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) _load(silent: true);
    });
  }

  @override
  void dispose() {
    _autoRefresh?.cancel();
    super.dispose();
  }

  int _int(dynamic value) => int.tryParse('$value') ?? 0;

  String _str(dynamic value, [String fallback = '']) {
    if (value == null || value == 'null') return fallback;
    return '$value';
  }

  bool _allowed(List<dynamic> permissions, String key) =>
      permissions.map((e) => '$e').contains(key);

  Future<void> _load({bool silent = false}) async {
    if (_loadingRouters || !mounted) return;
    _loadingRouters = true;
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final results = await Future.wait([
        ApiService.mikrotikRouters(),
        ApiClient.getPermissions(),
        ApiClient.getProfile(),
      ]);

      final response = Map<String, dynamic>.from(results[0] as Map);
      final permissionData =
          Map<String, dynamic>.from((results[1] as Map?) ?? {});
      final profile = Map<String, dynamic>.from((results[2] as Map?) ?? {});

      final raw = response['routers'];
      final routers = raw is List
          ? raw.map((e) => Map<String, dynamic>.from(e as Map)).toList()
          : <Map<String, dynamic>>[];

      final role =
          _str(profile['role'], _str(permissionData['role'])).toLowerCase();
      final full = permissionData['full_access'] == true;

      final rawPermissions = permissionData['permissions'];
      final permissions = rawPermissions is List ? rawPermissions : <dynamic>[];

      if (!mounted) return;
      setState(() {
        _routers = routers;
        _canAdd = full || _allowed(permissions, 'mikrotik_add');
        _canDelete = full || _allowed(permissions, 'mikrotik_delete');
        _isSuperAdmin = role == 'super_admin';
        _canManage = ['super_admin', 'admin', 'manager'].contains(role);
        _canDeletePackage = ['super_admin', 'admin'].contains(role);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    } finally {
      _loadingRouters = false;
    }
  }

  List<Map<String, dynamic>> get _filtered {
    final q = _search.trim().toLowerCase();
    if (q.isEmpty) return _routers;
    return _routers.where((r) {
      final text = [r['name'], r['ip'], r['username'], r['port']]
          .map((e) => _str(e).toLowerCase())
          .join(' ');
      return text.contains(q);
    }).toList();
  }

  void _message(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? Colors.red.shade700 : null,
      ),
    );
  }

  Future<void> _saveRouter([Map<String, dynamic>? router]) async {
    final formKey = GlobalKey<FormState>();
    final name = TextEditingController(text: _str(router?['name']));
    final ip = TextEditingController(text: _str(router?['ip']));
    final username = TextEditingController(text: _str(router?['username']));
    final password = TextEditingController();
    final port = TextEditingController(text: _str(router?['port'], '8728'));
    final timeout = TextEditingController(text: _str(router?['timeout'], '3'));
    final companyId = TextEditingController(
      text: _str(router?['company_id']),
    );
    bool ssl = _int(router?['use_ssl']) == 1;
    bool saving = false;

    final saved = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(
              router == null ? 'Add MikroTik Router' : 'Edit MikroTik Router'),
          content: SizedBox(
            width: 440,
            child: SingleChildScrollView(
              child: Form(
                key: formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _field(name, 'Router Name'),
                    _field(ip, 'IP Address'),
                    _field(username, 'Username'),
                    _field(
                      password,
                      router == null ? 'Password' : 'New Password (optional)',
                      obscure: true,
                      required: router == null,
                    ),
                    _field(port, 'API Port', number: true),
                    _field(timeout, 'Timeout (seconds)', number: true),
                    if (_isSuperAdmin && router == null)
                      _field(companyId, 'Company ID', number: true),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Use SSL'),
                      value: ssl,
                      onChanged: (v) => setDialogState(() => ssl = v),
                    ),
                  ],
                ),
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed:
                  saving ? null : () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: saving
                  ? null
                  : () async {
                      if (!formKey.currentState!.validate()) return;
                      if (_isSuperAdmin &&
                          router == null &&
                          _int(companyId.text) <= 0) {
                        _message('Enter a valid Company ID.', error: true);
                        return;
                      }

                      setDialogState(() => saving = true);
                      final values = <String, dynamic>{
                        'name': name.text.trim(),
                        'ip': ip.text.trim(),
                        'username': username.text.trim(),
                        'port': _int(port.text),
                        'timeout': _int(timeout.text),
                        'use_ssl': ssl ? 1 : 0,
                      };
                      if (password.text.isNotEmpty) {
                        values['password'] = password.text;
                      }
                      if (_isSuperAdmin && router == null) {
                        values['company_id'] = _int(companyId.text);
                      }

                      try {
                        if (router == null) {
                          await ApiService.mikrotikCreate(values);
                        } else {
                          await ApiService.mikrotikUpdate(
                            _int(router['id']),
                            values,
                          );
                        }
                        if (dialogContext.mounted) {
                          Navigator.pop(dialogContext, true);
                        }
                      } catch (e) {
                        setDialogState(() => saving = false);
                        _message(e.toString().replaceFirst('Exception: ', ''),
                            error: true);
                      }
                    },
              child: saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Save'),
            ),
          ],
        ),
      ),
    );

    name.dispose();
    ip.dispose();
    username.dispose();
    password.dispose();
    port.dispose();
    timeout.dispose();
    companyId.dispose();

    if (saved == true) {
      _message('Router saved successfully.');
      await _load();
    }
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    bool obscure = false,
    bool number = false,
    bool required = true,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        controller: controller,
        obscureText: obscure,
        keyboardType: number ? TextInputType.number : TextInputType.text,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          isDense: true,
        ),
        validator: (value) {
          if (required && (value == null || value.trim().isEmpty)) {
            return '$label is required';
          }
          if (number &&
              value != null &&
              value.trim().isNotEmpty &&
              int.tryParse(value.trim()) == null) {
            return 'Enter a valid number';
          }
          return null;
        },
      ),
    );
  }

  Future<void> _deleteRouter(Map<String, dynamic> router) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Router?'),
        content: Text(
          'Are you sure you want to delete "${_str(router['name'])}"?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (yes != true) return;
    try {
      await ApiService.mikrotikDelete(_int(router['id']));
      _message('Router deleted.');
      await _load();
    } catch (e) {
      _message(e.toString().replaceFirst('Exception: ', ''), error: true);
    }
  }

  Future<void> _checkAll() async {
    if (_routers.isEmpty || _checkingAll || _checkingRouters.isNotEmpty) return;

    setState(() => _checkingAll = true);
    try {
      final results = await Future.wait(_routers.map((router) async {
        final id = _int(router['id']);
        try {
          return MapEntry<int, Map<String, dynamic>>(
            id,
            await ApiService.mikrotikCheck(id),
          );
        } catch (e) {
          return MapEntry<int, Map<String, dynamic>>(
            id,
            {'status': false, 'error': e.toString()},
          );
        }
      }));

      if (!mounted) return;
      setState(() {
        for (final result in results) {
          _checks[result.key] = result.value;
        }
      });
      _message('Connection check completed for ${results.length} router(s).');
    } finally {
      if (mounted) setState(() => _checkingAll = false);
    }
  }

  Future<void> _checkRouter(Map<String, dynamic> router) async {
    final id = _int(router['id']);
    if (_checkingRouters.contains(id) || _checkingAll) return;

    setState(() {
      _checkingRouters.add(id);
      _checks.remove(id);
    });

    try {
      final result = await ApiService.mikrotikCheck(id);
      if (!mounted) return;
      setState(() => _checks[id] = result);
      _message('Connection check completed.');
    } catch (e) {
      if (mounted) {
        _message(e.toString().replaceFirst('Exception: ', ''), error: true);
      }
    } finally {
      if (mounted) {
        setState(() => _checkingRouters.remove(id));
      }
    }
  }

  Future<void> _showDetails(Map<String, dynamic> router) async {
    final id = _int(router['id']);
    showDialog<void>(
      context: context,
      builder: (dialogContext) => _RouterDetailsDialog(
        router: router,
        canManage: _canManage,
        onPackages: () => _showPackages(router),
        onCustomers: () => _showCustomers(router),
        onHistory: () => _showHistory(router),
        onSyncPackages: () => _syncPackages(id),
        onSyncCustomers: () => _syncCustomers(id),
      ),
    );
  }

  Future<void> _syncPackages(int id) async {
    final yes = await _confirm(
        'Sync Packages?', 'Import profiles from this MikroTik router?');
    if (yes != true) return;
    try {
      final result = await ApiService.mikrotikSyncPackages(id);
      if (!mounted) return;
      _message(
          'Package sync completed: ${_str(result['synced'], '0')} synced.');

      final router = _routers.cast<Map<String, dynamic>?>().firstWhere(
            (r) => _int(r?['id']) == id,
            orElse: () => null,
          );
      if (router != null) {
        await _showPackages(router);
      }
    } catch (e) {
      if (mounted) {
        _message(e.toString().replaceFirst('Exception: ', ''), error: true);
      }
    }
  }

  Future<void> _syncCustomers(int id) async {
    bool includeInactive = false;
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setStateDialog) => AlertDialog(
          title: const Text('Customer Sync'),
          content: CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            value: includeInactive,
            title: const Text('Include inactive PPPoE customers'),
            onChanged: (v) =>
                setStateDialog(() => includeInactive = v ?? false),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Start Sync'),
            ),
          ],
        ),
      ),
    );
    if (yes != true) return;

    try {
      final result = await ApiService.mikrotikSyncCustomers(
        id,
        includeInactive: includeInactive,
      );
      _message(
        'Customer sync: ${_str(result['total_customer'], '0')} total, '
        '${_str(result['inserted'], '0')} added, '
        '${_str(result['updated'], '0')} updated.',
      );

      if (!mounted) return;
      final router = _routers
          .cast<Map<String, dynamic>?>()
          .firstWhere((r) => _int(r?['id']) == id, orElse: () => null);
      if (router != null) {
        await _showCustomers(router);
      }
    } catch (e) {
      if (mounted) {
        _message(e.toString().replaceFirst('Exception: ', ''), error: true);
      }
    }
  }

  Future<bool?> _confirm(String title, String message) => showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(title),
          content: Text(message),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Continue'),
            ),
          ],
        ),
      );

  Future<void> _showPackages(Map<String, dynamic> router) async {
    try {
      final result = await ApiService.mikrotikPackages(_int(router['id']));
      final raw = result['packages'];
      final items = raw is List
          ? raw.map((e) => Map<String, dynamic>.from(e as Map)).toList()
          : <Map<String, dynamic>>[];
      if (!mounted) return;

      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('${_str(router['name'])} - Packages'),
          content: SizedBox(
            width: 500,
            child: items.isEmpty
                ? const Text(
                    'No packages found. Use Sync Packages to import profiles.')
                : ListView.separated(
                    shrinkWrap: true,
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const Divider(),
                    itemBuilder: (context, index) {
                      final p = items[index];
                      return ListTile(
                        title: Text(_str(
                            p['package_name'], _str(p['name'], 'Package'))),
                        subtitle: Text(
                          'Alias: ${_str(p['alias_name'], '-')}\nPrice: ${_str(p['price'], '0')} Tk.',
                        ),
                        isThreeLine: true,
                        trailing: PopupMenuButton<String>(
                          onSelected: (value) {
                            if (value == 'edit') _editPackage(p, router);
                            if (value == 'delete') _deletePackage(p, router);
                          },
                          itemBuilder: (context) => [
                            if (_canManage)
                              const PopupMenuItem(
                                  value: 'edit', child: Text('Edit')),
                            if (_canDeletePackage)
                              const PopupMenuItem(
                                  value: 'delete', child: Text('Delete')),
                          ],
                        ),
                      );
                    },
                  ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    } catch (e) {
      _message(e.toString().replaceFirst('Exception: ', ''), error: true);
    }
  }

  Future<void> _deletePackage(
      Map<String, dynamic> package, Map<String, dynamic> router) async {
    final yes =
        await _confirm('Delete Package?', 'This action cannot be undone.');
    if (yes != true) return;
    try {
      await ApiService.mikrotikDeletePackage(_int(package['id']));
      if (!mounted) return;
      Navigator.of(context).pop();
      _message('Package deleted.');
      await _showPackages(router);
    } catch (e) {
      _message(e.toString().replaceFirst('Exception: ', ''), error: true);
    }
  }

  Future<void> _editPackage(
      Map<String, dynamic> package, Map<String, dynamic> router) async {
    final id = _int(package['id']);
    final name = TextEditingController(
      text: _str(package['package_name'], _str(package['name'])),
    );
    final alias = TextEditingController(text: _str(package['alias_name']));
    final price = TextEditingController(text: _str(package['price'], '0'));
    final formKey = GlobalKey<FormState>();

    final save = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Edit Package'),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _field(name, 'Package Name'),
              _field(alias, 'Alias Name', required: false),
              _field(price, 'Price', number: true),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              if (!formKey.currentState!.validate()) return;
              try {
                await ApiService.mikrotikUpdatePackage(id, {
                  'package_name': name.text.trim(),
                  'alias_name': alias.text.trim(),
                  'price': double.tryParse(price.text) ?? 0,
                });
                if (context.mounted) Navigator.pop(context, true);
              } catch (e) {
                _message(e.toString().replaceFirst('Exception: ', ''),
                    error: true);
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );

    name.dispose();
    alias.dispose();
    price.dispose();

    if (save == true && mounted) {
      Navigator.of(context).pop();
      _message('Package updated.');
      await _showPackages(router);
    }
  }

  Future<void> _showCustomers(Map<String, dynamic> router) async {
    try {
      final result =
          await ApiService.mikrotikActiveCustomers(_int(router['id']));
      final raw = result['customers'];
      final customers = raw is List
          ? raw.map((e) => Map<String, dynamic>.from(e as Map)).toList()
          : <Map<String, dynamic>>[];
      if (!mounted) return;

      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Active PPPoE Customers'),
          content: SizedBox(
            width: 520,
            child: customers.isEmpty
                ? const Text('No active customers found.')
                : ListView.separated(
                    shrinkWrap: true,
                    itemCount: customers.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final c = customers[index];
                      return ListTile(
                        dense: true,
                        leading: const Icon(Icons.person_outline),
                        title: Text(
                            _str(c['name'], _str(c['username'], 'Customer'))),
                        subtitle: Text(
                          'Username: ${_str(c['name'], _str(c['username'], '-'))}\n'
                          'Address: ${_str(c['address'], '-')}',
                        ),
                        isThreeLine: true,
                      );
                    },
                  ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    } catch (e) {
      _message(e.toString().replaceFirst('Exception: ', ''), error: true);
    }
  }

  Future<void> _showHistory(Map<String, dynamic> router) async {
    try {
      final result = await ApiService.mikrotikHistory(_int(router['id']));
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Router Status / History'),
          content: SizedBox(
            width: 440,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: result.entries
                    .where((e) => e.key != 'success')
                    .map((e) => Padding(
                          padding: const EdgeInsets.symmetric(vertical: 5),
                          child: Text('${e.key}: ${e.value}'),
                        ))
                    .toList(),
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    } catch (e) {
      _message(e.toString().replaceFirst('Exception: ', ''), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    return AdminScaffold(
      current: 'mikrotik',
      title: 'MikroTik Routers',
      actions: [
        IconButton(
          tooltip: 'Refresh',
          onPressed: _load,
          icon: const Icon(Icons.refresh),
        ),
        if (_canAdd)
          IconButton(
            tooltip: 'Add Router',
            onPressed: () => _saveRouter(),
            icon: const Icon(Icons.add),
          ),
      ],
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!, textAlign: TextAlign.center),
                      const SizedBox(height: 12),
                      OutlinedButton(
                        onPressed: _load,
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
                      child: TextField(
                        decoration: InputDecoration(
                          hintText: 'Search router name, IP, username...',
                          prefixIcon: const Icon(Icons.search),
                          suffixIcon: _search.isEmpty
                              ? null
                              : IconButton(
                                  icon: const Icon(Icons.clear),
                                  onPressed: () => setState(() => _search = ''),
                                ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        onChanged: (v) => setState(() => _search = v),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 5),
                      child: Row(
                        children: [
                          Text(
                            '${filtered.length} router(s)',
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          const Spacer(),
                          OutlinedButton.icon(
                            onPressed: (_loading ||
                                    _checkingAll ||
                                    _checkingRouters.isNotEmpty)
                                ? null
                                : _checkAll,
                            icon: _checkingAll
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2),
                                  )
                                : const Icon(Icons.wifi_tethering, size: 18),
                            label: Text(
                                _checkingAll ? 'Checking...' : 'Check All'),
                          ),
                          const SizedBox(width: 8),
                          if (_canAdd)
                            FilledButton.icon(
                              onPressed: () => _saveRouter(),
                              icon: const Icon(Icons.add, size: 18),
                              label: const Text('Add Router'),
                            ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: filtered.isEmpty
                          ? Center(
                              child: Text(
                                _routers.isEmpty
                                    ? 'No MikroTik routers added yet.'
                                    : 'No matching routers found.',
                              ),
                            )
                          : RefreshIndicator(
                              onRefresh: _load,
                              child: ListView.builder(
                                padding:
                                    const EdgeInsets.fromLTRB(12, 4, 12, 20),
                                itemCount: filtered.length,
                                itemBuilder: (context, index) {
                                  final r = filtered[index];
                                  final id = _int(r['id']);
                                  final check = _checks[id];
                                  final online = check?['status'] == true ||
                                      check?['online'] == true;
                                  return Card(
                                    margin:
                                        const EdgeInsets.symmetric(vertical: 6),
                                    child: Padding(
                                      padding: const EdgeInsets.all(12),
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            children: [
                                              CircleAvatar(
                                                backgroundColor: online
                                                    ? Colors.green.shade50
                                                    : Colors.blue.shade50,
                                                child: Icon(
                                                  Icons.router,
                                                  color: online
                                                      ? Colors.green
                                                      : Colors.blue,
                                                ),
                                              ),
                                              const SizedBox(width: 12),
                                              Expanded(
                                                child: Column(
                                                  crossAxisAlignment:
                                                      CrossAxisAlignment.start,
                                                  children: [
                                                    Text(
                                                      _str(r['name'],
                                                          'MikroTik Router'),
                                                      style: const TextStyle(
                                                        fontSize: 17,
                                                        fontWeight:
                                                            FontWeight.bold,
                                                      ),
                                                    ),
                                                    Text(
                                                      '${_str(r['ip'])}:${_str(r['port'], '8728')}',
                                                      style: TextStyle(
                                                          color: Colors
                                                              .grey.shade700),
                                                    ),
                                                  ],
                                                ),
                                              ),
                                              PopupMenuButton<String>(
                                                onSelected: (value) {
                                                  if (value == 'edit') {
                                                    _saveRouter(r);
                                                  }
                                                  if (value == 'delete') {
                                                    _deleteRouter(r);
                                                  }
                                                  if (value == 'check') {
                                                    _checkRouter(r);
                                                  }
                                                  if (value == 'details') {
                                                    _showDetails(r);
                                                  }
                                                },
                                                itemBuilder: (context) => [
                                                  const PopupMenuItem(
                                                    value: 'check',
                                                    child: Text(
                                                        'Check Connection'),
                                                  ),
                                                  const PopupMenuItem(
                                                    value: 'details',
                                                    child:
                                                        Text('Router Details'),
                                                  ),
                                                  if (_canManage)
                                                    const PopupMenuItem(
                                                      value: 'edit',
                                                      child:
                                                          Text('Edit Router'),
                                                    ),
                                                  if (_canDelete)
                                                    const PopupMenuItem(
                                                      value: 'delete',
                                                      child:
                                                          Text('Delete Router'),
                                                    ),
                                                ],
                                              ),
                                            ],
                                          ),
                                          const SizedBox(height: 8),
                                          Wrap(
                                            spacing: 8,
                                            runSpacing: 4,
                                            children: [
                                              _tag(
                                                  'Username: ${_str(r['username'], '-')}'),
                                              _tag(
                                                  'Port: ${_str(r['port'], '8728')}'),
                                              if (check != null)
                                                _tag(
                                                    online
                                                        ? 'Online'
                                                        : 'Offline',
                                                    color: online
                                                        ? Colors.green
                                                        : Colors.red),
                                            ],
                                          ),
                                          const Divider(height: 20),
                                          Wrap(
                                            alignment:
                                                WrapAlignment.spaceBetween,
                                            spacing: 6,
                                            runSpacing: 4,
                                            children: [
                                              TextButton.icon(
                                                onPressed: (_checkingRouters
                                                            .contains(_int(
                                                                r['id'])) ||
                                                        _checkingAll)
                                                    ? null
                                                    : () => _checkRouter(r),
                                                icon: _checkingRouters
                                                        .contains(_int(r['id']))
                                                    ? const SizedBox(
                                                        width: 16,
                                                        height: 16,
                                                        child:
                                                            CircularProgressIndicator(
                                                                strokeWidth: 2),
                                                      )
                                                    : const Icon(
                                                        Icons.network_check),
                                                label: Text(_checkingRouters
                                                        .contains(_int(r['id']))
                                                    ? 'Checking...'
                                                    : 'Check'),
                                              ),
                                              TextButton.icon(
                                                onPressed: () =>
                                                    _showDetails(r),
                                                icon: const Icon(
                                                    Icons.settings_ethernet),
                                                label: const Text('Manage'),
                                              ),
                                              if (_canManage)
                                                TextButton.icon(
                                                  onPressed: () =>
                                                      _saveRouter(r),
                                                  icon: const Icon(Icons.edit),
                                                  label: const Text('Edit'),
                                                ),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                },
                              ),
                            ),
                    ),
                  ],
                ),
    );
  }

  Widget _tag(String text, {Color? color}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        decoration: BoxDecoration(
          color: (color ?? Colors.blueGrey).withValues(alpha: 0.09),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          text,
          style:
              TextStyle(fontSize: 12, color: color ?? Colors.blueGrey.shade700),
        ),
      );
}

class _RouterDetailsDialog extends StatelessWidget {
  final Map<String, dynamic> router;
  final bool canManage;
  final VoidCallback onPackages;
  final VoidCallback onCustomers;
  final VoidCallback onHistory;
  final VoidCallback onSyncPackages;
  final VoidCallback onSyncCustomers;

  const _RouterDetailsDialog({
    required this.router,
    required this.canManage,
    required this.onPackages,
    required this.onCustomers,
    required this.onHistory,
    required this.onSyncPackages,
    required this.onSyncCustomers,
  });

  @override
  Widget build(BuildContext context) {
    Widget action(String title, IconData icon, VoidCallback callback) =>
        ListTile(
          leading: Icon(icon),
          title: Text(title),
          trailing: const Icon(Icons.chevron_right),
          onTap: () {
            Navigator.pop(context);
            callback();
          },
        );

    return AlertDialog(
      title: Text('${router['name'] ?? 'MikroTik'}'),
      content: SizedBox(
        width: 420,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            action('Connection / Status History', Icons.history, onHistory),
            action('Router Packages', Icons.inventory_2_outlined, onPackages),
            if (canManage)
              action('Sync Packages from Router', Icons.sync, onSyncPackages),
            action('Active PPPoE Customers', Icons.people_outline, onCustomers),
            if (canManage)
              action('Sync PPPoE Customers', Icons.people_alt_outlined,
                  onSyncCustomers),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Close'),
        ),
      ],
    );
  }
}
