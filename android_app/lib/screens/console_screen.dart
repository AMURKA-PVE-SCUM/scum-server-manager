import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/sse_client.dart';
import '../state/session_state.dart';
import '../theme/app_theme.dart';

class ConsoleScreen extends StatefulWidget {
  const ConsoleScreen({super.key});

  @override
  State<ConsoleScreen> createState() => _ConsoleScreenState();
}

class _ConsoleScreenState extends State<ConsoleScreen> {
  final _lines = <String>[];
  final _scroll = ScrollController();
  final _cmd = TextEditingController();
  ConsoleStream? _stream;
  late final ApiClient _api;
  String? _error;
  bool _connected = false;
  bool _rcon = false;

  @override
  void initState() {
    super.initState();
    _api = context.read<SessionState>().api;
    _connect();
    _checkRcon();
  }

  @override
  void dispose() {
    _stream?.stop();
    _scroll.dispose();
    _cmd.dispose();
    super.dispose();
  }

  Future<void> _checkRcon() async {
    try {
      final r = await _api.rconStatus();
      if (mounted) setState(() => _rcon = r['connected'] == true);
    } catch (_) {}
  }

  void _connect() {
    final session = context.read<SessionState>();
    final client = SseClient(session.config, '/console');
    final stream = ConsoleStream(client);
    _stream = stream;

    stream.lines.listen((line) {
      final clean = line.replaceAll('\r', '');
      if (clean.isEmpty) return;
      if (mounted) {
        setState(() {
          _lines.add(clean);
          _error = null;
          _connected = true;
        });
        _scrollToBottom();
      }
    });

    stream.raw.stream.listen((ev) {
      if (ev.event == 'connected') {
        if (mounted) setState(() => _connected = true);
      }
      if (ev.event == 'error') {
        if (mounted) {
          setState(() {
            _connected = false;
            _error = ev.data;
          });
        }
      }
    });

    stream.start();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 150),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send() async {
    final cmd = _cmd.text.trim();
    if (cmd.isEmpty) return;
    _cmd.clear();
    try {
      final resp = await _api.rconCommand(cmd);
      if (resp.isNotEmpty && mounted) {
        setState(() => _lines.add('> $cmd\n$resp'));
        _scrollToBottom();
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _lines.add('> $cmd\n[ошибка] ${e.message}'));
      }
    }
  }

  void _clear() => setState(() => _lines.clear());

  void _retry() {
    _stream?.stop();
    _lines.clear();
    setState(() {
      _error = null;
      _connected = false;
    });
    _connect();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: double.infinity,
          color: AppTheme.surface,
          padding: const EdgeInsets.all(8),
          child: Row(
            children: [
              Icon(Icons.sensors,
                  size: 16,
                  color: _connected ? AppTheme.success : AppTheme.textMuted),
              const SizedBox(width: 6),
              Text(
                _connected ? 'SSE подключён' : 'SSE отключён',
                style: TextStyle(
                    color: _connected ? AppTheme.success : AppTheme.textMuted,
                    fontSize: 12),
              ),
              const SizedBox(width: 12),
              Icon(Icons.cable, size: 16, color: _rcon ? AppTheme.success : AppTheme.textMuted),
              const SizedBox(width: 6),
              Text(
                _rcon ? 'RCON' : 'RCON нет',
                style: TextStyle(
                    color: _rcon ? AppTheme.success : AppTheme.textMuted,
                    fontSize: 12),
              ),
              const Spacer(),
              IconButton(
                  icon: const Icon(Icons.delete_sweep, size: 18),
                  tooltip: 'Очистить',
                  onPressed: _clear),
              IconButton(
                  icon: const Icon(Icons.refresh, size: 18),
                  tooltip: 'Переподключить',
                  onPressed: _retry),
            ],
          ),
        ),
        if (_error != null)
          Container(
            width: double.infinity,
            color: AppTheme.danger.withValues(alpha: 0.1),
            padding: const EdgeInsets.all(8),
            child: Text(_error!,
                style: const TextStyle(color: AppTheme.danger)),
          ),
        Expanded(
          child: _lines.isEmpty
              ? const Center(
                  child: Text('Консоль пуста',
                      style: TextStyle(color: AppTheme.textMuted)))
              : ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.all(8),
                  itemCount: _lines.length,
                  itemBuilder: (_, i) {
                    return SelectableText(
                      _lines[i],
                      style: const TextStyle(
                          fontSize: 11,
                          color: AppTheme.text,
                          fontFamily: 'Consolas, monospace'),
                    );
                  },
                ),
        ),
        Container(
          color: AppTheme.surface,
          padding: const EdgeInsets.all(8),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _cmd,
                  style: const TextStyle(
                      fontSize: 13, fontFamily: 'Consolas, monospace'),
                  decoration: const InputDecoration(
                    hintText: 'Введите RCON-команду...',
                    isDense: true,
                  ),
                  onSubmitted: (_) => _send(),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                icon: const Icon(Icons.send),
                color: AppTheme.accent,
                onPressed: _send,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
