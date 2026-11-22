import 'dart:async';
import 'package:material_ui/material_ui.dart';
import '../core/format.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../core/tr.dart';
import '../services/employee_api.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';
import '../widgets/letter_avatar.dart';
import 'salary_screen.dart';

/// Employee তালিকা + যোগ/সম্পাদনা/ডিলিট (শুধু Admin)।
/// Backend: /admin/employees
class EmployeeScreen extends StatefulWidget {
  const EmployeeScreen({super.key});

  @override
  State<EmployeeScreen> createState() => _EmployeeScreenState();
}

class _EmployeeScreenState extends State<EmployeeScreen> {
  final _searchC = TextEditingController();
  Timer? _debounce;
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  String? _error;

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

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final d = await EmployeeApi.list(search: _searchC.text.trim());
      if (!mounted) return;
      final raw = d['staff'];
      setState(() {
        _items = raw is List
            ? raw.map((e) => mapOf(e)).toList()
            : <Map<String, dynamic>>[];
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

  void _onSearch(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), _load);
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _openForm([Map<String, dynamic>? existing]) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _EmployeeForm(existing: existing),
    );
    if (saved == true) {
      _toast(tr('সংরক্ষণ হয়েছে', 'Saved'));
      _load();
    }
  }

  Future<void> _delete(Map<String, dynamic> s) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('কর্মী ডিলিট', 'Delete employee')),
        content: Text(tr('"${s['name'] ?? ''}" কে ডিলিট করবেন? এটি ফেরানো যাবে না।',
            'Delete "${s['name'] ?? ''}"? This cannot be undone.')),
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
      await EmployeeApi.delete(numOf(s['id']).toInt());
      if (!mounted) return;
      _toast(tr('ডিলিট হয়েছে', 'Deleted'));
      _load();
    } catch (e) {
      if (!mounted) return;
      _toast(e.toString().replaceFirst('Exception: ', ''));
    }
  }

  void _open(Map<String, dynamic> s) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetCtx) => _EmployeeSheet(
        item: s,
        onSalary: () {
          Navigator.pop(sheetCtx);
          Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => SalaryScreen(
              staffId: numOf(s['id']).toInt(),
              staffName: '${s['name'] ?? ''}',
              defaultSalary: numOf(s['salary']),
            ),
          ));
        },
        onEdit: () {
          Navigator.pop(sheetCtx);
          _openForm(s);
        },
        onDelete: () {
          Navigator.pop(sheetCtx);
          _delete(s);
        },
      ),
    );
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
        final name = '${s['name'] ?? ''}';
        final sub = ['${s['mobile'] ?? ''}', taka(numOf(s['salary']))]
            .where((e) => e.isNotEmpty)
            .join(' · ');
        return ListTile(
          leading: LetterAvatar(text: name, radius: 22),
          title: Text(name,
              style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.bold,
                  color: AppColors.text)),
          subtitle: Text(sub,
              style: const TextStyle(fontSize: 14, color: AppColors.muted)),
          trailing: Text('${s['status'] ?? ''}',
              style: const TextStyle(fontSize: 12, color: AppColors.muted)),
          onTap: () => _open(s),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      return Stack(children: [
        AdminScaffold(
          current: 'employee',
          title: tr('কর্মচারী', 'Employee'),
          actions: [
            IconButton(
                icon: const Icon(Icons.sync, size: 30), onPressed: _load),
            const SizedBox(width: 4),
          ],
          body: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
              child: TextField(
                controller: _searchC,
                textInputAction: TextInputAction.search,
                onChanged: _onSearch,
                onSubmitted: (_) => _load(),
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
                child: Text('${l.t('total')}: ${l.digits('${_items.length}')}',
                    style:
                        const TextStyle(fontSize: 13, color: AppColors.muted)),
              ),
            ),
            Expanded(child: _body(l)),
          ]),
        ),
        Positioned(
          right: 16,
          bottom: 16,
          child: Material(
            type: MaterialType.transparency,
            child: FloatingActionButton(
              heroTag: 'employee_add',
              backgroundColor: AppColors.sky,
              foregroundColor: Colors.white,
              onPressed: () => _openForm(),
              child: const Icon(Icons.add),
            ),
          ),
        ),
      ]);
    });
  }
}

/// কর্মীর সারসংক্ষেপ + Salary / Edit / Delete বোতাম
class _EmployeeSheet extends StatelessWidget {
  final Map<String, dynamic> item;
  final VoidCallback onSalary;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  const _EmployeeSheet({
    required this.item,
    required this.onSalary,
    required this.onEdit,
    required this.onDelete,
  });

  Widget _row(String k, String v) {
    if (v.trim().isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(
            width: 110,
            child: Text(k,
                style: const TextStyle(color: AppColors.muted, fontSize: 14))),
        Expanded(
            child: Text(v,
                style: const TextStyle(color: AppColors.text, fontSize: 15))),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = Lang.i;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.85),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('${item['name'] ?? ''}',
                  style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppColors.navy)),
              const SizedBox(height: 8),
              _row(tr('মোবাইল', 'Mobile'), '${item['mobile'] ?? ''}'),
              _row(tr('ইমেইল', 'Email'), '${item['email'] ?? ''}'),
              _row(tr('ঠিকানা', 'Address'), '${item['address'] ?? ''}'),
              _row(tr('অভিভাবক', 'Parent'), '${item['parent_name'] ?? ''}'),
              _row(tr('বেতন', 'Salary'), taka(numOf(item['salary']))),
              _row(tr('স্ট্যাটাস', 'Status'), '${item['status'] ?? ''}'),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: onSalary,
                    icon: const Icon(Icons.payments_outlined),
                    label: Text(tr('বেতন', 'Salary')),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onEdit,
                    icon: const Icon(Icons.edit_outlined),
                    label: Text(l.t('edit')),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  onPressed: onDelete,
                  icon: const Icon(Icons.delete_outline, color: Colors.red),
                  tooltip: l.t('delete'),
                ),
              ]),
            ],
          ),
        ),
      ),
    );
  }
}

/// যোগ / সম্পাদনা ফর্ম। সফল হলে `true` নিয়ে বন্ধ হয়।
class _EmployeeForm extends StatefulWidget {
  final Map<String, dynamic>? existing;
  const _EmployeeForm({this.existing});

  @override
  State<_EmployeeForm> createState() => _EmployeeFormState();
}

class _EmployeeFormState extends State<_EmployeeForm> {
  static const _statuses = ['active', 'inactive', 'banned'];

  late final TextEditingController _name;
  late final TextEditingController _mobile;
  late final TextEditingController _email;
  late final TextEditingController _address;
  late final TextEditingController _parent;
  late final TextEditingController _nid;
  late final TextEditingController _salary;
  late String _status;
  bool _saving = false;
  String? _error;

  bool get _isEdit => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final e = widget.existing ?? const <String, dynamic>{};
    String s(String k) => '${e[k] ?? ''}';
    _name = TextEditingController(text: s('name'));
    _mobile = TextEditingController(text: s('mobile'));
    _email = TextEditingController(text: s('email'));
    _address = TextEditingController(text: s('address'));
    _parent = TextEditingController(text: s('parent_name'));
    _nid = TextEditingController();
    final sal = numOf(e['salary']);
    _salary = TextEditingController(text: sal == 0 ? '' : '$sal');
    final st = s('status').toLowerCase();
    _status = _statuses.contains(st) ? st : 'active';
  }

  @override
  void dispose() {
    _name.dispose();
    _mobile.dispose();
    _email.dispose();
    _address.dispose();
    _parent.dispose();
    _nid.dispose();
    _salary.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    final mobile = _mobile.text.trim();
    if (name.isEmpty || mobile.isEmpty) {
      setState(() => _error = tr('নাম ও মোবাইল দিন', 'Name and mobile are required'));
      return;
    }
    final salaryText = _salary.text.trim();
    final salary = salaryText.isEmpty ? 0 : num.tryParse(salaryText);
    if (salary == null || salary < 0) {
      setState(() => _error = tr('বেতনের অংক ঠিক নয়', 'Invalid salary amount'));
      return;
    }
    final body = <String, dynamic>{
      'name': name,
      'mobile': mobile,
      'email': _email.text.trim(),
      'address': _address.text.trim(),
      'parent_name': _parent.text.trim(),
      'salary': salary,
    };
    if (_isEdit) {
      body['status'] = _status;
    } else if (_nid.text.trim().isNotEmpty) {
      body['nid_no'] = _nid.text.trim();
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      if (_isEdit) {
        await EmployeeApi.update(numOf(widget.existing!['id']).toInt(), body);
      } else {
        await EmployeeApi.add(body);
      }
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

  Widget _field(TextEditingController c, String label,
      {TextInputType? type, int maxLines = 1}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextField(
        controller: c,
        keyboardType: type,
        maxLines: maxLines,
        decoration: InputDecoration(
          labelText: label,
          isDense: true,
          border: const OutlineInputBorder(),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = Lang.i;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                  _isEdit
                      ? tr('কর্মীর তথ্য সম্পাদনা', 'Edit employee')
                      : tr('নতুন কর্মী', 'New employee'),
                  style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppColors.navy)),
              const SizedBox(height: 12),
              _field(_name, '${l.t('name')} *'),
              _field(_mobile, '${tr('মোবাইল', 'Mobile')} *',
                  type: TextInputType.phone),
              _field(_email, tr('ইমেইল', 'Email'),
                  type: TextInputType.emailAddress),
              _field(_address, tr('ঠিকানা', 'Address')),
              _field(_parent, tr('অভিভাবকের নাম', 'Parent name')),
              if (!_isEdit) _field(_nid, tr('NID নম্বর', 'NID number')),
              _field(_salary, tr('মাসিক বেতন', 'Monthly salary'),
                  type: const TextInputType.numberWithOptions(decimal: true)),
              if (_isEdit)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: DropdownButtonFormField<String>(
                    key: ValueKey('employee-status-$_status'),
                    initialValue: _status,
                    decoration: InputDecoration(
                      labelText: tr('স্ট্যাটাস', 'Status'),
                      isDense: true,
                      border: const OutlineInputBorder(),
                    ),
                    items: _statuses
                        .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                        .toList(),
                    onChanged: (v) {
                      if (v != null) setState(() => _status = v);
                    },
                  ),
                ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(_error!, style: const TextStyle(color: Colors.red)),
                ),
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
