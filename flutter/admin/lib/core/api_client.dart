import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Mobile Bearer-token client: Access Token + Refresh Token rotation.
/// Token রাখা হয় Keystore/Keychain-এ। Password কখনো সংরক্ষণ করা হয় না।
class ApiClient {
 static const String baseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://amaderbill.com/api/mobile',
);

  static const _accessKey = 'm_access';
  static const _refreshKey = 'm_refresh';
  static const _nameKey = 'm_name';
  static const _rememberKey = 'm_remember_me';
  static const _rememberUsernameKey = 'm_remember_username';

  static Future<bool> getRememberMe() async {
    return await _secure.read(key: _rememberKey) == 'true';
  }

  static Future<String?> getRememberedUsername() =>
      _secure.read(key: _rememberUsernameKey);

  static Future<void> saveRememberMe(bool enabled, String username) async {
    if (enabled) {
      await _secure.write(key: _rememberKey, value: 'true');
      await _secure.write(key: _rememberUsernameKey, value: username);
    } else {
      await _secure.delete(key: _rememberKey);
      await _secure.delete(key: _rememberUsernameKey);
    }
  }

  static const _profileKey = 'm_admin_profile';
  static const _permissionsKey = 'm_admin_permissions';

  static const _secure = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  /// Session শেষ হলে UI যেন Login-এ ফেরে।
  static void Function()? onSessionExpired;

  static final Dio dio = _create();

  static final Dio _bare = Dio(
    BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: {'Content-Type': 'application/json'},
    ),
  );

  static Future<bool>? _refreshing;

  static Dio _create() {
    final d = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
        headers: {'Content-Type': 'application/json'},
      ),
    );

    d.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final t = await _secure.read(key: _accessKey);
          if (t != null) {
            options.headers['Authorization'] = 'Bearer $t';
          }
          handler.next(options);
        },
        onError: (e, handler) async {
          final status = e.response?.statusCode;
          final retried = e.requestOptions.extra['retried'] == true;

          if (status == 401 && !retried) {
            final ok = await (_refreshing ??=
                _refresh().whenComplete(() => _refreshing = null));

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
      ),
    );

    return d;
  }

  static Future<bool> _refresh() async {
    final rt = await _secure.read(key: _refreshKey);
    if (rt == null) return false;

    try {
      final r = await _bare.post(
        '/auth/admin/refresh',
        data: {'refresh_token': rt},
      );

      await saveTokens(
        '${r.data['access_token']}',
        '${r.data['refresh_token']}',
      );

      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<void> saveTokens(String access, String refresh) async {
    await _secure.write(key: _accessKey, value: access);
    await _secure.write(key: _refreshKey, value: refresh);
  }

  static Future<void> saveName(String name) =>
      _secure.write(key: _nameKey, value: name);

  /// Admin user profile সংরক্ষণ।
  static Future<void> saveProfile(Map<String, dynamic> profile) async {
    await _secure.write(
      key: _profileKey,
      value: jsonEncode(profile),
    );

    final name = profile['fullname'] ?? profile['name'] ?? '';
    await saveName(name.toString());
  }

  /// সংরক্ষিত Admin profile পড়া।
  static Future<Map<String, dynamic>?> getProfile() async {
    final value = await _secure.read(key: _profileKey);
    if (value == null || value.isEmpty) return null;

    try {
      return Map<String, dynamic>.from(jsonDecode(value) as Map);
    } catch (_) {
      return null;
    }
  }

  /// Admin permission response সংরক্ষণ।
  static Future<void> savePermissions(
    Map<String, dynamic> permissions,
  ) async {
    await _secure.write(
      key: _permissionsKey,
      value: jsonEncode(permissions),
    );
  }

  /// সংরক্ষিত permission response পড়া।
  static Future<Map<String, dynamic>?> getPermissions() async {
    final value = await _secure.read(key: _permissionsKey);
    if (value == null || value.isEmpty) return null;

    try {
      return Map<String, dynamic>.from(jsonDecode(value) as Map);
    } catch (_) {
      return null;
    }
  }

  static Future<bool> hasSession() async =>
      (await _secure.read(key: _refreshKey)) != null;

  static Future<String?> getRefreshToken() => _secure.read(key: _refreshKey);

  /// Logout বা Session expiry হলে সম্পূর্ণ Admin session পরিষ্কার।
  static Future<void> clearSession() async {
    await _secure.delete(key: _accessKey);
    await _secure.delete(key: _refreshKey);
    await _secure.delete(key: _nameKey);
    await _secure.delete(key: _profileKey);
    await _secure.delete(key: _permissionsKey);
  }
}
