import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../state/session_state.dart';
import '../../theme/app_theme.dart';

class TeleportScreen extends StatefulWidget {
  const TeleportScreen({super.key});

  @override
  State<TeleportScreen> createState() => _TeleportScreenState();
}

class _TeleportScreenState extends State<TeleportScreen> {
  List<dynamic> _locs = [];
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
      final r = await _api.teleport();
      if (!mounted) return;
      final list = r['locations'] as List? ??
          r['teleportLocations'] as List? ??
          [];
      setState(() {
        _locs = list;
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

  String _name(dynamic loc) {
    if (loc is Map) {
      return (loc['name'] ?? loc['Name'] ?? 'Без имени').toString();
    }
    return loc.toString();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Телепорты')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!,
                  style: const TextStyle(color: AppTheme.danger)))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _locs.length,
                    itemBuilder: (ctx, i) {
                      final loc = _locs[i];
                      return Card(
                        child: ListTile(
                          leading: const Icon(Icons.place,
                              color: AppTheme.accent),
                          title: Text(_name(loc)),
                          trailing: const Icon(Icons.near_me,
                              color: AppTheme.success, size: 18),
                          onTap: () => _snack('Телепорт: ${_name(loc)}'),
                        ),
                      );
                    },
                  ),
                ),
    );
  }

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(m)));
  }
}