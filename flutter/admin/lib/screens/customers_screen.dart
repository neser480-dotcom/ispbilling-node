import 'dart:async';
import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import '../core/format.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../services/api_service.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';
import '../widgets/letter_avatar.dart';
import '../widgets/netfee_ui.dart';
import 'customer_recharge_screen.dart';

/// Ã Â¦â€”Ã Â§ÂÃ Â¦Â°Ã Â¦Â¾Ã Â¦Â¹Ã Â¦â€¢ Ã Â¦Â¤Ã Â¦Â¾Ã Â¦Â²Ã Â¦Â¿Ã Â¦â€¢Ã Â¦Â¾ (Ã Â¦Â¶Ã Â§ÂÃ Â¦Â§Ã Â§Â Ã Â¦ÂªÃ Â¦Â¡Ã Â¦Â¼Ã Â¦Â¾) + Ã Â¦Â¬Ã Â¦Â¿Ã Â¦Â¸Ã Â§ÂÃ Â¦Â¤Ã Â¦Â¾Ã Â¦Â°Ã Â¦Â¿Ã Â¦Â¤Ã Â¥Â¤ Backend: GET /admin/customers (permission: customer_list)
class CustomersScreen extends StatefulWidget {
  const CustomersScreen({super.key});

  @override
  State<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends State<CustomersScreen> {
  // স্ক্রিনশটের ট্যাব: DUE | PAID | INACTIVE | EXPIRED
  static const _tabNames = ['Due', 'Paid', 'Inactive', 'Expired'];
  static const _tabStatus = ['Active', 'Active', 'Inactive', 'Expired'];
  static const _tabPay = ['unpaid', 'paid', '', ''];

  final _searchC = TextEditingController();
  final _scroll = ScrollController();
  final List<Map<String, dynamic>> _items = [];
  final List<int> _counts = [0, 0, 0, 0];
  Timer? _debounce;
  int _tab = 1; // স্ক্রিনশটে PAID খোলা
  int _page = 1;
  int _total = 0;
  num? _serverBalance;
  bool _loading = false;
  bool _hasMore = true;
  bool _again = false;
  bool _searching = false;
  String? _error;
  String _area = ''; // খালি = সব Area
  String _sort = 'Bill Date'; // Due ট্যাবের 'Bill Date ▾'

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
    _loadCounts();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchC.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// প্রতিটা ট্যাবের সংখ্যা (limit=1 দিয়ে শুধু total নেওয়া হয়)
  Future<void> _loadCounts() async {
    for (var i = 0; i < 4; i++) {
      try {
        final d = await ApiService.customers(
          status: _tabStatus[i],
          paymentStatus: _tabPay[i],
          limit: 1,
        );
        if (!mounted) return;
        setState(() => _counts[i] = numOf(d['total']).toInt());
      } catch (_) {}
    }
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
      final d = await ApiService.customers(
        search: _searchC.text.trim(),
        status: _tabStatus[_tab],
        paymentStatus: _tabPay[_tab],
        page: _page,
      );
      if (!mounted) return;
      final list = ((d['items'] ?? []) as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      setState(() {
        _total = numOf(d['total']).toInt();
        if (_searchC.text.trim().isEmpty) _counts[_tab] = _total;
        final tb = d['total_balance'] ?? d['balance_total'];
        _serverBalance = tb == null ? null : numOf(tb);
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

  void _refresh() {
    _load(reset: true);
    _loadCounts();
  }

  void _onSearchChanged(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () => _load(reset: true));
  }

  void _setTab(int i) {
    if (i == _tab) return;
    setState(() => _tab = i);
    _load(reset: true);
  }

  Future<void> _open(Map<String, dynamic> c) async {
    final result = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _CustomerSheet(summary: c),
    );
    if (!mounted) return;
    if (result == 'edit') {
      await _editCustomer(c);
    } else if (result == 'deleted') {
      _refresh();
    }
  }

  Future<void> _recharge(Map<String, dynamic> c) async {
    final ok = await showRechargeSheet(
      context,
      customerId: numOf(c['id']).toInt(),
      name: '${c['name'] ?? ''}',
    );
    if (mounted && ok == true) _refresh();
  }

  Future<void> _addCustomer() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _CustomerForm(),
    );
    if (mounted && saved == true) _refresh();
  }

  Future<void> _editCustomer(Map<String, dynamic> summary) async {
    try {
      final response = await ApiService.customerDetail(
        numOf(summary['id']).toInt(),
      );
      if (!mounted) return;
      final customer = Map<String, dynamic>.from(
        (response['customer'] ?? response) as Map,
      );
      final saved = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        builder: (_) => _CustomerForm(customer: customer),
      );
      if (mounted && saved == true) _refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    }
  }

  // ---------- কার্ডের ছোট হেল্পার ----------

  String _s(Map<String, dynamic> c, List<String> keys) {
    for (final k in keys) {
      final v = '${c[k] ?? ''}'.trim();
      if (v.isNotEmpty && v != 'null') return v;
    }
    return '';
  }

  /// "2026-12-02 12:19:00" → "02-12-2026  12:19 PM"
  String _fmtDate(String raw) {
    final d = DateTime.tryParse(raw.replaceFirst(' ', 'T'));
    if (d == null) return raw;
    String two(int n) => n.toString().padLeft(2, '0');
    final h12 = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final ampm = d.hour >= 12 ? 'PM' : 'AM';
    return '${two(d.day)}-${two(d.month)}-${d.year}  ${two(h12)}:${two(d.minute)} $ampm';
  }

  List<String> get _areas {
    final set = <String>{};
    for (final c in _items) {
      final a = _s(c, ['area_name', 'area']);
      if (a.isNotEmpty) set.add(a);
    }
    final l = set.toList()..sort();
    return l;
  }

  Widget _line(IconData icon, Color color, String text,
      {double size = 20, Color? textColor, FontWeight? weight}) {
    return Padding(
      padding: const EdgeInsets.only(top: 3),
      child: Row(
        children: [
          Icon(icon, size: size, color: color),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 17,
                color: textColor ?? AppColors.text,
                fontWeight: weight,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _toast(String m) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(m)));

  /// ⋮ মেনু: Profile, Call, Whatsapp, Update, Bill Recharge, Bill Report, Inactive, Note, BandWidth
  void _action(String key, Map<String, dynamic> c) {
    final phone = _s(c, ['phone', 'mobile']);
    switch (key) {
      case 'Profile':
        _open(c);
        break;
      case 'Update':
        _editCustomer(c);
        break;
      case 'Bill Recharge':
        _recharge(c);
        break;
      case 'Call':
      case 'Whatsapp':
        if (phone.isEmpty) {
          _toast('মোবাইল নাই');
        } else {
          Clipboard.setData(ClipboardData(text: phone));
          _toast('$key: $phone কপি হয়েছে');
        }
        break;
      default:
        _toast('$key শীঘ্রই আসছে');
    }
  }

  Widget _card(Map<String, dynamic> c) {
    final name = '${c['name'] ?? ''}';
    final cid = _s(c, ['customer_id', 'customer_code', 'id']);
    final user = _s(c, ['pppoe_username', 'pppoe_name', 'username']);
    final phone = _s(c, ['phone', 'mobile']);
    final date = _fmtDate(_s(c, ['billing_cycle', 'expire_date', 'expiry_date']));
    final promise = _fmtDate(_s(c, ['promise_date']));
    final isDue = _tab == 0;
    final fee = numOf(c['monthly_bill'] ?? c['monthly_fee']);
    final bal = numOf(c['balance']);

    return InkWell(
      onTap: () => _open(c),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 10, 0, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            LetterAvatar(text: name, radius: 26),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 5, vertical: 1),
                        decoration: BoxDecoration(
                          color: const Color(0xFFCE93D8),
                          borderRadius: BorderRadius.circular(5),
                        ),
                        child: const Text('ID',
                            style: TextStyle(
                                fontSize: 13,
                                color: Colors.white,
                                fontWeight: FontWeight.bold)),
                      ),
                      const SizedBox(width: 8),
                      Text(Lang.i.digits(cid),
                          style: const TextStyle(
                              fontSize: 21,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF555555))),
                    ],
                  ),
                  _line(Icons.person, AppColors.sky, name),
                  _line(Icons.language, AppColors.sky, 'pppoe: $user'),
                  _line(
                    Icons.smartphone,
                    const Color(0xFF444444),
                    phone.isEmpty ? 'মোবাইল নাই' : Lang.i.digits(phone),
                  ),
                  if (date.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 3),
                      child: Text(
                          Lang.i.digits(isDue ? 'Billing Cycle: $date' : date),
                          style: const TextStyle(
                              fontSize: 15, color: AppColors.muted)),
                    ),
                  if (isDue && promise.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(Lang.i.digits('Promise: $promise'),
                          style: const TextStyle(
                              fontSize: 15,
                              fontStyle: FontStyle.italic,
                              color: AppColors.sky)),
                    ),
                ],
              ),
            ),
            SizedBox(
              width: 112,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Monthly Fee: ${Lang.i.digits(intl(fee))}',
                      style: const TextStyle(
                          fontSize: 18,
                          color: AppColors.sky,
                          fontWeight: FontWeight.w500)),
                  const SizedBox(height: 2),
                  Text('Balance: ${Lang.i.digits(intl(bal))} Tk.',
                      style: const TextStyle(
                          fontSize: 15, color: AppColors.text)),
                ],
              ),
            ),
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert, color: AppColors.sky),
              color: const Color(0xFF62B8EA),
              onSelected: (k) => _action(k, c),
              itemBuilder: (_) => [
                for (final k in const [
                  'Profile',
                  'Call',
                  'Whatsapp',
                  'Update',
                  'Bill Recharge',
                  'Bill Report',
                  'Inactive',
                  'Note',
                  'BandWidth',
                ])
                  PopupMenuItem<String>(
                    value: k,
                    child: Text(k,
                        style: const TextStyle(
                            fontSize: 19, color: Colors.white)),
                  ),
              ],
            ),
          ],
        ),
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
            OutlinedButton(onPressed: _refresh, child: Text(l.t('retry'))),
          ],
        ),
      );
    }
    final shown = _area.isEmpty
        ? List<Map<String, dynamic>>.of(_items)
        : _items
            .where((c) => _s(c, ['area_name', 'area']) == _area)
            .toList();
    if (_tab == 0 && _sort != 'Bill Date') {
      shown.sort((a, b) => _sort == 'Name'
          ? '${a['name']}'.compareTo('${b['name']}')
          : _s(a, ['promise_date']).compareTo(_s(b, ['promise_date'])));
    }
    if (shown.isEmpty) {
      return Center(child: Text(l.t('no_data')));
    }
    final extra = (_hasMore || _loading || _error != null) ? 1 : 0;
    return ListView.separated(
      controller: _scroll,
      itemCount: shown.length + extra,
      separatorBuilder: (_, __) => const Divider(height: 1, color: AppColors.line),
      itemBuilder: (_, i) {
        if (i >= shown.length) {
          if (_error != null) {
            return TextButton(onPressed: () => _load(), child: Text(l.t('load_more')));
          }
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        return _card(shown[i]);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      final areas = _areas;
      final shown = _area.isEmpty
          ? _items
          : _items.where((c) => _s(c, ['area_name', 'area']) == _area).toList();
      final isDue = _tab == 0;
      // Due ট্যাবে মোট বকেয়া = নেগেটিভ ব্যালেন্সের যোগফল
      final balance = isDue
          ? shown.fold<num>(0, (s, c) {
              final b = numOf(c['balance']);
              return b < 0 ? s - b : s;
            })
          : (_serverBalance ??
              shown.fold<num>(0, (s, c) => s + numOf(c['balance'])));

      return AdminScaffold(
        current: 'customer',
        title: 'PPPoE',
        actions: [
          IconButton(
            tooltip: 'Search',
            icon: Icon(_searching ? Icons.close : Icons.search, size: 28),
            onPressed: () {
              setState(() => _searching = !_searching);
              if (!_searching && _searchC.text.isNotEmpty) {
                _searchC.clear();
                _load(reset: true);
              }
            },
          ),
          IconButton(
            tooltip: 'Refresh',
            icon: const Icon(Icons.sync, size: 28),
            onPressed: _refresh,
          ),
          IconButton(
            tooltip: 'Add customer',
            icon: const Icon(Icons.add, size: 30),
            onPressed: _addCustomer,
          ),
          const SizedBox(width: 4),
        ],
        // নীল বারের নিচে "Area ▾" পিল
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(76),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
            child: Align(
              alignment: Alignment.centerLeft,
              child: PopupMenuButton<String>(
                onSelected: (v) => setState(() => _area = v),
                itemBuilder: (_) => [
                  const PopupMenuItem(value: '', child: Text('Area')),
                  for (final a in areas)
                    PopupMenuItem(value: a, child: Text(a)),
                ],
                child: Container(
                  height: 50,
                  width: 280,
                  padding: const EdgeInsets.only(left: 20, right: 10),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.white),
                    borderRadius: BorderRadius.circular(26),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          _area.isEmpty ? 'Area' : _area,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 22, color: Colors.white),
                        ),
                      ),
                      const Icon(Icons.arrow_drop_down,
                          color: Colors.white, size: 36),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        body: Column(
          children: [
            NetfeeTabBar(
              labels: [
                for (var i = 0; i < 4; i++)
                  '${_tabNames[i]}\n(${l.digits('${_counts[i]}')})',
              ],
              index: _tab,
              onChanged: _setTab,
            ),
            if (_searching)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                child: TextField(
                  controller: _searchC,
                  autofocus: true,
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
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 6),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                if (isDue)
                  SizedBox(
                    width: 280,
                    child: PillDropdown<String>(
                      value: _sort,
                      values: const ['Bill Date', 'Promise Date', 'Name'],
                      label: (v) => v,
                      width: 280,
                      onChanged: (v) => setState(() => _sort = v),
                    ),
                  )
                else
                  const SizedBox.shrink(),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(isDue ? 'Due' : 'Balance',
                        style: TextStyle(
                            fontSize: 15,
                            color: AppColors.muted,
                            decoration: isDue
                                ? TextDecoration.underline
                                : TextDecoration.none)),
                    Text('${l.digits(intl(balance))} Tk.',
                        style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF555555))),
                  ],
                ),
                ],
              ),
            ),
            Expanded(child: _list(l)),
          ],
        ),
      );
    });
  }
}

class _CustomerForm extends StatefulWidget {
  final Map<String, dynamic>? customer;
  const _CustomerForm({this.customer});

  @override
  State<_CustomerForm> createState() => _CustomerFormState();
}

class _CustomerFormState extends State<_CustomerForm> {
  final _formKey = GlobalKey<FormState>();
  final _fields = <String, TextEditingController>{};
  List<Map<String, dynamic>> _routers = [];
  List<Map<String, dynamic>> _areas = [];
  List<Map<String, dynamic>> _subAreas = [];
  List<Map<String, dynamic>> _packages = [];
  List<Map<String, dynamic>> _divisions = [];
  List<Map<String, dynamic>> _districts = [];
  List<Map<String, dynamic>> _upazilas = [];
  int? _routerId, _areaId, _subAreaId, _packageId;
  int? _divisionId, _districtId, _upazilaId;
  String _status = 'Active';
  String _billingType = 'Prepaid';
  String _autoConnection = 'Will continue';
  bool _busy = false;
  bool _loading = true;
  bool _autoContinue = true;
  bool _autoNextMonth = false;

  bool get _editing => widget.customer != null;

  TextEditingController _field(String key) =>
      _fields.putIfAbsent(key, () {
        final aliases = <String, String>{
          'comment': 'comments',
          'nid': 'nid_no',
          'mobile': 'phone',
        };
        final sourceKey = aliases[key] ?? key;
        return TextEditingController(
          text: '${widget.customer?[sourceKey] ?? ''}',
        );
      });

  List<Map<String, dynamic>> _rows(dynamic value) {
    if (value is! List) return [];
    return value.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  int? _id(dynamic value) {
    final n = int.tryParse('$value');
    return n != null && n > 0 ? n : null;
  }
  int? _idByName(List<Map<String, dynamic>> items, String name) {
    if (name.isEmpty) return null;
    for (final item in items) {
      final itemName =
          '${item['name'] ?? item['division'] ?? item['district'] ?? item['upazila'] ?? ''}'
              .trim()
              .toLowerCase();
      if (itemName == name.toLowerCase()) return _id(item['id']);
    }
    return null;
  }



  String _selectedName(
    List<Map<String, dynamic>> items,
    int? selectedId,
  ) {
    if (selectedId == null) return '';
    for (final item in items) {
      if (_id(item['id']) == selectedId) {
        return '${item['name'] ?? item['name_bn'] ?? ''}';
      }
    }
    return '';
  }

  String get _selectedPackagePrice {
    for (final item in _packages) {
      if (_id(item['id']) == _packageId) {
        return '${item['price'] ?? 0}';
      }
    }
    return '0';
  }
  @override
  void initState() {
    super.initState();
    _status = '${widget.customer?['status'] ?? 'Active'}';
    final billingType =
        '${widget.customer?['billing_type'] ?? 'Prepaid'}'.trim().toLowerCase();
    _billingType = billingType == 'postpaid' ? 'Postpaid' : 'Prepaid';
    _initForm();
  }

  Future<void> _initForm() async {
    try {
      final routerResponse = await ApiService.customerMikrotiks();
      final divisionResponse = await ApiService.customerDivisions();
      _routers = _rows(routerResponse['data'] ?? routerResponse['mikrotiks']);
      _divisions = _rows(divisionResponse['data']);

      if (_editing) {
        _routerId = _id(widget.customer!['mikrotik_id']);
        _areaId = _id(widget.customer!['area_id']);
        _subAreaId = _id(widget.customer!['sub_area_id']);
        _packageId = _id(widget.customer!['package_id']);
        if (_routerId != null) {
          final a = await ApiService.customerAreas(_routerId!);
          final p = await ApiService.customerPackages(_routerId!);
          _areas = _rows(a['data']);
          _packages = _rows(p['packages'] ?? p['data']);
        }
        if (_areaId != null) {
          final s = await ApiService.customerSubAreas(_areaId!);
          _subAreas = _rows(s['data']);
        }
        final divisionName = '${widget.customer!['division'] ?? ''}'.trim();
        _divisionId = _idByName(_divisions, divisionName);

        if (_divisionId != null) {
          final d = await ApiService.customerDistricts(_divisionId!);
          _districts = _rows(d['data']);
        }

        final districtName = '${widget.customer!['district'] ?? ''}'.trim();
        _districtId = _idByName(_districts, districtName);

        if (_districtId != null) {
          final u = await ApiService.customerUpazilas(_districtId!);
          _upazilas = _rows(u['data']);
        }

        final upazilaName = '${widget.customer!['upazila'] ?? ''}'.trim();
        _upazilaId = _idByName(_upazilas, upazilaName);

        final autoConnection =
            '${widget.customer!['auto_connection'] ?? ''}'.trim().toLowerCase();
        _autoContinue = autoConnection == 'will continue' ||
            autoConnection == '1' || autoConnection == 'true';
        _autoNextMonth =
            num.tryParse('${widget.customer!['auto_next_month'] ?? 0}') == 1 ||
            autoConnection == 'next month';
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Dropdown load failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _routerChanged(int? id) async {
    setState(() {
      _routerId = id;
      _areaId = null;
      _subAreaId = null;
      _packageId = null;
      _areas = [];
      _subAreas = [];
      _packages = [];
    });
    if (id == null) return;
    try {
final results = await Future.wait<Map<String, dynamic>>([
  ApiService.customerAreas(id),
  ApiService.customerPackages(id),
]);
      if (!mounted) return;
      setState(() {
        _areas = _rows(results[0]['data']);
        _packages = _rows(results[1]['packages'] ?? results[1]['data']);
      });
    } catch (e) {
      if (mounted) _message('$e');
    }
  }

  Future<void> _areaChanged(int? id) async {
    setState(() {
      _areaId = id;
      _subAreaId = null;
      _subAreas = [];
    });
    if (id == null) return;
    try {
      final r = await ApiService.customerSubAreas(id);
      if (mounted) setState(() => _subAreas = _rows(r['data']));
    } catch (e) {
      if (mounted) _message('$e');
    }
  }

  Future<void> _divisionChanged(int? id) async {
    setState(() {
      _divisionId = id;
      _districtId = null;
      _upazilaId = null;
      _districts = [];
      _upazilas = [];
    });
    if (id == null) return;
    try {
      final r = await ApiService.customerDistricts(id);
      if (mounted) setState(() => _districts = _rows(r['data']));
    } catch (e) {
      if (mounted) _message('$e');
    }
  }

  Future<void> _districtChanged(int? id) async {
    setState(() {
      _districtId = id;
      _upazilaId = null;
      _upazilas = [];
    });
    if (id == null) return;
    try {
      final r = await ApiService.customerUpazilas(id);
      if (mounted) setState(() => _upazilas = _rows(r['data']));
    } catch (e) {
      if (mounted) _message('$e');
    }
  }

  void _message(String value) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(value.replaceFirst('Exception: ', ''))),
    );
  }

  Widget _text(String key, String label, {
    bool required = false,
    TextInputType? keyboard,
    bool obscure = false,
    int lines = 1,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        controller: _field(key),
        keyboardType: keyboard,
        obscureText: obscure,
        maxLines: lines,
        validator: required
            ? (v) => (v == null || v.trim().isEmpty) ? 'Required' : null
            : null,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          isDense: true,
        ),
      ),
    );
  }

  Widget _dropdown(
    String label,
    List<Map<String, dynamic>> items,
    int? value,
    ValueChanged<int?> changed, {
    bool required = true,
  }) {
    final validItems = items.where((e) => _id(e['id']) != null).toList();
    final selected = validItems.any((e) => _id(e['id']) == value) ? value : null;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: DropdownButtonFormField<int>(
        initialValue: selected,
        isExpanded: true,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          isDense: true,
        ),
        items: validItems.map((e) => DropdownMenuItem<int>(
          value: _id(e['id']),
          child: Text('${e['name'] ?? e['package_name'] ?? e['title'] ?? ''}'),
        )).toList(),
        onChanged: changed,
        validator: (v) => required && v == null ? 'Required' : null,
      ),
    );
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;

    if (_routerId == null || _packageId == null ||
        _areaId == null || _subAreaId == null) {
      _message('Select MikroTik, Area, Sub-area and Package');
      return;
    }

    if (_editing && _id(widget.customer!['id']) == null) {
      _message('Invalid customer ID');
      return;
    }

    setState(() => _busy = true);

    try {
      final body = <String, dynamic>{
        'mikrotik_id': _routerId,
        'package_id': _packageId,
        'pppoe_name': _field('pppoe_name').text.trim(),
        'password': _field('password').text,
        'status': _status,
        'comment': _field('comment').text.trim(),
        'customer_id': _field('customer_id').text.trim(),
        'area_id': _areaId,
        'sub_area_id': _subAreaId,
        'name': _field('name').text.trim(),
        'address': _field('address').text.trim(),
        'email': _field('email').text.trim(),
        'billing_type': _billingType,
        'balance': _field('balance').text.trim().isEmpty
            ? '0' : _field('balance').text.trim(),
        'billing_cycle': _field('billing_cycle').text.trim(),
        'birth_date': _field('birth_date').text.trim(),
        'connection_date': _field('connection_date').text.trim(),
        'promise_date': _field('promise_date').text.trim(),
        'connection_fee': _field('connection_fee').text.trim().isEmpty
            ? '0' : _field('connection_fee').text.trim(),
        'reference_name': _field('reference_name').text.trim(),
        'reference_mobile': _field('reference_mobile').text.trim(),
      };

      if (_editing) {
        body.addAll({
          'phone': _field('mobile').text.trim(),
          'nid_no': _field('nid').text.trim(),
          'monthly_bill': num.tryParse(_selectedPackagePrice) ?? 0,
          'division': _selectedName(_divisions, _divisionId),
          'district': _selectedName(_districts, _districtId),
          'upazila': _selectedName(_upazilas, _upazilaId),
          'auto_fields': true,
          'auto_continue': _autoContinue,
          'auto_next_month': _autoNextMonth,
        });

        await ApiService.updateCustomer(
          _id(widget.customer!['id'])!,
          body,
        );
      } else {
        body.addAll({
          'mobile': _field('mobile').text.trim(),
          'nid': _field('nid').text.trim(),
          'division_id': _divisionId,
          'district_id': _districtId,
          'upazila_id': _upazilaId,
          'auto_connection': _autoConnection,
        });

        await ApiService.createCustomer(body);
      }

      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) _message('$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
  @override
  void dispose() {
    for (final c in _fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final availableHeight = media.size.height -
        media.viewInsets.bottom -
        media.padding.top -
        media.padding.bottom;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 12),
        child: _loading
            ? const SizedBox(
                height: 180,
                child: Center(child: CircularProgressIndicator()),
              )
            : SizedBox(
                height: (availableHeight - 30).clamp(200.0, media.size.height * 0.88),
                child: Form(
                  key: _formKey,
                  child: ListView(
                    shrinkWrap: true,
                    children: [
                      Text(
                        _editing ? 'Edit Customer' : 'Add Customer',
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 16),

                      _text('customer_id', 'Customer ID', required: true),
                      _dropdown('MikroTik', _routers, _routerId, _routerChanged),
                      _dropdown('Area', _areas, _areaId, _areaChanged),
                      _dropdown(
                        'Sub-area',
                        _subAreas,
                        _subAreaId,
                        (v) => setState(() => _subAreaId = v),
                      ),
                      _dropdown(
                        'Package',
                        _packages,
                        _packageId,
                        (v) => setState(() => _packageId = v),
                      ),

                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: InputDecorator(
                          decoration: const InputDecoration(
                            labelText: 'Monthly Fee',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                          child: Text(_selectedPackagePrice),
                        ),
                      ),

                      _text('balance', 'Balance',
                        keyboard: const TextInputType.numberWithOptions(decimal: true)),
                      _text('pppoe_name', 'PPPoE Username', required: true),
                      _text(
                        'password',
                        _editing
                            ? 'New PPPoE Password (required)'
                            : 'PPPoE Password',
                        required: true,
                        obscure: true,
                      ),
                      _text('name', 'Customer Name', required: true),
                      _text('mobile', 'Mobile Number',
                        keyboard: TextInputType.phone),
                      _text('nid', 'NID'),
                      _text('birth_date', 'Birth Date'),
                      _text('address', 'Address', lines: 2),
                      _text('email', 'Email',
                        keyboard: TextInputType.emailAddress),
                      _text('billing_cycle', 'Billing Cycle', required: true),
                      if (_editing) _text('promise_date', 'Promise Date'),
                      _text('connection_date', 'Connection Date'),
                      _text('connection_fee', 'Connection Fee',
                        keyboard: const TextInputType.numberWithOptions(decimal: true)),

                      DropdownButtonFormField<String>(
                        initialValue: _billingType,
                        decoration: const InputDecoration(
                          labelText: 'Billing Type',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                        items: const [
                          DropdownMenuItem(
                            value: 'Prepaid',
                            child: Text('Prepaid'),
                          ),
                          DropdownMenuItem(
                            value: 'Postpaid',
                            child: Text('Postpaid'),
                          ),
                        ],
                        onChanged: (v) =>
                            setState(() => _billingType = v ?? 'Prepaid'),
                      ),
                      const SizedBox(height: 12),

                      _dropdown(
                        'Division',
                        _divisions,
                        _divisionId,
                        _divisionChanged,
                        required: false,
                      ),
                      _dropdown(
                        'District',
                        _districts,
                        _districtId,
                        _districtChanged,
                        required: false,
                      ),
                      _dropdown(
                        'Upazila',
                        _upazilas,
                        _upazilaId,
                        (v) => setState(() => _upazilaId = v),
                        required: false,
                      ),

                      _text('comment', 'Comment', lines: 2),
                      _text('reference_name', 'Reference Name'),
                      _text('reference_mobile', 'Reference Mobile',
                        keyboard: TextInputType.phone),

                      if (_editing) ...[
                        CheckboxListTile(
                          contentPadding: EdgeInsets.zero,
                          title: const Text('Automatic Connection'),
                          subtitle: const Text('Continue automatically'),
                          value: _autoContinue,
                          onChanged: (v) =>
                              setState(() => _autoContinue = v ?? false),
                        ),
                        CheckboxListTile(
                          contentPadding: EdgeInsets.zero,
                          title: const Text('Automatic Next Month'),
                          value: _autoNextMonth,
                          onChanged: (v) =>
                              setState(() => _autoNextMonth = v ?? false),
                        ),
                      ] else ...[
                        DropdownButtonFormField<String>(
                          initialValue: _autoConnection,
                          decoration: const InputDecoration(
                            labelText: 'Automatic Connection',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                          items: const [
                            DropdownMenuItem(
                              value: 'Will continue',
                              child: Text('Will continue'),
                            ),
                            DropdownMenuItem(
                              value: 'Next Month',
                              child: Text('Next Month'),
                            ),
                          ],
                          onChanged: (v) => setState(
                            () => _autoConnection = v ?? 'Will continue',
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],

                      DropdownButtonFormField<String>(
                        initialValue: _status,
                        decoration: const InputDecoration(
                          labelText: 'Status',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                        items: [
                          const DropdownMenuItem(
                            value: 'Active',
                            child: Text('Active'),
                          ),
                          if (_editing) ...[
                            const DropdownMenuItem(
                              value: 'Inactive',
                              child: Text('Inactive'),
                            ),
                            const DropdownMenuItem(
                              value: 'Expired',
                              child: Text('Expired'),
                            ),
                          ],
                        ],
                        onChanged: (v) =>
                            setState(() => _status = v ?? 'Active'),
                      ),
                      const SizedBox(height: 16),

                      FilledButton.icon(
                        onPressed: _busy ? null : _save,
                        icon: _busy
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.save),
                        label: Text(_busy ? 'Saving...' : 'Save Customer'),
                      ),
                    ],
                  ),
                ),
              ),
      ),
    );
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
                    Wrap(
                      spacing: 8,
                      children: [
                        OutlinedButton.icon(
                          onPressed: () => Navigator.pop(context, 'edit'),
                          icon: const Icon(Icons.edit),
                          label: const Text('Edit'),
                        ),
                        OutlinedButton.icon(
                          onPressed: () async {
                            final ok = await showDialog<bool>(
                              context: context,
                              builder: (ctx) => AlertDialog(
                                title: const Text('Delete customer?'),
                                content: const Text(
                                  'This action may be blocked if payment history exists. '
                                  'Choose whether to also delete the MikroTik PPPoE secret.'),
                                actions: [
                                  TextButton(
                                    onPressed: () => Navigator.pop(ctx, false),
                                    child: const Text('Cancel'),
                                  ),
                                  FilledButton(
                                    onPressed: () => Navigator.pop(ctx, true),
                                    child: const Text('Continue'),
                                  ),
                                ],
                              ),
                            );
                            if (ok != true || !context.mounted) return;
                            final deleteMikrotik = await showDialog<bool>(
                              context: context,
                              builder: (ctx) => AlertDialog(
                                title: const Text('MikroTik secret'),
                                content: const Text(
                                  'Also delete this customer PPPoE secret from MikroTik?'),
                                actions: [
                                  TextButton(
                                    onPressed: () => Navigator.pop(ctx, false),
                                    child: const Text('Keep secret'),
                                  ),
                                  FilledButton(
                                    onPressed: () => Navigator.pop(ctx, true),
                                    child: const Text('Delete secret'),
                                  ),
                                ],
                              ),
                            );
                            if (deleteMikrotik == null || !context.mounted) return;
                            try {
                              await ApiService.deleteCustomer(
                                numOf(c['id']).toInt(),
                                deleteMikrotik: deleteMikrotik,
                              );
                              if (context.mounted) {
                                Navigator.pop(context, 'deleted');
                              }
                            } catch (e) {
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text(
                                    e.toString().replaceFirst('Exception: ', ''))),
                                );
                              }
                            }
                          },
                          icon: const Icon(Icons.delete_outline),
                          label: const Text('Delete'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
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











