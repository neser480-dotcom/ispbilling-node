import 'dart:async';
import 'package:flutter/material.dart';
import '../core/format.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../services/api_service.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';
import '../widgets/letter_avatar.dart';

/// গ্রাহক তালিকা (শুধু পড়া) + বিস্তারিত। Backend: GET /admin/customers (permission: customer_list)
class CustomersScreen extends StatefulWidget {
  const CustomersScreen({super.key});

  @override
  State<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends State<CustomersScreen> {
  final _searchC = TextEditingController();
  final _scroll = ScrollController();
  final List<Map<String, dynamic>> _items = [];
  Timer? _debounce;
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
    _debounce?.cancel();
    _searchC.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load({bool reset = false}) async {
    if (_loading) {
      if (reset) _again = true; // চলমান লোড শেষ হলে নতুন সার্চে আবার লোড
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
      final d = await ApiService.customers(search: _searchC.text.trim(), page: _page);
      if (!mounted) return;
      final list = ((d['items'] ?? []) as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      setState(() {
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

  void _onSearchChanged(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () => _load(reset: true));
  }

  void _open(Map<String, dynamic> c) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _CustomerSheet(summary: c),
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
    return ListView.separated(
      controller: _scroll,
      itemCount: _items.length + extra,
      separatorBuilder: (_, __) => const Divider(height: 1, color: AppColors.line),
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
        final c = _items[i];
        final name = '${c['name'] ?? ''}';
        final sub = [
          '${c['phone'] ?? ''}',
          '${c['package_name'] ?? ''}',
        ].where((e) => e.isNotEmpty).join(' · ');
        return ListTile(
          contentPadding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
          leading: LetterAvatar(text: name, radius: 22),
          title: Text(name,
              style: const TextStyle(
                  fontSize: 17, fontWeight: FontWeight.bold, color: AppColors.text)),
          subtitle: Text(sub, style: const TextStyle(fontSize: 14, color: AppColors.muted)),
          trailing: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(taka(numOf(c['balance'])),
                  style: const TextStyle(
                      fontSize: 15, fontWeight: FontWeight.bold, color: AppColors.navy)),
              Text('${c['payment_status'] ?? ''}',
                  style: const TextStyle(fontSize: 12, color: AppColors.muted)),
            ],
          ),
          onTap: () => _open(c),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      return AdminScaffold(
        current: 'customer',
        title: l.t('customer'),
        actions: [
          IconButton(
              icon: const Icon(Icons.sync, size: 30),
              onPressed: () => _load(reset: true)),
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
                onSubmitted: (_) => _load(reset: true),
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search),
                  hintText: l.t('search'),
                  isDense: true,
                  border: const OutlineInputBorder(),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 6),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('${l.t('total')}: ${Lang.i.digits('$_total')}',
                    style: const TextStyle(fontSize: 13, color: AppColors.muted)),
              ),
            ),
            Expanded(child: _list(l)),
          ],
        ),
      );
    });
  }
}

class _CustomerSheet extends StatefulWidget {
  final Map<String, dynamic> summary;
  const _CustomerSheet({required this.summary});

  @override
  State<_CustomerSheet> createState() => _CustomerSheetState();
}

class _CustomerSheetState extends State<_CustomerSheet> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = ApiService.customerDetail(numOf(widget.summary['id']).toInt());
  }

  Widget _row(String k, String v) {
    if (v.trim().isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
              width: 130,
              child: Text(k, style: const TextStyle(color: AppColors.muted, fontSize: 14))),
          Expanded(
              child: Text(v, style: const TextStyle(color: AppColors.text, fontSize: 15))),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      return SafeArea(
        child: ConstrainedBox(
          constraints:
              BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
          child: FutureBuilder<Map<String, dynamic>>(
            future: _future,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return const SizedBox(
                    height: 160, child: Center(child: CircularProgressIndicator()));
              }
              if (snap.hasError) {
                return Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(snap.error.toString().replaceFirst('Exception: ', '')),
                );
              }
              final c = snap.data!;
              final pays = ((c['payments'] ?? []) as List);
              return SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        LetterAvatar(text: '${c['name'] ?? ''}', radius: 24),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${c['name'] ?? ''}',
                                  style: const TextStyle(
                                      fontSize: 19,
                                      fontWeight: FontWeight.bold,
                                      color: AppColors.text)),
                              Text('${c['customer_code'] ?? ''}',
                                  style: const TextStyle(color: AppColors.muted)),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const Divider(height: 24),
                    _row(l.t('phone'), '${c['phone'] ?? ''}'),
                    _row(l.t('address'), '${c['address'] ?? ''}'),
                    _row(l.t('package_lbl'), '${c['package_name'] ?? ''}'),
                    _row(l.t('monthly_bill'), taka(numOf(c['monthly_bill']))),
                    _row(l.t('balance_lbl'), taka(numOf(c['balance']))),
                    _row(l.t('status'), '${c['status'] ?? ''}'),
                    _row(l.t('payment_status'), '${c['payment_status'] ?? ''}'),
                    _row(l.t('promise_date'), dateOnly(c['promise_date'])),
                    const SizedBox(height: 12),
                    Text(l.t('recent_payments'),
                        style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: AppColors.navy)),
                    const SizedBox(height: 6),
                    if (pays.isEmpty) Text(l.t('no_data')),
                    for (final p in pays)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          children: [
                            Expanded(
                                child: Text(
                                    '${Lang.i.digits('${mapOf(p)['month'] ?? ''}')}  ${mapOf(p)['method'] ?? ''}',
                                    style: const TextStyle(color: AppColors.text))),
                            Text(taka(numOf(mapOf(p)['amount'])),
                                style: const TextStyle(fontWeight: FontWeight.bold)),
                          ],
                        ),
                      ),
                  ],
                ),
              );
            },
          ),
        ),
      );
    });
  }
}
