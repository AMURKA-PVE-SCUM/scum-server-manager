import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../state/session_state.dart';
import '../../theme/app_theme.dart';

class UpdateScreen extends StatefulWidget {
  const UpdateScreen({super.key});

  @override
  State<UpdateScreen> createState() => _UpdateScreenState();
}

class _UpdateScreenState extends State<UpdateScreen> {
  late final ApiClient _api;
  bool _busy = false;
  String _version = '�';

  @override
  void initState() {
    super.initState();
    _api = context.read<SessionState>().api;
    _loadVersion();
  }

  Future<void> _loadVersion() async {
    try {
      final r = await _api.appVersion();
      if (mounted) {
        setState(() => _version = r['version']?.toString() ?? '�');
      }
    } catch (_) {}
  }

  Future<void> _run(Future<Map<String, dynamic>> Function() fn) async {
    setState(() => _busy = true);
    try {
      final r = await fn();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(r['message']?.toString() ?? '���������� ��������')));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirm(bool manual) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: Text(manual ? '�������� �������?' : '�������� ������?'),
        content: const Text('������ ����� ���������� �� ����� ����������.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('������')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('��������')),
        ],
      ),
    );
    if (ok == true) {
      await _run(manual ? _api.updateManual : _api.updateServer);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('���������� �������')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: const Icon(Icons.info, color: AppTheme.accent),
              title: const Text('������ ������'),
              trailing: Text(_version,
                  style: const TextStyle(
                      color: AppTheme.accent, fontWeight: FontWeight.w700)),
            ),
          ),
          const SizedBox(height: 12),
          ElevatedButton.icon(
            onPressed: _busy ? null : () => _confirm(false),
            icon: const Icon(Icons.system_update_alt),
            label: const Text('�������� ������ (�� ����)'),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _busy ? null : () => _confirm(true),
            icon: const Icon(Icons.upload_file),
            label: const Text('�������� �������'),
          ),
          const SizedBox(height: 24),
          const Text(
            '���������� ��������� ���������� �� Steam � ������������� ������.\n'
            '�� ���������� ���������� �� ����� ����������.',
            style: TextStyle(color: AppTheme.textMuted, fontSize: 12),
          ),
        ],
      ),
    );
  }
}