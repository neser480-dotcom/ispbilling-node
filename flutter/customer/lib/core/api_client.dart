import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Customer Bearer-token client (Access + rotating Refresh Token)।
/// Token Keystore/Keychain-এ; Password কোথাও সংরক্ষণ হয় না।
class ApiClient {

 static const String baseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://127.0.0.1:5500/api/mobile',
);
  /// ঐচ্ছিক: শুধু একটি ISP-র অ্যাপ বানালে  flutter build apk --dart-define=ISP_CODE=ISP-10033
  static const String defaultIspCode = String.fromEnvironment('ISP_CODE');

  static const _accessKey = 'c_access';
  static const _refreshKey = 'c_refresh';
  static const _nameKey = 'c_name';
  static const _idKey = 'c_customer_id';
  static const _secure = FlutterSecureStorage(
      aOptions: AndroidOptions(encryptedSharedPreferences: true));

  static void Function()? onSessionExpired;

  static final Dio dio = _create();
  static final Dio _bare = Dio(BaseOptions(
    baseUrl: baseUrl,
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 15),
    headers: {'Content-Type': 'application/json'},
  ));

  static Future<bool>? _refreshing;

  static Dio _create() {
    final d = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: {'Content-Type': 'application/json'},
    ));
    d.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final t = await _secure.read(key: _accessKey);
        if (t != null) options.headers['Authorization'] = 'Bearer $t';
        handler.next(options);
      },
      onError: (e, handler) async {
        final status = e.response?.statusCode;
        final retried = e.requestOptions.extra['retried'] == true;
        if (status == 401 && !retried) {
          final ok = await (_refreshing ??= _refresh().whenComplete(() => _refreshing = null));
          if (ok) {
            final o = e.requestOptions..extra['retried'] = true;
            final t = await _secure.read(key: _accessKey);
            o.headers['Authorization'] = 'Bearer $t';
            try {
              return handler.resolve(await d.fetch(o));
            } on DioException catch (e2) {
              return handler.next(e2);
            }
          }
          await clearSession();
          onSessionExpired?.call();
        }
        handler.next(e);
      },
    ));
    return d;
  }

  static Future<bool> _refresh() async {
    final rt = await _secure.read(key: _refreshKey);
    if (rt == null) return false;
    try {
      final r = await _bare.post('/auth/customer/refresh', data: {'refresh_token': rt});
      await saveTokens('${r.data['access_token']}', '${r.data['refresh_token']}');
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<void> saveTokens(String access, String refresh) async {
    await _secure.write(key: _accessKey, value: access);
    await _secure.write(key: _refreshKey, value: refresh);
  }

  static Future<void> saveUser(String name, String customerId) async {
    await _secure.write(key: _nameKey, value: name);
    await _secure.write(key: _idKey, value: customerId);
  }

  static Future<bool> hasSession() async => (await _secure.read(key: _refreshKey)) != null;

  static Future<String?> getRefreshToken() => _secure.read(key: _refreshKey);

  static Future<Map<String, String>> getUser() async => {
        'name': await _secure.read(key: _nameKey) ?? '',
        'phone': await _secure.read(key: _idKey) ?? '', // পুরনো কী; এখন Customer ID
      };

  /// শুধু নিজের Token মোছে (অন্য Preference অক্ষত)
  static Future<void> clearSession() async {
    for (final k in [_accessKey, _refreshKey, _nameKey, _idKey]) {
      await _secure.delete(key: k);
    }
  }
}
