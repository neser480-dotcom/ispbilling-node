import 'package:flutter/material.dart';
import '../core/lang.dart';

/// ভাষা বদলালে ভেতরের UI নতুন করে আঁকে
class LangBuilder extends StatelessWidget {
  final WidgetBuilder builder;
  const LangBuilder({super.key, required this.builder});

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Lang.i,
        builder: (context, _) => builder(context),
      );
}
