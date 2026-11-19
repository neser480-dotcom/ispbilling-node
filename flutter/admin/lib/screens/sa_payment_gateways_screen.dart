import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../widgets/admin_scaffold.dart';

class SaPaymentGatewaysScreen extends StatefulWidget {
  const SaPaymentGatewaysScreen({super.key});

  @override
  State<SaPaymentGatewaysScreen> createState() =>
      _SaPaymentGatewaysScreenState();
}

class _SaPaymentGatewaysScreenState extends State<SaPaymentGatewaysScreen> {
  final _companyController = TextEditingController();
  final _slugController = TextEditingController();
  final Map<String, Map<String, TextEditingController>> _fields = {};
  final Map<String, Map<String, dynamic>> _configs = {};
  final Map<String, bool> _enabled = {};
  final Map<String, String> _environment = {};
  final Map<String, Map<String, dynamic>> _saved = {};
  final Set<String> _saving = {};
  String _scope = 'central';
  bool _loading = false;
  String? _error;

  static const _gateways = <String, Map<String, dynamic>>{
    'bkash': {
      'title': 'bKash',
      'fields': ['app_key', 'app_secret', 'username', 'password'],
      'labels': ['App Key', 'App Secret', 'Username', 'Password'],
      'secrets': ['app_secret', 'password'],
    },
    'nagad': {
      'title': 'Nagad',
      'fields': ['merchantId', 'merchantNumber', 'publicKey', 'privateKey'],
      'labels': [
        'Merchant ID',
        'Merchant Wallet Number',
        'Public Key',
        'Private Key'
      ],
      'secrets': ['publicKey', 'privateKey'],
    },
    'rocket': {
      'title': 'Rocket',
      'fields': ['merchant_id', 'api_key'],
      'labels': ['Merchant / Account ID', 'API Key'],
      'secrets': ['api_key'],
    },
    'bank': {
      'title': 'Bank',
      'fields': [
        'bank_name',
        'branch',
        'account_name',
        'account_number',
        'instructions'
      ],
      'labels': [
        'Bank Name',
        'Branch',
        'Account Name',
        'Account Number',
        'Instructions'
      ],
      'secrets': [],
    },
    'sslcommerz': {
      'title': 'SSLCommerz',
      'fields': ['store_id', 'store_password'],
      'labels': ['Store ID', 'Store Password'],
      'secrets': ['store_password'],
    },
    'shurjopay': {
      'title': 'ShurjoPay',
      'fields': ['username', 'password', 'prefix'],
      'labels': ['Username', 'Password', 'Prefix'],
      'secrets': ['password'],
    },
  };

  @override
  void initState() {
    super.initState();
    for (final entry in _gateways.entries) {
      final map = <String, TextEditingController>{};
      for (final key in entry.value['fields'] as List) {
        map[key] = TextEditingController();
      }
      _fields[entry.key] = map;
      _enabled[entry.key] = false;
      _environment[entry.key] = 'sandbox';
    }
    _load();
  }

  @override
  void dispose() {
    _companyController.dispose();
    _slugController.dispose();
    for (final map in _fields.values) {
      for (final controller in map.values) {
        controller.dispose();
      }
    }
    super.dispose();
  }

  Future<void> _load() async {
    final companyId = int.tryParse(_companyController.text.trim());
    if (_scope == 'customer' && (companyId == null || companyId <= 0)) {
      setState(() {
        _error = 'ISP account à¦¦à§‡à¦–à¦¤à§‡ Company ID à¦²à¦¿à¦–à§à¦¨à¥¤';
        _configs.clear();
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await ApiService.superPaymentGateways(
        _scope,
        companyId: _scope == 'customer' ? companyId : null,
      );
      final rows = (result['gateways'] as List? ?? []);
      for (final item in rows) {
        final row = Map<String, dynamic>.from(item as Map);
        final gateway = row['gateway'].toString();
        if (!_gateways.containsKey(gateway)) continue;
        _configs[gateway] = row;
        _enabled[gateway] = row['enabled'] == true || row['enabled'] == 1;
        _environment[gateway] =
            row['environment']?.toString() == 'live' ? 'live' : 'sandbox';
        final publicValues = Map<String, dynamic>.from(
          row['credentials_public'] as Map? ?? {},
        );
        final savedValues = Map<String, dynamic>.from(
          row['credentials_set'] as Map? ?? {},
        );
        _saved[gateway] = savedValues;
        for (final entry in publicValues.entries) {
          _fields[gateway]?[entry.key]?.text = entry.value.toString();
        }
        for (final key in (_gateways[gateway]!['secrets'] as List)) {
          _fields[gateway]?[key]?.clear();
        }
      }
      final centralConfig = _configs['nagad'];
      final settings = Map<String, dynamic>.from(
        centralConfig?['settings'] as Map? ?? {},
      );
      if (_scope == 'customer') {
        _slugController.text = settings['slug']?.toString() ?? '';
      } else {
        _slugController.clear();
      }
      if (mounted) setState(() {});
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save(String gateway) async {
    if (gateway == 'rocket' || gateway == 'bank') return;
    final companyId = int.tryParse(_companyController.text.trim());
    if (_scope == 'customer' && (companyId == null || companyId <= 0)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('à¦¸à¦ à¦¿à¦• Company ID à¦¦à¦¿à¦¨à¥¤')),
      );
      return;
    }
    setState(() => _saving.add(gateway));
    try {
      final credentials = <String, String>{};
      for (final entry in _fields[gateway]!.entries) {
        credentials[entry.key] = entry.value.text.trim();
      }
      final result = await ApiService.superSavePaymentGateway(
        scope: _scope,
        gateway: gateway,
        companyId: _scope == 'customer' ? companyId : null,
        enabled: _enabled[gateway] ?? false,
        environment: _environment[gateway] ?? 'sandbox',
        credentials: credentials,
        settings: _scope == 'customer' && _slugController.text.trim().isNotEmpty
            ? {'slug': _slugController.text.trim()}
            : {},
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result['message']?.toString() ?? 'Saved')),
      );
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
    } finally {
      if (mounted) setState(() => _saving.remove(gateway));
    }
  }

  Widget _gatewayCard(String gateway, Map<String, dynamic> info) {
    final title = info['title'].toString();
    final fields = info['fields'] as List;
    final labels = info['labels'] as List;
    final secrets = info['secrets'] as List;
    final readOnly = gateway == 'rocket' || gateway == 'bank';
    final saved = _saved[gateway] ?? {};
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ExpansionTile(
        initiallyExpanded: gateway == 'bkash',
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
        subtitle: Text(readOnly
            ? 'Manual Submit only'
            : ((_enabled[gateway] ?? false) ? 'Enabled' : 'Disabled')),
        trailing: Icon(
          readOnly
              ? Icons.info_outline
              : ((_enabled[gateway] ?? false)
                  ? Icons.check_circle
                  : Icons.radio_button_unchecked),
        ),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          if (readOnly)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Text(
                'à¦à¦‡ gateway-à¦à¦° payment-confirmation API à¦¨à§‡à¦‡à¥¤ Web-à¦à¦° à¦®à¦¤à§‹à¦‡ à¦à¦Ÿà¦¿ Manual Submit-à¦ à¦¥à¦¾à¦•à¦¬à§‡; à¦•à§‹à¦¨à§‹ configuration Save à¦¹à¦¬à§‡ à¦¨à¦¾.',
              ),
            )
          else ...[
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Enable gateway'),
              value: _enabled[gateway] ?? false,
              onChanged: (value) => setState(() => _enabled[gateway] = value),
            ),
            DropdownButtonFormField<String>(
              value: _environment[gateway],
              decoration: const InputDecoration(labelText: 'Environment'),
              items: const [
                DropdownMenuItem(value: 'sandbox', child: Text('Sandbox')),
                DropdownMenuItem(value: 'live', child: Text('Live')),
              ],
              onChanged: (value) {
                if (value != null)
                  setState(() => _environment[gateway] = value);
              },
            ),
            const SizedBox(height: 12),
            for (var i = 0; i < fields.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: TextField(
                  controller: _fields[gateway]![fields[i]],
                  obscureText: secrets.contains(fields[i]),
                  minLines: fields[i] == 'instructions' ? 2 : 1,
                  maxLines: fields[i] == 'instructions' ? 4 : 1,
                  decoration: InputDecoration(
                    labelText: labels[i],
                    border: const OutlineInputBorder(),
                    helperText: secrets.contains(fields[i]) &&
                            (saved[fields[i]] == true || saved[fields[i]] == 1)
                        ? 'Secret saved à¦†à¦›à§‡à¥¤ à¦«à¦¾à¦à¦•à¦¾ à¦°à¦¾à¦–à¦²à§‡ à¦†à¦—à§‡à¦° à¦®à¦¾à¦¨ à¦¥à¦¾à¦•à¦¬à§‡à¥¤'
                        : null,
                  ),
                ),
              ),
            if (gateway == 'sslcommerz')
              const Align(
                alignment: Alignment.centerLeft,
                child: Text('Currency: BDT'),
              ),
            if (gateway == 'nagad')
              const Align(
                alignment: Alignment.centerLeft,
                child: Text('Callback URL: Server managed'),
              ),
            if (gateway == 'bkash' || gateway == 'shurjopay')
              const Align(
                alignment: Alignment.centerLeft,
                child: Text('Callback URL: Server managed'),
              ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed:
                    _saving.contains(gateway) ? null : () => _save(gateway),
                child: Text(_saving.contains(gateway) ? 'Saving...' : 'Save '),
              ),
            ),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AdminScaffold(
      current: 'payment_gateways',
      title: 'Payment Gateways',
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text(
              'Merchant Account',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: _scope,
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                labelText: 'Account scope',
              ),
              items: const [
                DropdownMenuItem(
                  value: 'central',
                  child:
                      Text('Central - Software fee (registration / monthly)'),
                ),
                DropdownMenuItem(
                  value: 'customer',
                  child: Text('ISP account - Customer bills'),
                ),
              ],
              onChanged: _loading
                  ? null
                  : (value) {
                      if (value == null) return;
                      setState(() {
                        _scope = value;
                        _configs.clear();
                        _saved.clear();
                      });
                      _load();
                    },
            ),
            if (_scope == 'customer') ...[
              const SizedBox(height: 12),
              TextField(
                controller: _companyController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Company ID',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _slugController,
                decoration: const InputDecoration(
                  labelText: 'Customer Payment Link Name (optional)',
                  hintText: '3-40 lowercase letters, digits or hyphens',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 10),
              FilledButton.tonal(
                onPressed: _loading ? null : _load,
                child: const Text('Load ISP Gateways'),
              ),
            ],
            const SizedBox(height: 16),
            const Card(
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Text(
                  'Security: Secret credentials are never displayed after loading. Leave a secret field blank to keep its saved value. Rocket and Bank do not support automatic payment confirmation and remain Manual Submit.',
                ),
              ),
            ),
            if (_loading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(),
                ),
              ),
            if (_error != null)
              Card(
                child: ListTile(
                  leading: const Icon(Icons.error_outline, color: Colors.red),
                  title: Text(_error!),
                  trailing: IconButton(
                    icon: const Icon(Icons.refresh),
                    onPressed: _load,
                  ),
                ),
              ),
            for (final entry in _gateways.entries)
              _gatewayCard(entry.key, entry.value),
          ],
        ),
      ),
    );
  }
}
