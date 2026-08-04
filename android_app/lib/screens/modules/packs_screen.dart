import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../models/models.dart';
import '../../state/session_state.dart';
import '../../theme/app_theme.dart';

class PacksScreen extends StatefulWidget {
  const PacksScreen({super.key});

  @override
  State<PacksScreen> createState() => _PacksScreenState();
}

class _PacksScreenState extends State<PacksScreen> {
  List<PackConfig?> _packs = [];
  bool _loading = true;
  String? _error;
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
      final r = await _api.packs();
      if (!mounted) return;
      final list = r['packs'] as List? ?? [];
      setState(() {
        _packs = list
            .map((e) =>
                e is Map<String, dynamic> ? PackConfig.fromJson(e) : null)
            .toList();
        _error = null;
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

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(m)));
  }

  Future<void> _give(PackConfig pack) async {
    final steamIdCtrl = TextEditingController();
    final pid = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: Text('Выдать паки "${pack.name}"'),
        content: TextField(
          controller: steamIdCtrl,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Steam ID игрока'),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Отмена')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, steamIdCtrl.text.trim()),
              child: const Text('Выдать')),
        ],
      ),
    );
    if (pid == null || pid.isEmpty) return;
    try {
      await _api.packsGive(pack.name, pid);
      _snack('Пак выдан');
    } on ApiException catch (e) {
      _snack(e.message);
    }
  }

  Future<void> _copyItems(PackConfig pack) async {
    final sb = StringBuffer();
    for (final it in pack.items) {
      sb.writeln('${it.itemId} x${it.amount}');
    }
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: Text('${pack.name} — состав'),
        content: SelectableText(sb.toString()),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('OK')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Паки')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!,
                  style: const TextStyle(color: AppTheme.danger)))
              : _packs.isEmpty
                  ? const Center(
                      child: Text('Нет паков',
                          style: TextStyle(color: AppTheme.textMuted)))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.all(16),
                        children: [
                          for (final p in _packs)
                            if (p != null) _packCard(p),
                        ],
                      ),
                    ),
    );
  }

  Widget _packCard(PackConfig p) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(p.name,
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w700)),
                ),
                _badge(p.enabled),
              ],
            ),
            const SizedBox(height: 6),
            Text('Кулдаун: ${p.cooldown} сек • Предметов: ${p.items.length}',
                style: const TextStyle(
                    color: AppTheme.textMuted, fontSize: 12)),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => _give(p),
                    child: const Text('Выдать'),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: () => _copyItems(p),
                  child: const Text('Состав'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _badge(bool enabled) {
    final color = enabled ? AppTheme.success : AppTheme.textMuted;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(enabled ? 'вкл' : 'выкл',
          style: TextStyle(color: color, fontSize: 11)),
    );
  }
}
