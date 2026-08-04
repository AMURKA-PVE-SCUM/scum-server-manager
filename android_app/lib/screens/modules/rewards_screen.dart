import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../state/session_state.dart';
import '../../theme/app_theme.dart';

class RewardsScreen extends StatefulWidget {
  const RewardsScreen({super.key});

  @override
  State<RewardsScreen> createState() => _RewardsScreenState();
}

class _RewardsScreenState extends State<RewardsScreen> {
  bool _loading = true;
  String? _error;
  late final ApiClient _api;
  Map<String, dynamic>? _config;
  List<dynamic> _data = [];

  @override
  void initState() {
    super.initState();
    _api = context.read<SessionState>().api;
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final c = await _api.rewards();
      List<dynamic> data = [];
      try {
        final d = await _api.rewardsData();
        data = (d['data'] ?? []) as List;
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _config = c;
        _data = data;
        _loading = false;
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _loading = false;
        });
      }
    }
  }

  String _title(dynamic e) {
    if (e is Map) {
      final t = e['title'] ?? e['name'] ?? e['rewardName'];
      if (t != null) return t.toString();
      return (e.length > 0 ? e.entries.first.value : '').toString();
    }
    return e.toString();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Награды')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!,
                  style: const TextStyle(color: AppTheme.danger)))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    if (_config != null)
                      Card(
                        child: ListTile(
                          leading: const Icon(Icons.tune,
                              color: AppTheme.accent),
                          title: const Text('Конфигурация наград'),
                          subtitle: const Text(
                              'Настройте через панель приложения.'),
                        ),
                      ),
                    if (_data.isEmpty)
                      const Padding(
                        padding: EdgeInsets.all(40),
                        child: Text('Нет данных',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: AppTheme.textMuted)),
                      ),
                    for (final e in _data)
                      Card(
                        child: ListTile(
                          leading: const Icon(Icons.card_giftcard,
                              color: AppTheme.warning),
                          title: Text(_title(e)),
                          subtitle: Text(e is Map
                              ? (e['type'] ?? e['kind'] ?? '') .toString()
                              : ''),
                        ),
                      ),
                  ],
                ),
    );
  }
}