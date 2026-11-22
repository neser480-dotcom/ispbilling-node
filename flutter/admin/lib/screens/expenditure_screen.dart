import 'package:material_ui/material_ui.dart';
import '../core/format.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../core/tr.dart';
import '../services/api_service.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';
import '../widgets/letter_avatar.dart';
import '../widgets/netfee_ui.dart';

/// Expenditure Report — Netfee স্টাইল। নতুন খরচ যোগ শুধু Admin (Backend যাচাই করে)।
/// Backend: GET/POST /admin/expenditures
class ExpenditureScreen extends StatefulWidget {
  const ExpenditureScreen({super.key});

  @override
  State<ExpenditureScreen> createState() => _ExpenditureScreenState();
}

class _ExpenditureScreenState extends State<ExpenditureScreen> {
  List<Map<String, dynamic>> _items = [];
  List<Map<String, dynamic>> _types = [];
  num _totalAmount = 0;
  int _year = DateTime.now().year;
  int _month = 0; // 0 = সব মাস
  String _role = ''; // ফাঁকা = সব (লোড হওয়া সারির user_role অনুযায়ী ফিল্টার)
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
      final r = periodRange(_year, _month);
      final d = await ApiService.expenditures(from: ymd(r.start), to: ymd(r.end));
      if (!mounted) return;
      List<Map<String, dynamic>> asList(dynamic v) =>
          v is List ? v.map((e) => mapOf(e)).toList() : <Map<String, dynamic>>[];
      final s = mapOf(d['summary']);
      setState(() {
        _items = asList(d['expenditures']);
        _types = asList(d['types']);
        _totalAmount = numOf(s['total_amount']);
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

  Future<void> _add() async {
    if (_types.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(tr('আগে ওয়েব থেকে খরচের ধরন (Type) যোগ করুন।',
              'Add an expenditure type from the web first.'))));
      return;
    }
    final saved = await showDialog<bool>(
      context: context,
      builder: (_) => _AddDialog(types: _types),
    );
    if (saved == true) _load();
  }

  List<String> get _roles {
    final set = <String>{};
    for (final e in _items) {
      final r = '${e['user_role'] ?? ''}'.trim();
      if (r.isNotEmpty) set.add(r);
    }
    return ['', ...set];
  }

  List<Map<String, dynamic>> get _shown => _role.isEmpty
      ? _items
      : _items.where((e) => '${e['user_role'] ?? ''}'.trim() == _role).toList();

  Widget _row(Map<String, dynamic> e) {
    final name = '${e['name'] ?? ''}';
    final type = '${e['expenditure_type'] ?? ''}';
    final sub = [name, if (name.isEmpty) type].where((x) => x.isNotEmpty).join(' · ');
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        children: [
          LetterAvatar(text: 'E', radius: 24, color: _avatarColor(e)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(tk(numOf(e['amount'])),
                    style: const TextStyle(
                        fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.sky)),
                if (sub.isNotEmpty)
                  Text(sub, style: const TextStyle(fontSize: 17, color: AppColors.text)),
                if (name.isNotEmpty && type.isNotEmpty)
                  Text(type, style: const TextStyle(fontSize: 14, color: AppColors.muted)),
                const SizedBox(height: 4),
                Text(dateOnly(e['created_at']),
                    style: const TextStyle(fontSize: 15, color: AppColors.text)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Color _avatarColor(Map<String, dynamic> e) {
    var sum = 0;
    for (final u in '${e['expenditure_type'] ?? e['name'] ?? ''}'.codeUnits) {
      sum += u;
    }
    return AppColors.avatars[sum % AppColors.avatars.length];
  }

  Widget _list(Lang l) {
    if (_loading) {
      return const Padding(
          padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()));
    }
    if (_error != null) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Column(children: [
          Text(_error!, textAlign: TextAlign.center),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: _load, child: Text(l.t('retry'))),
        ]),
      );
    }
    final rows = _shown;
    if (rows.isEmpty) {
      return Padding(
          padding: const EdgeInsets.all(32),
          child: Center(
              child: Text(l.t('no_data'),
                  style: const TextStyle(color: AppColors.muted, fontSize: 16))));
    }
    return Column(children: [for (final e in rows) _row(e)]);
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      final shownTotal = _role.isEmpty
          ? _totalAmount
          : _shown.fold<num>(0, (s, e) => s + numOf(e['amount']));
      return AdminScaffold(
        current: 'expenditure',
        title: tr('খরচ রিপোর্ট', 'Expenditure Report'),
        actions: [
          IconButton(icon: const Icon(Icons.sync, size: 30), onPressed: _load),
          IconButton(icon: const Icon(Icons.add, size: 32), onPressed: _add),
          const SizedBox(width: 4),
        ],
        body: ListView(
          padding: EdgeInsets.zero,
          children: [
            Container(
              width: double.infinity,
              color: AppColors.sky,
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 18),
              child: Align(
                alignment: Alignment.centerLeft,
                child: PillDropdown<String>(
                  value: _roles.contains(_role) ? _role : '',
                  values: _roles,
                  label: (v) => v.isEmpty ? tr('স্টাফ', 'Staff') : v,
                  onBlue: true,
                  width: 150,
                  onChanged: (v) => setState(() => _role = v),
                ),
              ),
            ),
            SummaryHeader(label: '${monthName(_month)},$_year', amount: tk(shownTotal)),
            YearMonthRow(
              year: _year,
              month: _month,
              onYear: (y) {
                setState(() => _year = y);
                _load();
              },
              onMonth: (m) {
                setState(() => _month = m);
                _load();
              },
            ),
            const SizedBox(height: 6),
            _list(l),
          ],
        ),
      );
    });
  }
}

class _AddDialog extends StatefulWidget {
  final List<Map<String, dynamic>> types;
  const _AddDialog({required this.types});

  @override
  State<_AddDialog> createState() => _AddDialogState();
}

class _AddDialogState extends State<_AddDialog> {
  final _nameC = TextEditingController();
  final _amountC = TextEditingController();
  int? _typeId;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _nameC.dispose();
    _amountC.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameC.text.trim();
    final amount = numOf(_amountC.text);
    if (_typeId == null || name.isEmpty || amount <= 0) {
      setState(() => _error = tr('ধরন, নাম ও সঠিক টাকার পরিমাণ দিন।',
          'Select a type and enter a name and a valid amount.'));
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ApiService.addExpenditure(typeId: _typeId!, name: name, amount: amount);
      if (mounted) Navigator.of(context).pop(true);
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
    return AlertDialog(
      title: Text(l.t('expenditure')),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          DropdownButtonFormField<int>(
            initialValue: _typeId,
            isExpanded: true,
            decoration: InputDecoration(labelText: tr('ধরন', 'Type')),
            items: widget.types
                .map((t) => DropdownMenuItem<int>(
                      value: numOf(t['id']).toInt(),
                      child: Text('${t['type_name'] ?? ''}', overflow: TextOverflow.ellipsis),
                    ))
                .toList(),
            onChanged: (v) => setState(() => _typeId = v),
          ),
          TextField(
            controller: _nameC,
            maxLength: 100,
            decoration: InputDecoration(labelText: l.t('name')),
          ),
          TextField(
            controller: _amountC,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(labelText: l.t('amount')),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            ),
        ]),
      ),
      actions: [
        TextButton(
            onPressed: _saving ? null : () => Navigator.of(context).pop(false),
            child: Text(l.t('cancel'))),
        FilledButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(
                    width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : Text(l.t('save'))),
      ],
    );
  }
}
