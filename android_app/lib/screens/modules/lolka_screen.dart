import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../state/session_state.dart';
import '../../theme/app_theme.dart';

class LolkaScreen extends StatefulWidget {
  const LolkaScreen({super.key});

  @override
  State<LolkaScreen> createState() => _LolkaScreenState();
}

class _LolkaScreenState extends State<LolkaScreen> {
  late final ApiClient _api;
  bool _running = false;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _api = context.read<SessionState>().api;
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final s = await _api.lolkaStatus();
      if (!mounted) return;
      setState(() {
        _running = s['running'] == true;
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

  Future<void> _action(bool start) async {
    try {
      if (start) {
        await _api.lolkaStart();
      } else {
        await _api.lolkaStop();
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(start ? 'Бот запущен' : 'Бот остановлен')));
        await _load();
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Бот')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!,
                  style: const TextStyle(color: AppTheme.danger)))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Card(
                      child: ListTile(
                        leading: Icon(Icons.smart_toy,
                            color: _running
                                ? AppTheme.success
                                : AppTheme.textMuted),
                        title: Text(_running ? 'Бот запущен' : 'Бот остановлен'),
                        trailing: Switch(
                          value: _running,
                          onChanged: (on) => _action(on),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: () => _showConfig(),
                      child: const Text('Конфигурация'),
                    ),
                  ],
                ),
    );
  }

  Future<void> _showConfig() async {
    try {
      final c = await _api.lolkaConfig();
      if (!mounted) return;
      showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: AppTheme.surface,
          title: const Text('Конфигурация бота'),
          content: SelectableText(
            _formatConfig(c),
            style: const TextStyle(
                fontSize: 12, fontFamily: 'Consolas, monospace'),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('OK')),
          ],
        ),
      );
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  String _formatConfig(Map<String, dynamic> c) {
    final sb = StringBuffer();
    c.forEach((k, v) => sb.writeln('$k: $v'));
    return sb.toString();
  }
}