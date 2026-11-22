import 'package:material_ui/material_ui.dart';
import '../core/theme.dart';
import '../core/tr.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';
import '../widgets/netfee_ui.dart';

/// Message > Message Log (Non Masking / Masking / Fixed ট্যাব) — শুধু ডিজাইন। API পরে যুক্ত হবে।
/// TODO(API): _load এ ট্যাব অনুযায়ী SMS লগ আনুন (পেজিনেশন সহ)।
class MessageLogScreen extends StatefulWidget {
  const MessageLogScreen({super.key});

  @override
  State<MessageLogScreen> createState() => _MessageLogScreenState();
}

class _MessageLogScreenState extends State<MessageLogScreen> {
  /// true = নমুনা সারি দেখায় (শুধু ডিজাইন দেখার জন্য)। API বসালে false করুন।
  static const bool _demo = true;

  static const _tabs = ['Non Masking', 'Masking', 'Fixed'];

  int _tab = 0;
  List<Map<String, dynamic>> _rows = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    // TODO(API): GET message log for _tabs[_tab]
    setState(() {
      _rows = _demo && _tab == 0
          ? [
              {
                'to': '01XXXXXXXXX',
                'text': 'প্রিয় গ্রাহক, আপনার ইন্টারনেট বিল পরিশোধের সময় হয়েছে।',
                'date': '08-05-2026 03:40 PM',
                'ok': true,
              },
              {
                'to': '01XXXXXXXXX',
                'text': 'আপনার বিল সফলভাবে গ্রহণ করা হয়েছে। ধন্যবাদ।',
                'date': '08-05-2026 03:35 PM',
                'ok': false,
              },
            ]
          : [];
    });
  }

  Widget _row(Map<String, dynamic> r) {
    final ok = r['ok'] == true;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const CircleAvatar(
            radius: 22,
            backgroundColor: Color(0xFF4FC3F7),
            child: Icon(Icons.sms_outlined, color: Colors.white),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${r['to']}',
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.text)),
                const SizedBox(height: 2),
                Text('${r['text']}',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 15, color: AppColors.text)),
                const SizedBox(height: 4),
                Text('${r['date']}',
                    style: const TextStyle(fontSize: 14, color: AppColors.muted)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
            decoration: BoxDecoration(
              color: (ok ? Colors.green : Colors.red).withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              ok ? tr('সফল', 'Sent') : tr('ব্যর্থ', 'Failed'),
              style: TextStyle(
                fontSize: 13,
                color: ok ? Colors.green.shade700 : Colors.red.shade700,
              ),
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
        current: 'message_log',
        title: tr('মেসেজ লগ', 'Message Log'),
        body: Column(
          children: [
            NetfeeTabBar(
              labels: _tabs,
              index: _tab,
              onChanged: (i) {
                setState(() => _tab = i);
                _load();
              },
            ),
            Expanded(
              child: _rows.isEmpty
                  ? Center(
                      child: Text(tr('কোনো ডাটা নেই', 'No data'),
                          style: const TextStyle(color: AppColors.muted, fontSize: 16)),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(children: [for (final r in _rows) _row(r)]),
                    ),
            ),
          ],
        ),
      );
    });
  }
}
