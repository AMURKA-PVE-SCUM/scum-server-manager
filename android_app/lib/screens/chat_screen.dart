import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/sse_client.dart';
import '../models/models.dart';
import '../state/session_state.dart';
import '../theme/app_theme.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _messages = <ChatMessage>[];
  final _scroll = ScrollController();
  ChatStream? _stream;
  bool _connected = false;
  String? _error;
  final Set<String> _seen = {};

  @override
  void initState() {
    super.initState();
    _connect();
  }

  @override
  void dispose() {
    _stream?.stop();
    _scroll.dispose();
    super.dispose();
  }

  void _connect() {
    final session = context.read<SessionState>();
    final client = SseClient(session.config, '/chat');
    final stream = ChatStream(client);
    _stream = stream;

    // Initial history
    stream.onHistory.listen((_) {
      if (mounted) setState(() {});
    });

    stream.messages.listen((msg) {
      final key = '${msg.steamId}|${msg.timestamp}|${msg.message}';
      if (_seen.contains(key)) return;
      _seen.add(key);
      if (mounted) {
        setState(() {
          _messages.add(msg);
          _error = null;
          _connected = true;
        });
        _scrollToBottom();
      }
    });

    stream.raw.stream.listen((ev) {
      if (ev.event == 'connected') {
        if (mounted) {
          setState(() {
            _connected = true;
            _error = null;
          });
        }
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
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _retry() {
    _stream?.stop();
    _messages.clear();
    _seen.clear();
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
        if (_error != null)
          Container(
            width: double.infinity,
            color: AppTheme.danger.withValues(alpha: 0.1),
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                const Icon(Icons.error_outline,
                    color: AppTheme.danger, size: 18),
                const SizedBox(width: 8),
                Expanded(
                    child: Text(_error!,
                        style: const TextStyle(color: AppTheme.danger))),
                TextButton(onPressed: _retry, child: const Text('Переподключить')),
              ],
            ),
          ),
        if (!_connected && _error == null)
          const LinearProgressIndicator(),
        Expanded(
          child: _messages.isEmpty && _stream!.history.isEmpty
              ? const Center(
                  child: Text('Чат пуст',
                      style: TextStyle(color: AppTheme.textMuted)))
              : ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.all(12),
                  itemCount: _stream!.history.length + _messages.length,
                  itemBuilder: (ctx, i) {
                    final history = _stream!.history;
                    final msg = i < history.length
                        ? history[i]
                        : _messages[i - history.length];
                    return _messageBubble(msg);
                  },
                ),
        ),
      ],
    );
  }

  Widget _messageBubble(ChatMessage m) {
    final isGlobal = m.channel.toLowerCase() == 'global';
    final color = isGlobal ? AppTheme.accent : AppTheme.success;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(m.playerName,
                  style: TextStyle(
                      color: color, fontWeight: FontWeight.w700, fontSize: 13)),
              const SizedBox(width: 6),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(m.channel,
                    style: TextStyle(color: color, fontSize: 10)),
              ),
              if (m.timestamp != null) ...[
                const SizedBox(width: 6),
                Text(
                  '${m.timestamp!.hour.toString().padLeft(2, '0')}:'
                  '${m.timestamp!.minute.toString().padLeft(2, '0')}',
                  style: const TextStyle(color: AppTheme.textMuted, fontSize: 11),
                ),
              ],
            ],
          ),
          const SizedBox(height: 2),
          Text(m.message),
        ],
      ),
    );
  }
}
