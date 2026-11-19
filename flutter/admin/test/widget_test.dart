import 'package:flutter_test/flutter_test.dart';
import 'package:netfee_admin/main.dart';

void main() {
  testWidgets('Admin app starts and displays its home screen', (WidgetTester tester) async {
    await tester.pumpWidget(const NetfeeApp(loggedIn: false));
    await tester.pumpAndSettle();

    expect(find.byType(NetfeeApp), findsOneWidget);
  });
}