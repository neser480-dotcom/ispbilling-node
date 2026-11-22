import 'package:material_ui/material_ui.dart';
import '../core/theme.dart';
import '../core/tr.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';
import '../widgets/letter_avatar.dart';
import '../widgets/netfee_ui.dart';

/// Purpose (খরচের খাত) — শুধু ডিজাইন। API পরে যুক্ত হবে।
/// TODO(API): _load / _submit / _edit / _delete এ Backend কল বসান।
class PurposeScreen extends StatefulWidget {
  const PurposeScreen({super.key});

  @override
  State<PurposeScreen> createState() => _PurposeScreenState();
}

class _PurposeScreenState extends State<PurposeScreen> {
  /// true = নমুনা ডাটা দেখায়। API বসালে false করুন।
  static const bool _demo = true;

  final _nameC = TextEditingController();
  final List<String> _items = [];

  @override
  void initState() {
    super.initState();
    if (_demo) {
      _items.addAll(const [
        'কোম্পানি বিল',
        'দোকানের খরচ',
        'সফটওয়্যার বিল',
        'অফিস খরচ',
      ]);
    }
  }

  @override
  void dispose() {
    _nameC.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    // TODO(API): GET purposes
    setState(() {});
  }

  void _submit() {
    final n = _nameC.text.trim();
    if (n.isEmpty) return;
    // TODO(API): POST purpose
    setState(() => _items.add(n));
    _nameC.clear();
    FocusScope.of(context).unfocus();
  }

  Future<void> _edit(int i) async {
    final c = TextEditingController(text: _items[i]);
    final v = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('খাত এডিট', 'Edit purpose')),
        content: TextField(controller: c, autofocus: true),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(tr('বাতিল', 'Cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, c.text.trim()),
            child: Text(tr('সংরক্ষণ', 'Save')),
          ),
        ],
      ),
    );
    c.dispose();
    if (v != null && v.isNotEmpty) {
      // TODO(API): PUT purpose
      setState(() => _items[i] = v);
    }
  }

  Future<void> _delete(int i) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('মুছে ফেলবেন?', 'Delete?')),
        content: Text(_items[i]),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(tr('না', 'No')),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(tr('হ্যাঁ', 'Yes')),
          ),
        ],
      ),
    );
    if (ok == true) {
      // TODO(API): DELETE purpose
      setState(() => _items.removeAt(i));
    }
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      return AdminScaffold(
        current: 'purpose',
        title: tr('খাত', 'Purpose'),
        actions: [
          IconButton(
            icon: const Icon(Icons.sync, size: 30),
            onPressed: _load,
          ),
          const SizedBox(width: 4),
        ],
        body: ListView(
          padding: EdgeInsets.zero,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(48, 30, 48, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    tr('খাত যোগ করুন', 'Add Purpose'),
                    style: const TextStyle(fontSize: 16, color: Color(0xFF333333)),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _nameC,
                    style: const TextStyle(fontSize: 20),
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _submit(),
                    decoration: InputDecoration(
                      hintText: tr('নতুন নাম', 'New name'),
                      hintStyle: const TextStyle(color: AppColors.text),
                      enabledBorder: const UnderlineInputBorder(
                        borderSide: BorderSide(color: Color(0xFF555555)),
                      ),
                      focusedBorder: const UnderlineInputBorder(
                        borderSide: BorderSide(color: AppColors.sky, width: 2),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 34),
            Center(child: PillButton(text: tr('জমা দিন', 'Submit'), onPressed: _submit)),
            const SizedBox(height: 26),
            if (_items.isEmpty)
              Padding(
                padding: const EdgeInsets.all(32),
                child: Center(
                  child: Text(tr('কোনো ডাটা নেই', 'No data'),
                      style: const TextStyle(color: AppColors.muted, fontSize: 16)),
                ),
              ),
            for (var i = 0; i < _items.length; i++) ...[
              const Divider(height: 1, color: AppColors.line),
              ListTile(
                contentPadding: const EdgeInsets.only(left: 12, right: 4),
                minVerticalPadding: 14,
                leading: LetterAvatar(text: _items[i], radius: 20),
                title: Text(
                  _items[i],
                  style: const TextStyle(fontSize: 18, color: AppColors.text),
                ),
                trailing: DotsMenu(
                  labels: [tr('এডিট', 'Edit'), tr('ডিলিট', 'Delete')],
                  onSelected: (k) => k == 0 ? _edit(i) : _delete(i),
                ),
              ),
            ],
            const Divider(height: 1, color: AppColors.line),
            const SizedBox(height: 24),
          ],
        ),
      );
    });
  }
}
