import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../models/models.dart';
import '../state/session_state.dart';
import '../theme/app_theme.dart';

class PlayersScreen extends StatefulWidget {
  const PlayersScreen({super.key});

  @override
  State<PlayersScreen> createState() => _PlayersScreenState();
}

class _PlayersScreenState extends State<PlayersScreen> {
  List<OnlinePlayer> _players = [];
  String? _error;
  bool _loading = true;
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
      final p = await _api.players();
      if (mounted) setState(() {
        _players = p;
        _error = null;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: _loading && _players.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_error != null)
                  Card(
                    child: ListTile(
                        leading: const Icon(Icons.error_outline,
                            color: AppTheme.danger),
                        title: Text(_error!,
                            style: const TextStyle(color: AppTheme.danger))),
                  ),
                if (!_loading && _players.isEmpty && _error == null)
                  const Padding(
                    padding: EdgeInsets.all(40),
                    child: Text('Никого не онлайн',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppTheme.textMuted)),
                  ),
                for (final p in _players) _playerTile(p),
              ],
            ),
    );
  }

  Widget _playerTile(OnlinePlayer p) {
    final dur = Duration(seconds: p.duration);
    final hours = dur.inHours;
    final mins = dur.inMinutes % 60;
    return Card(
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: AppTheme.accent.withValues(alpha: 0.15),
          child: Text(p.name.isNotEmpty ? p.name[0] : '?',
              style: const TextStyle(color: AppTheme.accent)),
        ),
        title: Text(p.name),
        subtitle: Text(
          '${p.steamId} • онлайн ${hours}ч ${mins}м'
          '${p.location != null ? ' • ${p.location}' : ''}',
          style: const TextStyle(color: AppTheme.textMuted),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: p.balance != null
            ? Text('\$${p.balance}',
                style: const TextStyle(
                    color: AppTheme.success, fontWeight: FontWeight.w600))
            : null,
        onTap: () => showPlayerSheet(p),
      ),
    );
  }

  void showPlayerSheet(OnlinePlayer p) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.surface,
      isScrollControlled: true,
      builder: (ctx) => _PlayerDetailSheet(player: p, api: _api),
    );
  }
}

class _PlayerDetailSheet extends StatefulWidget {
  final OnlinePlayer player;
  final ApiClient api;
  const _PlayerDetailSheet({required this.player, required this.api});

  @override
  State<_PlayerDetailSheet> createState() => _PlayerDetailSheetState();
}

class _PlayerDetailSheetState extends State<_PlayerDetailSheet> {
  Map<String, dynamic>? _detail;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _loadDetail();
  }

  Future<void> _loadDetail() async {
    try {
      final d = await widget.api.playerDetail(widget.player.steamId);
      if (mounted) setState(() => _detail = d);
    } catch (_) {}
  }

  Future<void> _action(String action, {Map<String, dynamic>? params}) async {
    setState(() => _busy = true);
    try {
      await widget.api.playerAction(widget.player.steamId, action, params);
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Действие: $action')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.player;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      maxChildSize: 0.9,
      builder: (ctx, scrollCtrl) => Container(
        padding: const EdgeInsets.all(16),
        child: ListView(
          controller: scrollCtrl,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: AppTheme.accent.withValues(alpha: 0.15),
                  child: Text(p.name.isNotEmpty ? p.name[0] : '?',
                      style: const TextStyle(color: AppTheme.accent)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(p.name,
                          style: const TextStyle(
                              fontSize: 18, fontWeight: FontWeight.w700)),
                      Text(p.steamId,
                          style: const TextStyle(
                              color: AppTheme.textMuted, fontSize: 12)),
                    ],
                  ),
                ),
              ],
            ),
            const Divider(height: 32),
            _row('Баланс', p.balance?.toString() ?? '—'),
            _row('Золото', p.gold?.toString() ?? '—'),
            _row('Слава', p.fame?.toString() ?? '—'),
            _row('Локация', p.location ?? '—'),
            _row('Подключён', p.connectedAt ?? '—'),
            if (_detail != null) ...[
              const Divider(height: 32),
              _row('Экип', _detail!['equipment']?.toString() ?? '—'),
            ],
            const SizedBox(height: 24),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _actionBtn('Кик', Colors.orange,
                    () => _do('kick')),
                _actionBtn('Бан', AppTheme.danger,
                    () => _do('ban')),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _row(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(k, style: const TextStyle(color: AppTheme.textMuted)),
          Text(v,
              style: const TextStyle(
                  color: AppTheme.text, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }

  Widget _actionBtn(String label, Color color, VoidCallback onTap) {
    return OutlinedButton.icon(
      onPressed: _busy ? null : onTap,
      style: OutlinedButton.styleFrom(foregroundColor: color),
      icon: const Icon(Icons.play_arrow),
      label: Text(label),
    );
  }

  Future<void> _do(String a) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: Text('${a == 'kick' ? 'Кикнуть' : 'Забанить'} ${widget.player.name}?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Отмена')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(a == 'kick' ? 'Кик' : 'Бан')),
        ],
      ),
    );
    if (ok == true) await _action(a);
  }
}
