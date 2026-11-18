import 'package:flutter/material.dart';
import '../core/format.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../services/api_service.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';

/// Super Admin: সব ISP-র Software Bill (শুধু পড়া)। Backend: GET /admin/super/software-billing
class SaBillingScreen extends StatefulWidget {
  const SaBillingScreen({super.key});

  @override
  State<SaBillingScreen> createState() => _SaBillingScreenState();
}

class _SaBillingScreenState extends State<SaBillingScreen> {
  final _scroll = ScrollController();
  final List<Map<String, dynamic>> _items = [];
  Map<String, dynamic> _summary = {};
  String _status = ''; // '' | unpaid | paid
  int _page = 1;
  int _total = 0;
  bool _loading = false;
  bool _hasMore = true;
  bool _again = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.hasClients &&
          _scroll.position.pixels >= _scroll.position.maxScrollExtent - 240) {
        _load();
      }
    });
    _load(reset: true);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load({bool reset = false}) async {
    if (_loading) {
      if (reset) _again = true;
      return;
    }
    if (reset) {
      _page = 1;
      _hasMore = true;
      _error = null;
      _items.clear();
    } else if (!_hasMore) {
      return;
    }
    setState(() => _loading = true);
    try {
      final d = await ApiService.softwareBills(status: _status, page: _page);
      if (!mounted) return;
      final list = ((d['items'] ?? []) as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      setState(() {
        _summary = mapOf(d['summary']);
        _total = numOf(d['total']).toInt();
        _items.addAll(list);
        _hasMore = list.isNotEmpty && _items.length < _total;
        _page++;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _hasMore = false;
      });
    } finally {
      if (mounted) {
        setState(() => _loading = false);
        if (_again) {
          _again = false;
          _load(reset: true);
        }
      }
    }
  }

  void _setStatus(String s) {
    if (_status == s) return;
    setState(() => _status = s);
    _load(reset: true);
  }

  Widget _summaryCard(String label, String value, Color color) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 4),
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 10),
        decoration: BoxDecoration(
          color: AppColors.skyLight,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
            const SizedBox(height: 4),
            Text(value,
                style: TextStyle(
                    fontSize: 16, fontWeight: FontWeight.bold, color: color)),
          ],
        ),
      ),
    );
  }

  Widget _chip(Lang l, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: _status == value,
        onSelected: (_) => _setStatus(value),
      ),
    );
  }

  Widget _tile(Lang l, Map<String, dynamic> b) {
    final unpaid = '${b['status']}' == 'unpaid';
    final type = '${b['billing_type']}' == 'registration'
        ? l.t('registration_fee')
        : l.t('monthly_fee');
    final period = '${b['billing_period'] ?? ''}';
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 6, 12, 6),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${b['company_name'] ?? ''}'.isEmpty
                        ? 'Company #${b['company_id']}'
                        : '${b['company_name']}',
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.text)),
                const SizedBox(height: 2),
                Text(
                    '$type${period.isEmpty ? '' : ' · ${Lang.i.digits(period)}'}'
                    '${'${b['package_code'] ?? ''}'.isEmpty ? '' : ' · ${b['package_code']}'}',
                    style: const TextStyle(fontSize: 13, color: AppColors.muted)),
                if ('${b['due_date'] ?? ''}'.isNotEmpty)
                  Text('${l.t('due_date')}: ${dateOnly(b['due_date'])}',
                      style: const TextStyle(fontSize: 13, color: AppColors.muted)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(taka(numOf(b['amount'])),
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.navy)),
              const SizedBox(height: 4),
              Text(unpaid ? l.t('unpaid') : l.t('paid'),
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: unpaid ? AppColors.pink : AppColors.teal)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _list(Lang l) {
    if (_items.isEmpty && _loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_items.isEmpty && _error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!),
            const SizedBox(height: 10),
            OutlinedButton(
                onPressed: () => _load(reset: true), child: Text(l.t('retry'))),
          ],
        ),
      );
    }
    if (_items.isEmpty) {
      return Center(child: Text(l.t('no_data')));
    }
    final extra = (_hasMore || _loading || _error != null) ? 1 : 0;
    return ListView.builder(
      controller: _scroll,
      itemCount: _items.length + extra,
      itemBuilder: (_, i) {
        if (i >= _items.length) {
          if (_error != null) {
            return TextButton(onPressed: () => _load(), child: Text(l.t('load_more')));
          }
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        return _tile(l, _items[i]);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      return AdminScaffold(
        current: 'sa_billing',
        title: l.t('sa_billing'),
        actions: [
          IconButton(
              icon: const Icon(Icons.sync, size: 30),
              onPressed: () => _load(reset: true)),
          const SizedBox(width: 4),
        ],
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 10, 8, 4),
              child: Row(
                children: [
                  _summaryCard(
                      '${l.t('unpaid')} (${Lang.i.digits('${numOf(_summary['unpaid_count']).toInt()}')})',
                      taka(numOf(_summary['unpaid_amount'])),
                      AppColors.pink),
                  _summaryCard(
                      '${l.t('paid')} (${Lang.i.digits('${numOf(_summary['paid_count']).toInt()}')})',
                      taka(numOf(_summary['paid_amount'])),
                      AppColors.teal),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 6, 12, 2),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _chip(l, l.t('all'), ''),
                    _chip(l, l.t('unpaid'), 'unpaid'),
                    _chip(l, l.t('paid'), 'paid'),
                  ],
                ),
              ),
            ),
            Expanded(child: _list(l)),
          ],
        ),
      );
    });
  }
}
