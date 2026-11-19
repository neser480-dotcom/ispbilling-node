import 'dart:async';
import 'package:flutter/material.dart';
import '../core/format.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../services/api_service.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';

/// Super Admin: Company-wise Negotiated Pricing (Web পেজের সঙ্গে একই Backend নিয়ম)।
/// Registration শুধু দেখানো হয় (রেজিস্ট্রেশনের সময়ই নির্ধারিত); Monthly/Yearly সম্পাদনাযোগ্য।
class SaPricingScreen extends StatefulWidget {
  const SaPricingScreen({super.key});

  @override
  State<SaPricingScreen> createState() => _SaPricingScreenState();
}

class _SaPricingScreenState extends State<SaPricingScreen> {
  static const _fees = ['registration', 'monthly', 'yearly'];

  final _searchC = TextEditingController();
  List<Map<String, dynamic>> _companies = [];
  Timer? _debounce;
  bool _loading = true;
  String? _error;
  int _seq = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchC.dispose();
    super.dispose();
  }

  void _toast(Object e) => ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));

  Future<void> _load() async {
    final my = ++_seq;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await ApiService.pricingCompanies(_searchC.text.trim());
      if (!mounted || my != _seq) return;
      setState(() {
        _companies = list;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || my != _seq) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  void _onSearchChanged(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), _load);
  }

  void _replace(Map<String, dynamic> updated) {
    final company = mapOf(updated['company']).isNotEmpty
        ? mapOf(updated['company'])
        : updated;
    final id = numOf(company['company_id']).toInt();
    final i =
        _companies.indexWhere((c) => numOf(c['company_id']).toInt() == id);
    if (i < 0 || !mounted) return;
    setState(() {
      _companies[i] = company;
    });
  }

  String _feeLabel(Lang l, String fee) => l.t('${fee}_fee');

  String _stateLabel(Lang l, String s) {
    switch (s) {
      case 'active':
        return l.t('st_active');
      case 'expired':
        return l.t('st_expired');
      case 'scheduled':
        return l.t('st_scheduled');
      case 'disabled':
        return l.t('st_disabled');
      default:
        return s;
    }
  }

  Color _stateColor(String s) {
    switch (s) {
      case 'active':
        return AppColors.teal;
      case 'scheduled':
        return AppColors.sky;
      case 'expired':
        return AppColors.orange;
      default:
        return AppColors.muted;
    }
  }

  Future<void> _pickDate(BuildContext ctx, TextEditingController c) async {
    final now = DateTime.now();
    final p = await showDatePicker(
      context: ctx,
      initialDate: now,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 5),
    );
    if (p == null) return;
    String two(int v) => v.toString().padLeft(2, '0');
    c.text = '${p.year}-${two(p.month)}-${two(p.day)}';
  }

  Widget _dateField(BuildContext ctx, String label, TextEditingController c) {
    return TextField(
      controller: c,
      readOnly: true,
      onTap: () => _pickDate(ctx, c),
      decoration: InputDecoration(
        labelText: label,
        hintText: 'YYYY-MM-DD',
        suffixIcon: IconButton(
          icon: const Icon(Icons.clear),
          onPressed: () => c.clear(),
        ),
      ),
    );
  }

  Future<void> _edit(Map<String, dynamic> company, String fee) async {
    final l = Lang.i;
    final rule = mapOf(mapOf(company['rules'])[fee]);
    final hasRule = rule.isNotEmpty;
    String mode = hasRule ? '${rule['mode']}' : 'special_price';
    if (fee == 'yearly') mode = 'special_price';
    bool enabled = hasRule ? rule['is_enabled'] == true : true;

    String clip(dynamic v) {
      final t = '${v ?? ''}';
      return t.length >= 16 ? t.substring(0, 16) : t;
    }

    final valueC = TextEditingController(
        text: hasRule ? numOf(rule['value']).toStringAsFixed(2) : '');
    final startC = TextEditingController(text: clip(rule['starts_at']));
    final expC = TextEditingController(text: clip(rule['expires_at']));
    final noteC = TextEditingController(text: '${rule['note'] ?? ''}');

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          title: Text(_feeLabel(l, fee)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                    fee == 'yearly'
                        ? l.t('yearly_note')
                        : '${l.t('default_price')}: ${taka(numOf(mapOf(company['defaults'])[fee]))}',
                    style:
                        const TextStyle(color: AppColors.muted, fontSize: 13)),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: mode,
                  items: [
                    DropdownMenuItem(
                        value: 'special_price',
                        child: Text(l.t('special_price'))),
                    if (fee != 'yearly')
                      DropdownMenuItem(
                          value: 'fixed_discount',
                          child: Text(l.t('fixed_discount'))),
                  ],
                  onChanged: fee == 'yearly'
                      ? null
                      : (v) => setSt(() => mode = v ?? mode),
                ),
                TextField(
                  controller: valueC,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(labelText: l.t('price_value')),
                ),
                _dateField(ctx, l.t('start_date'), startC),
                _dateField(ctx, l.t('expiry_date'), expC),
                TextField(
                  controller: noteC,
                  maxLength: 500,
                  decoration: InputDecoration(labelText: l.t('note')),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(l.t('enabled')),
                  value: enabled,
                  onChanged: (v) => setSt(() => enabled = v),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: Text(l.t('cancel'))),
            TextButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: Text(l.t('save'))),
          ],
        ),
      ),
    );

    final body = <String, dynamic>{
      'fee_type': fee,
      'mode': mode,
      'value': valueC.text.trim(),
      'is_enabled': enabled,
      'starts_at': startC.text.trim(),
      'expires_at': expC.text.trim(),
      'note': noteC.text.trim(),
    };
    if (ok != true) return;
    try {
      final updated = await ApiService.pricingSave(
          numOf(company['company_id']).toInt(), body);
      if (mounted) _replace(updated);
    } catch (e) {
      if (mounted) _toast(e);
    }
  }

  Future<void> _toggle(
      Map<String, dynamic> company, String fee, bool enable) async {
    try {
      final updated = await ApiService.pricingToggle(
          numOf(company['company_id']).toInt(), fee, enable);
      if (mounted) _replace(updated);
    } catch (e) {
      if (mounted) _toast(e);
    }
  }

  Future<void> _reset(Map<String, dynamic> company, String fee) async {
    final l = Lang.i;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('${company['company_name'] ?? ''}'),
        content: Text('${_feeLabel(l, fee)}: ${l.t('reset_default')}?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(l.t('cancel'))),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(l.t('reset_default'))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      final updated = await ApiService.pricingReset(
          numOf(company['company_id']).toInt(), fee);
      if (mounted) _replace(updated);
    } catch (e) {
      if (mounted) _toast(e);
    }
  }

  String _historyChange(dynamic mode, dynamic value, dynamic enabled) {
    if (mode == null && value == null && enabled == null) return '—';
    if (enabled == false || enabled == 0 || enabled == '0') return 'Disabled';
    if (mode == null || '$mode'.isEmpty) return 'Enabled';
    final label = mode == 'fixed_discount' ? 'Fixed discount' : 'Special price';
    return '$label: ${value == null ? '—' : taka(numOf(value))}';
  }

  Future<void> _openHistory(Map<String, dynamic> company) async {
    final id = numOf(company['company_id']).toInt();
    final companyName = '${company['company_name'] ?? 'Company #$id'}';
    final future = ApiService.pricingCompanyDetail(id);

    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Pricing history — $companyName'),
        content: SizedBox(
          width: double.maxFinite,
          height: 440,
          child: FutureBuilder<Map<String, dynamic>>(
            future: future,
            builder: (ctx, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snapshot.hasError) {
                return Center(
                  child: Text(snapshot.error
                      .toString()
                      .replaceFirst('Exception: ', '')),
                );
              }
              final raw = snapshot.data?['history'];
              final rows = raw is List
                  ? raw
                      .whereType<Map>()
                      .map((e) => Map<String, dynamic>.from(e))
                      .toList()
                  : <Map<String, dynamic>>[];
              if (rows.isEmpty) {
                return const Center(child: Text('No pricing changes yet.'));
              }
              return SingleChildScrollView(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: DataTable(
                    columns: const [
                      DataColumn(label: Text('Time')),
                      DataColumn(label: Text('Fee')),
                      DataColumn(label: Text('Action')),
                      DataColumn(label: Text('Change')),
                      DataColumn(label: Text('Valid period')),
                      DataColumn(label: Text('By')),
                      DataColumn(label: Text('Note')),
                    ],
                    rows: rows.map((h) {
                      final start = dateOnly(h['starts_at']);
                      final end = dateOnly(h['expires_at']);
                      return DataRow(cells: [
                        DataCell(Text(dateOnly(h['created_at']))),
                        DataCell(
                            Text(_feeLabel(Lang.i, '${h['fee_type'] ?? ''}'))),
                        DataCell(Text('${h['action'] ?? '—'}')),
                        DataCell(Text(
                          '${_historyChange(h['old_mode'], h['old_value'], h['old_enabled'])} → '
                          '${_historyChange(h['new_mode'], h['new_value'], h['new_enabled'])}',
                        )),
                        DataCell(Text(
                            '${start.isEmpty ? '—' : start} → ${end.isEmpty ? '—' : end}')),
                        DataCell(Text('${h['changed_by_name'] ?? '—'}')),
                        DataCell(SizedBox(
                          width: 180,
                          child: Text('${h['note'] ?? '—'}', softWrap: true),
                        )),
                      ]);
                    }).toList(),
                  ),
                ),
              );
            },
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Close')),
        ],
      ),
    );
  }

  Widget _feeRow(Lang l, Map<String, dynamic> company, String fee) {
    final rule = mapOf(mapOf(company['rules'])[fee]);
    final hasRule = rule.isNotEmpty;
    final def = mapOf(company['defaults'])[fee];
    final eff = mapOf(mapOf(company['effective'])[fee]);
    final isYearly = fee == 'yearly';
    final isReg = fee == 'registration';

    String priceText;
    if (isYearly) {
      priceText = hasRule ? taka(numOf(rule['value'])) : '—';
    } else {
      priceText = taka(numOf(eff['amount']));
    }

    final changed = !isYearly && '${eff['source']}' != 'default';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_feeLabel(l, fee),
                    style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: AppColors.text)),
                Row(
                  children: [
                    if (changed)
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: Text(taka(numOf(def)),
                            style: const TextStyle(
                                fontSize: 13,
                                color: AppColors.muted,
                                decoration: TextDecoration.lineThrough)),
                      ),
                    Text(priceText,
                        style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.bold,
                            color: AppColors.navy)),
                  ],
                ),
                if (isReg)
                  Text(l.t('reg_fixed_note'),
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.muted)),
                if (isYearly)
                  Text(l.t('yearly_note'),
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.muted)),
                if (hasRule)
                  Text(
                      '${'${rule['starts_at'] ?? ''}'.isEmpty ? '' : '${dateOnly(rule['starts_at'])} → '}'
                      '${'${rule['expires_at'] ?? ''}'.isEmpty ? '' : dateOnly(rule['expires_at'])}',
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.muted)),
              ],
            ),
          ),
          if (hasRule)
            Padding(
              padding: const EdgeInsets.only(right: 4, top: 2),
              child: Text(_stateLabel(l, '${rule['state']}'),
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: _stateColor('${rule['state']}'))),
            ),
          if (!isReg && !hasRule)
            TextButton(
                onPressed: () => _edit(company, fee),
                child: Text(l.t('set_price'))),
          if (!isReg && hasRule)
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert, color: AppColors.sky),
              onSelected: (v) {
                if (v == 'edit') {
                  _edit(company, fee);
                } else if (v == 'toggle') {
                  _toggle(company, fee, rule['is_enabled'] != true);
                } else {
                  _reset(company, fee);
                }
              },
              itemBuilder: (_) => [
                PopupMenuItem(value: 'edit', child: Text(l.t('edit'))),
                PopupMenuItem(
                    value: 'toggle',
                    child: Text(rule['is_enabled'] == true
                        ? l.t('disable')
                        : l.t('enable'))),
                PopupMenuItem(
                    value: 'reset', child: Text(l.t('reset_default'))),
              ],
            ),
        ],
      ),
    );
  }

  Widget _card(Lang l, Map<String, dynamic> c) {
    final name = '${c['company_name'] ?? ''}';
    final meta = [
      'ID ${c['company_id']}',
      '${c['owner_name'] ?? ''}',
      '${c['package_code'] ?? ''}',
    ].where((e) => e.isNotEmpty).join(' · ');
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 6, 12, 6),
      padding: const EdgeInsets.fromLTRB(14, 12, 6, 6),
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(name.isEmpty ? 'Company #${c['company_id']}' : name,
              style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.bold,
                  color: AppColors.text)),
          Text(meta,
              style: const TextStyle(fontSize: 13, color: AppColors.muted)),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: () => _openHistory(c),
              icon: const Icon(Icons.history, size: 18),
              label: const Text('History'),
            ),
          ),
          const Divider(height: 16),
          for (final fee in _fees) _feeRow(l, c, fee),
        ],
      ),
    );
  }

  Widget _body(Lang l) {
    if (_loading && _companies.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _companies.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!),
            const SizedBox(height: 10),
            OutlinedButton(onPressed: _load, child: Text(l.t('retry'))),
          ],
        ),
      );
    }
    if (_companies.isEmpty) {
      return Center(child: Text(l.t('no_data')));
    }
    return ListView.builder(
      itemCount: _companies.length,
      itemBuilder: (_, i) => _card(l, _companies[i]),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      return AdminScaffold(
        current: 'sa_pricing',
        title: l.t('sa_pricing'),
        actions: [
          IconButton(icon: const Icon(Icons.sync, size: 30), onPressed: _load),
          const SizedBox(width: 4),
        ],
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
              child: TextField(
                controller: _searchC,
                textInputAction: TextInputAction.search,
                onChanged: _onSearchChanged,
                onSubmitted: (_) => _load(),
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search),
                  hintText: l.t('search'),
                  isDense: true,
                  border: const OutlineInputBorder(),
                ),
              ),
            ),
            Expanded(child: _body(l)),
          ],
        ),
      );
    });
  }
}
