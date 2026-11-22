import 'dart:async';
import 'package:url_launcher/url_launcher.dart';
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
import 'customer_pages.dart';
import '../core/tr.dart';

/// Ã Â¦â€”Ã Â§ÂÃ Â¦Â°Ã Â¦Â¾Ã Â¦Â¹Ã Â¦â€¢ Ã Â¦Â¤Ã Â¦Â¾Ã Â¦Â²Ã Â¦Â¿Ã Â¦â€¢Ã Â¦Â¾ (Ã Â¦Â¶Ã Â§ÂÃ Â¦Â§Ã Â§Â Ã Â¦ÂªÃ Â¦Â¡Ã Â¦Â¼Ã Â¦Â¾) + Ã Â¦Â¬Ã Â¦Â¿Ã Â¦Â¸Ã Â§ÂÃ Â¦Â¤Ã Â¦Â¾Ã Â¦Â°Ã Â¦Â¿Ã Â¦Â¤Ã Â¥Â¤ Backend: GET /admin/customers (permission: customer_list)
class CustomersScreen extends StatefulWidget {
  const CustomersScreen({super.key});

  @override
  State<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends State<CustomersScreen> {
  // স্ক্রিনশটের ট্যাব: DUE | PAID | INACTIVE | EXPIRED
  List<String> get _tabNames => [
        tr('বকেয়া', 'Due'),
        tr('পরিশোধ', 'Paid'),
        tr('বন্ধ', 'Inactive'),
        tr('এক্সপায়ার্ড', 'Expired'),
      ];
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
    final result = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => CustomerProfilePage(summary: c)),
    );
    if (!mounted) return;
    if (result == 'deleted') _refresh();
  }

  /// Inactive → MikroTik PPPoE সিক্রেট ডিজেবল; Active → আবার চালু।
  /// Update ফর্মের মতোই সার্ভারে PUT যায় (শুধু status বদলে), তাই MikroTik সিঙ্ক সার্ভারই করে।
  Future<void> _setStatus(Map<String, dynamic> row, String status) async {
    final name = '${row['name'] ?? ''}';
    final disable = status == 'Inactive';
    final ok = await _dialogBn(
      name,
      disable
          ? tr('MikroTik-এ এই গ্রাহকের PPPoE বন্ধ হবে।',
              "This customer's PPPoE will be disabled on MikroTik.")
          : tr('MikroTik-এ এই গ্রাহকের PPPoE আবার চালু হবে।',
              "This customer's PPPoE will be enabled again on MikroTik."),
      cancel: true,
    );
    if (!ok || !mounted) return;
    try {
      await _putCustomer(row, status: status);
      if (!mounted) return;
      _toast(disable ? tr('বন্ধ করা হয়েছে', 'Deactivated') : tr('চালু করা হয়েছে', 'Activated'));
      _refresh();
    } catch (e) {
      if (mounted) _toast(e.toString().replaceFirst('Exception: ', ''));
    }
  }

  /// সার্ভারে গ্রাহকের পুরো তথ্যসহ PUT (শুধু status বা comment বদলে)
  Future<void> _putCustomer(Map<String, dynamic> row,
      {String? status, String? comment}) async {
      final id = numOf(row['id']).toInt();
      final r = await ApiService.customerDetail(id);
      final c = Map<String, dynamic>.from(
          (r['customer'] is Map ? r['customer'] : r) as Map);
      String v(String k) => '${c[k] ?? ''}'.trim();
      final auto = v('auto_connection').toLowerCase();
      final body = <String, dynamic>{
        'mikrotik_id': c['mikrotik_id'],
        'package_id': c['package_id'],
        'pppoe_name': v('pppoe_name').isNotEmpty ? v('pppoe_name') : v('pppoe_username'),
        'password': v('password').isNotEmpty ? v('password') : v('pppoe_password'),
        'status': status ?? v('status'),
        'comment': comment ?? v('comments'),
        'customer_id': v('customer_id'),
        'area_id': c['area_id'],
        'sub_area_id': c['sub_area_id'],
        'name': v('name'),
        'address': v('address'),
        'email': v('email'),
        'billing_type': v('billing_type').isEmpty ? 'Prepaid' : v('billing_type'),
        'balance': v('balance').isEmpty ? '0' : v('balance'),
        'billing_cycle': v('billing_cycle'),
        'birth_date': v('birth_date'),
        'connection_date': v('connection_date'),
        'promise_date': v('promise_date'),
        'connection_fee': v('connection_fee').isEmpty ? '0' : v('connection_fee'),
        'reference_name': v('reference_name'),
        'reference_mobile': v('reference_mobile'),
        'phone': v('phone'),
        'nid_no': v('nid_no'),
        'monthly_bill': numOf(c['monthly_bill']),
        'division': v('division'),
        'district': v('district'),
        'upazila': v('upazila'),
        'auto_fields': true,
        'auto_continue': auto == 'will continue' || auto == '1' || auto == 'true',
        'auto_next_month':
            num.tryParse('${c['auto_next_month'] ?? 0}') == 1 || auto == 'next month',
      };
      await ApiService.updateCustomer(id, body);
  }

  static final _mobileRe = RegExp(r'(?:\+?88)?(01[3-9]\d{8})');

  List<String> _numbersOf(Map<String, dynamic> c) {
    final out = <String>[];
    for (final k in const [
      'phone', 'mobile', 'whatsapp', 'whatsapp_no', 'alt_phone',
      'alternate_phone', 'secondary_phone', 'phone2',
    ]) {
      for (final m in _mobileRe.allMatches('${c[k] ?? ''}'.replaceAll(RegExp(r'[\s-]'), ''))) {
        final n = m.group(1)!;
        if (!out.contains(n)) out.add(n);
      }
    }
    return out;
  }

  /// দুটো নম্বর থাকলে: Call → প্রথম নম্বর (ফোনের ডায়াল), WhatsApp → দ্বিতীয় নম্বর।
  /// একটাই থাকলে দুটোতেই সেই নম্বর।
  Future<void> _contact(Map<String, dynamic> row, bool call) async {
    var nums = _numbersOf(row);
    if (nums.length < 2) {
      // লিস্টে সব নম্বর না-ও থাকতে পারে — বিস্তারিত থেকে দেখা
      try {
        final r = await ApiService.customerDetail(numOf(row['id']).toInt());
        final c = Map<String, dynamic>.from(
            (r['customer'] is Map ? r['customer'] : r) as Map);
        final more = _numbersOf(c);
        if (more.length > nums.length) nums = more;
      } catch (_) {}
    }
    if (!mounted) return;
    if (nums.isEmpty) {
      _toast('মোবাইল নাই');
      return;
    }
    final callNo = nums.first;
    final waNo = nums.length > 1 ? nums[1] : nums.first;
    final uri = call
        ? Uri(scheme: 'tel', path: callNo)
        : Uri.parse('https://wa.me/88$waNo');
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && mounted) _toast('খুলতে পারেনি: ${call ? callNo : waNo}');
    } catch (_) {
      if (mounted) _toast('খুলতে পারেনি: ${call ? callNo : waNo}');
    }
  }

  Future<void> _note(Map<String, dynamic> row) async {
    final text = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => CustomerNotePage(summary: row)),
    );
    if (text == null || text.trim().isEmpty || !mounted) return;
    try {
      await _putCustomer(row, comment: text.trim());
      if (mounted) {
        _toast('নোট সংরক্ষিত হয়েছে');
        _refresh();
      }
    } catch (e) {
      if (mounted) _toast(e.toString().replaceFirst('Exception: ', ''));
    }
  }

  String _menuLabel(String k) {
    switch (k) {
      case 'Profile':
        return tr('প্রোফাইল', 'Profile');
      case 'Call':
        return tr('কল', 'Call');
      case 'Whatsapp':
        return tr('হোয়াটসঅ্যাপ', 'Whatsapp');
      case 'Update':
        return tr('আপডেট', 'Update');
      case 'Bill Recharge':
        return tr('রিচার্জ করুন', 'Bill Recharge');
      case 'Bill Report':
        return tr('বিল রিপোর্ট', 'Bill Report');
      case 'Inactive':
        return tr('বন্ধ করুন', 'Inactive');
      case 'Active':
        return tr('চালু করুন', 'Active');
      case 'Note':
        return tr('নোট', 'Note');
      case 'Password Reset':
        return tr('পাসওয়ার্ড রিসেট', 'Password Reset');
      case 'BandWidth':
        return tr('ব্যান্ডউইথ', 'BandWidth');
    }
    return k;
  }

  /// স্ক্রিনশটের মতো ডায়ালগ: মাঝে বোল্ড নাম, বার্তা, নিচে নীল-বর্ডার গোল বোতাম
  Future<bool> _dialogBn(String title, String msg,
      {bool cancel = false}) async {
    final r = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: const RoundedRectangleBorder(),
        title: Text(title,
            textAlign: TextAlign.center,
            style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: Color(0xFF555555))),
        content: Text(msg,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 19, color: Color(0xFF666666))),
        actionsAlignment: MainAxisAlignment.center,
        actionsPadding: const EdgeInsets.only(bottom: 18),
        actions: [
          if (cancel)
            OutlinedButton(
              onPressed: () => Navigator.pop(ctx, false),
              style: OutlinedButton.styleFrom(
                shape: const StadiumBorder(),
                side: const BorderSide(color: AppColors.sky),
              ),
              child: Text(tr('বাতিল', 'Cancel'),
                  style: const TextStyle(fontSize: 19, color: AppColors.sky)),
            ),
          OutlinedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: OutlinedButton.styleFrom(
              shape: const StadiumBorder(),
              side: const BorderSide(color: AppColors.sky),
            ),
            child: Text(tr('ঠিক আছে', 'OK'),
                style: const TextStyle(fontSize: 19, color: AppColors.sky)),
          ),
        ],
      ),
    );
    return r == true;
  }

  /// "পাসওয়ার্ড রিসেট" = গ্রাহকের অ্যাপ-অ্যাকাউন্ট (ইউজার) পাসওয়ার্ড; PPPoE পাসওয়ার্ড না।
  Future<void> _resetPassword(Map<String, dynamic> row) async {
    final name = '${row['name'] ?? ''}';
    final ok = await _dialogBn(
      name,
      tr('উক্ত ইউজারের পাসওয়ার্ড রিসেট হবে।',
          "This user's password will be reset."),
      cancel: true,
    );
    if (!ok || !mounted) return;
    try {
      final r = await ApiService.resetCustomerMobileAccount(
          numOf(row['id']).toInt());
      if (!mounted) return;
      final pw = '${r['password'] ?? r['new_password'] ?? r['temp_password'] ?? ''}'
          .trim();
      await _dialogBn(
        name,
        pw.isEmpty
            ? tr('পাসওয়ার্ড রিসেট হয়েছে।', 'Password has been reset.')
            : '${tr('নতুন পাসওয়ার্ড', 'New password')}: $pw',
      );
    } catch (e) {
      if (mounted) _toast(e.toString().replaceFirst('Exception: ', ''));
    }
  }

  void _bandwidth(Map<String, dynamic> row) {
    Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => CustomerBandwidthPage(summary: row)),
    );
  }

  void _billReport(Map<String, dynamic> c) {
    Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => CustomerBillReportPage(summary: c)),
    );
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
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const _CustomerForm()),
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
      final saved = await Navigator.of(context).push<bool>(
        MaterialPageRoute(builder: (_) => _CustomerForm(customer: customer)),
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
    switch (key) {
      case 'Profile':
        _open(c);
        break;
      case 'Bill Report':
        _billReport(c);
        break;
      case 'Inactive':
        _setStatus(c, 'Inactive');
        break;
      case 'Active':
        _setStatus(c, 'Active');
        break;
      case 'Update':
        _editCustomer(c);
        break;
      case 'Bill Recharge':
        _recharge(c);
        break;
      case 'Call':
      case 'Whatsapp':
        _contact(c, key == 'Call');
        break;
      case 'Note':
        _note(c);
        break;
      case 'Password Reset':
        _resetPassword(c);
        break;
      case 'BandWidth':
        _bandwidth(c);
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
              color: AppColors.sky,
              onSelected: (k) => _action(k, c),
              itemBuilder: (_) => [
                for (final k in [
                  'Profile',
                  'Call',
                  'Whatsapp',
                  'Update',
                  'Bill Recharge',
                  'Bill Report',
                  '${c['status'] ?? ''}'.toLowerCase() == 'active'
                      ? 'Inactive'
                      : 'Active',
                  'Note',
                  'Password Reset',
                  'BandWidth',
                ])
                  PopupMenuItem<String>(
                    value: k,
                    child: Text(_menuLabel(k),
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
                  PopupMenuItem(value: '', child: Text(tr('এরিয়া', 'Area'))),
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
                          _area.isEmpty ? tr('এরিয়া', 'Area') : _area,
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
  padding: const EdgeInsets.fromLTRB(14, 10, 14, 6),
  child: Wrap(
    alignment: WrapAlignment.spaceBetween,
    crossAxisAlignment: WrapCrossAlignment.center,
    runSpacing: 8,
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
        ),
      Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            isDue
                ? tr('বকেয়া', 'Due')
                : tr('ব্যালেন্স', 'Balance'),
            style: TextStyle(
              fontSize: 15,
              color: AppColors.muted,
              decoration: isDue
                  ? TextDecoration.underline
                  : TextDecoration.none,
            ),
          ),
          Text(
            '${l.digits(intl(balance))} Tk.',
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: Color(0xFF555555),
            ),
          ),
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
  bool _updateBalance = false;
  bool _showPw = false;

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

  InputDecoration _pill(String hint) => InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(fontSize: 20, color: Color(0xFF444444)),
        isDense: false,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(26),
          borderSide: const BorderSide(color: Color(0xFF555555)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(26),
          borderSide: const BorderSide(color: Color(0xFF555555)),
        ),
      );

  Widget _text(String key, String label, {
    bool required = false,
    TextInputType? keyboard,
    bool obscure = false,
    int lines = 1,
    bool enabled = true,
    Widget? suffix,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: TextFormField(
        controller: _field(key),
        keyboardType: keyboard,
        obscureText: obscure,
        maxLines: obscure ? 1 : lines,
        enabled: enabled,
        style: TextStyle(
            fontSize: 24,
            color: enabled ? const Color(0xFF222222) : const Color(0xFFB0B0B0)),
        validator: required
            ? (v) => (v == null || v.trim().isEmpty) ? 'Required' : null
            : null,
        decoration: InputDecoration(
          labelText: required ? '$label*' : label,
          labelStyle:
              const TextStyle(fontSize: 20, color: Color(0xFF666666)),
          filled: true,
          fillColor: const Color(0xFFF4F5F5),
          suffixIcon: suffix,
          enabledBorder: const UnderlineInputBorder(
              borderSide: BorderSide(color: Color(0xFF888888))),
          disabledBorder: const UnderlineInputBorder(
              borderSide: BorderSide(color: Color(0xFFBDBDBD))),
          border: const UnderlineInputBorder(),
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
      padding: const EdgeInsets.only(bottom: 20),
      child: DropdownButtonFormField<int>(
        key: ValueKey('$label-${validItems.length}-$selected'),
        initialValue: selected,
        isExpanded: true,
        icon: const Icon(Icons.arrow_drop_down, size: 34),
        style: const TextStyle(fontSize: 22, color: Color(0xFF333333)),
        decoration: _pill(label),
        items: validItems.map((e) => DropdownMenuItem<int>(
          value: _id(e['id']),
          child: Text('${e['name'] ?? e['package_name'] ?? e['title'] ?? ''}'),
        )).toList(),
        onChanged: changed,
        validator: (v) => required && v == null ? 'Required' : null,
      ),
    );
  }

  Widget _strDropdown(String label, String value, List<String> values,
      ValueChanged<String> changed) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: DropdownButtonFormField<String>(
        initialValue: values.contains(value) ? value : values.first,
        isExpanded: true,
        icon: const Icon(Icons.arrow_drop_down, size: 34),
        style: const TextStyle(fontSize: 22, color: Color(0xFF333333)),
        decoration: _pill(label),
        items: [
          for (final v in values) DropdownMenuItem(value: v, child: Text(v)),
        ],
        onChanged: (v) {
          if (v != null) changed(v);
        },
      ),
    );
  }

  /// বিল তারিখ: গোল বক্সে "01-12-2026 10:27 PM", চাপলে তারিখ+সময় বাছাই
  Widget _billDatePill() {
    final ctl = _field('billing_cycle');
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: InkWell(
        borderRadius: BorderRadius.circular(26),
        onTap: () async {
          final now = DateTime.now();
          final cur = DateTime.tryParse(ctl.text.trim().replaceFirst(' ', 'T'));
          final base = (cur == null ? now : (cur.isUtc ? cur.toLocal() : cur));
          final d = await showDatePicker(
            context: context,
            initialDate: base,
            firstDate: DateTime(2000),
            lastDate: DateTime(2100),
          );
          if (d == null || !mounted) return;
          final tm = await showTimePicker(
            context: context,
            initialTime: TimeOfDay(hour: base.hour, minute: base.minute),
          );
          if (tm == null) return;
          String two(int n) => n.toString().padLeft(2, '0');
          setState(() => ctl.text =
              '${d.year}-${two(d.month)}-${two(d.day)} ${two(tm.hour)}:${two(tm.minute)}:00');
        },
        child: Container(
          height: 56,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFF555555)),
            borderRadius: BorderRadius.circular(26),
          ),
          child: Text(
            fmtDateTime(ctl.text).isEmpty
                ? 'Billing Cycle*'
                : fmtDateTime(ctl.text).replaceFirst(' ', '  '),
            style: const TextStyle(fontSize: 22, color: Color(0xFF666666)),
          ),
        ),
      ),
    );
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;

    if (_field('billing_cycle').text.trim().isEmpty) {
      _message('Select Billing Cycle date');
      return;
    }

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
        'balance': (_editing && !_updateBalance)
            ? '${widget.customer?['balance'] ?? 0}'
            : (_field('balance').text.trim().isEmpty
                ? '0' : _field('balance').text.trim()),
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
    final w = MediaQuery.of(context).size.width;
    final side = (w * 0.14).clamp(16.0, 120.0).toDouble();
    final cname = '${widget.customer?['name'] ?? ''}';

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: customerAppBar(_editing ? 'Update' : 'Add Customer', cname),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: EdgeInsets.fromLTRB(side, 28, side, 40),
                children: [
                  _dropdown('MikroTik', _routers, _routerId, _routerChanged),
                  _dropdown(
                    'Package',
                    _packages,
                    _packageId,
                    (v) => setState(() => _packageId = v),
                  ),
                  _text('customer_id', 'Customer ID', required: true),
                  // Monthly Fee: প্যাকেজের দাম অনুযায়ী (স্ক্রিনশটের ফিল্ডের মতো)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 20),
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Monthly Fee*',
                        labelStyle:
                            TextStyle(fontSize: 20, color: Color(0xFF666666)),
                        filled: true,
                        fillColor: Color(0xFFF4F5F5),
                        enabledBorder: UnderlineInputBorder(
                            borderSide: BorderSide(color: Color(0xFF888888))),
                        border: UnderlineInputBorder(),
                      ),
                      child: Text(_selectedPackagePrice,
                          style: const TextStyle(
                              fontSize: 24, color: Color(0xFF222222))),
                    ),
                  ),
                  _text('balance', 'Balance',
                      enabled: !_editing || _updateBalance,
                      keyboard: const TextInputType.numberWithOptions(
                          decimal: true, signed: true)),
                  if (_editing)
                    InkWell(
                      onTap: () =>
                          setState(() => _updateBalance = !_updateBalance),
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 14),
                        child: Row(children: [
                          Checkbox(
                            value: _updateBalance,
                            onChanged: (v) =>
                                setState(() => _updateBalance = v ?? false),
                          ),
                          const Text('Update Balance',
                              style: TextStyle(fontSize: 22)),
                        ]),
                      ),
                    ),
                  _text('pppoe_name', 'PPPoE Name', required: true),
                  _text(
                    'password',
                    'Password',
                    required: true,
                    obscure: !_showPw,
                    suffix: IconButton(
                      icon: Icon(
                          _showPw ? Icons.visibility : Icons.visibility_off,
                          size: 30),
                      onPressed: () => setState(() => _showPw = !_showPw),
                    ),
                  ),
                  if (_editing) ...[
                    InkWell(
                      onTap: () => setState(() => _autoContinue = !_autoContinue),
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 14),
                        child: Row(children: [
                          Checkbox(
                            value: _autoContinue,
                            onChanged: (v) =>
                                setState(() => _autoContinue = v ?? false),
                          ),
                          const Text('Automatic Connection',
                              style: TextStyle(fontSize: 22)),
                        ]),
                      ),
                    ),
                    InkWell(
                      onTap: () =>
                          setState(() => _autoNextMonth = !_autoNextMonth),
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 14),
                        child: Row(children: [
                          Checkbox(
                            value: _autoNextMonth,
                            onChanged: (v) =>
                                setState(() => _autoNextMonth = v ?? false),
                          ),
                          const Text('Automatic Next Month',
                              style: TextStyle(fontSize: 22)),
                        ]),
                      ),
                    ),
                  ] else
                    _strDropdown('Automatic Connection', _autoConnection,
                        const ['Will continue', 'Next Month'],
                        (v) => setState(() => _autoConnection = v)),
                  _billDatePill(),
                  _strDropdown(
                    'Status',
                    _status,
                    [
                      'Active',
                      if (_editing) ...['Inactive', 'Expired'],
                    ],
                    (v) => setState(() => _status = v),
                  ),
                  _dropdown('Area', _areas, _areaId, _areaChanged),
                  _dropdown(
                    'Sub-area',
                    _subAreas,
                    _subAreaId,
                    (v) => setState(() => _subAreaId = v),
                  ),
                  _text('name', 'Name', required: true),
                  _text('address', 'Address', lines: 2),
                  _text('email', 'Email',
                      keyboard: TextInputType.emailAddress),
                  _strDropdown('Billing Type', _billingType,
                      const ['Prepaid', 'Postpaid'],
                      (v) => setState(() => _billingType = v)),
                  // স্ক্রিনশটে নেই, কিন্তু আগের ফিচার হারাবে না — ভাঁজ করা অংশে
                  Theme(
                    data: Theme.of(context)
                        .copyWith(dividerColor: Colors.transparent),
                    child: ExpansionTile(
                      tilePadding: EdgeInsets.zero,
                      maintainState: true,
                      title: const Text('More',
                          style: TextStyle(
                              fontSize: 20, color: Color(0xFF666666))),
                      children: [
                        const SizedBox(height: 8),
                        _text('mobile', 'Mobile Number',
                            keyboard: TextInputType.phone),
                        _text('nid', 'NID'),
                        _text('birth_date', 'Birth Date'),
                        if (_editing) _text('promise_date', 'Promise Date'),
                        _text('connection_date', 'Connection Date'),
                        _text('connection_fee', 'Connection Fee',
                            keyboard: const TextInputType.numberWithOptions(
                                decimal: true)),
                        _dropdown('Division', _divisions, _divisionId,
                            _divisionChanged,
                            required: false),
                        _dropdown('District', _districts, _districtId,
                            _districtChanged,
                            required: false),
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
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  Center(
                    child: _busy
                        ? const CircularProgressIndicator()
                        : PillButton(
                            text: _editing ? 'Update' : 'Save',
                            onPressed: _save,
                          ),
                  ),
                ],
              ),
            ),
    );
  }
}
