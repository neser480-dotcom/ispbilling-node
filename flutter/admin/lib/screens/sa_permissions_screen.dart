import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../widgets/admin_scaffold.dart';

class SaPermissionsScreen extends StatefulWidget {
  const SaPermissionsScreen({super.key});

  @override
  State<SaPermissionsScreen> createState() => _SaPermissionsScreenState();
}

class _SaPermissionsScreenState extends State<SaPermissionsScreen> {
  List<Map<String, dynamic>> _users = [];
  final Set<String> _enabled = {};

  int? _selectedUserId;
  List<String> _permissionKeys = [];
  bool _loadingUsers = false;
  bool _loadingPermissions = false;
  bool _saving = false;
  bool _canEdit = false;
  String? _error;

  final Map<String, List<String>> _groups = {
    'Customer': [
      'customer_id_auto_generate',
      'area_management',
      'bulk_area_edit',
      'bulk_status_edit',
      'bulk_auto_disable_edit',
      'bulk_package_edit',
      'bulk_customer_delete',
      'bulk_customer_mikrotik_update',
      'customer_auto_connection',
      'bulk_customer_recharge',
      'add_customer_with_mobile',
      'inactive_offline_customer_delete',
      'unpaid_customer_bulk_sms',
      'show_customer_panel_package',
      'customer_invoice',
      'without_mikrotik_customer_minus_balance',
      'customer_portal',
    ],
    'MikroTik': [
      'mikrotik_add',
      'mikrotik_delete',
    ],
    'Billing': [
      'promise_date',
      'report_delete',
      'expenditure_delete',
      'bulk_billing_cycle_edit',
      'bulk_promise_date_edit',
      'bulk_payment_status_edit',
      'fixed_billing_cycle_date',
      'instant_recharge_bill_print',
      'daily_recharge_feature',
      'deposit_update',
      'dashboard_probability_amount_with_new_customer',
    ],
    'Network': [
      'network_diagram',
      'network_monitoring',
      'traffic_monitoring',
      'interface_monitor',
      'pole_box',
    ],
    'OLT': [
      'olt_add',
      'olt_user_monitoring',
    ],
    'Reseller': [
      'reseller_add',
      'multiple_manager',
      'reseller_customer_bulk_status_edit',
      'reseller_customer_bulk_promise_date_edit',
      'reseller_customer_bulk_billing_cycle_edit',
      'reseller_minus_balance',
      'reseller_customer_bulk_auto_connection_edit',
      'reseller_customer_bulk_area_edit',
      'reseller_customer_bulk_payment_status_edit',
    ],
  };

  @override
  void initState() {
    super.initState();
    _loadUsers();
  }

  String _value(Map<String, dynamic> data, String key) {
    final value = data[key];
    return value == null ? '' : value.toString();
  }

  Future<void> _loadUsers() async {
    setState(() {
      _loadingUsers = true;
      _error = null;
    });

    try {
      final users = await ApiService.superUsers('');
      if (!mounted) return;

      setState(() {
        _users = users;
        if (_selectedUserId != null &&
            !users.any((u) => int.tryParse(_value(u, 'id')) == _selectedUserId)) {
          _selectedUserId = null;
          _enabled.clear();
          _permissionKeys = [];
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loadingUsers = false);
    }
  }

  Future<void> _selectUser(int? userId) async {
    setState(() {
      _selectedUserId = userId;
      _enabled.clear();
      _permissionKeys = [];
      _canEdit = false;
      _error = null;
    });

    if (userId == null) return;
    await _loadPermissions(userId);
  }

  Future<void> _loadPermissions([int? userId]) async {
    final id = userId ?? _selectedUserId;
    if (id == null) return;

    setState(() {
      _loadingPermissions = true;
      _error = null;
    });

    try {
      final result = await ApiService.superUserPermissions(id);
      if (!mounted || _selectedUserId != id) return;

      final permissionMap = Map<String, dynamic>.from(
        result['permissions'] ?? {},
      );
      final keys = (result['permission_keys'] as List? ?? [])
          .map((e) => e.toString())
          .toList();

      setState(() {
        _permissionKeys = keys;
        _enabled
          ..clear()
          ..addAll(
            permissionMap.entries
                .where((entry) => entry.value == true ||
                    entry.value.toString() == '1')
                .map((entry) => entry.key),
          );
        _canEdit = result['can_edit'] == true;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted && _selectedUserId == id) {
        setState(() => _loadingPermissions = false);
      }
    }
  }

  List<String> get _visibleKeys => _groups.values
      .expand((keys) => keys)
      .where((key) => _permissionKeys.contains(key))
      .toList();

  void _selectAll(bool enabled) {
    if (!_canEdit || _saving) return;
    setState(() {
      if (enabled) {
        _enabled.addAll(_visibleKeys);
      } else {
        _enabled.removeAll(_visibleKeys);
      }
    });
  }

  Future<void> _save() async {
    final id = _selectedUserId;
    if (id == null || !_canEdit || _saving) return;

    setState(() => _saving = true);
    try {
      await ApiService.superSavePermissions(
        id,
        _enabled.toList(),
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Permissions saved successfully')),
      );
      await _loadPermissions(id);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _userLabel(Map<String, dynamic> user) {
    final name = _value(user, 'fullname').isNotEmpty
        ? _value(user, 'fullname')
        : _value(user, 'name').isNotEmpty
            ? _value(user, 'name')
            : _value(user, 'username');

    final username = _value(user, 'username');
    final role = _value(user, 'role');

    return [
      name.isEmpty ? 'User #${user['id']}' : name,
      if (username.isNotEmpty) username,
      if (role.isNotEmpty) role,
    ].join(' • ');
  }

  Widget _permissionGroup(String title, List<String> keys) {
    final visible = keys.where((key) => _permissionKeys.contains(key)).toList();
    if (visible.isEmpty) return const SizedBox.shrink();

    return Card(
      margin: const EdgeInsets.fromLTRB(12, 5, 12, 8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Text(
                title,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
              ),
            ),
            const Divider(height: 1),
            ...visible.map(
              (key) => SwitchListTile(
                dense: true,
                title: Text(key.replaceAll('_', ' ')),
                value: _enabled.contains(key),
                onChanged: _canEdit && !_saving
                    ? (value) {
                        setState(() {
                          if (value) {
                            _enabled.add(key);
                          } else {
                            _enabled.remove(key);
                          }
                        });
                      }
                    : null,
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final selectedUser = _users.where(
      (u) => int.tryParse(_value(u, 'id')) == _selectedUserId,
    );
    final selectedRole = selectedUser.isEmpty
        ? ''
        : _value(selectedUser.first, 'role').toLowerCase();

    return AdminScaffold(
      current: 'sa_permissions',
      title: 'Permissions',
      actions: [
        IconButton(
          onPressed: _loadingUsers || _loadingPermissions
              ? null
              : () async {
                  await _loadUsers();
                  if (_selectedUserId != null) {
                    await _loadPermissions();
                  }
                },
          icon: const Icon(Icons.refresh),
        ),
      ],
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: _loadingUsers
                ? const LinearProgressIndicator()
                : DropdownButtonFormField<int>(
                    value: _selectedUserId,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Select User',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.person_search),
                    ),
                    items: _users.map((user) {
                      final id = int.tryParse(_value(user, 'id'));
                      return DropdownMenuItem<int>(
                        value: id,
                        child: Text(
                          _userLabel(user),
                          overflow: TextOverflow.ellipsis,
                        ),
                      );
                    }).where((item) => item.value != null).toList(),
                    onChanged: _saving ? null : _selectUser,
                  ),
          ),
          if (_selectedUserId != null && _canEdit && !_loadingPermissions)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  TextButton(
                    onPressed: () => _selectAll(true),
                    child: const Text('Select All'),
                  ),
                  TextButton(
                    onPressed: () => _selectAll(false),
                    child: const Text('Clear All'),
                  ),
                  const Spacer(),
                  Text('${_enabled.intersection(_visibleKeys.toSet()).length} / ${_permissionKeys.length} enabled'),
                ],
              ),
            ),
          if (_selectedUserId != null &&
              !_canEdit &&
              !_loadingPermissions &&
              _error == null)
            Padding(
              padding: const EdgeInsets.all(10),
              child: Text(
                selectedRole == 'super_admin'
                    ? 'Super Admin permissions are read-only.'
                    : 'You cannot edit your own permissions.',
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          if (_loadingPermissions) const LinearProgressIndicator(),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                children: [
                  Text(_error!, style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
                  )),
                  TextButton(
                    onPressed: _loadPermissions,
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          Expanded(
            child: _selectedUserId == null
                ? Center(
                    child: Text(_users.isEmpty
                        ? 'No users found'
                        : 'Select a user to manage permissions'),
                  )
                : _loadingPermissions
                    ? const Center(child: CircularProgressIndicator())
                    : _error != null
                        ? const SizedBox.shrink()
                        : RefreshIndicator(
                            onRefresh: _loadPermissions,
                            child: ListView(
                              children: [
                                ..._groups.entries.map(
                                  (entry) => _permissionGroup(
                                    entry.key,
                                    entry.value,
                                  ),
                                ),
                                if (!_canEdit)
                                  const SizedBox(height: 16),
                                if (_canEdit)
                                  Padding(
                                    padding: const EdgeInsets.fromLTRB(
                                      12, 8, 12, 24,
                                    ),
                                    child: SizedBox(
                                      width: double.infinity,
                                      child: FilledButton.icon(
                                        onPressed: _saving ? null : _save,
                                        icon: _saving
                                            ? const SizedBox(
                                                width: 18,
                                                height: 18,
                                                child: CircularProgressIndicator(
                                                  strokeWidth: 2,
                                                ),
                                              )
                                            : const Icon(Icons.save),
                                        label: Text(
                                          _saving ? 'Saving...' : 'Save Permissions',
                                        ),
                                      ),
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