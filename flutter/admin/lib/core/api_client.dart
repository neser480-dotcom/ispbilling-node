import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Mobile Bearer-token client: Access Token (স্বল্পমেয়াদি) + Refresh Token (rotation)।
/// Token রাখা হয় Keystore/Keychain-এ। Password কখনো সংরক্ষণ করা হয় না।
class ApiClient {
  // TODO: নিজের সার্ভার। Emulator: http://10.0.2.2:5500/api/mobile  (Production এ অবশ্যই https)
  static const String baseUrl = 'https://amaderbill.com/api/mobile';

  static const _accessKey = 'm_access';
  static const _refreshKey = 'm_refresh';
  static const _nameKey = 'm_name';
  static const _secure = FlutterSecureStorage(
      aOptions: AndroidOptions(encryptedSharedPreferences: true));

  /// Session শেষ হলে UI যেন Login-এ ফেরে (main.dart এ সেট হয়)
  static void Function()? onSessionExpired;

  static final Dio dio = _create();
  static final Dio _bare = Dio(BaseOptions(
    baseUrl: baseUrl,
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 15),
    headers: {'Content-Type': 'application/json'},
  ));

  static Future<bool>? _refreshing; // একসাথে একটাই refresh

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
      final r = await _bare.post('/auth/admin/refresh', data: {'refresh_token': rt});
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

  static Future<void> saveName(String name) => _secure.write(key: _nameKey, value: name);

  static Future<bool> hasSession() async => (await _secure.read(key: _refreshKey)) != null;

  static Future<String?> getRefreshToken() => _secure.read(key: _refreshKey);

  static Future<void> clearSession() async {
    await _secure.delete(key: _accessKey);
    await _secure.delete(key: _refreshKey);
    await _secure.delete(key: _nameKey);
  }
}
