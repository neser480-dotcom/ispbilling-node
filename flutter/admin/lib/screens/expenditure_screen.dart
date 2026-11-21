import 'package:material_ui/material_ui.dart';
import '../core/format.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../core/tr.dart';
import '../services/api_service.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';

/// খরচ তালিকা + নতুন খরচ যোগ (যোগ করা শুধু Admin — Backend যাচাই করে)।
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
  int _totalRows = 0;
  DateTimeRange? _range;
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
      final d = await ApiService.expenditures(
        from: _range == null ? '' : ymd(_range!.start),
        to: _range == null ? '' : ymd(_range!.end),
      );
      if (!mounted) return;
      List<Map<String, dynamic>> asList(dynamic v) =>
          v is List ? v.map((e) => mapOf(e)).toList() : <Map<String, dynamic>>[];
      final s = mapOf(d['summary']);
      setState(() {
        _items = asList(d['expenditures']);
        _types = asList(d['types']);
        _totalAmount = numOf(s['total_amount']);
        _totalRows = numOf(s['total_rows']).toInt();
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

  Future<void> _pickRange() async {
    final now = DateTime.now();
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 5),
      lastDate: DateTime(now.year + 1),
      initialDateRange: _range,
    );
    if (r != null) {
      setState(() => _range = r);
      _load();
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

  Widget _body(Lang l) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Text(_error!, textAlign: TextAlign.center)),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: _load, child: Text(l.t('retry'))),
        ]),
      );
    }
    if (_items.isEmpty) return Center(child: Text(l.t('no_data')));
    return ListView.separated(
      itemCount: _items.length,
      separatorBuilder: (_, __) => const Divider(height: 1, color: AppColors.line),
      itemBuilder: (_, i) {
        final e = _items[i];
        final meta = [
          '${e['expenditure_type'] ?? ''}',
          dateOnly(e['created_at']),
          '${e['user_role'] ?? ''}',
        ].where((x) => x.isNotEmpty).join(' · ');
        return ListTile(
          title: Text('${e['name'] ?? ''}',
              style: const TextStyle(
                  fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.text)),
          subtitle: Text(meta, style: const TextStyle(fontSize: 13, color: AppColors.muted)),
          trailing: Text(taka(numOf(e['amount'])),
              style: const TextStyle(
                  fontSize: 15, fontWeight: FontWeight.bold, color: AppColors.navy)),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      return AdminScaffold(
        current: 'expenditure',
        title: l.t('expenditure'),
        actions: [
          IconButton(
            icon: Icon(Icons.date_range, size: 28, color: _range == null ? Colors.white : Colors.yellow),
            onPressed: _pickRange,
          ),
          if (_range != null)
            IconButton(
              icon: const Icon(Icons.close),
              onPressed: () {
                setState(() => _range = null);
                _load();
              },
            ),
          IconButton(icon: const Icon(Icons.sync, size: 30), onPressed: _load),
          const SizedBox(width: 4),
        ],
        body: Stack(children: [
          Column(children: [
            Container(
              width: double.infinity,
              color: AppColors.skyLight,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              child: Text(
                '${tr('মোট', 'Total')}: ${l.digits('$_totalRows')}   ·   '
                '${tr('মোট খরচ', 'Total expense')}: ${taka(_totalAmount)}'
                '${_range == null ? '' : '\n${ymd(_range!.start)} → ${ymd(_range!.end)}'}',
                style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.navy),
              ),
            ),
            Expanded(child: _body(l)),
          ]),
          Positioned(
            right: 16,
            bottom: 16,
            child: FloatingActionButton(
              backgroundColor: AppColors.sky,
              foregroundColor: Colors.white,
              onPressed: _add,
              child: const Icon(Icons.add),
            ),
          ),
        ]),
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
