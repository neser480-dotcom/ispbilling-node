import 'dart:async';
import 'package:material_ui/material_ui.dart';
import '../core/format.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../core/tr.dart';
import '../services/api_service.dart';
import '../services/recharge_api.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';
import '../widgets/letter_avatar.dart';

/// বাল্ক রিচার্জ: ধাপ ১ — গ্রাহক বাছাই, ধাপ ২ — amount দেখে/বদলে একসাথে রিচার্জ।
/// Backend: GET /admin/recharge/bulk/customers, POST /admin/recharge/bulk
/// (Permission: bulk_customer_recharge — Backend যাচাই করে; একবারে সর্বোচ্চ ৫০০ জন)
class BulkRechargeScreen extends StatefulWidget {
  const BulkRechargeScreen({super.key});

  @override
  State<BulkRechargeScreen> createState() => _BulkRechargeScreenState();
}

class _BulkRechargeScreenState extends State<BulkRechargeScreen> {
  static const int _maxBulk = 500;

  // ধাপ ১
  final _searchC = TextEditingController();
  Timer? _debounce;
  List<Map<String, dynamic>> _items = [];
  final Map<int, Map<String, dynamic>> _selected = {};
  int _page = 1;
  int _total = 0;
  bool _loading = true;
  bool _more = false;
  String? _error;

  // ধাপ ২
  bool _review = false;
  bool _reviewLoading = false;
  List<Map<String, dynamic>> _rows = [];
  final Map<int, TextEditingController> _amountC = {};
  String _billingType = 'monthly';
  String _medium = 'hand_cash';
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load(reset: true);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchC.dispose();
    for (final c in _amountC.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load({bool reset = false}) async {
    if (reset) {
      setState(() {
        _loading = true;
        _error = null;
        _page = 1;
      });
    } else {
      setState(() => _more = true);
    }
    try {
      final d = await ApiService.customers(
        search: _searchC.text.trim(),
        page: _page,
      );
      if (!mounted) return;
      final raw = d['items'];
      final list = raw is List
          ? raw.map((e) => mapOf(e)).toList()
          : <Map<String, dynamic>>[];
      setState(() {
        _items = reset ? list : [..._items, ...list];
        _total = numOf(d['total']).toInt();
        _loading = false;
        _more = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
        _more = false;
      });
    }
  }

  void _onSearch(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () => _load(reset: true));
  }

  void _toggle(Map<String, dynamic> c, bool on) {
    final id = numOf(c['id']).toInt();
    if (id <= 0) return;
    if (on && _selected.length >= _maxBulk && !_selected.containsKey(id)) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(tr('একসাথে সর্বোচ্চ $_maxBulk জন বাছাই করা যাবে।',
            'You can select up to $_maxBulk customers at once.')),
      ));
      return;
    }
    setState(() {
      if (on) {
        _selected[id] = c;
      } else {
        _selected.remove(id);
      }
    });
  }

  void _selectAllLoaded() {
    setState(() {
      for (final c in _items) {
        final id = numOf(c['id']).toInt();
        if (id <= 0) continue;
        if (_selected.length >= _maxBulk && !_selected.containsKey(id)) break;
        _selected[id] = c;
      }
    });
  }

  Future<void> _goReview() async {
    if (_selected.isEmpty) return;
    setState(() {
      _review = true;
      _reviewLoading = true;
      _error = null;
    });
    try {
      final d = await RechargeApi.bulkCustomers(_selected.keys.toList());
      if (!mounted) return;
      final raw = d['items'];
      final rows = raw is List
          ? raw.map((e) => mapOf(e)).toList()
          : <Map<String, dynamic>>[];
      for (final c in _amountC.values) {
        c.dispose();
      }
      _amountC.clear();
      for (final r in rows) {
        final id = numOf(r['id']).toInt();
        _amountC[id] = TextEditingController(text: _fmt(numOf(r['amount'])));
      }
      setState(() {
        _rows = rows;
        _reviewLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _reviewLoading = false;
      });
    }
  }

  String _fmt(num v) =>
      v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(2);

  double _amountOf(int id) =>
      double.tryParse((_amountC[id]?.text ?? '').trim().replaceAll(',', '')) ?? 0;

  double get _grandTotal {
    var s = 0.0;
    for (final r in _rows) {
      final a = _amountOf(numOf(r['id']).toInt());
      if (a > 0) s += a;
    }
    return s;
  }

  int get _validCount {
    var n = 0;
    for (final r in _rows) {
      if (_amountOf(numOf(r['id']).toInt()) > 0) n++;
    }
    return n;
  }

  void _removeRow(Map<String, dynamic> r) {
    final id = numOf(r['id']).toInt();
    setState(() {
      _rows.remove(r);
      _selected.remove(id);
      _amountC.remove(id)?.dispose();
    });
  }

  Future<void> _submit() async {
    final items = <Map<String, dynamic>>[];
    for (final r in _rows) {
      final id = numOf(r['id']).toInt();
      final a = _amountOf(id);
      if (id > 0 && a > 0) items.add({'customer_id': id, 'amount': a});
    }
    if (items.isEmpty) return;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('বাল্ক রিচার্জ নিশ্চিত করুন', 'Confirm bulk recharge')),
        content: Text(
          '${Lang.i.digits('${items.length}')} ${tr('জন গ্রাহক', 'customers')}\n'
          '${tr('মোট', 'Total')}: ${taka(_grandTotal)}',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(tr('বাতিল', 'Cancel'))),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(tr('রিচার্জ', 'Recharge'))),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    setState(() => _saving = true);
    try {
      final r = await RechargeApi.bulkRecharge(
        items: items,
        billingType: _billingType,
        medium: _medium,
      );
      if (!mounted) return;
      setState(() => _saving = false);
      await _showResult(r);
      if (!mounted) return;
      // সফল হলে শুরুতে ফিরে যাই
      setState(() {
        _review = false;
        _selected.clear();
        _rows = [];
      });
      _load(reset: true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(e.toString().replaceFirst('Exception: ', '')),
        backgroundColor: Colors.red,
      ));
    }
  }

  Future<void> _showResult(Map<String, dynamic> r) {
    final names = <int, String>{
      for (final row in _rows) numOf(row['id']).toInt(): '${row['name'] ?? ''}',
    };
    final failed = <String>[];
    final res = r['results'];
    if (res is List) {
      for (final e in res) {
        final m = mapOf(e);
        final okFlag = m['success'] == true || m['ok'] == true || m['status'] == 'success';
        if (okFlag) continue;
        final id = numOf(m['customer_id'] ?? m['id']).toInt();
        final who = names[id] ?? (id > 0 ? '#$id' : '');
        failed.add('$who: ${m['message'] ?? m['error'] ?? ''}');
      }
    }
    return showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('ফলাফল', 'Result')),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${r['message'] ?? ''}'),
              const SizedBox(height: 8),
              Text(
                '${tr('সফল', 'Success')}: ${Lang.i.digits('${numOf(r['ok'])}')}   '
                '${tr('ব্যর্থ', 'Failed')}: ${Lang.i.digits('${numOf(r['failed'])}')}   '
                '${tr('মোট', 'Total')}: ${taka(numOf(r['total_amount']))}',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              if (failed.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(tr('ব্যর্থ তালিকা:', 'Failed list:')),
                for (final f in failed)
                  Text('• $f', style: const TextStyle(color: Colors.red, fontSize: 13)),
              ],
            ],
          ),
        ),
        actions: [
          FilledButton(
              onPressed: () => Navigator.pop(ctx), child: Text(tr('ঠিক আছে', 'OK'))),
        ],
      ),
    );
  }

  // ------------------------------------------------------------ ধাপ ১ UI
  Widget _pickBody(Lang l) {
    Widget list;
    if (_loading) {
      list = const Center(child: CircularProgressIndicator());
    } else if (_error != null) {
      list = Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(_error!, textAlign: TextAlign.center),
          ),
          const SizedBox(height: 10),
          OutlinedButton(
              onPressed: () => _load(reset: true), child: Text(l.t('retry'))),
        ]),
      );
    } else if (_items.isEmpty) {
      list = Center(child: Text(l.t('no_data')));
    } else {
      final hasMore = _items.length < _total;
      list = ListView.separated(
        itemCount: _items.length + (hasMore ? 1 : 0),
        separatorBuilder: (_, __) => const Divider(height: 1, color: AppColors.line),
        itemBuilder: (_, i) {
          if (i >= _items.length) {
            return Padding(
              padding: const EdgeInsets.all(12),
              child: Center(
                child: _more
                    ? const CircularProgressIndicator()
                    : OutlinedButton(
                        onPressed: () {
                          _page += 1;
                          _load();
                        },
                        child: Text(tr('আরও দেখুন', 'Load more')),
                      ),
              ),
            );
          }
          final c = _items[i];
          final id = numOf(c['id']).toInt();
          final name = '${c['name'] ?? ''}';
          final bal = numOf(c['balance']);
          final sub = [
            '${c['customer_code'] ?? ''}',
            '${c['phone'] ?? ''}',
          ].where((e) => e.isNotEmpty).join(' · ');
          final on = _selected.containsKey(id);
          return CheckboxListTile(
            value: on,
            onChanged: (v) => _toggle(c, v == true),
            controlAffinity: ListTileControlAffinity.leading,
            secondary: LetterAvatar(text: name, radius: 20),
            title: Text(name,
                style: const TextStyle(
                    fontSize: 15, fontWeight: FontWeight.bold, color: AppColors.text)),
            subtitle: Text(
              '$sub\n${taka(numOf(c['monthly_bill']))}'
              '${bal < 0 ? '  ·  ${tr('বকেয়া', 'Due')} ${taka(-bal)}' : ''}',
              style: const TextStyle(fontSize: 12, color: AppColors.muted),
            ),
            isThreeLine: true,
          );
        },
      );
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
          child: Row(children: [
            Expanded(
              child: TextField(
                controller: _searchC,
                onChanged: _onSearch,
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search),
                  hintText: tr('নাম / মোবাইল / আইডি দিয়ে খুঁজুন', 'Search name / phone / ID'),
                  border: const OutlineInputBorder(),
                  isDense: true,
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton(
              tooltip: tr('এই পেজের সবাইকে বাছুন', 'Select all loaded'),
              onPressed: _items.isEmpty ? null : _selectAllLoaded,
              icon: const Icon(Icons.select_all),
            ),
          ]),
        ),
        Expanded(child: list),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            child: Row(children: [
              Expanded(
                child: Text(
                  '${Lang.i.digits('${_selected.length}')} ${tr('জন বাছাই', 'selected')}',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
              if (_selected.isNotEmpty)
                TextButton(
                    onPressed: () => setState(_selected.clear),
                    child: Text(tr('বাদ দিন', 'Clear'))),
              FilledButton(
                onPressed: _selected.isEmpty ? null : _goReview,
                child: Text(tr('পরবর্তী', 'Next')),
              ),
            ]),
          ),
        ),
      ],
    );
  }

  // ------------------------------------------------------------ ধাপ ২ UI
  Widget _reviewBody(Lang l) {
    if (_reviewLoading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(_error!, textAlign: TextAlign.center),
          ),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: _goReview, child: Text(l.t('retry'))),
          TextButton(
              onPressed: () => setState(() {
                    _review = false;
                    _error = null;
                  }),
              child: Text(tr('পেছনে', 'Back'))),
        ]),
      );
    }
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
          child: Row(children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                value: _billingType,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: tr('বিলিং ধরন', 'Billing type'),
                  border: const OutlineInputBorder(),
                  isDense: true,
                ),
                items: [
                  DropdownMenuItem(value: 'monthly', child: Text(tr('মাসিক', 'Monthly'))),
                  DropdownMenuItem(value: 'yearly', child: Text(tr('বার্ষিক', 'Yearly'))),
                ],
                onChanged: (v) => setState(() => _billingType = v ?? 'monthly'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: DropdownButtonFormField<String>(
                value: _medium,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: tr('পেমেন্ট মাধ্যম', 'Payment medium'),
                  border: const OutlineInputBorder(),
                  isDense: true,
                ),
                items: const [
                  DropdownMenuItem(value: 'hand_cash', child: Text('Hand Cash')),
                  DropdownMenuItem(value: 'bkash', child: Text('bKash')),
                  DropdownMenuItem(value: 'nagad', child: Text('Nagad')),
                  DropdownMenuItem(value: 'bank', child: Text('Bank')),
                ],
                onChanged: (v) => setState(() => _medium = v ?? 'hand_cash'),
              ),
            ),
          ]),
        ),
        Expanded(
          child: _rows.isEmpty
              ? Center(child: Text(l.t('no_data')))
              : ListView.separated(
                  itemCount: _rows.length,
                  separatorBuilder: (_, __) =>
                      const Divider(height: 1, color: AppColors.line),
                  itemBuilder: (_, i) {
                    final r = _rows[i];
                    final id = numOf(r['id']).toInt();
                    final bal = numOf(r['balance']);
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      child: Row(children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${r['name'] ?? ''}',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.bold, color: AppColors.text)),
                              Text(
                                '${r['customer_code'] ?? ''}'
                                '${bal < 0 ? '  ·  ${tr('বকেয়া', 'Due')} ${taka(-bal)}' : ''}',
                                style: const TextStyle(fontSize: 12, color: AppColors.muted),
                              ),
                            ],
                          ),
                        ),
                        SizedBox(
                          width: 100,
                          child: TextField(
                            controller: _amountC[id],
                            keyboardType:
                                const TextInputType.numberWithOptions(decimal: true),
                            textAlign: TextAlign.right,
                            onChanged: (_) => setState(() {}),
                            decoration: const InputDecoration(
                              prefixText: '৳ ',
                              border: OutlineInputBorder(),
                              isDense: true,
                            ),
                          ),
                        ),
                        IconButton(
                          tooltip: tr('বাদ দিন', 'Remove'),
                          onPressed: () => _removeRow(r),
                          icon: const Icon(Icons.close, color: Colors.red),
                        ),
                      ]),
                    );
                  },
                ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            child: Row(children: [
              TextButton(
                onPressed: _saving ? null : () => setState(() => _review = false),
                child: Text(tr('পেছনে', 'Back')),
              ),
              Expanded(
                child: Text(
                  '${Lang.i.digits('$_validCount')} ${tr('জন', 'customers')} · ${taka(_grandTotal)}',
                  textAlign: TextAlign.right,
                  style: const TextStyle(
                      fontWeight: FontWeight.bold, color: AppColors.navy),
                ),
              ),
              const SizedBox(width: 10),
              FilledButton(
                onPressed: (_saving || _validCount == 0) ? null : _submit,
                child: _saving
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : Text(tr('রিচার্জ করুন', 'Recharge all')),
              ),
            ]),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(
      builder: (context) {
        final l = Lang.i;
        return AdminScaffold(
          current: 'bulk_recharge',
          title: tr('বাল্ক রিচার্জ', 'Bulk recharge'),
          body: _review ? _reviewBody(l) : _pickBody(l),
        );
      },
    );
  }
}
