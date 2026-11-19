import 'package:flutter/material.dart';
import '../services/api_service.dart';

class RegistrationScreen extends StatefulWidget {
  const RegistrationScreen({super.key});

  @override
  State<RegistrationScreen> createState() => _RegistrationScreenState();
}

class _RegistrationScreenState extends State<RegistrationScreen> {
  final _formKey = GlobalKey<FormState>();

  final Map<String, TextEditingController> _fields = {
    'name': TextEditingController(),
    'company_name': TextEditingController(),
    'mobile': TextEditingController(),
    'email': TextEditingController(),
    'username': TextEditingController(),
    'password': TextEditingController(),
    'address': TextEditingController(),
    'nid': TextEditingController(),
    'reference_name': TextEditingController(),
    'reference_mobile': TextEditingController(),
  };

  List<Map<String, dynamic>> _packages = [];
  String? _csrfToken;
  int? _packageId;
  String _customerType = 'PPPoE';
  bool _loading = true;
  bool _submitting = false;
  bool _showPassword = false;
  String? _error;
  String? _successCustomerId;

  Map<String, dynamic>? get _selectedPackage {
    for (final item in _packages) {
      if (int.tryParse('${item['id']}') == _packageId) {
        return item;
      }
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
    for (final controller in _fields.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final data = await ApiService.registrationData();
      final raw = data['packages'] as List? ?? [];

      if (!mounted) return;

      setState(() {
        _csrfToken = data['csrf_token']?.toString();
        _packages = raw.map((e) => Map<String, dynamic>.from(e)).toList();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _message(e);
        _loading = false;
      });
    }
  }

  String _message(Object error) =>
      error.toString().replaceFirst('Exception: ', '');

  String _money(dynamic value) {
    final amount = double.tryParse('$value') ?? 0;
    return amount.toStringAsFixed(2);
  }

  String? _required(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'এই তথ্যটি পূরণ করুন';
    }
    return null;
  }

  Widget _field(
    String key,
    String label, {
    bool required = false,
    TextInputType keyboard = TextInputType.text,
    bool password = false,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 13),
      child: TextFormField(
        controller: _fields[key],
        obscureText: password && !_showPassword,
        keyboardType: keyboard,
        autocorrect: false,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          suffixIcon: password
              ? IconButton(
                  onPressed: () =>
                      setState(() => _showPassword = !_showPassword),
                  icon: Icon(
                    _showPassword ? Icons.visibility_off : Icons.visibility,
                  ),
                )
              : null,
        ),
        validator: (value) {
          if (required) {
            final error = _required(value);
            if (error != null) return error;
          }

          if (key == 'email' &&
              value != null &&
              value.trim().isNotEmpty &&
              !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value.trim())) {
            return 'সঠিক ই-মেইল লিখুন';
          }

          if (key == 'username' &&
              value != null &&
              !RegExp(r'^[a-zA-Z0-9._-]{3,50}$').hasMatch(value.trim())) {
            return 'ইউজারনেম ৩-৫০ অক্ষর হতে হবে';
          }

          if (key == 'password' &&
              value != null &&
              (value.length < 8 || value.length > 72)) {
            return 'পাসওয়ার্ড ৮-৭২ অক্ষরের হতে হবে';
          }

          return null;
        },
      ),
    );
  }

  Future<void> _submit() async {
    if (_submitting) return;

    if (!_formKey.currentState!.validate()) return;

    if (_csrfToken == null || _csrfToken!.isEmpty) {
      setState(() => _error = 'Security token পাওয়া যায়নি। আবার চেষ্টা করুন।');
      return;
    }

    if (_packageId == null) {
      setState(() => _error = 'একটি প্যাকেজ নির্বাচন করুন');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final values = <String, dynamic>{};

      for (final entry in _fields.entries) {
        values[entry.key] = entry.value.text.trim();
      }

      values['package_id'] = _packageId.toString();
      values['customer_type'] = _customerType;
      values['csrf_token'] = _csrfToken!;
      values['register'] = '1';

      final result = await ApiService.registerIsp(values);

      if (result['success'] != true) {
        throw Exception(result['message'] ?? 'Registration ব্যর্থ হয়েছে');
      }

      if (!mounted) return;

      setState(() {
        _csrfToken = result['csrf_token']?.toString() ?? _csrfToken;
        _successCustomerId = '${result['customer_id'] ?? ''}';
        _fields['password']!.clear();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = _message(e));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Widget _packageDetails() {
    final pkg = _selectedPackage;
    if (pkg == null) {
      return const Text('প্যাকেজ নির্বাচন করলে বিস্তারিত দেখাবে');
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.blue.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Package: ${pkg['package_name'] ?? pkg['package_code']}'),
          Text('Customers: ${pkg['customer_limit'] ?? 0}'),
          Text('Sign-up Fee: ৳${_money(pkg['signup_fee'])}'),
          Text('Monthly Fee: ৳${_money(pkg['monthly_fee'])}'),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('ISP Registration'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _successCustomerId != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.check_circle,
                          color: Colors.green,
                          size: 64,
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          'Registration সফল হয়েছে',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 12),
                        SelectableText(
                          'Customer ID: $_successCustomerId',
                          style: const TextStyle(fontSize: 18),
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          'আপনার Registration সম্পন্ন হয়েছে। '
                          'এখন Login করতে পারবেন।',
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 20),
                        ElevatedButton(
                          onPressed: () => Navigator.pop(context),
                          child: const Text('Login করুন'),
                        ),
                      ],
                    ),
                  ),
                )
              : _packages.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              _error ?? 'কোনো active package পাওয়া যায়নি',
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 12),
                            ElevatedButton(
                              onPressed: _loadData,
                              child: const Text('আবার চেষ্টা করুন'),
                            ),
                          ],
                        ),
                      ),
                    )
                  : Form(
                      key: _formKey,
                      child: ListView(
                        padding: const EdgeInsets.all(18),
                        children: [
                          const Text(
                            'Amader Bill Registration',
                            style: TextStyle(
                              fontSize: 23,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 18),
                          if (_error != null) ...[
                            Text(
                              _error!,
                              style: const TextStyle(color: Colors.red),
                            ),
                            const SizedBox(height: 12),
                          ],
                          _field('name', 'নাম', required: true),
                          _field(
                            'company_name',
                            'প্রতিষ্ঠানের নাম',
                            required: true,
                          ),
                          _field(
                            'mobile',
                            'মোবাইল',
                            required: true,
                            keyboard: TextInputType.phone,
                          ),
                          _field(
                            'email',
                            'ই-মেইল',
                            required: true,
                            keyboard: TextInputType.emailAddress,
                          ),
                          _field(
                            'username',
                            'ইউজারনেম',
                            required: true,
                          ),
                          _field(
                            'password',
                            'পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)',
                            required: true,
                            password: true,
                          ),
                          const SizedBox(height: 4),
                          DropdownButtonFormField<int>(
                            initialValue: _packageId,
                            isExpanded: true,
                            decoration: const InputDecoration(
                              labelText: 'প্যাকেজ নির্বাচন করুন',
                              border: OutlineInputBorder(),
                            ),
                            items: _packages.map((pkg) {
                              final id = int.tryParse('${pkg['id']}');
                              final title = '${pkg['package_code']} | '
                                  '${pkg['customer_limit']} Customers | '
                                  '৳${_money(pkg['signup_fee'])} Signup';

                              return DropdownMenuItem<int>(
                                value: id,
                                child: Text(
                                  title,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              );
                            }).toList(),
                            onChanged: _submitting
                                ? null
                                : (value) {
                                    setState(() {
                                      _packageId = value;
                                    });
                                  },
                          ),
                          const SizedBox(height: 12),
                          _packageDetails(),
                          const SizedBox(height: 18),
                          const Text(
                            'Connection Type',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                          RadioGroup<String>(
                            groupValue: _customerType,
                            onChanged: (value) {
                              if (value != null) {
                                setState(() => _customerType = value);
                              }
                            },
                            child: const Column(
                              children: [
                                RadioListTile<String>(
                                  value: 'PPPoE',
                                  title: Text('PPPoE'),
                                ),
                                RadioListTile<String>(
                                  value: 'Static',
                                  title: Text('Static'),
                                ),
                                RadioListTile<String>(
                                  value: 'Hotspot',
                                  title: Text('Hotspot'),
                                ),
                              ],
                            ),
                          ),
                          _field(
                            'address',
                            'এরিয়া / ঠিকানা',
                            required: true,
                          ),
                          _field('nid', 'NID'),
                          _field('reference_name', 'রেফারেন্স নাম'),
                          _field(
                            'reference_mobile',
                            'রেফারেন্স মোবাইল',
                            keyboard: TextInputType.phone,
                          ),
                          const SizedBox(height: 10),
                          ElevatedButton(
                            onPressed: _submitting ? null : _submit,
                            style: ElevatedButton.styleFrom(
                              minimumSize: const Size.fromHeight(50),
                            ),
                            child: _submitting
                                ? const SizedBox(
                                    height: 22,
                                    width: 22,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Text('রেজিস্টার'),
                          ),
                        ],
                      ),
                    ),
    );
  }
}
