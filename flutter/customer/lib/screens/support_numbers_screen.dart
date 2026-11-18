import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../services/api_service.dart';
import '../widgets/page_scaffold.dart';

class SupportNumbersScreen extends StatelessWidget {
  const SupportNumbersScreen({super.key});

  Future<void> _call(String phone) async {
    await launchUrl(Uri(scheme: 'tel', path: phone));
  }

  @override
  Widget build(BuildContext context) {
    return PageScaffold(
      title: "Support Number's",
      withNav: true,
      body: FutureBuilder<List<SupportContact>>(
        future: ApiService.supportNumbers(),
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
            padding: const EdgeInsets.only(top: 8),
            itemCount: list.length,
            itemBuilder: (_, i) {
              final c = list[i];
              return InkWell(
                onTap: () => _call(c.phone),
                child: Container(
                  margin: const EdgeInsets.fromLTRB(2, 0, 2, 6),
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(4),
                    boxShadow: const [
                      BoxShadow(
                          color: Color(0x22000000),
                          blurRadius: 4,
                          offset: Offset(0, 1)),
                    ],
                  ),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 24,
                        backgroundColor: const Color(0xFFE0E0E0),
                        backgroundImage:
                            c.photo.isNotEmpty ? NetworkImage(c.photo) : null,
                        child: c.photo.isEmpty
                            ? const Icon(Icons.person,
                                size: 36, color: Color(0xFF9E9E9E))
                            : null,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(c.name, style: const TextStyle(fontSize: 17)),
                            const SizedBox(height: 2),
                            Row(
                              children: [
                                const Icon(Icons.phone,
                                    color: AppColors.linkBlue, size: 22),
                                const SizedBox(width: 6),
                                Flexible(
                                  child: Text(c.phone,
                                      style: const TextStyle(fontSize: 19)),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(c.startTime,
                              style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFF1E8449))),
                          const SizedBox(height: 10),
                          Text(c.endTime,
                              style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                  color: AppColors.red)),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
