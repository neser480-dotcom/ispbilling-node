import 'package:dio/dio.dart';
import '../core/api_client.dart';

/// Customer Recharge / Bulk Recharge API (Backend: routes/mobile/adminRecharge.js)
///
/// GET  /admin/recharge/form?id=            -> {customer, base_month, month_keys, default_total, allow_daily, options}
/// POST /admin/recharge/quote               -> {amount, subscription_amount, previous_due, from_balance,
///                                              extra_to_balance, advance, ...}  (শুধু হিসাব)
/// POST /admin/recharge                     -> {success, message, ...}
/// GET  /admin/recharge/bulk/customers?ids= -> {total, total_amount, max_bulk, items:[{id,name,amount,...}]}
/// POST /admin/recharge/bulk                -> {success, message, total, ok, failed, total_amount, results}
class RechargeApi {
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

  // MikroTik কাজ থাকায় রিচার্জ ধীর হতে পারে, তাই সময়সীমা বাড়ানো।
  static Options _slow(int seconds) => Options(
        receiveTimeout: Duration(seconds: seconds),
        sendTimeout: Duration(seconds: seconds),
      );

  static Future<Map<String, dynamic>> form(int customerId) => _run(() async {
        final r = await ApiClient.dio
            .get('/admin/recharge/form', queryParameters: {'id': customerId});
        return Map<String, dynamic>.from(r.data as Map);
      });

  static Future<Map<String, dynamic>> quote(Map<String, dynamic> body) =>
      _run(() async {
        final r = await ApiClient.dio.post('/admin/recharge/quote', data: body);
        return Map<String, dynamic>.from(r.data as Map);
      });

  static Future<Map<String, dynamic>> recharge(Map<String, dynamic> body) =>
      _run(() async {
        final r = await ApiClient.dio
            .post('/admin/recharge', data: body, options: _slow(90));
        return Map<String, dynamic>.from(r.data as Map);
      });

  static Future<Map<String, dynamic>> bulkCustomers(List<int> ids) =>
      _run(() async {
        final r = await ApiClient.dio.get('/admin/recharge/bulk/customers',
            queryParameters: {'ids': ids.join(',')});
        return Map<String, dynamic>.from(r.data as Map);
      });

  /// items: [{customer_id, amount}]
  /// billingType: 'monthly' | 'yearly'
  /// medium: 'hand_cash' | 'bkash' | 'nagad' | 'bank'
  static Future<Map<String, dynamic>> bulkRecharge({
    required List<Map<String, dynamic>> items,
    String billingType = 'monthly',
    String medium = 'hand_cash',
    String comment = 'Bulk recharge',
  }) =>
      _run(() async {
        final r = await ApiClient.dio.post(
          '/admin/recharge/bulk',
          data: {
            'billing_type': billingType,
            'medium': medium,
            'comment': comment,
            'items': items,
          },
          options: _slow(300),
        );
        return Map<String, dynamic>.from(r.data as Map);
      });
}
