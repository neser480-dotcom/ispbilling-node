import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../screens/home_shell.dart';

/// উপরের গাঢ় নীল টাইটেল বার: "আমাদের বিল গ্রাহক / 2.1"
class AppTitleBar extends StatelessWidget {
  const AppTitleBar({super.key});

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        color: AppColors.navy,
        padding: EdgeInsets.fromLTRB(
            16, MediaQuery.of(context).padding.top + 10, 16, 10),
        child: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('আমাদের বিল গ্রাহক',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w600)),
            Text('2.1',
                style: TextStyle(color: Color(0xFFB8C4CE), fontSize: 17)),
          ],
        ),
      );
}

class NetfiBottomNav extends StatelessWidget {
  final int? index; // null হলে কোনো ট্যাব সিলেক্টেড দেখাবে না
  final ValueChanged<int> onTap;
  const NetfiBottomNav({super.key, required this.index, required this.onTap});

  @override
  Widget build(BuildContext context) => BottomNavigationBar(
        currentIndex: index ?? 0,
        onTap: onTap,
        type: BottomNavigationBarType.fixed,
        backgroundColor: Colors.white,
        elevation: 8,
        selectedItemColor: index == null ? AppColors.grey : AppColors.loginBlue,
        unselectedItemColor: AppColors.grey,
        selectedFontSize: 13,
        unselectedFontSize: 13,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
          BottomNavigationBarItem(icon: Icon(Icons.speed), label: 'Dashboard'),
          BottomNavigationBarItem(icon: Icon(Icons.payments), label: 'Payment'),
        ],
      );
}

/// প্রতিটি পেজের কমন লেআউট: টাইটেল বার + নীল অ্যাপ বার + কনটেন্ট
class PageScaffold extends StatelessWidget {
  final String title;
  final List<Widget> actions;
  final Widget body;
  final bool withNav; // শেল-এর বাইরের পেজে নিচের নেভিগেশন দেখাতে true
  final int? navIndex;

  const PageScaffold({
    super.key,
    required this.title,
    required this.body,
    this.actions = const [],
    this.withNav = false,
    this.navIndex,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      bottomNavigationBar: withNav
          ? NetfiBottomNav(
              index: navIndex,
              onTap: (i) => Navigator.pushAndRemoveUntil(
                context,
                MaterialPageRoute(builder: (_) => HomeShell(initialIndex: i)),
                (_) => false,
              ),
            )
          : null,
      body: Column(
        children: [
          const AppTitleBar(),
          Container(
            height: 58,
            color: AppColors.appBlue,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Expanded(
                  child: Text(title,
                      style:
                          const TextStyle(color: Colors.white, fontSize: 20)),
                ),
                ...actions,
              ],
            ),
          ),
          Expanded(child: body),
        ],
      ),
    );
  }
}
