import 'package:material_ui/material_ui.dart';
import '../core/theme.dart';
import '../core/tr.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';
import '../widgets/netfee_ui.dart';

/// Message > Accounts (SMS ব্যালেন্স + রিচার্জ হিস্ট্রি) — শুধু ডিজাইন। API পরে যুক্ত হবে।
/// TODO(API): _load (ব্যালেন্স + হিস্ট্রি, টাইপ অনুযায়ী) ও _recharge এ Backend কল বসান।
class MessageAccountsScreen extends StatefulWidget {
  const MessageAccountsScreen({super.key});

  @override
  State<MessageAccountsScreen> createState() => _MessageAccountsScreenState();
}

class _MessageAccountsScreenState extends State<MessageAccountsScreen> {
  /// true = নমুনা ডাটা দেখায়। API বসালে false করুন।
  static const bool _demo = true;

  static const _types = ['Non Masking', 'Masking', 'Fixed'];

  String _type = _types.first;
  num _balance = 0;
  List<Map<String, dynamic>> _items = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    // TODO(API): GET sms account balance + recharge history for _type
    setState(() {
      _balance = 0;
      _items = _demo && _type == _types.first
          ? [
              {
                'amount': 200,
                'sms': 400,
                'date': '08-05-2026 03:33 PM',
              },
            ]
          : [];
    });
  }

  Future<void> _recharge() async {
    final c = TextEditingController();
    final v = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('${tr('রিচার্জ', 'Recharge')} ($_type)'),
        content: TextField(
          controller: c,
          autofocus: true,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
            labelText: tr('টাকার পরিমাণ', 'Amount (Tk.)'),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(tr('বাতিল', 'Cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, c.text.trim()),
            child: Text(tr('রিচার্জ', 'Recharge')),
          ),
        ],
      ),
    );
    c.dispose();
    if (v == null || v.isEmpty || !mounted) return;
    // TODO(API): POST recharge (amount = v, type = _type), তারপর _load()
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(tr('রিচার্জ API এখনো যুক্ত হয়নি', 'Recharge API not connected yet'))),
    );
  }

  Widget _row(Map<String, dynamic> e) {
    return Container(
      padding: const EdgeInsets.fromLTRB(2, 8, 12, 8),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        children: [
          const CircleAvatar(
            radius: 25,
            backgroundColor: Color(0xFF4FC3F7),
            child: Text('M', style: TextStyle(color: Colors.white, fontSize: 26)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tk(e['amount'] as num),
                  style: const TextStyle(
                      fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.text),
                ),
                Text(
                  '${tr('মেসেজ', 'Message')} (${e['sms']})',
                  style: const TextStyle(
                      fontSize: 17, fontWeight: FontWeight.bold, color: AppColors.text),
                ),
                Text(
                  '${e['date']}',
                  style: const TextStyle(fontSize: 17, color: AppColors.muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      return AdminScaffold(
        current: 'message_accounts',
        title: tr('অ্যাকাউন্টস', 'Accounts'),
        actions: [
          IconButton(
            icon: const Icon(Icons.sync, size: 30),
            onPressed: _load,
          ),
          const SizedBox(width: 4),
        ],
        body: Column(
          children: [
            Container(
              width: double.infinity,
              color: AppColors.sky,
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(left: 4, bottom: 2),
                        child: Text(
                          tr('ব্যালেন্স', 'Balance'),
                          style: const TextStyle(fontSize: 18, color: AppColors.navy),
                        ),
                      ),
                      PillDropdown<String>(
                        value: _type,
                        values: _types,
                        label: (v) => v,
                        onBlue: true,
                        width: 160,
                        onChanged: (v) {
                          setState(() => _type = v);
                          _load();
                        },
                      ),
                    ],
                  ),
                  const SizedBox(width: 18),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      '$_balance',
                      style: const TextStyle(
                          fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white),
                    ),
                  ),
                  const Spacer(),
                  ElevatedButton(
                    onPressed: _recharge,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: AppColors.sky,
                      elevation: 3,
                      shape: const StadiumBorder(),
                      minimumSize: const Size(110, 44),
                      padding: const EdgeInsets.symmetric(horizontal: 22),
                    ),
                    child: Text(tr('রিচার্জ', 'Recharge'),
                        style: const TextStyle(fontSize: 20)),
                  ),
                ],
              ),
            ),
            Expanded(
              child: _items.isEmpty
                  ? Center(
                      child: Text(tr('কোনো ডাটা নেই', 'No data'),
                          style: const TextStyle(color: AppColors.muted, fontSize: 16)),
                    )
                  : ListView(children: [for (final e in _items) _row(e)]),
            ),
          ],
        ),
      );
    });
  }
}
