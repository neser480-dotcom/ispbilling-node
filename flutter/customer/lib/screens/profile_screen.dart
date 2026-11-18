import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../services/api_service.dart';
import '../widgets/page_scaffold.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  late Future<ProfileData> _future;

  @override
  void initState() {
    super.initState();
    _future = ApiService.profile();
  }

  Future<void> _reload() async {
    setState(() => _future = ApiService.profile());
    await _future;
  }

  void _toast(String m) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> _changePassword() async {
    final oldC = TextEditingController();
    final newC = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Change Password'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: oldC,
              obscureText: true,
              decoration: const InputDecoration(hintText: 'পুরনো পাসওয়ার্ড'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: newC,
              obscureText: true,
              decoration: const InputDecoration(hintText: 'নতুন পাসওয়ার্ড'),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Save')),
        ],
      ),
    );
    if (ok != true || newC.text.isEmpty) return;
    try {
      await ApiService.changePassword(oldC.text, newC.text);
      _toast('পাসওয়ার্ড পরিবর্তন হয়েছে');
    } catch (e) {
      _toast(e.toString().replaceFirst('Exception: ', ''));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Column(
        children: [
          const AppTitleBar(),
          Expanded(
            child: FutureBuilder<ProfileData>(
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
                        Text(snap.error
                            .toString()
                            .replaceFirst('Exception: ', '')),
                        const SizedBox(height: 12),
                        OutlinedButton(
                            onPressed: _reload, child: const Text('Retry')),
                      ],
                    ),
                  );
                }
                return RefreshIndicator(
                  onRefresh: _reload,
                  child: _content(snap.data!),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _content(ProfileData p) {
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        // নীল ব্যান্ড + ওভারল্যাপ করা গোল অবতার
        SizedBox(
          height: 116,
          child: Stack(
            alignment: Alignment.topCenter,
            children: [
              Container(height: 72, color: AppColors.loginBlue),
              Positioned(
                right: 8,
                top: 12,
                child: IconButton(
                  icon: const Icon(Icons.lock_person_outlined,
                      color: Colors.white, size: 28),
                  onPressed: _changePassword,
                ),
              ),
              Positioned(
                top: 16,
                child: CircleAvatar(
                  radius: 50,
                  backgroundColor: Colors.white,
                  backgroundImage:
                      p.photo.isNotEmpty ? NetworkImage(p.photo) : null,
                  child: p.photo.isEmpty
                      ? const Icon(Icons.person,
                          size: 88, color: Color(0xFFB0B0B0))
                      : null,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Center(
          child: Text('ID${p.id}',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        ),
        _section('PROFILE HEADLINE'),
        _row('Name', Text(p.name, style: _vStyle)),
        _row('Mobile', Text(p.mobile, style: _vStyle)),
        _row('Package', Text(p.packageName, style: _vStyle)),
        _row('Monthly Fee',
            Text('৳${p.monthlyFee.toStringAsFixed(0)}', style: _vStyle)),
        _row('Balance', Text('৳${p.balance.toStringAsFixed(0)}', style: _vStyle),
            last: true),
        _section('PROFILE DETAIL'),
        _row(
            'Status',
            _chip(p.status,
                p.status == 'ACTIVE' ? const Color(0xFF0B5FFF) : AppColors.red)),
        _row(
            'Payment Status',
            _chip(p.paymentStatus,
                p.paymentStatus == 'PAID' ? const Color(0xFF1E8449) : AppColors.red)),
        _row('Address', Text(p.address, style: _vStyle), last: true),
        _section('CURRENT STATE'),
        _row('Billing Date', Text(p.billingDate, style: _vStyle)),
        _row('Promise Date', Text(p.promiseDate, style: _vStyle)),
        _row('Connection Date', Text(p.connectionDate, style: _vStyle)),
        _row('Create Date', Text(p.createDate, style: _vStyle), last: true),
        const SizedBox(height: 24),
      ],
    );
  }

  static const _vStyle = TextStyle(fontSize: 17, color: Color(0xFF444444));

  Widget _section(String t) => Padding(
        padding: const EdgeInsets.fromLTRB(15, 28, 15, 4),
        child: Text(t,
            style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
                color: Color(0xFF555555))),
      );

  Widget _row(String label, Widget value, {bool last = false}) => Container(
        margin: const EdgeInsets.symmetric(horizontal: 15),
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          border: last
              ? null
              : const Border(bottom: BorderSide(color: Color(0xFFE5E5E5))),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: _vStyle),
            Flexible(child: value),
          ],
        ),
      );

  Widget _chip(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
        decoration:
            BoxDecoration(color: color, borderRadius: BorderRadius.circular(8)),
        child: Text(text,
            style: const TextStyle(
                color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold)),
      );
}
