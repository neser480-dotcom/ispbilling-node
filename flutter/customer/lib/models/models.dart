double _d(dynamic v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}') ?? 0;
int _i(dynamic v) => v is num ? v.toInt() : int.tryParse('${v ?? ''}') ?? 0;
String _s(dynamic v) => v == null ? '' : '$v';

class NetStats {
  final String lastLinkLabel, lastLinkUptime, currentUptime;
  final String uploadText, downloadText;
  final bool uptimeAlert;

  const NetStats({
    required this.lastLinkLabel,
    required this.lastLinkUptime,
    required this.currentUptime,
    required this.uploadText,
    required this.downloadText,
    required this.uptimeAlert,
  });

  static String _usage(Map<String, dynamic> j, String text, String gb) {
    final t = _s(j[text]);
    return t.isNotEmpty ? t : '${_d(j[gb]).toStringAsFixed(2)} GB';
  }

  factory NetStats.fromJson(Map<String, dynamic> j) => NetStats(
        // ব্যাকএন্ড চাইলে "Last Logged Out:" ইত্যাদি লেবেল পাঠাতে পারে
        lastLinkLabel: _s(j['last_link_label']).isNotEmpty
            ? _s(j['last_link_label'])
            : 'Last Link Uptime:',
        lastLinkUptime: _s(j['last_link_uptime']),
        currentUptime: _s(j['current_uptime']),
        uploadText: _usage(j, 'upload', 'upload_gb'),
        downloadText: _usage(j, 'download', 'download_gb'),
        uptimeAlert: j['uptime_alert'] == true || j['uptime_alert'] == 1,
      );
}

class DashboardData {
  final String ispName, userName, status, lastPaymentDate;
  final double monthlyBill, balance, due;
  final int deadlineDay;
  final NetStats stats;

  const DashboardData({
    required this.ispName,
    required this.userName,
    required this.status,
    required this.lastPaymentDate,
    required this.monthlyBill,
    required this.balance,
    required this.due,
    required this.deadlineDay,
    required this.stats,
  });

  factory DashboardData.fromJson(Map<String, dynamic> j) => DashboardData(
        ispName: _s(j['isp_name']),
        userName: _s(j['name']),
        status: _s(j['status']).toUpperCase(),
        lastPaymentDate: _s(j['last_payment_date']),
        monthlyBill: _d(j['monthly_bill']),
        balance: _d(j['balance']),
        due: _d(j['due']),
        deadlineDay: _i(j['deadline_day']),
        stats: NetStats.fromJson(Map<String, dynamic>.from(j['stats'] ?? {})),
      );
}

class PackageItem {
  final int id;
  final String name;
  final double price;
  final bool active;

  const PackageItem({
    required this.id,
    required this.name,
    required this.price,
    required this.active,
  });

  factory PackageItem.fromJson(Map<String, dynamic> j) => PackageItem(
        id: _i(j['id']),
        name: _s(j['name']),
        price: _d(j['price']),
        active: j['active'] == true || j['active'] == 1,
      );
}

class ReportItem {
  final String month, status;
  final double amount;

  const ReportItem({
    required this.month,
    required this.status,
    required this.amount,
  });

  factory ReportItem.fromJson(Map<String, dynamic> j) => ReportItem(
        month: _s(j['month']),
        status: _s(j['status']),
        amount: _d(j['amount']),
      );
}

class SupportContact {
  final String name, phone, startTime, endTime, photo;

  const SupportContact({
    required this.name,
    required this.phone,
    required this.startTime,
    required this.endTime,
    required this.photo,
  });

  factory SupportContact.fromJson(Map<String, dynamic> j) => SupportContact(
        name: _s(j['name']),
        phone: _s(j['phone']),
        startTime: _s(j['start_time']),
        endTime: _s(j['end_time']),
        photo: _s(j['photo']),
      );
}

class TicketItem {
  final int id;
  final String subject, status, date;

  const TicketItem({
    required this.id,
    required this.subject,
    required this.status,
    required this.date,
  });

  factory TicketItem.fromJson(Map<String, dynamic> j) => TicketItem(
        id: _i(j['id']),
        subject: _s(j['subject']),
        status: _s(j['status']),
        date: _s(j['date']),
      );
}

class ProfileData {
  final String id, name, mobile, packageName, status, paymentStatus, address;
  final String billingDate, promiseDate, connectionDate, createDate, photo;
  final double monthlyFee, balance;

  const ProfileData({
    required this.id,
    required this.name,
    required this.mobile,
    required this.packageName,
    required this.status,
    required this.paymentStatus,
    required this.address,
    required this.billingDate,
    required this.promiseDate,
    required this.connectionDate,
    required this.createDate,
    required this.photo,
    required this.monthlyFee,
    required this.balance,
  });

  factory ProfileData.fromJson(Map<String, dynamic> j) => ProfileData(
        id: _s(j['id']),
        name: _s(j['name']),
        mobile: _s(j['mobile']),
        packageName: _s(j['package']),
        status: _s(j['status']).toUpperCase(),
        paymentStatus: _s(j['payment_status']).toUpperCase(),
        address: _s(j['address']),
        billingDate: _s(j['billing_date']),
        promiseDate: _s(j['promise_date']),
        connectionDate: _s(j['connection_date']),
        createDate: _s(j['create_date']),
        photo: _s(j['photo']),
        monthlyFee: _d(j['monthly_fee']),
        balance: _d(j['balance']),
      );
}

/// অনলাইন পেমেন্টের একটি গেটওয়ে (bkash, nagad, sslcommerz, shurjopay, rocket, dbbl)
class PayGateway {
  final String key, label;
  const PayGateway({required this.key, required this.label});

  factory PayGateway.fromJson(Map<String, dynamic> j) =>
      PayGateway(key: _s(j['key']), label: _s(j['label']));
}

class PayOptions {
  final List<PayGateway> gateways;
  final double amount, due, monthlyBill;

  const PayOptions({
    required this.gateways,
    required this.amount,
    required this.due,
    required this.monthlyBill,
  });

  factory PayOptions.fromJson(Map<String, dynamic> j) => PayOptions(
        gateways: (j['gateways'] is List ? j['gateways'] as List : const [])
            .map((e) => PayGateway.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
        amount: _d(j['amount']),
        due: _d(j['due']),
        monthlyBill: _d(j['monthly_bill']),
      );
}

class PayStart {
  final String transactionId, redirectUrl;
  final double amount;

  const PayStart({
    required this.transactionId,
    required this.redirectUrl,
    required this.amount,
  });

  factory PayStart.fromJson(Map<String, dynamic> j) => PayStart(
        transactionId: _s(j['transaction_id']),
        redirectUrl: _s(j['redirect_url']),
        amount: _d(j['amount']),
      );
}

class PayStatus {
  final String status;
  final bool paid, isFinal;

  const PayStatus({
    required this.status,
    required this.paid,
    required this.isFinal,
  });

  factory PayStatus.fromJson(Map<String, dynamic> j) => PayStatus(
        status: _s(j['status']),
        paid: j['paid'] == true,
        isFinal: j['final'] == true,
      );
}
