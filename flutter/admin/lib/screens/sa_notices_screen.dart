import 'package:material_ui/material_ui.dart';
import '../services/api_service.dart';
import '../widgets/admin_scaffold.dart';

class SaNoticesScreen extends StatefulWidget {
  final bool addOnly;
  const SaNoticesScreen({super.key, this.addOnly = false});

  @override
  State<SaNoticesScreen> createState() => _SaNoticesScreenState();
}

class _SaNoticesScreenState extends State<SaNoticesScreen> {
  List<Map<String, dynamic>> _rows = [];
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.addOnly) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _editNotice();
      });
    } else {
      _load();
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = await ApiService.superNoticesList();
      if (!mounted) return;
      setState(() => _rows = rows);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _v(Map<String, dynamic> row, String key) => row[key]?.toString() ?? '';

  String _dateText(String value) {
    if (value.isEmpty) return '—';
    return value.replaceFirst('T', ' ');
  }

  Color _stateColor(String state) {
    switch (state) {
      case 'live':
        return Colors.green;
      case 'scheduled':
        return Colors.blue;
      case 'expired':
        return Colors.grey;
      default:
        return Colors.orange;
    }
  }

  Future<void> _editNotice([Map<String, dynamic>? row]) async {
    final title = TextEditingController(text: _v(row ?? {}, 'title'));
    final message = TextEditingController(text: _v(row ?? {}, 'message'));
    final company = TextEditingController(text: _v(row ?? {}, 'company_id'));
    DateTime? start = DateTime.tryParse(
      _v(row ?? {}, 'starts_at').replaceFirst(' ', 'T'),
    );
    DateTime? end = DateTime.tryParse(
      _v(row ?? {}, 'ends_at').replaceFirst(' ', 'T'),
    );
    start ??= DateTime.now();
    end ??= start.add(const Duration(days: 1));
    String status =
        _v(row ?? {}, 'status') == 'inactive' ? 'inactive' : 'active';
    bool saving = false;

    String formatDate(DateTime value) {
      String two(int n) => n.toString().padLeft(2, '0');
      return '${value.year}-${two(value.month)}-${two(value.day)}T${two(value.hour)}:${two(value.minute)}';
    }

    Future<DateTime?> chooseDateTime(
      BuildContext dialogContext,
      DateTime initial,
    ) async {
      final date = await showDatePicker(
        context: dialogContext,
        initialDate: initial,
        firstDate: DateTime(2020),
        lastDate: DateTime(2100),
      );
      if (date == null || !dialogContext.mounted) return null;
      final time = await showTimePicker(
        context: dialogContext,
        initialTime: TimeOfDay.fromDateTime(initial),
      );
      if (time == null) return null;
      return DateTime(date.year, date.month, date.day, time.hour, time.minute);
    }

    try {
      final saved = await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) => StatefulBuilder(
          builder: (context, refresh) => AlertDialog(
            title: Text(row == null ? 'New Maintenance Notice' : 'Edit Notice'),
            content: SizedBox(
              width: 480,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text('Notice type'),
                    const SizedBox(height: 6),
                    const InputDecorator(
                      decoration: InputDecoration(
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      child: Text('Maintenance notice'),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: status,
                      decoration: const InputDecoration(
                        labelText: 'Status',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(
                            value: 'active', child: Text('Active')),
                        DropdownMenuItem(
                            value: 'inactive', child: Text('Inactive')),
                      ],
                      onChanged: (v) {
                        if (v != null) refresh(() => status = v);
                      },
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: title,
                      maxLength: 190,
                      decoration: const InputDecoration(
                        labelText: 'Title',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: message,
                      maxLength: 3000,
                      maxLines: 4,
                      decoration: const InputDecoration(
                        labelText: 'Message',
                        alignLabelWithHint: true,
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: company,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Company ID (blank = all companies)',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 14),
                    OutlinedButton.icon(
                      icon: const Icon(Icons.calendar_month),
                      label: Text(
                          'Start: ${formatDate(start!).replaceFirst('T', ' ')}'),
                      onPressed: () async {
                        final picked = await chooseDateTime(context, start!);
                        if (picked != null) refresh(() => start = picked);
                      },
                    ),
                    OutlinedButton.icon(
                      icon: const Icon(Icons.event_available),
                      label: Text(
                          'End: ${formatDate(end!).replaceFirst('T', ' ')}'),
                      onPressed: () async {
                        final picked = await chooseDateTime(context, end!);
                        if (picked != null) refresh(() => end = picked);
                      },
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'The notice appears only between its start and end time.',
                      style: TextStyle(fontSize: 12, color: Colors.grey),
                    ),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed:
                    saving ? null : () => Navigator.pop(dialogContext, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: saving
                    ? null
                    : () async {
                        final t = title.text.trim();
                        final m = message.text.trim();
                        final c = company.text.trim();
                        if (t.isEmpty || t.length > 190) {
                          ScaffoldMessenger.of(dialogContext).showSnackBar(
                            const SnackBar(
                                content: Text(
                                    'Title is required (max 190 characters).')),
                          );
                          return;
                        }
                        if (m.isEmpty || m.length > 3000) {
                          ScaffoldMessenger.of(dialogContext).showSnackBar(
                            const SnackBar(
                                content: Text(
                                    'Message is required (max 3000 characters).')),
                          );
                          return;
                        }
                        if (c.isNotEmpty &&
                            (int.tryParse(c) == null || int.parse(c) <= 0)) {
                          ScaffoldMessenger.of(dialogContext).showSnackBar(
                            const SnackBar(
                                content: Text(
                                    'Company ID must be a positive number or blank.')),
                          );
                          return;
                        }
                        if (!end!.isAfter(start!)) {
                          ScaffoldMessenger.of(dialogContext).showSnackBar(
                            const SnackBar(
                                content:
                                    Text('End time must be after start time.')),
                          );
                          return;
                        }

                        refresh(() => saving = true);
                        final body = {
                          'notice_type': 'maintenance',
                          'status': status,
                          'title': t,
                          'message': m,
                          'company_id': c,
                          'starts_at': formatDate(start!),
                          'ends_at': formatDate(end!),
                        };
                        try {
                          if (row == null) {
                            await ApiService.superNoticeCreate(body);
                          } else {
                            final id = int.tryParse(_v(row, 'id'));
                            if (id == null) {
                              throw Exception('Invalid notice ID.');
                            }
                            await ApiService.superNoticeUpdate(id, body);
                          }
                          if (dialogContext.mounted) {
                            Navigator.pop(dialogContext, true);
                          }
                        } catch (e) {
                          refresh(() => saving = false);
                          if (dialogContext.mounted) {
                            ScaffoldMessenger.of(dialogContext).showSnackBar(
                              SnackBar(
                                  content: Text(e
                                      .toString()
                                      .replaceFirst('Exception: ', ''))),
                            );
                          }
                        }
                      },
                child: saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(row == null ? 'Create Notice' : 'Save Changes'),
              ),
            ],
          ),
        ),
      );

      if (saved == true && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content:
                  Text(row == null ? 'Notice created.' : 'Notice updated.')),
        );
        await _load();
      }
    } finally {
      title.dispose();
      message.dispose();
      company.dispose();
    }
  }

  Future<void> _deleteNotice(Map<String, dynamic> row) async {
    final id = int.tryParse(_v(row, 'id'));
    if (id == null) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Notice?'),
        content: Text('Delete "${_v(row, 'title')}"? This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;

    try {
      await ApiService.superNoticeDelete(id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Notice deleted.')),
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    }
  }

  Widget _noticeCard(Map<String, dynamic> row) {
    final state = _v(row, 'state');
    final company = _v(row, 'company_id');
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    _v(row, 'title'),
                    style: const TextStyle(
                        fontSize: 17, fontWeight: FontWeight.bold),
                  ),
                ),
                Chip(
                  label: Text(
                      state.isEmpty ? _v(row, 'status') : state.toUpperCase()),
                  backgroundColor: _stateColor(state).withValues(alpha: 0.12),
                  labelStyle: TextStyle(
                    color: _stateColor(state),
                    fontWeight: FontWeight.bold,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(_v(row, 'message')),
            const Divider(height: 22),
            Text('Type: Maintenance'),
            Text('Start: ${_dateText(_v(row, 'starts_at'))}'),
            Text('End: ${_dateText(_v(row, 'ends_at'))}'),
            Text(
                'Company: ${company.isEmpty || company == 'null' ? 'All companies' : '#$company'}'),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton.icon(
                  onPressed: () => _editNotice(row),
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Edit'),
                ),
                TextButton.icon(
                  onPressed: () => _deleteNotice(row),
                  icon: const Icon(Icons.delete_outline, color: Colors.red),
                  label:
                      const Text('Delete', style: TextStyle(color: Colors.red)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AdminScaffold(
      current: widget.addOnly ? 'sa_notice_add' : 'sa_notices',
      title: widget.addOnly ? 'New Notice' : 'All Notices',
      actions: widget.addOnly
          ? const []
          : [
              IconButton(
                tooltip: 'Refresh',
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh),
              ),
            ],
      body: widget.addOnly
          ? const Center(
              child: Text(
                  'Use the New Notice form to publish a maintenance notice.'),
            )
          : _loading && _rows.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : _error != null && _rows.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(_error!, textAlign: TextAlign.center),
                            const SizedBox(height: 12),
                            FilledButton.icon(
                              onPressed: _load,
                              icon: const Icon(Icons.refresh),
                              label: const Text('Retry'),
                            ),
                          ],
                        ),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.all(14),
                        children: [
                          Row(
                            children: [
                              const Expanded(
                                child: Text(
                                  'Maintenance notices',
                                  style: TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.bold),
                                ),
                              ),
                              FilledButton.icon(
                                onPressed: () => _editNotice(),
                                icon: const Icon(Icons.add),
                                label: const Text('New Notice'),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          if (_error != null)
                            Padding(
                              padding: const EdgeInsets.all(8),
                              child: Text(_error!,
                                  style: const TextStyle(color: Colors.red)),
                            ),
                          if (_rows.isEmpty)
                            const Padding(
                              padding: EdgeInsets.only(top: 50),
                              child: Center(child: Text('No notices found.')),
                            )
                          else
                            ..._rows.map(_noticeCard),
                        ],
                      ),
                    ),
    );
  }
}
