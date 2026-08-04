import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../models/models.dart';
import '../../state/session_state.dart';
import '../../theme/app_theme.dart';

class ItemsScreen extends StatefulWidget {
  const ItemsScreen({super.key});

  @override
  State<ItemsScreen> createState() => _ItemsScreenState();
}

class _ItemsScreenState extends State<ItemsScreen> {
  List<GameItem> _items = [];
  List<GameItem> _filtered = [];
  bool _loading = true;
  String? _error;
  late final ApiClient _api;
  final _q = TextEditingController();

  @override
  void initState() {
    super.initState();
    _api = context.read<SessionState>().api;
    _load();
    _q.addListener(() {
      final q = _q.text.toLowerCase();
      setState(() {
        _filtered = _items
            .where((i) =>
                i.name.toLowerCase().contains(q) ||
                i.id.toLowerCase().contains(q))
            .toList();
      });
    });
  }

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final items = await _api.items();
      if (!mounted) return;
      setState(() {
        _items = items;
        _filtered = items;
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Предметы'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: TextField(
              controller: _q,
              decoration: const InputDecoration(
                hintText: 'Поиск по названию/ID...',
                prefixIcon: Icon(Icons.search),
                isDense: true,
              ),
            ),
          ),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!,
                  style: const TextStyle(color: AppTheme.danger)))
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _filtered.length,
                  itemBuilder: (ctx, i) {
                    final item = _filtered[i];
                    return Card(
                      child: ListTile(
                        leading: _thumb(item.id),
                        title: Text(item.name),
                        subtitle: Text(item.id,
                            style: const TextStyle(
                                color: AppTheme.textMuted, fontSize: 12)),
                        trailing: const Icon(Icons.chevron_right,
                            color: AppTheme.textMuted),
                        onTap: () => _showDetail(item),
                      ),
                    );
                  },
                ),
    );
  }

  Widget _thumb(String id) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(4),
      child: Image.network(
        _api.itemImageUrl(id),
        width: 40,
        height: 40,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => Container(
          width: 40,
          height: 40,
          color: AppTheme.surface,
          alignment: Alignment.center,
          child: const Icon(Icons.category, size: 20, color: AppTheme.textMuted),
        ),
        loadingBuilder: (ctx, child, progress) =>
            progress == null ? child : const SizedBox.shrink(),
      ),
    );
  }

  void _showDetail(GameItem item) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.surface,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(item.name,
                style: const TextStyle(
                    fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            SelectableText(item.id,
                style:
                    const TextStyle(color: AppTheme.textMuted, fontSize: 13)),
            if (item.description != null) ...[
              const SizedBox(height: 12),
              Text(item.description!),
            ],
            const SizedBox(height: 8),
            Text('Отправьте этот предмет через RCON командой '
                'GivePlayerItem',
                style: const TextStyle(
                    color: AppTheme.textMuted, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}
