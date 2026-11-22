import 'package:material_ui/material_ui.dart';
import '../core/format.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../core/tr.dart';
import '../services/employee_api.dart';
import '../widgets/lang_builder.dart';

/// একজন কর্মীর বেতন-ইতিহাস + নতুন বেতন প্রদান (শুধু Admin)।
/// Employee স্ক্রিন থেকে push করা হয়, তাই সাধারণ Scaffold (ব্যাক বোতামসহ)।
/// Backend: GET/POST/DELETE /admin/salaries/:staffId...
class SalaryScreen extends StatefulWidget {
  final int staffId;
  final String staffName;
  final num defaultSalary;
  const SalaryScreen({
    super.key,
    required this.staffId,
    required this.staffName,
    this.defaultSalary = 0,
  });

  @override
  State<SalaryScreen> createState() => _SalaryScreenState();
}

class _SalaryScreenState extends State<SalaryScreen> {
  List<Map<String, dynamic>> _items = [];
  num _totalPaid = 0;
  bool _loading = true;
  String? _error;

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
      final d = await EmployeeApi.salaryData(widget.staffId);
      if (!mounted) return;
      final raw = d['salaryList'];
      setState(() {
        _items = raw is List
            ? raw.map((e) => mapOf(e)).toList()
            : <Map<String, dynamic>>[];
        _totalPaid = numOf(d['totalPaid']);
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

  void _toast(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _pay() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _PayForm(
        staffId: widget.staffId,
        defaultSalary: widget.defaultSalary,
      ),
    );
    if (saved == true) {
      _toast(tr('বেতন সংরক্ষণ হয়েছে', 'Salary saved'));
      _load();
    }
  }

  Future<void> _delete(Map<String, dynamic> s) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('বেতনের রেকর্ড ডিলিট', 'Delete salary record')),
        content: Text(tr(
            '${s['year'] ?? ''}-${s['month'] ?? ''} মাসের ${taka(numOf(s['amount']))} রেকর্ডটি ডিলিট করবেন?',
            'Delete the ${s['year'] ?? ''}-${s['month'] ?? ''} record of ${taka(numOf(s['amount']))}?')),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(Lang.i.t('cancel'))),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(Lang.i.t('delete'),
                  style: const TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await EmployeeApi.deleteSalary(widget.staffId, numOf(s['id']).toInt());
      if (!mounted) return;
      _toast(tr('ডিলিট হয়েছে', 'Deleted'));
      _load();
    } catch (e) {
      if (!mounted) return;
      _toast(e.toString().replaceFirst('Exception: ', ''));
    }
  }

  Widget _body(Lang l) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(_error!, textAlign: TextAlign.center),
          ),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: _load, child: Text(l.t('retry'))),
        ]),
      );
    }
    if (_items.isEmpty) return Center(child: Text(l.t('no_data')));
    return ListView.separated(
      padding: const EdgeInsets.only(bottom: 80),
      itemCount: _items.length,
      separatorBuilder: (_, __) =>
          const Divider(height: 1, color: AppColors.line),
      itemBuilder: (_, i) {
        final s = _items[i];
        final month = numOf(s['month']).toInt();
        final year = numOf(s['year']).toInt();
        final comment = '${s['comment'] ?? ''}'.trim();
        final by = '${s['creator_name'] ?? ''}'.trim();
        final sub = [
          dateOnly(s['payment_date']),
          if (by.isNotEmpty) by,
          if (comment.isNotEmpty) comment,
        ].where((e) => e.isNotEmpty).join(' · ');
        return ListTile(
          title: Text(
            '${l.digits('$year')} - ${l.digits('$month')}',
            style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: AppColors.text),
          ),
          subtitle: Text(sub,
              style: const TextStyle(fontSize: 13, color: AppColors.muted)),
          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(taka(numOf(s['amount'])),
                style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppColors.navy)),
            IconButton(
              icon: const Icon(Icons.delete_outline, color: Colors.red),
              onPressed: () => _delete(s),
            ),
          ]),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      return Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(
          title: Text(widget.staffName, style: const TextStyle(fontSize: 20)),
          actions: [
            IconButton(
                icon: const Icon(Icons.sync, size: 28), onPressed: _load),
            const SizedBox(width: 4),
          ],
        ),
        floatingActionButton: FloatingActionButton.extended(
          heroTag: 'salary_pay',
          backgroundColor: AppColors.sky,
          foregroundColor: Colors.white,
          onPressed: _pay,
          icon: const Icon(Icons.add),
          label: Text(tr('বেতন দিন', 'Pay salary')),
        ),
        body: Column(children: [
          Container(
            width: double.infinity,
            color: AppColors.skyLight,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(tr('মোট প্রদত্ত', 'Total paid'),
                    style: const TextStyle(color: AppColors.navy)),
                Text(taka(_totalPaid),
                    style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: AppColors.navy)),
              ],
            ),
          ),
          Expanded(child: _body(l)),
        ]),
      );
    });
  }
}

/// বেতন প্রদানের ফর্ম। সফল হলে `true` নিয়ে বন্ধ হয়।
/// একই কর্মীর একই মাসে দ্বিতীয়বার দেওয়া যায় না (Backend ৪০৯ বার্তা দেখানো হয়)।
class _PayForm extends StatefulWidget {
  final int staffId;
  final num defaultSalary;
  const _PayForm({required this.staffId, required this.defaultSalary});

  @override
  State<_PayForm> createState() => _PayFormState();
}

class _PayFormState extends State<_PayForm> {
  late int _year;
  late int _month;
  late final TextEditingController _amount;
  final _comment = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _year = now.year;
    _month = now.month;
    _amount = TextEditingController(
        text: widget.defaultSalary > 0 ? '${widget.defaultSalary}' : '');
  }

  @override
  void dispose() {
    _amount.dispose();
    _comment.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final amount = num.tryParse(_amount.text.trim());
    if (amount == null || amount <= 0) {
      setState(() => _error =
          tr('অংক শূন্যের বেশি দিন', 'Amount must be greater than zero'));
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await EmployeeApi.paySalary(
        widget.staffId,
        year: _year,
        month: _month,
        amount: amount,
        comment: _comment.text.trim(),
      );
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = Lang.i;
    final thisYear = DateTime.now().year;
    final years = [for (var y = thisYear - 3; y <= thisYear + 1; y++) y];
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(tr('বেতন প্রদান', 'Pay salary'),
                  style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppColors.navy)),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(
                  child: DropdownButtonFormField<int>(
                    value: _year,
                    decoration: InputDecoration(
                      labelText: tr('বছর', 'Year'),
                      isDense: true,
                      border: const OutlineInputBorder(),
                    ),
                    items: years
                        .map((y) => DropdownMenuItem(
                            value: y, child: Text(l.digits('$y'))))
                        .toList(),
                    onChanged: (v) {
                      if (v != null) setState(() => _year = v);
                    },
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: DropdownButtonFormField<int>(
                    value: _month,
                    decoration: InputDecoration(
                      labelText: tr('মাস', 'Month'),
                      isDense: true,
                      border: const OutlineInputBorder(),
                    ),
                    items: [for (var m = 1; m <= 12; m++) m]
                        .map((m) => DropdownMenuItem(
                            value: m, child: Text(l.digits('$m'))))
                        .toList(),
                    onChanged: (v) {
                      if (v != null) setState(() => _month = v);
                    },
                  ),
                ),
              ]),
              const SizedBox(height: 10),
              TextField(
                controller: _amount,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(
                  labelText: tr('অংক (৳)', 'Amount (৳)'),
                  isDense: true,
                  border: const OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _comment,
                maxLines: 2,
                decoration: InputDecoration(
                  labelText: tr('মন্তব্য', 'Comment'),
                  isDense: true,
                  border: const OutlineInputBorder(),
                ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(_error!, style: const TextStyle(color: Colors.red)),
                ),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _saving ? null : () => Navigator.pop(context, false),
                    child: Text(l.t('cancel')),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    onPressed: _saving ? null : _save,
                    child: _saving
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : Text(l.t('save')),
                  ),
                ),
              ]),
            ],
          ),
        ),
      ),
    );
  }
}
