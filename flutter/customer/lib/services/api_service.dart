import 'package:dio/dio.dart';
import '../core/api_client.dart';
import '../models/models.dart';

/// Backend: /api/mobile  — Auth: /auth/customer/{login,refresh,logout}; ডেটা: /customer/*
/// তৈরি: dashboard, profile, reports, packages, change-password, support-numbers, tickets,
///   packages/change (এটি *অনুরোধ* জমা দেয়; ISP অনুমোদন করলে Web থেকে Package বদলায়)।
/// এখনো নয়: live-speed (MikroTik জড়িত, 501)।
/// POST /auth/customer/login {customer_id, password, isp_code?} -> {access_token, refresh_token, user}
///   isp_code ঐচ্ছিক; একই ID+Password একাধিক ISP-তে মিললে সার্ভার 409 NEED_ISP_CODE দেয়
/// GET  /dashboard        -> {isp_name, name, monthly_bill, balance, due, status,
///                            last_payment_date, deadline_day,
///                            stats:{last_link_label?, last_link_uptime, current_uptime,
///                                   uptime_alert?, upload, download}}
///                            (upload/download যেমন "0 MB" বা "1.04 GB")
/// GET  /live-speed       -> {up_kbps, down_kbps}
/// GET  /packages         -> [ {id, name, price, active} ]
/// POST /packages/change  {package_id}
/// GET  /reports          -> [ {month, amount, status} ]
/// GET  /support-numbers  -> [ {name, phone, start_time, end_time, photo} ]
/// GET  /tickets          -> [ {id, subject, status, date} ]
/// POST /tickets          {subject, message}
/// GET  /profile          -> {id, name, mobile, package, monthly_fee, balance, status,
///                            payment_status, address, billing_date, promise_date,
///                            connection_date, create_date, photo}
/// POST /change-password  {old_password, new_password}
/// একই ইউজার আইডি+পাসওয়ার্ড একাধিক ISP-তে মিললে — তখন ISP কোড চাইতে হয়
class NeedIspCodeException implements Exception {
  @override
  String toString() => 'Exception: আপনার ISP কোড দিন';
}

class ApiService {
  static String _msg(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['message'] != null) return '${data['message']}';
    return 'সার্ভারের সাথে সংযোগ করা যায়নি';
  }

  static Future<T> _run<T>(Future<T> Function() fn) async {
    try {
      return await fn();
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map && data['code'] == 'NEED_ISP_CODE') throw NeedIspCodeException();
      throw Exception(_msg(e));
    }
  }

  static List<Map<String, dynamic>> _list(dynamic data) =>
      (data as List).map((e) => Map<String, dynamic>.from(e)).toList();

  /// ফেরত: true হলে ISP Admin-এর দেওয়া অস্থায়ী Password — এখনই বদলাতে হবে
  static Future<bool> login(String customerId, String password, {String ispCode = ''}) =>
      _run(() async {
        final code = ispCode.trim().isNotEmpty ? ispCode.trim() : ApiClient.defaultIspCode;
        final r = await ApiClient.dio.post('/auth/customer/login', data: {
          'customer_id': customerId,
          'password': password,
          if (code.isNotEmpty) 'isp_code': code,
          'device_name': 'netfi_client',
        });
        final d = r.data;
        await ApiClient.saveTokens('${d['access_token']}', '${d['refresh_token']}');
        await ApiClient.saveUser('${d['user']?['name'] ?? ''}', '${d['user']?['id'] ?? customerId}');
        return d['must_change_password'] == true;
      });

  /// Server-এ Refresh Token বাতিল, তারপর লোকাল Token মোছা
  static Future<void> logout() async {
    try {
      final rt = await ApiClient.getRefreshToken();
      if (rt != null) {
        await ApiClient.dio.post('/auth/customer/logout', data: {'refresh_token': rt});
      }
    } catch (_) {}
    await ApiClient.clearSession();
  }

  static Future<DashboardData> dashboard() => _run(() async {
        final r = await ApiClient.dio.get('/customer/dashboard');
        return DashboardData.fromJson(Map<String, dynamic>.from(r.data));
      });

  /// [upKbps, downKbps]
  static Future<List<double>> liveSpeed() => _run(() async {
        final r = await ApiClient.dio.get('/customer/live-speed');
        return [
          double.tryParse('${r.data['up_kbps']}') ?? 0,
          double.tryParse('${r.data['down_kbps']}') ?? 0,
        ];
      });

  static Future<List<PackageItem>> packages() => _run(() async {
        final r = await ApiClient.dio.get('/customer/packages');
        return _list(r.data).map(PackageItem.fromJson).toList();
      });

  static Future<void> changePackage(int id) => _run(() async {
        await ApiClient.dio.post('/customer/packages/change', data: {'package_id': id});
      });

  static Future<List<ReportItem>> reports() => _run(() async {
        final r = await ApiClient.dio.get('/customer/reports');
        return _list(r.data).map(ReportItem.fromJson).toList();
      });

  static Future<List<SupportContact>> supportNumbers() => _run(() async {
        final r = await ApiClient.dio.get('/customer/support-numbers');
        return _list(r.data).map(SupportContact.fromJson).toList();
      });

  static Future<List<TicketItem>> tickets() => _run(() async {
        final r = await ApiClient.dio.get('/customer/tickets');
        return _list(r.data).map(TicketItem.fromJson).toList();
      });

  static Future<void> createTicket(String subject, String message) =>
      _run(() async {
        await ApiClient.dio
            .post('/customer/tickets', data: {'subject': subject, 'message': message});
      });

  static Future<ProfileData> profile() => _run(() async {
        final r = await ApiClient.dio.get('/customer/profile');
        return ProfileData.fromJson(Map<String, dynamic>.from(r.data));
      });

  static Future<void> changePassword(String oldPass, String newPass) =>
      _run(() async {
        await ApiClient.dio.post('/customer/change-password',
            data: {'old_password': oldPass, 'new_password': newPass});
      });
}
