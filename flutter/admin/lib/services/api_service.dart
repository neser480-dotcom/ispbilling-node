import 'package:dio/dio.dart';
import '../core/api_client.dart';
import '../models/models.dart';

/// Auth endpoint (Phase 1, তৈরি): /api/mobile/auth/admin/{login,refresh,logout,me,permissions}
/// নিচের /admin/* endpoint গুলোও এখন Backend-এ আছে (Phase 2):
/// POST /auth/admin/login     {username, password} -> {access_token, refresh_token, user}
/// GET  /dashboard            ?year&month&medium -> {potential, collection, percent,
///                              total_customers, new_customers,
///                              connected_customers, connected_amount, connected_new, connected_new_amount,
///                              paid_customers, paid_new, paid_new_amount}
/// GET  /dashboard/chart      ?year&month&mode(amount|count)&medium -> {values:[31 টি সংখ্যা]}
/// GET  /dashboard/people     ?type(collector|reseller)&year&month -> {balance, items:[{name,amount,count}]}
/// GET  /mediums              -> [{id, name}]
/// GET  /areas                -> [{id, name, subtitle, description}]
/// POST /areas                {name, description}
/// PUT  /areas/:id            {name, description}
/// DELETE /areas/:id
/// GET  /packages             ?area_id -> {count, items:[{id, name, created_at, price}]}
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
      throw Exception(_msg(e));
    }
  }

  static List<Map<String, dynamic>> _list(dynamic data) =>
      (data as List).map((e) => Map<String, dynamic>.from(e)).toList();

  static Future<void> login(String username, String password) => _run(() async {
        final r = await ApiClient.dio.post('/auth/admin/login',
            data: {'username': username, 'password': password, 'device_name': 'netfee_admin'});
        await ApiClient.saveTokens('${r.data['access_token']}', '${r.data['refresh_token']}');
        await ApiClient.saveName('${r.data['user']?['name'] ?? ''}');
      });

  /// Server-এ Refresh Token বাতিল করে, তারপর লোকাল Token মোছে
  static Future<void> logout() async {
    try {
      final rt = await ApiClient.getRefreshToken();
      if (rt != null) {
        await ApiClient.dio.post('/auth/admin/logout', data: {'refresh_token': rt});
      }
    } catch (_) {}
    await ApiClient.clearSession();
  }

  /// Backend থেকে নিজের Permission (UI দেখানোর জন্য; আসল যাচাই Backend-এ)
  static Future<Map<String, dynamic>> permissions() => _run(() async {
        final r = await ApiClient.dio.get('/auth/admin/permissions');
        return Map<String, dynamic>.from(r.data);
      });

  static Future<DashboardSummary> dashboard(int year, int month, String medium) =>
      _run(() async {
        final r = await ApiClient.dio.get('/admin/dashboard',
            queryParameters: {'year': year, 'month': month, 'medium': medium});
        return DashboardSummary.fromJson(Map<String, dynamic>.from(r.data));
      });

  static Future<List<double>> chart(
          int year, int month, String mode, String medium) =>
      _run(() async {
        final r = await ApiClient.dio.get('/admin/dashboard/chart', queryParameters: {
          'year': year,
          'month': month,
          'mode': mode,
          'medium': medium,
        });
        final raw = (r.data['values'] ?? []) as List;
        final values = raw.map((e) => e is num ? e.toDouble() : 0.0).toList();
        while (values.length < 31) {
          values.add(0);
        }
        return values.take(31).toList();
      });

  static Future<PeopleData> people(String type, int year, int month) =>
      _run(() async {
        final r = await ApiClient.dio.get('/admin/dashboard/people',
            queryParameters: {'type': type, 'year': year, 'month': month});
        return PeopleData.fromJson(Map<String, dynamic>.from(r.data));
      });

  static Future<List<SimpleOption>> mediums() => _run(() async {
        final r = await ApiClient.dio.get('/admin/mediums');
        return _list(r.data).map(SimpleOption.fromJson).toList();
      });

  static Future<List<AreaItem>> areas() => _run(() async {
        final r = await ApiClient.dio.get('/admin/areas');
        return _list(r.data).map(AreaItem.fromJson).toList();
      });

  static Future<void> saveArea(
          {int? id, required String name, required String description}) =>
      _run(() async {
        final body = {'name': name, 'description': description};
        if (id == null) {
          await ApiClient.dio.post('/admin/areas', data: body);
        } else {
          await ApiClient.dio.put('/admin/areas/$id', data: body);
        }
      });

  static Future<void> deleteArea(int id) =>
      _run(() async => ApiClient.dio.delete('/admin/areas/$id'));

  static Future<PackagesData> packages(int? areaId) => _run(() async {
        final r = await ApiClient.dio.get('/admin/packages',
            queryParameters: {if (areaId != null) 'area_id': areaId});
        return PackagesData.fromJson(Map<String, dynamic>.from(r.data));
      });
}
