import 'lang.dart';

/// বর্তমান ভাষা অনুযায়ী লেখা (বাংলা / English)
String tr(String bn, String en) => Lang.i.bn ? bn : en;

/// yyyy-MM-dd (Backend-এর তারিখ ফরম্যাট)
String ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
