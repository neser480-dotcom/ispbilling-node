import 'package:flutter/material.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../services/api_service.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';
import '../widgets/letter_avatar.dart';

class AreaScreen extends StatefulWidget {
  const AreaScreen({super.key});

  @override
  State<AreaScreen> createState() => _AreaScreenState();
}

class _AreaScreenState extends State<AreaScreen> {
  late Future<List<AreaItem>> _future;

  @override
  void initState() {
    super.initState();
    _future = ApiService.areas();
  }

  void _reload() => setState(() => _future = ApiService.areas());

  void _toast(Object e) => ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));

  Future<void> _edit([AreaItem? a]) async {
    final l = Lang.i;
    final nameC = TextEditingController(text: a?.name ?? '');
    final descC = TextEditingController(text: a?.description ?? '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(a == null ? l.t('add') : l.t('edit')),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nameC, decoration: InputDecoration(hintText: l.t('name'))),
            const SizedBox(height: 8),
            TextField(controller: descC, decoration: InputDecoration(hintText: l.t('description'))),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l.t('cancel'))),
          TextButton(onPressed: () => Navigator.pop(context, true), child: Text(l.t('save'))),
        ],
      ),
    );
    if (ok != true || nameC.text.trim().isEmpty) return;
    try {
      await ApiService.saveArea(
          id: a?.id, name: nameC.text.trim(), description: descC.text.trim());
      _reload();
    } catch (e) {
      if (mounted) _toast(e);
    }
  }

  Future<void> _delete(AreaItem a) async {
    final l = Lang.i;
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(a.name),
        content: Text(l.t('confirm_delete')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l.t('cancel'))),
          TextButton(onPressed: () => Navigator.pop(context, true), child: Text(l.t('delete'))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ApiService.deleteArea(a.id);
      _reload();
    } catch (e) {
      if (mounted) _toast(e);
    }
  }

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      return AdminScaffold(
        current: 'area',
        title: l.t('area'),
        actions: [
          IconButton(icon: const Icon(Icons.sync, size: 30), onPressed: _reload),
          IconButton(icon: const Icon(Icons.add, size: 32), onPressed: () => _edit()),
          const SizedBox(width: 4),
        ],
        body: FutureBuilder<List<AreaItem>>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snap.hasError) {
              return Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(snap.error.toString().replaceFirst('Exception: ', '')),
                    const SizedBox(height: 10),
                    OutlinedButton(onPressed: _reload, child: Text(l.t('retry'))),
                  ],
                ),
              );
            }
            final list = snap.data!;
            if (list.isEmpty) {
              return Center(child: Text(l.t('no_data')));
            }
            return ListView.separated(
              itemCount: list.length,
              separatorBuilder: (_, __) => const Divider(height: 1, color: AppColors.line),
              itemBuilder: (_, i) {
                final a = list[i];
                return ListTile(
                  contentPadding: const EdgeInsets.fromLTRB(12, 4, 4, 4),
                  leading: LetterAvatar(text: a.name, radius: 25),
                  title: Text(a.name,
                      style: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.bold, color: AppColors.text)),
                  subtitle: Text(a.subtitle,
                      style: const TextStyle(fontSize: 17, color: AppColors.text)),
                  trailing: PopupMenuButton<String>(
                    icon: const Icon(Icons.more_vert, color: AppColors.sky),
                    onSelected: (v) => v == 'edit' ? _edit(a) : _delete(a),
                    itemBuilder: (_) => [
                      PopupMenuItem(value: 'edit', child: Text(l.t('edit'))),
                      PopupMenuItem(value: 'delete', child: Text(l.t('delete'))),
                    ],
                  ),
                );
              },
            );
          },
        ),
      );
    });
  }
}
