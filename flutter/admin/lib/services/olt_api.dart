import 'package:dio/dio.dart';
import '../core/api_client.dart';

/// OLT / ONU / OLT Monitor / Activity Log — Backend: routes/mobile/adminOltActivity.js
/// সব পথ /api/mobile/admin/... (ApiClient.dio-র baseUrl-এ /admin/... দিয়ে)।
///
/// GET    /olts ?search                        -> {success,total,data:[{id,vendor,name,ip,port,username,pon_ports,status,last_check,onu_total,onu_online}]}
/// GET    /olts/:id/details                    -> {success,data:{...olt, onu_summary:{total,online,avg_rx,avg_tx}}}
/// GET    /olts/:id/onus ?search               -> {success,total,data:[ONU...]}
/// GET    /olts/:id/customers/search ?q        -> {success,total,data:[{id,customer_code,name,phone}]}
/// POST   /olts | PUT /olts/:id | DELETE /olts/:id {confirm:true}
/// POST   /olts/:id/check | /sync/customers | /sync/onu | /auto-map   (দীর্ঘ সময়, শুধু Admin)
/// POST   /olts/:id/onus/:onuId/customer {customer_id} | DELETE একই পথ
/// GET    /olt-monitor/dashboard ?olt_id       -> {success,data:{summary,olts,alarms,selectedOlt,systemStatus,recentOnus}}
/// GET    /olt-monitor/live ?olt_id&refresh=1  -> {success,olt,ports,system,alarms,totalOnu,activeOnu,offlineOnu,captured_at,warnings}
/// GET    /activity-log ?search&from_date&to_date&page&limit -> {status,summary:{total_data},pagination,logs:[...]}
class OltApi {
  static String _msg(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['message'] != null) return '${data['message']}';
    if (e.type == DioExceptionType.receiveTimeout) {
      return 'OLT থেকে উত্তর আসতে দেরি হচ্ছে, কিছুক্ষণ পরে আবার চেষ্টা করুন';
    }
    return 'সার্ভারের সাথে সংযোগ করা যায়নি';
  }

  static Future<T> _run<T>(Future<T> Function() fn) async {
    try {
      return await fn();
    } on DioException catch (e) {
      throw Exception(_msg(e));
    }
  }

  static Map<String, dynamic> _map(dynamic d) =>
      d is Map ? Map<String, dynamic>.from(d) : <String, dynamic>{};

  static Map<String, dynamic> _q(Map<String, dynamic> m) {
    final out = <String, dynamic>{};
    m.forEach((k, v) {
      if (v == null) return;
      if (v is String && v.trim().isEmpty) return;
      out[k] = v;
    });
    return out;
  }

  /// OLT-এ লগইন/SNMP/Sync ধীর — ডিফল্ট ১৫ সেকেন্ডে কুলোয় না
  static Options get _long => Options(
        receiveTimeout: const Duration(seconds: 120),
        sendTimeout: const Duration(seconds: 30),
      );

  // ---------------- OLT ----------------

  static Future<Map<String, dynamic>> olts({String search = ''}) =>
      _run(() async {
        final r = await ApiClient.dio
            .get('/admin/olts', queryParameters: _q({'search': search}));
        return _map(r.data);
      });

  static Future<Map<String, dynamic>> oltDetails(int id) => _run(() async {
        final r = await ApiClient.dio.get('/admin/olts/$id/details');
        return _map(r.data);
      });

  static Future<Map<String, dynamic>> onus(int oltId, {String search = ''}) =>
      _run(() async {
        final r = await ApiClient.dio.get('/admin/olts/$oltId/onus',
            queryParameters: _q({'search': search}), options: _long);
        return _map(r.data);
      });

  static Future<Map<String, dynamic>> searchCustomers(int oltId, String q) =>
      _run(() async {
        final r = await ApiClient.dio.get('/admin/olts/$oltId/customers/search',
            queryParameters: {'q': q});
        return _map(r.data);
      });

  /// নতুন OLT (olt_add Permission লাগে)
  static Future<Map<String, dynamic>> addOlt(Map<String, dynamic> body) =>
      _run(() async {
        final r = await ApiClient.dio.post('/admin/olts', data: body);
        return _map(r.data);
      });

  static Future<Map<String, dynamic>> updateOlt(
          int id, Map<String, dynamic> body) =>
      _run(() async {
        final r = await ApiClient.dio.put('/admin/olts/$id', data: body);
        return _map(r.data);
      });

  static Future<Map<String, dynamic>> deleteOlt(int id) => _run(() async {
        final r = await ApiClient.dio
            .delete('/admin/olts/$id', data: {'confirm': true});
        return _map(r.data);
      });

  static Future<Map<String, dynamic>> checkOlt(int id) => _run(() async {
        final r = await ApiClient.dio
            .post('/admin/olts/$id/check', data: {}, options: _long);
        return _map(r.data);
      });

  static Future<Map<String, dynamic>> syncCustomers(int id,
          {bool dryRun = false}) =>
      _run(() async {
        final r = await ApiClient.dio.post('/admin/olts/$id/sync/customers',
            data: {'dry_run': dryRun}, options: _long);
        return _map(r.data);
      });

  static Future<Map<String, dynamic>> syncOnu(int id) => _run(() async {
        final r = await ApiClient.dio
            .post('/admin/olts/$id/sync/onu', data: {}, options: _long);
        return _map(r.data);
      });

  static Future<Map<String, dynamic>> autoMap(int id, {bool dryRun = false}) =>
      _run(() async {
        final r = await ApiClient.dio.post('/admin/olts/$id/auto-map',
            data: {'dry_run': dryRun}, options: _long);
        return _map(r.data);
      });

  static Future<Map<String, dynamic>> linkOnuCustomer(
          int oltId, int onuId, int customerId) =>
      _run(() async {
        final r = await ApiClient.dio.post(
            '/admin/olts/$oltId/onus/$onuId/customer',
            data: {'customer_id': customerId});
        return _map(r.data);
      });

  static Future<Map<String, dynamic>> unlinkOnuCustomer(
          int oltId, int onuId) =>
      _run(() async {
        final r = await ApiClient.dio
            .delete('/admin/olts/$oltId/onus/$onuId/customer', data: {});
        return _map(r.data);
      });

  // ---------------- OLT Monitor ----------------

  static Future<Map<String, dynamic>> monitorDashboard({int? oltId}) =>
      _run(() async {
        final r = await ApiClient.dio.get('/admin/olt-monitor/dashboard',
            queryParameters: _q({'olt_id': oltId}), options: _long);
        return _map(r.data);
      });

  static Future<Map<String, dynamic>> monitorLive(int oltId,
          {bool refresh = false}) =>
      _run(() async {
        final r = await ApiClient.dio.get('/admin/olt-monitor/live',
            queryParameters: _q({'olt_id': oltId, if (refresh) 'refresh': '1'}),
            options: _long);
        return _map(r.data);
      });

  // ---------------- Activity Log ----------------

  static Future<Map<String, dynamic>> activityLog({
    String search = '',
    String from = '',
    String to = '',
    int page = 1,
    int limit = 30,
  }) =>
      _run(() async {
        final r = await ApiClient.dio.get('/admin/activity-log',
            queryParameters: _q({
              'search': search,
              'from_date': from,
              'to_date': to,
              'page': page,
              'limit': limit,
            }));
        return _map(r.data);
      });
}
