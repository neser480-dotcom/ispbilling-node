import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../widgets/admin_scaffold.dart';

class SaUsersScreen extends StatefulWidget {
  const SaUsersScreen({super.key});

  @override
  State<SaUsersScreen> createState() => _SaUsersScreenState();
}

class _SaUsersScreenState extends State<SaUsersScreen> {
  final _search = TextEditingController();
  List<Map<String, dynamic>> _users = [];
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final users = await ApiService.superUsers(_search.text.trim());
      if (!mounted) return;
      setState(() => _users = users);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _value(Map<String, dynamic> user, String key) {
    final value = user[key];
    return value == null ? '' : value.toString();
  }

  Future<void> _showDetails(Map<String, dynamic> user) async {
    final id = int.tryParse(_value(user, 'id'));
    if (id == null || id <= 0) return;

    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => const AlertDialog(
        content: Row(
          children: [
            CircularProgressIndicator(),
            SizedBox(width: 16),
            Text('Loading user details...'),
          ],
        ),
      ),
    );

    try {
      final detail = await ApiService.superUserDetail(id);
      if (!mounted) return;
      Navigator.of(context, rootNavigator: true).pop();

      if (!mounted) return;
      showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(
            _value(detail, 'fullname').isNotEmpty
                ? _value(detail, 'fullname')
                : _value(detail, 'username'),
          ),
          content: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                _detailRow('User ID', detail['id']),
                _detailRow('Company ID', detail['company_id']),
                _detailRow('Company', detail['company_name']),
                _detailRow('Owner', detail['owner_name']),
                _detailRow('Username', detail['username']),
                _detailRow('Mobile', detail['mobile']),
                _detailRow('Phone', detail['phone']),
                _detailRow('Email', detail['email']),
                _detailRow('Address', detail['address']),
                _detailRow('Role', detail['role']),
                _detailRow('Status', detail['status']),
                _detailRow('Customer ID', detail['customer_id']),
                _detailRow('Client Type', detail['client_type']),
                _detailRow('Created', detail['created_at']),
              ],
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
      if (!mounted) return;
      Navigator.of(context, rootNavigator: true).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    }
  }

  Widget _detailRow(String label, dynamic value) {
    if (value == null || value.toString().isEmpty) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 105,
            child: Text(label, style: const TextStyle(fontWeight: FontWeight.bold)),
          ),
          Expanded(child: Text(value.toString())),
        ],
      ),
    );
  }

  Widget _userTile(Map<String, dynamic> user) {
    final name = _value(user, 'fullname').isNotEmpty
        ? _value(user, 'fullname')
        : _value(user, 'name').isNotEmpty
            ? _value(user, 'name')
            : _value(user, 'username');

    final company = _value(user, 'company_name');
    final mobile = _value(user, 'mobile').isNotEmpty
        ? _value(user, 'mobile')
        : _value(user, 'phone');

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      child: ListTile(
        leading: const CircleAvatar(child: Icon(Icons.person_outline)),
        title: Text(name.isEmpty ? 'User #${user['id']}' : name),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (company.isNotEmpty) Text(company),
            if (_value(user, 'username').isNotEmpty)
              Text('Username: ${user['username']}'),
            if (mobile.isNotEmpty) Text(mobile),
            Text(
              'Role: ${_value(user, 'role')}  •  Status: ${_value(user, 'status')}',
            ),
          ],
        ),
        isThreeLine: true,
        trailing: const Icon(Icons.chevron_right),
        onTap: () => _showDetails(user),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AdminScaffold(
      current: 'sa_users',
      title: 'Users',
      actions: [
        IconButton(
          onPressed: _loading ? null : _load,
          icon: const Icon(Icons.refresh),
        ),
      ],
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _search,
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _load(),
              decoration: InputDecoration(
                hintText: 'Search name, username, mobile, email or company',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: IconButton(
                  onPressed: () {
                    _search.clear();
                    _load();
                  },
                  icon: const Icon(Icons.clear),
                ),
                border: const OutlineInputBorder(),
              ),
            ),
          ),
          if (_loading && _users.isNotEmpty)
            const LinearProgressIndicator(),
          Expanded(
            child: _loading && _users.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : _error != null && _users.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(_error!),
                            const SizedBox(height: 10),
                            OutlinedButton(
                              onPressed: _load,
                              child: const Text('Retry'),
                            ),
                          ],
                        ),
                      )
                    : _users.isEmpty
                        ? const Center(child: Text('No users found'))
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.builder(
                              itemCount: _users.length,
                              itemBuilder: (_, i) => _userTile(_users[i]),
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}