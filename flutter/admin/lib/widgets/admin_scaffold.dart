import 'package:material_ui/material_ui.dart';
import 'app_drawer.dart';

/// নীল অ্যাপ বার + হ্যামবার্গার ড্রয়ার সহ কমন পেজ লেআউট
class AdminScaffold extends StatelessWidget {
  final String current; // ড্রয়ারে হাইলাইট/চেনার জন্য key
  final String title;
  final List<Widget> actions;
  final Widget body;
  final Widget? titleWidget; // দিলে সাধারণ টাইটেল টেক্সটের বদলে এটা দেখায়
  final PreferredSizeWidget? bottom; // অ্যাপ বারের নিচের অংশ (যেমন Area ফিল্টার)

  const AdminScaffold({
    super.key,
    required this.current,
    required this.title,
    required this.body,
    this.actions = const [],
    this.bottom,
    this.titleWidget,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: titleWidget ?? Text(title, style: const TextStyle(fontSize: 22)),
        actions: actions,
        bottom: bottom,
      ),
      drawer: AppDrawer(current: current),
      body: body,
    );
  }
}
