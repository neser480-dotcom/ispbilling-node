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

/// গ্রাহক রিচার্জ। প্রথমে গ্রাহক খুঁজে বাছাই, তারপর রিচার্জ ফর্ম (Bottom Sheet)।
/// Backend: GET /admin/recharge/form, POST /admin/recharge/quote, POST /admin/recharge
/// (Permission: bill_posting — Backend যাচাই করে)
class CustomerRechargeScreen extends StatefulWidget {
  const CustomerRechargeScreen({super.key});

  @override
  State<CustomerRechargeScreen> createState() => _CustomerRechargeScreenState();
}

class _CustomerRechargeScreenState extends State<CustomerRechargeScreen> {
  final _searchC = TextEditingController();
  Timer? _debounce;
  List<Map<String, dynamic>> _items = [];
  int _page = 1;
  int _total = 0;
  bool _loading = true;
  bool _more = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load(reset: true);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchC.dispose();
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

  Future<void> _recharge(Map<String, dynamic> c) async {
    final ok = await showRechargeSheet(
      context,
      customerId: numOf(c['id']).toInt(),
      name: '${c['name'] ?? ''}',
    );
    if (ok == true && mounted) _load(reset: true);
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
          OutlinedButton(
              onPressed: () => _load(reset: true), child: Text(l.t('retry'))),
        ]),
      );
    }
    if (_items.isEmpty) return Center(child: Text(l.t('no_data')));
    final hasMore = _items.length < _total;
    return ListView.separated(
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
        final name = '${c['name'] ?? ''}';
        final bal = numOf(c['balance']);
        final sub = [
          '${c['customer_code'] ?? ''}',
          '${c['phone'] ?? ''}',
        ].where((e) => e.isNotEmpty).join(' · ');
        return ListTile(
          leading: LetterAvatar(text: name, radius: 22),
          title: Text(name,
              style: const TextStyle(
                  fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.text)),
          subtitle: Text(sub,
              style: const TextStyle(fontSize: 13, color: AppColors.muted)),
          trailing: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(taka(numOf(c['monthly_bill'])),
                  style: const TextStyle(
                      fontWeight: FontWeight.bold, color: AppColors.navy)),
              Text(
                bal < 0
                    ? '${tr('বকেয়া', 'Due')} ${taka(-bal)}'
                    : '${tr('ব্যালেন্স', 'Bal')} ${taka(bal)}',
                style: TextStyle(
                    fontSize: 12,
                    color: bal < 0 ? Colors.red : AppColors.muted),
              ),
            ],
          ),
          onTap: () => _recharge(c),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(
      builder: (context) {
        final l = Lang.i;
        return AdminScaffold(
          current: 'recharge',
          title: tr('রিচার্জ', 'Recharge'),
          body: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
                child: TextField(
                  controller: _searchC,
                  onChanged: _onSearch,
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.search),
                    hintText: tr('নাম / মোবাইল / আইডি দিয়ে খুঁজুন',
                        'Search name / phone / ID'),
                    border: const OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
              ),
              Expanded(child: _body(l)),
            ],
          ),
        );
      },
    );
  }
}

/// অন্য স্ক্রিন (যেমন Customer বিস্তারিত) থেকেও ডাকা যায়।
/// রিচার্জ সফল হলে true ফেরত দেয়।
Future<bool?> showRechargeSheet(
  BuildContext context, {
  required int customerId,
  String name = '',
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _RechargeSheet(customerId: customerId, name: name),
  );
}

class _RechargeSheet extends StatefulWidget {
  final int customerId;
  final String name;
  const _RechargeSheet({required this.customerId, required this.name});

  @override
  State<_RechargeSheet> createState() => _RechargeSheetState();
}

class _RechargeSheetState extends State<_RechargeSheet> {
  Map<String, dynamic>? _form;
  String? _loadError;
  bool _loading = true;

  String _billType = 'Bill';
  String _billingType = 'Monthly';
  int _months = 1;
  int _days = 30;
  String _method = 'Hand Cash';
  final _discountC = TextEditingController();
  final _advanceC = TextEditingController();
  final _commentC = TextEditingController();

  Map<String, dynamic>? _quote;
  String? _quoteError;
  bool _quoting = false;
  bool _saving = false;
  Timer? _debounce;
  int _seq = 0;

  @override
  void initState() {
    super.initState();
    _loadForm();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _discountC.dispose();
    _advanceC.dispose();
    _commentC.dispose();
    super.dispose();
  }

  Future<void> _loadForm() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final f = await RechargeApi.form(widget.customerId);
      if (!mounted) return;
      setState(() {
        _form = f;
        _loading = false;
      });
      _requote();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadError = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  double _num(TextEditingController c) =>
      double.tryParse(c.text.trim().replaceAll(',', '')) ?? 0;

  Map<String, dynamic> _payload() {
    final isAdvance = _billType == 'Advance';
    return {
      'customer_id': widget.customerId,
      'bill_type': _billType,
      'billing_type': isAdvance ? 'Monthly' : _billingType,
      'recharge_month': isAdvance ? 1 : _months,
      'selected_days': _days,
      'payment_method': _method,
      'discount': _num(_discountC),
      'advance': _num(_advanceC),
      'comment': _commentC.text.trim(),
      'base_month': '${_form?['base_month'] ?? ''}',
    };
  }

  void _scheduleQuote() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), _requote);
  }

  Future<void> _requote() async {
    if (_form == null) return;
    // Advance-এ amount না দিলে হিসাব দেখানোর কিছু নেই
    if (_billType == 'Advance' && _num(_advanceC) <= 0) {
      setState(() {
        _quote = null;
        _quoteError = null;
        _quoting = false;
      });
      return;
    }
    final seq = ++_seq;
    setState(() => _quoting = true);
    try {
      final q = await RechargeApi.quote(_payload());
      if (!mounted || seq != _seq) return;
      setState(() {
        _quote = q;
        _quoteError = null;
        _quoting = false;
      });
    } catch (e) {
      if (!mounted || seq != _seq) return;
      setState(() {
        _quote = null;
        _quoteError = e.toString().replaceFirst('Exception: ', '');
        _quoting = false;
      });
    }
  }

  Future<void> _submit() async {
    final amount = numOf(_quote?['amount']);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('রিচার্জ নিশ্চিত করুন', 'Confirm recharge')),
        content: Text(
          '${widget.name.isEmpty ? '${_form?['customer']?['name'] ?? ''}' : widget.name}\n'
          '${tr('আদায়যোগ্য', 'Collect')}: ${taka(amount)}',
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
      final r = await RechargeApi.recharge(_payload());
      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      final msg = '${r['message'] ?? tr('রিচার্জ সফল হয়েছে।', 'Recharge successful.')}';
      Navigator.pop(context, true);
      messenger.showSnackBar(SnackBar(content: Text(msg)));
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(e.toString().replaceFirst('Exception: ', '')),
        backgroundColor: Colors.red,
      ));
    }
  }

  String _monthLabel(String key, int baseYear) {
    final parts = key.split('-');
    if (parts.length != 2) return key;
    final y = int.tryParse(parts[0]) ?? 0;
    final m = int.tryParse(parts[1]) ?? 1;
    final name = Lang.i.months[(m - 1).clamp(0, 11).toInt()];
    return y != baseYear ? '$name $y' : name;
  }

  Widget _row(String label, String value, {bool bold = false, Color? color}) {
    final style = TextStyle(
      fontSize: bold ? 17 : 14,
      fontWeight: bold ? FontWeight.bold : FontWeight.normal,
      color: color ?? AppColors.text,
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Flexible(child: Text(label, style: style)),
          Text(value, style: style),
        ],
      ),
    );
  }

  Widget _dropdown<T>({
    required String label,
    required T value,
    required List<DropdownMenuItem<T>> items,
    required ValueChanged<T?> onChanged,
  }) {
    return DropdownButtonFormField<T>(
      value: value,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
        isDense: true,
      ),
      items: items,
      onChanged: onChanged,
    );
  }

  Widget _quoteBox() {
    if (_quoteError != null) {
      return Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: const Color(0xFFFDECEA),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(_quoteError!, style: const TextStyle(color: Colors.red)),
      );
    }
    final q = _quote;
    if (q == null) {
      return _quoting
          ? const Center(child: CircularProgressIndicator())
          : const SizedBox.shrink();
    }
    final due = numOf(q['previous_due']);
    final fromBal = numOf(q['from_balance']);
    final extra = numOf(q['extra_to_balance']);
    final adv = numOf(q['advance']);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.skyLight,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Column(
        children: [
          if (_billType == 'Bill')
            _row(tr('সাবস্ক্রিপশন', 'Subscription'),
                taka(numOf(q['subscription_amount']))),
          if (due > 0) _row(tr('আগের বকেয়া', 'Previous due'), taka(due)),
          if (fromBal > 0)
            _row(tr('ব্যালেন্স থেকে', 'From balance'), '− ${taka(fromBal)}'),
          if (extra > 0)
            _row(tr('বাকি মাস ব্যালেন্সে', 'Extra months to balance'), taka(extra)),
          if (adv > 0) _row(tr('অ্যাডভান্স', 'Advance'), taka(adv)),
          const Divider(),
          _row(tr('আদায়যোগ্য মোট', 'Total to collect'), taka(numOf(q['amount'])),
              bold: true, color: AppColors.navy),
        ],
      ),
    );
  }

  Widget _content() {
    final f = _form!;
    final c = mapOf(f['customer']);
    final opts = mapOf(f['options']);
    final monthKeys = (f['month_keys'] is List)
        ? (f['month_keys'] as List).map((e) => '$e').toList()
        : <String>[];
    final baseYear =
        monthKeys.isNotEmpty ? (int.tryParse(monthKeys.first.split('-').first) ?? 0) : 0;
    final methods = (opts['payment_methods'] is List)
        ? (opts['payment_methods'] as List).map((e) => '$e').toList()
        : <String>['Hand Cash', 'Bkash', 'Nagad', 'Bank'];
    final allowDaily = f['allow_daily'] == true;
    final bal = numOf(c['balance']);
    final isAdvance = _billType == 'Advance';
    final alreadyPaid = c['already_paid'] == true;

    final canSubmit = !_saving &&
        !_quoting &&
        _quote != null &&
        _quoteError == null &&
        numOf(_quote?['amount']) > 0;

    return ListView(
      shrinkWrap: true,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
      children: [
        Row(children: [
          LetterAvatar(text: '${c['name'] ?? ''}', radius: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${c['name'] ?? ''}',
                    style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: AppColors.text)),
                Text(
                  [
                    '${c['customer_code'] ?? ''}',
                    '${c['phone'] ?? ''}',
                  ].where((e) => e.isNotEmpty).join(' · '),
                  style: const TextStyle(color: AppColors.muted),
                ),
              ],
            ),
          ),
        ]),
        const SizedBox(height: 10),
        _row(tr('মাসিক বিল', 'Monthly bill'), taka(numOf(c['monthly_bill']))),
        _row(
          bal < 0 ? tr('বকেয়া', 'Due') : tr('ব্যালেন্স', 'Balance'),
          taka(bal < 0 ? -bal : bal),
          color: bal < 0 ? Colors.red : AppColors.text,
        ),
        if (dateOnly(c['billing_cycle']).isNotEmpty)
          _row(tr('বিলিং তারিখ', 'Billing date'), dateOnly(c['billing_cycle'])),
        if (alreadyPaid && !isAdvance)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              tr('এই মাস ইতিমধ্যে পরিশোধিত। শুধু ব্যালেন্সে টাকা যোগ করতে "Advance" বাছুন।',
                  'This month is already paid. Choose "Advance" to only add balance.'),
              style: const TextStyle(color: Colors.orange),
            ),
          ),
        const SizedBox(height: 14),
        _dropdown<String>(
          label: tr('বিল ধরন', 'Bill type'),
          value: _billType,
          items: [
            DropdownMenuItem(value: 'Bill', child: Text(tr('বিল', 'Bill'))),
            DropdownMenuItem(
                value: 'Advance', child: Text(tr('অ্যাডভান্স', 'Advance'))),
          ],
          onChanged: (v) {
            if (v == null) return;
            setState(() => _billType = v);
            _scheduleQuote();
          },
        ),
        if (!isAdvance) ...[
          const SizedBox(height: 12),
          _dropdown<String>(
            label: tr('বিলিং ধরন', 'Billing type'),
            value: (_billingType == 'Daily' && !allowDaily) ? 'Monthly' : _billingType,
            items: [
              DropdownMenuItem(
                  value: 'Monthly', child: Text(tr('মাসিক', 'Monthly'))),
              if (allowDaily)
                DropdownMenuItem(value: 'Daily', child: Text(tr('দৈনিক', 'Daily'))),
            ],
            onChanged: (v) {
              if (v == null) return;
              setState(() => _billingType = v);
              _scheduleQuote();
            },
          ),
          const SizedBox(height: 12),
          if (_billingType == 'Monthly')
            _dropdown<int>(
              label: tr('কত মাসের জন্য', 'Months'),
              value: _months,
              items: [
                for (var n = 1; n <= 12; n++)
                  DropdownMenuItem(
                    value: n,
                    child: Text(
                      monthKeys.length >= n
                          ? (n == 1
                              ? _monthLabel(monthKeys[0], baseYear)
                              : '${Lang.i.digits('$n')} ${tr('মাস', 'months')} '
                                  '(${_monthLabel(monthKeys[0], baseYear)} – ${_monthLabel(monthKeys[n - 1], baseYear)})')
                          : '${Lang.i.digits('$n')} ${tr('মাস', 'months')}',
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
              ],
              onChanged: (v) {
                if (v == null) return;
                setState(() => _months = v);
                _scheduleQuote();
              },
            )
          else
            _dropdown<int>(
              label: tr('কত দিনের জন্য', 'Days'),
              value: _days,
              items: [
                for (var n = 1; n <= 31; n++)
                  DropdownMenuItem(
                      value: n,
                      child: Text('${Lang.i.digits('$n')} ${tr('দিন', 'days')}')),
              ],
              onChanged: (v) {
                if (v == null) return;
                setState(() => _days = v);
                _scheduleQuote();
              },
            ),
        ],
        const SizedBox(height: 12),
        _dropdown<String>(
          label: tr('পেমেন্ট মাধ্যম', 'Payment method'),
          value: methods.contains(_method) ? _method : methods.first,
          items: [
            for (final m in methods) DropdownMenuItem(value: m, child: Text(m)),
          ],
          onChanged: (v) {
            if (v == null) return;
            setState(() => _method = v);
          },
        ),
        if (!isAdvance) ...[
          const SizedBox(height: 12),
          TextField(
            controller: _discountC,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            onChanged: (_) => _scheduleQuote(),
            decoration: InputDecoration(
              labelText: tr('ডিসকাউন্ট', 'Discount'),
              border: const OutlineInputBorder(),
              isDense: true,
            ),
          ),
        ],
        const SizedBox(height: 12),
        TextField(
          controller: _advanceC,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (_) => _scheduleQuote(),
          decoration: InputDecoration(
            labelText: isAdvance
                ? tr('অ্যাডভান্স পরিমাণ *', 'Advance amount *')
                : tr('অতিরিক্ত অ্যাডভান্স (ঐচ্ছিক)', 'Extra advance (optional)'),
            border: const OutlineInputBorder(),
            isDense: true,
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _commentC,
          maxLength: 255,
          decoration: InputDecoration(
            labelText: tr('নোট', 'Note'),
            border: const OutlineInputBorder(),
            isDense: true,
          ),
        ),
        const SizedBox(height: 4),
        _quoteBox(),
        const SizedBox(height: 14),
        SizedBox(
          height: 48,
          child: FilledButton(
            onPressed: canSubmit ? _submit : null,
            child: _saving
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : Text(
                    _quote == null
                        ? tr('রিচার্জ', 'Recharge')
                        : '${tr('রিচার্জ', 'Recharge')} · ${taka(numOf(_quote!['amount']))}',
                    style: const TextStyle(fontSize: 16)),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(
      builder: (context) {
        Widget child;
        if (_loading) {
          child = const Padding(
            padding: EdgeInsets.all(40),
            child: Center(child: CircularProgressIndicator()),
          );
        } else if (_loadError != null) {
          child = Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(_loadError!, textAlign: TextAlign.center),
              const SizedBox(height: 10),
              OutlinedButton(
                  onPressed: _loadForm, child: Text(Lang.i.t('retry'))),
            ]),
          );
        } else {
          child = Flexible(child: _content());
        }
        return SafeArea(
          child: Padding(
            padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 8, 4),
                  child: Row(children: [
                    Expanded(
                      child: Text(tr('গ্রাহক রিচার্জ', 'Customer recharge'),
                          style: const TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                              color: AppColors.navy)),
                    ),
                    IconButton(
                        onPressed: () => Navigator.pop(context, false),
                        icon: const Icon(Icons.close)),
                  ]),
                ),
                child,
              ],
            ),
          ),
        );
      },
    );
  }
}
