import 'package:flutter_test/flutter_test.dart';
import 'package:netfi_client/main.dart';

void main() {
  testWidgets('NetfiApp loads successfully', (WidgetTester tester) async {
    await tester.pumpWidget(
      const NetfiApp(loggedIn: false),
    );

    await tester.pump();

    expect(find.byType(NetfiApp), findsOneWidget);
  });
}