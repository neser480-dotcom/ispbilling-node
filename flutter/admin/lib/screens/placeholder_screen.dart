import 'package:material_ui/material_ui.dart';
import '../core/lang.dart';
import '../core/theme.dart';
import '../widgets/admin_scaffold.dart';
import '../widgets/lang_builder.dart';

class PlaceholderScreen extends StatelessWidget {
  final String menuKey;
  const PlaceholderScreen({super.key, required this.menuKey});

  @override
  Widget build(BuildContext context) {
    return LangBuilder(
      builder: (_) => AdminScaffold(
        current: menuKey,
        title: Lang.i.t(menuKey),
        body: Center(
          child: Text(Lang.i.t('coming_soon'),
              style: const TextStyle(fontSize: 18, color: AppColors.muted)),
        ),
      ),
    );
  }
}
