import 'package:flutter/foundation.dart';

import '../core/api_client.dart';
import '../core/app_config.dart';

class SessionState extends ChangeNotifier {
  final AppConfig config;
  late ApiClient api;

  bool _initializing = true;
  bool _authenticated = false;
  String? _error;

  SessionState() : config = AppConfig() {
    api = ApiClient(config);
  }

  bool get authenticating => _initializing;
  bool get authenticated => _authenticated && !_initializing;
  String? get error => _error;

  Future<void> initialize() async {
    await config.load();
    _initializing = false;
    if (config.hasSession) {
      _authenticated = true;
    }
    notifyListeners();
  }

  Future<bool> login(String baseUrl, String username, String password) async {
    _error = null;
    notifyListeners();

    // Normalize base URL: add scheme if missing, strip trailing slash.
    var url = baseUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://$url';
    }
    while (url.endsWith('/')) {
      url = url.substring(0, url.length - 1);
    }

    await config.save(baseUrl: url, username: username, password: password);
    // Re-point api client to new base
    api = ApiClient(config);

    try {
      await api.login(username, password);
      _authenticated = true;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _error = e.message;
      _authenticated = false;
      notifyListeners();
      return false;
    } catch (e) {
      _error = e.toString();
      _authenticated = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    await config.clearSession();
    _authenticated = false;
    _error = null;
    notifyListeners();
  }
}