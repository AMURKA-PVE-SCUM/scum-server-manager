import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/session_state.dart';
import '../theme/app_theme.dart';
import 'modules/airdrops_screen.dart';
import 'modules/auto_messages_screen.dart';
import 'modules/items_screen.dart';
import 'modules/leaderboard_screen.dart';
import 'modules/lolka_screen.dart';
import 'modules/module_config_screen.dart';
import 'modules/packs_screen.dart';
import 'modules/rewards_screen.dart';
import 'modules/scumdb_screen.dart';
import 'modules/teleport_screen.dart';
import 'modules/update_screen.dart';
import 'settings_screen.dart';

class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.read<SessionState>().api;
    final items = <({IconData icon, String label, Widget screen})>[
      (
        icon: Icons.inventory_2,
        label: 'Паки',
        screen: const PacksScreen()
      ),
      (
        icon: Icons.category,
        label: 'Предметы',
        screen: const ItemsScreen()
      ),
      (
        icon: Icons.flight_takeoff,
        label: 'Телепорты',
        screen: const TeleportScreen()
      ),
      (
        icon: Icons.star,
        label: 'VIP',
        screen: ModuleConfigScreen(
            api: api, section: 'vip', title: 'VIP')
      ),
      (
        icon: Icons.home,
        label: 'SaveHome',
        screen: ModuleConfigScreen(
            api: api, section: 'savehome', title: 'SaveHome')
      ),
      (
        icon: Icons.campaign,
        label: 'Авто-сообщения',
        screen: const AutoMessagesScreen()
      ),
      (
        icon: Icons.card_giftcard,
        label: 'Награды',
        screen: const RewardsScreen()
      ),
      (
        icon: Icons.leaderboard,
        label: 'Рейтинг',
        screen: const LeaderboardScreen()
      ),
      (
        icon: Icons.paragliding,
        label: 'Airdrop',
        screen: const AirdropsScreen()
      ),
      (
        icon: Icons.groups,
        label: 'Сквады (SCUMDB)',
        screen: const ScumdbScreen()
      ),
      (
        icon: Icons.smart_toy,
        label: 'Бот',
        screen: const LolkaScreen()
      ),
      (
        icon: Icons.system_update_alt,
        label: 'Обновление сервера',
        screen: const UpdateScreen()
      ),
      (
        icon: Icons.settings,
        label: 'Настройки подключения',
        screen: const SettingsScreen()
      ),
    ];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        for (final it in items)
          Card(
            child: ListTile(
              leading: Icon(it.icon, color: AppTheme.accent),
              title: Text(it.label),
              trailing: const Icon(Icons.chevron_right,
                  color: AppTheme.textMuted),
              onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => it.screen)),
            ),
          ),
      ],
    );
  }
}