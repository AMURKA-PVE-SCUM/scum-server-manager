import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../state/session_state.dart';
import '../../theme/app_theme.dart';

class ScumdbScreen extends StatefulWidget {
  const ScumdbScreen({super.key});

  @override
  State<ScumdbScreen> createState() => _ScumdbScreenState();
}

enum _Tab { players, squads, vehicles, flags }

class _ScumdbScreenState extends State<ScumdbScreen>
    with SingleTickerProviderStateMixin {
  _Tab _tab = _Tab.players;
  late final ApiClient _api;
  late final TabController _tabController;
  bool _loading = true;
  String? _error;
  List<dynamic> _players = [];
  List<dynamic> _squads = [];
  List<dynamic> _vehicles = [];
  List<dynamic> _flags = [];
  String? _dbStatus;

  @override
  void initState() {
    super.initState();
    _api = context.read<SessionState>().api;
    _tabController =
        TabController(length: _Tab.values.length, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final dbS = await _api.scumdbStatus();
      _dbStatus = dbS.toString();
      _players = (await _scumdbList(_api.scumdbPlayers()));
      _squads = (await _scumdbList(_api.scumdbSquads()));
      final v = await _api.vehicles();
      _vehicles = (v['vehicles'] ?? []) as List;
      final f = await _api.flags();
      _flags = (f['flags'] ?? []) as List;
      if (mounted) {
        setState(() => _loading = false);
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _loading = false;
        });
      }
    }
  }

  Future<List<dynamic>> _scumdbList(Future<Map<String, dynamic>> fn) async {
    final r = await fn;
    final list = r['squads'] ?? r['data'] ?? r['players'];
    if (list == null) return const [];
    return (list as List);
  }

  String _label(dynamic e) {
    if (e is Map) {
      return (e['name'] ?? e['title'] ?? e['Id'] ?? '').toString();
    }
    return e.toString();
  }

  @override
  Widget build(BuildContext context) {
    final list = switch (_tab) {
      _Tab.players => _players,
      _Tab.squads => _squads,
      _Tab.vehicles => _vehicles,
      _Tab.flags => _flags,
    };

    return Scaffold(
      appBar: AppBar(
        title: const Text('SCUMDB'),
        bottom: TabBar(
          controller: _tabController,
          onTap: (i) => setState(() => _tab = _Tab.values[i]),
          tabs: const [
            Tab(text: 'Игроки'),
            Tab(text: 'Сквады'),
            Tab(text: 'Транспорт'),
            Tab(text: 'Флаги'),
          ],
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!,
                  style: const TextStyle(color: AppTheme.danger)))
              : Column(
                  children: [
                    if (_dbStatus != null)
                      Container(
                        width: double.infinity,
                        color: AppTheme.surface,
                        padding: const EdgeInsets.all(8),
                        child: Text('Статус БД: $_dbStatus',
                            style: const TextStyle(fontSize: 12)),
                      ),
                    Expanded(
                      child: list.isEmpty
                          ? Center(
                              child: Text('Пусто',
                                  style: TextStyle(
                                      color: AppTheme.textMuted)))
                          : ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: list.length,
                              itemBuilder: (ctx, i) {
                                final e = list[i];
                                return Card(
                                  child: ListTile(
                                    leading: const Icon(
                                        Icons.person_pin,
                                        color: AppTheme.accent),
                                    title: Text(_label(e)),
                                  ),
                                );
                              },
                            ),
                    ),
                  ],
                ),
    );
  }
}