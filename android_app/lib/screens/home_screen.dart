import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/session_state.dart';
import '../theme/app_theme.dart';
import 'chat_screen.dart';
import 'console_screen.dart';
import 'dashboard_screen.dart';
import 'more_screen.dart';
import 'players_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _index = 0;

  static const _screens = [
    DashboardScreen(),
    PlayersScreen(),
    ChatScreen(),
    ConsoleScreen(),
    MoreScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('SCUM Manager'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Выйти',
            onPressed: () => context.read<SessionState>().logout(),
          ),
        ],
      ),
      body: IndexedStack(index: _index, children: _screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        backgroundColor: AppTheme.surface,
        destinations: const [
          NavigationDestination(
              icon: Icon(Icons.speed), label: 'Статус'),
          NavigationDestination(
              icon: Icon(Icons.people), label: 'Игроки'),
          NavigationDestination(
              icon: Icon(Icons.chat), label: 'Чат'),
          NavigationDestination(
              icon: Icon(Icons.terminal), label: 'Консоль'),
          NavigationDestination(
              icon: Icon(Icons.more_horiz), label: 'Ещё'),
        ],
      ),
    );
  }
}