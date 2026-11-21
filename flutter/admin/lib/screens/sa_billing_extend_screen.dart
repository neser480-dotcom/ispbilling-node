import 'package:material_ui/material_ui.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../services/api_service.dart';
import '../widgets/admin_scaffold.dart';

class SaBillingExtendScreen extends StatefulWidget {
  const SaBillingExtendScreen({super.key});

  @override
  State<SaBillingExtendScreen> createState() => _SaBillingExtendScreenState();
}

class _SaBillingExtendScreenState extends State<SaBillingExtendScreen> {
  List<Map<String, dynamic>> _rows = [];
  bool _loading = true;
  String? _error;
  final Set<int> _busy = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  DateTime? _parseDate(dynamic value) {
    if (value == null || '$value'.isEmpty) return null;
    return DateTime.tryParse('$value'.replaceFirst(' ', 'T'));
  }

  String _dateText(DateTime value) {
    String two(int n) => n.toString().padLeft(2, '0');
    return '${value.year}-${two(value.month)}-${two(value.day)} '
        '${two(value.hour)}:${two(value.minute)}';
  }

  String _apiDate(DateTime value) {
    return _dateText(value).replaceFirst(' ', 'T');
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = await ApiService.superBillingExtendList();
      if (!mounted) return;
      setState(() {
        _rows = rows;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _extend(Map<String, dynamic> bill) async {
    final id = numOf(bill['id']).toInt();
    final oldDue = _parseDate(bill['due_date']);
    if (id <= 0 || oldDue == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Invalid billing date or ID.')),
      );
      return;
    }

    final now = DateTime.now();
    final isOverdue = bill['overdue'] == true ||
        bill['overdue'] == 1 ||
        '${bill['overdue']}' == '1';
    final base = isOverdue ? now : oldDue;
    DateTime selected = base.add(const Duration(days: 7));

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, refresh) {
          Future<void> chooseDate() async {
            final pageContext = context;
            final current = DateTime.now();
            final picked = await showDatePicker(
              context: pageContext,
              initialDate: selected.isBefore(current) ? current : selected,
              firstDate: DateTime(current.year, current.month, current.day),
              lastDate: current.add(const Duration(days: 90)),
            );
            if (!pageContext.mounted || picked == null) return;
            final time = await showTimePicker(
              context: pageContext,
              initialTime: TimeOfDay.fromDateTime(selected),
            );
            if (!pageContext.mounted || time == null) return;
            refresh(() {
              selected = DateTime(
                picked.year,
                picked.month,
                picked.day,
                time.hour,
                time.minute,
              );
            });
          }

          void addDays(int days) {
            refresh(() => selected = selected.add(Duration(days: days)));
          }

          return AlertDialog(
            title: const Text('Extend Due Date'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Current due date: ${_dateText(oldDue)}'),
                const SizedBox(height: 14),
                OutlinedButton.icon(
                  onPressed: chooseDate,
                  icon: const Icon(Icons.calendar_month),
                  label: Text(_dateText(selected)),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    OutlinedButton(
                      onPressed: () => addDays(3),
                      child: const Text('+3 days'),
                    ),
                    OutlinedButton(
                      onPressed: () => addDays(7),
                      child: const Text('+7 days'),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  'Maximum extension: 90 days from today.',
                  style: TextStyle(fontSize: 12, color: AppColors.muted),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('Extend'),
              ),
            ],
          );
        },
      ),
    );

    if (confirmed != true || !mounted) return;

    final current = DateTime.now();
    if (!selected.isAfter(current) ||
        selected.isAfter(current.add(const Duration(days: 90)))) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Choose a future date within 90 days.')),
      );
      return;
    }

    setState(() => _busy.add(id));
    try {
      final result = await ApiService.superExtendBillingDueDate(
        id,
        _apiDate(selected),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${result['message'] ?? 'Due date extended.'}')),
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => _busy.remove(id));
    }
  }

  Widget _billCard(Map<String, dynamic> bill) {
    final id = numOf(bill['id']).toInt();
    final overdue = bill['overdue'] == true ||
        bill['overdue'] == 1 ||
        '${bill['overdue']}' == '1';
    final due = '${bill['due_date'] ?? '—'}';
    final original = '${bill['original_due_date'] ?? '—'}';
    final name = '${bill['user_name'] ?? ''}'.trim();
    final company = name.isEmpty ? 'User #${bill['user_id']}' : name;
    final package = '${bill['package_code'] ?? '—'}';

    return Card(
      margin: const EdgeInsets.fromLTRB(12, 6, 12, 6),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    company,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                      color: AppColors.text,
                    ),
                  ),
                ),
                Text(
                  overdue ? 'Overdue' : 'Unpaid',
                  style: TextStyle(
                    color: overdue ? AppColors.pink : AppColors.navy,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text('Company ID: ${bill['company_id']}  •  Billing ID: $id'),
            Text('Package: $package'),
            Text('Amount: ${taka(numOf(bill['amount']))}'),
            const SizedBox(height: 6),
            Text('Due date: $due'),
            Text('Original due date: $original'),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.icon(
                onPressed: _busy.contains(id) ? null : () => _extend(bill),
                icon: _busy.contains(id)
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.calendar_month),
                label: const Text('Extend'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AdminScaffold(
      current: 'sa_billing_extend',
      title: 'Extend Due Date',
      actions: [
        IconButton(
          onPressed: _loading ? null : _load,
          icon: const Icon(Icons.sync),
        ),
      ],
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? ListView(
                    children: [
                      const SizedBox(height: 100),
                      Center(child: Text(_error!)),
                      Center(
                        child: TextButton(
                          onPressed: _load,
                          child: const Text('Retry'),
                        ),
                      ),
                    ],
                  )
                : _rows.isEmpty
                    ? ListView(
                        children: const [
                          SizedBox(height: 120),
                          Center(child: Text('No unpaid monthly bills.')),
                        ],
                      )
                    : ListView.builder(
                        physics: const AlwaysScrollableScrollPhysics(),
                        itemCount: _rows.length,
                        itemBuilder: (_, index) => _billCard(_rows[index]),
                      ),
      ),
    );
  }
}
