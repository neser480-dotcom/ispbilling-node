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

  // Public ISP registration: Web session cookie + registration CSRF.
  static final Dio _registrationDio = Dio(
    BaseOptions(
      baseUrl: 'https://amaderbill.com',
      connectTimeout: const Duration(seconds: 20),
      receiveTimeout: const Duration(seconds: 20),
      headers: {
        'Accept': 'application/json',
      },
    ),
  );

  static String? _registrationCookie;

  static void _captureRegistrationCookie(Response response) {
    final values = response.headers.map['set-cookie'];
    if (values == null) return;

    for (final value in values) {
      final cookie = value.split(';').first.trim();
      if (cookie.startsWith('ispbilling.sid=')) {
        _registrationCookie = cookie;
      }
    }
  }

  static Options _registrationOptions({bool form = false}) {
    return Options(
      headers: {
        if (_registrationCookie != null) 'Cookie': _registrationCookie!,
        if (form)
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
    );
  }

  static Future<Map<String, dynamic>> registrationData() async {
    try {
      _registrationCookie = null;

      final response = await _registrationDio.get(
        '/api/register/data',
      );

      _captureRegistrationCookie(response);

      final data = Map<String, dynamic>.from(response.data);

      if (data['success'] != true) {
        throw Exception(
          data['message'] ??
              'Registration data পাওয়া যায়নি',
        );
      }

      return data;
    } on DioException catch (e) {
      throw Exception(_msg(e));
    }
  }

  static Future<Map<String, dynamic>> registerIsp(
    Map<String, dynamic> values,
  ) async {
    try {
      if (_registrationCookie == null) {
        throw Exception(
            'Registration session পাওয়া যায়নি। আবার চেষ্টা করুন।');
      }

      final response = await _registrationDio.post(
        '/api/register',
        data: values,
        options: _registrationOptions(form: true),
      );

      _captureRegistrationCookie(response);

      return Map<String, dynamic>.from(response.data);
    } on DioException catch (e) {
      final response = e.response;
      if (response?.data is Map) {
        final data = Map<String, dynamic>.from(response!.data);
        throw Exception(
          data['message'] ?? 'Registration ব্যর্থ হয়েছে',
        );
      }
      throw Exception(_msg(e));
    }
  }

  static Future<void> login(String username, String password) => _run(() async {
        try {
          // 1. Username normalize
          final normalizedUsername = username.trim().toLowerCase();

          // 2. Admin Login
          final r = await ApiClient.dio.post(
            '/auth/admin/login',
            data: {
              'username': normalizedUsername,
              'password': password,
              'device_name': 'amaderbill',
            },
          );

          final accessToken = '${r.data['access_token'] ?? ''}';
          final refreshToken = '${r.data['refresh_token'] ?? ''}';

          if (accessToken.isEmpty ||
              refreshToken.isEmpty ||
              accessToken == 'null' ||
              refreshToken == 'null') {
            throw Exception('Login token পাওয়া যায়নি');
          }

          // 3. Save tokens
          await ApiClient.saveTokens(accessToken, refreshToken);

          // 4. Get Admin Profile
          final meResponse = await ApiClient.dio.get('/auth/admin/me');

          final meData = Map<String, dynamic>.from(meResponse.data);

          final profile = meData['user'] is Map
              ? Map<String, dynamic>.from(meData['user'])
              : meData;

          if (profile['id'] == null || profile['role'] == null) {
            throw Exception('Admin profile পাওয়া যায়নি');
          }

          await ApiClient.saveProfile(profile);

          // 5. Get and save permissions
          final permissionData = await permissions();

          if (permissionData['success'] == false) {
            throw Exception(
                'Permission যাচাই করা যায়নি');
          }

          await ApiClient.savePermissions(permissionData);
        } catch (_) {
          // কোনো ধাপে ব্যর্থ হলে সম্পূর্ণ Session পরিষ্কার
          await ApiClient.clearSession();
          rethrow;
        }
      });

  /// Server-এ Refresh Token বাতিল করে, তারপর লোকাল Token মোছে
  static Future<void> logout() async {
    try {
      final rt = await ApiClient.getRefreshToken();
      if (rt != null) {
        await ApiClient.dio
            .post('/auth/admin/logout', data: {'refresh_token': rt});
      }
    } catch (_) {}
    await ApiClient.clearSession();
  }

  /// Backend থেকে নিজের Permission (UI দেখানোর জন্য; আসল যাচাই Backend-এ)
  // Check current ISP software billing status
  static Future<Map<String, dynamic>> billingStatus() => _run(() async {
        final r = await ApiClient.dio.get('/admin/billing-status');
        return Map<String, dynamic>.from(r.data);
      });
  static Future<Map<String, dynamic>> permissions() => _run(() async {
        final r = await ApiClient.dio.get('/auth/admin/permissions');
        return Map<String, dynamic>.from(r.data);
      });

  static Future<DashboardSummary> dashboard(
          int year, int month, String medium) =>
      _run(() async {
        final r = await ApiClient.dio.get('/admin/dashboard',
            queryParameters: {'year': year, 'month': month, 'medium': medium});
        return DashboardSummary.fromJson(Map<String, dynamic>.from(r.data));
      });

  static Future<List<double>> chart(
          int year, int month, String mode, String medium) =>
      _run(() async {
        final r =
            await ApiClient.dio.get('/admin/dashboard/chart', queryParameters: {
          'year': year,
          'month': month,
          'mode': mode,
          'medium': medium,
        });
        final raw = (r.data['values'] ?? []) as List;
        final values = raw.map((e) => e is num ? e.toDouble() : 0.0).toList();
        return values;
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
  // Customer list with search and filters
  static Future<Map<String, dynamic>> customers({
    String search = '',
    String status = '',
    String paymentStatus = '',
    int page = 1,
    int limit = 30,
  }) =>
      _run(() async {
        final r = await ApiClient.dio.get('/admin/customers', queryParameters: {
          'search': search,
          'status': status,
          'payment_status': paymentStatus,
          'page': page,
          'limit': limit,
        });
        return Map<String, dynamic>.from(r.data);
      });

  // Customer detail and recent payments
  static Future<Map<String, dynamic>> customerDetail(int id) => _run(() async {
        final r = await ApiClient.dio.get('/admin/customers/$id');
        return Map<String, dynamic>.from(r.data);
      });

  // Create/reset customer mobile-app account
  static Future<Map<String, dynamic>> resetCustomerMobileAccount(
    int id, {
    String password = '',
  }) =>
      _run(() async {
        final r = await ApiClient.dio.post(
          '/admin/customers/$id/mobile-account',
          data: {
            if (password.trim().isNotEmpty) 'password': password.trim(),
          },
        );
        return Map<String, dynamic>.from(r.data);
      });

  // Super Admin: Software Billing list
  static Future<Map<String, dynamic>> softwareBills({
    String status = '',
    int page = 1,
  }) =>
      _run(() async {
        final r = await ApiClient.dio.get(
          '/admin/super/software-billing',
          queryParameters: {
            if (status.isNotEmpty) 'status': status,
            'page': page,
          },
        );
        return Map<String, dynamic>.from(r.data);
      });

  // Super Admin: Company pricing list
  static Future<List<Map<String, dynamic>>> pricingCompanies(
    String search,
  ) =>
      _run(() async {
        final r = await ApiClient.dio.get(
          '/admin/super/pricing/companies',
          queryParameters: {'search': search},
        );
        return _list(r.data['companies'] ?? []);
      });

  // Super Admin: Save pricing rule
  static Future<Map<String, dynamic>> pricingSave(
    int companyId,
    Map<String, dynamic> body,
  ) =>
      _run(() async {
        final r = await ApiClient.dio.post(
          '/admin/super/pricing/companies/$companyId/rules',
          data: body,
        );
        return Map<String, dynamic>.from(r.data);
      });

  // Super Admin: Enable/disable pricing rule
  static Future<Map<String, dynamic>> pricingToggle(
    int companyId,
    String fee,
    bool enable,
  ) =>
      _run(() async {
        final r = await ApiClient.dio.post(
          '/admin/super/pricing/companies/$companyId/rules/$fee/toggle',
          data: {'enabled': enable},
        );
        return Map<String, dynamic>.from(r.data);
      });

  // Super Admin: Reset pricing rule
  static Future<Map<String, dynamic>> pricingReset(
    int companyId,
    String fee,
  ) =>
      _run(() async {
        final r = await ApiClient.dio.post(
          '/admin/super/pricing/companies/$companyId/rules/$fee/reset',
          data: {},
        );
        return Map<String, dynamic>.from(r.data);
      });

  // ---------------- Collector / Manager / Report / Deposit / Expenditure ----------------

  static Map<String, dynamic> _q(Map<String, dynamic> m) {
    final out = <String, dynamic>{};
    m.forEach((k, v) {
      if (v == null) return;
      if (v is String && v.trim().isEmpty) return;
      out[k] = v;
    });
    return out;
  }

  /// kind: 'collectors' | 'managers'  (Backend: শুধু Admin)
  static Future<Map<String, dynamic>> staffList(String kind, {String search = ''}) =>
      _run(() async {
        final r = await ApiClient.dio
            .get('/admin/$kind', queryParameters: _q({'search': search}));
        return Map<String, dynamic>.from(r.data);
      });

  static Future<Map<String, dynamic>> staffProfile(String kind, int id) =>
      _run(() async {
        final r = await ApiClient.dio.get('/admin/$kind/$id/profile');
        return Map<String, dynamic>.from(r.data);
      });

  static Future<Map<String, dynamic>> collectorBalance(int id) => _run(() async {
        final r = await ApiClient.dio.get('/admin/collectors/$id/balance');
        return Map<String, dynamic>.from(r.data);
      });

  static Future<Map<String, dynamic>> collectionReport({
    String search = '',
    String from = '',
    String to = '',
    int page = 1,
    int limit = 30,
  }) =>
      _run(() async {
        final r = await ApiClient.dio.get('/admin/reports/collection',
            queryParameters: _q({
              'search': search,
              'from_date': from,
              'to_date': to,
              'page': page,
              'limit': limit,
            }));
        return Map<String, dynamic>.from(r.data);
      });

  static Future<List<Map<String, dynamic>>> depositCollectors() => _run(() async {
        final r = await ApiClient.dio.get('/admin/reports/collector-deposit/collectors');
        return _list(r.data['collectors'] ?? []);
      });

  static Future<Map<String, dynamic>> collectorDeposits({
    int? collectorId,
    String from = '',
    String to = '',
    int page = 1,
    int limit = 30,
  }) =>
      _run(() async {
        final r = await ApiClient.dio.get('/admin/reports/collector-deposit',
            queryParameters: _q({
              'collector_id': collectorId,
              'from_date': from,
              'to_date': to,
              'page': page,
              'limit': limit,
            }));
        return Map<String, dynamic>.from(r.data);
      });

  static Future<Map<String, dynamic>> expenditures({
    String from = '',
    String to = '',
  }) =>
      _run(() async {
        final filtered = from.isNotEmpty || to.isNotEmpty;
        final r = await ApiClient.dio.get('/admin/expenditures',
            queryParameters: _q({
              'date_from': from,
              'date_to': to,
              if (filtered) 'filter': '1',
            }));
        return Map<String, dynamic>.from(r.data);
      });

  /// শুধু Admin (Backend যাচাই করে)
  static Future<void> addExpenditure({
    required int typeId,
    required String name,
    required num amount,
  }) =>
      _run(() async {
        await ApiClient.dio.post('/admin/expenditures',
            data: {'type_id': typeId, 'name': name, 'amount': amount});
      });

}
