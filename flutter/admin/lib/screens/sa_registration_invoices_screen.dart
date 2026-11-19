import 'package:flutter/material.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../services/api_service.dart';
import '../widgets/admin_scaffold.dart';

class SaRegistrationInvoicesScreen extends StatefulWidget {
  const SaRegistrationInvoicesScreen({super.key});

  @override
  State<SaRegistrationInvoicesScreen> createState() =>
      _SaRegistrationInvoicesScreenState();
}

class _SaRegistrationInvoicesScreenState
    extends State<SaRegistrationInvoicesScreen> {
  List<Map<String, dynamic>> _rows = [];
  Map<String, dynamic> _summary = {};
  bool _loading = false;
  String? _error;
  String _filter = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await ApiService.registrationInvoices();
      if (!mounted) return;
      final list = (result['rows'] as List? ?? [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      setState(() {
        _rows = list;
        _summary = Map<String, dynamic>.from(result['summary'] ?? {});
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _date(dynamic value) {
    if (value == null || '$value'.isEmpty) return '-';
    final parsed = DateTime.tryParse('$value');
    if (parsed == null) return '$value';
    return '${parsed.day.toString().padLeft(2, '0')}-'
        '${parsed.month.toString().padLeft(2, '0')}-${parsed.year} '
        '${parsed.hour.toString().padLeft(2, '0')}:'
        '${parsed.minute.toString().padLeft(2, '0')}';
  }

  Widget _summaryCard(String title, dynamic value, Color color) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 4),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.skyLight,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: const TextStyle(fontSize: 12, color: AppColors.muted)),
            const SizedBox(height: 5),
            Text('$value',
                style: TextStyle(
                    fontSize: 20, fontWeight: FontWeight.bold, color: color)),
          ],
        ),
      ),
    );
  }

  Future<void> _details(Map<String, dynamic> row) async {
    final id = int.tryParse('${row['id']}');
    if (id == null) return;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => const Center(
        child: CircularProgressIndicator(),
      ),
    );

    Map<String, dynamic>? invoice;
    String? error;
    try {
      invoice = await ApiService.registrationInvoiceDetail(id);
    } catch (e) {
      error = e.toString().replaceFirst('Exception: ', '');
    }

    if (!mounted) return;
    Navigator.of(context, rootNavigator: true).pop();

    if (invoice == null || invoice.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error ?? 'Invoice details not found')),
      );
      return;
    }

    if (!mounted) return;
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Invoice #${invoice!['id']}'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _detailLine('Customer ID', invoice['user_id']),
              _detailLine('Customer Name', invoice['user_name']),
              _detailLine('Username', invoice['username']),
              _detailLine('Invoice Type', invoice['type']),
              _detailLine('Message Type', invoice['message_type']),
              _detailLine('Amount', taka(numOf(invoice['amount']))),
              _detailLine('Status', invoice['status']),
              _detailLine('Invoice Date', _date(invoice['invoice_date'])),
              _detailLine('Due Date', _date(invoice['due_date'])),
              _detailLine('Paid Date', _date(invoice['paid_date'])),
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
  }

  Widget _detailLine(String label, dynamic value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 112,
            child: Text(label, style: const TextStyle(color: AppColors.muted)),
          ),
          Expanded(
            child: Text(value == null || '$value'.isEmpty ? '-' : '$value',
                style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }

  Widget _invoiceTile(Map<String, dynamic> row) {
    final status = '${row['status'] ?? ''}'.toLowerCase();
    final paid = status == 'paid';
    final color = paid
        ? AppColors.teal
        : status == 'unpaid'
            ? AppColors.pink
            : AppColors.muted;
    final user = '${row['user_name'] ?? ''}'.isEmpty
        ? 'User #${row['user_id']}'
        : '${row['user_name']}';

    return Card(
      margin: const EdgeInsets.fromLTRB(12, 5, 12, 5),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => _details(row),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text('Invoice #${row['id']}',
                        style: const TextStyle(
                            fontWeight: FontWeight.bold, fontSize: 16)),
                  ),
                  Text(status.isEmpty ? 'UNKNOWN' : status.toUpperCase(),
                      style:
                          TextStyle(color: color, fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(height: 5),
              Text(user, style: const TextStyle(fontSize: 14)),
              if ('${row['username'] ?? ''}'.isNotEmpty)
                Text('${row['username']}',
                    style: const TextStyle(color: AppColors.muted)),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: Text(taka(numOf(row['amount'])),
                        style: const TextStyle(
                            fontWeight: FontWeight.bold, fontSize: 16)),
                  ),
                  const Icon(Icons.calendar_today,
                      size: 13, color: AppColors.muted),
                  const SizedBox(width: 5),
                  Text(_date(row['invoice_date']),
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.muted)),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                  'Due: ${_date(row['due_date'])}  |  '
                  'Paid: ${_date(row['paid_date'])}',
                  style: const TextStyle(fontSize: 12, color: AppColors.muted)),
              const SizedBox(height: 4),
              const Align(
                alignment: Alignment.centerRight,
                child: Text('View Details',
                    style: TextStyle(
                        color: AppColors.navy, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _rows.where((row) {
      if (_filter.isEmpty) return true;
      return '${row['status'] ?? ''}'.toLowerCase() == _filter;
    }).toList();

    return AdminScaffold(
      current: 'sa_registration_invoices',
      title: 'Registration Invoices',
      actions: [
        IconButton(
          tooltip: 'Refresh',
          onPressed: _loading ? null : _load,
          icon: const Icon(Icons.sync, size: 28),
        ),
      ],
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 10, 8, 6),
            child: Row(
              children: [
                _summaryCard(
                    'Total', _summary['total'] ?? _rows.length, AppColors.navy),
                _summaryCard('Paid', _summary['paid'] ?? 0, AppColors.teal),
                _summaryCard('Unpaid', _summary['unpaid'] ?? 0, AppColors.pink),
              ],
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Row(
              children: [
                ChoiceChip(
                  label: const Text('All'),
                  selected: _filter.isEmpty,
                  onSelected: (_) => setState(() => _filter = ''),
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: const Text('Paid'),
                  selected: _filter == 'paid',
                  onSelected: (_) => setState(() => _filter = 'paid'),
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: const Text('Unpaid'),
                  selected: _filter == 'unpaid',
                  onSelected: (_) => setState(() => _filter = 'unpaid'),
                ),
              ],
            ),
          ),
          Expanded(
            child: _loading && _rows.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : _error != null && _rows.isEmpty
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
                    : filtered.isEmpty
                        ? const Center(child: Text('No registration invoices'))
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.builder(
                              physics: const AlwaysScrollableScrollPhysics(),
                              itemCount: filtered.length,
                              itemBuilder: (_, index) =>
                                  _invoiceTile(filtered[index]),
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}
