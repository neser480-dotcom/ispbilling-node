import 'package:flutter/material.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../services/api_service.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';
import '../widgets/letter_avatar.dart';

class PackageScreen extends StatefulWidget {
  const PackageScreen({super.key});

  @override
  State<PackageScreen> createState() => _PackageScreenState();
}

class _PackageScreenState extends State<PackageScreen> {
  List<AreaItem> _areas = [];
  int? _areaId;
  Future<PackagesData>? _packages;
  String? _error;
  bool _loading = true;

  static const _palette = [
    Color(0xFFFF8A65),
    Color(0xFF4DD0E1),
    Color(0xFF66BB6A),
    Color(0xFFAED581),
  ];

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final a = await ApiService.areas();
      if (!mounted) return;
      setState(() {
        _areas = a;
        _areaId = a.isNotEmpty ? a.first.id : null;
        _packages = ApiService.packages(_areaId);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  void _reloadPackages() =>
      setState(() => _packages = ApiService.packages(_areaId));

  @override
  Widget build(BuildContext context) {
    return LangBuilder(builder: (_) {
      final l = Lang.i;
      return AdminScaffold(
        current: 'package',
        title: l.t('package'),
        actions: [
          IconButton(icon: const Icon(Icons.sync, size: 30), onPressed: _init),
          const SizedBox(width: 6),
        ],
        body: _body(l),
      );
    });
  }

  Widget _body(Lang l) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!),
            const SizedBox(height: 10),
            OutlinedButton(onPressed: _init, child: Text(l.t('retry'))),
          ],
        ),
      );
    }
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 56, 20, 12),
          child: Container(
            height: 42,
            padding: const EdgeInsets.symmetric(horizontal: 18),
            decoration: BoxDecoration(
              border: Border.all(color: const Color(0xFF555555)),
              borderRadius: BorderRadius.circular(30),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<int>(
                value: _areaId,
                isExpanded: true,
                style: const TextStyle(fontSize: 18, color: Color(0xFF333333)),
                items: [
                  for (final a in _areas)
                    DropdownMenuItem(value: a.id, child: Text(a.name)),
                ],
                onChanged: (v) {
                  _areaId = v;
                  _reloadPackages();
                },
              ),
            ),
          ),
        ),
        FutureBuilder<PackagesData>(
          future: _packages,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              );
            }
            if (snap.hasError) {
              return Padding(
                padding: const EdgeInsets.all(16),
                child: Center(
                  child: Text(snap.error.toString().replaceFirst('Exception: ', '')),
                ),
              );
            }
            final d = snap.data!;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(15, 4, 15, 10),
                  child: Text('${l.t('packages_count')} ${l.digits('${d.count}')}',
                      style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: AppColors.text)),
                ),
                for (var i = 0; i < d.items.length; i++)
                  Container(
                    padding: const EdgeInsets.fromLTRB(6, 6, 6, 6),
                    decoration: const BoxDecoration(
                      border: Border(bottom: BorderSide(color: AppColors.line)),
                    ),
                    child: Row(
                      children: [
                        const SizedBox(width: 6),
                        LetterAvatar(
                            text: 'P', radius: 25, color: _palette[i % _palette.length]),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(d.items[i].name,
                                  style: const TextStyle(
                                      fontSize: 19,
                                      fontWeight: FontWeight.bold,
                                      color: Color(0xFF444444))),
                              Text(d.items[i].createdAt,
                                  style: const TextStyle(fontSize: 16, color: AppColors.muted)),
                              Text('${inr(d.items[i].price)} Tk.',
                                  style: const TextStyle(fontSize: 18, color: AppColors.muted)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}
