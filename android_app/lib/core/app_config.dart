import 'package:shared_preferences/shared_preferences.dart';

class AppConfig {
  static const _kBaseUrl = 'baseUrl';
  static const _kUsername = 'username';
  static const _kPassword = 'password';
  static const _kToken = 'token';

  String baseUrl = '';
  String username = '';
  String password = '';
  String token = '';

  bool get hasSession => baseUrl.isNotEmpty && token.isNotEmpty;

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    baseUrl = p.getString(_kBaseUrl) ?? '';
    username = p.getString(_kUsername) ?? '';
    password = p.getString(_kPassword) ?? '';
    token = p.getString(_kToken) ?? '';
  }

  Future<void> save({
    String? baseUrl,
    String? username,
    String? password,
    String? token,
  }) async {
    final p = await SharedPreferences.getInstance();
    if (baseUrl != null) {
      this.baseUrl = baseUrl;
      await p.setString(_kBaseUrl, baseUrl);
    }
    if (username != null) {
      this.username = username;
      await p.setString(_kUsername, username);
    }
    if (password != null) {
      this.password = password;
      await p.setString(_kPassword, password);
    }
    if (token != null) {
      this.token = token;
      await p.setString(_kToken, token);
    }
  }

  Future<void> clearSession() async {
    token = '';
    final p = await SharedPreferences.getInstance();
    await p.remove(_kToken);
  }

  String get api {
    var base = baseUrl.endsWith('/')
        ? baseUrl.substring(0, baseUrl.length - 1)
        : baseUrl;
    if (base.endsWith('/api')) return base;
    if (base.endsWith('/api/')) return base.substring(0, base.length - 1);
    return '$base/api';
  }
}