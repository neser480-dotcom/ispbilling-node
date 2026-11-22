import 'package:dio/dio.dart';
import '../core/api_client.dart';

/// Employee ও Salary API (শুধু Admin — Backend যাচাই করে)
///
/// GET    /admin/employees            ?search            -> {staff:[...], totalData}
/// POST   /admin/employees            {name, mobile, email, address, parent_name, nid_no, salary}
/// PUT    /admin/employees/:id        {name, mobile, email, address, parent_name, salary, status}
/// DELETE /admin/employees/:id
/// GET    /admin/salaries/:staffId    ?search -> {staff, salaryList:[{id, amount, payment_date,
///                                      year, month, comment, creator_name}], totalPaid, totalData}
/// POST   /admin/salaries/:staffId/pay   {year, month, amount, comment}
/// DELETE /admin/salaries/:staffId/:salaryId
class EmployeeApi {
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

  static Map<String, dynamic> _q(Map<String, dynamic> m) {
    final out = <String, dynamic>{};
    m.forEach((k, v) {
      if (v == null) return;
      if (v is String && v.trim().isEmpty) return;
      out[k] = v;
    });
    return out;
  }

  static Map<String, dynamic> _map(dynamic data) =>
      data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};

  // ---------------- Employee ----------------

  static Future<Map<String, dynamic>> list({String search = ''}) =>
      _run(() async {
        final r = await ApiClient.dio
            .get('/admin/employees', queryParameters: _q({'search': search}));
        return _map(r.data);
      });

  static Future<void> add(Map<String, dynamic> body) => _run(() async {
        await ApiClient.dio.post('/admin/employees', data: body);
      });

  static Future<void> update(int id, Map<String, dynamic> body) =>
      _run(() async {
        await ApiClient.dio.put('/admin/employees/$id', data: body);
      });

  static Future<void> delete(int id) => _run(() async {
        await ApiClient.dio.delete('/admin/employees/$id');
      });

  // ---------------- Salary ----------------

  static Future<Map<String, dynamic>> salaryData(int staffId,
          {String search = ''}) =>
      _run(() async {
        final r = await ApiClient.dio.get('/admin/salaries/$staffId',
            queryParameters: _q({'search': search}));
        return _map(r.data);
      });

  static Future<void> paySalary(
    int staffId, {
    required int year,
    required int month,
    required num amount,
    String comment = '',
  }) =>
      _run(() async {
        await ApiClient.dio.post('/admin/salaries/$staffId/pay', data: {
          'year': year,
          'month': month,
          'amount': amount,
          'comment': comment,
        });
      });

  static Future<void> deleteSalary(int staffId, int salaryId) =>
      _run(() async {
        await ApiClient.dio.delete('/admin/salaries/$staffId/$salaryId');
      });
}
