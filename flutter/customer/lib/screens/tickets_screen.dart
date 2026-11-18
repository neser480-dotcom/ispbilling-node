import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../services/api_service.dart';
import '../widgets/page_scaffold.dart';

class TicketsScreen extends StatefulWidget {
  const TicketsScreen({super.key});

  @override
  State<TicketsScreen> createState() => _TicketsScreenState();
}

class _TicketsScreenState extends State<TicketsScreen> {
  late Future<List<TicketItem>> _future;

  @override
  void initState() {
    super.initState();
    _future = ApiService.tickets();
  }

  Future<void> _create() async {
    final subject = TextEditingController();
    final message = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('New Ticket'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: subject,
              decoration: const InputDecoration(hintText: 'Subject'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: message,
              maxLines: 3,
              decoration: const InputDecoration(hintText: 'Message'),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Submit')),
        ],
      ),
    );
    if (ok != true || subject.text.trim().isEmpty) return;
    try {
      await ApiService.createTicket(subject.text.trim(), message.text.trim());
      if (!mounted) return;
      setState(() => _future = ApiService.tickets());
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', ''))));
    }
  }

  @override
  Widget build(BuildContext context) {
    return PageScaffold(
      title: 'Support Tickets',
      withNav: true,
      actions: [
        IconButton(
          icon: const Icon(Icons.add_circle_outline, color: Colors.white, size: 28),
          onPressed: _create,
        ),
      ],
      body: FutureBuilder<List<TicketItem>>(
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
          if (list.isEmpty) {
            return const Align(
              alignment: Alignment.topCenter,
              child: Padding(
                padding: EdgeInsets.only(top: 16),
                child: Text('No Data Found!',
                    style:
                        TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
              ),
            );
          }
          return ListView.builder(
            itemCount: list.length,
            itemBuilder: (_, i) {
              final t = list[i];
              return ListTile(
                title: Text(t.subject),
                subtitle: Text(t.date),
                trailing: Text(t.status,
                    style: const TextStyle(color: AppColors.linkBlue)),
              );
            },
          );
        },
      ),
    );
  }
}
