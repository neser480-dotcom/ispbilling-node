import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
import 'core/api_client.dart';
import 'core/lang.dart';
import 'core/theme.dart';
import 'screens/dashboard_screen.dart';
import 'screens/login_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Lang.i.load();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
  ));
  final loggedIn = await ApiClient.hasSession();
  runApp(NetfeeApp(loggedIn: loggedIn));
}

final GlobalKey<NavigatorState> navKey = GlobalKey<NavigatorState>();

class NetfeeApp extends StatelessWidget {
  final bool loggedIn;
  const NetfeeApp({super.key, required this.loggedIn});

  @override
  Widget build(BuildContext context) {
    ApiClient.onSessionExpired = () => navKey.currentState?.pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
    return MaterialApp(
      navigatorKey: navKey,
      title: 'আমাদের বিল',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: loggedIn ? const DashboardScreen() : const LoginScreen(),
    );
  }
}
