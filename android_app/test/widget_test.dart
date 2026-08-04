import 'package:flutter_test/flutter_test.dart';

import 'package:scum_server_manager_mobile/main.dart';

void main() {
  testWidgets('App boots and shows login', (WidgetTester tester) async {
    await tester.pumpWidget(const ScumServerManagerApp());
    await tester.pumpAndSettle();

    // The app requires an authenticated session, so the login screen shows.
    expect(find.text('SCUM Server Manager'), findsOneWidget);
  });
}