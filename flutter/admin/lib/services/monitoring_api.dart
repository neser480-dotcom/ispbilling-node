import 'package:dio/dio.dart';
import '../core/api_client.dart';

/// Active PPPoE + Monitoring (Backend: routes/mobile/adminMonitoring.js)
///
/// GET  /admin/monitoring/active-pppoe/routers        -> {success, data:[{id,name}]}
/// GET  /admin/monitoring/active-pppoe                ?router_id&connection_status&search&package&page&limit
///        -> {router, total, active, offline, matched, page, limit, total_pages, data:[row]}
/// POST /admin/monitoring/active-pppoe/ping           {router_id, address}      (শুধু Admin)
/// POST /admin/monitoring/active-pppoe/remove         {router_id, active_id}    (শুধু Admin)
/// GET  /admin/monitoring/active-pppoe/mac-vendor     ?mac
/// GET  /admin/monitoring/faults                      ?page&limit&search&severity
/// GET  /admin/monitoring/fault-details               ?olt_id&pon
/// GET  /admin/monitoring/interface                   ?id
/// GET  /admin/monitoring/interface/bandwidth         ?id&interface
/// GET  /admin/monitoring/customer-traffic/live       ?id
/// GET  /admin/monitoring/customer-traffic/monthly    ?month=YYYY-MM
class MonitoringApi {
  static const _base = '/admin/monitoring';

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

  /// Web সার্ভিস কখনো HTTP 200-এর সাথে {success:false, message} দেয় (যেমন MikroTik সংযোগ ব্যর্থ)।
  static Map<String, dynamic> _ok(dynamic data) {
    final m = Map<String, dynamic>.from(data as Map);
    if (m['success'] == false) {
      throw Exception('${m['message'] ?? 'ব্যর্থ হয়েছে'}');
    }
    return m;
  }

  static Map<String, dynamic> _q(Map<String, dynamic> m) {
    final out = <String, dynamic>{};
    m.forEach((k, v) {
      if (v == null) return;
      if (v is String && v.trim().isEmpty) return;
      out[k] = v;
    });
    return out;
  }

  static List<Map<String, dynamic>> _list(dynamic data) => data is List
      ? data.map((e) => Map<String, dynamic>.from(e as Map)).toList()
      : <Map<String, dynamic>>[];

  // ---------------- Active PPPoE ----------------

  static Future<List<Map<String, dynamic>>> activeRouters() => _run(() async {
        final r = await ApiClient.dio.get('$_base/active-pppoe/routers');
        return _list(_ok(r.data)['data']);
      });

  /// status: all | active | offline
  static Future<Map<String, dynamic>> activeCustomers({
    required int routerId,
    String status = 'all',
    String search = '',
    int page = 1,
    int limit = 50,
  }) =>
      _run(() async {
        final r = await ApiClient.dio.get(
          '$_base/active-pppoe',
          queryParameters: _q({
            'router_id': routerId,
            'connection_status': status,
            'search': search,
            'page': page,
            'limit': limit,
          }),
          options: Options(receiveTimeout: const Duration(seconds: 70)),
        );
        return _ok(r.data);
      });

  static Future<Map<String, dynamic>> ping(int routerId, String address) =>
      _run(() async {
        final r = await ApiClient.dio.post(
          '$_base/active-pppoe/ping',
          data: {'router_id': routerId, 'address': address},
          options: Options(receiveTimeout: const Duration(seconds: 35)),
        );
        return _ok(r.data);
      });

  static Future<void> removeConnection(int routerId, String activeId) =>
      _run(() async {
        await ApiClient.dio.post('$_base/active-pppoe/remove',
            data: {'router_id': routerId, 'active_id': activeId});
      });

  static Future<String> macVendor(String mac) => _run(() async {
        final r = await ApiClient.dio.get('$_base/active-pppoe/mac-vendor',
            queryParameters: {'mac': mac});
        return '${_ok(r.data)['vendor'] ?? ''}';
      });

  // ---------------- Network Fault ----------------

  /// severity: '' | critical | warning
  static Future<Map<String, dynamic>> faults({
    String search = '',
    String severity = '',
    int page = 1,
    int limit = 25,
  }) =>
      _run(() async {
        final r = await ApiClient.dio.get('$_base/faults',
            queryParameters: _q({
              'search': search,
              'severity': severity,
              'page': page,
              'limit': limit,
            }));
        return _ok(r.data);
      });

  static Future<Map<String, dynamic>> faultDetails(int oltId, String pon) =>
      _run(() async {
        final r = await ApiClient.dio.get('$_base/fault-details',
            queryParameters: {'olt_id': oltId, 'pon': pon});
        return _ok(r.data);
      });

  // ---------------- Interface Monitor ----------------

  /// {routers:[{id,name}], router, ethernet_interfaces:[], vlan_interfaces:[]}
  static Future<Map<String, dynamic>> interfaces({int? routerId}) =>
      _run(() async {
        final r = await ApiClient.dio.get('$_base/interface',
            queryParameters: _q({'id': routerId}),
            options: Options(receiveTimeout: const Duration(seconds: 45)));
        return _ok(r.data);
      });

  /// {interface:{name,status}, downloadMbps, uploadMbps, rxBytes, txBytes, timestamp}
  static Future<Map<String, dynamic>> bandwidth(
          int routerId, String interfaceName) =>
      _run(() async {
        final r = await ApiClient.dio.get('$_base/interface/bandwidth',
            queryParameters: {'id': routerId, 'interface': interfaceName},
            options: Options(receiveTimeout: const Duration(seconds: 30)));
        return _ok(r.data);
      });

  // ---------------- Customer Traffic ----------------

  /// {routers, router, customers:[], totals:{activeUsers,downloadMbps,uploadMbps,downloadGB,uploadGB}, chart:[], lastUpdate}
  static Future<Map<String, dynamic>> trafficLive({int? routerId}) =>
      _run(() async {
        final r = await ApiClient.dio.get('$_base/customer-traffic/live',
            queryParameters: _q({'id': routerId}),
            options: Options(receiveTimeout: const Duration(seconds: 70)));
        return _ok(r.data);
      });

  /// month: 'YYYY-MM' (খালি = চলতি মাস)
  /// {month, days, totals:{upload_gb,download_gb}, customers:[{customer_id,name,username,package,upload_bytes,download_bytes,sessions,last_logged_out}]}
  static Future<Map<String, dynamic>> trafficMonthly({String month = ''}) =>
      _run(() async {
        final r = await ApiClient.dio.get('$_base/customer-traffic/monthly',
            queryParameters: _q({'month': month}));
        return _ok(r.data);
      });
}
