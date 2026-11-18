import 'package:flutter/material.dart';
import '../core/theme.dart';

class LetterAvatar extends StatelessWidget {
  final String text;
  final Color? color;
  final double radius;

  const LetterAvatar({super.key, required this.text, this.color, this.radius = 20});

  Color get _color {
    if (color != null) return color!;
    var sum = 0;
    for (final u in text.codeUnits) {
      sum += u;
    }
    return AppColors.avatars[sum % AppColors.avatars.length];
  }

  @override
  Widget build(BuildContext context) {
    final letter = text.trim().isEmpty ? '?' : text.trim().characters.first;
    return CircleAvatar(
      radius: radius,
      backgroundColor: _color,
      child: Text(letter.toUpperCase(),
          style: TextStyle(color: Colors.white, fontSize: radius * 0.95)),
    );
  }
}
