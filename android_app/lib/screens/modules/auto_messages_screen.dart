import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../state/session_state.dart';
import '../../theme/app_theme.dart';

/// Auto-messages: editable list of periodic chat messages.
class AutoMessagesScreen extends StatefulWidget {
  const AutoMessagesScreen({super.key});

  @override
  State<AutoMessagesScreen> createState() => _AutoMessagesScreenState();
}

class _AutoMessagesScreenState extends State<AutoMessagesScreen> {
  List<dynamic> _msgs = [];
  bool _loading = true;
  String? _error;
  late final ApiClient _api;
  late final TextEditingController _interval;

  @override
  void initState() {
    super.initState();
    _api = context.read<SessionState>().api;
    _interval = TextEditingController(text: '600');
    _load();
  }

  @override
  void dispose() {
    _interval.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final r = await _api.pluginGet('auto-messages');
      if (!mounted) return;
      final messages = r['messages'] ?? r['autoMessages'] ?? [];
      setState(() {
        _msgs = messages is List ? messages : [];
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

String _text(dynamic m) {
    if (m is String) return m;
    if (m is Map) {
      return (m['message'] ?? m['text'] ?? m['content'] ?? '').toString();
    }
    return m.toString();
  }

  void _snack(String s) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(s)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Авто-сообщения')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!,
                  style: const TextStyle(color: AppTheme.danger)))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    if (_msgs.isEmpty)
                      const Padding(
                        padding: EdgeInsets.all(40),
                        child: Text('Нет сообщений',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: AppTheme.textMuted)),
                      ),
                    for (final m in _msgs)
                      Card(
                        child: ListTile(
                          title: Text(_text(m)),
                          subtitle: m is Map
                              ? Text(
                                  'Отправляет интервал: ${m['interval'] ?? _interval.text}с',
                                  style: const TextStyle(
                                      color: AppTheme.textMuted, fontSize: 12))
                              : null,
                          trailing: Switch(
                            value: (m is Map && m['enabled'] == true),
                            onChanged: (on) =>
                                m is Map ? _changeEnabled(m, on) : _snack('Нет ID'),
                          ),
                        ),
                      ),
                    const SizedBox(height: 16),
                    const Text('Для управления отправляйте изменения '
                        'через настройки панели приложения.',
                        style: TextStyle(color: AppTheme.textMuted, fontSize: 12)),
                  ],
                ),
    );
  }

  void _changeEnabled(dynamic m, bool on) {
    final id = m['id'];
    if (id == null) {
      _snack('Нет ID у сообщения');
      return;
    }
    _api
        .pluginPost('auto-messages', {'action': on ? 'enable' : 'disable', 'id': id})
        .then((_) => _load())
        .catchError((e) => _snack('$e'));
  }
}