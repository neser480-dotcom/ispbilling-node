import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../services/api_service.dart';
import '../widgets/page_scaffold.dart';

class PackagesScreen extends StatefulWidget {
  const PackagesScreen({super.key});

  @override
  State<PackagesScreen> createState() => _PackagesScreenState();
}

class _PackagesScreenState extends State<PackagesScreen> {
  late Future<List<PackageItem>> _future;

  @override
  void initState() {
    super.initState();
    _future = ApiService.packages();
  }

  Future<void> _change(PackageItem p) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Change Package'),
        content: Text(
            '${p.name} (${p.price.toStringAsFixed(0)} TK /Month) প্যাকেজে পরিবর্তন করবেন?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('না')),
          TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('হ্যাঁ')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ApiService.changePackage(p.id);
      if (!mounted) return;
      setState(() => _future = ApiService.packages());
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', ''))));
    }
  }

  @override
  Widget build(BuildContext context) {
    return PageScaffold(
      title: 'Packages',
      withNav: true,
      body: FutureBuilder<List<PackageItem>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return Center(
                child: Text(
                    snap.error.toString().replaceFirst('Exception: ', '')));
          }
          final list = snap.data!;
          return ListView.builder(
            padding: const EdgeInsets.only(top: 4),
            itemCount: list.length,
            itemBuilder: (_, i) {
              final p = list[i];
              return Container(
                margin: const EdgeInsets.only(bottom: 3),
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  boxShadow: [
                    BoxShadow(
                        color: Color(0x1A000000),
                        blurRadius: 4,
                        offset: Offset(0, 2)),
                  ],
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(p.name, style: const TextStyle(fontSize: 17)),
                          const SizedBox(height: 4),
                          Text('${p.price.toStringAsFixed(0)} TK /Month',
                              style: const TextStyle(fontSize: 17)),
                        ],
                      ),
                    ),
                    p.active
                        ? Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 8),
                            decoration: BoxDecoration(
                              color: AppColors.green,
                              borderRadius: BorderRadius.circular(5),
                            ),
                            child: const Text('Active',
                                style: TextStyle(
                                    color: Colors.white, fontSize: 17)),
                          )
                        : OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppColors.linkBlue,
                              side: const BorderSide(
                                  color: AppColors.linkBlue, width: 1.4),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(5)),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 8),
                            ),
                            onPressed: () => _change(p),
                            child: const Text('Change',
                                style: TextStyle(fontSize: 17)),
                          ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}
