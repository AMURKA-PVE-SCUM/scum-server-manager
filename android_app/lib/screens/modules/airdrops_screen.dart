import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../state/session_state.dart';
import '../../theme/app_theme.dart';

class AirdropsScreen extends StatefulWidget {
  const AirdropsScreen({super.key});

  @override
  State<AirdropsScreen> createState() => _AirdropsScreenState();
}

class _AirdropsScreenState extends State<AirdropsScreen> {
  bool _loading = true;
  String? _error;
  late final ApiClient _api;
  Map<String, dynamic>? _cfg;
  bool _dropping = false;

  @override
  void initState() {
    super.initState();
    _api = context.read<SessionState>().api;
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final r = await _api.airdrop();
      if (!mounted) return;
      setState(() {
        _cfg = r;
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

  Future<void> _drop() async {
    setState(() => _dropping = true);
    try {
      await _api.airdropDrop({});
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('������� �������')));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _dropping = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('�������')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!,
                  style: const TextStyle(color: AppTheme.danger)))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Card(
                      child: ListTile(
                        leading: const Icon(Icons.paragliding,
                            color: AppTheme.accent),
                        title: const Text('��������� ��������'),
                        subtitle: Text(
                            '��������: ${_cfg?['interval'] ?? '�'}\n'
                            '���������: ${_cfg?['allowed'] ?? '�'}\n'
                            '���������: ${_cfg?['nextDrop'] ?? '�'}'),
                        isThreeLine: true,
                      ),
                    ),
                    const SizedBox(height: 12),
                    ElevatedButton.icon(
                      onPressed: _dropping ? null : _drop,
                      icon: const Icon(Icons.flight),
                      label: Text(_dropping ? '�����...' : '�������� ������'),
                    ),
                  ],
                ),
    );
  }
}