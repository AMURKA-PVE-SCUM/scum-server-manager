import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../theme/app_theme.dart';

/// Generic JSON config editor: GETs a section, renders leaf fields,
/// applies edits onto the original structure, then POSTs it back.
class ModuleConfigScreen extends StatefulWidget {
  final ApiClient api;
  final String section;
  final String title;

  const ModuleConfigScreen({
    super.key,
    required this.api,
    required this.section,
    required this.title,
  });

  @override
  State<ModuleConfigScreen> createState() => _ModuleConfigScreenState();
}

class _Leaf {
  final String path;
  final Object? value;
  final TextEditingController controller;
  _Leaf(this.path, this.value)
      : controller = TextEditingController(text: value.toString());
}

class _ModuleConfigScreenState extends State<ModuleConfigScreen> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  bool _saving = false;
  String? _error;
  final _leaves = <_Leaf>[];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final l in _leaves) {
      l.controller.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final d = await widget.api.pluginGet(widget.section);
      if (!mounted) return;
      setState(() {
        _data = d;
        _leaves.clear();
        _collect(d, '');
        _loading = false;
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

  void _collect(Map<String, dynamic> map, String prefix) {
    map.forEach((k, v) {
      final path = prefix.isEmpty ? k : '$prefix.$k';
      if (v is Map) {
        _collect(v.cast<String, dynamic>(), path);
      } else if (v is bool || v is int || v is double || v is String) {
        _leaves.add(_Leaf(path, v));
      }
    });
  }

  Object _parse(String s, Object? original) {
    if (original is bool) return s == 'true';
    if (original is int) return int.tryParse(s) ?? original;
    if (original is double) return double.tryParse(s) ?? original;
    return s;
  }

  void _apply() {
    // Apply edited leaves into _data by walking paths.
    void setPath(List<String> parts, Object? val) {
      Map<String, dynamic> cur = _data!;
      for (var i = 0; i < parts.length - 1; i++) {
        cur = cur[parts[i]] as Map<String, dynamic>;
      }
      cur[parts.last] = val;
    }

    for (final leaf in _leaves) {
      final parts = leaf.path.split('.');
      setPath(parts, _parse(leaf.controller.text, leaf.value));
    }
  }

  Future<void> _save() async {
    _apply();
    setState(() => _saving = true);
    try {
      await widget.api.pluginPost(widget.section, _data!);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Сохранено')));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          IconButton(
              icon: const Icon(Icons.refresh), onPressed: _load),
          IconButton(
              icon: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.save),
              onPressed: _saving ? null : _save),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!,
                            style: const TextStyle(color: AppTheme.danger)),
                        const SizedBox(height: 12),
                        OutlinedButton(
                            onPressed: _load, child: const Text('Повторить')),
                      ],
                    ),
                  ),
                )
              : _leaves.isEmpty
                  ? const Center(
                      child: Text('Нет полей для редактирования',
                          style: TextStyle(color: AppTheme.textMuted)))
                  : ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        Text('Поля конфигурации (${_leaves.length})',
                            style:
                                const TextStyle(color: AppTheme.textMuted)),
                        const SizedBox(height: 8),
                        for (final leaf in _leaves)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: TextField(
                              controller: leaf.controller,
                              style: const TextStyle(
                                  fontSize: 13,
                                  fontFamily: 'Consolas, monospace'),
                              decoration: InputDecoration(
                                labelText: leaf.path,
                                isDense: true,
                              ),
                            ),
                          ),
                        const SizedBox(height: 24),
                        ElevatedButton(
                            onPressed: _saving ? null : _save,
                            child: const Text('Сохранить')),
                      ],
                    ),
    );
  }
}