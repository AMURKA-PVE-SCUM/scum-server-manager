import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../models/models.dart';
import 'app_config.dart';

class SseEvent {
  final String event;
  final String data;

  SseEvent(this.event, this.data);
}

class SseClient {
  final AppConfig config;
  final String path;

  StreamController<SseEvent>? _controller;
  http.StreamedResponse? _response;
  bool _closed = false;
  bool _disposed = false;

  SseClient(this.config, this.path);

  Stream<SseEvent> get stream => _controller!.stream;

  bool get isActive => !_closed && !_disposed;

  Future<void> start() async {
    _closed = false;
    _disposed = false;
    _controller = StreamController<SseEvent>.broadcast();

    final base = config.api;
    final uri = Uri.parse(
        '$base$path?token=${Uri.encodeQueryComponent(config.token)}');

    final req = http.Request('GET', uri);
    req.headers['Accept'] = 'text/event-stream';
    req.headers['Cache-Control'] = 'no-cache';

    try {
      _response = await http.Client().send(req).timeout(
          const Duration(seconds: 10));
    } on SocketException {
      _controller!.add(SseEvent('error', 'Нет соединения'));
      await _controller!.close();
      return;
    } on TimeoutException {
      _controller!.add(SseEvent('error', 'Таймаут подключения'));
      await _controller!.close();
      return;
    }

    if (_response!.statusCode == 401) {
      _controller!.add(SseEvent('error', 'Не авторизован'));
      await _controller!.close();
      return;
    }

    _listen();
  }

  void _listen() {
    if (_disposed || _response == null) return;
    String buffer = '';
    String eventName = 'message';

    _response!.stream.transform(utf8.decoder).listen(
      (chunk) {
        buffer += chunk;
        while (buffer.contains('\n\n')) {
          final idx = buffer.indexOf('\n\n');
          final block = buffer.substring(0, idx);
          buffer = buffer.substring(idx + 2);
          final lines = block.split('\n');
          for (final line in lines) {
            if (line.startsWith('event: ')) {
              eventName = line.substring(7).trim();
            } else if (line.startsWith('data: ')) {
              final data = line.substring(6).trim();
              if (_controller != null && !_controller!.isClosed) {
                _controller!.add(SseEvent(eventName, data));
              }
            }
          }
        }
      },
      onDone: () {
        if (!_disposed && !_closed && _controller != null &&
            !_controller!.isClosed) {
          _controller!.add(SseEvent('error', 'Соединение закрыто'));
        }
        _closeController();
      },
      onError: (_) {
        if (!_disposed && !_closed && _controller != null &&
            !_controller!.isClosed) {
          _controller!.add(SseEvent('error', 'Ошибка потока'));
        }
        _closeController();
      },
    );
  }

  void _closeController() {
    if (_controller != null && !_controller!.isClosed) {
      _controller!.close();
    }
  }

  Future<void> stop() async {
    _closed = true;
    try {
      await _response?.stream.drain<void>();
    } catch (_) {}
    _closeController();
  }

  void dispose() {
    _disposed = true;
    stop();
  }
}

/// Chat stream wrapper producing [ChatMessage].
class ChatStream {
  final SseClient _client;
  final StreamController<ChatMessage> _messages =
      StreamController.broadcast();
  List<ChatMessage> history = [];
  String? error;

  ChatStream(this._client);

  SseClient get raw => _client;

  Stream<ChatMessage> get messages => _messages.stream;
  Stream<ChatMessage> get onHistory {
    return _client.stream.where((e) => e.event == 'init').map((e) {
      final list = (jsonDecode(e.data) as List? ?? []);
      return list.map((m) {
        final msg = ChatMessage.fromJson(m as Map<String, dynamic>);
        history.add(msg);
        return msg;
      });
    }).expand((x) => x);
  }

  void start() {
    _client.stream.listen((ev) {
      if (ev.event == 'error') {
        error = ev.data;
        return;
      }
      if (ev.event == 'chat') {
        try {
          final m = jsonDecode(ev.data) as Map<String, dynamic>;
          _messages.add(ChatMessage.fromJson(m));
        } catch (_) {}
      }
    });
    _client.start();
  }

  Future<void> stop() async {
    await _messages.close();
    await _client.stop();
  }
}

/// Console stream wrapper emitting raw lines.
class ConsoleStream {
  final SseClient _client;
  final StreamController<String> _lines = StreamController.broadcast();
  String? error;

  ConsoleStream(this._client);

  SseClient get raw => _client;

  Stream<String> get lines => _lines.stream;

  void start() {
    _client.stream.listen((ev) {
      if (ev.event == 'error') {
        error = ev.data;
        return;
      }
      if (ev.event == 'line') {
        _lines.add(ev.data.replaceAll(r'\n', '\n'));
      }
    });
    _client.start();
  }

  Future<void> stop() async {
    await _lines.close();
    await _client.stop();
  }
}
