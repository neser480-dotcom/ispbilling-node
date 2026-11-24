import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'core/api_client.dart';
import 'core/theme.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
  ));
  runApp(NetfiApp(loggedIn: await ApiClient.hasSession()));
}

final GlobalKey<NavigatorState> navKey = GlobalKey<NavigatorState>();

class NetfiApp extends StatelessWidget {
  final bool loggedIn;
  const NetfiApp({super.key, required this.loggedIn});

  @override
  Widget build(BuildContext context) {
    ApiClient.onSessionExpired = () => navKey.currentState?.pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
    return MaterialApp(
      navigatorKey: navKey,
      title: 'আমাদের বিল গ্রাহক',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: loggedIn ? const HomeShell() : const LoginScreen(),
    );
  }
}
