import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../models/models.dart';
import '../state/session_state.dart';
import '../theme/app_theme.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  ServerStatus? _status;
  String? _error;
  late final ApiClient _api;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _api = context.read<SessionState>().api;
    _load();
    _timer = Timer.periodic(const Duration(seconds: 3), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final s = await _api.status();
      if (mounted) setState(() {
        _status = s;
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _action(Future<Map<String, dynamic>> Function() fn) async {
    try {
      await fn();
      _snack('Команда выполнена');
      await _load();
    } on ApiException catch (e) {
      _snack(e.message);
    }
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final status = _status;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null)
            Card(
              child: ListTile(
                leading: const Icon(Icons.error_outline,
                    color: AppTheme.danger),
                title: Text(_error!, style: const TextStyle(color: AppTheme.danger)),
              ),
            ),
          if (status == null && _error == null)
            const Padding(
              padding: EdgeInsets.all(40),
              child: Center(child: CircularProgressIndicator()),
            ),
          if (status != null) ...[
            _statusCard(status),
            const SizedBox(height: 16),
            _controlButtons(status.running),
          ],
        ],
      ),
    );
  }

  Widget _statusCard(ServerStatus s) {
    final running = s.running;
    return Column(
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Сервер',
                        style: TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 16)),
                    _badge(running ? 'ЗАПУЩЕН' : 'ОСТАНОВЛЕН',
                        running ? AppTheme.success : AppTheme.danger),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _stat('Игроки', '${s.players}/${s.maxPlayers}'),
                    _stat('Аптайм', s.uptimeText),
                    _stat('FPS', '${s.fps}'),
                  ],
                ),
                if (running) ...[
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _stat('RAM', '${s.memoryMb} МБ'),
                      _stat('CPU', '${s.cpuPercent.toStringAsFixed(1)}%'),
                      _stat('PID', '${s.pid}'),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _stat(String label, String value) {
    return Column(
      children: [
        Text(value,
            style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: AppTheme.accent)),
        const SizedBox(height: 4),
        Text(label,
            style: const TextStyle(color: AppTheme.textMuted, fontSize: 12)),
      ],
    );
  }

  Widget _badge(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(text,
          style: TextStyle(
              color: color, fontWeight: FontWeight.w700, fontSize: 12)),
    );
  }

  Widget _controlButtons(bool running) {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _button(
                icon: Icons.play_arrow,
                label: 'Старт',
                color: running ? null : AppTheme.success,
                onTap: running ? null : () => _control('start'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _button(
                icon: Icons.stop,
                label: 'Стоп',
                color: running ? AppTheme.danger : null,
                onTap: running ? () => _stopConfirm() : null,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _button(
                icon: Icons.replay,
                label: 'Рестарт',
                color: null,
                onTap: running ? () => _restartConfirm() : null,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _button(
                icon: Icons.refresh,
                label: 'Обновить',
                color: AppTheme.accent,
                onTap: _load,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _button(
      {required IconData icon,
      required String label,
      Color? color,
      required Future<void> Function()? onTap}) {
    final enabled = onTap != null;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: enabled ? onTap : null,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Column(
            children: [
              Icon(icon,
                  color: enabled
                      ? (color ?? AppTheme.textMuted)
                      : AppTheme.textMuted.withValues(alpha: 0.3)),
              const SizedBox(height: 4),
              Text(label,
                  style: TextStyle(
                      color: enabled
                          ? (color ?? AppTheme.text)
                          : AppTheme.textMuted.withValues(alpha: 0.3),
                      fontSize: 12)),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _control(String a) async {
    switch (a) {
      case 'start':
        await _action(_api.serverStart);
        break;
      case 'stop':
        await _action(_api.serverStop);
        break;
      case 'restart':
        await _action(_api.serverRestart);
        break;
    }
  }

  Future<void> _stopConfirm() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: const Text('Остановить сервер?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Отмена')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Стоп',
                  style: TextStyle(color: AppTheme.danger))),
        ],
      ),
    );
    if (ok == true) await _control('stop');
  }

  Future<void> _restartConfirm() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: const Text('Перезапустить сервер?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Отмена')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Рестарт')),
        ],
      ),
    );
    if (ok == true) await _control('restart');
  }
}
