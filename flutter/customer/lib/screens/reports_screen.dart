import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../services/api_service.dart';
import '../widgets/page_scaffold.dart';

/// embedded = true হলে Payment ট্যাবের ভেতরে (শেলের নিচের নেভিগেশন ব্যবহার করে)।
/// false হলে Dashboard-এর Reports টাইল থেকে আলাদা পেজ, Payment ট্যাব হাইলাইট।
class ReportsScreen extends StatelessWidget {
  final bool embedded;
  const ReportsScreen({super.key, this.embedded = false});

  String _year(String month) {
    final parts = month.trim().split(' ');
    return parts.isEmpty ? '' : parts.last;
  }

  Widget _box({required Widget child}) => Container(
        margin: const EdgeInsets.fromLTRB(8, 5, 8, 0),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: AppColors.line),
          borderRadius: BorderRadius.circular(4),
        ),
        child: child,
      );

  @override
  Widget build(BuildContext context) {
    return PageScaffold(
      title: 'Reports',
      withNav: !embedded,
      navIndex: 2,
      body: FutureBuilder<List<ReportItem>>(
        future: ApiService.reports(),
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
          if (list.isEmpty) {
            return const Center(child: Text('No Data Found!'));
          }
          return ListView(
            padding: const EdgeInsets.only(bottom: 12),
            children: [
              _box(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Text(_year(list.first.month),
                      style: const TextStyle(
                          fontSize: 19, fontWeight: FontWeight.bold)),
                ),
              ),
              for (final r in list)
                _box(
                  child: Theme(
                    data: Theme.of(context)
                        .copyWith(dividerColor: Colors.transparent),
                    child: ExpansionTile(
                      title: Text(r.month,
                          style: const TextStyle(
                              fontSize: 19, fontWeight: FontWeight.bold)),
                      childrenPadding:
                          const EdgeInsets.fromLTRB(16, 0, 16, 12),
                      expandedAlignment: Alignment.centerLeft,
                      children: [
                        Text('Amount: ${r.amount.toStringAsFixed(0)} Tk.',
                            style: const TextStyle(fontSize: 16)),
                        const SizedBox(height: 4),
                        Text('Status: ${r.status}',
                            style: const TextStyle(fontSize: 16)),
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
