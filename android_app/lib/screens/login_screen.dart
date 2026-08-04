import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/session_state.dart';
import '../theme/app_theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _urlCtrl = TextEditingController();
  final _userCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final s = context.read<SessionState>();
    _urlCtrl.text = s.config.baseUrl;
    _userCtrl.text = s.config.username;
    _passCtrl.text = s.config.password;
  }

  @override
  void dispose() {
    _urlCtrl.dispose();
    _userCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final url = _urlCtrl.text.trim();
    final user = _userCtrl.text.trim();
    final pass = _passCtrl.text;
    if (url.isEmpty || user.isEmpty || pass.isEmpty) {
      _snack('Заполните все поля');
      return;
    }
    setState(() => _busy = true);
    final session = context.read<SessionState>();
    bool ok;
    try {
      ok = await session.login(url, user, pass);
    } catch (e) {
      ok = false;
      _snack('Ошибка: $e');
    }
    if (!mounted) return;
    setState(() => _busy = false);
    if (!ok) {
      _snack(session.error ?? 'Ошибка входа');
    }
  }

  void _snack(String msg) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(Icons.dns, size: 64, color: AppTheme.accent),
                const SizedBox(height: 8),
                const Text(
                  'SCUM Server Manager',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.text),
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: _urlCtrl,
                  keyboardType: TextInputType.url,
                  decoration: const InputDecoration(
                    labelText: 'Адрес панели',
                    hintText: 'http://192.168.1.10:8080',
                    prefixIcon: Icon(Icons.link),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _userCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Логин',
                    prefixIcon: Icon(Icons.person),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _passCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Пароль',
                    prefixIcon: Icon(Icons.lock),
                  ),
                ),
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: _busy ? null : _login,
                  child: _busy
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Войти'),
                ),
                const SizedBox(height: 12),
                Text(
                  'Приложение подключается к веб-панели '
                  'скандал-сервера SCUM. Убедитесь, что панель включена '
                  'и порт проброшен.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppTheme.textMuted, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}