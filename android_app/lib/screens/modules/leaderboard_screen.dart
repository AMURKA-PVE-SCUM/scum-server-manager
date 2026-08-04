import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../state/session_state.dart';
import '../../theme/app_theme.dart';

class LeaderboardScreen extends StatefulWidget {
  const LeaderboardScreen({super.key});

  @override
  State<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends State<LeaderboardScreen> {
  List<dynamic> _board = [];
  bool _loading = true;
  String? _error;
  late final ApiClient _api;

  @override
  void initState() {
    super.initState();
    _api = context.read<SessionState>().api;
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final r = await _api.leaderboard();
      if (!mounted) return;
      final list = (r['leaderboard'] ?? r['players'] ?? []) as List;
      setState(() {
        _board = list;
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Р РµР№С‚РёРЅРі')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!,
                  style: const TextStyle(color: AppTheme.danger)))
              : _board.isEmpty
                  ? const Center(
                      child: Text('Р РµР№С‚РёРЅРі РїСѓСЃС‚',
                          style: TextStyle(color: AppTheme.textMuted)))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _board.length,
                        itemBuilder: (ctx, i) {
                          final e = _board[i];
                          final rank = i + 1;
                          final name = e is Map
                              ? (e['name'] ?? e['playerName'] ?? '?').toString()
                              : '?';
                          final money = e is Map ? e['money'] : null;
                          return Card(
                            child: ListTile(
                              leading: CircleAvatar(
                                backgroundColor:
                                    AppTheme.accent.withValues(alpha: 0.15),
                                child: Text('$rank',
                                    style: const TextStyle(
                                        color: AppTheme.accent,
                                        fontWeight: FontWeight.w700)),
                              ),
                              title: Text(name),
                              trailing: money != null
                                  ? Text('\$$money',
                                      style: const TextStyle(
                                          color: AppTheme.success,
                                          fontWeight: FontWeight.w600))
                                  : null,
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
