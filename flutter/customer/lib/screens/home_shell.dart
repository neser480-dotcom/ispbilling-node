import 'package:flutter/material.dart';
import '../widgets/page_scaffold.dart';
import 'dashboard_screen.dart';
import 'profile_screen.dart';
import 'reports_screen.dart';

/// ট্যাব: 0 = Profile, 1 = Dashboard, 2 = Payment (মাসিক রিপোর্ট তালিকা)
class HomeShell extends StatefulWidget {
  final int initialIndex;
  const HomeShell({super.key, this.initialIndex = 1});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  late int _index;

  @override
  void initState() {
    super.initState();
    _index = widget.initialIndex;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: IndexedStack(
        index: _index,
        children: const [
          ProfileScreen(),
          DashboardScreen(),
          ReportsScreen(embedded: true),
        ],
      ),
      bottomNavigationBar: NetfiBottomNav(
        index: _index,
        onTap: (i) => setState(() => _index = i),
      ),
    );
  }
}
