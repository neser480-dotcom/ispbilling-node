import 'lang.dart';

Map<String, dynamic> mapOf(dynamic value) {
  if (value is Map) return Map<String, dynamic>.from(value);
  return <String, dynamic>{};
}

num numOf(dynamic value) {
  if (value == null) return 0;
  if (value is num) return value;
  final cleaned =
      value.toString().replaceAll(',', '').replaceAll('৳', '').trim();
  return num.tryParse(cleaned) ?? 0;
}

String taka(num value) {
  return '৳${Lang.i.digits(intl(value))}';
}

String dateOnly(dynamic value) {
  if (value == null || value.toString().trim().isEmpty) return '';
  final raw = value.toString().trim();
  final parsed = DateTime.tryParse(raw);
  if (parsed == null) return raw.length >= 10 ? raw.substring(0, 10) : raw;
  return '${parsed.year.toString().padLeft(4, '0')}-'
      '${parsed.month.toString().padLeft(2, '0')}-'
      '${parsed.day.toString().padLeft(2, '0')}';
}
