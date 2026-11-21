import 'package:material_ui/material_ui.dart';
import '../core/format.dart';
import '../services/api_service.dart';
import '../widgets/admin_scaffold.dart';

class SaManualPaymentScreen extends StatefulWidget {
  const SaManualPaymentScreen({super.key});

  @override
  State<SaManualPaymentScreen> createState() => _SaManualPaymentScreenState();
}

class _SaManualPaymentScreenState extends State<SaManualPaymentScreen> {
  List<Map<String, dynamic>> _bills = [];
  List<Map<String, dynamic>> _pending = [];
  bool _loading = true;
  bool _billingLoadingMore = false;
  int _billingPage = 1;
  int _billingTotal = 0;
  String? _error;
  final Set<int> _processing = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final results = await Future.wait([
        ApiService.softwareBills(status: '', page: 1),
        ApiService.manualPendingPayments(),
      ]);

      if (!mounted) return;
      final billingData = Map<String, dynamic>.from(results[0] as Map);
      final items = (billingData['items'] as List? ?? [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();

      setState(() {
        _bills = items;
        _billingPage = 1;
        _billingTotal = numOf(billingData['total']).toInt();
        _pending = results[1] as List<Map<String, dynamic>>;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadMoreBills() async {
    if (_billingLoadingMore || _bills.length >= _billingTotal) return;

    setState(() => _billingLoadingMore = true);
    try {
      final nextPage = _billingPage + 1;
      final data = await ApiService.softwareBills(page: nextPage);
      final items = (data['items'] as List? ?? [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();

      if (!mounted) return;
      setState(() {
        _bills.addAll(items);
        _billingPage = nextPage;
        _billingTotal = numOf(data['total']).toInt();
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => _billingLoadingMore = false);
    }
  }

  Future<void> _review(int id, bool approve) async {
    final decision = approve ? 'Approve' : 'Reject';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('$decision Manual Payment?'),
        content: Text(
          approve
              ? 'এই পেমেন্ট অনুমোদন করলে সংশ্লিষ্ট Billing ও Invoice Paid হবে।'
              : 'এই পেমেন্ট Reject করলে Billing Unpaid থাকবে।',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(decision),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() => _processing.add(id));
    try {
      final result = approve
          ? await ApiService.approveManualPayment(id)
          : await ApiService.rejectManualPayment(id);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${result['message'] ?? 'Completed'}')),
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => _processing.remove(id));
    }
  }

  Widget _sectionTitle(String title, int count) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 18, 14, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(title,
                style:
                    const TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
          ),
          Chip(label: Text('$count')),
        ],
      ),
    );
  }

  Widget _billingTile(Map<String, dynamic> b) {
    final unpaid = '${b['status']}'.toLowerCase() == 'unpaid';
    final company = '${b['company_name'] ?? ''}'.trim();
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      child: ListTile(
        title: Text(
            company.isEmpty ? 'Company #${b['company_id'] ?? ''}' : company),
        subtitle: Text(
          'Billing #${b['id'] ?? ''} • ${b['billing_type'] ?? ''}'
          '${b['package_code'] == null ? '' : ' • ${b['package_code']}'}',
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(taka(numOf(b['amount'])),
                style: const TextStyle(fontWeight: FontWeight.bold)),
            Text(unpaid ? 'Unpaid' : 'Paid',
                style: TextStyle(
                    color: unpaid ? Colors.red : Colors.green,
                    fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }

  Widget _pendingTile(Map<String, dynamic> p) {
    final id = numOf(p['id']).toInt();
    final busy = _processing.contains(id);
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${p['user_name'] ?? 'User #${p['user_id']}'}',
                style:
                    const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 5),
            Text('Payment #$id • Billing #${p['billing_id']}'),
            Text('Company #${p['company_id']} • ${p['billing_type'] ?? ''}'),
            Text('Package: ${p['package_code'] ?? '-'}'),
            Text(
                'Method: ${p['payment_mode']} • Reference: ${p['reference_no'] ?? '-'}'),
            Text(
                'Amount: ${taka(numOf(p['amount']))} ${p['currency'] ?? 'BDT'}'),
            if ('${p['payment_note'] ?? ''}'.trim().isNotEmpty)
              Text('Note: ${p['payment_note']}'),
            if (p['created_at'] != null)
              Text('Submitted: ${p['created_at']}',
                  style: const TextStyle(color: Colors.grey, fontSize: 12)),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: busy ? null : () => _review(id, false),
                    child: const Text('Reject'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    onPressed: busy ? null : () => _review(id, true),
                    child: busy
                        ? const SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Approve'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AdminScaffold(
      current: 'sa_manual_payment',
      title: 'Manual Payment',
      actions: [
        IconButton(
          onPressed: _loading ? null : _load,
          icon: const Icon(Icons.refresh),
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
                      const SizedBox(height: 10),
                      ElevatedButton(
                        onPressed: _load,
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    children: [
                      _sectionTitle('Pending Manual Payments', _pending.length),
                      if (_pending.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(16),
                          child: Text('No pending manual payments.',
                              textAlign: TextAlign.center),
                        )
                      else
                        ..._pending.map(_pendingTile),
                      _sectionTitle('Software Billing', _bills.length),
                      if (_bills.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(16),
                          child: Text('No billing records.',
                              textAlign: TextAlign.center),
                        )
                      else
                        ..._bills.map(_billingTile),
                      if (_bills.length < _billingTotal)
                        Padding(
                          padding: const EdgeInsets.all(16),
                          child: Center(
                            child: OutlinedButton(
                              onPressed:
                                  _billingLoadingMore ? null : _loadMoreBills,
                              child: _billingLoadingMore
                                  ? const SizedBox(
                                      height: 18,
                                      width: 18,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2),
                                    )
                                  : const Text('Load More'),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
    );
  }
}
