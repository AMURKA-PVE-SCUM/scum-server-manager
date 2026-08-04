import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'state/session_state.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ScumServerManagerApp());
}

class ScumServerManagerApp extends StatelessWidget {
  const ScumServerManagerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => SessionState()..initialize(),
      child: MaterialApp(
        title: 'SCUM Server Manager',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.dark(),
        home: const RootGate(),
      ),
    );
  }
}

class RootGate extends StatelessWidget {
  const RootGate({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionState>();
    if (session.authenticating) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (!session.authenticated) {
      return const LoginScreen();
    }
    return const HomeScreen();
  }
}