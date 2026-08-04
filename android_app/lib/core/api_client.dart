import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../models/models.dart';
import 'app_config.dart';

class ApiException implements Exception {
  final String message;
  final int? statusCode;

  ApiException(this.message, [this.statusCode]);

  @override
  String toString() => message;
}

class ApiClient {
  final AppConfig config;

  ApiClient(this.config);

  String get base => config.api;

  Map<String, String> _headers({bool json = true}) {
    final h = <String, String>{};
    if (json) h['Content-Type'] = 'application/json';
    if (config.token.isNotEmpty) h['Authorization'] = 'Bearer ${config.token}';
    return h;
  }

  Uri _uri(String path, [Map<String, String>? query]) {
    final u = Uri.parse('$base$path');
    if (query == null || query.isEmpty) return u;
    return u.replace(queryParameters: query);
  }

  Future<Map<String, dynamic>> _decode(http.Response resp) async {
    Map<String, dynamic>? body;
    try {
      if (resp.body.isNotEmpty) {
        body = jsonDecode(resp.body) as Map<String, dynamic>;
      }
    } catch (_) {
      body = null;
    }
    if (resp.statusCode >= 400) {
      final msg = body?['error']?.toString() ?? 'HTTP ${resp.statusCode}';
      throw ApiException(msg, resp.statusCode);
    }
    return body ?? {};
  }

  Future<Map<String, dynamic>> get(String path,
      [Map<String, String>? query]) async {
    try {
      final resp = await http
          .get(_uri(path, query), headers: _headers())
          .timeout(const Duration(seconds: 15));
      return await _decode(resp);
    } on SocketException {
      throw ApiException('Нет соединения с сервером');
    } on TimeoutException {
      throw ApiException('Таймаут запроса');
    } on http.ClientException catch (e) {
      throw ApiException(e.message);
    }
  }

  Future<Map<String, dynamic>> post(String path,
      {Map<String, dynamic>? body,
      Map<String, String>? query}) async {
    try {
      final resp = await http
          .post(_uri(path, query),
              headers: _headers(), body: jsonEncode(body ?? {}))
          .timeout(const Duration(seconds: 30));
      return await _decode(resp);
    } on SocketException {
      throw ApiException('Нет соединения с сервером');
    } on TimeoutException {
      throw ApiException('Таймаут запроса');
    } on http.ClientException catch (e) {
      throw ApiException(e.message);
    }
  }

  Future<void> login(String username, String password) async {
    final resp = await http.post(
      Uri.parse('$base/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'username': username, 'password': password}),
    ).timeout(const Duration(seconds: 8));
    Map<String, dynamic>? body;
    try {
      body = jsonDecode(resp.body) as Map<String, dynamic>;
    } catch (_) {}
    if (resp.statusCode >= 400 || body == null || body['token'] == null) {
      throw ApiException(body?['error']?.toString() ?? 'Неверный логин/пароль',
          resp.statusCode);
    }
    await config.save(token: body['token'].toString());
  }

  Future<void> testConnection() async {
    await get('/');
  }

  // Status
  Future<ServerStatus> status() async {
    final r = await get('/status');
    return ServerStatus.fromJson(r);
  }

  // Players
  Future<List<OnlinePlayer>> players() async {
    final r = await get('/players');
    final list = r['players'] as List? ?? [];
    return list
        .map((e) => OnlinePlayer.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Map<String, dynamic>> playerDetail(String steamId) async {
    return await get('/players/$steamId');
  }

  Future<Map<String, dynamic>> playerAction(
      String steamId, String action, Map<String, dynamic>? params) async {
    return await post('/players/action',
        body: {'steamId': steamId, 'action': action, 'params': params ?? {}});
  }

  Future<Map<String, dynamic>> giveCurrency(
      String steamId,
      String currency,
      num amount,
      {String? reason}) async {
    return await post('/players/give-currency',
        body: {
          'steamId': steamId,
          'currency': currency,
          'amount': amount,
          'reason': reason ?? ''
        });
  }

  // RCON
  Future<Map<String, dynamic>> rconStatus() => get('/rcon/status');
  Future<Map<String, dynamic>> rconConnect(
          String host, int port, String password) =>
      post('/rcon/connect', body: {'host': host, 'port': port, 'password': password});
  Future<Map<String, dynamic>> rconDisconnect() => post('/rcon/disconnect');
  Future<String> rconCommand(String command) async {
    final r = await post('/rcon/command', body: {'command': command});
    return r['response']?.toString() ?? '';
  }

  // Packs
  Future<Map<String, dynamic>> packs() => get('/packs');
  Future<Map<String, dynamic>> packsGive(
          String packName, String steamId) =>
      post('/packs/give', body: {'pack': packName, 'steamId': steamId});
  Future<Map<String, dynamic>> packsCooldowns() => get('/packs/cooldowns');
  Future<Map<String, dynamic>> packsResetCooldowns(String steamId) =>
      post('/packs/cooldowns/reset', body: {'steamId': steamId});

  // Items
  Future<List<GameItem>> items() async {
    final r = await get('/items');
    final list = r['items'] as List? ?? r['data'] as List? ?? [];
    return list
        .map((e) => GameItem.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  String itemImageUrl(String id) => '$base/item-image/$id';

  // Generic plugin config GET/POST
  Future<Map<String, dynamic>> pluginGet(String section) =>
      get('/plugins/$section');
  Future<Map<String, dynamic>> pluginPost(
          String section, Map<String, dynamic> body) =>
      post('/plugins/$section', body: body);

  // Teleport
  Future<Map<String, dynamic>> teleport() => get('/plugins/teleport');
  Future<Map<String, dynamic>> teleportSave(Map<String, dynamic> data) =>
      post('/plugins/teleport', body: data);

  // VIP
  Future<Map<String, dynamic>> vip() => get('/plugins/vip');
  Future<Map<String, dynamic>> vipSave(Map<String, dynamic> data) =>
      post('/plugins/vip', body: data);

  // SaveHome
  Future<Map<String, dynamic>> savehome() => get('/plugins/savehome');
  Future<Map<String, dynamic>> savehomeSave(Map<String, dynamic> data) =>
      post('/plugins/savehome', body: data);

  // WARGM
  Future<Map<String, dynamic>> wargmSettings() => get('/wargm/settings');
  Future<Map<String, dynamic>> wargmCards() => get('/wargm/cards');
  Future<Map<String, dynamic>> wargmSaveSettings(Map<String, dynamic> data) =>
      post('/wargm/settings', body: data);
  Future<Map<String, dynamic>> wargmTest(Map<String, dynamic> data) =>
      post('/wargm/test', body: data);
  Future<Map<String, dynamic>> wargmExport() => get('/wargm/export');
  Future<Map<String, dynamic>> wargmImport(Map<String, dynamic> data) =>
      post('/wargm/import', body: data);

  // Airdrop
  Future<Map<String, dynamic>> airdrop() => get('/plugins/airdrop');
  Future<Map<String, dynamic>> airdropSave(Map<String, dynamic> data) =>
      post('/plugins/airdrop', body: data);
  Future<Map<String, dynamic>> airdropDrop(Map<String, dynamic> data) =>
      post('/plugins/airdrop/drop', body: data);

  // Rewards
  Future<Map<String, dynamic>> rewards() => get('/plugins/rewards');
  Future<Map<String, dynamic>> rewardsData() => get('/plugins/rewards/data');
  Future<Map<String, dynamic>> rewardsStatus() => get('/plugins/rewards/status');
  Future<Map<String, dynamic>> rewardsSave(Map<String, dynamic> data) =>
      post('/plugins/rewards', body: data);

  // Rating
  Future<Map<String, dynamic>> leaderboard() => get('/rating/leaderboard');
  Future<Map<String, dynamic>> ratingBlacklist() =>
      get('/plugins/rating/blacklist');
  Future<Map<String, dynamic>> ratingBlacklistSave(Map<String, dynamic> data) =>
      post('/plugins/rating/blacklist', body: data);

  // SCUMDB
  Future<Map<String, dynamic>> scumdbStatus() => get('/scumdb/status');
  Future<Map<String, dynamic>> scumdbPlayers() => get('/scumdb/players');
  Future<Map<String, dynamic>> scumdbSquads() => get('/scumdb/squads');

  // Vehicles / Flags / Items map
  Future<Map<String, dynamic>> vehicles() => get('/vehicles');
  Future<Map<String, dynamic>> flags() => get('/flags');

  // lolka bot
  Future<Map<String, dynamic>> lolkaStatus() => get('/lolkabot/status');
  Future<Map<String, dynamic>> lolkaConfig() => get('/lolkabot/config');
  Future<Map<String, dynamic>> lolkaStart() => post('/lolkabot/start');
  Future<Map<String, dynamic>> lolkaStop() => post('/lolkabot/stop');
  Future<Map<String, dynamic>> lolkaSaveConfig(Map<String, dynamic> data) =>
      post('/lolkabot/config', body: data);

  // Update
  Future<Map<String, dynamic>> updateServer() => post('/update');
  Future<Map<String, dynamic>> updateManual() => post('/update-manual');
  Future<Map<String, dynamic>> appVersion() => get('/app/version');

  // Server control
  Future<Map<String, dynamic>> serverStart() => post('/start');
  Future<Map<String, dynamic>> serverStop() => post('/stop');
  Future<Map<String, dynamic>> serverRestart() => post('/restart');
}
