import 'package:flutter/material.dart';
import 'app_drawer.dart';

/// নীল অ্যাপ বার + হ্যামবার্গার ড্রয়ার সহ কমন পেজ লেআউট
class AdminScaffold extends StatelessWidget {
  final String current; // ড্রয়ারে হাইলাইট/চেনার জন্য key
  final String title;
  final List<Widget> actions;
  final Widget body;

  const AdminScaffold({
    super.key,
    required this.current,
    required this.title,
    required this.body,
    this.actions = const [],
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Text(title, style: const TextStyle(fontSize: 22)),
        actions: actions,
      ),
      drawer: AppDrawer(current: current),
      body: body,
    );
  }
}
