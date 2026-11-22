import 'package:material_ui/material_ui.dart';
import '../core/lang.dart';
import '../core/theme.dart';

/// Netfee-স্টাইল কমন উইজেট (Purpose, Accounts, Message Log, Deposit Report ইত্যাদিতে ব্যবহৃত)

/// "1,250 Tk." ফরম্যাট
String tk(num v) => '${Lang.i.digits(intl(v))} Tk.';

/// Netfee-স্টাইল small-caps লেখা: ছোট হাতের ইংরেজি অক্ষর ছোট বড়-হাতের হয়ে দেখায়
/// ("Dashboard" → D বড় + ASHBOARD ছোট)। বাংলা বা অন্য লেখায় কোনো পরিবর্তন হয় না।
class SmallCapsText extends StatelessWidget {
  final String text;
  final TextStyle style;

  /// ছোট অক্ষরের আকার = ফন্ট সাইজ × scale
  final double scale;

  const SmallCapsText(
    this.text, {
    super.key,
    required this.style,
    this.scale = 0.78,
  });

  @override
  Widget build(BuildContext context) {
    final base = style.fontSize ?? 14;
    final spans = <TextSpan>[];
    final buf = StringBuffer();
    var small = false;

    void flush() {
      if (buf.isEmpty) return;
      spans.add(TextSpan(
        text: buf.toString(),
        style: small ? TextStyle(fontSize: base * scale) : null,
      ));
      buf.clear();
    }

    for (final r in text.runes) {
      final isLower = r >= 0x61 && r <= 0x7A;
      if (isLower != small) {
        flush();
        small = isLower;
      }
      final ch = String.fromCharCode(r);
      buf.write(isLower ? ch.toUpperCase() : ch);
    }
    flush();

    return Text.rich(
      TextSpan(children: spans),
      style: style.copyWith(letterSpacing: style.letterSpacing ?? 0.6),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );
  }
}

/// গোল-কোণা আউটলাইন ড্রপডাউন (স্ক্রিনশটের "2026 ▾", "All Month ▾")
class PillDropdown<T> extends StatelessWidget {
  final T value;
  final List<T> values;
  final String Function(T) label;
  final ValueChanged<T> onChanged;
  final bool onBlue; // নীল ব্যাকগ্রাউন্ডের উপর হলে সাদা বর্ডার/লেখা
  final double? width;

  const PillDropdown({
    super.key,
    required this.value,
    required this.values,
    required this.label,
    required this.onChanged,
    this.onBlue = false,
    this.width,
  });

  @override
  Widget build(BuildContext context) {
    final fg = onBlue ? Colors.white : const Color(0xFF444444);
    final border = onBlue ? Colors.white : const Color(0xFF555555);
    return Container(
      width: width,
      height: 40,
      padding: const EdgeInsets.only(left: 18, right: 8),
      decoration: BoxDecoration(
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(24),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          value: value,
          isExpanded: width != null,
          iconEnabledColor: fg,
          iconSize: 30,
          items: [
            for (final v in values)
              DropdownMenuItem<T>(value: v, child: Text(label(v))),
          ],
          selectedItemBuilder: (_) => [
            for (final v in values)
              Align(
                alignment: Alignment.centerLeft,
                child: Text(label(v), style: TextStyle(fontSize: 18, color: fg)),
              ),
          ],
          onChanged: (v) {
            if (v != null) onChanged(v);
          },
        ),
      ),
    );
  }
}

/// নীল অ্যাপ বারের ভেতরের টেক্সট + ▾ ড্রপডাউন (স্ক্রিনশটের "Depositor ▾")
class BarDropdown<T> extends StatelessWidget {
  final String text;
  final List<T> values;
  final String Function(T) label;
  final ValueChanged<T> onSelected;

  const BarDropdown({
    super.key,
    required this.text,
    required this.values,
    required this.label,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<T>(
      onSelected: onSelected,
      itemBuilder: (_) => [
        for (final v in values)
          PopupMenuItem<T>(value: v, child: Text(label(v))),
      ],
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 96),
              child: Text(
                text,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 18, color: Colors.white),
              ),
            ),
            const Icon(Icons.arrow_drop_down, color: Colors.white, size: 30),
          ],
        ),
      ),
    );
  }
}

/// "All Month,2026" (আন্ডারলাইন) + নিচে নীল বড় অ্যামাউন্ট
class SummaryHeader extends StatelessWidget {
  final String label;
  final String amount;
  const SummaryHeader({super.key, required this.label, required this.amount});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 22, 16, 12),
      child: Column(
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 18,
              color: AppColors.muted,
              decoration: TextDecoration.underline,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            amount,
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.bold,
              color: AppColors.sky,
            ),
          ),
        ],
      ),
    );
  }
}

/// সাদা ব্যাকগ্রাউন্ডের ট্যাব বার: TODAY | MONTH | YEAR (নির্বাচিতটা নীল + নিচে নীল দাগ)
class NetfeeTabBar extends StatelessWidget {
  final List<String> labels;
  final int index;
  final ValueChanged<int> onChanged;

  const NetfeeTabBar({
    super.key,
    required this.labels,
    required this.index,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 50,
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        children: [
          for (var i = 0; i < labels.length; i++)
            Expanded(
              child: InkWell(
                onTap: () => onChanged(i),
                child: Container(
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    border: Border(
                      bottom: BorderSide(
                        color: i == index ? AppColors.sky : Colors.transparent,
                        width: 3,
                      ),
                      right: i == labels.length - 1
                          ? BorderSide.none
                          : const BorderSide(color: AppColors.line),
                    ),
                  ),
                  child: Text(
                    labels[i].toUpperCase(),
                    maxLines: 2,
                    textAlign: TextAlign.center,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 17,
                      letterSpacing: 0.6,
                      color: i == index ? AppColors.sky : const Color(0xFF555555),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// সারির ডানের নীল ⋮ মেনু
class DotsMenu extends StatelessWidget {
  final List<String> labels;
  final ValueChanged<int> onSelected;
  const DotsMenu({super.key, required this.labels, required this.onSelected});

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<int>(
      icon: const Icon(Icons.more_vert, color: AppColors.sky),
      onSelected: onSelected,
      itemBuilder: (_) => [
        for (var i = 0; i < labels.length; i++)
          PopupMenuItem<int>(value: i, child: Text(labels[i])),
      ],
    );
  }
}

/// নীল গোল "SUBMIT" বাটন
class PillButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  const PillButton({super.key, required this.text, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.sky,
        foregroundColor: Colors.white,
        elevation: 3,
        shape: const StadiumBorder(),
        minimumSize: const Size(120, 48),
        padding: const EdgeInsets.symmetric(horizontal: 36),
      ),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(fontSize: 19, letterSpacing: 1.2),
      ),
    );
  }
}
DateTimeRange periodRange(int year, int month) {
  final start = month == 0
      ? DateTime(year, 1, 1)
      : DateTime(year, month, 1);

  final end = month == 0
      ? DateTime(year, 12, 31)
      : DateTime(year, month + 1, 0);

  return DateTimeRange(start: start, end: end);
}

String monthName(int month) {
  const months = [
    'January', 'February', 'March', 'April',
    'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December',
  ];

  if (month == 0) return 'All Month';
  if (month < 1 || month > 12) return '';
  return months[month - 1];
}

class YearMonthRow extends StatelessWidget {
  final int year;
  final int month;
  final bool showMonth;
  final ValueChanged<int> onYear;
  final ValueChanged<int> onMonth;

  const YearMonthRow({
    super.key,
    required this.year,
    required this.month,
    this.showMonth = true,
    required this.onYear,
    required this.onMonth,
  });

  @override
  Widget build(BuildContext context) {
    final currentYear = DateTime.now().year;

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: 16,
        vertical: 8,
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          PillDropdown<int>(
            value: year,
            values: [
              for (int y = currentYear; y >= currentYear - 10; y--) y,
            ],
            label: (y) => '$y',
            onChanged: onYear,
          ),
          if (showMonth) ...[
            const SizedBox(width: 10),
            PillDropdown<int>(
              value: month,
              values: List.generate(13, (i) => i),
              label: (m) => m == 0 ? 'All Month' : monthName(m),
              onChanged: onMonth,
            ),
          ],
        ],
      ),
    );
  }
}