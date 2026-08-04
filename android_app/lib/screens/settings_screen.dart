import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../state/session_state.dart';
import '../theme/app_theme.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _url;
  late final TextEditingController _user;
  late final TextEditingController _pass;

  @override
  void initState() {
    super.initState();
    final cfg = context.read<SessionState>().config;
    _url = TextEditingController(text: cfg.baseUrl);
    _user = TextEditingController(text: cfg.username);
    _pass = TextEditingController(text: cfg.password);
  }

  @override
  void dispose() {
    _url.dispose();
    _user.dispose();
    _pass.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final session = context.read<SessionState>();
    await session.config.save(
      baseUrl: _url.text.trim(),
      username: _user.text.trim(),
      password: _pass.text,
    );
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Настройки сохранены')));
    }
  }

  Future<void> _test() async {
    final session = context.read<SessionState>();
    await session.config.save(baseUrl: _url.text.trim());
    final api = ApiClient(session.config);
    try {
      await api.testConnection();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Соединение OK')));
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
      appBar: AppBar(title: const Text('Настройки подключения')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Адрес панели (http://host:port)',
              style: TextStyle(color: AppTheme.textMuted)),
          const SizedBox(height: 6),
          TextField(
            controller: _url,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(hintText: 'http://192.168.1.10:8080'),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _user,
            decoration: const InputDecoration(labelText: 'Логин'),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _pass,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'Пароль'),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: ElevatedButton(
                  onPressed: _save,
                  child: const Text('Сохранить'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton(
                  onPressed: _test,
                  style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.accent),
                  child: const Text('Проверить'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}